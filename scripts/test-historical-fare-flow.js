/**
 * Historical Fare Collection & Route Index Verification Script
 */

require("dotenv").config();
const assert = require("assert");
const { connectDatabase } = require("../config/database");
const HistoricalFare = require("../models/HistoricalFare");
const dataService = require("../services/data.service");
const scraperService = require("../services/scraper.service");

async function testHistoricalFareFlow() {
  await connectDatabase();
  console.log("\n========================================================");
  console.log("TESTING HISTORICAL FARE CHECK & UPDATE WORKFLOW");
  console.log("========================================================");

  const testRoute = "AMD-BOM";

  // Clean up any test records for this route
  await HistoricalFare.deleteMany({ route: testRoute });
  console.log(`1. Cleared test records for route ${testRoute}`);

  // Test 1: Initial Search / Scrape establish baseline
  console.log("\n2. Simulating First Search for new route (BOM ↔ AMD):");
  const initialCurrentFare = 4000;
  const initialBaseResult = await dataService.getBaseFareForRoute(testRoute, initialCurrentFare);
  console.log("   Base Result on First Search:", initialBaseResult);
  assert.strictEqual(initialBaseResult.baseFare, 4000, "Base fare should equal initial current fare");
  assert.strictEqual(initialBaseResult.isBaselineEstablished, false, "Should be marked as newly established");

  // Verify that HistoricalFare now contains this baseline record
  const savedBaseline = await HistoricalFare.findOne({ route: testRoute, source: "Auto-Scraped Baseline" });
  console.log("   Saved Baseline in MongoDB:", {
    route: savedBaseline?.route,
    fare: savedBaseline?.fare,
    source: savedBaseline?.source
  });
  assert(savedBaseline, "Baseline record must exist in HistoricalFare collection");
  assert.strictEqual(savedBaseline.fare, 4000, "Persisted baseline fare must be 4000");

  // Test 2: Second Search with price increase (Fares surged to 4400)
  console.log("\n3. Simulating Second Search after fares changed (₹4,400):");
  const newCurrentFare = 4400;
  const secondBaseResult = await dataService.getBaseFareForRoute(testRoute, newCurrentFare);
  console.log("   Base Result on Second Search:", secondBaseResult);
  assert.strictEqual(secondBaseResult.baseFare, 4000, "Base fare must remain 4000 from established baseline");
  assert.strictEqual(secondBaseResult.isBaselineEstablished, true, "isBaselineEstablished should be true");

  const calculatedIndex = Number(((newCurrentFare / secondBaseResult.baseFare) * 100).toFixed(2));
  console.log(`   Route Index on Second Search: (${newCurrentFare} / ${secondBaseResult.baseFare}) * 100 = ${calculatedIndex.toFixed(2)}`);
  assert.strictEqual(calculatedIndex, 110, "Route index must reflect 10% price increase (110.00)");

  // Test 3: Test scraperService.recordHistoricalFare
  console.log("\n4. Testing scraperService.recordHistoricalFare with mock observations:");
  const mockObservations = [
    { totalFare: 4300 },
    { totalFare: 4400 },
    { totalFare: 4500 }
  ];
  await scraperService.recordHistoricalFare(testRoute, mockObservations, "Air India");

  const dailyRecord = await HistoricalFare.findOne({ route: testRoute, source: "Daily Scrape Snapshot" });
  console.log("   Daily Scrape Record in MongoDB:", {
    route: dailyRecord?.route,
    fare: dailyRecord?.fare,
    source: dailyRecord?.source
  });
  assert(dailyRecord, "Daily scrape snapshot record must exist in HistoricalFare");
  assert.strictEqual(dailyRecord.fare, 4400, "Median fare for daily record must be 4400");

  // Clean up test records
  await HistoricalFare.deleteMany({ route: testRoute });
  console.log("\n5. Cleaned up test records from HistoricalFare.");

  console.log("\n========================================================");
  console.log("✅ ALL HISTORICAL FARE CHECK & UPDATE TESTS PASSED!");
  console.log("========================================================\n");
  process.exit(0);
}

testHistoricalFareFlow().catch((err) => {
  console.error("\n❌ TEST FAILED:", err);
  process.exit(1);
});
