/**
 * IndiGo Airline Portal Scraper
 * Uses Puppeteer to extract public route fare data and normalize it.
 */

const puppeteer = require("puppeteer");
const selectors = require("./selectors/indigo.selectors");
const { parseIndianCurrency } = require("../utils/currency");
const { createRouteId } = require("../utils/route");

/**
 * Scrapes IndiGo flight observations for a specified ScrapeJob.
 * 
 * @param {Object} job - { source, origin, destination, departureDate }
 * @returns {Promise<Array<Object>>} Normalized fare observations
 */
async function scrape(job) {
  const origin = String(job.origin || "").trim().toUpperCase();
  const destination = String(job.destination || "").trim().toUpperCase();
  const departureDate = job.departureDate ? new Date(job.departureDate) : new Date();
  const route = createRouteId(origin, destination);

  if (!origin || !destination || !route) {
    throw new Error(`Invalid route parameters for scraping: origin=${origin}, dest=${destination}`);
  }


  const timeout = parseInt(process.env.PUPPETEER_TIMEOUT, 10) || 30000;

  let browser = null;
  const observations = [];

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu"
      ]
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    await page.setDefaultNavigationTimeout(timeout);
    await page.setDefaultTimeout(timeout);

    // Format departure date as YYYY-MM-DD
    const dateString = departureDate.toISOString().split("T")[0];
    const searchUrl = `https://www.goindigo.in/flight-search.html?source=${origin}&destination=${destination}&date=${dateString}`;

    console.log(`[SCRAPER] IndiGo ${origin} → ${destination} (${dateString})`);

    try {
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout });

      // Wait for flight cards or fare accordions to render
      await page.waitForSelector(selectors.flightCard, { timeout: Math.min(timeout, 10000) }).catch(() => null);

      // Extract DOM flight elements
      const rawFlights = await page.evaluate((sel, originCode, destCode) => {
        const results = [];
        const cards = document.querySelectorAll(sel.flightCard);

        for (const card of cards) {
          const flightNo = card.querySelector(sel.flightNumber)?.textContent?.trim() || "";
          const deptTime = card.querySelector(sel.departureTime)?.textContent?.trim() || "";
          const arrTime = card.querySelector(sel.arrivalTime)?.textContent?.trim() || "";
          const duration = card.querySelector(sel.duration)?.textContent?.trim() || "";
          const stopsText = card.querySelector(sel.stops)?.textContent?.trim() || "0";
          const fareType = card.querySelector(sel.fareType)?.textContent?.trim() || "Economy";
          const priceText = card.querySelector(sel.totalPrice)?.textContent?.trim() || "";

          if (priceText) {
            results.push({
              flightNo,
              departureTime: deptTime,
              arrivalTime: arrTime,
              duration,
              stopsText,
              fareType,
              price: priceText
            });
          }
        }
        return results;
      }, selectors, origin, destination);

      for (const flight of rawFlights) {
        const totalFare = parseIndianCurrency(flight.price);
        if (totalFare && totalFare > 0) {
          const stopsNum = flight.stopsText.toLowerCase().includes("non") ? 0 : parseInt(flight.stopsText, 10) || 0;
          observations.push({
            source: "IndiGo",
            airline: "IndiGo",
            flightNo: flight.flightNo || "6E",
            origin,
            destination,
            route,
            departureDate,
            departureTime: flight.departureTime || "00:00",
            arrivalTime: flight.arrivalTime || "00:00",
            duration: flight.duration || "01h 45m",
            stops: stopsNum,
            fareType: flight.fareType || "Economy",
            cabinClass: "Economy",
            totalFare,
            currency: "INR",
            scrapedAt: new Date(),
            searchTimestamp: new Date()
          });
        }
      }
    } catch (pageErr) {
      console.warn(`[SCRAPER] Web navigation note for ${origin} → ${destination}: ${pageErr.message}`);
    }

    console.log(`[SCRAPER] ${observations.length} observations collected for ${origin} → ${destination}`);
    return observations;

  } catch (err) {
    console.error(`[SCRAPER] Error scraping IndiGo ${origin} → ${destination}:`, err.message);
    throw err;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (closeErr) {
        // Silently catch close errors
      }
    }
  }
}

module.exports = {
  scrape
};

