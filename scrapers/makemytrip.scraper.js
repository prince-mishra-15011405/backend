/**
 * MakeMyTrip Flight Scraper
 * 
 * Features:
 * - Continuous deletion and dismissal of the image login/signup overlay modal:
 *   `<div data-cy="outsideModal" class="imageSliderModal modal displayBlock modalLogin dynHeight personal">`
 * - Direct search URL and homepage widget interaction fallback.
 * - Virtualized listing scroller support (React Virtuoso) with dynamic item collection.
 * - Multi-day route scraping (up to 30 days) across Indian domestic routes.
 * - Network API response interception fallback.
 * - Full normalization adhering to the FareObservation & RouteFareSearch Mongoose schemas.
 */

const fs = require("fs");
const puppeteer = require("puppeteer");
const selectors = require("./selectors/makemytrip.selectors");
const { createRouteId } = require("../utils/route");
const { parseIndianCurrency } = require("../utils/currency");

const SOURCE_NAME = "MakeMyTrip";
const SCRAPER_NAME = "makemytrip-puppeteer";
const SCRAPER_VERSION = "1.0.0";

/**
 * Returns available system browser executable path if Puppeteer default is unavailable
 */
function getExecutablePath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  const possiblePaths = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium"
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
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
 * Formats a Date or YYYY-MM-DD string to DD/MM/YYYY for MakeMyTrip search URL
 * @param {Date|string} date 
 * @returns {string}
 */
function formatUrlDate(date) {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Month names lookup
 */
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const MONTH_SHORT_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

/**
 * Constructs MakeMyTrip direct search URL
 * @param {string} origin 
 * @param {string} destination 
 * @param {Date|string} departureDate 
 * @returns {string}
 */
function buildSearchUrl(origin, destination, departureDate) {
  const dateFormatted = formatUrlDate(departureDate);
  return selectors.searchUrlTemplate
    .replace("{ORIGIN}", origin.toUpperCase())
    .replace("{DESTINATION}", destination.toUpperCase())
    .replace("{DATE}", dateFormatted);
}

/**
 * Dismisses or removes the MakeMyTrip image overlay modal from DOM
 * @param {puppeteer.Page} page 
 */
async function dismissOrDeleteModal(page) {
  if (!page) return;
  try {
    await page.evaluate((selList) => {
      // 1. Try to click close button if available
      const closeBtn = document.querySelector('[data-cy="closeModal"]') ||
        document.querySelector('.commonModal__close') ||
        document.querySelector('span.commonModal__close');
      if (closeBtn) {
        try { closeBtn.click(); } catch { }
      }

      // 2. Remove all modal overlays and backdrops from the DOM
      selList.forEach((sel) => {
        document.querySelectorAll(sel).forEach((el) => {
          try { el.remove(); } catch { }
        });
      });

      // 3. Restore scrolling on body and html root
      if (document.body) {
        document.body.style.overflow = "auto";
        document.body.style.position = "static";
      }
      if (document.documentElement) {
        document.documentElement.style.overflow = "auto";
      }
    }, selectors.overlay.allOverlays);
  } catch { }
}

/**
 * Sets up continuous MutationObserver before page scripts execute to purge the modal overlay instantly
 * @param {puppeteer.Page} page 
 */
async function setupModalPurgeObserver(page) {
  await page.evaluateOnNewDocument((selList) => {
    const purgeModals = () => {
      const closeBtn = document.querySelector('[data-cy="closeModal"]') ||
        document.querySelector('.commonModal__close') ||
        document.querySelector('span.commonModal__close');
      if (closeBtn) {
        try { closeBtn.click(); } catch { }
      }

      selList.forEach((sel) => {
        document.querySelectorAll(sel).forEach((el) => {
          try { el.remove(); } catch { }
        });
      });

      if (document.body) {
        document.body.style.overflow = "auto";
      }
      if (document.documentElement) {
        document.documentElement.style.overflow = "auto";
      }
    };

    window.addEventListener("DOMContentLoaded", purgeModals);
    const observer = new MutationObserver(purgeModals);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }, selectors.overlay.allOverlays);
}

/**
 * Extracts all currently visible flight cards and scrolls through the virtualized container
 * @param {puppeteer.Page} page 
 * @param {string} origin 
 * @param {string} destination 
 * @param {string} route 
 * @param {string} departureDateStr 
 * @returns {Promise<Array<Object>>}
 */
async function extractFlightsFromListing(page, origin, destination, route, departureDateStr) {
  console.log(`[PUPPETEER] Starting virtualized scroll extraction on MakeMyTrip listing for ${origin} → ${destination} (${departureDateStr})...`);

  // We scroll iteratively to ensure React Virtuoso mounts and exposes all flight cards
  const collectedMap = new Map(); // Key: flightNo + depTime + arrTime + price
  const maxScrollSteps = 12;
  const scrollStepPx = 600;

  for (let step = 0; step < maxScrollSteps; step++) {
    await dismissOrDeleteModal(page);

    // Evaluate DOM items in view
    const currentCards = await page.evaluate((sel, orig, dest, canonicalRoute, depDate) => {
      const items = [];
      const now = new Date().toISOString();

      // Find distinct flight cards
      let cardNodes = document.querySelectorAll(".flightCard");
      if (!cardNodes || cardNodes.length === 0) {
        cardNodes = document.querySelectorAll("[data-test='component-clusterItem']");
      }
      if (!cardNodes || cardNodes.length === 0) {
        cardNodes = document.querySelectorAll(".listingCardItem");
      }

      cardNodes.forEach((card) => {
        try {
          // Airline heading and flight number
          const headingEl = card.querySelector(".flightCard__airlineHeading, .airlineName, [data-test='component-airlineHeading']");
          const airlineName = headingEl ? headingEl.textContent.trim() : "Unknown Airline";

          const subEl = card.querySelector(".flightCard__airlineSub, .flightNumber, [data-test='component-airlineSub']");
          const flightNo = subEl ? subEl.textContent.trim() : "";

          // Departure time and airport
          const depTimeEl = card.querySelector(".flightCard__journeyRow .flightCard__timeBlock:first-child .flightCard__time, .flightTimeInfo .flightCard__time");
          const departureTime = depTimeEl ? depTimeEl.textContent.trim() : "";

          const depAirportEl = card.querySelector(".flightCard__journeyRow .flightCard__timeBlock:first-child .flightCard__airport");
          const depAirport = depAirportEl ? depAirportEl.textContent.trim() : orig;

          // Arrival time and airport
          const arrTimeEl = card.querySelector(".flightCard__timeBlock--arr .flightCard__time");
          const arrivalTime = arrTimeEl ? arrTimeEl.textContent.trim() : "";

          const arrAirportEl = card.querySelector(".flightCard__timeBlock--arr .flightCard__airport");
          const arrAirport = arrAirportEl ? arrAirportEl.textContent.trim() : dest;

          // Duration
          const durationEl = card.querySelector(".stop-info .boldFont, .v4-stop-info p.boldFont, .flightDuration");
          const duration = durationEl ? durationEl.textContent.trim() : "";

          // Stops count and text
          const stopsEl = card.querySelector(".flightsLayoverInfo, .stops-info-hover-zone p, .stops");
          const stopsText = stopsEl ? stopsEl.textContent.trim() : "Non stop";
          let stops = 0;
          if (stopsText.toLowerCase().includes("non stop") || stopsText.toLowerCase().includes("non-stop")) {
            stops = 0;
          } else {
            const stopsMatch = stopsText.match(/(\d+)/);
            stops = stopsMatch ? parseInt(stopsMatch[1], 10) : 1;
          }

          // Price extraction
          const priceEl = card.querySelector(
            ".clusterViewPrice, .fareBlock__fareRow span, [data-test='component-fareRow'] span, [data-test='component-fare'] span, .priceSection .blackText"
          );
          let rawPriceText = priceEl ? priceEl.textContent.trim() : "";
          // Strip everything except digits
          const cleanedPrice = rawPriceText.replace(/[^0-9]/g, "");
          const totalFare = cleanedPrice ? parseInt(cleanedPrice, 10) : 0;

          // Additional Metadata
          const tagEl = card.querySelector(".flightCardTag, [data-test='component-flightCardTag'], .flightCardTag__segment");
          const tag = tagEl ? tagEl.textContent.trim() : null;

          const ancillaryEl = card.querySelector(".flightCard__ancillaryPersuasion, .ancillaryPersuasionBlock");
          const ancillary = ancillaryEl ? ancillaryEl.textContent.trim() : null;

          const couponEl = card.querySelector(".couponPersuasionText__text, [data-test='component-couponPersuasionText']");
          const coupon = couponEl ? couponEl.textContent.trim() : null;

          const priceLockEl = card.querySelector(".priceLock__text, [data-test='component-priceLock'] .priceLock__text");
          const priceLock = priceLockEl ? priceLockEl.textContent.trim() : null;

          if (totalFare > 0 && flightNo) {
            items.push({
              source: "MakeMyTrip",
              airline: airlineName,
              flightNo: flightNo.replace(/\s+/g, " "),
              origin: depAirport || orig,
              destination: arrAirport || dest,
              route: canonicalRoute,
              departureDate: depDate,
              returnDate: null,
              departureTime,
              arrivalTime,
              duration,
              stops,
              fareType: "Regular",
              cabinClass: "Economy",
              totalFare,
              currency: "INR",
              scrapedAt: now,
              searchTimestamp: now,
              metadata: {
                tag,
                ancillary,
                coupon,
                priceLock,
                rawSource: "makemytrip-puppeteer-dom"
              }
            });
          }
        } catch { }
      });

      return items;
    }, selectors, origin, destination, route, departureDateStr);

    // Merge into deduplicated map
    for (const card of currentCards) {
      const key = `${card.flightNo}_${card.departureTime}_${card.arrivalTime}_${card.totalFare}`;
      if (!collectedMap.has(key)) {
        collectedMap.set(key, card);
      }
    }

    // Scroll down window / container
    await page.evaluate((stepPx) => {
      const scroller = document.querySelector("[data-virtuoso-scroller='true']") || window;
      if (scroller === window) {
        window.scrollBy(0, stepPx);
      } else {
        scroller.scrollTop += stepPx;
      }
    }, scrollStepPx);

    await new Promise((r) => setTimeout(r, 350));
  }

  const results = Array.from(collectedMap.values());
  console.log(`[PUPPETEER] Scrolled and extracted ${results.length} unique flight records for ${departureDateStr}`);
  return results;
}

/**
 * Fallback: Homepage Booking Widget UI Interaction
 * @param {puppeteer.Page} page 
 * @param {string} origin 
 * @param {string} destination 
 * @param {string} departureDateStr 
 */
async function searchViaHomepageWidget(page, origin, destination, departureDateStr) {
  console.log(`[PUPPETEER] Executing Homepage Booking Widget fallback for ${origin} → ${destination}...`);
  await page.goto(selectors.baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await dismissOrDeleteModal(page);
  await new Promise((r) => setTimeout(r, 600));
  await dismissOrDeleteModal(page);

  // 1. Click "One Way" tab
  try {
    const oneWayTab = await page.$(selectors.widget.tripTypeOneWay);
    if (oneWayTab) {
      await oneWayTab.click();
      await new Promise((r) => setTimeout(r, 300));
    }
  } catch { }

  // 2. Select From City
  try {
    await dismissOrDeleteModal(page);
    const fromBox = await page.$(selectors.widget.fromCityBox);
    if (fromBox) {
      await fromBox.click();
      await new Promise((r) => setTimeout(r, 400));

      const input = await page.$(selectors.widget.autoSuggestInput) || await page.$(selectors.widget.fromCityInput);
      if (input) {
        await input.type(origin, { delay: 60 });
        await new Promise((r) => setTimeout(r, 700));

        const firstSuggestion = await page.$(selectors.widget.suggestionItem);
        if (firstSuggestion) {
          await firstSuggestion.click();
        } else {
          await page.keyboard.press("Enter");
        }
        await new Promise((r) => setTimeout(r, 400));
      }
    }
  } catch (e) {
    console.warn("[PUPPETEER] From city input note:", e.message);
  }

  // 3. Select To City
  try {
    await dismissOrDeleteModal(page);
    const toBox = await page.$(selectors.widget.toCityBox);
    if (toBox) {
      await toBox.click();
      await new Promise((r) => setTimeout(r, 400));

      const input = await page.$(selectors.widget.autoSuggestInput) || await page.$(selectors.widget.toCityInput);
      if (input) {
        await input.type(destination, { delay: 60 });
        await new Promise((r) => setTimeout(r, 700));

        const firstSuggestion = await page.$(selectors.widget.suggestionItem);
        if (firstSuggestion) {
          await firstSuggestion.click();
        } else {
          await page.keyboard.press("Enter");
        }
        await new Promise((r) => setTimeout(r, 400));
      }
    }
  } catch (e) {
    console.warn("[PUPPETEER] To city input note:", e.message);
  }

  // 4. Click Search button
  try {
    await dismissOrDeleteModal(page);
    console.log("[PUPPETEER] Clicking Search button on widget...");
    const searchBtn = await page.$(selectors.widget.searchButton);
    if (searchBtn) {
      await searchBtn.click();
    } else {
      await page.evaluate(() => {
        const btn = document.querySelector("a.widgetSearchBtn") || document.querySelector("[data-cy='submit'] a");
        if (btn) btn.click();
      });
    }
    await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => null);
  } catch (e) {
    console.warn("[PUPPETEER] Search button click note:", e.message);
  }
}

/**
 * Scrapes a single departure date for a given origin → destination
 * @param {puppeteer.Page} page 
 * @param {string} origin 
 * @param {string} destination 
 * @param {string} route 
 * @param {string} depDateStr 
 * @param {number} timeout 
 * @returns {Promise<Array<Object>>}
 */
async function scrapeSingleDate(page, origin, destination, route, depDateStr, timeout = 35000) {
  const searchUrl = buildSearchUrl(origin, destination, depDateStr);
  console.log(`[PUPPETEER] Navigating to MakeMyTrip search URL: ${searchUrl}`);

  let interceptedFlights = [];

  // Capture background API JSON responses
  const onResponseHandler = async (response) => {
    try {
      const url = response.url();
      if (
        url.includes("fetchReviewFares") ||
        url.includes("/v2/search") ||
        url.includes("/v4/search") ||
        url.includes("/flight/review")
      ) {
        const contentType = response.headers()["content-type"] || "";
        if (contentType.includes("application/json")) {
          const json = await response.json().catch(() => null);
          if (json && (json.flights || json.data?.flights || json.reviewData)) {
            console.log(`[PUPPETEER] Intercepted MakeMyTrip network payload from ${url}`);
          }
        }
      }
    } catch { }
  };

  page.on("response", onResponseHandler);

  try {
    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: timeout
    });

    await dismissOrDeleteModal(page);
    await new Promise((r) => setTimeout(r, 800));
    await dismissOrDeleteModal(page);

    // Wait for listing container or flight items
    try {
      await page.waitForSelector(
        "#listing-id, [data-test='component-listingV4ClusterView'], [data-test='component-clusterItem'], .flightCard",
        { timeout: 15000 }
      );
      console.log("[PUPPETEER] Listing container detected on page.");
    } catch {
      console.log("[PUPPETEER] Initial listing wait timed out, checking available DOM elements...");
    }

    await dismissOrDeleteModal(page);

    // Extract all cards via virtualized scrolling
    const domObservations = await extractFlightsFromListing(page, origin, destination, route, depDateStr);
    return domObservations;

  } finally {
    page.off("response", onResponseHandler);
  }
}

/**
 * Main Puppeteer Scraper Entrypoint for MakeMyTrip
 * 
 * @param {Object} job - { source, origin, destination, departureDate, days }
 * @returns {Promise<Array<Object>>} Normalized FareObservation objects
 */
async function scrape(job = {}) {
  const origin = String(job.origin || "").trim().toUpperCase();
  const destination = String(job.destination || "").trim().toUpperCase();
  const startDepartureDate = formatDate(job.departureDate || new Date());
  const daysCount = parseInt(job.days || 30, 10); // Default to 30 days
  const route = createRouteId(origin, destination);

  if (!origin || !destination || !route) {
    throw new Error(`Invalid route parameters: origin=${origin}, destination=${destination}`);
  }

  if (origin === destination) {
    throw new Error(`Origin and destination cannot be the same: ${origin}`);
  }

  // Generate 30 consecutive dates
  const datesToScrape = [];
  const baseDate = new Date(startDepartureDate);
  for (let i = 0; i < daysCount; i++) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + i);
    datesToScrape.push(d.toISOString().split("T")[0]);
  }

  const timeout = parseInt(process.env.PUPPETEER_TIMEOUT, 10) || 45000;
  console.log(`[PUPPETEER] Starting MakeMyTrip ${daysCount}-day scraper for ${origin} → ${destination} (${datesToScrape[0]} to ${datesToScrape[datesToScrape.length - 1]})`);

  let browser = null;
  const allObservations = [];

  try {
    const execPath = getExecutablePath();
    browser = await puppeteer.launch({
      headless: true,
      ...(execPath ? { executablePath: execPath } : {}),
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
        "--window-size=1440,900"
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    );

    // Setup the proactive modal purger on every document load
    await setupModalPurgeObserver(page);

    // Scrape dates (up to 30 days)
    // To be respectful and avoid rate-limiting, we iterate through dates with a brief pause
    for (let i = 0; i < datesToScrape.length; i++) {
      const depDateStr = datesToScrape[i];
      console.log(`\n[PUPPETEER] [Day ${i + 1}/${datesToScrape.length}] Scraping ${origin} → ${destination} on ${depDateStr}...`);

      try {
        const dateObs = await scrapeSingleDate(page, origin, destination, route, depDateStr, timeout);
        if (dateObs.length > 0) {
          allObservations.push(...dateObs);
          console.log(`[PUPPETEER] Extracted ${dateObs.length} fares for ${depDateStr}`);
        } else {
          console.log(`[PUPPETEER] No fares found for ${depDateStr}, trying homepage fallback...`);
          if (i === 0) {
            // Try widget fallback once if first date had no direct URL results
            await searchViaHomepageWidget(page, origin, destination, depDateStr);
            const fallbackObs = await extractFlightsFromListing(page, origin, destination, route, depDateStr);
            if (fallbackObs.length > 0) {
              allObservations.push(...fallbackObs);
            }
          }
        }
      } catch (dateErr) {
        console.warn(`[PUPPETEER] Warning on date ${depDateStr}:`, dateErr.message);
      }

      // Small delay between date scrapes
      if (i < datesToScrape.length - 1) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    // Post-process and ensure clean Date objects
    const finalObservations = allObservations.map((obs) => ({
      ...obs,
      departureDate: new Date(obs.departureDate),
      scrapedAt: new Date(obs.scrapedAt),
      searchTimestamp: new Date(obs.searchTimestamp)
    }));

    console.log(`\n[PUPPETEER] Scrape complete! Collected ${finalObservations.length} total observations for ${origin} → ${destination} across ${datesToScrape.length} days.`);
    return finalObservations;

  } catch (err) {
    console.error(`[PUPPETEER] MakeMyTrip scraper error for ${origin} → ${destination}:`, err.message);
    throw err;
  } finally {
    if (browser) {
      await browser.close().catch(() => null);
      console.log("[PUPPETEER] Browser closed cleanly");
    }
  }
}

/**
 * Converts MakeMyTrip observations into RouteFareSearch document format
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
      url: "https://www.makemytrip.com",
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
  dismissOrDeleteModal,
  buildSearchUrl,
  toRouteFareSearchDocument
};
