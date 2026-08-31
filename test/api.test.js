/**
 * Automated Test Suite for India Airfare Express REST API & Database Services
 */

const assert = require("assert");
const http = require("http");
const app = require("../server/server");
const { parseIndianCurrency } = require("../utils/currency");
const { createRouteId } = require("../utils/route");

let server;
let baseUrl;
let passedCount = 0;
let totalCount = 0;

function it(description, fn) {
  totalCount++;
  return fn()
    .then(() => {
      console.log(`  ✓ ${description}`);
      passedCount++;
    })
    .catch((err) => {
      console.error(`  ✗ ${description}`);
      console.error(`    Error: ${err.message}`);
      process.exitCode = 1;
    });
}

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        "Content-Type": "application/json"
      }
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch (e) {
          parsed = data;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: parsed
        });
      });
    });

    req.on("error", reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log("\nStarting Express REST API & Database Integration Test Suite...\n");

  // 1. Currency & Route Normalization Unit Tests
  console.log("1. Currency & Route Normalization Utilities");
  await it("parses Indian currency formats accurately", async () => {
    assert.strictEqual(parseIndianCurrency("₹6,412"), 6412);
    assert.strictEqual(parseIndianCurrency("₹12,500"), 12500);
    assert.strictEqual(parseIndianCurrency("₹1,05,000"), 105000);
    assert.strictEqual(parseIndianCurrency("5400"), 5400);
    assert.strictEqual(parseIndianCurrency(null), null);
    assert.strictEqual(parseIndianCurrency(0), null);
  });

  await it("creates canonical uppercase directionless route IDs", async () => {
    assert.strictEqual(createRouteId("BOM", "DEL"), "BOM-DEL");
    assert.strictEqual(createRouteId("del", "bom"), "BOM-DEL");
    assert.strictEqual(createRouteId("BOM", "BOM"), null);
  });

  // Start test server on dynamic port
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });

  try {
    // 2. Health Endpoint
    console.log("\n2. System & Health Endpoints");
    await it("GET /api/health returns 200 OK with service and database metadata", async () => {
      const res = await request("GET", "/api/health");
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.status, "ok");
      assert.strictEqual(res.body.service, "india-airfare-index-api");
      assert(res.body.database);
    });

    // 3. Dashboard Aggregated Endpoint
    console.log("\n3. Dashboard Aggregated Endpoint");
    await it("GET /api/dashboard returns full dashboard payload", async () => {
      const res = await request("GET", "/api/dashboard");
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert(res.body.data.summary);
      assert(typeof res.body.data.summary.indiaAirfareIndex === "number");
      assert.strictEqual(res.body.data.summary.baseIndex, 100);
      assert(res.body.data.summary.routesTracked >= 1);
      assert(Array.isArray(res.body.data.topRoutes));
      assert(res.body.data.dataStream);
      assert(Array.isArray(res.body.data.warnings));
    });

    // 4. Index Endpoints
    console.log("\n4. Index Endpoints");
    await it("GET /api/index returns composite index data from calculation engine", async () => {
      const res = await request("GET", "/api/index");
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert(res.body.data.value > 0);
      assert.strictEqual(res.body.data.baseValue, 100);
      assert(res.body.data.referenceYear >= 2025);
    });

    // 5. Routes Endpoints
    console.log("\n5. Route Level Endpoints");
    await it("GET /api/routes returns route movements with display names", async () => {
      const res = await request("GET", "/api/routes");
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert(res.body.data.total >= 1);
      assert(Array.isArray(res.body.data.routes));
      
      const first = res.body.data.routes[0];
      assert(first.route);
      assert(first.origin);
      assert(first.destination);
      assert(first.routeName.includes("↔"));
      assert(typeof first.currentFare === "number");
      assert(typeof first.index === "number");
    });

    await it("GET /api/routes/BOM-DEL returns detailed route inspection data", async () => {
      const res = await request("GET", "/api/routes/BOM-DEL");
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.route, "BOM-DEL");
      assert.strictEqual(res.body.data.origin.code, "BOM");
      assert.strictEqual(res.body.data.origin.city, "Mumbai");
      assert.strictEqual(res.body.data.destination.code, "DEL");
      assert.strictEqual(res.body.data.destination.city, "Delhi");
      assert(Array.isArray(res.body.data.fareObservations));
      assert(Array.isArray(res.body.data.historicalFare));
    });

    await it("GET /api/routes/INVALID-ROUTE returns 404 ROUTE_NOT_FOUND", async () => {
      const res = await request("GET", "/api/routes/INVALID-XYZ");
      assert.strictEqual(res.status, 404);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.error.code, "ROUTE_NOT_FOUND");
    });

    // 6. Database-First & On-Demand Search Endpoints
    console.log("\n6. Database-First & On-Demand Search Endpoints");
    await it("GET /api/search?q=mumbai finds Mumbai airport, city, and routes", async () => {
      const res = await request("GET", "/api/search?q=mumbai");
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert(res.body.data.results.length > 0);
      assert(res.body.data.results.some((r) => r.type === "city" && r.name === "Mumbai"));
    });

    await it("GET /api/search?q=BOM-DEL checks database first or triggers multi-provider scrape", async () => {
      const res = await request("GET", "/api/search?q=BOM-DEL");
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert(["database", "fresh_scrape", "multi_provider_scrape", "background_progressive_scrape"].includes(res.body.data.source));
      assert(res.body.data.route === "BOM-DEL");
      if (res.body.data.priceComparison) {
        assert(typeof res.body.data.priceComparison.providers === "object");
      }
    });

    await it("GET /api/search?q=Agoda BOM DEL parses carrier keyword and executes route search", async () => {
      const res = await request("GET", "/api/search?q=Agoda BOM DEL");
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert(res.body.data.route === "BOM-DEL");
    });

    // 7. Scraper Management Endpoints
    console.log("\n7. Scraper Management Endpoints");
    await it("GET /api/scraper/status returns scraper runtime status", async () => {
      const res = await request("GET", "/api/scraper/status");
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert(typeof res.body.data.running === "boolean");
      assert(typeof res.body.data.observationsCollected === "number");
    });

    await it("GET /api/scraper/jobs returns list of configured scrape targets", async () => {
      const res = await request("GET", "/api/scraper/jobs");
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert(Array.isArray(res.body.data));
    });

    // 8. Data Stream & Quality Endpoints
    console.log("\n8. Data Stream & Quality Endpoints");
    await it("GET /api/data/status returns stream health and counts", async () => {
      const res = await request("GET", "/api/data/status");
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert(res.body.data.observations >= 0);
    });

    await it("GET /api/data/quality returns data quality audit and missing routes", async () => {
      const res = await request("GET", "/api/data/quality");
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert(res.body.data.validFareObservations >= 0);
      assert(Array.isArray(res.body.data.warnings));
    });

    // 9. Refresh & Cache Invalidation
    console.log("\n9. Refresh Endpoint");
    await it("POST /api/refresh invalidates cache and recalculates master index", async () => {
      const res = await request("POST", "/api/refresh");
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.message, "Index data refreshed");
    });

    // 10. Error Handling
    console.log("\n10. Standard Error Handling");
    await it("GET /api/nonexistent returns standardized 404 error", async () => {
      const res = await request("GET", "/api/nonexistent");
      assert.strictEqual(res.status, 404);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.error.code, "ENDPOINT_NOT_FOUND");
    });

  } finally {
    server.close();
  }

  console.log(`\n----------------------------------------`);
  console.log(`API Tests Passed: ${passedCount} / ${totalCount}`);
  console.log(`----------------------------------------\n`);

  if (passedCount !== totalCount) {
    process.exit(1);
  }
}

runTests();
