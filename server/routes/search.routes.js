/**
 * Search Routes
 */

const express = require("express");
const router = express.Router();
const searchController = require("../controllers/search.controller");

router.get("/search", searchController.search);
router.get("/search/poll", searchController.pollSearchSession);
router.get("/search/session/:id", searchController.pollSearchSession);

module.exports = router;
