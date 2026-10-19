"""
recognition/config.py
---------------------
All tunable constants for the recognition service.
Change values here; do not scatter magic numbers across modules.
"""

import os

# ---------------------------------------------------------------------------
# Paths (resolved relative to the project root, not this file's location)
# ---------------------------------------------------------------------------

# Model file lives in the project root next to the original test script.
MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "isl_transformer_best_132.keras")

# Hardcoded class list in the exact sorted order that was used during training.
# DO NOT change the order; it must match model output neuron indices.
CLASS_NAMES = [
    "Destination",   # 0
    "Platform",      # 1
    "Route",         # 2
    "Ticket",        # 3
    "Train",         # 4
    "When",          # 5
    "Where",         # 6
    "help",          # 7
    "lost",          # 8
    "medical",       # 9
    "security",      # 10
]

# ---------------------------------------------------------------------------
# Model / sequence parameters — must match training configuration exactly
# ---------------------------------------------------------------------------

TARGET_FRAMES      = 20   # Frames in one input sequence
NUM_FEATURES       = 132  # Features per frame: 21*3 (LH) + 21*3 (RH) + 3 (LS) + 3 (RS)
SAMPLE_EVERY_N     = 5    # Sample one landmark frame every N captured frames

# ---------------------------------------------------------------------------
# Confidence thresholds — must match test_live_isl.py exactly
# ---------------------------------------------------------------------------

DEFAULT_THRESHOLD  = 0.80
LOW_THRESHOLD      = 0.70
TRAIN_THRESHOLD    = 0.60   # 60% for Train sign sensitivity
WHERE_THRESHOLD    = 0.50   # 60% for Where sign sensitivity
ROUTE_THRESHOLD    = 0.70   # 70% for Route sign sensitivity

# Custom thresholds per gesture (lowercase)
GESTURE_THRESHOLDS = {
    "train":       0.60,
    "where":       0.50,
    "route":       0.70,
    "destination": 0.70,
}

# Contextual allowed gestures per screen
SCREEN_GESTURES = {
    "idle":     ["train", "where", "help", "medical", "security", "ticket"],
    "home":     ["train", "where", "help", "medical", "security", "ticket"],
    "train":    ["when", "destination", "route", "platform", "medical", "security"],
    "help":     ["medical", "security", "lost"],
    "where":    ["where", "ticket", "medical", "security", "help"],
    "when":     ["when", "destination", "route", "train", "medical", "security"],
    "dest":     ["destination", "when", "route", "train", "medical", "security"],
    "route":    ["route", "when", "destination", "train", "medical", "security"],
    "board":    ["train", "when", "destination", "route", "platform", "medical", "security"],
    "lost":     ["lost", "help", "medical", "security"],
    "medical":  ["medical", "help", "security"],
    "security": ["security", "help", "medical"],
    "sos":      ["medical", "security", "help"],
    "ticket":   ["ticket", "train", "where", "help", "medical", "security"],
}

CONFIRMATION_FRAMES = 3   # Consecutive qualifying predictions required

# ---------------------------------------------------------------------------
# Camera
# ---------------------------------------------------------------------------

CAMERA_INDEX       = 0
PREVIEW_WIDTH      = 320
PREVIEW_HEIGHT     = 240
PREVIEW_JPEG_QUALITY = 70  # MJPEG quality (0–100)

# ---------------------------------------------------------------------------
# Server endpoints
# ---------------------------------------------------------------------------

PYTHON_SERVICE_HOST = "0.0.0.0"
PYTHON_SERVICE_PORT = 8765   # WebSocket port
MJPEG_HOST          = "0.0.0.0"
MJPEG_PORT          = 8766   # HTTP MJPEG preview port
