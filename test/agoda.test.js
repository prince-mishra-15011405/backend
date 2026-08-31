const crypto = require("crypto");

const API_URL = "https://www.agoda.com/api/flights-bff/search/v1/flights";

async function searchFlights({
  from,
  to,
  departureDate,
  adults = 1,
  children = 0,
  infants = 0,
  cabin = "Economy",
}) {
  const requestId = crypto.randomUUID();
  const pollingId = crypto.randomUUID();

  const body = {
    pagination: {
      page: 1,
    },

    polling: {
      count: 3,
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
              code: from,
              type: "Airport",
            },
          ],

          destination: [
            {
              code: to,
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
                code: from,
                type: "Airport",
              },
            ],

            destination: [
              {
                code: to,
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
      },
    },

    whitelabelContext: {
      programId: "",
      aid: "82361",
    },
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
      "ag-request-attempt": "1",
      "ag-request-id": requestId,
      "content-type": "text/plain",
    },

    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Agoda returned ${response.status}: ${response.statusText} - ${errorText.slice(0, 300)}`
    );
  }

  return await response.json();
}

function normalizeFlights(response) {
  const items = response?.data?.response?.content?.items || [];

  return items.map((item) => {
    const slice = item?.slice;
    const segment = slice?.segments?.[0];

    if (!segment) return null;

    const price =
      item?.price?.priceAfterDiscount?.amount ??
      item?.totalPrice?.priceAfterDiscount?.amount;

    return {
      id: item.bundleRefId,

      airline: {
        code: segment.airline?.code,
        name: segment.airline?.name,
      },

      flightNumber: segment.flightNumber,

      departure: {
        airport: segment.departure?.airport?.code,
        airportName: segment.departure?.airport?.name,
        city: segment.departure?.airport?.city,
        date: segment.departure?.rawDate,
        time: segment.departure?.time,
      },

      arrival: {
        airport: segment.arrival?.airport?.code,
        airportName: segment.arrival?.airport?.name,
        city: segment.arrival?.airport?.city,
        date: segment.arrival?.rawDate,
        time: segment.arrival?.time,
      },

      duration: segment.duration,

      cabin: segment.cabinClass,

      price: price
        ? Number(String(price).replace(/,/g, ""))
        : null,

      currency: "INR",

      stops: Math.max(
        0,
        (slice?.segments?.length || 1) - 1
      ),

      features:
        segment.featureIcons?.items?.map(
          (x) => x.text
        ) || [],

      badges:
        item.badges?.map(
          (x) => x.text
        ) || [],

      itineraryId:
        item.itineraryInfo?.itineraryId || null,

      bookingUrl:
        item.bookingUrl || null,
    };
  }).filter(Boolean);
}

async function main() {
  console.log("Searching Agoda Flights for BOM -> BLR on 2026-09-04...");
  const response = await searchFlights({
    from: "BOM",
    to: "BLR",
    departureDate: "2026-09-04",
    adults: 1,
  });

  const flights = normalizeFlights(response);
  console.log(`\nSuccessfully received response! Total flights found: ${flights.length}`);

  if (flights.length > 0) {
    console.log("\nFirst 2 Normalized Flights:");
    console.log(JSON.stringify(flights.slice(0, 2), null, 2));
  } else {
    console.log("No flight items in content array. Response summary:", {
      status: response?.status,
      dataKeys: Object.keys(response?.data || {})
    });
  }
}

main().catch(console.error);
