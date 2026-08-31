/**
 * CPI Benchmark & Nowcast Mongoose Model
 * Stores official MOSPI published series alongside real-time nowcasts.
 */

const mongoose = require("mongoose");

const CpiBenchmarkSchema = new mongoose.Schema(
  {
    period: {
      type: String, // "YYYY-MM"
      required: true,
      unique: true,
      index: true
    },
    releaseDate: {
      type: Date
    },
    isNowcast: {
      type: Boolean,
      default: false
    },
    // Official MOSPI Indices (Base 2012=100)
    official: {
      generalCpi: { type: Number, default: null },
      transportCpi: { type: Number, default: null },
      airTransportCpi: { type: Number, default: null },
      urbanCpi: { type: Number, default: null },
      ruralCpi: { type: Number, default: null }
    },
    // Scraped Real-Time Nowcast Metrics
    nowcast: {
      airfareIndex: { type: Number, required: true },
      estimatedGeneralCpi: { type: Number },
      estimatedTransportCpi: { type: Number },
      headlineCpiImpactBps: { type: Number },
      transportImpactPercentagePoints: { type: Number },
      airfareInflationRate: { type: Number },
      sampleSizeObservations: { type: Number, default: 0 },
      routesCount: { type: Number, default: 0 }
    },
    leadTimeAdvantageDays: {
      type: Number,
      default: 45
    }
  },
  {
    timestamps: true
  }
);

CpiBenchmarkSchema.index({ period: 1, isNowcast: 1 });

module.exports = mongoose.model("CpiBenchmark", CpiBenchmarkSchema);
