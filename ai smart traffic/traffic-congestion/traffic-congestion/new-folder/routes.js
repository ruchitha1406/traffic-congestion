const express = require("express");
const router = express.Router();

// Mock route data
router.get("/route", (req, res) => {
  res.json({
    routes: [
      { type: "Shortest Route", distance: 120, duration: 150, color: "blue", path: [[12.97,77.59],[13.0,77.6]] },
      { type: "Best Route", distance: 130, duration: 140, color: "green", path: [[12.97,77.59],[13.1,77.65]] },
      { type: "Fuel Efficient", distance: 140, duration: 160, color: "orange", path: [[12.97,77.59],[13.2,77.7]] }
    ]
  });
});

// Mock weather
router.get("/weather", (req, res) => {
  const city = req.query.city || "Unknown";
  res.json({
    city,
    temp: 28,
    desc: "Sunny with light breeze"
  });
});

// Mock hotels
router.get("/hotels", (req, res) => {
  const city = req.query.city || "Unknown";
  res.json({
    city,
    hotels: [
      { name: "Hotel Sunshine" },
      { name: "Grand Palace Inn" },
      { name: "Comfort Stay" }
    ]
  });
});

module.exports = router;
