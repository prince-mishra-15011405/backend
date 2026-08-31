/**
 * Currency Parsing Utility for Indian Rupee formats
 */

/**
 * Parses Indian currency strings into clean numbers.
 * Handles formats like:
 *  - "₹6,412" -> 6412
 *  - "₹12,500" -> 12500
 *  - "₹1,05,000" -> 105000
 *  - "6412" -> 6412
 *  - 6412 -> 6412
 * 
 * @param {string|number} rawValue 
 * @returns {number|null} Parsed numeric amount or null if invalid
 */
function parseIndianCurrency(rawValue) {
  if (rawValue === null || rawValue === undefined) {
    return null;
  }

  if (typeof rawValue === "number") {
    return Number.isFinite(rawValue) && rawValue > 0 ? Math.round(rawValue) : null;
  }

  let str = String(rawValue).trim();
  if (!str) return null;

  // Remove currency symbols (₹, INR, Rs, etc.) and commas, preserving the decimal point
  str = str.replace(/INR|Rs\.?|₹/gi, "").replace(/,/g, "").trim();
  const num = parseFloat(str);

  if (Number.isNaN(num) || !Number.isFinite(num) || num <= 0) {
    return null;
  }

  return Math.round(num);
}

module.exports = {
  parseIndianCurrency
};
