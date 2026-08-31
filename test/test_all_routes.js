const crypto = require("crypto");

const API_URL = "https://www.agoda.com/api/flights-bff/search/v1/flights";

async function searchWithPolling({
  from,
  to,
  departureDate = "2026-09-04",
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
            origin: [{ code: from.toUpperCase(), type: "Airport" }],
            destination: [{ code: to.toUpperCase(), type: "Airport" }],
            departureDate,
            sliceFilter: { cabinClasses: [], carrier: { exclude: [], preferred: [] } },
          },
          slices: [
            {
              origin: [{ code: from.toUpperCase(), type: "Airport" }],
              destination: [{ code: to.toUpperCase(), type: "Airport" }],
              departureDate,
              sliceFilter: { cabinClasses: [], carrier: { exclude: [], preferred: [] } },
            },
          ],
          itineraryFilter: {
            hackerFareEnabled: true,
            cabinClass: cabin,
          },
          sort: { sortBy: "Best" },
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

    const res = await fetch(API_URL, {
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

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${res.statusText} - ${errText.slice(0, 100)}`);
    }

    const json = await res.json();
    const items = json?.data?.response?.content?.items || [];
    const isCompleted = json?.data?.polling?.completed;
    pollingToken = json?.data?.response?.content?.pollingToken || pollingToken;
    delayMs = json?.data?.polling?.delayMs || 1500;
    pollingCount = (json?.data?.polling?.count || pollingCount) + 1;

    if (items.length > 0) {
      return { items, attemptsNeeded: attempt, json };
    }

    if (isCompleted && items.length === 0) {
      return { items: [], attemptsNeeded: attempt, json };
    }

    // Wait for the server-requested delay before next poll
    await new Promise((r) => setTimeout(r, delayMs));
  }

  return { items: [], attemptsNeeded: maxAttempts, json: null };
}

async function test15Routes() {
  const routes = [
    { from: "DEL", to: "BOM" },
    { from: "DEL", to: "BLR" },
    { from: "BOM", to: "BLR" },
    { from: "DEL", to: "HYD" },
    { from: "BOM", to: "HYD" },
    { from: "DEL", to: "CCU" },
    { from: "DEL", to: "MAA" },
    { from: "BOM", to: "MAA" },
    { from: "BLR", to: "HYD" },
    { from: "BOM", to: "CCU" },
    { from: "DEL", to: "GOI" },
    { from: "BOM", to: "GOI" },
    { from: "DEL", to: "PNQ" },
    { from: "DEL", to: "COK" },
    { from: "DEL", to: "AMD" }
  ];

  console.log(`Testing ${routes.length} Indian routes with Agoda polling support...\n`);

  for (const r of routes) {
    const start = Date.now();
    try {
      const result = await searchWithPolling({
        from: r.from,
        to: r.to,
        departureDate: "2026-09-04"
      });
      const duration = ((Date.now() - start) / 1000).toFixed(2);
      const first = result.items[0];
      const airline = first?.slice?.segments?.[0]?.airline?.name || "N/A";
      const flightNo = first?.slice?.segments?.[0]?.flightNumber || "N/A";
      const price = first?.price?.priceAfterDiscount?.amount || first?.totalPrice?.priceAfterDiscount?.amount || "N/A";

      console.log(
        `✅ ${r.from} → ${r.to}: ${result.items.length} flights (${result.attemptsNeeded} attempt(s), ${duration}s) | Sample: ${airline} #${flightNo} ₹${price}`
      );
    } catch (e) {
      console.error(`❌ ${r.from} → ${r.to}: Error - ${e.message}`);
    }
  }
}

test15Routes();
