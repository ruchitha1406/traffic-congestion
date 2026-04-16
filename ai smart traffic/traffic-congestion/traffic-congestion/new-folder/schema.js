/*
  ╔══════════════════════════════════════════════╗
  ║            database/schema.js                ║
  ║  MongoDB schema definitions using Mongoose.  ║
  ║  Stores user routes, traffic data,           ║
  ║  and AI prediction history.                  ║
  ╚══════════════════════════════════════════════╝

  HOW TO USE:
    1. Install MongoDB locally or use MongoDB Atlas (free cloud)
    2. npm install mongoose
    3. Import these schemas in server.js or routes.js

  CONNECTION (add to server.js):
    const mongoose = require('mongoose');
    mongoose.connect('mongodb://localhost:27017/trafficai');
*/

const mongoose = require("mongoose");

// ══════════════════════════════════════════════
//  SCHEMA 1: UserRoute
//  Stores each route search made by users.
// ══════════════════════════════════════════════
const userRouteSchema = new mongoose.Schema({

  // Where the user is starting from
  source: {
    type:     String,
    required: true,
    trim:     true,
  },

  // Where the user wants to go
  destination: {
    type:     String,
    required: true,
    trim:     true,
  },

  // Hour of day (0-23)
  hour: {
    type: Number,
    min:  0,
    max:  23,
  },

  // 0 = weekday, 1 = weekend
  day: {
    type: Number,
    enum: [0, 1],
  },

  // Route details returned by the Maps API/mock
  routeInfo: {
    distance: String,   // e.g. "23.4 km"
    duration: String,   // e.g. "45 min"
    summary:  String,   // e.g. "Via NH48"
  },

  // When this search was made
  createdAt: {
    type:    Date,
    default: Date.now,
  },

});

// ══════════════════════════════════════════════
//  SCHEMA 2: TrafficPrediction
//  Stores every AI prediction made.
// ══════════════════════════════════════════════
const trafficPredictionSchema = new mongoose.Schema({

  // Reference to the route this prediction is for
  source:      { type: String, required: true },
  destination: { type: String, required: true },

  // Input features used for prediction
  hour:         { type: Number },
  day:          { type: Number },
  locationCode: { type: Number },

  // AI model output
  congestionLevel: {
    type: String,
    enum: ["Low", "Medium", "High"],
  },

  // How confident was the model? (0.0 to 1.0)
  confidence: {
    type: Number,
    min:  0,
    max:  1,
  },

  // Which prediction source was used
  modelSource: {
    type: String,
    enum: ["ml-model", "rule-based-fallback", "error-fallback"],
  },

  createdAt: {
    type:    Date,
    default: Date.now,
  },

});

// ══════════════════════════════════════════════
//  SCHEMA 3: TrafficData
//  Historical traffic observations
//  (can be filled from real APIs or user reports).
// ══════════════════════════════════════════════
const trafficDataSchema = new mongoose.Schema({

  location: {
    name: String,  // Human-readable city name
    code: Number,  // Numeric code (0-9)
    // For real use: store actual lat/lng
    lat:  Number,
    lng:  Number,
  },

  hour:      { type: Number, min: 0, max: 23 },
  day:       { type: Number, enum: [0, 1] },

  // Actual observed congestion (for model re-training)
  congestionActual: {
    type: Number,
    enum: [0, 1, 2],   // 0=Low, 1=Medium, 2=High
  },

  // Optional: vehicle count from sensors
  vehicleCount: Number,

  // Optional: average speed in km/h
  avgSpeedKmh: Number,

  recordedAt: {
    type:    Date,
    default: Date.now,
  },

});

// ══════════════════════════════════════════════
//  CREATE MONGOOSE MODELS
//  (each model maps to a MongoDB collection)
// ══════════════════════════════════════════════
const UserRoute         = mongoose.model("UserRoute",         userRouteSchema);
const TrafficPrediction = mongoose.model("TrafficPrediction", trafficPredictionSchema);
const TrafficData       = mongoose.model("TrafficData",       trafficDataSchema);

// Export so other files can use them
module.exports = { UserRoute, TrafficPrediction, TrafficData };

// ──────────────────────────────────────────────
//  EXAMPLE USAGE (in routes.js):
//
//  const { UserRoute, TrafficPrediction } = require('../database/schema');
//
//  // Save a search:
//  await new UserRoute({ source, destination, hour, day, routeInfo }).save();
//
//  // Save a prediction:
//  await new TrafficPrediction({ source, destination, hour, day,
//    congestionLevel, confidence, modelSource }).save();
//
//  // Get last 10 searches:
//  const recent = await UserRoute.find().sort({ createdAt: -1 }).limit(10);
// ──────────────────────────────────────────────
