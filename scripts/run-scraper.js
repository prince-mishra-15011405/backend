/**
 * Direct Scraper Runner Script
 * Executes all enabled scrape jobs immediately via CLI.
 */

require("dotenv").config();
const { connectDatabase } = require("../config/database");
const scraperService = require("../services/scraper.service");

async function runScraperCLI() {
  await connectDatabase();
  const args = process.argv.slice(2);

  if (args.length >= 2) {
    const origin = args[0].toUpperCase();
    const destination = args[1].toUpperCase();
    const departureDate = args[2] || "2026-09-01";
    const source = args[3] || "Air India";
    const days = parseInt(args[4] || 30, 10);

    console.log(`[SCRAPER] Running single on-demand scrape: ${source} ${origin} → ${destination} (${departureDate}, ${days} days)...`);
    const obs = await scraperService.scrapeRoute(source, origin, destination, departureDate, days);
    console.log(`[SCRAPER] Completed: ${obs.length} observations collected and saved.`);
  } else {
    console.log("[SCRAPER] Running all enabled scrapers via CLI...");
    const outcome = await scraperService.runAllScrapers();
    console.log(`[SCRAPER] Results:`, outcome.results);
    if (outcome.errors.length > 0) {
      console.warn(`[SCRAPER] Errors encountered:`, outcome.errors);
    }
  }

  process.exit(0);
}

if (require.main === module) {
  runScraperCLI().catch((err) => {
    console.error("[SCRAPER] Fatal error:", err.message);
    process.exit(1);
  });
}
