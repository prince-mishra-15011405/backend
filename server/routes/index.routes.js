/**
 * Index & System Routes
 */

const express = require("express");
const router = express.Router();
const indexController = require("../controllers/index.controller");

router.get("/health", indexController.getHealth);
router.get("/index", indexController.getIndex);
router.get("/index/history", indexController.getIndexHistory);
router.post("/refresh", indexController.refresh);

module.exports = router;
