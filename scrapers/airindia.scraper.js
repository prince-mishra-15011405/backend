/**
 * Air India Scraper
 * Combines direct authenticated browser session API fetch with Angular UI Puppeteer automation:
 * - Direct in-browser Fetch: POST https://api.airindia.com/airline-fares/v1/search
 *   using subscription key "8ea658f3ac1e44cca129d7ed252d4c42" returning up to 60-day calendar fares
 * - OneTrust continuous cookie deletion & DOM cleanup via MutationObserver
 * - Angular UI booking widget & Date Picker automation fallback (<ai-bookingwidget>, <ai-date-picker>)
 * - Flight listing DOM extraction fallback (<ai-pb-flight-item-listing>)
 */

const puppeteer = require("puppeteer");
const selectors = require("./selectors/airindia.selectors");
const { createRouteId } = require("../utils/route");
const { parseIndianCurrency } = require("../utils/currency");

const AIRLINE_NAME = "Air India";
const SCRAPER_NAME = "airindia-puppeteer";
const SCRAPER_VERSION = "2.3.0";
const API_SUBSCRIPTION_KEY = "8ea658f3ac1e44cca129d7ed252d4c42";

/**
 * Normalizes input date to YYYY-MM-DD string
 */
function formatDate(date) {
  const d = new Date(date);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${date}`);
  }
  return d.toISOString().split("T")[0];
}

/**
 * Month names lookup
 */
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

/**
 * Normalizes API JSON response from airline-fares/v1/search
 */
function normalizeApiResponse(data, origin, destination, route, requestedDepartureDate) {
  const observations = [];
  const now = new Date();
  if (!data) return observations;

  const fareList = data.data?.fares || data.fares || (Array.isArray(data) ? data : []);

  for (const item of fareList) {
    const depDateStr = item.departureDate || requestedDepartureDate;
    const retDateStr = item.returnDate || null;

    const baseVal = parseIndianCurrency(item.totalPrice?.base || item.base || 0);
    const taxVal = parseIndianCurrency(item.totalPrice?.tax || item.tax || 0);
    const totalVal = parseIndianCurrency(item.totalPrice?.total || item.total || item.price || (baseVal + taxVal));
    const currency = item.totalPrice?.currency || item.currency || "INR";
    const priceLabel = item.totalPrice?.priceLabel || null;

    if (!totalVal || totalVal <= 0) continue;

    observations.push({
      source: AIRLINE_NAME,
      airline: AIRLINE_NAME,
      flightNo: "AI",
      origin: data.data?.origin?.airportCode || origin,
      destination: data.data?.destination?.airportCode || destination,
      route,
      departureDate: new Date(depDateStr),
      returnDate: retDateStr ? new Date(retDateStr) : null,
      departureTime: "",
      arrivalTime: "",
      duration: "",
      stops: 0,
      fareType: "Economy",
      cabinClass: "Economy",
      totalFare: totalVal,
      currency,
      scrapedAt: now,
      searchTimestamp: now,
      metadata: {
        base: baseVal,
        tax: taxVal,
        priceLabel,
        rawSource: "airindia-api-v1"
      }
    });
  }

  return observations;
}

/**
 * Main Puppeteer Scrape Function
 *
 * @param {Object} job - { source, origin, destination, departureDate, cabinClass }
 * @returns {Promise<Array<Object>>} Normalized fare observations
 */
async function scrape(job = {}) {
  const origin = String(job.origin || "").trim().toUpperCase();
  const destination = String(job.destination || "").trim().toUpperCase();
  const departureDate = formatDate(job.departureDate || new Date());
  const daysCount = parseInt(job.days || 30, 10); // Defaults to 30 days
  const route = createRouteId(origin, destination);

  if (!origin || !destination || !route) {
    throw new Error(`Invalid route parameters: origin=${origin}, destination=${destination}`);
  }

  if (origin === destination) {
    throw new Error(`Origin and destination cannot be the same: ${origin}`);
  }

  // Generate array of consecutive departure dates for the requested duration (default 30 days)
  const datesToScrape = [];
  const baseDate = new Date(departureDate);
  for (let i = 0; i < daysCount; i++) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + i);
    datesToScrape.push(d.toISOString().split("T")[0]);
  }

  const timeout = parseInt(process.env.PUPPETEER_TIMEOUT, 10) || 45000;
  const isHeadless = process.env.PUPPETEER_HEADLESS === "true";

  console.log(`[PUPPETEER] Starting Air India ${daysCount}-day scraper for ${origin} → ${destination} (${datesToScrape[0]} to ${datesToScrape[datesToScrape.length - 1]})`);

  let browser = null;
  let interceptedData = null;

  try {
    browser = await puppeteer.launch({
      headless: true,
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
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    );

    // Continuous Cookie Deletion: MutationObserver before page scripts execute
    await page.evaluateOnNewDocument(() => {
      const purgeCookies = () => {
        const overlaySelectors = [
          "#onetrust-consent-sdk",
          "#onetrust-banner-sdk",
          "#onetrust-pc-sdk",
          ".onetrust-pc-dark-filter",
          ".ot-fade-in",
          ".ot-sdk-container",
          ".ot-pc-dark-filter",
          "#onetrust-group-container"
        ];
        overlaySelectors.forEach((sel) => {
          document.querySelectorAll(sel).forEach((el) => {
            try { el.remove(); } catch { }
          });
        });
        if (document.body) document.body.style.overflow = "auto";
        if (document.documentElement) document.documentElement.style.overflow = "auto";
      };

      window.addEventListener("DOMContentLoaded", purgeCookies);
      const observer = new MutationObserver(purgeCookies);
      observer.observe(document.documentElement, { childList: true, subtree: true });
    });

    // Helper: Explicit Cookie Purge
    async function dismissOrDeleteCookies() {
      try {
        await page.evaluate(() => {
          const overlaySelectors = [
            "#onetrust-consent-sdk",
            "#onetrust-banner-sdk",
            "#onetrust-pc-sdk",
            ".onetrust-pc-dark-filter",
            ".ot-fade-in",
            ".ot-sdk-container",
            ".ot-pc-dark-filter"
          ];
          overlaySelectors.forEach((sel) => {
            document.querySelectorAll(sel).forEach((el) => {
              try { el.remove(); } catch { }
            });
          });
          if (document.body) document.body.style.overflow = "auto";
          if (document.documentElement) document.documentElement.style.overflow = "auto";
        });
      } catch { }
    }

    // Intercept background API responses
    page.on("response", async (response) => {
      try {
        const url = response.url();
        if (url.includes("airline-fares/v1/search") || url.includes("/search-flight") || url.includes("/ibe/flight-search")) {
          const contentType = response.headers()["content-type"] || "";
          if (contentType.includes("application/json")) {
            const json = await response.json().catch(() => null);
            if (json && (json.data?.fares || json.fares || json.flights)) {
              interceptedData = json;
              console.log("[PUPPETEER] Captured live Air India API payload from network stream");
            }
          }
        }
      } catch { }
    });

    console.log(`[PUPPETEER] Navigating to ${selectors.baseUrl}...`);
    await page.goto(selectors.baseUrl, {
      waitUntil: "domcontentloaded",
      timeout: timeout
    });

    await dismissOrDeleteCookies();
    await new Promise((r) => setTimeout(r, 600));
    await dismissOrDeleteCookies();

    // =========================================================================
    // Primary Strategy: Execute in-browser API fetch for 30-day window
    // =========================================================================
    console.log(`[PUPPETEER] Executing in-browser search fetch to https://api.airindia.com/airline-fares/v1/search for ${datesToScrape.length}-day window...`);
    const apiResult = await page.evaluate(async (orig, dest, datesArr, subKey) => {
      try {
        const results = [];
        const chunkSize = 5; // Fetch in chunks of 5 dates concurrently
        for (let i = 0; i < datesArr.length; i += chunkSize) {
          const chunk = datesArr.slice(i, i + chunkSize);
          const chunkPromises = chunk.map(async (depDate) => {
            try {
              const payload = {
                classType: "ECONOMY",
                concessionType: null,
                itinerary: {
                  origin: orig,
                  destination: dest,
                  departureDate: depDate,
                  returnDate: null,
                  originCountryCode: "IN"
                },
                tripInfo: {
                  duration: 1,
                  range: 30,
                  durationFlexibility: 30
                }
              };

              const response = await fetch("https://api.airindia.com/airline-fares/v1/search", {
                headers: {
                  "accept": "application/json, text/plain, */*",
                  "accept-language": "en-US,en;q=0.9,hi;q=0.8,ru;q=0.7,et;q=0.6",
                  "content-type": "application/json",
                  "ocp-apim-subscription-key": subKey,
                  "priority": "u=1, i",
                  "sec-ch-ua": '"Not=A?Brand";v="99", "Google Chrome";v="151", "Chromium";v="151"',
                  "sec-ch-ua-mobile": "?0",
                  "sec-ch-ua-platform": '"Linux"',
                  "sec-fetch-dest": "empty",
                  "sec-fetch-mode": "cors",
                  "sec-fetch-site": "same-site"
                },
                referrer: "https://www.airindia.com/",
                body: JSON.stringify(payload),
                method: "POST",
                mode: "cors",
                credentials: "omit"
              });

              if (response.ok) {
                const json = await response.json();
                return { departureDate: depDate, success: true, data: json };
              } else {
                return { departureDate: depDate, success: false, status: response.status, statusText: response.statusText };
              }
            } catch (fetchErr) {
              return { departureDate: depDate, success: false, error: fetchErr.message };
            }
          });

          const chunkResults = await Promise.all(chunkPromises);
          results.push(...chunkResults);
        }
        return { success: true, results };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }, origin, destination, datesToScrape, API_SUBSCRIPTION_KEY);

    if (apiResult && apiResult.success && Array.isArray(apiResult.results)) {
      const allObservations = [];
      for (const resItem of apiResult.results) {
        if (resItem.success && resItem.data) {
          const obsList = normalizeApiResponse(resItem.data, origin, destination, route, resItem.departureDate);
          allObservations.push(...obsList);
        }
      }

      if (allObservations.length > 0) {
        console.log(`[PUPPETEER] In-browser API fetch succeeded! Parsed ${allObservations.length} fare observations across ${datesToScrape.length}-day window`);
        return allObservations;
      }
    } else {
      console.log(`[PUPPETEER] API fetch response: ${apiResult?.error || "Empty"}, falling back to UI automation...`);
    }

    // =========================================================================
    // Fallback Strategy: Angular UI Interaction & Date Picker Modal Flow
    // =========================================================================
    try {
      await page.waitForSelector(selectors.widget.container, { timeout: 10000 });
    } catch {
      console.log("[PUPPETEER] Booking widget container wait concluded...");
    }

    await dismissOrDeleteCookies();

    // Step 1: Select "One Way" radio option on homepage
    try {
      const oneWayRadio = await page.$(selectors.widget.tripTypeOneWayRadio);
      if (oneWayRadio) {
        await oneWayRadio.click();
        await new Promise((r) => setTimeout(r, 300));
      }
    } catch { }

    // Step 2: Fill Origin (From)
    try {
      await dismissOrDeleteCookies();
      const originInput = await page.$(selectors.widget.originInput);
      if (originInput) {
        await originInput.click({ clickCount: 3 });
        await originInput.type(origin, { delay: 80 });
        await new Promise((r) => setTimeout(r, 600));

        const autoOption = await page.$(selectors.widget.autocompleteOption);
        if (autoOption) {
          await autoOption.click();
        } else {
          await page.keyboard.press("Enter");
        }
        await new Promise((r) => setTimeout(r, 400));
      }
    } catch (e) {
      console.warn("[PUPPETEER] Notice on origin input:", e.message);
    }

    // Step 3: Fill Destination (To)
    try {
      await dismissOrDeleteCookies();
      const destInput = await page.$(selectors.widget.destinationInput);
      if (destInput) {
        await destInput.click({ clickCount: 3 });
        await destInput.type(destination, { delay: 80 });
        await new Promise((r) => setTimeout(r, 600));

        const autoOption = await page.$(selectors.widget.autocompleteOption);
        if (autoOption) {
          await autoOption.click();
        } else {
          await page.keyboard.press("Enter");
        }
        await new Promise((r) => setTimeout(r, 400));
      }
    } catch (e) {
      console.warn("[PUPPETEER] Notice on destination input:", e.message);
    }

    // Step 4: Open Date Picker, Tick One Way, Wait, Select Date & Confirm
    try {
      await dismissOrDeleteCookies();
      console.log("[PUPPETEER] Clicking Date field on booking widget to open Date Picker...");

      let dateOpened = false;
      const dateEl = await page.$(selectors.widget.dateSectionButton);
      if (dateEl) {
        await dateEl.click();
        dateOpened = true;
      } else {
        dateOpened = await page.evaluate((sel) => {
          const btn = document.querySelector(sel.widget.dateSectionButton) ||
            document.querySelector(".ai-booking-widget__date-section") ||
            document.querySelector("button[aria-label='Open date picker']");
          if (btn) {
            btn.click();
            return true;
          }
          return false;
        }, selectors);
      }

      await new Promise((r) => setTimeout(r, 1000));
      await dismissOrDeleteCookies();

      // Wait for date picker modal container (<ai-date-picker>)
      await page.waitForSelector("ai-date-picker, .ai-date-picker", { timeout: 8000 }).catch(() => null);
      await dismissOrDeleteCookies();

      // 4a. Check "One Way" checkbox inside Date Picker
      try {
        console.log("[PUPPETEER] Checking One Way checkbox in Date Picker...");
        await page.evaluate((sel) => {
          const input = document.querySelector(sel.datePicker.oneWayCheckboxInput) || document.querySelector("#mat-mdc-checkbox-0-input");
          const label = document.querySelector('label[for="mat-mdc-checkbox-0-input"]') ||
            document.querySelector('.ai-date-picker__header-oneway-checkbox') ||
            document.querySelector('mat-checkbox[name="isOneWay"]');

          if (input && !input.checked) {
            if (label) {
              label.click();
            } else {
              input.click();
            }
          } else if (label && (!input || !input.checked)) {
            label.click();
          }
        }, selectors);

        console.log("[PUPPETEER] Ticked One Way checkbox in Date Picker. Waiting for calendar transition...");
        await new Promise((r) => setTimeout(r, 1200));
        await dismissOrDeleteCookies();
      } catch (cbErr) {
        console.warn("[PUPPETEER] One Way checkbox notice:", cbErr.message);
      }

      // 4b. Parse target date parameters
      const targetDateParts = departureDate.split("-"); // [YYYY, MM, DD]
      const targetYear = parseInt(targetDateParts[0], 10);
      const targetMonth = parseInt(targetDateParts[1], 10);
      const targetDay = parseInt(targetDateParts[2], 10);
      const targetMonthName = MONTH_NAMES[targetMonth - 1];

      const possibleAriaLabels = [
        `${targetMonth}/${targetDay}/${targetYear}`,
        `${String(targetMonth).padStart(2, "0")}/${String(targetDay).padStart(2, "0")}/${targetYear}`,
        `${targetMonthName} ${targetDay}, ${targetYear}`,
        `${targetDay} ${targetMonthName} ${targetYear}`,
        `${targetMonth}/${String(targetDay).padStart(2, "0")}/${targetYear}`,
        `${String(targetMonth).padStart(2, "0")}/${targetDay}/${targetYear}`
      ];

      console.log(`[PUPPETEER] Locating calendar cell for date: ${targetMonthName} ${targetDay}, ${targetYear} (Aria: ${possibleAriaLabels[0]})...`);

      let dateSelected = false;

      // Navigate months if needed (up to 6 months)
      for (let attempt = 0; attempt < 6; attempt++) {
        await dismissOrDeleteCookies();

        const clickResult = await page.evaluate((labels, dayNum, monthName, yearNum) => {
          const dispatchClick = (el) => {
            if (!el) return false;
            el.scrollIntoView({ block: "center", inline: "center" });
            el.focus();

            ["pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach((type) => {
              el.dispatchEvent(new MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                view: window
              }));
            });

            const innerSpan = el.querySelector(".mat-calendar-body-cell-content") || el;
            innerSpan.click();
            return true;
          };

          for (const label of labels) {
            const cell = document.querySelector(`button.mat-calendar-body-cell[aria-label="${label}"]`);
            if (cell && !cell.classList.contains("mat-calendar-body-disabled") && !cell.hasAttribute("disabled")) {
              return dispatchClick(cell);
            }
          }

          const sections = document.querySelectorAll(".ai-date-picker__section");
          for (const sec of sections) {
            const secLabel = sec.querySelector(".ai-date-picker__label")?.textContent.trim() || "";
            if (secLabel.includes(monthName) && secLabel.includes(String(yearNum))) {
              const cells = Array.from(sec.querySelectorAll("button.mat-calendar-body-cell:not(.mat-calendar-body-disabled)"));
              const matchedCell = cells.find((c) => {
                const text = c.textContent.trim();
                return text === String(dayNum) || c.getAttribute("aria-label")?.includes(String(dayNum));
              });
              if (matchedCell) {
                return dispatchClick(matchedCell);
              }
            }
          }

          const allActiveCells = Array.from(document.querySelectorAll("button.mat-calendar-body-cell:not(.mat-calendar-body-disabled)"));
          for (const cell of allActiveCells) {
            const cellAria = cell.getAttribute("aria-label") || "";
            const cellText = cell.textContent.trim();
            if (cellAria.includes(String(dayNum)) || cellText === String(dayNum)) {
              if (cellAria.includes(String(targetMonth)) || cellAria.includes(monthName) || allActiveCells.length <= 31) {
                return dispatchClick(cell);
              }
            }
          }

          return false;
        }, possibleAriaLabels, targetDay, targetMonthName, targetYear);

        if (clickResult) {
          dateSelected = true;
          console.log(`[PUPPETEER] Successfully clicked calendar date: ${targetMonthName} ${targetDay}, ${targetYear}`);
          break;
        }

        const nextArrow = await page.$(selectors.datePicker.nextMonthArrow);
        if (nextArrow) {
          await nextArrow.click();
          await new Promise((r) => setTimeout(r, 600));
        } else {
          break;
        }
      }

      if (!dateSelected) {
        console.log("[PUPPETEER] Selecting first available active calendar day cell...");
        await page.evaluate(() => {
          const firstActive = document.querySelector("button.mat-calendar-body-cell:not(.mat-calendar-body-disabled)");
          if (firstActive) {
            firstActive.scrollIntoView({ block: "center" });
            firstActive.click();
            const span = firstActive.querySelector(".mat-calendar-body-cell-content");
            if (span) span.click();
          }
        });
      }

      await new Promise((r) => setTimeout(r, 800));
      await dismissOrDeleteCookies();

      // 4c. Click Confirm button in Date Picker footer
      console.log("[PUPPETEER] Clicking Confirm button in Date Picker footer...");
      await page.evaluate((sel) => {
        const confirmBtn = document.querySelector(sel.datePicker.confirmButton) ||
          document.querySelector(".ai-date-picker__footer-right button.ai-button--primary") ||
          document.querySelector("button[aria-label='Confirm']");
        if (confirmBtn) {
          confirmBtn.scrollIntoView({ block: "center" });
          confirmBtn.click();
          ["pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach((type) => {
            confirmBtn.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
          });
        }
      }, selectors);

      await new Promise((r) => setTimeout(r, 800));
      await dismissOrDeleteCookies();

    } catch (dateErr) {
      console.warn("[PUPPETEER] Notice on date picker step:", dateErr.message);
    }

    // Step 5: Click Search Button
    try {
      await dismissOrDeleteCookies();
      console.log("[PUPPETEER] Clicking Search Flights button on booking widget...");

      const searchClicked = await page.evaluate((sel) => {
        const btn = document.querySelector(sel.widget.searchButton) ||
          document.querySelector(".ai-booking-widget__search-btn button") ||
          document.querySelector("button.ai-button--primary");
        if (btn) {
          btn.scrollIntoView({ block: "center" });
          btn.click();
          ["pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach((type) => {
            btn.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
          });
          return true;
        }
        return false;
      }, selectors);

      if (!searchClicked) {
        const searchBtn = await page.$(selectors.widget.searchButton);
        if (searchBtn) await searchBtn.click();
      }

      console.log("[PUPPETEER] Search Flights button clicked successfully");
    } catch (e) {
      console.warn("[PUPPETEER] Notice on search button:", e.message);
    }

    // Step 6: Wait for results listing
    try {
      await page.waitForSelector(selectors.results.flightItem, {
        timeout: Math.min(timeout, 20000)
      });
    } catch {
      console.log("[PUPPETEER] Results listing wait concluded, evaluating available DOM items...");
    }

    // Step 7: Extract flights from the DOM
    const domObservations = await page.evaluate((sel, originCode, destCode, canonicalRoute) => {
      const results = [];
      const now = new Date().toISOString();
      const items = document.querySelectorAll(sel.results.flightItem);

      items.forEach((item) => {
        try {
          const flightIdEl = item.querySelector(sel.results.flightId);
          const flightNo = flightIdEl ? flightIdEl.textContent.trim().replace(/\s+/g, " ") : "AI";

          const operatedEl = item.querySelector(sel.results.operatedBy);
          const operatedBy = operatedEl ? operatedEl.textContent.trim() : "Air India";

          const depTimeEl = item.querySelector(sel.results.departureTime);
          const departureTime = depTimeEl ? depTimeEl.textContent.trim() : "";

          const arrTimeEl = item.querySelector(sel.results.arrivalTime);
          const arrivalTime = arrTimeEl ? arrTimeEl.textContent.trim() : "";

          const durationEl = item.querySelector(sel.results.duration);
          const duration = durationEl ? durationEl.textContent.trim() : "";

          const stopsEl = item.querySelector(sel.results.stopsInfo);
          const stopsText = stopsEl ? stopsEl.textContent.trim() : "Non-stop";
          const stops = stopsText.toLowerCase().includes("non-stop") ? 0 : 1;

          const priceEl = item.querySelector(sel.results.priceTag) || item.querySelector(sel.results.cabinActualPrice);
          const priceText = priceEl ? priceEl.textContent.trim().replace(/[^0-9]/g, "") : "";
          const totalFare = priceText ? parseInt(priceText, 10) : 0;

          const currEl = item.querySelector(sel.results.currency) || item.querySelector(sel.results.cabinCurrency);
          const currency = currEl ? currEl.textContent.trim() : "INR";

          const cabins = [];
          const cabinCards = item.querySelectorAll(sel.results.cabinCard);
          cabinCards.forEach((c) => {
            const labelEl = c.getAttribute("aria-label") || c.className || "";
            const cPriceEl = c.querySelector(sel.results.cabinActualPrice);
            const cPriceText = cPriceEl ? cPriceEl.textContent.trim().replace(/[^0-9]/g, "") : "";
            if (cPriceText) {
              let cabinType = "Economy";
              if (labelEl.toLowerCase().includes("business") || c.classList.contains("ai-pb-business-card")) {
                cabinType = "Business";
              } else if (labelEl.toLowerCase().includes("premium") || c.classList.contains("ai-pb-premium-economy-card")) {
                cabinType = "Premium Economy";
              }
              cabins.push({
                cabinClass: cabinType,
                fare: parseInt(cPriceText, 10)
              });
            }
          });

          if (totalFare > 0) {
            results.push({
              source: "Air India",
              airline: operatedBy.includes("Express") ? "Air India Express" : "Air India",
              flightNo,
              origin: originCode,
              destination: destCode,
              route: canonicalRoute,
              departureTime,
              arrivalTime,
              duration,
              stops,
              fareType: "Economy",
              cabinClass: "Economy",
              totalFare,
              currency: currency || "INR",
              scrapedAt: now,
              searchTimestamp: now,
              metadata: {
                operatedBy,
                cabins,
                rawSource: "airindia-puppeteer-dom"
              }
            });
          }
        } catch { }
      });

      return results;
    }, selectors, origin, destination, route);

    console.log(`[PUPPETEER] Extracted ${domObservations.length} flight records from DOM`);

    // Merge network observations if DOM was empty but network payload captured
    let finalObservations = domObservations.map((obs) => ({
      ...obs,
      departureDate: new Date(departureDate),
      scrapedAt: new Date(obs.scrapedAt),
      searchTimestamp: new Date(obs.searchTimestamp)
    }));

    if (finalObservations.length === 0 && interceptedData) {
      console.log("[PUPPETEER] Using intercepted network data fallback...");
      const networkObs = normalizeApiResponse(interceptedData, origin, destination, route, departureDate);
      finalObservations = networkObs;
    }

    console.log(`[PUPPETEER] Successfully collected ${finalObservations.length} observations for ${origin} → ${destination}`);
    return finalObservations;

  } catch (err) {
    console.error(`[PUPPETEER] Air India scraper error for ${origin} → ${destination}:`, err.message);
    throw err;
  } finally {
    if (browser) {
      await browser.close().catch(() => null);
      console.log("[PUPPETEER] Browser closed cleanly");
    }
  }
}

/**
 * Converts observations into RouteFareSearch document format
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
        type: "airline",
        name: obs.airline || AIRLINE_NAME
      },
      scrapedAt: obs.scrapedAt
    })),
    source: {
      provider: AIRLINE_NAME,
      type: "airline",
      url: "https://www.airindia.com",
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
  toRouteFareSearchDocument
};