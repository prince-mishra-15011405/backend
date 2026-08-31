/**
 * Direct Index Recalculation Script
 * Executes the existing calculation engine using MongoDB data and saves an IndexSnapshot.
 */

require("dotenv").config();
const { connectDatabase } = require("../config/database");
const dataService = require("../services/data.service");

async function calculateIndexCLI() {
  await connectDatabase();
  console.log("[INDEX] Calculating India Airfare Index from MongoDB data...");

  const result = await dataService.recalculateMasterIndex();

  console.log("========================================");
  console.log("INDIA AIRFARE PRICE INDEX (MONGODB)");
  console.log("========================================");
  console.log(`India Airfare Index:   ${result.indiaAirfareIndex.toFixed(2)}`);
  console.log(`Reference Year:        ${result.referenceYear}`);
  console.log(`Routes in Basket:      ${result.routeCount}`);
  console.log(`Total Observations:    ${result.observationCount}`);
  console.log(`Calculated At:         ${result.calculatedAt}`);
  console.log("========================================");

  process.exit(0);
}

if (require.main === module) {
  calculateIndexCLI().catch((err) => {
    console.error("[INDEX] Error calculating index:", err.message);
    process.exit(1);
  });
}
