/**
 * CPI Service Layer
 * Computes live macroeconomic metrics, nowcasts, simulations, and corridor contributions.
 */

const dashboardService = require("../server/services/dashboard.service");
const dataService = require("./data.service");
const { isDbConnected } = require("../config/database");
const CpiBenchmark = require("../models/CpiBenchmark");
const {
  CPI_WEIGHTS,
  calculateCpiImpact,
  getCpiComparisonSeries,
  simulateCpiShocks,
  calculateRouteCpiContributions
} = require("../lib/cpi");

class CpiService {
  /**
   * Retrieves summary CPI macroeconomic intelligence payload.
   */
  async getCpiSummary() {
    const masterData = dashboardService.getMasterData();
    const indexVal = masterData.computedIndex.indiaAirfareIndex || 100;
    const baseVal = masterData.computedIndex.baseIndex || 100;

    const cpiImpact = calculateCpiImpact(indexVal, baseVal);
    const comparisonSeries = getCpiComparisonSeries(indexVal);
    const corridorDecomposition = calculateRouteCpiContributions(masterData.enrichedRoutes);

    // Save snapshot to MongoDB if connected
    if (isDbConnected()) {
      try {
        const periodStr = new Date().toISOString().slice(0, 7); // "YYYY-MM"
        await CpiBenchmark.findOneAndUpdate(
          { period: periodStr },
          {
            period: periodStr,
            isNowcast: true,
            nowcast: {
              airfareIndex: cpiImpact.indiaAirfareIndex,
              estimatedGeneralCpi: cpiImpact.nowcastGeneralCpi,
              headlineCpiImpactBps: cpiImpact.headlineCpiImpactBasisPoints,
              transportImpactPercentagePoints: cpiImpact.transportCpiImpactPercentagePoints,
              airfareInflationRate: cpiImpact.airfareInflationRate,
              sampleSizeObservations: masterData.stats.validObservations,
              routesCount: masterData.enrichedRoutes.length
            },
            leadTimeAdvantageDays: 45
          },
          { upsert: true, new: true }
        );
      } catch (err) {
        console.warn("[CPI] MongoDB nowcast benchmark notice:", err.message);
      }
    }

    return {
      summary: cpiImpact,
      topCorridorContributors: corridorDecomposition.slice(0, 5),
      recentComparison: comparisonSeries.slice(-4),
      meta: {
        methodology: "Laspeyres Price Index with DGCA Passenger Volume Weighting",
        basePeriod: masterData.computedIndex.basePeriod || { start: "2026-01-01", end: "2026-01-31" },
        referenceYear: masterData.computedIndex.referenceYear || 2026,
        sourcesTracked: masterData.sources || ["Air India", "IndiGo"]
      }
    };
  }

  /**
   * Returns full time series comparing Real-Time Airfare Nowcast vs Official MOSPI CPI.
   */
  async getComparisonTimeSeries() {
    const masterData = dashboardService.getMasterData();
    const indexVal = masterData.computedIndex.indiaAirfareIndex || 100;
    return getCpiComparisonSeries(indexVal);
  }

  /**
   * Returns route-level decomposition of CPI basket weights and basis point contributions.
   */
  async getRouteDecomposition() {
    const masterData = dashboardService.getMasterData();
    return calculateRouteCpiContributions(masterData.enrichedRoutes);
  }

  /**
   * Runs policy & inflation shock simulations for hypothetical airfare price movements.
   * @param {Array<number>} customShocks - Optional array of percentage shocks
   */
  async simulateInflationShocks(customShocks = null) {
    const masterData = dashboardService.getMasterData();
    const indexVal = masterData.computedIndex.indiaAirfareIndex || 100;
    const shocks = Array.isArray(customShocks) && customShocks.length > 0
      ? customShocks
      : [-30, -20, -10, -5, 0, 5, 10, 20, 30];

    return {
      currentAirfareIndex: Number(indexVal.toFixed(2)),
      baselineBaseYear: CPI_WEIGHTS.BASE_YEAR,
      shocks: simulateCpiShocks(indexVal, shocks)
    };
  }
}

module.exports = new CpiService();
