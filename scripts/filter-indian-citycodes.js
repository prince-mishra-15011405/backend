/**
 * Script to filter data/citycode.js to contain ONLY Indian locations
 */

const fs = require("fs");
const path = require("path");

const citycodePath = path.join(__dirname, "..", "data", "citycode.js");

// Require existing citycodes
delete require.cache[require.resolve(citycodePath)];
const allCitycodes = require(citycodePath);

console.log(`[FILTER] Total original citycodes: ${allCitycodes.length}`);

// Filter for Indian locations only
const indianCitycodes = allCitycodes.filter(
  (c) => c && (c.countryCode === "IN" || c.countryName === "India")
);

console.log(`[FILTER] Total Indian citycodes found: ${indianCitycodes.length}`);

const fileHeader = `/**
 * Indian Domestic Airports & City Codes Dataset
 * Filtered to include ONLY Indian locations for domestic airfare calculation & scraping.
 */

const citycodes = ${JSON.stringify(indianCitycodes, null, 4)};

// Set of uppercase Indian airport codes for fast O(1) lookup
const INDIAN_AIRPORT_CODES = new Set(citycodes.map((c) => c.airportCode.toUpperCase()));

/**
 * Check if an airport code belongs to an Indian location.
 * @param {string} code 
 * @returns {boolean}
 */
function isIndianAirport(code) {
  if (!code) return false;
  return INDIAN_AIRPORT_CODES.has(String(code).trim().toUpperCase());
}

/**
 * Check if a route is a domestic Indian route (both origin & destination in India).
 * @param {string} origin 
 * @param {string} destination 
 * @returns {boolean}
 */
function isDomesticIndianRoute(origin, destination) {
  return isIndianAirport(origin) && isIndianAirport(destination);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = citycodes;
  module.exports.citycodes = citycodes;
  module.exports.INDIAN_AIRPORT_CODES = INDIAN_AIRPORT_CODES;
  module.exports.isIndianAirport = isIndianAirport;
  module.exports.isDomesticIndianRoute = isDomesticIndianRoute;
}
`;

fs.writeFileSync(citycodePath, fileHeader, "utf-8");
console.log(`[FILTER] Successfully updated ${citycodePath} with ${indianCitycodes.length} Indian locations.`);
