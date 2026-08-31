/**
 * Standalone Air India Scraper Verification Script
 * Tests the Air India API scraper directly and displays normalized observations.
 * 
 * Usage:
 *   node scripts/test-airindia.js [origin] [destination] [departureDate]
 *   node scripts/test-airindia.js DEL GOI 2026-09-01
 *   node scripts/test-airindia.js --all
 */

require("dotenv").config();
const airIndiaScraper = require("../scrapers/airindia.scraper");
const { DEFAULT_AIRINDIA_ROUTES } = require("../scrapers/config/default-routes");

async function scrapeSingleRoute(origin, destination, departureDate) {
  const job = {
    source: "Air India",
    origin: origin.toUpperCase(),
    destination: destination.toUpperCase(),
    departureDate: departureDate || "2026-09-01"
  };

  console.log(`\n========================================`);
  console.log(`TESTING AIR INDIA SCRAPER: ${job.origin} → ${job.destination}`);
  console.log(`Target Date: ${job.departureDate}`);
  console.log(`========================================`);

  try {
    const startTime = Date.now();
    const observations = await airIndiaScraper.scrape(job);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`\nRESULTS: Completed in ${duration}s`);
    console.log(`Observations Collected: ${observations.length}`);

    if (observations.length > 0) {
      // Group observations by departure date to show 7-day week breakdown
      const dateBreakdown = {};
      for (const obs of observations) {
        const dStr = new Date(obs.departureDate).toISOString().split("T")[0];
        dateBreakdown[dStr] = (dateBreakdown[dStr] || 0) + 1;
      }

      console.log(`\n30-Day Window Scrape Breakdown by Departure Date (${Object.keys(dateBreakdown).length} dates total):`);
      Object.entries(dateBreakdown).forEach(([d, count]) => {
        console.log(`  - ${d}: ${count} fare observation(s)`);
      });

      console.log(`\nSample Observations (first 2):`);
      console.log(JSON.stringify(observations.slice(0, 2), null, 2));

      // Test RouteFareSearch format
      const rfsDoc = airIndiaScraper.toRouteFareSearchDocument(
        observations,
        job.origin,
        job.destination,
        job.departureDate
      );

      console.log(`\nRouteFareSearch Document Schema:`);
      console.log(`- Route:        ${rfsDoc.route.origin.airportCode} ↔ ${rfsDoc.route.destination.airportCode}`);
      console.log(`- Total Fares:  ${rfsDoc.fares.length}`);
      console.log(`- Provider:     ${rfsDoc.source.provider}`);
      console.log(`- Data Quality: ${rfsDoc.dataQuality.status}`);
      console.log(`- Sample Fare:  ₹${rfsDoc.fares[0].price.total} (Base: ₹${rfsDoc.fares[0].price.base}, Tax: ₹${rfsDoc.fares[0].price.tax})`);

      console.log(`\n✅ TEST PASSED for ${job.origin} → ${job.destination}`);
      return { success: true, count: observations.length, route: `${job.origin}-${job.destination}` };
    } else {
      console.log(`\n⚠️ Note: 0 observations were returned by the API endpoint for this route/date.`);
      return { success: false, count: 0, route: `${job.origin}-${job.destination}` };
    }
  } catch (err) {
    console.error(`\n❌ TEST ERROR: ${err.message}`);
    return { success: false, error: err.message, route: `${job.origin}-${job.destination}` };
  }
}

async function run() {
  const args = process.argv.slice(2);

  if (args.includes("--all") || args.includes("-a")) {
    console.log("========================================");
    console.log("MULTI-ROUTE AIR INDIA BATCH VERIFICATION");
    console.log("========================================");

    const testRoutes = [
      { origin: "DEL", destination: "GOI", date: "2026-09-01" },
      { origin: "DEL", destination: "BOM", date: "2026-09-01" },
      { origin: "BOM", destination: "BLR", date: "2026-09-01" },
      { origin: "DEL", destination: "BLR", date: "2026-09-01" }
    ];

    const results = [];
    for (const r of testRoutes) {
      const res = await scrapeSingleRoute(r.origin, r.destination, r.date);
      results.push(res);
    }

    console.log("\n========================================");
    console.log("BATCH SUMMARY RESULTS");
    console.log("========================================");
    results.forEach((r) => {
      console.log(`${r.route}: ${r.success ? `✅ PASS (${r.count} fares)` : `❌ FAIL (${r.error || 0})`}`);
    });
    console.log("========================================");
  } else {
    const origin = args[0] || "DEL";
    const destination = args[1] || "GOI";
    const departureDate = args[2] || "2026-09-01";

    await scrapeSingleRoute(origin, destination, departureDate);
  }

  process.exit(0);
}

run();
