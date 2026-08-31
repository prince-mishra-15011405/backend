const agoda = require("../scrapers/agoda.scraper");

async function testRoutes() {
  const routes = [
    { from: "DEL", to: "BOM" },
    { from: "DEL", to: "BLR" },
    { from: "BOM", to: "GOI" },
    { from: "DEL", to: "MAA" },
    { from: "CCU", to: "DEL" },
    { from: "HYD", to: "DEL" },
    { from: "BOM", to: "BLR" }
  ];

  for (const r of routes) {
    try {
      console.log(`\n--- Testing Agoda: ${r.from} -> ${r.to} on 2026-09-04 ---`);
      const raw = await agoda.searchFlights({
        from: r.from,
        to: r.to,
        departureDate: "2026-09-04"
      });
      const items = raw?.data?.response?.content?.items || [];
      console.log(`Items returned for ${r.from}->${r.to}:`, items.length);
      if (items.length === 0) {
        console.log("Full response data:", JSON.stringify(raw, null, 2).slice(0, 1000));
      } else {
        console.log("Sample flight:", {
          airline: items[0]?.slice?.segments?.[0]?.airline?.name,
          flightNumber: items[0]?.slice?.segments?.[0]?.flightNumber,
          dep: items[0]?.slice?.segments?.[0]?.departure?.airport?.code,
          arr: items[0]?.slice?.segments?.[0]?.arrival?.airport?.code,
          price: items[0]?.price?.priceAfterDiscount?.amount || items[0]?.totalPrice?.priceAfterDiscount?.amount
        });
      }
    } catch (e) {
      console.error(`Error for ${r.from}->${r.to}:`, e.message);
    }
  }
}

testRoutes();
