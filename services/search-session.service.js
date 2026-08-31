/**
 * Search Session Service — Progressive Multi-Provider Background Scraping & Polling
 * 
 * Allows instant response with currently available MongoDB observations while
 * streaming new provider fares in the background without blocking the UI.
 */

const crypto = require("crypto");
const airIndiaScraper = require("../scrapers/airindia.scraper");
const agodaScraper = require("../scrapers/agoda.scraper");
const irctcScraper = require("../scrapers/irctc.scraper");
const scraperService = require("./scraper.service");
const dataService = require("./data.service");
const { createRouteId } = require("../utils/route");

class SearchSessionService {
  constructor() {
    this.sessions = new Map(); // sessionId -> sessionObject
    this.routeSessions = new Map(); // routeKey -> sessionId
    this.SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
  }

  /**
   * Cleans up expired sessions
   */
  _cleanup() {
    const now = Date.now();
    for (const [id, s] of this.sessions.entries()) {
      if (now - s.startedAt > this.SESSION_TTL_MS) {
        this.sessions.delete(id);
        if (this.routeSessions.get(s.route) === id) {
          this.routeSessions.delete(s.route);
        }
      }
    }
  }

  /**
   * Retrieves an existing session by ID
   * @param {string} sessionId 
   * @returns {Object|null}
   */
  getSession(sessionId) {
    this._cleanup();
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Retrieves the active or most recent session for a route
   * @param {string} route 
   * @returns {Object|null}
   */
  getSessionForRoute(route) {
    this._cleanup();
    const id = this.routeSessions.get(route);
    return id ? this.sessions.get(id) || null : null;
  }

  /**
   * Creates and starts a progressive multi-provider scraping session in the background.
   * Immediately returns the sessionId so the client can begin polling while viewing current DB data.
   * 
   * @param {Object} params - { origin, destination, departureDate, days, source }
   * @returns {Object} Search session metadata
   */
  startScrapeSession({ origin, destination, departureDate, days = 30, source = "all" }) {
    this._cleanup();

    const cleanOrigin = origin.toUpperCase();
    const cleanDest = destination.toUpperCase();
    const route = createRouteId(cleanOrigin, cleanDest);

    // Check if an existing in-progress session already exists for this route
    const existingId = this.routeSessions.get(route);
    if (existingId) {
      const existing = this.sessions.get(existingId);
      if (existing && existing.status === "in_progress" && Date.now() - existing.startedAt < 120000) {
        return existing;
      }
    }

    const sessionId = crypto.randomUUID();
    const isMultiProvider = !source || source === "all" || source === "both" || source === "multi";

    const providersToRun = [];
    if (isMultiProvider) {
      providersToRun.push(
        { key: "agoda", label: "Agoda", scraper: agodaScraper },
        { key: "irctc", label: "IRCTC Air", scraper: irctcScraper },
        { key: "airindia", label: "Air India", scraper: airIndiaScraper }
      );
    } else {
      const sLower = String(source).toLowerCase();
      if (sLower.includes("agoda")) {
        providersToRun.push({ key: "agoda", label: "Agoda", scraper: agodaScraper });
      } else if (sLower.includes("irctc")) {
        providersToRun.push({ key: "irctc", label: "IRCTC Air", scraper: irctcScraper });
      } else {
        providersToRun.push({ key: "airindia", label: "Air India", scraper: airIndiaScraper });
      }
    }

    const progress = {};
    for (const p of providersToRun) {
      progress[p.key] = {
        label: p.label,
        status: "pending",
        observationsCount: 0,
        completedAt: null,
        error: null
      };
    }

    const session = {
      id: sessionId,
      route,
      origin: cleanOrigin,
      destination: cleanDest,
      departureDate: departureDate ? new Date(departureDate).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
      days: parseInt(days || 30, 10),
      source,
      status: "in_progress",
      startedAt: Date.now(),
      updatedAt: Date.now(),
      progress,
      totalNewObservations: 0,
      completedProvidersCount: 0,
      totalProvidersCount: providersToRun.length,
      error: null
    };

    this.sessions.set(sessionId, session);
    this.routeSessions.set(route, sessionId);

    // Launch progressive background scraping (Asynchronous / Non-blocking)
    this._executeSessionScrapers(session, providersToRun);

    return session;
  }

  /**
   * Executes scraping tasks for all providers in the background with progressive updates
   */
  async _executeSessionScrapers(session, providersToRun) {
    const jobConfig = {
      origin: session.origin,
      destination: session.destination,
      departureDate: session.departureDate,
      days: session.days
    };

    const promises = providersToRun.map(async ({ key, label, scraper }) => {
      session.progress[key].status = "scraping";
      session.updatedAt = Date.now();

      try {
        console.log(`[SESSION ${session.id.slice(0, 8)}] Launching ${label} for ${session.route}...`);
        const observations = await scraper.scrape({ ...jobConfig, source: label });

        session.progress[key].status = "completed";
        session.progress[key].observationsCount = observations.length;
        session.progress[key].completedAt = new Date().toISOString();
        session.totalNewObservations += observations.length;
        session.completedProvidersCount++;
        session.updatedAt = Date.now();

        console.log(`[SESSION ${session.id.slice(0, 8)}] ✅ ${label} completed: ${observations.length} fares collected`);

        // Save immediately to MongoDB so the client polling gets the new data in real time
        if (observations.length > 0) {
          await scraperService.saveFareObservations(observations);
          await scraperService.recordHistoricalFare(session.route, observations, label);
        }
      } catch (err) {
        console.warn(`[SESSION ${session.id.slice(0, 8)}] ⚠️ ${label} warning: ${err.message}`);
        session.progress[key].status = "error";
        session.progress[key].error = err.message;
        session.completedProvidersCount++;
        session.updatedAt = Date.now();
      }
    });

    try {
      await Promise.allSettled(promises);
      session.status = "completed";
      session.updatedAt = Date.now();
      console.log(`[SESSION ${session.id.slice(0, 8)}] All providers completed. Total new observations: ${session.totalNewObservations}`);

      // Invalidate dashboard and engine caches once full cycle finishes
      await dataService.recalculateMasterIndex();
    } catch (e) {
      session.status = "completed_with_warnings";
      session.error = e.message;
      session.updatedAt = Date.now();
    }
  }
}

const searchSessionService = new SearchSessionService();
module.exports = searchSessionService;
