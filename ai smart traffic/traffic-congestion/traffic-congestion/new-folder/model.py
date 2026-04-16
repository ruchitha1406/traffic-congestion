"""
╔══════════════════════════════════════════════╗
║            ai-model/model.py                 ║
║  Loads the trained ML model and predicts     ║
║  traffic congestion for given inputs.        ║
║                                              ║
║  Called by the Node.js backend like this:   ║
║    python model.py <hour> <day> <location>  ║
║                                              ║
║  Outputs a JSON string, e.g.:               ║
║  {"congestion_level":"High","confidence":0.9}║
╚══════════════════════════════════════════════╝

HOW TO RUN MANUALLY (for testing):
  python model.py 8 0 2
  → Predicts traffic at 8 AM, weekday, location 2
"""

import sys
import json
import os
import joblib
import numpy as np
import pandas as pd

# ─────────────────────────────────────────────
#  MAP numeric labels → human-readable strings
# ─────────────────────────────────────────────
LABEL_MAP = {
    0: "Low",
    1: "Medium",
    2: "High",
}

ADVICE_MAP = {
    "Low":    "Traffic is light. It's a great time to travel!",
    "Medium": "Moderate congestion expected. Consider leaving early.",
    "High":   "Heavy traffic predicted. Delay trip or use alternate routes.",
}

def predict(hour: int, day: int, location: int) -> dict:
    """
    Load the trained model and predict congestion level.

    Parameters:
        hour     – 0 to 23
        day      – 0=weekday, 1=weekend
        location – 0-9 (city code)

    Returns:
        dict with congestion_level, confidence, advice
    """
    # Path to the saved model file
    script_dir  = os.path.dirname(os.path.abspath(__file__))
    model_path  = os.path.join(script_dir, "traffic_model.pkl")

    # ── Load the model ──
    if not os.path.exists(model_path):
        # Model not trained yet – return a rule-based fallback
        return rule_based_fallback(hour, day)

    model = joblib.load(model_path)

    # ── Prepare input as DataFrame matching training feature names ──
    features = pd.DataFrame([[hour, day, location]], columns=["hour", "day", "location"])

    # ── Predict ──
    prediction    = model.predict(features)[0]           # 0, 1, or 2
    probabilities = model.predict_proba(features)[0]     # e.g. [0.1, 0.2, 0.7]

    level      = LABEL_MAP[int(prediction)]
    confidence = round(float(probabilities[int(prediction)]), 2)

    return {
        "congestion_level": level,
        "confidence":       confidence,
        "advice":           ADVICE_MAP[level],
        "source":           "ml-model",
    }


def rule_based_fallback(hour: int, day: int) -> dict:
    """
    Simple rule-based fallback used if the model file
    hasn't been created yet (before running train.py).
    """
    is_weekday     = (day == 0)
    morning_rush   = 8 <= hour <= 10
    evening_rush   = 17 <= hour <= 19

    if is_weekday and (morning_rush or evening_rush):
        level = "High";   confidence = 0.82
    elif is_weekday and 11 <= hour <= 16:
        level = "Medium"; confidence = 0.68
    else:
        level = "Low";    confidence = 0.75

    return {
        "congestion_level": level,
        "confidence":       confidence,
        "advice":           ADVICE_MAP[level],
        "source":           "rule-based-fallback",
    }


# ─────────────────────────────────────────────
#  MAIN  – reads CLI arguments from Node.js
# ─────────────────────────────────────────────
if __name__ == "__main__":
    try:
        # Node.js passes: python model.py <hour> <day> <location>
        hour     = int(sys.argv[1]) if len(sys.argv) > 1 else 9
        day      = int(sys.argv[2]) if len(sys.argv) > 2 else 0
        location = int(sys.argv[3]) if len(sys.argv) > 3 else 0

        # Clamp values to valid ranges
        hour     = max(0, min(23, hour))
        day      = max(0, min(1,  day))
        location = max(0, min(9,  location))

        result = predict(hour, day, location)

        # Print JSON to stdout – Node.js reads this
        print(json.dumps(result))

    except Exception as e:
        # If anything goes wrong, output a valid JSON error
        # so Node.js can parse it gracefully
        error_result = {
            "congestion_level": "Medium",
            "confidence":       0.5,
            "advice":           "Prediction unavailable. Please try again.",
            "source":           "error-fallback",
            "error":            str(e),
        }
        print(json.dumps(error_result))
