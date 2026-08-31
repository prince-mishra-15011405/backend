/**
 * Comprehensive Test Suite for India Airfare Price Index Calculation Engine
 */

const assert = require("assert");
const path = require("path");
const fs = require("fs");
const engine = require("../lib/engine");
const config = require("../config");

let passedCount = 0;
let totalCount = 0;

function it(description, fn) {
  totalCount++;
  try {
    fn();
    console.log(`  ✓ ${description}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ ${description}`);
    console.error(`    Error: ${err.message}`);
    process.exitCode = 1;
  }
}

console.log("\nRunning Airfare Index Engine Tests...\n");

// 1. Median tests
console.log("1. Median Calculation (getMedian)");
it("calculates median of odd-length sorted array", () => {
  const values = [6000, 6200, 6500, 7000, 9000];
  const med = engine.getMedian(values);
  assert.strictEqual(med, 6500);
});

it("calculates median of even-length array", () => {
  const values = [1000, 2000, 3000, 4000];
  const med = engine.getMedian(values);
  assert.strictEqual(med, 2500);
});

it("calculates median of unsorted array without mutating original array", () => {
  const values = [9000, 6000, 7000, 6200, 6500];
  const originalCopy = [...values];
  const med = engine.getMedian(values);
  assert.strictEqual(med, 6500);
  assert.deepStrictEqual(values, originalCopy, "Original array must not be mutated");
});

it("filters out null, undefined, NaN, 0, negative values in getMedian", () => {
  const values = [null, undefined, NaN, 0, -100, 5000, 6000, 7000];
  const med = engine.getMedian(values);
  assert.strictEqual(med, 6000);
});

// 2. Canonical Route ID tests
console.log("\n2. Canonical Route ID Generation (createRouteId)");
it("generates uppercase sorted route ID", () => {
  assert.strictEqual(engine.createRouteId("BOM", "DEL"), "BOM-DEL");
});

it("is directionless (BOM-DEL === DEL-BOM)", () => {
  assert.strictEqual(engine.createRouteId("DEL", "BOM"), "BOM-DEL");
});

it("handles lowercase inputs and whitespace", () => {
  assert.strictEqual(engine.createRouteId("  bom  ", "blr"), "BLR-BOM");
});

it("returns null for invalid inputs", () => {
  assert.strictEqual(engine.createRouteId("BOM", "BOM"), null);
  assert.strictEqual(engine.createRouteId("", "DEL"), null);
  assert.strictEqual(engine.createRouteId(null, "DEL"), null);
});

// 3. Dynamic Reference Year
console.log("\n3. DGCA Latest Reference Year Detection");
it("automatically finds the latest year from records", () => {
  const records = [
    { Year: "2021", City1: "A", City2: "B" },
    { Year: "2024", City1: "A", City2: "B" },
    { Year: "2025", City1: "A", City2: "B" },
    { Year: "2023", City1: "A", City2: "B" }
  ];
  assert.strictEqual(engine.getLatestReferenceYear(records), 2025);
});

// 4. Base Period Date Filtering
console.log("\n4. Base Period Date Filtering (getBaseRepresentativeFare)");
it("filters historical observations within base period date window", () => {
  const historical = [
    { date: "2025-12-25", fare: 20000 }, // Out of window
    { date: "2026-01-05", fare: 9500 },
    { date: "2026-01-12", fare: 10000 },
    { date: "2026-01-19", fare: 10500 },
    { date: "2026-02-10", fare: 30000 }  // Out of window
  ];
  const basePeriod = { start: "2026-01-01", end: "2026-01-31" };
  const baseFare = engine.getBaseRepresentativeFare(historical, basePeriod);
  assert.strictEqual(baseFare, 10000);
});

// 5. Route Weights & Re-normalization
console.log("\n5. Route Weights & Re-normalization (calculateRouteWeights)");
it("calculates normalized weights summing to 1.0", () => {
  const volumes = {
    "BOM-DEL": 190000,
    "BOM-BLR": 155000,
    "DEL-BLR": 138000
  };
  const weights = engine.calculateRouteWeights(volumes, 30);
  assert.strictEqual(weights.length, 3);
  
  const sumWeights = weights.reduce((sum, w) => sum + w.weight, 0);
  assert(Math.abs(sumWeights - 1.0) < 1e-9, `Weights sum must be 1.0, got ${sumWeights}`);
  assert.strictEqual(weights[0].route, "BOM-DEL");
});

it("supports basketSize slicing and re-normalizes top N routes", () => {
  const volumes = {
    "BOM-DEL": 1000,
    "BOM-BLR": 600,
    "DEL-BLR": 400,
    "BOM-HYD": 200
  };
  // Top 2: BOM-DEL (1000) and BOM-BLR (600), sum = 1600
  const weights = engine.calculateRouteWeights(volumes, 2);
  assert.strictEqual(weights.length, 2);
  assert.strictEqual(weights[0].route, "BOM-DEL");
  assert.strictEqual(weights[0].weight, 1000 / 1600);
  assert.strictEqual(weights[1].route, "BOM-BLR");
  assert.strictEqual(weights[1].weight, 600 / 1600);
  const sumWeights = weights.reduce((sum, w) => sum + w.weight, 0);
  assert(Math.abs(sumWeights - 1.0) < 1e-9);
});

// 6. Route Index & India Airfare Index Calculation
console.log("\n6. Route & Overall India Airfare Index Calculation");
it("computes Route Index correctly: (current / base) * 100", () => {
  const index = engine.calculateRouteIndex(12000, 10000);
  assert.strictEqual(index, 120);
});

it("computes overall India Airfare Index as Σ(Route Index × Route Weight)", () => {
  const routes = [
    { index: 120, weight: 0.40 },   // 48.0
    { index: 110, weight: 0.35 },   // 38.5
    { index: 105, weight: 0.25 }    // 26.25
  ];
  const totalIndex = engine.calculateIndiaAirfareIndex(routes);
  assert.strictEqual(totalIndex, 112.75);
});

// 7. Full Pipeline & Output Validation
console.log("\n7. Full Pipeline Execution & Dynamic Data Ingestion");
it("executes full computeAirfareIndex pipeline with mock datasets", () => {
  const result = engine.computeAirfareIndex(config);
  
  assert(result.referenceYear >= 2025, "Reference year must be detected from DGCA data");
  assert(result.routes.length >= 5, "Must process valid matched routes in basket");
  assert(typeof result.indiaAirfareIndex === "number" && result.indiaAirfareIndex > 0);
  
  // Verify weights sum to 1.0
  const weightSum = result.routes.reduce((sum, r) => sum + r.weight, 0);
  assert(Math.abs(weightSum - 1.0) < 1e-5, `Weight sum should be 1.0, got ${weightSum}`);

  // Verify warning recorded for unmapped/missing route (CCU-DEL)
  assert(result.warnings.some((w) => w.route === "CCU-DEL"), "Should record warning for route without fare data");

  // Verify output JSON written to disk
  assert(fs.existsSync(config.paths.outputFile), "Output JSON file must exist");
  const outputData = JSON.parse(fs.readFileSync(config.paths.outputFile, "utf-8"));
  assert.strictEqual(outputData.indiaAirfareIndex, result.indiaAirfareIndex);
  assert.strictEqual(outputData.routes.length, result.routes.length);
});

// 8. Required Function Exports (Section 19)
console.log("\n8. Verifying 16 Reusable Function Exports (Section 19)");
const requiredFunctions = [
  "loadFareDatasets",
  "loadHistoricalData",
  "loadDGCAData",
  "loadAirportMap",
  "getMedian",
  "createRouteId",
  "extractFareObservations",
  "getLatestReferenceYear",
  "aggregateRoutePassengerVolume",
  "calculateRouteWeights",
  "getBaseRepresentativeFare",
  "getCurrentRepresentativeFare",
  "calculateRouteIndex",
  "calculateIndiaAirfareIndex",
  "validateRouteData",
  "generateOutput"
];

for (const fnName of requiredFunctions) {
  it(`exports ${fnName} as a callable function`, () => {
    assert.strictEqual(typeof engine[fnName], "function", `${fnName} must be a function`);
  });
}

// 9. Dynamic Fare File Drop Test
console.log("\n9. Dynamic Data Ingestion Test (Adding Fare File Without Code Change)");
it("dynamically ingests new fare file added to data/fares without code modification", () => {
  const dynamicFilePath = path.join(__dirname, "..", "data", "fares", "temp_dynamic_test.json");
  
  // Write a temporary new fare observation for BLR-HYD
  fs.writeFileSync(
    dynamicFilePath,
    JSON.stringify({
      source: "TestAir",
      origin: { airportCode: "HYD" },
      destination: { airportCode: "BLR" },
      fares: [{ totalPrice: { total: "4900" } }]
    })
  );

  try {
    const freshDatasets = engine.loadFareDatasets(config.paths.faresDir);
    const obs = engine.extractFareObservations(freshDatasets);
    assert(obs["BLR-HYD"].fares.includes(4900), "New fare of 4900 must be dynamically extracted");
  } finally {
    if (fs.existsSync(dynamicFilePath)) {
      fs.unlinkSync(dynamicFilePath);
    }
  }
});

// Summary
console.log(`\n----------------------------------------`);
console.log(`Tests Passed: ${passedCount} / ${totalCount}`);
console.log(`----------------------------------------\n`);

if (passedCount !== totalCount) {
  process.exit(1);
}
