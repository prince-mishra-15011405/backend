/**
 * Dashboard & API Service Layer
 * 
 * Intermediary between Express controllers and the existing calculation engine (lib/engine.js).
 * Manages in-memory caching with TTL and data enrichment (e.g. city names, search ranking).
 * Merges live-scraped observations from MongoDB into the static file pipeline.
 */

const path = require("path");
const fs = require("fs");
const engine = require("../../lib/engine");
const config = require("../../config");
const dataService = require("../../services/data.service");
const { isDbConnected } = require("../../config/database");
const IndexSnapshot = require("../../models/IndexSnapshot");

class DashboardService {
  constructor() {
    this.cache = null;
    this.cacheTimestamp = 0;
    this.cacheTTL = parseInt(process.env.CACHE_TTL_MS, 10) || 60000; // 60 seconds default
  }

  /**
   * Clears the in-memory calculation cache.
   */
  invalidateCache() {
    this.cache = null;
    this.cacheTimestamp = 0;
  }

  /**
   * Helper: Convert city names to title case (e.g., "MUMBAI" -> "Mumbai")
   */
  toTitleCase(str) {
    if (!str) return "";
    return str
      .toLowerCase()
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  /**
   * Loads airport mapping and builds lookup tables.
   */
  getAirportLookups() {
    const airportMap = engine.loadAirportMap(config.paths.airportMap);
    const codeToCity = {};
    const cityToCode = {};

    // 1. Primary airport map
    for (const entry of airportMap) {
      if (entry && entry.city && entry.airportCode) {
        const code = String(entry.airportCode).trim().toUpperCase();
        const city = this.toTitleCase(String(entry.city).trim());
        codeToCity[code] = city;
        cityToCode[city.toUpperCase()] = code;
      }
    }

    // 2. Comprehensive citycode dataset
    try {
      if (fs.existsSync(config.paths.citycodes)) {
        const fullCityCodes = require(config.paths.citycodes);
        if (Array.isArray(fullCityCodes)) {
          for (const item of fullCityCodes) {
            if (item && item.airportCode && item.airportCity) {
              const code = String(item.airportCode).trim().toUpperCase();
              const city = this.toTitleCase(String(item.airportCity).trim());
              if (!codeToCity[code]) {
                codeToCity[code] = city;
              }
              if (!cityToCode[city.toUpperCase()]) {
                cityToCode[city.toUpperCase()] = code;
              }
            }
          }
        }
      }
    } catch (e) {
      // Non-blocking fallback
    }

    return { airportMap, codeToCity, cityToCode };
  }

  /**
   * Retrieves live-scraped fare observations from MongoDB and merges with file-based data.
   * @param {Object} currentFaresMap - Existing file-based observations keyed by route
   * @returns {Object} Merged fare observations map
   */
  async mergeLiveObservations(currentFaresMap) {
    if (!isDbConnected()) return currentFaresMap;

    try {
      const liveObs = await dataService.getCurrentFareObservations();
      const merged = { ...currentFaresMap };

      for (const [route, data] of Object.entries(liveObs)) {
        if (!merged[route]) {
          merged[route] = { fares: [], details: [] };
        }
        // Append live observations (deduplication by fare+date)
        const existingFares = new Set(merged[route].fares.map(f => f));
        for (let i = 0; i < data.fares.length; i++) {
          merged[route].fares.push(data.fares[i]);
          if (data.details[i]) {
            merged[route].details.push(data.details[i]);
          }
        }
      }

      return merged;
    } catch (err) {
      console.warn("[DASHBOARD] Could not merge live observations:", err.message);
      return currentFaresMap;
    }
  }

  /**
   * Retrieves or computes the master index data with caching.
   * Merges live-scraped MongoDB observations into the route pipeline.
   * @param {boolean} forceRefresh - If true, bypasses the cache
   * @returns {Object} Cached or freshly calculated index data
   */
  getMasterData(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && this.cache && now - this.cacheTimestamp < this.cacheTTL) {
      return this.cache;
    }

    // 1. Ingest raw datasets from files
    const fareDatasets = engine.loadFareDatasets(config.paths.faresDir);
    const historicalFares = engine.loadHistoricalData(config.paths.historicalFares);
    const dgcaRecords = engine.loadDGCAData(config.paths.dgcaCity);
    const { airportMap, codeToCity, cityToCode } = this.getAirportLookups();

    // 2. Run core calculation engine (file-based)
    const computedIndex = engine.computeAirfareIndex(config);

    // Load latest IndexSnapshot in background if connected
    if (isDbConnected()) {
      IndexSnapshot.findOne({}).sort({ calculatedAt: -1 }).lean().then((snap) => {
        if (snap) this._latestSnapshot = snap;
      }).catch(() => null);
    }

    // 3. Extract raw fare observations with details from files
    const currentFaresMap = engine.extractFareObservations(fareDatasets);

    // 4. Merge live-scraped MongoDB observations into the fare map (async but cache on resolve)
    this._pendingLiveMerge = this.mergeLiveObservations(currentFaresMap);

    // 5. Calculate total observations count and source breakdown
    let totalFareObservationsCount = 0;
    let validFareObservationsCount = 0;
    let invalidFareObservationsCount = 0;
    const sourcesSet = new Set();

    for (const dataset of fareDatasets) {
      if (dataset.source) sourcesSet.add(dataset.source);
      if (Array.isArray(dataset.fares)) {
        for (const item of dataset.fares) {
          totalFareObservationsCount++;
          const val = Number(
            item.totalPrice ? item.totalPrice.total : item.fare || item.price
          );
          if (!Number.isNaN(val) && Number.isFinite(val) && val > 0) {
            validFareObservationsCount++;
          } else {
            invalidFareObservationsCount++;
          }
        }
      }
    }

    // 6. Determine if data stream is MOCK or LIVE
    let isMock = false;
    if (
      fareDatasets.some((d) => d._comment && d._comment.includes("SYNTHETIC")) ||
      airportMap.some((a) => a._comment && a._comment.includes("SYNTHETIC")) ||
      (Array.isArray(dgcaRecords) && dgcaRecords.some((r) => r._comment && r._comment.includes("SYNTHETIC")))
    ) {
      isMock = true;
    }

    // Also check if any live scraped data exists — if so, mark as mixed
    if (this._liveRoutesCache && Object.keys(this._liveRoutesCache).length > 0) {
      isMock = false; // Live data overrides mock status
    }

    // 7. Enrich calculated routes with city names and display strings
    const enrichedRoutes = (computedIndex.routes || []).map((r) => {
      const parts = r.route.split("-");
      const originCode = parts[0];
      const destCode = parts[1];
      const originCity = codeToCity[originCode] || originCode;
      const destCity = codeToCity[destCode] || destCode;

      // Extract raw observations for this route if available
      const rawObs = currentFaresMap[r.route] ? currentFaresMap[r.route].details : [];
      const historyObs = historicalFares[r.route] || [];

      // Calculate recent movement from latest index snapshot if available
      let change24h = 0.0;
      let change7d = 0.0;
      if (this._latestSnapshot && Array.isArray(this._latestSnapshot.routes)) {
        const snapRoute = this._latestSnapshot.routes.find((sr) => sr.route === r.route);
        if (snapRoute) {
          if (snapRoute.change24h !== undefined && snapRoute.change24h !== null) change24h = snapRoute.change24h;
          if (snapRoute.change7d !== undefined && snapRoute.change7d !== null) change7d = snapRoute.change7d;
        }
      }

      return {
        ...r,
        origin: originCode,
        destination: destCode,
        originCity,
        destCity,
        routeName: `${originCity} (${originCode}) ↔ ${destCity} (${destCode})`,
        change24h,
        change7d,
        rawObservations: rawObs,
        historicalObservations: historyObs
      };
    });

    // 8. Append live-scraped routes that don't exist in file-based engine routes
    if (this._liveRoutesCache) {
      const existingRouteIds = new Set(enrichedRoutes.map(r => r.route));
      for (const [route, data] of Object.entries(this._liveRoutesCache)) {
        if (!existingRouteIds.has(route) && data.fares.length > 0) {
          const parts = route.split("-");
          const originCode = parts[0];
          const destCode = parts[1];
          const originCity = codeToCity[originCode] || originCode;
          const destCity = codeToCity[destCode] || destCode;

          // Calculate current fare as median of scraped fares
          const sortedFares = [...data.fares].sort((a, b) => a - b);
          const mid = Math.floor(sortedFares.length / 2);
          const currentFare = sortedFares.length % 2 !== 0
            ? sortedFares[mid]
            : (sortedFares[mid - 1] + sortedFares[mid]) / 2;

          enrichedRoutes.push({
            route,
            origin: originCode,
            destination: destCode,
            originCity,
            destCity,
            routeName: `${originCity} (${originCode}) ↔ ${destCity} (${destCode})`,
            currentFare: Number(currentFare.toFixed(2)),
            baseFare: Number(currentFare.toFixed(2)), // Use current as base for new routes
            index: 100, // Base index for new routes without historical data
            weight: 0,
            passengerVolume: 0,
            contribution: 0,
            observations: data.fares.length,
            change24h: null,
            change7d: null,
            rawObservations: data.details || [],
            historicalObservations: [],
            isLiveScraped: true
          });

          totalFareObservationsCount += data.fares.length;
          validFareObservationsCount += data.fares.length;

          // Add source to sources set
          for (const d of data.details || []) {
            if (d.source) sourcesSet.add(d.source);
          }
        }
      }
    }

    const masterData = {
      computedIndex,
      enrichedRoutes,
      fareDatasets,
      historicalFares,
      dgcaRecords,
      airportMap,
      codeToCity,
      cityToCode,
      sources: Array.from(sourcesSet),
      stats: {
        totalObservations: totalFareObservationsCount,
        validObservations: validFareObservationsCount,
        invalidObservations: invalidFareObservationsCount,
        activeSources: sourcesSet.size,
        totalSources: Math.max(sourcesSet.size, 1),
        isMock
      },
      calculatedAt: computedIndex.calculatedAt || new Date().toISOString()
    };

    this.cache = masterData;
    this.cacheTimestamp = now;

    // Kick off async live merge in the background (updates cache for next request)
    this._pendingLiveMerge.then((mergedMap) => {
      this._liveRoutesCache = mergedMap;
    }).catch(() => {});

    return masterData;
  }

  /**
   * GET /api/dashboard summary payload
   */
  getDashboardSummary() {
    const data = this.getMasterData();
    const { computedIndex, enrichedRoutes, stats, calculatedAt } = data;

    // Top route movements (sorted by weight/volume)
    const topRoutes = enrichedRoutes.slice(0, 10).map((r) => ({
      route: r.route,
      origin: r.origin,
      destination: r.destination,
      routeName: r.routeName,
      currentFare: r.currentFare,
      baseFare: r.baseFare,
      index: r.index,
      weight: r.weight,
      passengerVolume: r.passengerVolume,
      contribution: r.contribution,
      observations: r.observations,
      change24h: r.change24h,
      change7d: r.change7d
    }));

    const snap = this._latestSnapshot;
    const change24h = snap && snap.change24h !== undefined && snap.change24h !== null ? snap.change24h : 0.0;
    const change7d = snap && snap.change7d !== undefined && snap.change7d !== null ? snap.change7d : 0.0;

    return {
      summary: {
        indiaAirfareIndex: computedIndex.indiaAirfareIndex,
        baseIndex: 100,
        change24h,
        change7d,
        change30d: null,
        routesTracked: enrichedRoutes.length,
        fareObservations: stats.validObservations,
        dataSources: {
          active: stats.activeSources,
          total: stats.totalSources
        },
        lastUpdated: calculatedAt
      },
      trend: [], // Empty when historical index snapshot time-series is not yet tracked
      topRoutes,
      dataStream: {
        status: stats.isMock ? "MOCK" : "LIVE",
        lastCollection: calculatedAt,
        observations: stats.validObservations,
        activeSources: stats.activeSources,
        totalSources: stats.totalSources
      },
      warnings: computedIndex.warnings || []
    };
  }

  /**
   * GET /api/index payload
   */
  getIndexData() {
    const data = this.getMasterData();
    const { computedIndex, calculatedAt } = data;

    return {
      value: computedIndex.indiaAirfareIndex,
      baseValue: 100,
      change24h: null,
      change7d: null,
      change30d: null,
      referenceYear: computedIndex.referenceYear,
      basePeriod: computedIndex.basePeriod,
      calculatedAt
    };
  }

  /**
   * GET /api/routes with query, sorting, and limit
   */
  getRoutes(options = {}) {
    const data = this.getMasterData();
    let routes = [...data.enrichedRoutes];

    // Filter by search query if provided
    if (options.search) {
      const q = String(options.search).trim().toLowerCase();
      routes = routes.filter((r) => {
        return (
          r.route.toLowerCase().includes(q) ||
          r.origin.toLowerCase().includes(q) ||
          r.destination.toLowerCase().includes(q) ||
          r.originCity.toLowerCase().includes(q) ||
          r.destCity.toLowerCase().includes(q) ||
          r.routeName.toLowerCase().includes(q)
        );
      });
    }

    // Sort options
    const sortField = options.sort || "passengerVolume";
    routes.sort((a, b) => {
      if (sortField === "index") return b.index - a.index;
      if (sortField === "currentFare") return b.currentFare - a.currentFare;
      if (sortField === "weight") return b.weight - a.weight;
      if (sortField === "change24h") return (b.change24h || 0) - (a.change24h || 0);
      if (sortField === "change7d") return (b.change7d || 0) - (a.change7d || 0);
      return b.passengerVolume - a.passengerVolume;
    });

    // Limit
    const total = routes.length;
    if (options.limit && !Number.isNaN(parseInt(options.limit, 10))) {
      const limit = parseInt(options.limit, 10);
      if (limit > 0) {
        routes = routes.slice(0, limit);
      }
    }

    // Format fields for frontend consumption
    const formatted = routes.map((r) => ({
      route: r.route,
      origin: r.origin,
      destination: r.destination,
      routeName: r.routeName,
      currentFare: r.currentFare,
      baseFare: r.baseFare,
      index: r.index,
      weight: r.weight,
      passengerVolume: r.passengerVolume,
      contribution: r.contribution,
      observations: r.observations,
      change24h: r.change24h,
      change7d: r.change7d
    }));

    return {
      total,
      routes: formatted
    };
  }

  /**
   * GET /api/routes/:route detail
   */
  getRouteDetail(routeId) {
    if (!routeId) return null;
    const cleanId = String(routeId).trim().toUpperCase();
    const data = this.getMasterData();

    // Check direct route match or canonical match
    let target = data.enrichedRoutes.find((r) => r.route === cleanId);
    if (!target && cleanId.includes("-")) {
      const parts = cleanId.split("-");
      const canonical = engine.createRouteId(parts[0], parts[1]);
      target = data.enrichedRoutes.find((r) => r.route === canonical);
    }

    if (!target) return null;

    return {
      route: target.route,
      origin: {
        code: target.origin,
        city: target.originCity
      },
      destination: {
        code: target.destination,
        city: target.destCity
      },
      currentFare: target.currentFare,
      baseFare: target.baseFare,
      routeIndex: target.index,
      weight: target.weight,
      contribution: target.contribution,
      passengerVolume: target.passengerVolume,
      observations: target.observations,
      change24h: target.change24h,
      change7d: target.change7d,
      fareObservations: target.rawObservations || [],
      historicalFare: target.historicalObservations || []
    };
  }

  /**
   * GET /api/routes/:route/history
   */
  getRouteHistory(routeId, period = "30d") {
    const route = this.getRouteDetail(routeId);
    if (!route) return null;

    // Check if timestamped historical fare data points exist
    const points = [];
    if (Array.isArray(route.historicalFare)) {
      for (const item of route.historicalFare) {
        if (item.date && item.fare) {
          points.push({
            timestamp: item.date,
            fare: Number(item.fare)
          });
        }
      }
    }

    if (points.length === 0) {
      return {
        available: false,
        route: route.route,
        period
      };
    }

    return {
      available: true,
      route: route.route,
      period,
      points
    };
  }

  /**
   * GET /api/search with ranking across routes, airports, cities, and airlines
   */
  search(query) {
    if (!query || typeof query !== "string") {
      return [];
    }

    const q = query.trim().toLowerCase();
    const data = this.getMasterData();
    const { enrichedRoutes, airportMap, sources } = data;
    const results = [];
    const seen = new Set();

    // 1. Exact Route Match (e.g. "BOM-DEL" or "DEL-BOM")
    if (q.includes("-") || q.includes(" ")) {
      const parts = q.replace(" ", "-").split("-").filter(Boolean);
      if (parts.length === 2) {
        const testRoute = engine.createRouteId(parts[0], parts[1]);
        const match = enrichedRoutes.find((r) => r.route === testRoute);
        if (match && !seen.has(`route:${match.route}`)) {
          results.push({
            type: "route",
            route: match.route,
            origin: match.origin,
            destination: match.destination,
            routeName: match.routeName,
            currentFare: match.currentFare,
            index: match.index
          });
          seen.add(`route:${match.route}`);
        }
      }
    }

    // 2. Exact Airport Code Match (e.g. "BOM", "DEL")
    const airportMatch = airportMap.find(
      (a) => a.airportCode && a.airportCode.toLowerCase() === q
    );
    if (airportMatch && !seen.has(`airport:${airportMatch.airportCode}`)) {
      results.push({
        type: "airport",
        code: airportMatch.airportCode,
        city: this.toTitleCase(airportMatch.city)
      });
      seen.add(`airport:${airportMatch.airportCode}`);
    }

    // 3. Exact City Match (e.g. "mumbai", "delhi")
    const cityMatch = airportMap.find(
      (a) => a.city && a.city.toLowerCase() === q
    );
    if (cityMatch && !seen.has(`city:${cityMatch.city}`)) {
      results.push({
        type: "city",
        name: this.toTitleCase(cityMatch.city),
        airportCode: cityMatch.airportCode
      });
      seen.add(`city:${cityMatch.city}`);
    }

    // 4. Exact/Partial Airline Match (e.g. "indigo", "air india")
    for (const src of sources) {
      if (src.toLowerCase().includes(q) && !seen.has(`airline:${src}`)) {
        results.push({
          type: "airline",
          name: src
        });
        seen.add(`airline:${src}`);
      }
    }

    // 5. Partial Route / City / Airport Matches
    for (const r of enrichedRoutes) {
      if (seen.has(`route:${r.route}`)) continue;

      const isMatch =
        r.route.toLowerCase().includes(q) ||
        r.origin.toLowerCase().includes(q) ||
        r.destination.toLowerCase().includes(q) ||
        r.originCity.toLowerCase().includes(q) ||
        r.destCity.toLowerCase().includes(q) ||
        r.routeName.toLowerCase().includes(q);

      if (isMatch) {
        results.push({
          type: "route",
          route: r.route,
          origin: r.origin,
          destination: r.destination,
          routeName: r.routeName,
          currentFare: r.currentFare,
          index: r.index
        });
        seen.add(`route:${r.route}`);
      }
    }

    return results;
  }

  /**
   * GET /api/data/status
   */
  getDataStatus() {
    const data = this.getMasterData();
    const { stats, calculatedAt } = data;

    return {
      status: stats.isMock ? "MOCK" : "LIVE",
      lastCollection: calculatedAt,
      observations: stats.validObservations,
      activeSources: stats.activeSources,
      totalSources: stats.totalSources,
      dataQuality: {
        valid: stats.validObservations,
        invalid: stats.invalidObservations
      }
    };
  }

  /**
   * GET /api/data/quality
   */
  getDataQuality() {
    const data = this.getMasterData();
    const { stats, computedIndex, enrichedRoutes, historicalFares, dgcaRecords, airportMap } = data;

    // Track routes missing components
    const routesMissingHistory = [];
    const routesMissingDGCA = [];
    const activeRouteIds = new Set(enrichedRoutes.map((r) => r.route));

    for (const warning of computedIndex.warnings || []) {
      if (warning.reason && warning.reason.includes("Historical")) {
        routesMissingHistory.push(warning.route);
      }
      if (warning.reason && warning.reason.includes("DGCA")) {
        routesMissingDGCA.push(warning.route);
      }
    }

    return {
      totalFareObservations: stats.totalObservations,
      validFareObservations: stats.validObservations,
      invalidFareObservations: stats.invalidObservations,
      routesTracked: enrichedRoutes.length,
      routesMissingHistoricalData: routesMissingHistory,
      routesMissingDGCAData: routesMissingDGCA,
      unknownAirportMappings: [],
      warnings: computedIndex.warnings || []
    };
  }
}

// Export singleton instance
module.exports = new DashboardService();
