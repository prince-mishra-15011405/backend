/**
 * DGCA City-Pair Traffic Data Import Script
 * Imports data/dgca/city.json into MongoDB RouteTraffic collection.
 */

require("dotenv").config();
const path = require("path");
const fs = require("fs");
const { connectDatabase } = require("../config/database");
const RouteTraffic = require("../models/RouteTraffic");
const Airport = require("../models/Airport");
const { createRouteId } = require("../utils/route");

async function importDGCA() {
  await connectDatabase();

  const filePath = path.join(__dirname, "..", "data", "dgca", "city.json");
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  // Build city to airport code lookup
  const airports = await Airport.find({}).lean();
  const cityToCode = {};
  for (const a of airports) {
    cityToCode[a.cityNormalized] = a.airportCode;
  }

  // Also load local map if DB airports is empty
  if (Object.keys(cityToCode).length === 0) {
    const localMap = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "airport-map.json"), "utf-8"));
    for (const a of localMap) {
      if (a.city && a.airportCode) {
        cityToCode[String(a.city).trim().toUpperCase()] = String(a.airportCode).trim().toUpperCase();
      }
    }
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  const records = JSON.parse(raw);

  let insertedCount = 0;
  for (const r of records) {
    if (!r || !r.Year || !r.City1 || !r.City2) continue;

    const year = parseInt(String(r.Year).trim(), 10);
    const month = r.Month ? parseInt(String(r.Month).trim(), 10) : null;
    const city1 = String(r.City1).trim().toUpperCase();
    const city2 = String(r.City2).trim().toUpperCase();

    const origin = cityToCode[city1] || null;
    const destination = cityToCode[city2] || null;
    const route = origin && destination ? createRouteId(origin, destination) : null;

    const paxTo = Number(r.PaxToCity2) || 0;
    const paxFrom = Number(r.PaxFromCity2) || 0;
    const passengerVolume = paxTo + paxFrom;

    if (year && passengerVolume >= 0) {
      await RouteTraffic.findOneAndUpdate(
        { year, month, city1, city2 },
        {
          year,
          month,
          city1,
          city2,
          origin,
          destination,
          route,
          paxToCity2: paxTo,
          paxFromCity2: paxFrom,
          passengerVolume
        },
        { upsert: true, new: true }
      );
      insertedCount++;
    }
  }

  console.log(`[IMPORT] Successfully imported ${insertedCount} DGCA traffic records into MongoDB.`);
  process.exit(0);
}

if (require.main === module) {
  importDGCA().catch((err) => {
    console.error("[IMPORT] Error:", err.message);
    process.exit(1);
  });
}

module.exports = importDGCA;
