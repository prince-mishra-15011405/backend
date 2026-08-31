/**
 * Historical Base Fare Import Script
 * Imports data/historical/fares.json into MongoDB HistoricalFare collection.
 */

require("dotenv").config();
const path = require("path");
const fs = require("fs");
const { connectDatabase } = require("../config/database");
const HistoricalFare = require("../models/HistoricalFare");
const { createRouteId } = require("../utils/route");

async function importHistory() {
  await connectDatabase();

  const filePath = path.join(__dirname, "..", "data", "historical", "fares.json");
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw);

  let insertedCount = 0;

  for (const [key, observations] of Object.entries(parsed)) {
    if (key.startsWith("_") || !Array.isArray(observations)) continue;

    const parts = key.split("-");
    const route = parts.length === 2 ? createRouteId(parts[0], parts[1]) || key : key;

    for (const obs of observations) {
      if (obs && obs.fare && obs.date) {
        const fare = Number(obs.fare);
        const date = new Date(obs.date);

        if (fare > 0 && !isNaN(date.getTime())) {
          await HistoricalFare.findOneAndUpdate(
            { route, date, fare },
            {
              route,
              date,
              fare,
              source: "Historical Base Observation"
            },
            { upsert: true, new: true }
          );
          insertedCount++;
        }
      }
    }
  }

  console.log(`[IMPORT] Successfully imported ${insertedCount} historical fare observations into MongoDB.`);
  process.exit(0);
}

if (require.main === module) {
  importHistory().catch((err) => {
    console.error("[IMPORT] Error:", err.message);
    process.exit(1);
  });
}

module.exports = importHistory;
