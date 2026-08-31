/**
 * Configuration for India Airfare Price Index Calculation Engine
 */

const path = require("path");

const CONFIG = {
  // Configurable base period for historical reference fare calculation
  basePeriod: {
    start: "2026-01-01",
    end: "2026-01-31"
  },

  // Basket size: number of top passenger volume routes to consider (e.g., 10, 20, 30, 50, or null for all valid routes)
  basketSize: 30,

  // Default file system paths (relative to project root)
  paths: {
    faresDir: path.join(__dirname, "data", "fares"),
    historicalFares: path.join(__dirname, "data", "historical", "fares.json"),
    dgcaCity: path.join(__dirname, "data", "dgca", "city.json"),
    airportMap: path.join(__dirname, "data", "airport-map.json"),
    citycodes: path.join(__dirname, "data", "citycode.js"),
    outputFile: path.join(__dirname, "output", "airfare-index.json")
  }
};

module.exports = CONFIG;
