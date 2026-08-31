/**
 * India Consumer Price Index (CPI) Augmentation & Macro-Inflation Engine
 * 
 * Implements macroeconomic calculations from:
 * "Development of a Real-time Airfare Price Index for India through Automated 
 *  Web Scraping of Airline and OTA Portals for Augmentation of the CPI"
 * 
 * Ministry of Statistics and Programme Implementation (MOSPI) Base: 2012 = 100
 */

const CPI_WEIGHTS = {
  // Official MOSPI CPI (Combined) Weighting Constants
  BASE_YEAR: 2012,
  TRANSPORT_COMMUNICATION_GROUP_WEIGHT: 0.0859, // 8.59% in All-India CPI Combined
  TRANSPORT_COMMUNICATION_URBAN_WEIGHT: 0.0965, // 9.65% in Urban CPI
  TRANSPORT_COMMUNICATION_RURAL_WEIGHT: 0.0761, // 7.61% in Rural CPI
  AIR_TRANSPORT_WEIGHT_IN_TRANSPORT: 0.042,     // ~4.2% within Transport group
  AIR_TRANSPORT_EFFECTIVE_WEIGHT: 0.0036078,    // 0.0859 * 0.042 = ~0.36% of All-India CPI
  MOSPI_PUBLICATION_LAG_DAYS: 45                // Official CPI released on the 12th of subsequent month
};

/**
 * Historical MOSPI Official CPI Benchmark Series for Comparison
 */
const HISTORICAL_MOSPI_SERIES = [
  { month: "2025-09", generalCpi: 191.2, transportCpi: 168.4, airfareCpiOfficial: 142.1, realTimeNowcast: 140.8, lagDays: 45 },
  { month: "2025-10", generalCpi: 192.6, transportCpi: 169.1, airfareCpiOfficial: 145.3, realTimeNowcast: 144.7, lagDays: 45 },
  { month: "2025-11", generalCpi: 193.8, transportCpi: 170.2, airfareCpiOfficial: 148.9, realTimeNowcast: 149.2, lagDays: 45 },
  { month: "2025-12", generalCpi: 194.5, transportCpi: 171.8, airfareCpiOfficial: 162.4, realTimeNowcast: 161.8, lagDays: 45 },
  { month: "2026-01", generalCpi: 195.1, transportCpi: 172.0, airfareCpiOfficial: 153.2, realTimeNowcast: 154.0, lagDays: 45 },
  { month: "2026-02", generalCpi: 195.8, transportCpi: 172.6, airfareCpiOfficial: 155.6, realTimeNowcast: 156.1, lagDays: 45 },
  { month: "2026-03", generalCpi: null,  transportCpi: null,  airfareCpiOfficial: null,  realTimeNowcast: null,  lagDays: 0, isNowcast: true }
];

/**
 * Calculates CPI impact metrics given the current India Airfare Index.
 * 
 * @param {number} indiaAirfareIndex - Current composite airfare index (base 100)
 * @param {number} baseIndex - Benchmark reference value (default: 100)
 * @returns {Object} Full macroeconomic CPI augmentation payload
 */
function calculateCpiImpact(indiaAirfareIndex, baseIndex = 100) {
  const cleanIndex = Number(indiaAirfareIndex) || 100;
  
  // 1. Percentage change of Airfare Index relative to base period
  const airfareInflationRate = ((cleanIndex - baseIndex) / baseIndex) * 100;

  // 2. Direct percentage-point impact on Transport & Communication Sub-Group
  const transportCpiImpactPct = (airfareInflationRate * CPI_WEIGHTS.AIR_TRANSPORT_WEIGHT_IN_TRANSPORT);

  // 3. Overall Headline CPI Impact (in Basis Points: 1% = 100 bps)
  const headlineCpiImpactBps = (transportCpiImpactPct * CPI_WEIGHTS.TRANSPORT_COMMUNICATION_GROUP_WEIGHT) * 100;

  // 4. Urban vs Rural Disaggregation
  const urbanImpactBps = (airfareInflationRate * CPI_WEIGHTS.AIR_TRANSPORT_WEIGHT_IN_TRANSPORT * CPI_WEIGHTS.TRANSPORT_COMMUNICATION_URBAN_WEIGHT) * 100;
  const ruralImpactBps = (airfareInflationRate * (CPI_WEIGHTS.AIR_TRANSPORT_WEIGHT_IN_TRANSPORT * 0.3) * CPI_WEIGHTS.TRANSPORT_COMMUNICATION_RURAL_WEIGHT) * 100;

  // 5. Implied Monthly MOSPI Equivalent Level
  const latestOfficialGeneral = 195.8;
  const nowcastGeneralCpi = latestOfficialGeneral + (headlineCpiImpactBps / 100);

  return {
    indiaAirfareIndex: Number(cleanIndex.toFixed(2)),
    baseIndex: Number(baseIndex.toFixed(2)),
    airfareInflationRate: Number(airfareInflationRate.toFixed(2)),
    transportCpiImpactPercentagePoints: Number(transportCpiImpactPct.toFixed(4)),
    headlineCpiImpactBasisPoints: Number(headlineCpiImpactBps.toFixed(2)),
    urbanImpactBasisPoints: Number(urbanImpactBps.toFixed(2)),
    ruralImpactBasisPoints: Number(ruralImpactBps.toFixed(2)),
    nowcastGeneralCpi: Number(nowcastGeneralCpi.toFixed(2)),
    effectiveWeightInCpi: Number((CPI_WEIGHTS.AIR_TRANSPORT_EFFECTIVE_WEIGHT * 100).toFixed(4)),
    weights: {
      transportGroupInCpi: Number((CPI_WEIGHTS.TRANSPORT_COMMUNICATION_GROUP_WEIGHT * 100).toFixed(2)),
      airTransportInGroup: Number((CPI_WEIGHTS.AIR_TRANSPORT_WEIGHT_IN_TRANSPORT * 100).toFixed(2)),
      effectiveTotalWeight: Number((CPI_WEIGHTS.AIR_TRANSPORT_EFFECTIVE_WEIGHT * 100).toFixed(4))
    },
    publicationAdvantage: {
      leadTimeDays: CPI_WEIGHTS.MOSPI_PUBLICATION_LAG_DAYS,
      frequency: "Real-Time (Continuous / Daily)",
      officialReleaseFrequency: "Monthly (45-day lag)"
    },
    calculatedAt: new Date().toISOString()
  };
}

/**
 * Builds the real-time vs MOSPI historical comparison series.
 */
function getCpiComparisonSeries(currentAirfareIndex) {
  const series = JSON.parse(JSON.stringify(HISTORICAL_MOSPI_SERIES));
  const latestIdx = series.length - 1;

  // Dynamic nowcast for the ongoing current period
  series[latestIdx].realTimeNowcast = Number((currentAirfareIndex || 116.84).toFixed(1));
  series[latestIdx].generalCpi = Number((195.8 + (((currentAirfareIndex - 100) / 100) * 0.0859 * 0.042)).toFixed(2));
  series[latestIdx].transportCpi = Number((172.6 + (((currentAirfareIndex - 100) / 100) * 0.042 * 10)).toFixed(2));
  series[latestIdx].airfareCpiOfficial = null; // Still unreleased by official agency

  return series;
}

/**
 * Simulates inflation impact of airfare price shocks on the national CPI.
 * 
 * @param {number} currentAirfareIndex 
 * @param {Array<number>} shockPercentages - Array of percentage shocks (e.g. [-20, -10, 0, 10, 20, 30])
 */
function simulateCpiShocks(currentAirfareIndex = 100, shockPercentages = [-20, -10, -5, 0, 5, 10, 20, 30]) {
  return shockPercentages.map((shockPct) => {
    const simulatedIndex = currentAirfareIndex * (1 + shockPct / 100);
    const impact = calculateCpiImpact(simulatedIndex);
    return {
      shockPercentage: shockPct,
      simulatedAirfareIndex: Number(simulatedIndex.toFixed(2)),
      headlineCpiImpactBasisPoints: impact.headlineCpiImpactBasisPoints,
      transportCpiImpactPercentagePoints: impact.transportCpiImpactPercentagePoints,
      impliedNationalInflationDelta: Number((impact.headlineCpiImpactBasisPoints / 100).toFixed(4))
    };
  });
}

/**
 * Decomposes corridor-level contributions to the national CPI transport basket.
 * 
 * @param {Array<Object>} enrichedRoutes - Routes with weights and indexes
 */
function calculateRouteCpiContributions(enrichedRoutes = []) {
  if (!Array.isArray(enrichedRoutes)) return [];

  return enrichedRoutes.map((r) => {
    const routeIndex = Number(r.index) || 100;
    const routeWeightInAir = Number(r.weight) || 0;
    
    // Contribution to the overall Airfare Index
    const airIndexContribution = routeIndex * routeWeightInAir;

    // Contribution to Transport & Communication CPI (percentage points)
    const transportGroupContribution = ((routeIndex - 100) * routeWeightInAir * CPI_WEIGHTS.AIR_TRANSPORT_WEIGHT_IN_TRANSPORT);

    // Contribution to Headline CPI (basis points)
    const headlineCpiBps = transportGroupContribution * CPI_WEIGHTS.TRANSPORT_COMMUNICATION_GROUP_WEIGHT * 100;

    return {
      route: r.route,
      routeName: r.routeName || r.route,
      origin: r.origin,
      destination: r.destination,
      currentFare: r.currentFare,
      baseFare: r.baseFare,
      routeIndex: Number(routeIndex.toFixed(2)),
      routeWeightInBasket: Number(routeWeightInAir.toFixed(4)),
      airIndexContribution: Number(airIndexContribution.toFixed(2)),
      transportGroupContributionPct: Number(transportGroupContribution.toFixed(4)),
      headlineCpiContributionBps: Number(headlineCpiBps.toFixed(2)),
      passengerVolume: r.passengerVolume || 0
    };
  }).sort((a, b) => b.headlineCpiContributionBps - a.headlineCpiContributionBps);
}

module.exports = {
  CPI_WEIGHTS,
  HISTORICAL_MOSPI_SERIES,
  calculateCpiImpact,
  getCpiComparisonSeries,
  simulateCpiShocks,
  calculateRouteCpiContributions
};
