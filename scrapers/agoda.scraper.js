/**
 * Agoda Direct Flights BFF API Scraper
 * 
 * Extracts real-time daily flight fares across Indian domestic routes
 * directly via Agoda's BFF search API (POST https://www.agoda.com/api/flights-bff/search/v1/flights)
 * and normalizes the data into the FareObservation and RouteFareSearch schemas.
 */

const crypto = require("crypto");
const { createRouteId } = require("../utils/route");
const { parseIndianCurrency } = require("../utils/currency");

const SOURCE_NAME = "Agoda";
const SCRAPER_NAME = "agoda-flights-bff-api";
const SCRAPER_VERSION = "1.0.0";
const API_URL = "https://www.agoda.com/api/flights-bff/search/v1/flights";

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
 * Executes direct HTTP POST request to Agoda Flights BFF API with auto-polling support
 * @param {Object} params - { from, to, departureDate, adults, children, infants, cabin, maxAttempts }
 * @returns {Promise<Object>}
 */
async function searchFlights({
  from,
  to,
  departureDate,
  adults = 1,
  children = 0,
  infants = 0,
  cabin = "Economy",
  maxAttempts = 5
}) {
  const requestId = crypto.randomUUID();
  const pollingId = crypto.randomUUID();

  let pollingCount = 3;
  let pollingToken = null;
  let delayMs = 1500;
  let lastResponse = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const body = {
      pagination: {
        page: 1,
      },
      polling: {
        count: pollingCount,
      },
      searchCriteria: {
        passengers: {
          adult: adults,
          child: children,
          infant: infants,
        },
        trip: {
          outboundSlice: {
            origin: [
              {
                code: from.toUpperCase(),
                type: "Airport",
              },
            ],
            destination: [
              {
                code: to.toUpperCase(),
                type: "Airport",
              },
            ],
            departureDate,
            sliceFilter: {
              cabinClasses: [],
              carrier: {
                exclude: [],
                preferred: [],
              },
            },
          },
          slices: [
            {
              origin: [
                {
                  code: from.toUpperCase(),
                  type: "Airport",
                },
              ],
              destination: [
                {
                  code: to.toUpperCase(),
                  type: "Airport",
                },
              ],
              departureDate,
              sliceFilter: {
                cabinClasses: [],
                carrier: {
                  exclude: [],
                  preferred: [],
                },
              },
            },
          ],
          itineraryFilter: {
            hackerFareEnabled: true,
            cabinClass: cabin,
          },
          sort: {
            sortBy: "Best",
          },
          preferredBundleIds: [],
          ...(pollingToken ? { pollingToken } : {})
        },
      },
      whitelabelContext: {
        programId: "",
        aid: "82361",
      },
      ...(pollingToken ? { pollingToken } : {})
    };

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        accept: "*/*",
        "accept-language": "en-US,en;q=0.9",
        "ag-bff-currency": "INR",
        "ag-bff-flights-features": "MigrateBookingUrlFormat:on",
        "ag-bff-polling-id": pollingId,
        "ag-bff-screen-size-class": "Desktop",
        "ag-cid": "1922885",
        "ag-language-id": "1",
        "ag-language-locale": "en-in",
        "ag-request-attempt": String(attempt),
        "ag-request-id": requestId,
        "content-type": "text/plain",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `Agoda API returned ${response.status}: ${response.statusText} - ${errorText.slice(0, 200)}`
      );
    }

    const json = await response.json();
    lastResponse = json;

    const items = json?.data?.response?.content?.items || [];
    const isCompleted = json?.data?.polling?.completed;
    pollingToken = json?.data?.response?.content?.pollingToken || pollingToken;
    delayMs = json?.data?.polling?.delayMs || 1500;
    pollingCount = (json?.data?.polling?.count || pollingCount) + 1;

    // If flights found or search is complete, return immediately
    if (items.length > 0) {
      return json;
    }

    if (isCompleted && items.length === 0) {
      return json;
    }

    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, Math.min(delayMs, 2500)));
    }
  }

  return lastResponse || {};
}

/**
 * Normalizes Agoda raw API JSON response into FareObservation-compatible objects
 * @param {Object} response 
 * @param {string} origin 
 * @param {string} destination 
 * @param {string} route 
 * @param {string} departureDateStr 
 * @returns {Array<Object>}
 */
function normalizeApiResponse(response, origin, destination, route, departureDateStr) {
  const items = response?.data?.response?.content?.items || [];
  const observations = [];
  const now = new Date();

  for (const item of items) {
    try {
      const slice = item?.slice;
      const segment = slice?.segments?.[0];
      if (!segment) continue;

      const rawPrice =
        item?.price?.priceAfterDiscount?.amount ??
        item?.totalPrice?.priceAfterDiscount?.amount ??
        item?.price?.amount;

      const totalFare = parseIndianCurrency(rawPrice);
      if (!totalFare || totalFare <= 0) continue;

      const airlineName = segment.airline?.name || segment.airline?.code || "Unknown Airline";
      const airlineCode = segment.airline?.code || "";
      const flightNumber = segment.flightNumber ? `${airlineCode ? airlineCode + "-" : ""}${segment.flightNumber}` : "";

      const depAirport = segment.departure?.airport?.code || origin;
      const arrAirport = segment.arrival?.airport?.code || destination;
      const depTime = segment.departure?.time || "";
      const arrTime = segment.arrival?.time || "";
      const duration = segment.duration || "";
      const cabin = segment.cabinClass || "Economy";
      const stops = Math.max(0, (slice?.segments?.length || 1) - 1);

      const badges = item.badges?.map((x) => x.text) || [];
      const features = segment.featureIcons?.items?.map((x) => x.text) || [];

      observations.push({
        source: SOURCE_NAME,
        airline: airlineName,
        flightNo: flightNumber,
        origin: depAirport.toUpperCase(),
        destination: arrAirport.toUpperCase(),
        route: route || createRouteId(depAirport, arrAirport),
        departureDate: new Date(departureDateStr),
        returnDate: null,
        departureTime: depTime,
        arrivalTime: arrTime,
        duration,
        stops,
        fareType: "Regular",
        cabinClass: cabin,
        totalFare,
        currency: "INR",
        scrapedAt: now,
        searchTimestamp: now,
        metadata: {
          bundleId: item.bundleRefId,
          itineraryId: item.itineraryInfo?.itineraryId || null,
          badges,
          features,
          departureAirportName: segment.departure?.airport?.name,
          arrivalAirportName: segment.arrival?.airport?.name,
          rawSource: "agoda-flights-bff-api"
        }
      });
    } catch { }
  }

  return observations;
}

/**
 * Main Scrape Function for Agoda
 * Supports multi-day (up to 30 days) route scraping.
 * 
 * @param {Object} job - { source, origin, destination, departureDate, days }
 * @returns {Promise<Array<Object>>} Normalized FareObservation array
 */
async function scrape(job = {}) {
  const origin = String(job.origin || "").trim().toUpperCase();
  const destination = String(job.destination || "").trim().toUpperCase();
  const startDepartureDate = formatDate(job.departureDate || new Date());
  const daysCount = parseInt(job.days || 30, 10);
  const route = createRouteId(origin, destination);

  if (!origin || !destination || !route) {
    throw new Error(`Invalid route parameters: origin=${origin}, destination=${destination}`);
  }

  if (origin === destination) {
    throw new Error(`Origin and destination cannot be the same: ${origin}`);
  }

  // Generate date range
  const datesToScrape = [];
  const baseDate = new Date(startDepartureDate);
  for (let i = 0; i < daysCount; i++) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + i);
    datesToScrape.push(d.toISOString().split("T")[0]);
  }

  console.log(`[AGODA] Starting Agoda ${daysCount}-day scraper for ${origin} → ${destination} (${datesToScrape[0]} to ${datesToScrape[datesToScrape.length - 1]})`);

  const allObservations = [];
  const chunkSize = 3; // Fetch 3 dates concurrently to respect rate limits

  for (let i = 0; i < datesToScrape.length; i += chunkSize) {
    const chunk = datesToScrape.slice(i, i + chunkSize);
    const promises = chunk.map(async (depDate) => {
      try {
        console.log(`[AGODA] Fetching ${origin} → ${destination} for ${depDate}...`);
        const json = await searchFlights({
          from: origin,
          to: destination,
          departureDate: depDate,
          adults: 1,
        });

        const obsList = normalizeApiResponse(json, origin, destination, route, depDate);
        console.log(`[AGODA] Received ${obsList.length} flights for ${depDate}`);
        return obsList;
      } catch (err) {
        console.warn(`[AGODA] Notice for ${depDate}:`, err.message);
        return [];
      }
    });

    const chunkResults = await Promise.all(promises);
    for (const res of chunkResults) {
      allObservations.push(...res);
    }

    if (i + chunkSize < datesToScrape.length) {
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  console.log(`[AGODA] Completed! Total observations collected: ${allObservations.length} across ${datesToScrape.length} days.`);
  return allObservations;
}

/**
 * Converts Agoda observations into RouteFareSearch document format
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
      url: "https://www.agoda.com",
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
  searchFlights,
  normalizeApiResponse,
  toRouteFareSearchDocument
};
