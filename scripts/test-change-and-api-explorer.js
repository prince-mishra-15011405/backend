/**
 * Verification Script: 24h/7d Change Tracking & API Explorer
 */

require("dotenv").config();
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { connectDatabase } = require("../config/database");
const IndexSnapshot = require("../models/IndexSnapshot");
const ScrapeJob = require("../models/ScrapeJob");
const dataService = require("../services/data.service");
const scraperService = require("../services/scraper.service");

async function runVerification() {
  await connectDatabase();
  console.log("\n========================================================");
  console.log("VERIFYING 24H & 7D CHANGE PERSISTENCE AND API EXPLORER");
  console.log("========================================================");

  // 1. Verify IndexSnapshot recalculation & persistence of change24h & change7d
  console.log("\n1. Testing dataService.recalculateMasterIndex():");
  const indexResult = await dataService.recalculateMasterIndex();
  console.log("   Calculated Master Index:", {
    indiaAirfareIndex: indexResult.indiaAirfareIndex,
    change24h: indexResult.change24h,
    change7d: indexResult.change7d,
    routeCount: indexResult.routeCount,
    sampleRoute: {
      route: indexResult.routes?.[0]?.route,
      change24h: indexResult.routes?.[0]?.change24h,
      change7d: indexResult.routes?.[0]?.change7d
    }
  });

  assert(typeof indexResult.change24h === "number", "change24h must be a number");
  assert(typeof indexResult.change7d === "number", "change7d must be a number");
  assert(Array.isArray(indexResult.routes), "routes must be an array");
  if (indexResult.routes.length > 0) {
    assert(indexResult.routes[0].change24h !== undefined, "route change24h must be defined");
    assert(indexResult.routes[0].change7d !== undefined, "route change7d must be defined");
  }

  // Verify that it was saved into MongoDB IndexSnapshot
  const latestSnapshot = await IndexSnapshot.findOne({}).sort({ calculatedAt: -1 }).lean();
  console.log("   Saved IndexSnapshot in MongoDB:", {
    _id: latestSnapshot?._id,
    indiaAirfareIndex: latestSnapshot?.indiaAirfareIndex,
    change24h: latestSnapshot?.change24h,
    change7d: latestSnapshot?.change7d,
    routesCount: latestSnapshot?.routes?.length
  });
  assert(latestSnapshot, "Snapshot must exist in MongoDB");
  assert.strictEqual(typeof latestSnapshot.change24h, "number", "Saved change24h must be a number");
  assert.strictEqual(typeof latestSnapshot.change7d, "number", "Saved change7d must be a number");

  // 2. Verify ScrapeJob schema and scraperService status
  console.log("\n2. Testing scraperService.getStatus():");
  const scraperStatus = scraperService.getStatus();
  console.log("   Scraper Status:", scraperStatus);
  assert(scraperStatus.lastChange24h !== undefined, "scraperStatus.lastChange24h must be defined");
  assert(scraperStatus.lastChange7d !== undefined, "scraperStatus.lastChange7d must be defined");

  // Verify ScrapeJob model fields
  console.log("\n3. Testing ScrapeJob fields in MongoDB:");
  const testJob = await ScrapeJob.findOneAndUpdate(
    { source: "Air India", origin: "DEL", destination: "TEST" },
    {
      source: "Air India",
      origin: "DEL",
      destination: "TEST",
      departureDate: new Date(),
      days: 30,
      enabled: false,
      lastFare: 5500,
      lastChange24h: 3.5,
      lastChange7d: -1.2
    },
    { upsert: true, new: true }
  ).lean();

  console.log("   Saved ScrapeJob in MongoDB:", {
    route: `${testJob.origin}-${testJob.destination}`,
    days: testJob.days,
    lastFare: testJob.lastFare,
    lastChange24h: testJob.lastChange24h,
    lastChange7d: testJob.lastChange7d
  });
  assert.strictEqual(testJob.lastChange24h, 3.5);
  assert.strictEqual(testJob.lastChange7d, -1.2);
  assert.strictEqual(testJob.lastFare, 5500);

  // Clean up test job
  await ScrapeJob.deleteOne({ _id: testJob._id });

  // 4. Verify public/index.html contains API Explorer & all routes
  console.log("\n4. Testing public/index.html structure:");
  const indexPath = path.join(__dirname, "..", "public", "index.html");
  const htmlContent = fs.readFileSync(indexPath, "utf-8");

  assert(htmlContent.includes('id="apiExplorerSection"'), "index.html must contain apiExplorerSection");
  assert(htmlContent.includes('id="navApiBtn"'), "index.html must contain navApiBtn");
  assert(htmlContent.includes('id="apiScraper24hChange"'), "index.html must contain apiScraper24hChange");
  assert(htmlContent.includes('id="apiScraper7dChange"'), "index.html must contain apiScraper7dChange");
  assert(htmlContent.includes('ALL_API_ENDPOINTS'), "index.html must define ALL_API_ENDPOINTS");
  assert(htmlContent.includes('/api/health'), "index.html must include /api/health");
  assert(htmlContent.includes('/api/refresh'), "index.html must include /api/refresh");
  assert(htmlContent.includes('/api/index'), "index.html must include /api/index");
  assert(htmlContent.includes('/api/routes'), "index.html must include /api/routes");
  assert(htmlContent.includes('/api/search'), "index.html must include /api/search");
  assert(htmlContent.includes('/api/scraper/status'), "index.html must include /api/scraper/status");
  assert(htmlContent.includes('/api/scraper/run'), "index.html must include /api/scraper/run");
  assert(htmlContent.includes('/api/cpi'), "index.html must include /api/cpi");

  console.log("   index.html successfully validated: All API endpoints, 24h & 7d change monitors present!");

  console.log("\n========================================================");
  console.log("✅ ALL VERIFICATION CHECKS PASSED!");
  console.log("========================================================\n");
  process.exit(0);
}

runVerification().catch((err) => {
  console.error("\n❌ VERIFICATION FAILED:", err);
  process.exit(1);
});
