# 🚦 AI Smart Traffic Congestion Predictor & Route Optimizer

A beginner-friendly full-stack web app that uses machine learning to predict
traffic congestion and display optimised routes on Google Maps.

```
traffic-ai-project/
├── frontend/
│   ├── index.html      ← Main UI page
│   ├── style.css       ← Dark industrial styling
│   └── script.js       ← Map + API calls
├── backend/
│   ├── server.js       ← Express app entry point
│   ├── routes.js       ← API endpoints (/route, /predict)
│   └── package.json    ← Node dependencies
├── ai-model/
│   ├── dataset.csv     ← Training data (hour, day, location, congestion)
│   ├── train.py        ← Train the Random Forest model
│   └── model.py        ← Predict congestion (called by Node.js)
├── database/
│   └── schema.js       ← MongoDB schemas (Mongoose)
└── README.md           ← This file
```

---

## 🛠️ Prerequisites

| Tool        | Minimum Version | Download |
|-------------|----------------|---------|
| Node.js     | v16+           | https://nodejs.org |
| Python      | 3.8+           | https://python.org |
| Git         | any            | https://git-scm.com |
| Google Maps API key | – | https://console.cloud.google.com |

---

## ⚡ Quick Start (5 Steps)

### Step 1 — Install Node.js dependencies

```bash
cd backend
npm install
```

This installs **express** and **cors** from `package.json`.

---

### Step 2 — Install Python libraries

```bash
cd ai-model
pip install pandas scikit-learn joblib numpy
```

| Library       | Purpose                            |
|---------------|------------------------------------|
| pandas        | Read the CSV dataset               |
| scikit-learn  | Random Forest classifier           |
| joblib        | Save/load trained model            |
| numpy         | Numerical arrays for model input   |

---

### Step 3 — Train the AI model

```bash
cd ai-model
python train.py
```

Expected output:
```
📂 Loading dataset...
   Loaded 108 rows
🌲 Training Random Forest model...
   Training complete ✅
📈 Test Accuracy: 91.3%
💾 Model saved → traffic_model.pkl
```

This creates `ai-model/traffic_model.pkl` — the trained model file.

> **Note:** If you skip this step, the backend falls back to a simple
> rule-based predictor (still works, just not ML-powered).

---

### Step 4 — Start the backend server

```bash
cd backend
node server.js
```

You should see:
```
🚦 TrafficAI Backend running at http://localhost:3000
   • GET /health  → server check
   • GET /route   → route distance & duration
   • GET /predict → AI congestion prediction
```

Test it: open http://localhost:3000/health in your browser.

---

### Step 5 — Configure and open the frontend

**Add your Google Maps API key:**

1. Go to https://console.cloud.google.com/
2. Create a project → Enable **Maps JavaScript API** + **Directions API** + **Places API**
3. Create an API key
4. Open `frontend/index.html` and replace:
   ```html
   key=YOUR_GOOGLE_MAPS_API_KEY
   ```
   with your actual key.

**Open the frontend:**

Simply open `frontend/index.html` in your browser.
(Double-click the file, or drag it into Chrome/Firefox)

> **Tip:** If you hit CORS issues, serve it with:
> ```bash
> npx serve frontend
> ```

---

## 🔌 API Reference

### `GET /route`

Returns route distance and duration.

| Parameter   | Type   | Example           |
|-------------|--------|-------------------|
| source      | string | "Connaught Place" |
| destination | string | "Cyber City"      |
| hour        | number | 8                 |

**Response:**
```json
{
  "source": "Connaught Place",
  "destination": "Cyber City",
  "distance": "30.2 km",
  "duration": "55 min",
  "summary": "Via NH48"
}
```

---

### `GET /predict`

Returns AI congestion prediction.

| Parameter   | Type   | Example           |
|-------------|--------|-------------------|
| source      | string | "Connaught Place" |
| destination | string | "Cyber City"      |
| hour        | number | 8 (0–23)          |
| day         | number | 0 (weekday) / 1   |

**Response:**
```json
{
  "congestion_level": "High",
  "confidence": 0.87,
  "advice": "Heavy traffic predicted. Delay trip or use alternate routes.",
  "source": "ml-model"
}
```

---

## 🤖 AI Model Details

**Algorithm:** Random Forest Classifier

**Input features:**

| Feature  | Description              | Values  |
|----------|--------------------------|---------|
| hour     | Hour of the day          | 0–23    |
| day      | Weekday or weekend       | 0 or 1  |
| location | City encoded as number   | 0–9     |

**Output:**

| Class | Label  | Meaning                         |
|-------|--------|---------------------------------|
| 0     | Low    | Light traffic, safe to travel   |
| 1     | Medium | Moderate, consider leaving early|
| 2     | High   | Heavy traffic, delay if possible|

**Location codes used in dataset:**

| Code | City       |
|------|------------|
| 0    | Delhi      |
| 1    | Mumbai     |
| 2    | Bengaluru  |
| 3    | Hyderabad  |
| 4    | Chennai    |
| 5    | Gurugram   |
| 6    | Noida      |
| 7    | Pune       |

---

## 🗄️ Database (Optional)

The app works without a database. To add MongoDB persistence:

1. Install MongoDB: https://www.mongodb.com/try/download/community
2. Install Mongoose: `npm install mongoose` (in backend/)
3. Add to `backend/server.js`:
   ```js
   const mongoose = require('mongoose');
   mongoose.connect('mongodb://localhost:27017/trafficai')
     .then(() => console.log('MongoDB connected'))
     .catch(err => console.error(err));
   ```
4. Import schemas from `database/schema.js` in your routes

---

## 🐛 Troubleshooting

| Problem | Solution |
|---------|---------|
| Map not loading | Check your Google Maps API key; ensure Maps JS + Directions + Places APIs are enabled |
| CORS error | Make sure backend is running on port 3000 |
| Python not found | Use `python3` instead of `python` on macOS/Linux |
| `traffic_model.pkl` not found | Run `python train.py` first |
| Port 3000 in use | Change `PORT = 3000` in `server.js` to 3001 and update `BACKEND_URL` in `script.js` |

---

## 🚀 Improvements You Can Make

- [ ] Use real Google Directions API on the backend for actual distances
- [ ] Add geocoding to encode lat/lng instead of city name strings
- [ ] Collect real traffic data and retrain the model monthly
- [ ] Add user authentication (JWT)
- [ ] Deploy backend to Railway / Render and frontend to Vercel / Netlify
- [ ] Add more features: weather, incidents, road works

---

## 📄 Licence

MIT – free to use and modify for learning and projects.
