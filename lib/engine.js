/**
 * India Airfare Price Index - Core Calculation Engine
 * 
 * Implements methodology from:
 * "Development of a Real-time Airfare Price Index for India through Automated 
 *  Web Scraping of Airline and OTA Portals for Augmentation of the CPI"
 */

const fs = require("fs");
const path = require("path");

/**
 * 1. Automatically load all .js or .json files from the fares directory.
 * @param {string} faresDir - Absolute or relative path to data/fares/
 * @returns {Array<Object>} Array of loaded fare datasets
 */
function loadFareDatasets(faresDir) {
  if (!fs.existsSync(faresDir)) {
    return [];
  }

  const files = fs.readdirSync(faresDir);
  const datasets = [];

  for (const file of files) {
    const fullPath = path.resolve(faresDir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isFile()) {
      const ext = path.extname(file).toLowerCase();
      if (ext === ".js") {
        // Clear require cache for fresh dynamic loading
        delete require.cache[require.resolve(fullPath)];
        try {
          const content = require(fullPath);
          if (content && typeof content === "object") {
            datasets.push(content);
          }
        } catch (err) {
          console.warn(`[WARN] Failed to load JS fare file: ${file}`, err.message);
        }
      } else if (ext === ".json") {
        try {
          const raw = fs.readFileSync(fullPath, "utf-8");
          const content = JSON.parse(raw);
          if (content && typeof content === "object") {
            datasets.push(content);
          }
        } catch (err) {
          console.warn(`[WARN] Failed to parse JSON fare file: ${file}`, err.message);
        }
      }
    }
  }

  return datasets;
}

/**
 * 2. Load historical fare observations.
 * Automatically canonicalizes route keys (e.g. BOM-BLR -> BLR-BOM) and filters metadata keys.
 * @param {string} historicalFilePath - Path to data/historical/fares.json
 * @returns {Object} Map of canonical route ID to array of { date, fare }
 */
function loadHistoricalData(historicalFilePath) {
  if (!fs.existsSync(historicalFilePath)) {
    return {};
  }
  const raw = fs.readFileSync(historicalFilePath, "utf-8");
  const parsed = JSON.parse(raw);
  const normalized = {};

  for (const [key, observations] of Object.entries(parsed)) {
    if (key.startsWith("_") || !Array.isArray(observations)) {
      continue;
    }
    const parts = key.split("-");
    let canonicalKey = key;
    if (parts.length === 2) {
      const canonical = createRouteId(parts[0], parts[1]);
      if (canonical) {
        canonicalKey = canonical;
      }
    }
    if (!normalized[canonicalKey]) {
      normalized[canonicalKey] = [];
    }
    normalized[canonicalKey].push(...observations);
  }

  return normalized;
}

/**
 * 3. Load DGCA city-pair traffic data.
 * @param {string} dgcaFilePath - Path to data/dgca/city.json
 * @returns {Array<Object>} Array of DGCA records
 */
function loadDGCAData(dgcaFilePath) {
  if (!fs.existsSync(dgcaFilePath)) {
    return [];
  }
  const raw = fs.readFileSync(dgcaFilePath, "utf-8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed.filter((r) => r && !r._comment || Object.keys(r).length > 1) : [];
}

/**
 * 4. Load Airport Code to City mapping.
 * @param {string} airportMapFilePath - Path to data/airport-map.json
 * @returns {Array<Object>} Array of { city, airportCode }
 */
function loadAirportMap(airportMapFilePath) {
  if (!fs.existsSync(airportMapFilePath)) {
    return [];
  }
  const raw = fs.readFileSync(airportMapFilePath, "utf-8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed.filter((entry) => entry && entry.city && entry.airportCode) : [];
}

/**
 * 5. Calculate median of numeric array without mutating original array.
 * Ignores: null, undefined, NaN, 0, negative values.
 * @param {Array<number>} values - Array of numbers
 * @returns {number|null} Median value, or null if array is empty
 */
function getMedian(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  // Filter valid numbers (> 0, finite, not NaN)
  const valid = values
    .map(Number)
    .filter(
      (v) => typeof v === "number" && !Number.isNaN(v) && Number.isFinite(v) && v > 0
    );

  if (valid.length === 0) {
    return null;
  }

  // Pure sort (clone array to avoid mutation)
  const sorted = [...valid].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 !== 0) {
    return sorted[mid];
  } else {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
}

/**
 * 6. Create canonical directionless route ID from two airport codes.
 * Sorts airport codes alphabetically (e.g., BOM + DEL => BOM-DEL; DEL + BOM => BOM-DEL).
 * @param {string} originAirport 
 * @param {string} destAirport 
 * @returns {string|null} Canonical route ID (e.g., "BOM-DEL")
 */
function createRouteId(originAirport, destAirport) {
  if (!originAirport || !destAirport) {
    return null;
  }
  const code1 = String(originAirport).trim().toUpperCase();
  const code2 = String(destAirport).trim().toUpperCase();

  if (!code1 || !code2 || code1 === code2) {
    return null;
  }

  const sorted = [code1, code2].sort();
  return `${sorted[0]}-${sorted[1]}`;
}

/**
 * 7. Extract valid current fare observations grouped by canonical route ID.
 * Ignores: null, undefined, NaN, 0, negative values.
 * @param {Array<Object>} fareDatasets - Array of loaded fare datasets
 * @returns {Object} Map of routeId -> array of numeric fares and raw observations
 */
function extractFareObservations(fareDatasets) {
  const routeObservations = {};

  if (!Array.isArray(fareDatasets)) {
    return routeObservations;
  }

  for (const dataset of fareDatasets) {
    if (!dataset || typeof dataset !== "object") continue;

    const originCode = dataset.origin && dataset.origin.airportCode;
    const destCode = dataset.destination && dataset.destination.airportCode;

    const routeId = createRouteId(originCode, destCode);
    if (!routeId) continue;

    if (!routeObservations[routeId]) {
      routeObservations[routeId] = {
        fares: [],
        details: []
      };
    }

    const faresList = Array.isArray(dataset.fares) ? dataset.fares : [];

    for (const item of faresList) {
      if (!item) continue;

      let rawTotal = null;
      if (item.totalPrice && item.totalPrice.total !== undefined) {
        rawTotal = item.totalPrice.total;
      } else if (item.fare !== undefined) {
        rawTotal = item.fare;
      } else if (item.price !== undefined) {
        rawTotal = item.price;
      }

      if (rawTotal === null || rawTotal === undefined) continue;

      const numericTotal = Number(rawTotal);

      // Validation: ignore NaN, <= 0, infinite
      if (Number.isNaN(numericTotal) || !Number.isFinite(numericTotal) || numericTotal <= 0) {
        continue;
      }

      routeObservations[routeId].fares.push(numericTotal);
      routeObservations[routeId].details.push({
        source: dataset.source || "Unknown",
        origin: originCode,
        destination: destCode,
        departureDate: item.departureDate || null,
        returnDate: item.returnDate || null,
        fare: numericTotal
      });
    }
  }

  return routeObservations;
}

/**
 * 8. Automatically detect the latest valid reference year from DGCA data.
 * @param {Array<Object>} dgcaRecords - Array of DGCA records
 * @returns {number|null} Latest reference year (e.g., 2025)
 */
function getLatestReferenceYear(dgcaRecords) {
  if (!Array.isArray(dgcaRecords) || dgcaRecords.length === 0) {
    return null;
  }

  const years = [];
  for (const r of dgcaRecords) {
    if (r && r.Year !== undefined && r.Year !== null) {
      const y = parseInt(String(r.Year).trim(), 10);
      if (!Number.isNaN(y) && y > 1900 && y < 2100) {
        years.push(y);
      }
    }
  }

  if (years.length === 0) {
    return null;
  }

  return Math.max(...years);
}

/**
 * Helper: Build City-to-Airport-Code lookup dictionary from airport-map.
 * @param {Array<Object>} airportMap - Array of { city, airportCode }
 * @returns {Object} Map of normalized uppercase city name -> uppercase airport code
 */
function buildCityAirportLookup(airportMap) {
  const lookup = {};
  if (!Array.isArray(airportMap)) return lookup;

  for (const entry of airportMap) {
    if (entry && entry.city && entry.airportCode) {
      const normalizedCity = String(entry.city).trim().toUpperCase();
      const code = String(entry.airportCode).trim().toUpperCase();
      lookup[normalizedCity] = code;
    }
  }
  return lookup;
}

/**
 * 9. Aggregate route passenger volume for the selected reference year.
 * Aggregates all monthly observations (PaxToCity2 + PaxFromCity2) per canonical route.
 * @param {Array<Object>} dgcaRecords 
 * @param {Array<Object>|Object} airportMap - Array of mappings or lookup object
 * @param {number} referenceYear 
 * @returns {Object} Map of canonical routeId -> aggregated passenger volume number
 */
function aggregateRoutePassengerVolume(dgcaRecords, airportMap, referenceYear) {
  const volumes = {};
  if (!Array.isArray(dgcaRecords) || !referenceYear) {
    return volumes;
  }

  const lookup = Array.isArray(airportMap)
    ? buildCityAirportLookup(airportMap)
    : airportMap;

  for (const record of dgcaRecords) {
    if (!record) continue;

    const recordYear = parseInt(String(record.Year).trim(), 10);
    if (recordYear !== referenceYear) continue;

    const city1 = record.City1 ? String(record.City1).trim().toUpperCase() : null;
    const city2 = record.City2 ? String(record.City2).trim().toUpperCase() : null;

    if (!city1 || !city2) continue;

    const airport1 = lookup[city1];
    const airport2 = lookup[city2];

    if (!airport1 || !airport2) {
      // Unmapped city pair
      continue;
    }

    const routeId = createRouteId(airport1, airport2);
    if (!routeId) continue;

    const paxTo = Number(record.PaxToCity2) || 0;
    const paxFrom = Number(record.PaxFromCity2) || 0;
    const recordVolume = paxTo + paxFrom;

    if (recordVolume < 0 || Number.isNaN(recordVolume)) continue;

    volumes[routeId] = (volumes[routeId] || 0) + recordVolume;
  }

  return volumes;
}

/**
 * 10. Calculate route weights and select basket.
 * Selects top N routes by passenger volume, then re-normalizes weights to sum to 1.0.
 * @param {Object} routeVolumes - Map of routeId -> passenger volume
 * @param {number|null} basketSize - Number of top routes to include (or null for all)
 * @returns {Array<Object>} Array of { route, passengerVolume, weight }
 */
function calculateRouteWeights(routeVolumes, basketSize = null) {
  if (!routeVolumes || typeof routeVolumes !== "object") {
    return [];
  }

  // Convert to array of { route, passengerVolume }
  const routeEntries = Object.entries(routeVolumes)
    .map(([route, passengerVolume]) => ({
      route,
      passengerVolume: Number(passengerVolume) || 0
    }))
    .filter((entry) => entry.passengerVolume > 0);

  // Sort descending by passenger volume
  routeEntries.sort((a, b) => b.passengerVolume - a.passengerVolume);

  // Slice for basket
  let selectedRoutes = routeEntries;
  if (typeof basketSize === "number" && basketSize > 0) {
    selectedRoutes = routeEntries.slice(0, basketSize);
  }

  const totalBasketVolume = selectedRoutes.reduce(
    (sum, r) => sum + r.passengerVolume,
    0
  );

  if (totalBasketVolume === 0) {
    return selectedRoutes.map((r) => ({
      ...r,
      weight: 0
    }));
  }

  // Re-normalize weights so sum(weights) = 1.0
  return selectedRoutes.map((r) => ({
    route: r.route,
    passengerVolume: r.passengerVolume,
    weight: r.passengerVolume / totalBasketVolume
  }));
}

/**
 * 11. Calculate base representative fare for a route within the configured base period.
 * Filters historical observations by date range and computes median.
 * @param {Array<Object>} historicalFaresForRoute - Array of { date, fare }
 * @param {Object} basePeriod - { start: "YYYY-MM-DD", end: "YYYY-MM-DD" }
 * @returns {number|null} Base median fare or null
 */
function getBaseRepresentativeFare(historicalFaresForRoute, basePeriod) {
  if (!Array.isArray(historicalFaresForRoute) || historicalFaresForRoute.length === 0) {
    return null;
  }

  const startDate = basePeriod && basePeriod.start ? new Date(basePeriod.start) : null;
  const endDate = basePeriod && basePeriod.end ? new Date(basePeriod.end) : null;

  const validFares = [];

  for (const item of historicalFaresForRoute) {
    if (!item) continue;
    const fare = Number(item.fare !== undefined ? item.fare : item.price);

    if (Number.isNaN(fare) || !Number.isFinite(fare) || fare <= 0) {
      continue;
    }

    if (item.date) {
      const obsDate = new Date(item.date);
      if (startDate && obsDate < startDate) continue;
      if (endDate && obsDate > endDate) continue;
    }

    validFares.push(fare);
  }

  return getMedian(validFares);
}

/**
 * 12. Calculate current representative fare for a route using median.
 * @param {Array<number>|Object} currentFareObservationsForRoute - Array of fares or object with .fares array
 * @returns {number|null} Current median fare or null
 */
function getCurrentRepresentativeFare(currentFareObservationsForRoute) {
  let fares = [];
  if (Array.isArray(currentFareObservationsForRoute)) {
    fares = currentFareObservationsForRoute;
  } else if (
    currentFareObservationsForRoute &&
    Array.isArray(currentFareObservationsForRoute.fares)
  ) {
    fares = currentFareObservationsForRoute.fares;
  }

  const valid = fares
    .map(Number)
    .filter((v) => !Number.isNaN(v) && Number.isFinite(v) && v > 0);

  return getMedian(valid);
}

/**
 * 13. Calculate route airfare index.
 * Route Index = (Current Representative Fare / Base Representative Fare) * 100
 * @param {number} currentFare 
 * @param {number} baseFare 
 * @returns {number|null} Route index
 */
function calculateRouteIndex(currentFare, baseFare) {
  if (!currentFare || !baseFare || baseFare <= 0 || currentFare <= 0) {
    return null;
  }
  return (currentFare / baseFare) * 100;
}

/**
 * 14. Calculate overall India Airfare Index.
 * India Airfare Index = Σ(Route Index × Route Weight)
 * @param {Array<Object>} routes - Array of { index, weight }
 * @returns {number} Weighted index
 */
function calculateIndiaAirfareIndex(routes) {
  if (!Array.isArray(routes) || routes.length === 0) {
    return 0;
  }

  return routes.reduce((sum, item) => {
    const idx = Number(item.index) || 0;
    const wt = Number(item.weight) || 0;
    return sum + idx * wt;
  }, 0);
}

/**
 * 15. Validate route data availability across current fares, historical fares, and DGCA traffic.
 * @param {string} route 
 * @param {Object} currentFaresMap 
 * @param {Object} historicalFaresMap 
 * @param {Object} dgcaVolumesMap 
 * @param {Object} basePeriod 
 * @returns {Object} { isValid: boolean, reason?: string, currentFare?: number, baseFare?: number, volume?: number, observations?: number }
 */
function validateRouteData(
  route,
  currentFaresMap,
  historicalFaresMap,
  dgcaVolumesMap,
  basePeriod
) {
  const currentObs = currentFaresMap[route];
  const currentFare = currentObs
    ? getCurrentRepresentativeFare(currentObs)
    : null;

  if (!currentObs || currentFare === null || currentFare <= 0) {
    return {
      isValid: false,
      reason: "Current fare data missing or invalid (no positive observations)"
    };
  }

  const historicalList = historicalFaresMap[route];
  const baseFare = historicalList
    ? getBaseRepresentativeFare(historicalList, basePeriod)
    : null;

  if (!historicalList || baseFare === null || baseFare <= 0) {
    return {
      isValid: false,
      reason: "Historical fare data missing or no observations within base period"
    };
  }

  const volume = dgcaVolumesMap[route];
  if (volume === undefined || volume === null || Number(volume) <= 0) {
    return {
      isValid: false,
      reason: "DGCA passenger traffic data missing or volume is zero"
    };
  }

  return {
    isValid: true,
    currentFare,
    baseFare,
    volume: Number(volume),
    observations: currentObs.fares ? currentObs.fares.length : currentObs.length || 0
  };
}

/**
 * 16. Generate and write structured output JSON.
 * @param {Object} result - Result object
 * @param {string} outputFilePath - Destination file path
 * @returns {Object} Written result
 */
function generateOutput(result, outputFilePath) {
  const dir = path.dirname(outputFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputFilePath, JSON.stringify(result, null, 2), "utf-8");
  return result;
}

/**
 * Master Pipeline Runner
 * Executes the entire calculation engine pipeline and returns the complete index result.
 * @param {Object} customConfig - Optional configuration overrides
 * @returns {Object} Complete index results
 */
function computeAirfareIndex(customConfig = {}) {
  const config = {
    basePeriod: {
      start: "2026-01-01",
      end: "2026-01-31"
    },
    basketSize: 30,
    paths: {
      faresDir: path.join(process.cwd(), "data", "fares"),
      historicalFares: path.join(process.cwd(), "data", "historical", "fares.json"),
      dgcaCity: path.join(process.cwd(), "data", "dgca", "city.json"),
      airportMap: path.join(process.cwd(), "data", "airport-map.json"),
      outputFile: path.join(process.cwd(), "output", "airfare-index.json")
    },
    ...customConfig
  };

  // 1. Ingest datasets
  const fareDatasets = loadFareDatasets(config.paths.faresDir);
  const historicalFares = loadHistoricalData(config.paths.historicalFares);
  const dgcaRecords = loadDGCAData(config.paths.dgcaCity);
  const airportMap = loadAirportMap(config.paths.airportMap);

  // 2. Determine latest reference year
  const referenceYear = getLatestReferenceYear(dgcaRecords);

  // 3. Extract current observations & aggregate passenger volumes
  const currentFaresMap = extractFareObservations(fareDatasets);
  const dgcaVolumesMap = aggregateRoutePassengerVolume(
    dgcaRecords,
    airportMap,
    referenceYear
  );

  // 4. Collect all unique routes across all sources
  const allDiscoveredRoutes = new Set([
    ...Object.keys(currentFaresMap),
    ...Object.keys(historicalFares),
    ...Object.keys(dgcaVolumesMap)
  ]);

  const validRoutesData = [];
  const warnings = [];

  for (const route of Array.from(allDiscoveredRoutes).sort()) {
    const validation = validateRouteData(
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

  // 5. Select basket and calculate weights from valid matched routes
  // Map valid routes to { routeId: volume }
  const validVolumesMap = {};
  for (const r of validRoutesData) {
    validVolumesMap[r.route] = r.passengerVolume;
  }

  const weightedBasket = calculateRouteWeights(validVolumesMap, config.basketSize);
  const basketLookup = new Map(weightedBasket.map((w) => [w.route, w.weight]));

  // 6. Build route index entries
  const calculatedRoutes = [];
  for (const item of validRoutesData) {
    if (basketLookup.has(item.route)) {
      const weight = basketLookup.get(item.route);
      const index = calculateRouteIndex(item.currentFare, item.baseFare);
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

  // Sort routes by passenger volume descending for consistent presentation
  calculatedRoutes.sort((a, b) => b.passengerVolume - a.passengerVolume);

  // 7. Calculate overall India Airfare Index
  const indiaAirfareIndex = calculateIndiaAirfareIndex(calculatedRoutes);

  // 8. Construct formatted output
  const result = {
    referenceYear: referenceYear || null,
    basePeriod: {
      start: config.basePeriod.start,
      end: config.basePeriod.end
    },
    basketSize: config.basketSize,
    indiaAirfareIndex: Number(indiaAirfareIndex.toFixed(4)),
    totalRoutesConsidered: calculatedRoutes.length,
    routes: calculatedRoutes,
    warnings,
    calculatedAt: new Date().toISOString()
  };

  // 9. Write to output file
  if (config.paths.outputFile) {
    generateOutput(result, config.paths.outputFile);
  }

  return result;
}

module.exports = {
  loadFareDatasets,
  loadHistoricalData,
  loadDGCAData,
  loadAirportMap,
  getMedian,
  createRouteId,
  extractFareObservations,
  getLatestReferenceYear,
  buildCityAirportLookup,
  aggregateRoutePassengerVolume,
  calculateRouteWeights,
  getBaseRepresentativeFare,
  getCurrentRepresentativeFare,
  calculateRouteIndex,
  calculateIndiaAirfareIndex,
  validateRouteData,
  generateOutput,
  computeAirfareIndex
};
