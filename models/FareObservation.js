/**
 * FareObservation Mongoose Model
 */

const mongoose = require("mongoose");

const FareObservationSchema = new mongoose.Schema(
  {
    source: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    airline: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    flightNo: {
      type: String,
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
    route: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true
    },
    departureDate: {
      type: Date,
      required: true,
      index: true
    },
    returnDate: {
      type: Date
    },
    departureTime: {
      type: String,
      trim: true
    },
    arrivalTime: {
      type: String,
      trim: true
    },
    duration: {
      type: String,
      trim: true
    },
    fareType: {
      type: String,
      default: "Economy",
      trim: true
    },
    cabinClass: {
      type: String,
      default: "Economy",
      trim: true
    },
    stops: {
      type: Number,
      default: 0
    },
    totalFare: {
      type: Number,
      required: true,
      min: 1
    },
    currency: {
      type: String,
      default: "INR",
      uppercase: true
    },
    scrapedAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    searchTimestamp: {
      type: Date,
      default: Date.now
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

// Compound indexes for optimal queries
FareObservationSchema.index({ route: 1, departureDate: 1, scrapedAt: -1 });
FareObservationSchema.index({ route: 1, scrapedAt: -1 });
FareObservationSchema.index({ source: 1, scrapedAt: -1 });

module.exports = mongoose.models.FareObservation || mongoose.model("FareObservation", FareObservationSchema);
