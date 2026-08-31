/**
 * ScrapeJob Mongoose Model
 * Configurable scraping routes and schedules.
 */

const mongoose = require("mongoose");

const ScrapeJobSchema = new mongoose.Schema(
  {
    source: {
      type: String,
      required: true,
      default: "IndiGo",
      trim: true
    },
    origin: {
      type: String,
      required: true,
      uppercase: true,
      trim: true
    },
    destination: {
      type: String,
      required: true,
      uppercase: true,
      trim: true
    },
    departureDate: {
      type: Date,
      required: true
    },
    days: {
      type: Number,
      default: 30
    },
    enabled: {
      type: Boolean,
      default: true,
      index: true
    },
    priority: {
      type: Number,
      default: 1
    },
    lastRunAt: {
      type: Date
    },
    lastSuccessAt: {
      type: Date
    },
    lastErrorAt: {
      type: Date
    },
    lastError: {
      type: String
    },
    lastFare: {
      type: Number,
      default: null
    },
    lastChange24h: {
      type: Number,
      default: null
    },
    lastChange7d: {
      type: Number,
      default: null
    }
  },
  {
    timestamps: true
  }
);

ScrapeJobSchema.index({ source: 1, origin: 1, destination: 1, enabled: 1 });

module.exports = mongoose.models.ScrapeJob || mongoose.model("ScrapeJob", ScrapeJobSchema);
