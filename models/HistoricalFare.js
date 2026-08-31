/**
 * HistoricalFare Mongoose Model
 * Baseline observations used for dynamic base-period calculation.
 */

const mongoose = require("mongoose");

const HistoricalFareSchema = new mongoose.Schema(
  {
    route: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true
    },
    fare: {
      type: Number,
      required: true,
      min: 1
    },
    date: {
      type: Date,
      required: true,
      index: true
    },
    source: {
      type: String,
      trim: true,
      default: "Historical Observation"
    },
    airline: {
      type: String,
      trim: true
    }
  },
  {
    timestamps: true
  }
);

HistoricalFareSchema.index({ route: 1, date: 1 });

module.exports = mongoose.models.HistoricalFare || mongoose.model("HistoricalFare", HistoricalFareSchema);
