/**
 * MongoDB Database Connection Manager
 */

const mongoose = require("mongoose");

let isConnected = false;

/**
 * Connect to MongoDB using Mongoose.
 * @returns {Promise<typeof mongoose>}
 */
async function connectDatabase() {
  if (isConnected) {
    return mongoose;
  }

  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/india_airfare_index";

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000 // Quick timeout if local DB isn't running
    });
    isConnected = true;
    console.log(`[DB] MongoDB connected successfully to ${conn.connection.name}`);

    mongoose.connection.on("error", (err) => {
      console.error("[DB] MongoDB runtime error:", err.message);
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("[DB] MongoDB disconnected.");
      isConnected = false;
    });

    return conn;
  } catch (err) {
    console.warn(`[DB] MongoDB connection notice: ${err.message}. Running in graceful fallback mode.`);
    isConnected = false;
    return null;
  }
}

/**
 * Check if MongoDB is currently connected.
 */
function isDbConnected() {
  return isConnected && mongoose.connection.readyState === 1;
}

module.exports = {
  connectDatabase,
  isDbConnected
};
