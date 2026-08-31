/**
 * Scraper Management Controller
 */

const scraperService = require("../../services/scraper.service");
const ScrapeJob = require("../../models/ScrapeJob");
const { sendSuccess, sendError } = require("../utils/response");
const { isDbConnected } = require("../../config/database");

/**
 * POST /api/scraper/run
 * Manually triggers scraper cycle for all or a single job.
 */
async function runScraperManual(req, res) {
  try {
    const { jobId, origin, destination, departureDate, days, source } = req.body || {};

    if (jobId && isDbConnected()) {
      const job = await ScrapeJob.findById(jobId);
      if (!job) {
        return sendError(res, "JOB_NOT_FOUND", `Scrape job ${jobId} not found.`, 404);
      }
      if (days) job.days = parseInt(days, 10);
      const obs = await scraperService.runScraper(job);
      return sendSuccess(res, {
        message: `Scrape job executed successfully`,
        job: `${job.source} ${job.origin} → ${job.destination}`,
        days: job.days || 30,
        observationsCollected: obs.length
      });
    }

    if (origin && destination) {
      const daysCount = parseInt(days || 30, 10);
      const obs = await scraperService.scrapeRoute(
        source || "Air India",
        origin,
        destination,
        departureDate || new Date(),
        daysCount
      );
      return sendSuccess(res, {
        message: `Route scrape executed successfully for ${daysCount} days`,
        job: `${source || "Air India"} ${origin.toUpperCase()} → ${destination.toUpperCase()}`,
        days: daysCount,
        observationsCollected: obs.length
      });
    }

    // Run all enabled scrapers
    const outcome = await scraperService.runAllScrapers();
    return sendSuccess(res, {
      message: "Scraping cycle executed",
      results: outcome.results,
      errors: outcome.errors
    });

  } catch (err) {
    return sendError(res, "SCRAPE_RUN_FAILED", err.message, 500);
  }
}

/**
 * GET /api/scraper/status
 */
function getScraperStatus(req, res) {
  try {
    const status = scraperService.getStatus();
    return sendSuccess(res, status);
  } catch (err) {
    return sendError(res, "SCRAPER_STATUS_FAILED", err.message, 500);
  }
}

/**
 * GET /api/scraper/jobs
 */
async function getScrapeJobs(req, res) {
  try {
    if (!isDbConnected()) {
      return sendSuccess(res, []);
    }
    const jobs = await ScrapeJob.find({}).sort({ priority: 1, createdAt: -1 });
    return sendSuccess(res, jobs);
  } catch (err) {
    return sendError(res, "JOBS_FETCH_FAILED", err.message, 500);
  }
}

/**
 * POST /api/scraper/jobs
 */
async function createScrapeJob(req, res) {
  try {
    if (!isDbConnected()) {
      return sendError(res, "DB_DISCONNECTED", "MongoDB is required to manage scrape jobs.", 503);
    }

    const { source, origin, destination, departureDate, days, enabled, priority } = req.body || {};

    if (!origin || !destination) {
      return sendError(res, "INVALID_JOB_PARAMS", "Origin and destination airport codes are required.", 400);
    }

    const job = new ScrapeJob({
      source: source || "Air India",
      origin: String(origin).toUpperCase().trim(),
      destination: String(destination).toUpperCase().trim(),
      departureDate: departureDate ? new Date(departureDate) : new Date(),
      days: parseInt(days || 30, 10),
      enabled: enabled !== undefined ? enabled : true,
      priority: priority || 1
    });

    await job.save();
    return sendSuccess(res, job, 201);

  } catch (err) {
    return sendError(res, "JOB_CREATE_FAILED", err.message, 500);
  }
}

/**
 * PATCH /api/scraper/jobs/:id
 */
async function updateScrapeJob(req, res) {
  try {
    if (!isDbConnected()) {
      return sendError(res, "DB_DISCONNECTED", "MongoDB is required to manage scrape jobs.", 503);
    }

    const updated = await ScrapeJob.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) {
      return sendError(res, "JOB_NOT_FOUND", `Scrape job ${req.params.id} not found.`, 404);
    }

    return sendSuccess(res, updated);
  } catch (err) {
    return sendError(res, "JOB_UPDATE_FAILED", err.message, 500);
  }
}

/**
 * DELETE /api/scraper/jobs/:id
 */
async function deleteScrapeJob(req, res) {
  try {
    if (!isDbConnected()) {
      return sendError(res, "DB_DISCONNECTED", "MongoDB is required to manage scrape jobs.", 503);
    }

    const deleted = await ScrapeJob.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return sendError(res, "JOB_NOT_FOUND", `Scrape job ${req.params.id} not found.`, 404);
    }

    return sendSuccess(res, { message: "Scrape job deleted", id: req.params.id });
  } catch (err) {
    return sendError(res, "JOB_DELETE_FAILED", err.message, 500);
  }
}

module.exports = {
  runScraperManual,
  getScraperStatus,
  getScrapeJobs,
  createScrapeJob,
  updateScrapeJob,
  deleteScrapeJob
};
