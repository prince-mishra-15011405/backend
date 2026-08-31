/**
 * Route Controller
 */

const dashboardService = require("../services/dashboard.service");
const { sendSuccess, sendError } = require("../utils/response");

/**
 * GET /api/routes
 * Supports ?limit, ?sort, ?search
 */
function getRoutes(req, res) {
  try {
    const { limit, sort, search } = req.query;
    const data = dashboardService.getRoutes({ limit, sort, search });
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, "ROUTES_FETCH_FAILED", err.message, 500);
  }
}

const FareObservation = require("../../models/FareObservation");
const { isDbConnected } = require("../../config/database");
const engine = require("../../lib/engine");

/**
 * Helper: Build a price comparison summary from a set of observations
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

const citycodes = require("../../data/citycode");
const dataService = require("../../services/data.service");

// City lookup helper
const CODE_TO_CITY = {};
if (Array.isArray(citycodes)) {
  for (const c of citycodes) {
    if (c.airportCode && c.airportCity) {
      CODE_TO_CITY[c.airportCode.toUpperCase()] = c.airportCity;
    }
  }
}

/**
 * GET /api/routes/:route
 * Detailed inspection of a specific route pair with live observations & price comparison.
 */
async function getRouteById(req, res) {
  try {
    const routeId = req.params.route;
    let data = dashboardService.getRouteDetail(routeId);

    const parts = (routeId || "").toUpperCase().split("-");
    const origCode = parts[0] || "";
    const destCode = parts[1] || "";
    const canonical = engine.createRouteId(origCode, destCode) || routeId.toUpperCase();

    // If not found in static master routes, build dynamically from MongoDB
    if (!data) {
      if (isDbConnected()) {
        try {
          const dbObs = await FareObservation.find({
            $or: [{ route: canonical }, { route: routeId.toUpperCase() }]
          })
            .sort({ departureDate: 1, totalFare: 1 })
            .lean();

          if (dbObs.length > 0) {
            const fares = dbObs.map(o => o.totalFare).filter(f => f && f > 0);
            const currentFare = engine.getMedian(fares) || 0;
            const baseResult = await dataService.getBaseFareForRoute(canonical, currentFare);
            const baseFare = baseResult.baseFare || currentFare;
            const routeIndex = baseFare ? Number(((currentFare / baseFare) * 100).toFixed(4)) : 100;

            const origCity = CODE_TO_CITY[origCode] || origCode;
            const destCity = CODE_TO_CITY[destCode] || destCode;

            data = {
              route: canonical,
              origin: {
                code: origCode,
                city: origCity
              },
              destination: {
                code: destCode,
                city: destCity
              },
              currentFare,
              baseFare,
              routeIndex,
              weight: 0,
              contribution: 0,
              passengerVolume: 0,
              observations: dbObs.length,
              change24h: 0,
              change7d: 0,
              fareObservations: dbObs,
              historicalFare: []
            };
          }
        } catch (dbErr) {
          console.warn(`[ROUTE] Error creating dynamic route for ${routeId}: ${dbErr.message}`);
        }
      }
    } else {
      // If MongoDB is connected, fetch all live observations for this route
      if (isDbConnected()) {
        try {
          const dbObs = await FareObservation.find({
            $or: [{ route: data.route }, { route: canonical }]
          })
            .sort({ departureDate: 1, totalFare: 1 })
            .lean();

          if (dbObs.length > 0) {
            data.fareObservations = dbObs;
            data.observations = dbObs.length;

            const fares = dbObs.map(o => o.totalFare).filter(f => f && f > 0);
            if (fares.length > 0) {
              data.currentFare = engine.getMedian(fares);
              if (data.baseFare && data.baseFare > 0) {
                data.routeIndex = Number(((data.currentFare / data.baseFare) * 100).toFixed(4));
              }
            }
          }
        } catch (dbErr) {
          console.warn(`[ROUTE] Notice fetching DB observations for ${routeId}: ${dbErr.message}`);
        }
      }
    }

    if (!data) {
      return sendError(
        res,
        "ROUTE_NOT_FOUND",
        `Route ${routeId} was not found.`,
        404
      );
    }

    // Build price comparison from observations
    data.priceComparison = buildPriceComparisonFromObservations(data.fareObservations);

    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, "ROUTE_FETCH_FAILED", err.message, 500);
  }
}

const HistoricalFare = require("../../models/HistoricalFare");

/**
 * GET /api/routes/:route/history
 * Timestamped fare history for a specific route (combines static master, MongoDB HistoricalFare & FareObservation).
 */
async function getRouteHistory(req, res) {
  try {
    const routeId = req.params.route;
    const period = req.query.period || "30d";

    const parts = (routeId || "").toUpperCase().split("-");
    const canonical = parts.length === 2 ? engine.createRouteId(parts[0], parts[1]) : routeId.toUpperCase();

    let points = [];

    // 1. Check dashboardService for static points
    const history = dashboardService.getRouteHistory(routeId, period);
    if (history && history.available && Array.isArray(history.points) && history.points.length > 0) {
      points = history.points;
    }

    // 2. If no points from static file, query MongoDB HistoricalFare & FareObservation
    if (points.length === 0 && isDbConnected()) {
      try {
        const dateMap = new Map();

        // 2a. Query HistoricalFare
        const histDocs = await HistoricalFare.find({
          $or: [{ route: canonical }, { route: routeId.toUpperCase() }]
        })
          .sort({ date: 1 })
          .lean();

        for (const h of histDocs) {
          if (h.date && h.fare) {
            const dStr = new Date(h.date).toISOString().split("T")[0];
            dateMap.set(dStr, Number(h.fare));
          }
        }

        // 2b. Query FareObservation and compute daily medians
        const obsDocs = await FareObservation.find({
          $or: [{ route: canonical }, { route: routeId.toUpperCase() }]
        })
          .sort({ departureDate: 1 })
          .lean();

        const obsGroupedByDate = {};
        for (const o of obsDocs) {
          if (o.departureDate && o.totalFare) {
            const dStr = new Date(o.departureDate).toISOString().split("T")[0];
            if (!obsGroupedByDate[dStr]) obsGroupedByDate[dStr] = [];
            obsGroupedByDate[dStr].push(Number(o.totalFare));
          }
        }

        for (const [dStr, fares] of Object.entries(obsGroupedByDate)) {
          if (!dateMap.has(dStr) && fares.length > 0) {
            dateMap.set(dStr, engine.getMedian(fares));
          }
        }

        // Sort all unique date points
        const sortedEntries = [...dateMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        const maxPoints = period === "7d" ? 7 : (period === "90d" ? 90 : 30);
        const sliced = sortedEntries.slice(-maxPoints);

        points = sliced.map(([timestamp, fare]) => ({
          timestamp,
          fare: Math.round(fare)
        }));
      } catch (dbErr) {
        console.warn(`[ROUTE] Error fetching MongoDB history for ${routeId}: ${dbErr.message}`);
      }
    }

    if (points.length === 0) {
      return sendError(
        res,
        "ROUTE_HISTORY_NOT_AVAILABLE",
        `Historical fare observations for route ${routeId} are not available.`,
        404
      );
    }

    return sendSuccess(res, {
      route: canonical,
      period,
      points
    });
  } catch (err) {
    return sendError(res, "ROUTE_HISTORY_FAILED", err.message, 500);
  }
}

module.exports = {
  getRoutes,
  getRouteById,
  getRouteHistory
};
