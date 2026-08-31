/**
 * Index Controller
 */

const dashboardService = require("../services/dashboard.service");
const dataService = require("../../services/data.service");
const { sendSuccess, sendError } = require("../utils/response");
const { isDbConnected } = require("../../config/database");

/**
 * GET /api/health
 */
function getHealth(req, res) {
  return res.status(200).json({
    success: true,
    status: "ok",
    service: "india-airfare-index-api",
    database: isDbConnected() ? "connected" : "standalone",
    timestamp: new Date().toISOString()
  });
}

/**
 * GET /api/index
 * Current India Airfare Index summary.
 */
async function getIndex(req, res) {
  try {
    const data = dashboardService.getIndexData();
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, "INDEX_FETCH_FAILED", err.message, 500);
  }
}

/**
 * GET /api/index/history
 * Query params: period (24h, 7d, 30d, 3m, 1y, all), granularity (daily, weekly, monthly)
 * Returns actual IndexSnapshot documents from MongoDB.
 */
async function getIndexHistory(req, res) {
  try {
    const period = req.query.period || "30d";
    const granularity = req.query.granularity || "daily";

    if (isDbConnected()) {
      const snapshots = await dataService.getSnapshotHistory(30);
      if (snapshots && snapshots.length > 0) {
        const points = snapshots.map((s) => ({
          timestamp: s.calculatedAt ? s.calculatedAt.toISOString() : s.createdAt,
          value: s.indiaAirfareIndex
        }));

        return sendSuccess(res, {
          period,
          granularity,
          points
        });
      }
    }

    // If no historical index snapshots exist yet, return explicit availability error without fabricating data
    return sendError(
      res,
      "HISTORY_NOT_AVAILABLE",
      "Historical index snapshots are not available.",
      404
    );
  } catch (err) {
    return sendError(res, "INDEX_HISTORY_FAILED", err.message, 500);
  }
}

/**
 * POST /api/refresh
 * Invalidates cache and recalculates master index from MongoDB.
 */
async function refresh(req, res) {
  try {
    dashboardService.invalidateCache();
    await dataService.recalculateMasterIndex();
    dashboardService.getMasterData(true); // Force fresh load

    return res.status(200).json({
      success: true,
      message: "Index data refreshed"
    });
  } catch (err) {
    return sendError(res, "REFRESH_FAILED", err.message, 500);
  }
}

module.exports = {
  getHealth,
  getIndex,
  getIndexHistory,
  refresh
};
