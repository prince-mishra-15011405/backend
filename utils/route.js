/**
 * Canonical Route Identifier Generator
 * Matches lib/engine.js canonical route standard.
 */

const engine = require("../lib/engine");

/**
 * Creates an uppercase, sorted, directionless canonical route ID.
 * @param {string} origin 
 * @param {string} destination 
 * @returns {string|null} Canonical route ID (e.g. "BOM-DEL") or null if invalid
 */
function createRouteId(origin, destination) {
  return engine.createRouteId(origin, destination);
}

module.exports = {
  createRouteId
};
