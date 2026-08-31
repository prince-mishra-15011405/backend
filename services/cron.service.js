/**
 * Node-Cron Scheduler Service
 * Periodically executes enabled ScrapeJobs and recalculates index snapshots.
 */

const cron = require("node-cron");
const scraperService = require("./scraper.service");

class CronService {
  constructor() {
    this.cronJob = null;
    this.scraperRunning = false;
  }

  /**
   * Starts the cron scheduler if SCRAPER_ENABLED=true.
   */
  startCronScheduler() {
    const isEnabled = process.env.SCRAPER_ENABLED !== "false";
    if (!isEnabled) {
      console.log("[CRON] Scraper scheduler is disabled via SCRAPER_ENABLED=false");
      return;
    }

    const cronExpression = process.env.SCRAPE_CRON || "*/45 * * * *";

    if (!cron.validate(cronExpression)) {
      console.error(`[CRON] Invalid cron expression: "${cronExpression}". Scheduler not started.`);
      return;
    }

    this.cronJob = cron.schedule(cronExpression, async () => {
      if (this.scraperRunning) {
        console.log("[CRON] Previous scrape still running. Skipping cycle.");
        return;
      }

      this.scraperRunning = true;
      console.log(`[CRON] Starting scheduled scrape cycle at ${new Date().toISOString()}`);

      try {
        const { results, errors } = await scraperService.runAllScrapers();
        console.log(`[CRON] Scraping completed. Processed: ${results.length} jobs, Errors: ${errors.length}`);
      } catch (err) {
        console.error("[CRON] Scheduled scrape cycle error:", err.message);
      } finally {
        this.scraperRunning = false;
      }
    });

    console.log(`[CRON] Scheduler started with expression: "${cronExpression}"`);
  }

  /**
   * Stops the cron scheduler.
   */
  stopCronScheduler() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log("[CRON] Scheduler stopped.");
    }
  }
}

module.exports = new CronService();
