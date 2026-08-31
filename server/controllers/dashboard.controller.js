/**
 * Dashboard Controller
 */

const dashboardService = require("../services/dashboard.service");
const { sendSuccess, sendError } = require("../utils/response");

/**
 * GET /api/dashboard
 * Main aggregated dashboard payload.
 */
function getDashboard(req, res) {
  try {
    const data = dashboardService.getDashboardSummary();
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, "DASHBOARD_FETCH_FAILED", err.message, 500);
  }
}

module.exports = {
  getDashboard
};
