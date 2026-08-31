/**
 * Test Suite for SpiceJet Scraper & Calculation Engine Pipeline
 */

const assert = require("assert");
const spicejetScraper = require("../scrapers/spicejet.scraper");
const engine = require("../lib/engine");
const config = require("../config");
const { createRouteId } = require("../utils/route");

// Mock SpiceJet dotREZ API response matching the exact user payload
const MOCK_SPICEJET_RESPONSE = {
  data: {
    lowFareDateMarkets: [
      {
        lowestFareAmount: {
          fareAmount: 5874,
          farePointAmount: 0,
          taxesAndFeesAmount: 1620
        },
        destination: "DEL",
        origin: "BOM",
        departureDate: "2026-08-30T00:00:00",
        departureDateToShow: "Sun, 30 Aug",
        isCurrentDate: false,
        isOneDayBehindDate: false,
        isOneDayAheadDate: false
      },
      {
        lowestFareAmount: {
          fareAmount: 4900,
          farePointAmount: 0,
          taxesAndFeesAmount: 1572
        },
        destination: "DEL",
        origin: "BOM",
        departureDate: "2026-08-31T00:00:00",
        departureDateToShow: "Mon, 31 Aug",
        isCurrentDate: false,
        isOneDayBehindDate: true,
        isOneDayAheadDate: false
      },
      {
        lowestFareAmount: {
          fareAmount: 4900,
          farePointAmount: 0,
          taxesAndFeesAmount: 1572
        },
        destination: "DEL",
        origin: "BOM",
        departureDate: "2026-09-01T00:00:00",
        departureDateToShow: "Tue, 01 Sep",
        isCurrentDate: true,
        isOneDayBehindDate: false,
        isOneDayAheadDate: false
      },
      {
        lowestFareAmount: {
          fareAmount: 9531,
          farePointAmount: 0,
          taxesAndFeesAmount: 1802
        },
        destination: "DEL",
        origin: "BOM",
        departureDate: "2026-09-02T00:00:00",
        departureDateToShow: "Wed, 02 Sep",
        isCurrentDate: false,
        isOneDayBehindDate: false,
        isOneDayAheadDate: true
      },
      {
        lowestFareAmount: {
          fareAmount: 8873,
          farePointAmount: 0,
          taxesAndFeesAmount: 1770
        },
        destination: "DEL",
        origin: "BOM",
        departureDate: "2026-09-03T00:00:00",
        departureDateToShow: "Thu, 03 Sep",
        isCurrentDate: false,
        isOneDayBehindDate: false,
        isOneDayAheadDate: false
      },
      {
        lowestFareAmount: {
          fareAmount: 5179,
          farePointAmount: 0,
          taxesAndFeesAmount: 1584
        },
        destination: "DEL",
        origin: "BOM",
        departureDate: "2026-09-04T00:00:00",
        departureDateToShow: "Fri, 04 Sep",
        isCurrentDate: false,
        isOneDayBehindDate: false,
        isOneDayAheadDate: false
      },
      {
        lowestFareAmount: {
          fareAmount: 11852,
          farePointAmount: 0,
          taxesAndFeesAmount: 1918
        },
        destination: "DEL",
        origin: "BOM",
        departureDate: "2026-09-05T00:00:00",
        departureDateToShow: "Sat, 05 Sep",
        isCurrentDate: false,
        isOneDayBehindDate: false,
        isOneDayAheadDate: false
      }
    ],
    includeTaxesAndFees: true,
    currencyCode: "INR",
    stationCodeTimeZoneOffsets: {
      BOM: 330
    }
  },
  metadata: {
    documentation_url: "http://developer.navitaire.com/documentation/dotrezapi/availabilitylowfarecontrollerv2"
  }
};

let passedCount = 0;
let totalCount = 0;

function it(description, fn) {
  totalCount++;
  try {
    fn();
    console.log(`  ✓ ${description}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ ${description}`);
    console.error(`    Error: ${err.message}`);
    process.exitCode = 1;
  }
}

async function itAsync(description, fn) {
  totalCount++;
  try {
    await fn();
    console.log(`  ✓ ${description}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ ${description}`);
    console.error(`    Error: ${err.message}`);
    process.exitCode = 1;
  }
}

async function runTests() {
  console.log("\n========================================");
  console.log("SpiceJet Scraper & Index Engine Test Suite");
  console.log("========================================\n");

  // 1. API Response Normalization Tests
  console.log("1. Normalization & Schema Conformance (normalizeApiResponse)");
  it("normalizes dotREZ lowfare API payload into FareObservation objects", () => {
    const observations = spicejetScraper.normalizeApiResponse(MOCK_SPICEJET_RESPONSE, "BOM", "DEL", "BOM-DEL");
    assert.strictEqual(observations.length, 7, "Should produce 7 observations");

    const first = observations[0];
    assert.strictEqual(first.source, "SpiceJet");
    assert.strictEqual(first.airline, "SpiceJet");
    assert.strictEqual(first.flightNo, "SG");
    assert.strictEqual(first.origin, "BOM");
    assert.strictEqual(first.destination, "DEL");
    assert.strictEqual(first.route, "BOM-DEL");
    assert.strictEqual(first.totalFare, 5874);
    assert.strictEqual(first.currency, "INR");
    assert.strictEqual(first.metadata.tax, 1620);
    assert.strictEqual(first.metadata.base, 5874 - 1620);
    assert.strictEqual(first.metadata.rawSource, "spicejet-dotrez-v2");
    assert.strictEqual(first.fareType, "SpiceSaver");
    assert.strictEqual(first.cabinClass, "Economy");
  });

  it("handles empty or malformed API responses gracefully", () => {
    const empty1 = spicejetScraper.normalizeApiResponse(null, "BOM", "DEL", "BOM-DEL");
    assert.deepStrictEqual(empty1, []);

    const empty2 = spicejetScraper.normalizeApiResponse({}, "BOM", "DEL", "BOM-DEL");
    assert.deepStrictEqual(empty2, []);

    const empty3 = spicejetScraper.normalizeApiResponse({ data: { lowFareDateMarkets: [] } }, "BOM", "DEL", "BOM-DEL");
    assert.deepStrictEqual(empty3, []);
  });

  // 2. Date Window Calculation
  console.log("\n2. Date Window Generation (calculateCenterDates)");
  it("generates 7-day spaced center dates for requested duration", () => {
    const dates = spicejetScraper.calculateCenterDates("2026-09-01", 30);
    assert.strictEqual(dates.length, 5, "30 days should generate 5 center dates");
    assert.strictEqual(dates[0], "2026-09-01");
    assert.strictEqual(dates[1], "2026-09-08");
    assert.strictEqual(dates[2], "2026-09-15");
    assert.strictEqual(dates[3], "2026-09-22");
    assert.strictEqual(dates[4], "2026-09-29");
  });

  // 3. RouteFareSearch Document Transformation
  console.log("\n3. RouteFareSearch Document Generation (toRouteFareSearchDocument)");
  it("formats observations into RouteFareSearch schema document", () => {
    const observations = spicejetScraper.normalizeApiResponse(MOCK_SPICEJET_RESPONSE, "BOM", "DEL", "BOM-DEL");
    const doc = spicejetScraper.toRouteFareSearchDocument(observations, "BOM", "DEL", "2026-09-01");

    assert.strictEqual(doc.route.origin.airportCode, "BOM");
    assert.strictEqual(doc.route.destination.airportCode, "DEL");
    assert.strictEqual(doc.source.provider, "SpiceJet");
    assert.strictEqual(doc.source.type, "airline");
    assert.strictEqual(doc.fares.length, 7);
    assert.strictEqual(doc.fares[0].price.total, 5874);
    assert.strictEqual(doc.dataQuality.status, "verified");
  });

  // 4. Processing through Calculation Engine
  console.log("\n4. Airfare Index Engine Calculation (lib/engine.js)");
  it("calculates representative current fare as median of SpiceJet observations", () => {
    const observations = spicejetScraper.normalizeApiResponse(MOCK_SPICEJET_RESPONSE, "BOM", "DEL", "BOM-DEL");
    const fares = observations.map((o) => o.totalFare);
    // Fares: [5874, 4900, 4900, 9531, 8873, 5179, 11852]
    // Sorted: [4900, 4900, 5179, 5874, 8873, 9531, 11852] -> Median is 5874
    const medianFare = engine.getMedian(fares);
    assert.strictEqual(medianFare, 5874, "Median fare should be 5874");
  });

  it("computes Route Airfare Index using Laspeyres formula", () => {
    const observations = spicejetScraper.normalizeApiResponse(MOCK_SPICEJET_RESPONSE, "BOM", "DEL", "BOM-DEL");
    const currentFare = engine.getMedian(observations.map((o) => o.totalFare));
    const baseFare = 5000; // Baseline fare
    const routeIndex = engine.calculateRouteIndex(currentFare, baseFare);

    // Route Index: (5874 / 5000) * 100 = 117.48
    assert.strictEqual(Number(routeIndex.toFixed(2)), 117.48);
  });

  it("calculates Route Contribution to Master Index using DGCA weights", () => {
    const mockVolumeMap = { "BOM-DEL": 350000, "BLR-DEL": 250000 };
    const weightedBasket = engine.calculateRouteWeights(mockVolumeMap, 30);
    const bomDelWeight = weightedBasket.find((w) => w.route === "BOM-DEL");

    // BOM-DEL volume ratio: 350000 / 600000 = 0.583333
    assert(bomDelWeight.weight > 0.58 && bomDelWeight.weight < 0.59);

    const routeIndex = 117.48;
    const contribution = routeIndex * bomDelWeight.weight;
    assert(contribution > 68 && contribution < 69);
  });

  console.log("\n----------------------------------------");
  console.log(`SpiceJet Tests Passed: ${passedCount} / ${totalCount}`);
  console.log("----------------------------------------\n");
}

if (require.main === module) {
  runTests();
}

module.exports = {
  runTests,
  MOCK_SPICEJET_RESPONSE
};
