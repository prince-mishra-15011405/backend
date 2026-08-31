/**
 * Seed Initial ScrapeJobs Script
 * Populates ScrapeJob collection with target routes.
 */

require("dotenv").config();
const { connectDatabase } = require("../config/database");
const ScrapeJob = require("../models/ScrapeJob");

const { DEFAULT_AIRINDIA_ROUTES, DEFAULT_SPICEJET_ROUTES } = require("../scrapers/config/default-routes");

async function seedScrapeJobs() {
  await connectDatabase();

  let countAI = 0;
  for (const r of DEFAULT_AIRINDIA_ROUTES) {
    const jobData = {
      source: "Air India",
      origin: r.origin,
      destination: r.destination,
      departureDate: new Date("2026-09-01"),
      days: 30,
      enabled: true,
      priority: r.priority || 1
    };

    await ScrapeJob.findOneAndUpdate(
      { source: jobData.source, origin: jobData.origin, destination: jobData.destination },
      jobData,
      { upsert: true, new: true }
    );
    countAI++;
  }

  let countSG = 0;
  for (const r of DEFAULT_SPICEJET_ROUTES) {
    const jobData = {
      source: "SpiceJet",
      origin: r.origin,
      destination: r.destination,
      departureDate: new Date("2026-09-01"),
      days: 30,
      enabled: true,
      priority: r.priority || 1
    };

    await ScrapeJob.findOneAndUpdate(
      { source: jobData.source, origin: jobData.origin, destination: jobData.destination },
      jobData,
      { upsert: true, new: true }
    );
    countSG++;
  }

  console.log(`[SEED] Successfully seeded/updated ${countAI} Air India and ${countSG} SpiceJet ScrapeJobs in MongoDB.`);
  process.exit(0);
}

if (require.main === module) {
  seedScrapeJobs().catch((err) => {
    console.error("[SEED] Error:", err.message);
    process.exit(1);
  });
}

module.exports = seedScrapeJobs;
