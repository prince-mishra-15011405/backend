/**
 * Airport Mongoose Model
 * Normalization mapping between IATA airport codes and Indian city names.
 */

const mongoose = require("mongoose");

const AirportSchema = new mongoose.Schema(
  {
    airportCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true
    },
    city: {
      type: String,
      required: true,
      trim: true
    },
    cityNormalized: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.models.Airport || mongoose.model("Airport", AirportSchema);
