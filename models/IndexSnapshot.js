/**
 * IndexSnapshot Mongoose Model
 * Historical snapshots of the calculated India Airfare Price Index over time.
 */

const mongoose = require("mongoose");

const IndexSnapshotSchema = new mongoose.Schema(
  {
    indiaAirfareIndex: {
      type: Number,
      required: true
    },
    baseIndex: {
      type: Number,
      default: 100
    },
    referenceYear: {
      type: Number
    },
    basePeriodStart: {
      type: Date
    },
    basePeriodEnd: {
      type: Date
    },
    basketSize: {
      type: Number
    },
    routeCount: {
      type: Number,
      default: 0
    },
    observationCount: {
      type: Number,
      default: 0
    },
    change24h: {
      type: Number,
      default: null
    },
    change7d: {
      type: Number,
      default: null
    },
    routes: [
      {
        route: String,
        currentFare: Number,
        baseFare: Number,
        index: Number,
        passengerVolume: Number,
        weight: Number,
        contribution: Number,
        observations: Number,
        change24h: { type: Number, default: null },
        change7d: { type: Number, default: null }
      }
    ],
    warnings: {
      type: Array,
      default: []
    },
    calculatedAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: true
  }
);

IndexSnapshotSchema.index({ calculatedAt: -1 });

module.exports = mongoose.models.IndexSnapshot || mongoose.model("IndexSnapshot", IndexSnapshotSchema);
