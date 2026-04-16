const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 5500;

app.use(cors());
app.use(express.json());


// 🚗 ROUTE API
app.get("/route", (req, res) => {
  res.json({
    routes: [
      {
        type: "Shortest Route",
        distance: 120,
        duration: 150,
        color: "blue",
        path: [[12.97, 77.59], [13.0, 77.6]]
      },
      {
        type: "Best Route",
        distance: 130,
        duration: 140,
        color: "green",
        path: [[12.97, 77.59], [13.1, 77.65]]
      },
      {
        type: "Fuel Efficient",
        distance: 140,
        duration: 160,
        color: "orange",
        path: [[12.97, 77.59], [13.2, 77.7]]
      }
    ]
  });
});


// 🌦️ WEATHER API (FIXED)
app.get("/weather", (req, res) => {
  const weatherTypes = ["Sunny", "Rainy", "Cloudy", "Stormy"];

  const randomWeather =
    weatherTypes[Math.floor(Math.random() * weatherTypes.length)];

  res.json({
    weather: randomWeather,
    temperature: Math.floor(Math.random() * 10) + 25,
    humidity: Math.floor(Math.random() * 40) + 40
  });
});


// 🚦 TRAFFIC PREDICTION API (IMPORTANT)
app.get("/predict", (req, res) => {
  const { hour, day, dist, dur, vehicle } = req.query;

  let congestion = "Low";

  // Basic logic
  if ((hour >= 8 && hour <= 10) || (hour >= 17 && hour <= 20)) {
    congestion = "High";
  } else if (hour >= 11 && hour <= 16) {
    congestion = "Medium";
  }

  if (day == 1) {
    congestion = "Medium"; // weekend
  }

  let advice = "";
  if (congestion === "High") {
    advice = "Heavy traffic detected. Consider alternate routes.";
  } else if (congestion === "Medium") {
    advice = "Moderate traffic. Plan accordingly.";
  } else {
    advice = "Traffic is smooth. Good to go!";
  }

  const hotels = [
    "Hotel Paradise",
    "City Inn",
    "Green Stay",
    "Highway Rest"
  ];

  const traffic_points = Array.from({ length: 10 }, () =>
    Math.floor(Math.random() * 100)
  );

  const leave_time =
    congestion === "High"
      ? "Leave 30 minutes earlier"
      : "You can leave on time";

  res.json({
    congestion_level: congestion,
    advice,
    weather: "Partly Cloudy",
    hotels,
    leave_time,
    traffic_points
  });
});


// 🚀 START SERVER
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});