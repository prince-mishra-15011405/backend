/**
 * IRCTC Air Flight Scraper & Data Pipeline
 * 
 * Direct API extraction from IRCTC Air (POST https://www.air.irctc.co.in/airstqcNewUserTwo/air/search)
 * with legacy SSL renegotiation support, automatic city resolution, multi-day 30-day window scraping,
 * and full normalization into FareObservation and RouteFareSearch Mongoose schemas.
 */

const https = require("https");
const crypto = require("crypto");
const fs = require("fs");
const { createRouteId } = require("../utils/route");
const { parseIndianCurrency } = require("../utils/currency");
const citycodes = require("../data/citycode");

const SOURCE_NAME = "IRCTC Air";
const SCRAPER_NAME = "irctc-air-api";
const SCRAPER_VERSION = "1.0.0";
const ENDPOINT_URL = "https://www.air.irctc.co.in/airstqcNewUserTwo/air/search";

// Fast lookup map for airport code -> city name
const AIRPORT_CITY_MAP = new Map();
if (Array.isArray(citycodes)) {
  for (const c of citycodes) {
    if (c.airportCode && c.airportCity) {
      AIRPORT_CITY_MAP.set(c.airportCode.toUpperCase(), c.airportCity);
    }
  }
}

// Fallback lookup for major Indian metros
const METRO_FALLBACKS = {
  BOM: "Mumbai",
  DEL: "Delhi",
  BLR: "Bengaluru",
  HYD: "Hyderabad",
  MAA: "Chennai",
  CCU: "Kolkata",
  AMD: "Ahmedabad",
  PNQ: "Pune",
  GOI: "Goa",
  GOX: "Goa",
  COK: "Kochi",
  JAI: "Jaipur",
  LKO: "Lucknow",
  IXC: "Chandigarh",
  PAT: "Patna",
  GAU: "Guwahati",
  TRV: "Thiruvananthapuram",
  IXB: "Bagdogra",
  BBI: "Bhubaneswar",
  IDR: "Indore",
  NMI: "Navi Mumbai"
};

/**
 * Resolves city name from 3-letter IATA airport code
 * @param {string} airportCode 
 * @returns {string}
 */
function resolveCity(airportCode) {
  if (!airportCode) return "";
  const code = String(airportCode).trim().toUpperCase();
  return AIRPORT_CITY_MAP.get(code) || METRO_FALLBACKS[code] || code;
}

/**
 * Normalizes input date to YYYY-MM-DD string
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
 * Creates an HTTPS Agent compatible with IRCTC Air's SSL configuration.
 * (Enables legacy server connect options to prevent SSL renegotiation errors in Node.js 18+).
 */
function createHttpsAgent() {
  return new https.Agent({
    secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT || 0x00000004,
    rejectUnauthorized: false,
    keepAlive: true,
  });
}

/**
 * Executes a POST request to IRCTC Air API with custom headers and payload.
 * @param {string} urlStr 
 * @param {Object|string} payload 
 * @param {Object} customHeaders 
 * @returns {Promise<Object>}
 */
function postJson(urlStr, payload, customHeaders = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const bodyStr = typeof payload === "string" ? payload : JSON.stringify(payload);
    const agent = createHttpsAgent();

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: "POST",
      agent: agent,
      headers: {
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(bodyStr),
        "sec-ch-ua": '"Not=A?Brand";v="99", "Google Chrome";v="151", "Chromium";v="151"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        ...customHeaders,
      },
      timeout: 45000,
    };

    const req = https.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (err) {
            reject(new Error(`Failed to parse JSON response: ${err.message}`));
          }
        } else {
          reject(new Error(`Request failed with status ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on("timeout", () => {
      req.destroy(new Error("Request timed out after 45000ms"));
    });

    req.on("error", (err) => {
      reject(err);
    });

    req.write(bodyStr);
    req.end();
  });
}

/**
 * Normalizes raw IRCTC Air API JSON response into FareObservation-compatible objects.
 * 
 * @param {Object} apiResponse - Raw JSON payload from IRCTC Air search endpoint
 * @param {string} origin - Origin airport code (e.g. "BOM")
 * @param {string} destination - Destination airport code (e.g. "MAA")
 * @param {string} route - Canonical route identifier (e.g. "BOM-MAA")
 * @param {string|Date} departureDate - Departure date
 * @returns {Array<Object>} Normalized fare observations
 */
function normalizeApiResponse(apiResponse, origin, destination, route, departureDate) {
  if (!apiResponse || apiResponse.status !== "SUCCESS" || !apiResponse.data) {
    return [];
  }

  const rawFlights = apiResponse.data.flights || [];
  const observations = [];
  const now = new Date();
  const canonicalRoute = route || createRouteId(origin, destination);
  const depDateObj = new Date(departureDate);

  for (const item of rawFlights) {
    try {
      // Extract flight legs / segments
      const legs = (item.lstFlightDetails || []).map((leg) => ({
        origin: {
          airportCode: leg.origin || origin,
          airportName: leg.originAirportName || null,
          city: leg.originCity || null,
          terminal: leg.originTerminal || null,
          departureTime: leg.departureTime || null,
          departureDate: leg.departureDate || null,
        },
        destination: {
          airportCode: leg.destination || destination,
          airportName: leg.destinationAirportName || null,
          city: leg.destinationCity || null,
          terminal: leg.destinationTerminal || null,
          arrivalTime: leg.arrivalTime || null,
          arrivalDate: leg.arrivalDate || null,
        },
        flightTime: leg.flightTime || null,
        airline: leg.airline || item.carrierName || null,
        airlineCode: leg.airlineCode || item.carrier || null,
        flightNumber: leg.flightNumber || null,
        layover: leg.halt || leg.layover || null,
        isFreeMeal: Boolean(leg.isFreeMeal),
      }));

      // Extract baggage info
      const baggageInfo = {
        cabin: null,
        checkIn: null,
      };

      if (Array.isArray(item.lstBaggageDetails) && item.lstBaggageDetails.length > 0) {
        const bag = item.lstBaggageDetails[0];
        if (bag.cabinValue) {
          baggageInfo.cabin = `${bag.cabinValue} ${bag.isKg ? "kg" : "piece"}`;
        }
        if (bag.checkInValue) {
          baggageInfo.checkIn = `${bag.checkInValue} ${bag.isKg ? "kg" : "piece"}`;
        }
      }

      // Extract fare breakdown
      let baseFare = 0;
      let tax = 0;
      let rawPrice = item.price;
      let cancellationPenalty = null;

      if (Array.isArray(item.lstFareDetails) && item.lstFareDetails.length > 0) {
        const primaryFare = item.lstFareDetails.find((f) => f.baseType) || item.lstFareDetails[0];
        if (primaryFare) {
          baseFare = parseIndianCurrency(primaryFare.baseFare || 0);
          tax = parseIndianCurrency(primaryFare.tax || 0);
          if (primaryFare.total) {
            rawPrice = primaryFare.total;
          }
          cancellationPenalty = primaryFare.flightCancelPenalty || null;
        }
      }

      const totalFare = parseIndianCurrency(rawPrice);
      if (!totalFare || totalFare <= 0) continue;

      const firstLeg = legs[0];
      const lastLeg = legs[legs.length - 1];

      // Airline name and full flight number
      const airlineName = item.carrierName || firstLeg?.airline || "Unknown Airline";
      const airlineCode = item.carrier || firstLeg?.airlineCode || "";
      const rawFlightNo = item.flightNumber || firstLeg?.flightNumber || "";
      const flightNumber = rawFlightNo
        ? (airlineCode && !rawFlightNo.includes(airlineCode) ? `${airlineCode}-${rawFlightNo}` : rawFlightNo)
        : airlineCode || "IRCTC";

      const depTime = item.departureTime || firstLeg?.origin?.departureTime || "";
      const arrTime = item.arrivalTime || lastLeg?.destination?.arrivalTime || "";
      const depAirport = item.departureCityWithCode || firstLeg?.origin?.airportCode || origin;
      const arrAirport = item.arrivalCityWithCode || lastLeg?.destination?.airportCode || destination;
      const duration = item.duration || "";
      const stops = typeof item.stops === "number" ? item.stops : Math.max(0, legs.length - 1);
      const cabinClass = item.classOfTravel || "Economy";
      const fareType = item.fareType || "Regular";

      observations.push({
        source: SOURCE_NAME,
        airline: airlineName,
        flightNo: flightNumber,
        origin: depAirport.toUpperCase(),
        destination: arrAirport.toUpperCase(),
        route: canonicalRoute,
        departureDate: depDateObj,
        returnDate: null,
        departureTime: depTime,
        arrivalTime: arrTime,
        duration: duration,
        stops: stops,
        fareType: fareType,
        cabinClass: cabinClass,
        totalFare: totalFare,
        currency: "INR",
        scrapedAt: now,
        searchTimestamp: now,
        metadata: {
          base: baseFare,
          tax: tax,
          baggage: baggageInfo,
          isFreeMeal: Boolean(item.isFreeMeal),
          cancellationPenalty: cancellationPenalty,
          departureAirportName: item.originAirportName || firstLeg?.origin?.airportName,
          arrivalAirportName: item.destinationAirportName || lastLeg?.destination?.airportName,
          segments: legs,
          key: item.key || null,
          rawSource: "irctc-air-api"
        }
      });
    } catch { }
  }

  return observations;
}

/**
 * Searches a single route on a single date via IRCTC Air API
 * @param {Object} params - { origin, destination, originCity, destinationCity, departureDate, classOfTravel, adults }
 * @returns {Promise<Array<Object>>}
 */
async function searchSingleDate({
  origin,
  destination,
  originCity,
  destinationCity,
  departureDate,
  classOfTravel = "Economy",
  adults = 1,
  children = 0,
  infants = 0
}) {
  const cleanOrigin = origin.toUpperCase();
  const cleanDest = destination.toUpperCase();
  const origCity = originCity || resolveCity(cleanOrigin);
  const destCity = destinationCity || resolveCity(cleanDest);
  const formattedDate = formatDate(departureDate);
  const sessionId = Date.now().toString();

  const referrerUrl =
    `https://www.air.irctc.co.in/onewaytrip?type=O` +
    `&origin=${cleanOrigin}&originCity=${encodeURIComponent(origCity)}&originCountry=IN` +
    `&destination=${cleanDest}&destinationCity=${encodeURIComponent(destCity)}&destinationCountry=IN` +
    `&flight_depart_date=${formattedDate}&ADT=${adults}&CHD=${children}&INF=${infants}` +
    `&class=${classOfTravel}&airlines=&ltc=0&searchtype=&isDefence=0&isSeniorCitizen=0&isStudent=0&bookingCategory=0&eType=0`;

  const payload = {
    tripType: "O",
    departureDate: formattedDate,
    returnDate: "",
    noOfAdults: String(adults),
    noOfChildren: String(children),
    noOfInfants: String(infants),
    origin: cleanOrigin,
    destination: cleanDest,
    destinationCity: destCity,
    originCity: origCity,
    classOfTravel: classOfTravel,
    airline: "",
    src: "web",
    appType: null,
    appTypeTxnId: null,
    searchType: null,
    isDefence: false,
    originCountry: "IN",
    destinationCountry: "IN",
    isSeniorCitizen: false,
    isStudent: false,
    bookingCategory: "0",
    eType: "0",
    ltc: false,
  };

  const rawResponse = await postJson(ENDPOINT_URL, payload, {
    "sessionid": sessionId,
    "Referer": referrerUrl,
  });

  const route = createRouteId(cleanOrigin, cleanDest);
  return normalizeApiResponse(rawResponse, cleanOrigin, cleanDest, route, formattedDate);
}

/**
 * Main Scraper Function for IRCTC Air
 * Supports multi-day (up to 30 days) route scraping across Indian domestic routes.
 * 
 * @param {Object} job - { source, origin, destination, departureDate, days, cabinClass }
 * @returns {Promise<Array<Object>>} Normalized FareObservation array
 */
async function scrape(job = {}) {
  const origin = String(job.origin || "").trim().toUpperCase();
  const destination = String(job.destination || "").trim().toUpperCase();
  const startDepartureDate = formatDate(job.departureDate || new Date());
  const daysCount = parseInt(job.days || 30, 10);
  const route = createRouteId(origin, destination);
  const cabinClass = job.cabinClass || "Economy";

  if (!origin || !destination || !route) {
    throw new Error(`Invalid route parameters: origin=${origin}, destination=${destination}`);
  }

  if (origin === destination) {
    throw new Error(`Origin and destination cannot be the same: ${origin}`);
  }

  const originCity = job.originCity || resolveCity(origin);
  const destinationCity = job.destinationCity || resolveCity(destination);

  // Generate date array
  const datesToScrape = [];
  const baseDate = new Date(startDepartureDate);
  for (let i = 0; i < daysCount; i++) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + i);
    datesToScrape.push(d.toISOString().split("T")[0]);
  }

  console.log(`\n========================================`);
  console.log(`[IRCTC] Starting IRCTC Air ${daysCount}-day scraper: ${origin} (${originCity}) → ${destination} (${destinationCity})`);
  console.log(`[IRCTC] Date Window: ${datesToScrape[0]} to ${datesToScrape[datesToScrape.length - 1]}`);
  console.log(`========================================\n`);

  const allObservations = [];
  const chunkSize = 2; // Fetch 2 dates concurrently to avoid overwhelming IRCTC backend

  for (let i = 0; i < datesToScrape.length; i += chunkSize) {
    const chunk = datesToScrape.slice(i, i + chunkSize);
    const promises = chunk.map(async (depDate) => {
      try {
        console.log(`[IRCTC] Fetching flights for ${origin} → ${destination} on ${depDate}...`);
        const obsList = await searchSingleDate({
          origin,
          destination,
          originCity,
          destinationCity,
          departureDate: depDate,
          classOfTravel: cabinClass,
          adults: job.adults || 1,
        });

        console.log(`[IRCTC] Received ${obsList.length} flights for ${depDate}`);
        return obsList;
      } catch (err) {
        console.warn(`[IRCTC] Notice on ${depDate}: ${err.message}`);
        return [];
      }
    });

    const chunkResults = await Promise.all(promises);
    for (const res of chunkResults) {
      allObservations.push(...res);
    }

    if (i + chunkSize < datesToScrape.length) {
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  console.log(`\n[IRCTC] Scraping complete! Collected ${allObservations.length} total observations across ${datesToScrape.length} days.`);
  return allObservations;
}

/**
 * Converts IRCTC Air observations into RouteFareSearch document format
 * @param {Array<Object>} observations 
 * @param {string} origin 
 * @param {string} destination 
 * @param {Date|string} departureDate 
 * @param {Object} options 
 * @returns {Object}
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
        currency: obs.currency
      },
      source: {
        type: "ota",
        name: obs.airline || SOURCE_NAME
      },
      scrapedAt: obs.scrapedAt
    })),
    source: {
      provider: SOURCE_NAME,
      type: "ota",
      url: "https://www.air.irctc.co.in",
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

// Standalone CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const orig = args[0] || "BOM";
  const dest = args[1] || "MAA";
  const date = args[2] || "2026-09-05";
  const days = parseInt(args[3] || 1, 10);

  scrape({
    origin: orig,
    destination: dest,
    departureDate: date,
    days: days
  })
    .then((flights) => {
      console.log(`\nSample First 2 Extracted Records:`);
      console.log(JSON.stringify(flights.slice(0, 2), null, 2));
    })
    .catch((err) => {
      console.error("Execution failed:", err.message);
      process.exit(1);
    });
}

module.exports = {
  scrape,
  scrapeIrctcFlights: scrape, // Backwards-compatible alias
  normalizeApiResponse,
  searchSingleDate,
  resolveCity,
  toRouteFareSearchDocument
};
