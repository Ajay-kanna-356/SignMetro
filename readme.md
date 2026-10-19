# SignMeet 🚉🤟

**A Sign-First Railway Station Assistance System**  
Chennai Egmore Railway Station · Indian Sign Language · Local Kiosk Prototype

---

## Quick Start

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Python | ≥ 3.10 | Recognition service |
| Node.js | ≥ 18 | Backend + static server |
| Webcam | Any | Gesture input |

### 1. Clone & install Node dependencies

```bash
git clone <repo-url>
cd SignMeet
npm install
```

### 2. Install Python dependencies

```bash
# Recommended: create a virtual environment first
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS / Linux

pip install -r recognition/requirements.txt
```

### 3. Verify model and dataset

The trained model **`isl_transformer_best_132.keras`** must be in the project root.  
The dataset folder **`dataset_sign_metro/`** should also be in the project root (it is used as a fallback for class name discovery, though names are hardcoded in `recognition/config.py`).

### 4. Configure environment (optional)

```bash
cp .env.example .env   # already done by setup
# Edit .env if you need a different port or kiosk ID
```

### 5. Start services

#### Option A — Automatic (Windows)
```
scripts\start_kiosk.bat
```
This opens three windows: Python service, Node backend, and the kiosk browser.

#### Option B — Manual (any OS)

**Terminal 1 — Python recognition service:**
```bash
# From project root (not from recognition/)
python -m recognition.service
```

**Terminal 2 — Node.js backend:**
```bash
npm run dev         # auto-restart via nodemon
# or: npm start    # no auto-restart
```

**Browser:**  
Open `http://localhost:5000`

---

## Service Endpoints

| Service | URL | Description |
|---------|-----|-------------|
| Kiosk UI | `http://localhost:5000` | Main passenger-facing interface |
| REST API | `http://localhost:5000/api` | Train, station, assistance APIs |
| System status | `http://localhost:5000/api/status` | Health check |
| Browser WebSocket | `ws://localhost:5000/ws` | Gesture events (auto-managed by browser) |
| Python WebSocket | `ws://localhost:8765` | Raw gesture events from Python |
| Camera preview | `http://localhost:8766/video_feed` | MJPEG stream (Python-owned camera) |

---

## Gesture Vocabulary

The trained model recognises 11 gestures:

| Gesture | Screen action |
|---------|---------------|
| `TRAIN` | Train information hub |
| `WHEN` | Upcoming departures |
| `DESTINATION` | Train search by destination |
| `ROUTE` | Train route / stops |
| `PLATFORM` | Train board (platform notice) |
| `WHERE` | Station navigation |
| `TICKET` | Ticket counter directions |
| `HELP` | Assistance menu |
| `MEDICAL` | Medical alert (simulated) |
| `SECURITY` | Security alert (simulated) |
| `LOST` | Lost item / person reporting |

> **Note:** `back` and `cancel` appear in the sign simulator but are **not** in the trained model. Navigate backwards using the touchscreen.

---

## Sign Simulator (Demo Mode)

The simulator bar at the bottom of the kiosk UI lets you test all flows **without the Python service or webcam**. Click any gesture button to trigger the corresponding action.

The simulator also works when the Python service is running — it directly dispatches the same intent-router functions that real gestures use.

---

## Testing Real Gesture Recognition End-to-End

1. Start both services (Python + Node).
2. Open `http://localhost:5000` in a browser.
3. Check that the camera widget (bottom-right corner) shows a **green dot** and your live image with hand skeleton overlays.
4. Perform a sign gesture in front of the webcam.
5. Watch the camera widget border:
   - **Yellow** — gesture is being confirmed (needs 3 consecutive matches)
   - **Green flash** — gesture accepted
6. The kiosk screen should change to the corresponding view automatically.
7. Check the browser console for `[Intent] gesture="…"` log messages.
8. Check the Python terminal for `Accepted: <word> (xx%)` log messages.

**Latency note:** The first gesture after startup takes ~3.3 seconds to fill the 20-frame buffer. Subsequent gestures (after the buffer resets) also take ~3.3 seconds plus ~0.5 seconds for 3-consecutive confirmation. This is the designed recognition cadence — not a bug.

---

## Architecture Overview

```
[ Webcam ]
    │
    │ cv2.VideoCapture(0) — Python owns camera exclusively
    ▼
[ Python Recognition Service ]          ports: WS 8765, HTTP 8766
    │ MediaPipe Holistic + Transformer
    │ ├─ MJPEG frames → browser <img src="http://localhost:8766/video_feed">
    │ └─ Gesture events → WS 8765
    ▼
[ Node.js / Express Backend ]           port: 5000
    │ Relays gesture events to browser WS (/ws)
    │ Serves REST APIs and static frontend
    ▼
[ Browser Kiosk UI ]                    http://localhost:5000
    │ ws_client.js ← WebSocket events
    │ intent_router.js ← gesture → screen action
    └─ views.js ← renders all screens
```

---

## Project Structure

```
SignMeet/
├── isl_transformer_best_132.keras   # Trained model (not in git)
├── package.json
├── .env
├── .env.example
│
├── recognition/                     # Python recognition service
│   ├── __init__.py
│   ├── config.py                    # All constants (thresholds, paths)
│   ├── model_runner.py              # Keras model loader + warm-up
│   ├── landmark_extractor.py        # 132-feature extraction (unchanged logic)
│   ├── gesture_pipeline.py          # Buffer, confirmation, duplicate suppression
│   ├── service.py                   # Main service (camera loop, WS, MJPEG)
│   └── requirements.txt
│
├── backend/                         # Node.js / Express
│   ├── server.js                    # App entry point, HTTP + WS server
│   ├── wsManager.js                 # Python↔Browser WebSocket bridge
│   ├── routes/
│   │   ├── trains.js
│   │   ├── station.js
│   │   └── assistance.js
│   ├── services/
│   │   ├── trainService.js
│   │   └── assistanceService.js
│   └── data/
│       ├── trains.js                # Simulated train timetable
│       └── egmore_layout.json       # Simulated station schematic
│
├── frontend/                        # Kiosk UI (served as static files)
│   ├── index.html
│   ├── css/main.css
│   └── js/
│       ├── state.js                 # Kiosk state store
│       ├── ws_client.js             # Backend WebSocket client
│       ├── intent_router.js         # Gesture → screen action mapping
│       ├── views.js                 # All screen templates
│       └── app.js                   # Bootstrap, event handlers
│
└── scripts/
    └── start_kiosk.bat              # Windows one-click startup
```

---

## Known Limitations

| Item | Status |
|------|--------|
| Train data | Simulated demo data — NOT live railway information |
| Station map | Schematic approximation — NOT an official Egmore floor plan |
| Assistance requests | Stored in-memory only; lost on server restart |
| Staff notifications | NOT implemented — "acknowledgement" is a client-side timer |
| PNR lookup | Always returns Pandian Express (demo) |
| SMS/WhatsApp alerts | Not implemented — UI collects number but does not send |
| `back` / `cancel` gestures | Not in trained model — use touchscreen |
| `PLATFORM` gesture | Maps to train board (no dedicated platform screen) |
| `TICKET` gesture | Shows a static counter-direction notice |
| Live NTES/CRIS API | Not integrated — requires official API credentials |

---

## Replacing Simulated Data with Real Sources

- **Train data:** Replace `backend/data/trains.js` and `backend/services/trainService.js` with calls to a real database or NTES API. All consumers use the service interface — the frontend and routes do not change.
- **Station layout:** Replace `backend/data/egmore_layout.json` with a surveyed, accurate floor plan. The layout key names (`lift`, `escalator`, etc.) must match the frontend facility buttons.
- **Assistance dispatch:** Replace the in-memory array in `backend/services/assistanceService.js` with a database write and a real notification mechanism (e.g., WebSocket push to a staff terminal, SMS gateway).

---

## Known Issues Requiring On-Machine Testing

- **Camera index:** `CAMERA_INDEX = 0` in `recognition/config.py`. If your webcam appears on a different index (e.g., 1 or 2), change this value.
- **TensorFlow GPU/CPU:** On some machines TensorFlow may print CUDA warnings. Inference runs on CPU by default — this is acceptable for this application.
- **MediaPipe version:** If you see import errors, ensure `mediapipe >= 0.10` is installed. Older versions have different API signatures.
- **Model shape validation:** If the model loads but the shape check fails, the CLASS_NAMES list in `recognition/config.py` may need to be updated to match your actual dataset directories.
- **MJPEG in Firefox:** Firefox handles `multipart/x-mixed-replace` streams differently. Chrome or Edge is recommended.

---

*SignMeet — Making railway station services more accessible, one sign at a time.*