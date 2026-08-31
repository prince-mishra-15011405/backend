/**
 * Data Stream & Quality Controller
 */

const dashboardService = require("../services/dashboard.service");
const dataService = require("../../services/data.service");
const { sendSuccess, sendError } = require("../utils/response");

/**
 * GET /api/data/status
 * Stream health, observation count, and active MongoDB metrics.
 */
async function getDataStatus(req, res) {
  try {
    const data = dashboardService.getDataStatus();
    const dbStats = await dataService.getDatabaseStats();

    return sendSuccess(res, {
      ...data,
      ...dbStats
    });
  } catch (err) {
    return sendError(res, "DATA_STATUS_FAILED", err.message, 500);
  }
}

/**
 * GET /api/data/quality
 * Detailed quality metrics, validation warnings, and missing components.
 */
function getDataQuality(req, res) {
  try {
    const data = dashboardService.getDataQuality();
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, "DATA_QUALITY_FAILED", err.message, 500);
  }
}

module.exports = {
  getDataStatus,
  getDataQuality
};
