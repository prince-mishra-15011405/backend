/**
 * Scraper Routes
 */

const express = require("express");
const router = express.Router();
const scraperController = require("../controllers/scraper.controller");

router.post("/run", scraperController.runScraperManual);
router.get("/status", scraperController.getScraperStatus);
router.get("/jobs", scraperController.getScrapeJobs);
router.post("/jobs", scraperController.createScrapeJob);
router.patch("/jobs/:id", scraperController.updateScrapeJob);
router.delete("/jobs/:id", scraperController.deleteScrapeJob);

module.exports = router;
