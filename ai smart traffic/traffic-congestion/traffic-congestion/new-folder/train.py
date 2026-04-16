"""
╔══════════════════════════════════════════════╗
║            ai-model/train.py                 ║
║  Trains a Random Forest classifier on our    ║
║  traffic dataset and saves the model to disk ║
║  as 'traffic_model.pkl'                      ║
╚══════════════════════════════════════════════╝

HOW TO RUN:
  cd ai-model
  pip install pandas scikit-learn joblib
  python train.py
"""

# ── Imports ──────────────────────────────────
import pandas as pd                          # For reading CSV data
from sklearn.ensemble import RandomForestClassifier  # Our ML model
from sklearn.model_selection import train_test_split  # Split data for testing
from sklearn.metrics import classification_report     # Show model accuracy
import joblib                                # Save/load the trained model
import os

# ─────────────────────────────────────────────
#  STEP 1: Load the dataset
# ─────────────────────────────────────────────
print("📂 Loading dataset...")

# Get the directory of this script so paths work from anywhere
script_dir = os.path.dirname(os.path.abspath(__file__))
csv_path   = os.path.join(script_dir, "dataset.csv")

df = pd.read_csv(csv_path)
print(f"   Loaded {len(df)} rows")
print(df.head())

# ─────────────────────────────────────────────
#  STEP 2: Prepare features (X) and labels (y)
# ─────────────────────────────────────────────
"""
Features (inputs to the model):
  hour     – 0 to 23 (hour of day)
  day      – 0=weekday, 1=weekend
  location – 0-9 (city encoded as number)

Label (what we want to predict):
  congestion – 0=Low, 1=Medium, 2=High
"""
X = df[["hour", "day", "location"]]   # Input features
y = df["congestion"]                  # Target label (0, 1, or 2)

print(f"\n📊 Feature columns: {list(X.columns)}")
print(f"   Label distribution:\n{y.value_counts().to_string()}")

# ─────────────────────────────────────────────
#  STEP 3: Split into training and test sets
# ─────────────────────────────────────────────
# 80% of data for training, 20% for testing accuracy
X_train, X_test, y_train, y_test = train_test_split(
    X, y,
    test_size=0.2,     # 20% reserved for testing
    random_state=42    # Fixed seed for reproducibility
)
print(f"\n✂️  Train size: {len(X_train)}, Test size: {len(X_test)}")

# ─────────────────────────────────────────────
#  STEP 4: Train the Random Forest model
# ─────────────────────────────────────────────
"""
Random Forest builds many decision trees and takes
the majority vote. It handles non-linear patterns
(like rush hours) better than Linear Regression.
"""
print("\n🌲 Training Random Forest model...")

model = RandomForestClassifier(
    n_estimators=100,   # Build 100 trees (more = more accurate, slower)
    max_depth=5,         # Each tree is at most 5 levels deep (prevents overfitting)
    random_state=42      # Reproducible results
)

model.fit(X_train, y_train)   # Train the model!
print("   Training complete ✅")

# ─────────────────────────────────────────────
#  STEP 5: Evaluate accuracy on test data
# ─────────────────────────────────────────────
y_pred = model.predict(X_test)
accuracy = (y_pred == y_test).mean() * 100

print(f"\n📈 Test Accuracy: {accuracy:.1f}%")
print("\nDetailed Report:")
print(classification_report(
    y_test, y_pred,
    target_names=["Low", "Medium", "High"]
))

# ─────────────────────────────────────────────
#  STEP 6: Save the trained model to disk
# ─────────────────────────────────────────────
model_path = os.path.join(script_dir, "traffic_model.pkl")
joblib.dump(model, model_path)
print(f"💾 Model saved → {model_path}")
print("\n🎉 Done! You can now run the backend server.")
print("   The model will be loaded automatically by model.py")
