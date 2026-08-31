/**
 * CPI Augmentation & Macro-Inflation Routes
 */

const express = require("express");
const router = express.Router();
const cpiController = require("../controllers/cpi.controller");

// Summary endpoint
router.get("/", cpiController.getCpiSummary);
router.get("/summary", cpiController.getCpiSummary);

// Time-series comparison (Real-Time vs MOSPI Official)
router.get("/comparison", cpiController.getCpiComparison);

// Route-level CPI basket decomposition
router.get("/decomposition", cpiController.getCpiDecomposition);
router.get("/routes", cpiController.getCpiDecomposition);

// Policy & Inflation Shock Simulator
router.get("/simulate", cpiController.simulateCpiShocks);

module.exports = router;
