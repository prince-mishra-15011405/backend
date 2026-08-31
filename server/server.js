/**
 * India Airfare Intelligence Dashboard - Express REST API Server
 */

require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");

const { connectDatabase } = require("../config/database");
const cronService = require("../services/cron.service");

const dashboardRoutes = require("./routes/dashboard.routes");
const indexRoutes = require("./routes/index.routes");
const routeRoutes = require("./routes/route.routes");
const searchRoutes = require("./routes/search.routes");
const dataRoutes = require("./routes/data.routes");
const scraperRoutes = require("./routes/scraper.routes");
const cpiRoutes = require("./routes/cpi.routes");

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

// Middleware
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || origin === FRONTEND_URL || origin.startsWith("http://localhost:")) {
        return callback(null, true);
      }
      return callback(null, true); // Permissive for prototype development
    },
    credentials: true
  })
);

app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, "..", "public")));

// API Routes mounted under /api
app.use("/api", indexRoutes);
app.use("/api", dashboardRoutes);
app.use("/api", routeRoutes);
app.use("/api", searchRoutes);
app.use("/api", dataRoutes);
app.use("/api/cpi", cpiRoutes);
app.use("/api/scraper", scraperRoutes);

// Root route serves the demo dashboard HTML
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

// API Tester page for previewing & testing all endpoints
app.get("/api-tester", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "api-tester.html"));
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: "ENDPOINT_NOT_FOUND",
      message: `Endpoint ${req.method} ${req.originalUrl} not found.`
    }
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("[ERROR]", err);
  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: err.message || "An unexpected server error occurred."
    }
  });
});

// Server Startup Sequence: DB -> Server -> Cron
async function startServer() {
  await connectDatabase();

  return new Promise((resolve) => {
    const server = app.listen(PORT, () => {
      console.log("========================================");
      console.log(`[SERVER] API running on port ${PORT}`);
      console.log(`Health Check: http://localhost:${PORT}/api/health`);
      console.log(`Dashboard:    http://localhost:${PORT}/api/dashboard`);
      console.log("========================================");

      // Start Cron scheduler after server boots
      cronService.startCronScheduler();
      resolve(server);
    });
  });
}

// Start listening if run directly
if (require.main === module) {
  startServer();
}

module.exports = app;
