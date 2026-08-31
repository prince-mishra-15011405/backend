/**
 * Unified Scraper Service
 * Shared by scheduled Cron runs and on-demand user search requests.
 * Manages API/Puppeteer execution, observation persistence, and in-flight deduplication.
 */

const { isDbConnected } = require("../config/database");
const ScrapeJob = require("../models/ScrapeJob");
const FareObservation = require("../models/FareObservation");
const HistoricalFare = require("../models/HistoricalFare");
const RouteFareSearch = require("../models/RouteFareSearch");
const airIndiaScraper = require("../scrapers/airindia.scraper");
const spicejetScraper = require("../scrapers/spicejet.scraper");
const makemytripScraper = require("../scrapers/makemytrip.scraper");
const agodaScraper = require("../scrapers/agoda.scraper");
const irctcScraper = require("../scrapers/irctc.scraper");
const { createRouteId } = require("../utils/route");
const dataService = require("./data.service");
const { getAllDefaultJobs } = require("../scrapers/config/default-routes");
const { isDomesticIndianRoute } = require("../data/citycode");
const engine = require("../lib/engine");
const config = require("../config");

// Registry of available scrapers keyed by normalized source name
const SCRAPERS = {
  "air india": airIndiaScraper,
  "airindia": airIndiaScraper,
  "spicejet": spicejetScraper,
  "spice jet": spicejetScraper,
  "sg": spicejetScraper,
  "makemytrip": makemytripScraper,
  "make my trip": makemytripScraper,
  "mmt": makemytripScraper,
  "agoda": agodaScraper,
  "irctc": irctcScraper,
  "irctc air": irctcScraper,
  "irctc_air": irctcScraper
};

class ScraperService {
  constructor() {
    this.inFlightMap = new Map(); // Key: route + date + source -> Promise
    this.status = {
      running: false,
      currentJob: null,
      lastStartedAt: null,
      lastCompletedAt: null,
      lastSuccessAt: null,
      lastErrorAt: null,
      observationsCollected: 0,
      observationsSaved: 0,
      lastChange24h: 0.0,
      lastChange7d: 0.0
    };
  }

  /**
   * Returns active scraper status.
   */
  getStatus() {
    return {
      ...this.status,
      activeInFlightScrapes: this.inFlightMap.size
    };
  }

  /**
   * Retrieves all enabled ScrapeJob documents from MongoDB.
   * Falls back to default Air India routes if no jobs are configured.
   */
  async getEnabledScrapeJobs() {
    if (isDbConnected()) {
      const dbJobs = await ScrapeJob.find({ enabled: true }).sort({ priority: 1, createdAt: 1 });
      const indianJobs = dbJobs.filter((job) => isDomesticIndianRoute(job.origin, job.destination));
      if (indianJobs.length > 0) return indianJobs;
    }

    // Fallback: return default Indian domestic routes for configured airlines
    console.log("[SCRAPER] No configured DB jobs found. Using default multi-airline Indian domestic routes.");
    const defaultJobs = getAllDefaultJobs("all");
    return defaultJobs.filter((job) => isDomesticIndianRoute(job.origin, job.destination));
  }

  /**
   * Validates and saves fare observations into MongoDB.
   * Filters out invalid items (non-positive fare, missing route, etc.).
   * @param {Array<Object>} observations 
   * @returns {Promise<Array<Object>>} Inserted documents
   */
  async saveFareObservations(observations) {
    if (!Array.isArray(observations) || observations.length === 0) {
      return [];
    }

    const validObservations = [];
    let invalidCount = 0;

    for (const obs of observations) {
      if (
        obs &&
        obs.totalFare > 0 &&
        obs.origin &&
        obs.destination &&
        obs.route &&
        obs.departureDate &&
        obs.currency
      ) {
        validObservations.push({
          ...obs,
          scrapedAt: obs.scrapedAt || new Date(),
          searchTimestamp: obs.searchTimestamp || new Date()
        });
      } else {
        invalidCount++;
      }
    }

    if (invalidCount > 0) {
      console.warn(`[DB] Filtered out ${invalidCount} invalid fare observations`);
    }

    if (validObservations.length === 0) {
      return [];
    }

    if (!isDbConnected()) {
      console.log(`[DB] (Offline) Processed ${validObservations.length} valid fare observations`);
      this.status.observationsSaved += validObservations.length;
      return validObservations;
    }

    try {
      const inserted = await FareObservation.insertMany(validObservations, { ordered: false });
      console.log(`[DB] ${inserted.length} observations successfully inserted into MongoDB`);
      this.status.observationsSaved += inserted.length;
      return inserted;
    } catch (err) {
      console.error(`[DB] Observation insert notice: ${err.message}`);
      // Return successfully inserted ones if bulk write had partial errors
      return validObservations;
    }
  }

  /**
   * Automatically establishes or updates historical fare records in MongoDB HistoricalFare.
   * - If no baseline exists for this route, persists initial median fare as permanent baseline.
   * - Also logs a daily historical observation snapshot to build price history.
   * @param {string} route 
   * @param {Array<Object>} observations 
   * @param {string} source 
   */
  async recordHistoricalFare(route, observations, source = "Air India") {
    if (!isDbConnected() || !route || !Array.isArray(observations) || observations.length === 0) {
      return;
    }

    try {
      const validFares = observations
        .map((o) => Number(o.totalFare || o.fare))
        .filter((f) => !Number.isNaN(f) && Number.isFinite(f) && f > 0);

      if (validFares.length === 0) return;

      const medianFare = engine.getMedian(validFares);
      if (!medianFare || medianFare <= 0) return;

      // 1. Check if an initial baseline exists
      const existingBaseline = await HistoricalFare.findOne({
        route,
        source: { $in: ["Auto-Scraped Baseline", "Historical Base Observation"] }
      });

      if (!existingBaseline) {
        const baseDate = new Date(config.basePeriod?.start || "2026-01-01");
        await HistoricalFare.create({
          route,
          fare: medianFare,
          date: baseDate,
          source: "Auto-Scraped Baseline",
          airline: source
        });
        console.log(`[DB] Created initial HistoricalFare baseline for ${route}: ₹${medianFare}`);
      }

      // 2. Record today's daily scrape snapshot in HistoricalFare
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      await HistoricalFare.findOneAndUpdate(
        { route, date: today },
        {
          route,
          fare: medianFare,
          date: today,
          source: "Daily Scrape Snapshot",
          airline: source
        },
        { upsert: true, new: true }
      );
      console.log(`[DB] Updated HistoricalFare observation for ${route}: ₹${medianFare}`);

    } catch (err) {
      console.warn(`[DB] Notice in recordHistoricalFare for ${route}: ${err.message}`);
    }
  }

  /**
   * Selects the correct scraper module for a given source name.
   * Defaults to Air India API scraper.
   * @param {string} source
   * @returns {{ scrape: Function }}
   */
  getScraper(source) {
    const key = String(source).trim().toLowerCase();
    return SCRAPERS[key] || airIndiaScraper;
  }

  /**
   * Executes a single ScrapeJob.
   * @param {Object} job - ScrapeJob document or object
   */
  async runScraper(job) {
    const source = job.source || "Air India";
    const origin = String(job.origin).trim().toUpperCase();
    const destination = String(job.destination).trim().toUpperCase();
    const departureDate = job.departureDate ? new Date(job.departureDate) : new Date();

    // Restrict background/cron scraping exclusively to domestic Indian routes
    if (!isDomesticIndianRoute(origin, destination)) {
      console.warn(`[SCRAPER] Skipping non-Indian route: ${origin} → ${destination}. Background scraper only processes Indian domestic locations.`);
      return [];
    }

    console.log(`[SCRAPER] Executing job: ${source} ${origin} → ${destination}`);

    if (job._id && isDbConnected()) {
      await ScrapeJob.findByIdAndUpdate(job._id, { lastRunAt: new Date() }).catch(() => null);
    }

    try {
      // Route to the correct airline-specific scraper
      const scraper = this.getScraper(source);
      const observations = await scraper.scrape({
        source,
        origin,
        destination,
        departureDate,
        days: job.days || 30
      });

      this.status.observationsCollected += observations.length;

      // Save FareObservation documents to MongoDB
      const saved = await this.saveFareObservations(observations);

      // Persist baseline & snapshot into HistoricalFare collection
      const route = createRouteId(origin, destination);
      let routeChange24h = 0.0;
      let routeChange7d = 0.0;
      let currentMedianFare = null;

      if (isDbConnected() && observations.length > 0 && route) {
        await this.recordHistoricalFare(route, observations, source);

        // Compute 24h & 7d change for this route
        try {
          const validFares = observations
            .map((o) => Number(o.totalFare || o.fare))
            .filter((f) => !Number.isNaN(f) && Number.isFinite(f) && f > 0);
          if (validFares.length > 0) {
            currentMedianFare = engine.getMedian(validFares);

            const now = Date.now();
            const time24h = new Date(now - 20 * 60 * 60 * 1000);
            const time7d = new Date(now - 6 * 24 * 60 * 60 * 1000);

            const record24h = await HistoricalFare.findOne({ route, date: { $lte: time24h } }).sort({ date: -1 }).lean();
            const record7d = await HistoricalFare.findOne({ route, date: { $lte: time7d } }).sort({ date: -1 }).lean();

            if (record24h && record24h.fare > 0) {
              routeChange24h = Number((((currentMedianFare - record24h.fare) / record24h.fare) * 100).toFixed(2));
            }
            if (record7d && record7d.fare > 0) {
              routeChange7d = Number((((currentMedianFare - record7d.fare) / record7d.fare) * 100).toFixed(2));
            }
          }
        } catch (calcErr) {
          console.warn(`[SCRAPER] Notice calculating route changes: ${calcErr.message}`);
        }
      }

      // Also save RouteFareSearch document if the scraper supports it
      if (isDbConnected() && observations.length > 0 && scraper.toRouteFareSearchDocument) {
        try {
          const rfsDoc = scraper.toRouteFareSearchDocument(observations, origin, destination, departureDate);
          await RouteFareSearch.create(rfsDoc);
          console.log(`[DB] RouteFareSearch document saved for ${origin} → ${destination}`);
        } catch (rfsErr) {
          console.warn(`[DB] RouteFareSearch save notice: ${rfsErr.message}`);
        }
      }

      if (job._id && isDbConnected()) {
        await ScrapeJob.findByIdAndUpdate(job._id, {
          lastSuccessAt: new Date(),
          lastError: null,
          lastFare: currentMedianFare,
          lastChange24h: routeChange24h,
          lastChange7d: routeChange7d
        }).catch(() => null);
      }

      this.status.lastSuccessAt = new Date();
      this.status.lastChange24h = routeChange24h;
      this.status.lastChange7d = routeChange7d;

      // Recalculate Master Index in background to update index-wide 24h & 7d snapshots
      if (isDbConnected() && observations.length > 0) {
        dataService.recalculateMasterIndex().catch(() => null);
      }

      return saved;

    } catch (err) {
      console.error(`[SCRAPER] Error in job ${origin} → ${destination}:`, err.message);
      this.status.lastErrorAt = new Date();

      if (job._id && isDbConnected()) {
        await ScrapeJob.findByIdAndUpdate(job._id, {
          lastErrorAt: new Date(),
          lastError: err.message
        }).catch(() => null);
      }

      throw err;
    }
  }

  /**
   * Runs all enabled scrape jobs sequentially (used by Cron or manual trigger).
   */
  async runAllScrapers() {
    this.status.running = true;
    this.status.lastStartedAt = new Date();

    const jobs = await this.getEnabledScrapeJobs();
    console.log(`[SCRAPER] Found ${jobs.length} enabled scrape jobs`);

    const results = [];
    const errors = [];

    try {
      for (const job of jobs) {
        this.status.currentJob = `${job.source} ${job.origin} → ${job.destination}`;
        try {
          const obs = await this.runScraper(job);
          results.push({ job: this.status.currentJob, count: obs.length });
        } catch (jobErr) {
          // Log and continue with next job
          errors.push({ job: this.status.currentJob, error: jobErr.message });
        }
      }

      // If at least one job produced observations, recalculate the master index
      if (results.some((r) => r.count > 0)) {
        console.log(`[INDEX] Recalculating master index after scraping...`);
        await dataService.recalculateMasterIndex();
      }

    } finally {
      this.status.running = false;
      this.status.currentJob = null;
      this.status.lastCompletedAt = new Date();
    }

    return { results, errors };
  }

  /**
   * On-Demand Scrape for a specific route (used by search API).
   * Implements in-flight deduplication so concurrent requests for the same route share a single scrape.
   * 
   * @param {string} source 
   * @param {string} origin 
   * @param {string} destination 
   * @param {Date|string} departureDate 
   * @returns {Promise<Array<Object>>}
   */
  async scrapeRoute(source = "Air India", origin, destination, departureDate = new Date(), days = 30) {
    const cleanOrigin = String(origin).trim().toUpperCase();
    const cleanDest = String(destination).trim().toUpperCase();
    const route = createRouteId(cleanOrigin, cleanDest);
    const dateStr = new Date(departureDate).toISOString().split("T")[0];

    const dedupeKey = `${route}-${dateStr}-${days}-${source.toLowerCase()}`;

    // Deduplication: if an identical scrape is already running, wait for it
    if (this.inFlightMap.has(dedupeKey)) {
      console.log(`[SEARCH] Joining in-flight scrape for ${dedupeKey}`);
      return this.inFlightMap.get(dedupeKey);
    }

    console.log(`[SEARCH] Launching fresh on-demand scrape for ${dedupeKey}`);

    const scrapePromise = (async () => {
      try {
        const job = {
          source,
          origin: cleanOrigin,
          destination: cleanDest,
          departureDate: new Date(departureDate),
          days: parseInt(days || 30, 10)
        };

        const observations = await this.runScraper(job);

        // Recalculate index if observations were saved
        if (observations.length > 0) {
          await dataService.recalculateMasterIndex();
        }

        return observations;
      } finally {
        this.inFlightMap.delete(dedupeKey);
      }
    })();

    this.inFlightMap.set(dedupeKey, scrapePromise);
    return scrapePromise;
  }

  /**
   * On-Demand Multi-Provider Scrape: runs every registered scraper in parallel for the same route.
   * Returns a merged observation array PLUS a per-provider breakdown for price comparison.
   *
   * @param {string} origin
   * @param {string} destination
   * @param {Date|string} departureDate
   * @param {number} days
   * @returns {Promise<{ allObservations: Array, providers: Object }>}
   */
  async scrapeRouteAllProviders(origin, destination, departureDate = new Date(), days = 30) {
    const PROVIDER_LIST = [
      { key: "air india", label: "Air India" },
      { key: "agoda", label: "Agoda" },
      { key: "irctc", label: "IRCTC Air" }
    ];

    const tasks = PROVIDER_LIST.map(({ key, label }) => {
      return this.scrapeRoute(label, origin, destination, departureDate, days)
        .then(obs => ({ label, status: "ok", observations: obs || [] }))
        .catch(err => ({ label, status: "error", error: err.message, observations: [] }));
    });

    const settled = await Promise.all(tasks);

    // Merge into a single flat observation list and a per-provider summary
    const allObservations = [];
    const providers = {};

    for (const result of settled) {
      allObservations.push(...result.observations);

      const fares = result.observations
        .map(o => Number(o.totalFare || o.fare))
        .filter(f => !Number.isNaN(f) && Number.isFinite(f) && f > 0)
        .sort((a, b) => a - b);

      providers[result.label] = {
        status: result.status,
        error: result.error || null,
        observationsCount: result.observations.length,
        minFare: fares.length > 0 ? fares[0] : null,
        maxFare: fares.length > 0 ? fares[fares.length - 1] : null,
        medianFare: fares.length > 0 ? fares[Math.floor(fares.length / 2)] : null,
        meanFare: fares.length > 0 ? Number((fares.reduce((a, b) => a + b, 0) / fares.length).toFixed(2)) : null,
        observations: result.observations
      };
    }

    console.log(
      `[SEARCH] Multi-provider scrape complete: ${allObservations.length} total observations ` +
      `(${Object.entries(providers).map(([k, v]) => `${k}: ${v.observationsCount}`).join(", ")})`
    );

    return { allObservations, providers };
  }
}

module.exports = new ScraperService();
