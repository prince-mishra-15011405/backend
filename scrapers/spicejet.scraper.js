/**
 * SpiceJet Airline Portal & Lowfare API Scraper
 * 
 * Extracts real-time daily lowest fares via SpiceJet Navitaire dotREZ Lowfare API
 * (POST https://www.spicejet.com/api/v2/search/lowfare) using authenticated in-browser
 * Puppeteer evaluation and normalizes data into the FareObservation & RouteFareSearch schemas.
 */

const puppeteer = require("puppeteer");
const { createRouteId } = require("../utils/route");
const { parseIndianCurrency } = require("../utils/currency");

const AIRLINE_NAME = "SpiceJet";
const SCRAPER_NAME = "spicejet-lowfare-api";
const SCRAPER_VERSION = "1.0.0";
const DEFAULT_AUTH_TOKEN =
  process.env.SPICEJET_AUTH_TOKEN ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkb3RSRVogQVBJIiwianRpIjoiZGNjNmI3NTgtMDNmMy1hNjYwLTY0ZWMtNzc4OWM3NzRjNzM1IiwiaXNzIjoiZG90UkVaIEFQSSJ9.p-S7n0nU9-hlDEAKl6s70VXr9XjJhN9pKNTxjdO3-cE";

/**
 * Formats a Date object or string to YYYY-MM-DD
 * @param {Date|string} date 
 * @returns {string}
 */
function formatDate(date) {
  const d = new Date(date);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${date}`);
  }
  return d.toISOString().split("T")[0];
}

/**
 * Normalizes SpiceJet dotREZ lowfare API JSON response into FareObservation-compatible objects.
 * 
 * @param {Object} data - Raw JSON response from /api/v2/search/lowfare
 * @param {string} origin - Origin airport code (e.g., "BOM")
 * @param {string} destination - Destination airport code (e.g., "DEL")
 * @param {string} route - Canonical route identifier (e.g., "BOM-DEL")
 * @returns {Array<Object>} Normalized fare observations
 */
function normalizeApiResponse(data, origin, destination, route) {
  const observations = [];
  const now = new Date();
  if (!data || !data.data) return observations;

  const markets = data.data.lowFareDateMarkets || [];
  const currency = data.data.currencyCode || "INR";
  const stationOffsets = data.data.stationCodeTimeZoneOffsets || {};

  for (const item of markets) {
    if (!item || !item.lowestFareAmount) continue;

    const rawFare = item.lowestFareAmount.fareAmount;
    const rawTax = item.lowestFareAmount.taxesAndFeesAmount || 0;
    const totalFare = parseIndianCurrency(rawFare);

    if (!totalFare || totalFare <= 0) continue;

    const baseFare = rawFare > rawTax ? rawFare - rawTax : rawFare;
    const itemOrigin = String(item.origin || origin).trim().toUpperCase();
    const itemDest = String(item.destination || destination).trim().toUpperCase();
    const itemRoute = route || createRouteId(itemOrigin, itemDest);
    const depDate = item.departureDate ? new Date(item.departureDate) : new Date();

    observations.push({
      source: AIRLINE_NAME,
      airline: AIRLINE_NAME,
      flightNo: "SG",
      origin: itemOrigin,
      destination: itemDest,
      route: itemRoute,
      departureDate: depDate,
      returnDate: null,
      departureTime: "00:00",
      arrivalTime: "00:00",
      duration: "",
      stops: 0,
      fareType: "SpiceSaver",
      cabinClass: "Economy",
      totalFare,
      currency,
      scrapedAt: now,
      searchTimestamp: now,
      metadata: {
        base: baseFare,
        tax: rawTax,
        priceLabel: "Lowest Fare",
        departureDateToShow: item.departureDateToShow || null,
        isCurrentDate: Boolean(item.isCurrentDate),
        isOneDayAheadDate: Boolean(item.isOneDayAheadDate),
        isOneDayBehindDate: Boolean(item.isOneDayBehindDate),
        stationCodeTimeZoneOffsets: stationOffsets,
        rawSource: "spicejet-dotrez-v2"
      }
    });
  }

  return observations;
}

/**
 * Calculates a list of center dates (spaced 7 days apart) to cover the requested date range.
 * 
 * @param {Date|string} startDate 
 * @param {number} daysCount 
 * @returns {Array<string>} Array of YYYY-MM-DD date strings
 */
function calculateCenterDates(startDate, daysCount = 30) {
  const centerDates = [];
  const start = new Date(startDate);
  const totalDays = Math.max(1, parseInt(daysCount, 10));

  for (let offset = 0; offset < totalDays; offset += 7) {
    const d = new Date(start);
    d.setDate(d.getDate() + offset);
    centerDates.push(formatDate(d));
  }

  return centerDates;
}

/**
 * Scrapes SpiceJet flight fare observations for a specified ScrapeJob.
 * Uses Puppeteer to navigate to SpiceJet and execute lowfare API calls in the browser context.
 * 
 * @param {Object} job - { source, origin, destination, departureDate, days }
 * @returns {Promise<Array<Object>>} Normalized fare observations
 */
async function scrape(job = {}) {
  const origin = String(job.origin || "").trim().toUpperCase();
  const destination = String(job.destination || "").trim().toUpperCase();
  const departureDate = formatDate(job.departureDate || new Date());
  const daysCount = parseInt(job.days || 30, 10);
  const route = createRouteId(origin, destination);

  if (!origin || !destination || !route) {
    throw new Error(`Invalid route parameters for SpiceJet scraper: origin=${origin}, destination=${destination}`);
  }

  if (origin === destination) {
    throw new Error(`Origin and destination cannot be identical: ${origin}`);
  }

  const centerDates = calculateCenterDates(departureDate, daysCount);
  const timeout = parseInt(process.env.PUPPETEER_TIMEOUT, 10) || 40000;

  console.log(`[SPICEJET] Starting ${daysCount}-day lowfare scraper for ${origin} → ${destination} (${centerDates.length} windows starting ${departureDate})`);

  let browser = null;
  const rawObservations = [];

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--window-size=1440,900"
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.setUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    );
    await page.setDefaultNavigationTimeout(timeout);
    await page.setDefaultTimeout(timeout);

    const searchUrl = `https://www.spicejet.com/search?from=${origin}&to=${destination}&tripType=1&departure=${departureDate}&adult=1&child=0&srCitizen=0&infant=0&currency=INR&redirectTo=/`;

    console.log(`[SPICEJET] Initializing session via ${origin} → ${destination} search portal...`);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout }).catch((e) => {
      console.warn(`[SPICEJET] Navigation notice: ${e.message}`);
    });

    // Wait briefly for network/session initialization
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Execute lowfare API calls in page context
    console.log(`[SPICEJET] Fetching lowfare calendar data across ${centerDates.length} date windows...`);
    const apiPayloads = await page.evaluate(
      async (dates, orig, dest, token) => {
        const responses = [];
        for (const cDate of dates) {
          try {
            const res = await fetch("https://www.spicejet.com/api/v2/search/lowfare", {
              headers: {
                accept: "*/*",
                "accept-language": "en-US,en;q=0.9",
                authorization: token,
                "content-type": "application/json",
                os: "desktop"
              },
              referrer: window.location.href,
              body: JSON.stringify({
                pax: { journeyClass: "ff", adult: 1, child: 0, infant: 0, srCitizen: 0 },
                codes: { currency: "INR" },
                origin: orig,
                destination: dest,
                centerDate: cDate
              }),
              method: "POST",
              mode: "cors",
              credentials: "include"
            });

            if (res.ok) {
              const json = await res.json();
              if (json && json.data) {
                responses.push(json);
              }
            }
          } catch (fetchErr) {
            // Silently continue with next date window
          }
        }
        return responses;
      },
      centerDates,
      origin,
      destination,
      DEFAULT_AUTH_TOKEN
    );

    // Normalize all returned payloads
    for (const payload of apiPayloads) {
      const obs = normalizeApiResponse(payload, origin, destination, route);
      rawObservations.push(...obs);
    }

    // Deduplicate observations by departure date string (YYYY-MM-DD)
    const seenDates = new Set();
    const uniqueObservations = [];

    for (const obs of rawObservations) {
      const dateKey = formatDate(obs.departureDate);
      if (!seenDates.has(dateKey)) {
        seenDates.add(dateKey);
        uniqueObservations.push(obs);
      }
    }

    // Sort observations chronologically
    uniqueObservations.sort((a, b) => new Date(a.departureDate) - new Date(b.departureDate));

    console.log(`[SPICEJET] Successfully collected ${uniqueObservations.length} fare observations for ${origin} → ${destination}`);
    return uniqueObservations;

  } catch (err) {
    console.error(`[SPICEJET] Scraper error for ${origin} → ${destination}:`, err.message);
    throw err;
  } finally {
    if (browser) {
      await browser.close().catch(() => null);
    }
  }
}

/**
 * Converts observations into RouteFareSearch document format for MongoDB persistence.
 * 
 * @param {Array<Object>} observations
 * @param {string} origin
 * @param {string} destination
 * @param {Date|string} departureDate
 * @param {Object} options
 * @returns {Object} RouteFareSearch document
 */
function toRouteFareSearchDocument(observations, origin, destination, departureDate, options = {}) {
  const now = new Date();
  const expires = new Date(now.getTime() + (options.ttlMinutes || 60) * 60 * 1000);

  return {
    route: {
      origin: {
        airportCode: origin,
        type: "airport",
        description: `${origin} Airport`
      },
      destination: {
        airportCode: destination,
        type: "airport",
        description: `${destination} Airport`
      }
    },
    search: {
      departureDate: new Date(departureDate),
      returnDate: options.returnDate ? new Date(options.returnDate) : null,
      tripType: options.returnDate ? "round_trip" : "one_way",
      passengers: {
        adults: options.passengers?.adults || 1,
        children: options.passengers?.children || 0,
        infants: options.passengers?.infants || 0
      },
      cabinClass: options.cabinClass || "economy"
    },
    fares: observations.map((obs) => ({
      departureDate: obs.departureDate,
      returnDate: obs.returnDate,
      price: {
        base: obs.metadata?.base || 0,
        tax: obs.metadata?.tax || 0,
        total: obs.totalFare,
        currency: obs.currency || "INR"
      },
      source: {
        type: "airline",
        name: AIRLINE_NAME
      },
      scrapedAt: obs.scrapedAt || now
    })),
    source: {
      provider: AIRLINE_NAME,
      type: "airline",
      url: "https://www.spicejet.com",
      scraper: {
        name: SCRAPER_NAME,
        version: SCRAPER_VERSION
      }
    },
    dataQuality: {
      status: observations.length > 0 ? "verified" : "failed",
      scrapedAt: now,
      expiresAt: expires
    },
    createdAt: now,
    updatedAt: now
  };
}

module.exports = {
  scrape,
  normalizeApiResponse,
  calculateCenterDates,
  toRouteFareSearchDocument,
  AIRLINE_NAME,
  SCRAPER_NAME,
  SCRAPER_VERSION
};
