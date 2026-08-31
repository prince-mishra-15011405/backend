/**
 * Standalone MakeMyTrip Scraper Verification Script
 * Tests the MakeMyTrip Puppeteer scraper directly and displays normalized observations.
 * 
 * Usage:
 *   node scripts/test-makemytrip.js [origin] [destination] [departureDate] [days]
 *   node scripts/test-makemytrip.js BOM BLR 2026-09-01 30
 *   node scripts/test-makemytrip.js --all
 */

require("dotenv").config();
const makemytripScraper = require("../scrapers/makemytrip.scraper");
const { DEFAULT_MAKEMYTRIP_ROUTES } = require("../scrapers/config/default-routes");
const { connectDatabase, isDbConnected } = require("../config/database");
const scraperService = require("../services/scraper.service");

async function scrapeSingleRoute(origin, destination, departureDate, days = 30) {
  const job = {
    source: "MakeMyTrip",
    origin: origin.toUpperCase(),
    destination: destination.toUpperCase(),
    departureDate: departureDate || "2026-09-01",
    days: parseInt(days || 30, 10)
  };

  console.log(`\n========================================`);
  console.log(`TESTING MAKEMYTRIP SCRAPER: ${job.origin} → ${job.destination}`);
  console.log(`Target Date: ${job.departureDate} (${job.days} days)`);
  console.log(`========================================`);

  try {
    const startTime = Date.now();
    const observations = await makemytripScraper.scrape(job);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`\nRESULTS: Completed in ${duration}s`);
    console.log(`Observations Collected: ${observations.length}`);

    if (observations.length > 0) {
      // Group observations by departure date to show breakdown
      const dateBreakdown = {};
      const airlineBreakdown = {};

      for (const obs of observations) {
        const dStr = new Date(obs.departureDate).toISOString().split("T")[0];
        dateBreakdown[dStr] = (dateBreakdown[dStr] || 0) + 1;

        const aName = obs.airline || "Unknown";
        airlineBreakdown[aName] = (airlineBreakdown[aName] || 0) + 1;
      }

      console.log(`\n${job.days}-Day Window Breakdown by Departure Date (${Object.keys(dateBreakdown).length} dates total):`);
      Object.entries(dateBreakdown).forEach(([d, count]) => {
        console.log(`  - ${d}: ${count} fare observation(s)`);
      });

      console.log(`\nAirlines Discovered:`);
      Object.entries(airlineBreakdown).forEach(([a, count]) => {
        console.log(`  - ${a}: ${count} flight(s)`);
      });

      console.log(`\nSample Observations (first 2):`);
      console.log(JSON.stringify(observations.slice(0, 2), null, 2));

      // Test RouteFareSearch format
      const rfsDoc = makemytripScraper.toRouteFareSearchDocument(
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
      if (rfsDoc.fares.length > 0) {
        console.log(`- Sample Fare:  ₹${rfsDoc.fares[0].price.total} (${rfsDoc.fares[0].source.name})`);
      }

      // If DB is connected, save observations
      if (isDbConnected()) {
        console.log(`\n[DB] Saving ${observations.length} observations to database...`);
        await scraperService.saveFareObservations(observations);
        await scraperService.recordHistoricalFare(`${job.origin}-${job.destination}`, observations, "MakeMyTrip");
      }

      console.log(`\n✅ TEST PASSED for ${job.origin} → ${job.destination}`);
      return { success: true, count: observations.length, route: `${job.origin}-${job.destination}` };
    } else {
      console.log(`\n⚠️ Note: 0 observations were extracted for this route/date.`);
      return { success: false, count: 0, route: `${job.origin}-${job.destination}` };
    }
  } catch (err) {
    console.error(`\n❌ TEST ERROR: ${err.message}`);
    return { success: false, error: err.message, route: `${job.origin}-${job.destination}` };
  }
}

async function run() {
  await connectDatabase().catch(() => null);

  const args = process.argv.slice(2);

  if (args.includes("--all") || args.includes("-a")) {
    console.log("========================================");
    console.log("MULTI-ROUTE MAKEMYTRIP BATCH VERIFICATION");
    console.log("========================================");

    const testRoutes = [
      { origin: "BOM", destination: "BLR", date: "2026-09-01", days: 3 },
      { origin: "DEL", destination: "BOM", date: "2026-09-01", days: 3 },
      { origin: "DEL", destination: "BLR", date: "2026-09-01", days: 3 }
    ];

    const results = [];
    for (const r of testRoutes) {
      const res = await scrapeSingleRoute(r.origin, r.destination, r.date, r.days);
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
    const origin = args[0] || "BOM";
    const destination = args[1] || "BLR";
    const departureDate = args[2] || "2026-09-01";
    const days = parseInt(args[3] || 1, 10); // Defaults to 1 day for quick test CLI, or 30 days if specified

    await scrapeSingleRoute(origin, destination, departureDate, days);
  }

  process.exit(0);
}

run();
