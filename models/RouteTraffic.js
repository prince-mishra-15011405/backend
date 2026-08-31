/**
 * RouteTraffic Mongoose Model
 * DGCA city-pair passenger volume records.
 */

const mongoose = require("mongoose");

const RouteTrafficSchema = new mongoose.Schema(
  {
    year: {
      type: Number,
      required: true,
      index: true
    },
    month: {
      type: Number
    },
    city1: {
      type: String,
      required: true,
      uppercase: true,
      trim: true
    },
    city2: {
      type: String,
      required: true,
      uppercase: true,
      trim: true
    },
    origin: {
      type: String,
      uppercase: true,
      trim: true
    },
    destination: {
      type: String,
      uppercase: true,
      trim: true
    },
    route: {
      type: String,
      uppercase: true,
      trim: true,
      index: true
    },
    paxToCity2: {
      type: Number,
      default: 0
    },
    paxFromCity2: {
      type: Number,
      default: 0
    },
    passengerVolume: {
      type: Number,
      required: true,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

RouteTrafficSchema.index({ year: 1, route: 1 });

module.exports = mongoose.models.RouteTraffic || mongoose.model("RouteTraffic", RouteTrafficSchema);
