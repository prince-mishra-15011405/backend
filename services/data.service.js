/**
 * MongoDB Data Adapter & Service
 * Provides MongoDB data in the exact structure expected by lib/engine.js.
 */

const engine = require("../lib/engine");
const config = require("../config");
const { isDbConnected } = require("../config/database");

const FareObservation = require("../models/FareObservation");
const HistoricalFare = require("../models/HistoricalFare");
const RouteTraffic = require("../models/RouteTraffic");
const Airport = require("../models/Airport");
const IndexSnapshot = require("../models/IndexSnapshot");

class DataService {
  /**
   * Retrieves current fare observations grouped by canonical route.
   * Returns: { [routeId]: { fares: [number], details: [object] } }
   */
  async getCurrentFareObservations() {
    if (!isDbConnected()) {
      // Fallback to local files
      const datasets = engine.loadFareDatasets(config.paths.faresDir);
      return engine.extractFareObservations(datasets);
    }

    const observations = await FareObservation.find({})
      .sort({ scrapedAt: -1 })
      .lean();

    const routeMap = {};

    for (const obs of observations) {
      const route = obs.route || engine.createRouteId(obs.origin, obs.destination);
      if (!route) continue;

      if (!routeMap[route]) {
        routeMap[route] = {
          fares: [],
          details: []
        };
      }

      if (obs.totalFare && obs.totalFare > 0) {
        routeMap[route].fares.push(obs.totalFare);
        routeMap[route].details.push({
          source: obs.source || obs.airline || "Unknown",
          origin: obs.origin,
          destination: obs.destination,
          departureDate: obs.departureDate,
          returnDate: obs.returnDate,
          fare: obs.totalFare
        });
      }
    }

    return routeMap;
  }

  /**
   * Retrieves historical fare observations grouped by route for base-period calculations.
   * Merges local historical seed data with MongoDB HistoricalFare records.
   * Returns: { [routeId]: [ { date, fare } ] }
   */
  async getHistoricalFares() {
    const localData = engine.loadHistoricalData(config.paths.historicalFares);
    if (!isDbConnected()) {
      return localData;
    }

    const records = await HistoricalFare.find({}).lean();
    const routeMap = { ...localData };

    for (const r of records) {
      const canonicalRoute = r.route ? engine.createRouteId(r.route.split("-")[0], r.route.split("-")[1]) || r.route : null;
      if (!canonicalRoute) continue;

      if (!routeMap[canonicalRoute]) {
        routeMap[canonicalRoute] = [];
      }
      routeMap[canonicalRoute].push({
        date: r.date ? r.date.toISOString().split("T")[0] : null,
        fare: r.fare
      });
    }

    return routeMap;
  }

  /**
   * Retrieves or establishes the baseline fare for a route from HistoricalFare collection.
   * If a route already has base-period observations or an established baseline, returns it.
   * If no baseline exists, automatically establishes currentFare as the route's permanent baseline.
   * @param {string} canonicalRoute
   * @param {number} currentFare
   * @returns {Promise<{ baseFare: number, isBaselineEstablished: boolean, baseSource: string }>}
   */
  async getBaseFareForRoute(canonicalRoute, currentFare) {
    if (!canonicalRoute) {
      return { baseFare: currentFare || 100, isBaselineEstablished: false, baseSource: "Fallback" };
    }

    // 1. Check MongoDB if connected
    if (isDbConnected()) {
      try {
        const records = await HistoricalFare.find({ route: canonicalRoute }).sort({ date: 1 }).lean();

        if (records.length > 0) {
          // Check if any match the configured basePeriod
          const startDate = config.basePeriod?.start ? new Date(config.basePeriod.start) : null;
          const endDate = config.basePeriod?.end ? new Date(config.basePeriod.end) : null;

          const basePeriodFares = records
            .filter((r) => {
              if (!r.date) return false;
              const d = new Date(r.date);
              if (startDate && d < startDate) return false;
              if (endDate && d > endDate) return false;
              return r.fare && r.fare > 0;
            })
            .map((r) => Number(r.fare));

          if (basePeriodFares.length > 0) {
            const baseFare = engine.getMedian(basePeriodFares);
            return { baseFare, isBaselineEstablished: true, baseSource: "MongoDB Historical Base Period" };
          }

          // Check for an established baseline ("Auto-Scraped Baseline" or "Historical Base Observation")
          const autoBaseline = records.find((r) => r.source === "Auto-Scraped Baseline" || r.source === "Historical Base Observation");
          if (autoBaseline && autoBaseline.fare > 0) {
            return { baseFare: autoBaseline.fare, isBaselineEstablished: true, baseSource: "MongoDB Established Baseline" };
          }

          // Otherwise use median of all available historical fares for this route
          const allFares = records.map((r) => Number(r.fare)).filter((f) => f > 0);
          if (allFares.length > 0) {
            return { baseFare: engine.getMedian(allFares), isBaselineEstablished: true, baseSource: "MongoDB Historical Fares" };
          }
        }

        // 2. Check local fallback file data/historical/fares.json
        const localHistorical = engine.loadHistoricalData(config.paths.historicalFares);
        if (localHistorical[canonicalRoute] && localHistorical[canonicalRoute].length > 0) {
          const baseFare = engine.getBaseRepresentativeFare(localHistorical[canonicalRoute], config.basePeriod);
          if (baseFare && baseFare > 0) {
            return { baseFare, isBaselineEstablished: true, baseSource: "Local Historical Base" };
          }
        }

        // 3. If no baseline exists, establish currentFare as the permanent baseline in HistoricalFare
        if (currentFare && currentFare > 0) {
          await HistoricalFare.create({
            route: canonicalRoute,
            fare: Number(currentFare),
            date: new Date(config.basePeriod?.start || "2026-01-01"),
            source: "Auto-Scraped Baseline",
            airline: "Baseline Reference"
          });
          console.log(`[DB] Established new persistent baseline for route ${canonicalRoute}: ₹${currentFare}`);
          return { baseFare: currentFare, isBaselineEstablished: false, baseSource: "Newly Established Baseline" };
        }
      } catch (err) {
        console.warn(`[DB] Notice in getBaseFareForRoute for ${canonicalRoute}: ${err.message}`);
      }
    }

    // Offline fallback
    const localHistorical = engine.loadHistoricalData(config.paths.historicalFares);
    const localBase = localHistorical[canonicalRoute]
      ? engine.getBaseRepresentativeFare(localHistorical[canonicalRoute], config.basePeriod)
      : null;

    return {
      baseFare: localBase || currentFare || 100,
      isBaselineEstablished: Boolean(localBase),
      baseSource: localBase ? "Local Historical Base" : "Current Fare Fallback"
    };
  }

  /**
   * Retrieves latest DGCA reference year from RouteTraffic.
   */
  async getLatestReferenceYear() {
    if (!isDbConnected()) {
      const dgcaRecords = engine.loadDGCAData(config.paths.dgcaCity);
      return engine.getLatestReferenceYear(dgcaRecords);
    }

    const latest = await RouteTraffic.findOne({}).sort({ year: -1 }).select("year").lean();
    if (latest && latest.year) {
      return latest.year;
    }

    const dgcaRecords = engine.loadDGCAData(config.paths.dgcaCity);
    return engine.getLatestReferenceYear(dgcaRecords);
  }

  /**
   * Retrieves aggregated passenger volume per route for the reference year.
   * Returns: { [routeId]: number }
   */
  async getRouteTraffic(referenceYear) {
    if (!isDbConnected()) {
      const dgcaRecords = engine.loadDGCAData(config.paths.dgcaCity);
      const airportMap = engine.loadAirportMap(config.paths.airportMap);
      return engine.aggregateRoutePassengerVolume(dgcaRecords, airportMap, referenceYear);
    }

    const records = await RouteTraffic.find({ year: referenceYear }).lean();
    if (records.length === 0) {
      const dgcaRecords = engine.loadDGCAData(config.paths.dgcaCity);
      const airportMap = engine.loadAirportMap(config.paths.airportMap);
      return engine.aggregateRoutePassengerVolume(dgcaRecords, airportMap, referenceYear);
    }

    const volumes = {};
    for (const r of records) {
      const route = r.route || (r.origin && r.destination ? engine.createRouteId(r.origin, r.destination) : null);
      if (route) {
        volumes[route] = (volumes[route] || 0) + (r.passengerVolume || 0);
      }
    }

    return volumes;
  }

  /**
   * Retrieves airport code to city mapping.
   */
  async getAirportMap() {
    if (!isDbConnected()) {
      return engine.loadAirportMap(config.paths.airportMap);
    }

    const airports = await Airport.find({}).lean();
    if (airports.length === 0) {
      return engine.loadAirportMap(config.paths.airportMap);
    }

    return airports.map((a) => ({
      city: a.city,
      airportCode: a.airportCode
    }));
  }

  /**
   * Checks if fresh fare observations exist in MongoDB for a given route.
   * @param {string} route 
   * @param {number} maxAgeMinutes 
   * @returns {Promise<{ isFresh: boolean, observations: Array, latestScrapedAt: Date|null }>}
   */
  async getRouteObservationsStatus(route, maxAgeMinutes = 60) {
    if (!isDbConnected()) {
      return { isFresh: false, observations: [], latestScrapedAt: null };
    }

    const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
    const observations = await FareObservation.find({ route })
      .sort({ scrapedAt: -1 })
      .lean();

    if (observations.length === 0) {
      return { isFresh: false, observations: [], latestScrapedAt: null };
    }

    const latest = observations[0].scrapedAt || observations[0].createdAt;
    const isFresh = latest && new Date(latest) >= cutoff;

    return {
      isFresh,
      observations,
      latestScrapedAt: latest
    };
  }

  /**
   * Calculates master index using existing calculation engine with MongoDB data.
   */
  async recalculateMasterIndex() {
    const referenceYear = await this.getLatestReferenceYear();
    const currentFaresMap = await this.getCurrentFareObservations();
    const historicalFares = await this.getHistoricalFares();
    const dgcaVolumesMap = await this.getRouteTraffic(referenceYear);

    // Collect all candidate routes
    const allDiscoveredRoutes = new Set([
      ...Object.keys(currentFaresMap),
      ...Object.keys(historicalFares),
      ...Object.keys(dgcaVolumesMap)
    ]);

    const validRoutesData = [];
    const warnings = [];

    for (const route of Array.from(allDiscoveredRoutes).sort()) {
      const validation = engine.validateRouteData(
        route,
        currentFaresMap,
        historicalFares,
        dgcaVolumesMap,
        config.basePeriod
      );

      if (validation.isValid) {
        validRoutesData.push({
          route,
          currentFare: validation.currentFare,
          baseFare: validation.baseFare,
          passengerVolume: validation.volume,
          observations: validation.observations
        });
      } else {
        warnings.push({
          route,
          reason: validation.reason
        });
      }
    }

    // Basket weighting
    const validVolumesMap = {};
    for (const r of validRoutesData) {
      validVolumesMap[r.route] = r.passengerVolume;
    }

    const weightedBasket = engine.calculateRouteWeights(validVolumesMap, config.basketSize);
    const basketLookup = new Map(weightedBasket.map((w) => [w.route, w.weight]));

    const calculatedRoutes = [];
    for (const item of validRoutesData) {
      if (basketLookup.has(item.route)) {
        const weight = basketLookup.get(item.route);
        const index = engine.calculateRouteIndex(item.currentFare, item.baseFare);
        const contribution = index * weight;

        calculatedRoutes.push({
          route: item.route,
          currentFare: Number(item.currentFare.toFixed(2)),
          baseFare: Number(item.baseFare.toFixed(2)),
          index: Number(index.toFixed(4)),
          passengerVolume: item.passengerVolume,
          weight: Number(weight.toFixed(6)),
          contribution: Number(contribution.toFixed(4)),
          observations: item.observations
        });
      }
    }

    calculatedRoutes.sort((a, b) => b.passengerVolume - a.passengerVolume);
    const indiaAirfareIndex = engine.calculateIndiaAirfareIndex(calculatedRoutes);

    // Compute 24-hour and 7-day change deltas
    let change24h = 0.0;
    let change7d = 0.0;

    if (isDbConnected()) {
      try {
        const now = Date.now();
        const target24h = new Date(now - 24 * 60 * 60 * 1000);
        let prior24hSnapshot = await IndexSnapshot.findOne({ calculatedAt: { $lte: target24h } })
          .sort({ calculatedAt: -1 })
          .lean();

        // If no snapshot exists from >24h ago, compare with the previous snapshot
        if (!prior24hSnapshot) {
          prior24hSnapshot = await IndexSnapshot.findOne({})
            .sort({ calculatedAt: -1 })
            .lean();
        }

        const target7d = new Date(now - 7 * 24 * 60 * 60 * 1000);
        const prior7dSnapshot = await IndexSnapshot.findOne({ calculatedAt: { $lte: target7d } })
          .sort({ calculatedAt: -1 })
          .lean();

        if (prior24hSnapshot && prior24hSnapshot.indiaAirfareIndex > 0) {
          change24h = Number((((indiaAirfareIndex - prior24hSnapshot.indiaAirfareIndex) / prior24hSnapshot.indiaAirfareIndex) * 100).toFixed(2));
        }

        if (prior7dSnapshot && prior7dSnapshot.indiaAirfareIndex > 0) {
          change7d = Number((((indiaAirfareIndex - prior7dSnapshot.indiaAirfareIndex) / prior7dSnapshot.indiaAirfareIndex) * 100).toFixed(2));
        }

        // Calculate per-route 24h & 7d change
        const prior24hRouteMap = new Map();
        if (prior24hSnapshot && Array.isArray(prior24hSnapshot.routes)) {
          for (const pr of prior24hSnapshot.routes) {
            if (pr.route && pr.currentFare) prior24hRouteMap.set(pr.route, pr.currentFare);
          }
        }

        const prior7dRouteMap = new Map();
        if (prior7dSnapshot && Array.isArray(prior7dSnapshot.routes)) {
          for (const pr of prior7dSnapshot.routes) {
            if (pr.route && pr.currentFare) prior7dRouteMap.set(pr.route, pr.currentFare);
          }
        }

        for (const cr of calculatedRoutes) {
          const fare24h = prior24hRouteMap.get(cr.route);
          cr.change24h = fare24h && fare24h > 0
            ? Number((((cr.currentFare - fare24h) / fare24h) * 100).toFixed(2))
            : 0.0;

          const fare7d = prior7dRouteMap.get(cr.route);
          cr.change7d = fare7d && fare7d > 0
            ? Number((((cr.currentFare - fare7d) / fare7d) * 100).toFixed(2))
            : 0.0;
        }
      } catch (snapErr) {
        console.warn(`[INDEX] Notice calculating snapshot deltas: ${snapErr.message}`);
      }
    }

    const result = {
      indiaAirfareIndex: Number(indiaAirfareIndex.toFixed(4)),
      baseIndex: 100,
      change24h,
      change7d,
      referenceYear: referenceYear || 2026,
      basePeriodStart: new Date(config.basePeriod.start),
      basePeriodEnd: new Date(config.basePeriod.end),
      basketSize: config.basketSize,
      routeCount: calculatedRoutes.length,
      observationCount: calculatedRoutes.reduce((sum, r) => sum + (r.observations || 0), 0),
      routes: calculatedRoutes,
      warnings,
      calculatedAt: new Date()
    };

    // Save snapshot to MongoDB if connected
    if (isDbConnected() && calculatedRoutes.length > 0) {
      await this.saveIndexSnapshot(result);
    }

    return result;
  }

  /**
   * Persists an IndexSnapshot to MongoDB.
   */
  async saveIndexSnapshot(data) {
    if (!isDbConnected()) return null;
    try {
      const snapshot = new IndexSnapshot(data);
      await snapshot.save();
      console.log(`[INDEX] Snapshot saved successfully at ${data.calculatedAt}`);
      return snapshot;
    } catch (err) {
      console.error("[INDEX] Failed to save snapshot:", err.message);
      return null;
    }
  }

  /**
   * Retrieves the latest IndexSnapshot from MongoDB.
   */
  async getLatestSnapshot() {
    if (!isDbConnected()) return null;
    return IndexSnapshot.findOne({}).sort({ calculatedAt: -1 }).lean();
  }

  /**
   * Retrieves historical index snapshots.
   */
  async getSnapshotHistory(limit = 30) {
    if (!isDbConnected()) return [];
    return IndexSnapshot.find({})
      .sort({ calculatedAt: -1 })
      .limit(limit)
      .lean();
  }

  /**
   * Retrieves MongoDB runtime stats.
   */
  async getDatabaseStats() {
    if (!isDbConnected()) {
      return {
        database: "disconnected",
        totalFareObservations: 0,
        observationsToday: 0,
        routesTracked: 0,
        activeScrapeJobs: 0
      };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalObs, obsToday, distinctRoutes, activeJobs] = await Promise.all([
      FareObservation.countDocuments(),
      FareObservation.countDocuments({ createdAt: { $gte: today } }),
      FareObservation.distinct("route"),
      require("../models/ScrapeJob").countDocuments({ enabled: true }).catch(() => 0)
    ]);

    return {
      database: "connected",
      totalFareObservations: totalObs,
      observationsToday: obsToday,
      routesTracked: distinctRoutes.length,
      activeScrapeJobs: activeJobs
    };
  }
}

module.exports = new DataService();
