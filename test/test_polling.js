const crypto = require("crypto");

const API_URL = "https://www.agoda.com/api/flights-bff/search/v1/flights";

async function testPolling(from = "DEL", to = "MAA", departureDate = "2026-09-04") {
  const requestId = crypto.randomUUID();
  const pollingId = crypto.randomUUID();

  let pollingCount = 3;
  let attempt = 1;
  let pollingToken = null;
  let delayMs = 1500;

  for (let step = 0; step < 5; step++) {
    console.log(`\n[Attempt ${attempt}] Sending request for ${from} -> ${to} (pollingCount=${pollingCount}, pollingToken=${Boolean(pollingToken)})...`);

    const body = {
      pagination: {
        page: 1,
      },
      polling: {
        count: pollingCount,
      },
      searchCriteria: {
        passengers: {
          adult: 1,
          child: 0,
          infant: 0,
        },
        trip: {
          outboundSlice: {
            origin: [{ code: from, type: "Airport" }],
            destination: [{ code: to, type: "Airport" }],
            departureDate,
            sliceFilter: { cabinClasses: [], carrier: { exclude: [], preferred: [] } },
          },
          slices: [
            {
              origin: [{ code: from, type: "Airport" }],
              destination: [{ code: to, type: "Airport" }],
              departureDate,
              sliceFilter: { cabinClasses: [], carrier: { exclude: [], preferred: [] } },
            },
          ],
          itineraryFilter: {
            hackerFareEnabled: true,
            cabinClass: "Economy",
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

    const json = await res.json();
    const items = json?.data?.response?.content?.items || [];
    const isCompleted = json?.data?.polling?.completed;
    pollingToken = json?.data?.response?.content?.pollingToken || pollingToken;
    delayMs = json?.data?.polling?.delayMs || 1500;
    pollingCount = (json?.data?.polling?.count || pollingCount) + 1;

    console.log(`[Attempt ${attempt}] Result: items=${items.length}, completed=${isCompleted}, delayMs=${delayMs}`);

    if (items.length > 0) {
      console.log(`✅ SUCCESS! Found ${items.length} flights on attempt ${attempt}:`);
      console.log("Sample flight:", {
        airline: items[0]?.slice?.segments?.[0]?.airline?.name,
        price: items[0]?.price?.priceAfterDiscount?.amount,
        flightNo: items[0]?.slice?.segments?.[0]?.flightNumber
      });
      return items;
    }

    if (isCompleted && items.length === 0) {
      console.log("Search completed with 0 items.");
      break;
    }

    attempt++;
    console.log(`Waiting ${delayMs}ms before polling next attempt...`);
    await new Promise((r) => setTimeout(r, delayMs));
  }
}

testPolling().catch(console.error);
