/**
 * CPI Augmentation & Macroeconomic Test Suite
 * Validates mathematical formulas, MOSPI comparison models, and REST endpoints.
 */

const assert = require("assert");
const http = require("http");
const app = require("../server/server");
const {
  CPI_WEIGHTS,
  calculateCpiImpact,
  getCpiComparisonSeries,
  simulateCpiShocks,
  calculateRouteCpiContributions
} = require("../lib/cpi");

let server;
const PORT = 5003;

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path,
        method: options.method || "GET",
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {})
        }
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(body);
            resolve({ status: res.statusCode, data: parsed });
          } catch {
            resolve({ status: res.statusCode, data: body });
          }
        });
      }
    );

    req.on("error", reject);
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runCpiTests() {
  console.log("\nStarting CPI Augmentation & Macro-Inflation Test Suite...\n");
  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err.message}`);
    }
  }

  async function asyncTest(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err.message}`);
    }
  }

  // 1. Formula & Mathematics Tests
  console.log("1. Mathematical Formula Verification (lib/cpi.js)");

  test("calculates baseline 0% inflation when index equals base (100)", () => {
    const impact = calculateCpiImpact(100, 100);
    assert.strictEqual(impact.airfareInflationRate, 0);
    assert.strictEqual(impact.headlineCpiImpactBasisPoints, 0);
    assert.strictEqual(impact.transportCpiImpactPercentagePoints, 0);
  });

  test("calculates positive inflation impact correctly (Index = 120, +20%)", () => {
    const impact = calculateCpiImpact(120, 100);
    assert.strictEqual(impact.airfareInflationRate, 20);
    // Transport impact: 20 * 0.042 = 0.84%
    assert.strictEqual(impact.transportCpiImpactPercentagePoints, 0.84);
    // Headline CPI impact: 0.84 * 0.0859 * 100 = 7.22 bps
    assert.strictEqual(impact.headlineCpiImpactBasisPoints, 7.22);
  });

  test("calculates negative deflation impact correctly (Index = 90, -10%)", () => {
    const impact = calculateCpiImpact(90, 100);
    assert.strictEqual(impact.airfareInflationRate, -10);
    assert.strictEqual(impact.transportCpiImpactPercentagePoints, -0.42);
    assert.strictEqual(impact.headlineCpiImpactBasisPoints, -3.61);
  });

  test("urban vs rural disaggregation reflects urban air transport concentration", () => {
    const impact = calculateCpiImpact(115, 100);
    assert.ok(impact.urbanImpactBasisPoints > impact.ruralImpactBasisPoints);
  });

  // 2. Comparison Time Series & Shock Simulation
  console.log("\n2. Comparison Time Series & Shock Simulation");

  test("generates MOSPI comparison time series with nowcast for current month", () => {
    const series = getCpiComparisonSeries(125);
    assert.ok(Array.isArray(series));
    assert.ok(series.length >= 6);
    const latest = series[series.length - 1];
    assert.strictEqual(latest.isNowcast, true);
    assert.strictEqual(latest.realTimeNowcast, 125);
    assert.strictEqual(latest.airfareCpiOfficial, null);
  });

  test("simulates inflation shocks accurately across range", () => {
    const shocks = simulateCpiShocks(100, [-20, 0, 20]);
    assert.strictEqual(shocks.length, 3);
    assert.strictEqual(shocks[0].shockPercentage, -20);
    assert.strictEqual(shocks[0].simulatedAirfareIndex, 80);
    assert.strictEqual(shocks[1].shockPercentage, 0);
    assert.strictEqual(shocks[1].simulatedAirfareIndex, 100);
    assert.strictEqual(shocks[2].shockPercentage, 20);
    assert.strictEqual(shocks[2].simulatedAirfareIndex, 120);
  });

  test("calculates corridor-level CPI basket decompositions", () => {
    const mockRoutes = [
      { route: "BOM-DEL", index: 120, weight: 0.3, currentFare: 12000, baseFare: 10000 },
      { route: "DEL-BLR", index: 110, weight: 0.2, currentFare: 11000, baseFare: 10000 }
    ];
    const decomp = calculateRouteCpiContributions(mockRoutes);
    assert.strictEqual(decomp.length, 2);
    assert.strictEqual(decomp[0].route, "BOM-DEL");
    assert.ok(decomp[0].headlineCpiContributionBps > 0);
  });

  // 3. Express REST API Integration Tests
  console.log("\n3. Express REST API Integration Tests");

  await new Promise((resolve) => {
    server = app.listen(PORT, resolve);
  });

  await asyncTest("GET /api/cpi returns 200 OK with summary impact payload", async () => {
    const res = await request("/api/cpi");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.ok(res.data.data.summary);
    assert.ok(typeof res.data.data.summary.headlineCpiImpactBasisPoints === "number");
    assert.ok(typeof res.data.data.summary.airfareInflationRate === "number");
  });

  await asyncTest("GET /api/cpi/comparison returns time-series with lead time advantage", async () => {
    const res = await request("/api/cpi/comparison");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.ok(Array.isArray(res.data.data.series));
    assert.strictEqual(res.data.data.leadTimeAdvantageDays, 45);
  });

  await asyncTest("GET /api/cpi/decomposition returns route-level contributions", async () => {
    const res = await request("/api/cpi/decomposition");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.ok(Array.isArray(res.data.data.routes));
  });

  await asyncTest("GET /api/cpi/simulate returns policy shock scenarios", async () => {
    const res = await request("/api/cpi/simulate?shock=15");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.ok(Array.isArray(res.data.data.shocks));
    assert.strictEqual(res.data.data.shocks[0].shockPercentage, 15);
  });

  server.close();

  console.log("\n----------------------------------------");
  console.log(`CPI Tests Passed: ${passed} / ${total}`);
  console.log("----------------------------------------\n");

  if (passed !== total) {
    process.exit(1);
  }
}

if (require.main === module) {
  runCpiTests().catch((err) => {
    console.error("Fatal Test Error:", err);
    if (server) server.close();
    process.exit(1);
  });
}

module.exports = runCpiTests;
