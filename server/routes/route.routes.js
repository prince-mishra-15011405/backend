/**
 * Route Level Routes
 */

const express = require("express");
const router = express.Router();
const routeController = require("../controllers/route.controller");

router.get("/routes", routeController.getRoutes);
router.get("/routes/:route", routeController.getRouteById);
router.get("/routes/:route/history", routeController.getRouteHistory);

module.exports = router;
