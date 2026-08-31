/**
 * Dashboard Routes
 */

const express = require("express");
const router = express.Router();
const dashboardController = require("../controllers/dashboard.controller");

router.get("/dashboard", dashboardController.getDashboard);

module.exports = router;
