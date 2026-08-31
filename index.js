#!/usr/bin/env node

/**
 * India Airfare Price Index - CLI Runner & Master Module
 * 
 * "Development of a Real-time Airfare Price Index for India through Automated 
 *  Web Scraping of Airline and OTA Portals for Augmentation of the CPI"
 */

const path = require("path");
const config = require("./config");
const engine = require("./lib/engine");

function formatCurrency(val) {
  if (val === null || val === undefined) return "N/A";
  return `₹${Math.round(val).toLocaleString("en-IN")}`;
}

function formatPercentage(val) {
  if (val === null || val === undefined) return "0.0%";
  return `${(val * 100).toFixed(1)}%`;
}

function padRight(str, len) {
  str = String(str);
  while (str.length < len) str += " ";
  return str;
}

function padLeft(str, len) {
  str = String(str);
  while (str.length < len) str = " " + str;
  return str;
}

function runCLI() {
  const result = engine.computeAirfareIndex(config);

  console.log("========================================");
  console.log("INDIA AIRFARE PRICE INDEX");
  console.log("========================================\n");

  console.log(`Reference Year:     ${result.referenceYear || "N/A"}`);
  console.log(`Base Period:        ${result.basePeriod.start} → ${result.basePeriod.end}`);
  console.log(`Basket Size Config: ${result.basketSize === null ? "All Valid" : result.basketSize}`);
  console.log(`Routes in Basket:   ${result.totalRoutesConsidered}\n`);

  console.log(`India Airfare Index: ${result.indiaAirfareIndex.toFixed(2)}\n`);

  console.log("Top Routes:");
  console.log("--------------------------------------------------------------------------------");
  console.log(
    `${padRight("Route", 10)} ${padLeft("Current Fare", 14)} ${padLeft("Base Fare", 12)} ${padLeft("Index", 10)} ${padLeft("Weight", 10)} ${padLeft("Contribution", 14)}`
  );
  console.log("--------------------------------------------------------------------------------");

  let totalWeight = 0;
  for (const r of result.routes) {
    totalWeight += r.weight;
    console.log(
      `${padRight(r.route, 10)} ${padLeft(formatCurrency(r.currentFare), 14)} ${padLeft(formatCurrency(r.baseFare), 12)} ${padLeft(r.index.toFixed(1), 10)} ${padLeft(formatPercentage(r.weight), 10)} ${padLeft(r.contribution.toFixed(2), 14)}`
    );
  }

  console.log("--------------------------------------------------------------------------------");
  console.log(`Weight Sum: ${totalWeight.toFixed(4)}\n`);

  if (result.warnings && result.warnings.length > 0) {
    console.log("Validation Warnings (Excluded Routes):");
    console.log("--------------------------------------------------------------------------------");
    for (const w of result.warnings) {
      console.log(` - [${w.route}]: ${w.reason}`);
    }
    console.log("");
  }

  console.log("Output:");
  console.log(path.relative(process.cwd(), config.paths.outputFile));
  console.log("========================================\n");

  return result;
}

// If executed directly via CLI: node index.js
if (require.main === module) {
  runCLI();
}

// Export engine API for programmatic access
module.exports = {
  ...engine,
  runCLI
};
