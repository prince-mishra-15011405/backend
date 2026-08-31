/**
 * Data Stream & Quality Routes
 */

const express = require("express");
const router = express.Router();
const dataController = require("../controllers/data.controller");

router.get("/data/status", dataController.getDataStatus);
router.get("/data/quality", dataController.getDataQuality);

module.exports = router;
