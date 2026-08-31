/**
 * RouteFareSearch Mongoose Model
 * Stores comprehensive airline/OTA fare search results with metadata.
 */

const mongoose = require("mongoose");

const RouteFareSearchSchema = new mongoose.Schema(
  {
    // =========================
    // ROUTE
    // =========================
    route: {
      origin: {
        airportCode: {
          type: String,
          required: true,
          uppercase: true,
          trim: true
        },
        type: {
          type: String,
          default: "airport"
        },
        description: {
          type: String
        }
      },
      destination: {
        airportCode: {
          type: String,
          required: true,
          uppercase: true,
          trim: true
        },
        type: {
          type: String,
          default: "airport"
        },
        description: {
          type: String
        }
      }
    },

    // =========================
    // SEARCH INFORMATION
    // =========================
    search: {
      departureDate: {
        type: Date,
        required: true
      },
      returnDate: {
        type: Date
      },
      tripType: {
        type: String,
        enum: ["one_way", "round_trip", "multi_city"],
        default: "one_way"
      },
      passengers: {
        adults: { type: Number, default: 1 },
        children: { type: Number, default: 0 },
        infants: { type: Number, default: 0 }
      },
      cabinClass: {
        type: String,
        enum: ["economy", "premium_economy", "business", "first"],
        default: "economy"
      }
    },

    // =========================
    // FARE DATA
    // =========================
    fares: [
      {
        departureDate: {
          type: Date,
          required: true
        },
        returnDate: {
          type: Date
        },
        price: {
          base: { type: Number, default: 0 },
          tax: { type: Number, default: 0 },
          total: { type: Number, required: true },
          currency: { type: String, default: "INR" }
        },
        source: {
          type: {
            type: String,
            enum: ["airline", "ota"],
            default: "airline"
          },
          name: {
            type: String,
            default: "Air India"
          }
        },
        scrapedAt: {
          type: Date,
          default: Date.now
        }
      }
    ],

    // =========================
    // DATA SOURCE
    // =========================
    source: {
      provider: {
        type: String,
        default: "Air India"
      },
      type: {
        type: String,
        enum: ["airline", "ota"],
        default: "airline"
      },
      url: {
        type: String,
        default: "https://www.airindia.com"
      },
      scraper: {
        name: { type: String, default: "airindia-api" },
        version: { type: String, default: "1.0.0" }
      }
    },

    // =========================
    // DATA QUALITY
    // =========================
    dataQuality: {
      status: {
        type: String,
        enum: ["verified", "partial", "stale", "failed"],
        default: "verified"
      },
      scrapedAt: {
        type: Date,
        default: Date.now
      },
      expiresAt: {
        type: Date
      }
    }
  },
  {
    timestamps: true
  }
);

RouteFareSearchSchema.index({ "route.origin.airportCode": 1, "route.destination.airportCode": 1, "search.departureDate": 1 });
RouteFareSearchSchema.index({ "dataQuality.scrapedAt": -1 });

module.exports = mongoose.models.RouteFareSearch || mongoose.model("RouteFareSearch", RouteFareSearchSchema);
