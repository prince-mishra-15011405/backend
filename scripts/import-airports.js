/**
 * Airport Mapping Import Script
 * Imports data/airport-map.json into MongoDB Airport collection.
 */

require("dotenv").config();
const path = require("path");
const fs = require("fs");
const { connectDatabase } = require("../config/database");
const Airport = require("../models/Airport");

async function importAirports() {
  await connectDatabase();

  const filePath = path.join(__dirname, "..", "data", "airport-map.json");
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  const airports = JSON.parse(raw);

  let count = 0;
  for (const entry of airports) {
    if (entry.airportCode && entry.city) {
      const airportCode = String(entry.airportCode).trim().toUpperCase();
      const city = String(entry.city).trim();
      const cityNormalized = city.toUpperCase();

      await Airport.findOneAndUpdate(
        { airportCode },
        { airportCode, city, cityNormalized },
        { upsert: true, new: true }
      );
      count++;
    }
  }

  console.log(`[IMPORT] Successfully imported/updated ${count} airport mappings into MongoDB.`);
  process.exit(0);
}

if (require.main === module) {
  importAirports().catch((err) => {
    console.error("[IMPORT] Error:", err.message);
    process.exit(1);
  });
}

module.exports = importAirports;
