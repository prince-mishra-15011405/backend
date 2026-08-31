const dashboardService = require("../services/dashboard.service");
const scraperService = require("../../services/scraper.service");
const searchSessionService = require("../../services/search-session.service");
const dataService = require("../../services/data.service");
const { sendSuccess, sendError } = require("../utils/response");
const engine = require("../../lib/engine");
const config = require("../../config");
const FareObservation = require("../../models/FareObservation");
const { isDbConnected } = require("../../config/database");

/**
 * Helper: Fetch all fare observations for a given route from MongoDB.
 * Returns the full observation documents (lean), sorted newest-first.
 */
async function fetchAllObservationsForRoute(route) {
  if (!isDbConnected()) return [];
  try {
    const parts = (route || "").split("-");
    const canonical = parts.length === 2 ? engine.createRouteId(parts[0], parts[1]) : route;

    return await FareObservation.find({
      $or: [{ route: canonical }, { route: route.toUpperCase() }]
    })
      .sort({ departureDate: 1, totalFare: 1 })
      .lean();
  } catch (err) {
    console.warn(`[SEARCH] Failed to fetch observations for ${route}: ${err.message}`);
    return [];
  }
}

/**
 * Helper: Build a price comparison summary from a set of observations,
 * grouping them by their `source` field (e.g. "Air India", "Agoda", "IRCTC Air").
 */
function buildPriceComparisonFromObservations(observations) {
  if (!observations || observations.length === 0) return null;

  const bySource = {};
  for (const obs of observations) {
    let src = obs.source || obs.airline || "Unknown";
    if (/irctc/i.test(src)) src = "IRCTC Air";
    else if (/agoda/i.test(src)) src = "Agoda";
    else if (/air\s*india/i.test(src)) src = "Air India";

    if (!bySource[src]) bySource[src] = [];
    const fare = Number(obs.totalFare || obs.fare);
    if (!Number.isNaN(fare) && Number.isFinite(fare) && fare > 0) {
      bySource[src].push(fare);
    }
  }

  const providers = {};
  for (const [src, fares] of Object.entries(bySource)) {
    fares.sort((a, b) => a - b);
    const medianFare = engine.getMedian(fares);
    const meanFare = fares.length > 0 ? Number((fares.reduce((a, b) => a + b, 0) / fares.length).toFixed(2)) : null;

    providers[src] = {
      status: "ok",
      observationsCount: fares.length,
      minFare: fares.length > 0 ? fares[0] : null,
      maxFare: fares.length > 0 ? fares[fares.length - 1] : null,
      medianFare,
      meanFare
    };
  }

  const validEntries = Object.entries(providers)
    .filter(([, v]) => v.minFare !== null)
    .sort(([, a], [, b]) => a.minFare - b.minFare);

  const cheapestEntry = validEntries.length > 0 ? validEntries[0] : null;

  // Calculate spread between cheapest and most expensive
  let spread = null;
  if (validEntries.length >= 2) {
    const cheap = validEntries[0];
    const expensive = validEntries[validEntries.length - 1];
    const diff = expensive[1].minFare - cheap[1].minFare;
    const diffPct = Number(((diff / expensive[1].minFare) * 100).toFixed(1));
    spread = {
      cheapestProvider: cheap[0],
      expensiveProvider: expensive[0],
      differenceInr: diff,
      differencePercent: diffPct
    };
  }

  return {
    providers,
    cheapest: cheapestEntry ? cheapestEntry[0] : null,
    spread,
    comparedAt: new Date().toISOString()
  };
}

/**
 * Core Helper: Process fare observations through the Route Index Engine (lib/engine.js)
 * Computes median representative fare, base fare, route index, weights, and national index contribution.
 */
async function runRouteIndexEngine(canonicalRoute, observations) {
  if (!canonicalRoute) return null;

  // 1. Extract valid fare values
  const fares = (observations || [])
    .map((o) => Number(o.totalFare !== undefined ? o.totalFare : o.fare || o.price))
    .filter((f) => !Number.isNaN(f) && Number.isFinite(f) && f > 0);

  // 2. Compute current representative fare via engine
  const currentFare = engine.getCurrentRepresentativeFare(fares);

  // 3. Load historical fares & DGCA traffic for base calculation
  let historicalFaresMap = {};
  let dgcaVolumesMap = {};
  try {
    historicalFaresMap = await dataService.getHistoricalFares();
    const refYear = await dataService.getLatestReferenceYear();
    dgcaVolumesMap = await dataService.getRouteTraffic(refYear);
  } catch (e) {
    historicalFaresMap = engine.loadHistoricalData(config.paths.historicalFares);
    const dgcaRecords = engine.loadDGCAData(config.paths.dgcaCity);
    dgcaVolumesMap = engine.aggregateRoutePassengerVolume(
      dgcaRecords,
      engine.loadAirportMap(config.paths.airportMap),
      2026
    );
  }

  // 4. Compute base representative fare via dataService from HistoricalFare collection
  const baseResult = await dataService.getBaseFareForRoute(canonicalRoute, currentFare);
  const baseFare = baseResult.baseFare || currentFare;

  // 5. Compute Route Airfare Index via engine: (Current / Base) * 100
  const routeIndex = engine.calculateRouteIndex(currentFare, baseFare);

  // 6. Compute passenger volume & weight via engine
  const volume = dgcaVolumesMap[canonicalRoute] || 0;
  const weightedBasket = engine.calculateRouteWeights(dgcaVolumesMap, config.basketSize);
  const routeWeightObj = weightedBasket.find((w) => w.route === canonicalRoute);
  const weight = routeWeightObj ? routeWeightObj.weight : 0;
  const contribution = routeIndex && weight ? routeIndex * weight : 0;

  // 7. Calculate overall Master Index via engine
  let nationalIndex = null;
  try {
    const masterData = dashboardService.getMasterData();
    nationalIndex = masterData.computedIndex.indiaAirfareIndex;
  } catch (e) {
    nationalIndex = 100;
  }

  // 8. Calculate summary statistics (median, mean, min, max)
  const sorted = [...fares].sort((a, b) => a - b);
  const minFare = sorted.length > 0 ? sorted[0] : null;
  const maxFare = sorted.length > 0 ? sorted[sorted.length - 1] : null;
  const sumFares = sorted.reduce((a, b) => a + b, 0);
  const meanFare = sorted.length > 0 ? Number((sumFares / sorted.length).toFixed(2)) : null;

  return {
    engineStatus: "COMPUTED_VIA_INDEX_ENGINE",
    methodology: "CPI-Augmented Airfare Index (Laspeyres formula with median representative fare)",
    route: canonicalRoute,
    routeIndex: routeIndex ? Number(routeIndex.toFixed(4)) : 100,
    currentRepresentativeFare: currentFare ? Number(currentFare.toFixed(2)) : null,
    baseRepresentativeFare: baseFare ? Number(baseFare.toFixed(2)) : null,
    baseSource: baseResult.baseSource,
    isBaselineEstablished: baseResult.isBaselineEstablished,
    weight: Number(weight.toFixed(6)),
    contribution: Number(contribution.toFixed(4)),
    passengerVolume: volume,
    nationalIndex,
    basePeriod: config.basePeriod,
    fareStats: {
      observationsCount: (observations || []).length,
      validObservationsCount: fares.length,
      medianFare: currentFare ? Number(currentFare.toFixed(2)) : null,
      meanFare,
      minFare,
      maxFare
    }
  };
}

/**
 * GET /api/search?q=...&departureDate=YYYY-MM-DD
 * Instant Database-First lookup with progressive background multi-provider scraping.
 * NEVER makes the client wait; immediately returns existing MongoDB observations + polling sessionId.
 */
async function search(req, res) {
  try {
    const query = req.query.q || req.query.query || "";
    const departureDate = req.query.departureDate || new Date();
    const days = parseInt(req.query.days || 30, 10);
    const forceRescrape = req.query.rescrape === "true" || req.query.refresh === "true";

    // Direct origin / destination parameters support
    const directOrigin = (req.query.origin || "").trim().toUpperCase();
    const directDest = (req.query.destination || "").trim().toUpperCase();

    if (!query && (!directOrigin || !directDest)) {
      return res.status(200).json({
        success: true,
        query: "",
        data: {
          source: "database",
          scraped: false,
          state: "DATABASE_FRESH",
          routeIndexEngine: null,
          results: [],
          observations: []
        }
      });
    }

    let cleanQuery = query ? query.trim() : `${directOrigin}-${directDest}`;
    let detectedSource = req.query.source;

    // Detect provider keywords in query string
    if (/irctc/i.test(cleanQuery)) {
      detectedSource = "IRCTC Air";
      cleanQuery = cleanQuery.replace(/irctc\s*(air)?/gi, "").trim();
    } else if (/agoda/i.test(cleanQuery)) {
      detectedSource = "Agoda";
      cleanQuery = cleanQuery.replace(/agoda/gi, "").trim();
    } else if (/air\s*india|\bai\b/i.test(cleanQuery)) {
      detectedSource = "Air India";
      cleanQuery = cleanQuery.replace(/air\s*india|\bai\b/gi, "").trim();
    } else if (/all|both|multi/i.test(cleanQuery)) {
      detectedSource = "all";
      cleanQuery = cleanQuery.replace(/all|both|multi/gi, "").trim();
    }

    const source = detectedSource || req.query.source || "all";
    console.log(`[SEARCH] Query: "${cleanQuery}" (source: ${source})`);

    // 1. Resolve potential route candidates
    const { codeToCity, cityToCode } = dashboardService.getAirportLookups();
    let routeOrigin = null;
    let routeDest = null;
    let canonicalRoute = null;

    if (directOrigin && directDest) {
      routeOrigin = directOrigin;
      routeDest = directDest;
      canonicalRoute = engine.createRouteId(directOrigin, directDest);
    } else if (cleanQuery.includes("-") || cleanQuery.includes(" ") || cleanQuery.includes("→") || cleanQuery.includes("to")) {
      const parts = cleanQuery
        .replace(/→|to/gi, "-")
        .replace(/\s+/g, "-")
        .split("-")
        .map((s) => s.trim())
        .filter(Boolean);

      if (parts.length === 2) {
        const p1 = parts[0].toUpperCase();
        const p2 = parts[1].toUpperCase();

        const code1 = codeToCity[p1] ? p1 : cityToCode[p1] || (p1.length === 3 && /^[A-Z]{3}$/.test(p1) ? p1 : null);
        const code2 = codeToCity[p2] ? p2 : cityToCode[p2] || (p2.length === 3 && /^[A-Z]{3}$/.test(p2) ? p2 : null);

        if (code1 && code2) {
          routeOrigin = code1;
          routeDest = code2;
          canonicalRoute = engine.createRouteId(code1, code2);
        }
      }
    }

    const maxAgeMinutes = parseInt(process.env.SEARCH_DATA_MAX_AGE_MINUTES, 10) || 60;
    const isSearchScrapeEnabled = process.env.SEARCH_SCRAPE_ENABLED !== "false";

    // 2. Specific route search
    if (canonicalRoute && routeOrigin && routeDest) {
      console.log(`[SEARCH] Checking MongoDB for route: ${canonicalRoute}`);

      // ALWAYS fetch all currently available MongoDB observations
      const dbObs = await fetchAllObservationsForRoute(canonicalRoute);
      const obsStatus = await dataService.getRouteObservationsStatus(canonicalRoute, maxAgeMinutes);
      const searchResults = dashboardService.search(cleanQuery);

      // Process existing observations through engine
      const routeIndexEngine = await runRouteIndexEngine(canonicalRoute, dbObs);
      const priceComparison = buildPriceComparisonFromObservations(dbObs);

      // Check if we should trigger background scraping session
      let session = null;
      const needsScraping = forceRescrape || !obsStatus.isFresh || dbObs.length === 0;

      if (needsScraping && isSearchScrapeEnabled) {
        console.log(`[SEARCH] Starting progressive background scraping session for ${canonicalRoute}...`);
        session = searchSessionService.startScrapeSession({
          origin: routeOrigin,
          destination: routeDest,
          departureDate,
          days,
          source
        });
      }

      return res.status(200).json({
        success: true,
        query: cleanQuery,
        data: {
          source: session ? "background_progressive_scrape" : "database",
          scraped: Boolean(session),
          isScrapingInProgress: session ? session.status === "in_progress" : false,
          sessionId: session ? session.id : null,
          sessionProgress: session ? session.progress : null,
          state: session ? "SCRAPING_IN_PROGRESS" : (obsStatus.isFresh ? "DATABASE_FRESH" : "DATABASE_STALE"),
          route: canonicalRoute,
          observationsCount: dbObs.length,
          latestScrapedAt: obsStatus.latestScrapedAt,
          priceComparison,
          routeIndexEngine,
          results: searchResults,
          observations: dbObs
        }
      });
    }

    // 3. General Search (City, Airport, Airline, or partial matches)
    const results = dashboardService.search(cleanQuery);
    let allObservations = [];
    let routeIndexEngine = null;

    if (isDbConnected() && results && results.length > 0) {
      const matchedRoutes = results
        .map((r) => r.route || r.routeId || null)
        .filter(Boolean);
      const uniqueRoutes = [...new Set(matchedRoutes)];

      if (uniqueRoutes.length > 0) {
        try {
          allObservations = await FareObservation.find({ route: { $in: uniqueRoutes } })
            .sort({ departureDate: 1, totalFare: 1 })
            .lean();

          routeIndexEngine = await runRouteIndexEngine(uniqueRoutes[0], allObservations.filter(o => o.route === uniqueRoutes[0]));
        } catch (err) {
          console.warn(`[SEARCH] Failed to fetch observations for general search: ${err.message}`);
        }
      }
    }

    return res.status(200).json({
      success: true,
      query: cleanQuery,
      data: {
        source: "database",
        scraped: false,
        state: "DATABASE_FRESH",
        observationsCount: allObservations.length,
        routeIndexEngine,
        results,
        observations: allObservations
      }
    });

  } catch (err) {
    return sendError(res, "SEARCH_FAILED", err.message, 500);
  }
}

/**
 * GET /api/search/poll?sessionId=... or ?q=...
 * Progressive polling endpoint returning incremental observations, provider status, and engine calculations.
 */
async function pollSearchSession(req, res) {
  try {
    const sessionId = req.query.sessionId || req.query.id;
    const query = req.query.q || req.query.route || "";

    let session = null;
    if (sessionId) {
      session = searchSessionService.getSession(sessionId);
    }

    if (!session && query) {
      const parts = query.toUpperCase().split("-");
      const canonical = parts.length === 2 ? engine.createRouteId(parts[0], parts[1]) : query.toUpperCase();
      session = searchSessionService.getSessionForRoute(canonical);
    }

    const route = session ? session.route : query.toUpperCase();
    if (!route) {
      return sendError(res, "SESSION_NOT_FOUND", "No active search session or route provided.", 404);
    }

    // Fetch all current observations from MongoDB
    const dbObs = await fetchAllObservationsForRoute(route);
    const routeIndexEngine = await runRouteIndexEngine(route, dbObs);
    const priceComparison = buildPriceComparisonFromObservations(dbObs);

    return res.status(200).json({
      success: true,
      session: session ? {
        id: session.id,
        status: session.status,
        progress: session.progress,
        totalNewObservations: session.totalNewObservations,
        completedProvidersCount: session.completedProvidersCount,
        totalProvidersCount: session.totalProvidersCount,
        isCompleted: session.status === "completed"
      } : { status: "completed", isCompleted: true },
      data: {
        route,
        observationsCount: dbObs.length,
        isScrapingInProgress: session ? session.status === "in_progress" : false,
        priceComparison,
        routeIndexEngine,
        observations: dbObs
      }
    });

  } catch (err) {
    return sendError(res, "POLL_FAILED", err.message, 500);
  }
}

module.exports = {
  search,
  pollSearchSession,
  getSearchSessionStatus: pollSearchSession
};



