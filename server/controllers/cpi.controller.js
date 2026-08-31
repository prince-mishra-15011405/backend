/**
 * CPI REST API Controller
 * Handles requests for Consumer Price Index (CPI) augmentation and macro-intelligence.
 */

const cpiService = require("../../services/cpi.service");
const { sendSuccess, sendError } = require("../utils/response");

/**
 * GET /api/cpi/summary or GET /api/cpi
 * Returns overview of CPI metrics, headline impact, inflation rate, and nowcast advantage.
 */
async function getCpiSummary(req, res) {
  try {
    const data = await cpiService.getCpiSummary();
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, "CPI_SUMMARY_FAILED", err.message, 500);
  }
}

/**
 * GET /api/cpi/comparison
 * Returns monthly time-series comparing Real-Time Airfare Nowcasts vs Official MOSPI Publications.
 */
async function getCpiComparison(req, res) {
  try {
    const series = await cpiService.getComparisonTimeSeries();
    return sendSuccess(res, {
      series,
      leadTimeAdvantageDays: 45,
      frequency: "Daily Continuous Nowcast vs Monthly Official Release"
    });
  } catch (err) {
    return sendError(res, "CPI_COMPARISON_FAILED", err.message, 500);
  }
}

/**
 * GET /api/cpi/decomposition or GET /api/cpi/routes
 * Returns route-by-route contribution to the national CPI Transport & Communication basket.
 */
async function getCpiDecomposition(req, res) {
  try {
    const routes = await cpiService.getRouteDecomposition();
    return sendSuccess(res, {
      totalRoutesTracked: routes.length,
      routes
    });
  } catch (err) {
    return sendError(res, "CPI_DECOMPOSITION_FAILED", err.message, 500);
  }
}

/**
 * GET /api/cpi/simulate
 * Simulates the impact of airfare price shocks on the headline CPI.
 * Supports query parameter: ?shocks=-20,-10,0,10,20,30 or single ?shock=15
 */
async function simulateCpiShocks(req, res) {
  try {
    let customShocks = null;
    if (req.query.shocks) {
      customShocks = String(req.query.shocks)
        .split(",")
        .map((s) => parseFloat(s.trim()))
        .filter((n) => !Number.isNaN(n));
    } else if (req.query.shock) {
      const val = parseFloat(req.query.shock);
      if (!Number.isNaN(val)) {
        customShocks = [val];
      }
    }

    const simulation = await cpiService.simulateInflationShocks(customShocks);
    return sendSuccess(res, simulation);
  } catch (err) {
    return sendError(res, "CPI_SIMULATION_FAILED", err.message, 500);
  }
}

module.exports = {
  getCpiSummary,
  getCpiComparison,
  getCpiDecomposition,
  simulateCpiShocks
};
