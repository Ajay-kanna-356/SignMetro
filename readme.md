# SignMetro 🚉🤟

**A Sign-First Railway Station Assistance & Operations System**  
Chennai Egmore Railway Station · Indian Sign Language · Local Kiosk & Staff Control Center

---

## Overview

**SignMetro** (formerly *SignMeet*) provides an accessible, sign-first railway station navigation and emergency response experience for Deaf and hard-of-hearing passengers:

1. **Passenger Assistance Kiosk (`http://localhost:5000`)**: Touchscreen + AI gesture recognition (Indian Sign Language via webcam) for train timetables, platform directions, accessibility navigation, medical/security assistance, and lost & found reporting.
2. **Station Staff Control Dashboard (`http://localhost:4000`)**: Real-time operations center for station masters and duty staff featuring live WebSocket incident streaming, an audible emergency siren, interactive station map pinpoints, and automated SMTP email dispatch to passengers when lost items/persons are found.

---

## Quick Start

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Python | ≥ 3.10 | Gesture recognition service |
| Node.js | ≥ 18 | Backend, APIs, Kiosk & Staff servers |
| Webcam | Any standard | Video gesture input |

### 1. Clone & install Node dependencies

```bash
git clone <repo-url>
cd SignMetro
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

- The trained model **`isl_transformer_best_132.keras`** must reside in the project root.
- The dataset folder **`dataset_sign_metro/`** should also be in the project root (used as fallback for class discovery).

### 4. Configure environment

Copy `.env.example` to `.env` and configure your ports and credentials:

```bash
cp .env.example .env
```

Key environment variables:
```env
PORT=5000                     # Passenger Kiosk port
STAFF_PORT=4000               # Station Staff Dashboard port
KIOSK_ID=K-03
STATION_CODE=MS
STATION_NAME="Chennai Egmore"

# SMTP Email Configuration (Nodemailer)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM="SignMetro Station Control <your_email@gmail.com>"
```

### 5. Start services

#### Option A — Automatic (Windows)
```bash
scripts\start_kiosk.bat
```

#### Option B — Manual

**Terminal 1 — Python recognition service:**
```bash
# From project root
python -m recognition.service
```

**Terminal 2 — Node.js backend & dashboards:**
```bash
npm run dev         # auto-restart via nodemon
# or: npm start
```

**Access in Browser:**
- **Passenger Kiosk:** [http://localhost:5000](http://localhost:5000)
- **Station Staff Dashboard:** [http://localhost:4000](http://localhost:4000) (also accessible at `http://localhost:5000/staff`)

---

## Service Endpoints

| Service | URL | Description |
|---------|-----|-------------|
| **Passenger Kiosk UI** | `http://localhost:5000` | Main passenger interface with ISL gesture HUD & touch controls |
| **Station Staff Dashboard** | `http://localhost:4000` | Operations control center with live incident feed & siren alarm |
| **Assistance REST API** | `http://localhost:5000/api/assistance` | Log, retrieve, update status, and dispatch found emails |
| **Train Information API** | `http://localhost:5000/api/trains` | Search trains, routes, and upcoming departures |
| **Station Facility API** | `http://localhost:5000/api/station` | Facilities, layout schematic, and accessibility points |
| **System Status** | `http://localhost:5000/api/status` | Backend health check & Python bridge connection status |
| **Kiosk WebSocket** | `ws://localhost:5000/ws` | Real-time gesture and incident events |
| **Staff WebSocket** | `ws://localhost:4000/ws` | Real-time incident updates & alarm triggers |
| **Python WebSocket** | `ws://localhost:8765` | Raw gesture event pipeline from Python |
| **Camera Feed** | `http://localhost:8766/video_feed` | Low-latency MJPEG preview with skeleton landmark overlays |

---

## Key Features

### 1. Station Staff Control Dashboard (`http://localhost:4000`)
- **Real-Time WebSocket Feed:** Automatic streaming of all incoming SOS, Medical, Security, Lost Person, and Lost Item reports without manual refreshing.
- **Audio Emergency Siren:** Synthesized dual-tone siren (Web Audio API) triggered immediately upon critical emergency events (SOS / Medical / Security), featuring auto-silence upon incident acknowledgement.
- **Incident Lifecycle Tracking:** Seamlessly transition alerts through `Open` → `In Progress` → `Resolved` with staff resolution audit logs.
- **Station Map Pinpoint Inspection:** View the exact coordinates where passengers placed their location pins on the Egmore station schematic.
- **Automated "Mark Found & Email" Workflow:** When staff locate a lost item or companion, one click resolves the incident and dispatches an official pickup email directly to the passenger's registered email via SMTP.

### 2. Accessible Passenger Kiosk (`http://localhost:5000`)
- **11 ISL Sign Gestures:** Real-time recognition using MediaPipe Holistic hand landmarks and a 132-feature Transformer classifier.
- **Live Recognition HUD:** Dynamic progress bar showing gesture confidence percentage, detection threshold, and candidate alternative signs.
- **Interactive Station Map Pinpoint:** Interactive SVG floor plan where passengers can tap to place an animated glowing red location pin where an item was lost or a person was last seen.
- **Contact Details Collection:** Directly collects email address and phone number for official updates and notifications.
- **Smart Medical Alert Flow:** Selecting specific anatomical injury regions updates the active medical incident in real-time on the staff dashboard rather than generating duplicate tickets.
- **Instant Cancel / Safe Action:** "I'm okay - cancel request" and "I'm safe - done" automatically mark the incident resolved on the staff dashboard.

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
| `MEDICAL` | Medical alert flow |
| `SECURITY` | Security assistance |
| `LOST` | Lost item / person reporting |

> **Sign Simulator (Demo Mode):** The simulator bar at the bottom of the kiosk UI allows full testing of all screen flows without requiring a webcam or the Python service.

---

## Architecture Overview

```
[ Webcam ]
    │
    │ cv2.VideoCapture(0) — Python owns camera exclusively
    ▼
[ Python Recognition Service ]          ports: WS 8765, HTTP 8766
    │ MediaPipe Holistic + 132-feature Transformer
    │ ├─ MJPEG frames → browser <img src="http://localhost:8766/video_feed">
    │ └─ Gesture events → WS 8765
    ▼
[ Node.js / Express Backend ]           ports: 5000 (Kiosk), 4000 (Staff)
    │ wsManager.js: Bridges Python WS ↔ Kiosk WS ↔ Staff WS
    │ assistanceService.js: Persistent storage via backend/data/incidents.json
    │ emailService.js: Automated passenger pickup notices via Nodemailer SMTP
    ▼
┌─────────────────────────────────┴─────────────────────────────────┐
│                                                                   │
▼                                                                   ▼
[ Passenger Kiosk UI ] (Port 5000)                [ Staff Control Dashboard ] (Port 4000)
├─ Live Camera HUD with landmark overlay          ├─ Real-time incident stream & status filters
├─ Intent router & gesture transitions            ├─ Web Audio emergency alarm synthesizer
├─ Interactive SVG station map pin selector       ├─ Detailed inspection drawer & station map pin view
└─ Contact info collection (Email & Phone)        └─ "Mark Found & Email" automated SMTP dispatch
```

---

## Project Structure

```
SignMetro/
├── isl_transformer_best_132.keras       # Trained gesture model
├── package.json
├── .env
├── .env.example
├── readme.md
│
├── recognition/                         # Python recognition service
│   ├── config.py                        # Recognition constants & thresholds
│   ├── model_runner.py                  # Keras model loader & warm-up
│   ├── landmark_extractor.py            # 132-feature landmark extraction
│   ├── gesture_pipeline.py              # Temporal buffer, confirmation, suppression
│   ├── service.py                       # Camera loop, WS broadcaster, MJPEG server
│   └── requirements.txt
│
├── backend/                             # Node.js backend
│   ├── server.js                        # Express server (Kiosk on 5000, Staff on 4000)
│   ├── wsManager.js                     # Unified WebSocket bridge
│   ├── routes/
│   │   ├── trains.js                    # Train timetable & lookup endpoints
│   │   ├── station.js                   # Station schematic & facility endpoints
│   │   └── assistance.js                # Incident management & email dispatch routes
│   ├── services/
│   │   ├── trainService.js              # Train scheduling service
│   │   ├── assistanceService.js         # Incident logging & status transitions
│   │   └── emailService.js              # Nodemailer SMTP integration
│   └── data/
│       ├── trains.js                    # Timetable dataset
│       ├── egmore_layout.json           # Station schematic layout
│       └── incidents.json               # Persistent JSON incident storage
│
├── frontend/                            # Passenger Kiosk UI (Static)
│   ├── index.html                       # Kiosk main layout & camera widget
│   ├── css/
│   │   └── main.css                     # Kiosk styles & unified form input rules
│   ├── js/
│   │   ├── state.js                     # Client state manager
│   │   ├── ws_client.js                 # WebSocket client
│   │   ├── intent_router.js             # Gesture-to-screen routing
│   │   ├── views.js                     # Interactive views, SVG maps & forms
│   │   └── app.js                       # Touch & gesture event handlers
│   │
│   └── staff/                           # Station Staff Control Dashboard
│       ├── index.html                   # High-density dark operations interface
│       ├── staff.css                    # Modern Linear/Vercel-inspired dark theme
│       └── staff.js                     # Live WebSocket client, audio alarm & actions
│
└── scripts/
    └── start_kiosk.bat                  # One-click Windows startup script
```

---

## Testing Real Gesture Recognition End-to-End

1. Start both services (Python + Node).
2. Open `http://localhost:5000` in Chrome or Edge.
3. Verify that the camera preview (bottom-right) displays a **green dot** and your live video feed with hand skeleton overlays.
4. Perform an Indian Sign Language gesture in front of the camera.
5. Observe the camera widget border and HUD:
   - **Yellow** — gesture candidate detected, accumulating confirmation frames.
   - **Green flash** — gesture accepted with high confidence.
6. The kiosk automatically navigates to the requested view.
7. Check the browser console (`[Intent] gesture="..."`) and Python terminal (`Accepted: <word> (xx%)`) for logs.

---

## Known Limitations & Production Roadmap

| Component | Status | Production Roadmap |
|-----------|--------|---------------------|
| Train data | Simulated | Integrate with official CRIS / NTES live timetable API |
| Station map | Schematic approximation | Import official surveyed CAD/GIS floor plan of Chennai Egmore |
| Incident storage | Persistent JSON file store | Migrate to PostgreSQL / MongoDB for multi-station deployment |
| SMS alerts | India DLT gateway config | Wire active SMS gateway in addition to automated SMTP emails |
| `back` / `cancel` | Touchscreen only | Extend trained gesture vocabulary to include directional back sign |

---

*SignMetro — Making railway station services accessible, one sign at a time.*