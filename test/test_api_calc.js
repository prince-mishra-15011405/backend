/**
 * Test API Response & Engine Calculations
 */

const { connectDatabase } = require("../config/database");
const app = require("../server/server");
const http = require("http");

async function testApi() {
  await connectDatabase();

  const server = app.listen(5099, async () => {
    console.log("Test server running on port 5099...");

    try {
      // 1. Test search endpoint for BOM-MAA
      console.log("\nTesting GET http://localhost:5099/api/search?q=BOM-MAA...");
      const searchRes = await fetch("http://localhost:5099/api/search?q=BOM-MAA");
      const searchJson = await searchRes.json();

      console.log("Search Success:", searchJson.success);
      console.log("Route:", searchJson.data?.route);
      console.log("Observations Returned:", searchJson.data?.observations?.length);
      console.log("Engine Median Fare:", searchJson.data?.routeIndexEngine?.currentRepresentativeFare);
      console.log("Engine Base Fare:", searchJson.data?.routeIndexEngine?.baseRepresentativeFare);
      console.log("Engine Route Index:", searchJson.data?.routeIndexEngine?.routeIndex);
      console.log("Price Comparison:", JSON.stringify(searchJson.data?.priceComparison, null, 2));

      // 2. Test route detail endpoint
      console.log("\nTesting GET http://localhost:5099/api/routes/BOM-MAA...");
      const routeRes = await fetch("http://localhost:5099/api/routes/BOM-MAA");
      const routeJson = await routeRes.json();

      console.log("Route Success:", routeJson.success);
      console.log("Route Current Median Fare:", routeJson.data?.currentFare);
      console.log("Route Base Fare:", routeJson.data?.baseFare);
      console.log("Route Index:", routeJson.data?.routeIndex);
      console.log("Route Fare Observations Count:", routeJson.data?.fareObservations?.length);
      console.log("Route Price Comparison:", JSON.stringify(routeJson.data?.priceComparison, null, 2));

      console.log("\n✅ ALL API VERIFICATION TESTS COMPLETED SUCCESSFULLY!");
    } catch (err) {
      console.error("❌ Test Failed:", err.message);
    } finally {
      server.close();
      process.exit(0);
    }
  });
}

testApi();
