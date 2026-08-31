/**
 * Default Scraper Routes Configuration
 * 
 * Defines the default domestic Air India routes to scrape.
 * Used by scraper.service.js when no MongoDB ScrapeJob documents exist.
 * These are the top 25 busiest domestic Indian air routes by passenger volume.
 */

// ── Shared Route Set ──────────────────────────────────────────────────────────
// Single source of truth: every registered airline scrapes the same 25 routes.
const SHARED_ROUTES = [
  // Tier 1: Ultra-High Traffic Metro Routes
  { origin: "DEL", destination: "BOM", priority: 1 },
  { origin: "DEL", destination: "BLR", priority: 1 },
  { origin: "BOM", destination: "BLR", priority: 1 },
  { origin: "DEL", destination: "HYD", priority: 1 },
  { origin: "BOM", destination: "HYD", priority: 1 },
  { origin: "DEL", destination: "CCU", priority: 1 },

  // Tier 2: High Traffic Routes
  { origin: "DEL", destination: "MAA", priority: 2 },
  { origin: "BOM", destination: "MAA", priority: 2 },
  { origin: "BLR", destination: "HYD", priority: 2 },
  { origin: "BOM", destination: "CCU", priority: 2 },
  { origin: "DEL", destination: "GOI", priority: 2 },
  { origin: "BOM", destination: "GOI", priority: 2 },
  { origin: "DEL", destination: "AMD", priority: 2 },
  { origin: "BOM", destination: "AMD", priority: 2 },

  // Tier 3: Medium Traffic Routes
  { origin: "DEL", destination: "PNQ", priority: 3 },
  { origin: "BOM", destination: "PNQ", priority: 3 },
  { origin: "BLR", destination: "CCU", priority: 3 },
  { origin: "BLR", destination: "MAA", priority: 3 },
  { origin: "DEL", destination: "COK", priority: 3 },
  { origin: "BOM", destination: "COK", priority: 3 },
  { origin: "HYD", destination: "MAA", priority: 3 },
  { origin: "BLR", destination: "GOI", priority: 3 },
  { origin: "CCU", destination: "BLR", priority: 3 },
  { origin: "HYD", destination: "CCU", priority: 3 },
  { origin: "DEL", destination: "JAI", priority: 3 },
];

// Backwards-compatible aliases pointing at the shared route set
const DEFAULT_AIRINDIA_ROUTES = SHARED_ROUTES;
const DEFAULT_SPICEJET_ROUTES = SHARED_ROUTES;
const DEFAULT_MAKEMYTRIP_ROUTES = SHARED_ROUTES;
const DEFAULT_AGODA_ROUTES = SHARED_ROUTES;
const DEFAULT_IRCTC_ROUTES = SHARED_ROUTES;

// All active registered airline sources — used by "all" / multi-provider modes
const ALL_SOURCES = ["Air India", "Agoda", "IRCTC Air"];

/**
 * Builds a scraper job configuration object
 */
function buildScrapeJob(route, source = "Air India", departureDate = null, days = 30) {
  const depDate = departureDate || getNextSearchDate();
  return {
    source,
    origin: route.origin,
    destination: route.destination,
    departureDate: depDate,
    days: days || 30,
    enabled: true,
    priority: route.priority || 1
  };
}

/**
 * Returns the next reasonable search date (3 days from today)
 */
function getNextSearchDate() {
  const date = new Date();
  date.setDate(date.getDate() + 3);
  return date;
}

/**
 * Returns default routes as job objects for a given source or all sources
 */
function getAllDefaultJobs(source = "Air India", departureDate = null) {
  const normSource = String(source || "").trim().toLowerCase();

  // "all" / "both" → generate jobs for EVERY registered airline
  if (normSource === "all" || normSource === "both") {
    return ALL_SOURCES.flatMap(src =>
      SHARED_ROUTES.map(route => buildScrapeJob(route, src, departureDate))
    );
  }

  // Specific airline requested
  const matchedSource = ALL_SOURCES.find(s => s.toLowerCase() === normSource)
    || (normSource.includes("spice") ? "SpiceJet" : null)
    || "Air India";

  return SHARED_ROUTES.map(route => buildScrapeJob(route, matchedSource, departureDate));
}

/**
 * Returns default routes filtered by priority tier
 */
function getJobsByPriority(priority = 1, source = "Air India", departureDate = null) {
  const actualSource = (String(source).toLowerCase().includes("spice")) ? "SpiceJet" : "Air India";

  return SHARED_ROUTES
    .filter(r => r.priority <= priority)
    .map(route => buildScrapeJob(route, actualSource, departureDate));
}

module.exports = {
  SHARED_ROUTES,
  ALL_SOURCES,
  DEFAULT_AIRINDIA_ROUTES,
  DEFAULT_SPICEJET_ROUTES,
  DEFAULT_MAKEMYTRIP_ROUTES,
  DEFAULT_AGODA_ROUTES,
  DEFAULT_IRCTC_ROUTES,
  buildScrapeJob,
  getNextSearchDate,
  getAllDefaultJobs,
  getJobsByPriority
};

