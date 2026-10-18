# SignMeet — Comprehensive System Architecture & Integration Plan

---

## 1. Understanding of SignMeet

### 1.1 Project Summary
**SignMeet** is an accessibility-first railway assistance system engineered for deaf and speech-impaired passengers at railway stations, taking **Chennai Egmore (MS)** as its baseline reference. Rather than attempting open-domain, unrestricted sign-to-text translation (which requires continuous sentence glossing, complex grammar synthesis, and multi-modal facial inflection models), SignMeet implements **predefined, intent-level gesture recognition** mapped directly to structured kiosk workflows. 

Passengers use natural Indian Sign Language (ISL) gestures to trigger primary interactions, while the visual kiosk touchscreen allows subsequent specific selections (e.g., choosing a destination city, selecting an injured body part, or entering an age).

```text
+-----------------------------------------------------------------------------------------+
|                                    SignMeet Ecosystem                                   |
+------------------------------------+----------------------------------------------------+
|         Passenger-Facing           |                    Staff-Facing                    |
|  - Real-time ISL Gesture Input     |  - Live Request Management Queue                   |
|  - High-Contrast Multilingual UI   |  - Audio/Visual Terminal Alerts                    |
|  - Dynamic Route & Platform Visuals|  - Dispatch Status Tracking (Received -> En Route) |
|  - Assistive Reporting Workflows   |  - Station Announcement Broadcast Authorizations   |
+------------------------------------+----------------------------------------------------+
```

### 1.2 Implemented Components vs. Planned / Demo Features

| Component / Feature | Current Implementation Status | Notes & Distinctions |
|---|---|---|
| **ISL Transformer Model** | **Implemented & Verified** | `isl_transformer_best_132.keras` with custom `PositionalEncoding`. 20 frames $\times$ 132 features. Evaluates 11 classes. |
| **Landmark Extraction** | **Implemented & Verified** | MediaPipe Holistic extracting 42 hand landmarks (126 coordinates) + 2 shoulder landmarks (6 coordinates), normalized by inter-shoulder distance. |
| **Confirmation Pipeline** | **Implemented & Verified** | Consecutive hit counter ($\ge 3$ hits), per-class dynamic thresholds ($0.80$ default, $0.70$ for low-confidence gestures), duplicate suppression, sequence clearing. |
| **Kiosk Visual Design & UI** | **Implemented & Verified** | Single-file prototype (`Egmore ISL Kiosk – UI Prototype (2).html`) with dark/light theme, multilingual labels (EN, TA, HI), SVG icons, and responsive layouts. |
| **Kiosk Navigation & Flow** | **Implemented (Client-Side)** | Screen navigation (`home`, `train`, `when`, `dest`, `route`, `where`, `map`, `help`, `medical`, `security`, `lost`, `sos`), session timeouts, and idle resets. |
| **Python-to-UI Integration** | **Missing (Gap)** | The HTML prototype currently simulates gestures via button clicks and opens an independent browser webcam using `getUserMedia()`. The Python script runs in an isolated OpenCV window. |
| **Camera Sharing** | **Missing (Gap)** | Browser and Python cannot simultaneously bind to camera index `0` on Windows OS without lock contention. |
| **Train Schedules & Platforms** | **Demo / Simulated** | Hardcoded array of 8 trains (`TR`) with simulated platform assignments and mock delays. No live CRIS / NTES API connection. |
| **Station Layout & Navigation** | **Demonstrative Schematic** | Stylized 2D SVG canvas (`viewBox="0 0 600 300"`) showing concourse and 5 platform corridors. Not an architectural CAD/GIS floor plan. |
| **Assistance & Staff Dispatch**| **Simulated (Client-Side)** | Steps through `trk()` via `setTimeout` (2.5s $\rightarrow$ 6.5s). No network dispatch or persistent staff console. |
| **Lost Person / Item Reporting**| **Simulated (Client-Side)** | Captures input in local state `S.d.f` and produces static reference IDs (e.g., `LI-2043`). No backend persistence. |

---

## 2. Current Codebase Assessment

### 2.1 The Python Recognition Engine (`test_live_isl.py`)
The standalone Python script implements an inference pipeline with low latency and stability:
1. **Model Loading & Encoding**: Custom Keras layer `PositionalEncoding(max_len=20, d_model=132)` is registered via `custom_objects` when loading `isl_transformer_best_132.keras`.
2. **Dataset & Class Discovery**: Dynamically lists 11 subdirectories from `dataset_sign_metro`:
   $$\text{Classes: } \{\text{Destination, Platform, Route, Ticket, Train, When, Where, help, lost, medical, security}\}$$
3. **Landmark Extraction (`extract_landmarks`)**:
   - Left hand (21 points) and right hand (21 points) in 3D $(x, y, z)$. Missing hands default to $\mathbf{0}_{21 \times 3}$.
   - Shoulders extracted from Pose landmarks (indices 11 and 12).
   - Normalization: Calculates midpoint $\mathbf{C} = \frac{\mathbf{L}_s + \mathbf{R}_s}{2}$ and Euclidean inter-shoulder width $W = \|\mathbf{L}_{s[x,y]} - \mathbf{R}_{s[x,y]}\|_2$ (clamped to 1.0 if 0).
   - Offsets and scales all hand coordinates: $(\mathbf{P} - \mathbf{C}) / W$.
   - Concatenates into a flat 132-element `float32` vector: $[63 \text{ (LH)} + 63 \text{ (RH)} + 3 \text{ (LS)} + 3 \text{ (RS)}]$.
4. **Temporal Window & Sampling**:
   - Frame sampling: Evaluates landmarks on **every 5th frame** (`frame_count % 5 == 0`).
   - Rolling buffer: Maintains a `deque(maxlen=20)`. Once 20 frames are accumulated, inference executes on every new sample.
5. **Thresholding & Temporal Smoothing**:
   - Dynamic thresholding: $0.70$ for `where`, `train`, `destination`; $0.80$ for all other classes.
   - Candidate confirmation: Requires **3 consecutive qualifying predictions** of the exact same class before confirming.
   - Buffer reset: Once accepted, `sequence_buffer.clear()` resets the sequence to prevent re-triggering, and `last_accepted_word` prevents duplicate activations until another gesture or state reset occurs.
6. **OpenCV Display Loop**:
   - Flips frame horizontally for natural mirror view.
   - Draws skeleton overlays for hands and shoulders.
   - Renders debug telemetry overlays (Prediction, Confidence, Required Threshold, Status, Collected Words, Buffer occupancy).

### 2.2 The Kiosk UI Prototype (`Egmore ISL Kiosk – UI Prototype (2).html`)
The single-file HTML prototype is functional, compact (31 KB), and cleanly styled:
- **Design Tokens & Theming**: Custom CSS variables (`--bg`, `--fg`, `--ac`, `--rd`, `--ok`, `--bd`) provide a clean light mode and dark mode.
- **Micro-State Engine**: Driven by a single state object `S = { scr, h, lang, d, m, act, w, dis, to }` where `scr` dictates the active template in dictionary `V`.
- **Integrated Touch / Visual Flows**:
  - `home`: Direct shortcuts to Train, Where, Help.
  - `train`: Tabs for Train Board and PNR/Train number search.
  - `where`: Step-free accessibility toggle (`S.w`) dynamically rerouting Escalator queries to Lift.
  - `medical` / `security`: Silent dispatch mode, discrete UI text, and cancellation gates.
  - `lost`: Dual pathways for lost persons (with interactive schematic pin drop) and lost luggage.
  - Inactivity monitor: Warns after 45s, resets to home after 55s.
- **The Decoupled Gap**: The HTML prototype has two completely mock mechanisms:
  1. It launches `navigator.mediaDevices.getUserMedia()` independently, locking the browser webcam.
  2. It has an on-screen demo simulator bar (`div.sim`) with direct buttons that invoke `run(gesture)`, completely bypassing real inference.

---

## 3. Recommended Technology Stack

We recommend a **three-tier local architecture** running on the kiosk hardware:

```text
+---------------------------------------------------------------------------------+
|                                 SignMeet Kiosk                                  |
|                                                                                 |
|   +-----------------------+     WebSocket (JSON)     +----------------------+   |
|   |  Python Recognition   |<------------------------>|  Kiosk UI Frontend   |   |
|   |  Service (FastAPI)    |                          |  (HTML5/CSS3/ES6+)   |   |
|   +-----------+-----------+                          +----------+-----------+   |
|               |                                                 |               |
|               | Video Stream (MJPEG)                            | HTTP / WS     |
|               +------------------------------------------------>|               |
|                                                                 v               |
|                                                      +----------------------+   |
|                                                      |  Backend & Registry  |   |
|                                                      |   (FastAPI/Express)  |   |
|                                                      +----------------------+   |
+---------------------------------------------------------------------------------+
```

| Layer | Recommended Technology | Primary Responsibility | Justification |
|---|---|---|---|
| **Recognition & CV** | **Python 3.10+**<br>(OpenCV, MediaPipe Holistic, TensorFlow/Keras) | Camera capture, landmark extraction, rolling buffer management, Transformer inference, gesture confirmation. | Preserves 100% of the proven, working recognition pipeline from `test_live_isl.py`. |
| **Local Bridge Server** | **FastAPI + Uvicorn**<br>(Async Python) | Hosts WebSocket server for real-time events, serves the low-latency MJPEG preview stream, and provides REST status APIs. | Runs in the same Python process as recognition (or directly co-located), eliminating inter-process serialization overhead. Lightweight, native async, zero Node.js dependency required for Phase 1. |
| **Kiosk Frontend** | **Modular Vanilla ES6+ / HTML5 / CSS3**<br>(Refactored from current prototype) | Renders all kiosk screens, handles passenger touch input, displays camera preview, and translates confirmed gestures to screen navigation. | The existing prototype's visual styling, SVG icons, and responsiveness are already refined. Preserving Vanilla JS avoids build toolchain friction (Vite/Webpack) while delivering instant 60 FPS UI performance on kiosk hardware. |
| **Data & Dispatch (Incremental)** | **JSON Station Models $\rightarrow$ SQLite** | Stores train timetables, station layout nodes, facility metadata, and assistance request logs. | Flat JSON files for station timetables are completely sufficient for local prototype validation. SQLite can be added seamlessly in Phase 3 for staff request persistence without daemon configuration. |
| **IPC & Networking** | **WebSockets (`ws://`) + HTTP MJPEG** | Bidirectional event bus (Python $\leftrightarrow$ Frontend) and low-overhead video streaming. | Decouples video frames from telemetry. Video goes straight to an `<img>` tag via MJPEG; gesture metadata flows as tiny JSON packets (<200 bytes). |

---

## 4. Architecture Diagram

```text
+----------------------------------------------------------------------------------------------------+
|                                    SIGNMEET KIOSK HARDWARE (LOCAL)                                 |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|   [ Physical USB / Built-in HD Webcam ]                                                            |
|                    |                                                                               |
|                    | OpenCV VideoCapture(0) - [Exclusive Hardware Lock]                            |
|                    v                                                                               |
|   +--------------------------------------------------------------------------------------------+   |
|   |                        PYTHON SERVICE (FastAPI + Background Vision Loop)                   |   |
|   |                                                                                            |   |
|   |   +------------------------------------------------------------------------------------+   |   |
|   |   | Thread 1: Camera & Recognition Engine                                              |   |   |
|   |   |                                                                                    |   |   |
|   |   |  Frame Capture (30 FPS) ---> MediaPipe Holistic Process (RGB)                     |   |   |
|   |   |           |                                 |                                      |   |   |
|   |   |           v (Every frame)                   v (Every 5th frame)                    |   |   |
|   |   |   Draw Mirror Skeleton Overlay        Extract 132 Landmarks (Norm. by Shoulders)  |   |   |
|   |   |           |                                 |                                      |   |   |
|   |   |           v                                 v                                      |   |   |
|   |   |   MJPEG Frame Buffer (JPEG)           Rolling Sequence Buffer (20 x 132)           |   |   |
|   |   |   (Downscaled 320x240, Q=70)                |                                      |   |   |
|   |   |           |                                 v (When buffer len == 20)              |   |   |
|   |   |           |                           Keras Transformer Inference                  |   |   |
|   |   |           |                                 |                                      |   |   |
|   |   |           |                                 v                                      |   |   |
|   |   |           |                           Dynamic Threshold Check (0.70 / 0.80)        |   |   |
|   |   |           |                                 |                                      |   |   |
|   |   |           |                                 v                                      |   |   |
|   |   |           |                           Consecutive Hit Confirmation (3x)            |   |   |
|   |   |           |                                 |                                      |   |   |
|   |   |           |                                 v                                      |   |   |
|   |   |           |                           Duplicate Suppression & Buffer Reset         |   |   |
|   |   +-----------|---------------------------------|--------------------------------------+   |   |
|   |               |                                 |                                          |   |
|   |   +-----------v---------------------------------v--------------------------------------+   |   |
|   |   | Thread 2 / Async Event Loop: FastAPI Network Endpoints                             |   |   |
|   |   |                                                                                    |   |   |
|   |   |  - GET /video_feed  -----> Multipart MJPEG Stream                                  |   |   |
|   |   |  - WS  /ws/gestures -----> Broadcasts: TELEMETRY, GESTURE_ACCEPTED, STATUS        |   |   |
|   |   |  - POST /api/reset  -----> Resets candidate and sequence buffers                   |   |   |
|   |   +------------------------------------------------------------------------------------+   |   |
|   +---------------------------------------+------------------------+---------------------------+   |
|                                           |                        |                               |
|                  MJPEG Stream (/video_feed)                        | WebSocket Events (/ws)        |
|                                           |                        |                               |
|   +---------------------------------------v------------------------v---------------------------+   |
|   |                          KIOSK USER INTERFACE (Web Browser / WebView)                      |   |
|   |                                                                                            |   |
|   |   +------------------------------------+    +------------------------------------------+   |   |
|   |   | Floating Camera PIP Widget         |    | Central State & Intent Router            |   |   |
|   |   |                                    |    |                                          |   |   |
|   |   | <img src="/video_feed"             |    | On 'GESTURE_CONFIRMED':                  |   |   |
|   |   |      alt="Live Sign Feedback" />   |    |   - Evaluate current screen context      |   |   |
|   |   | Dynamic status border glow:        |    |   - Disambiguate multi-step flows        |   |   |
|   |   |  - Neutral: Gray                   |    |   - Transition to target view            |   |   |
|   |   |  - Confirming: Yellow              |    |   - Play subtle confirmation chime       |   |   |
|   |   |  - Accepted: Green                 |    +--------------------+---------------------+   |   |
|   |   +------------------------------------+                         |                         |   |
|   |                                                                  v                         |   |
|   |   +------------------------------------------------------------------------------------+   |   |
|   |   | Dynamic Screen Views                                                               |   |   |
|   |   |                                                                                    |   |   |
|   |   |  [ Home View ] <=========> [ Train Board / Route ] <=========> [ Station Map ]     |   |   |
|   |   |        |                                                             |             |   |   |
|   |   |        v                                                             v             |   |   |
|   |   |  [ Medical SOS Flow ] <===> [ Security Silent Alert ] <===> [ Lost Person / Item ] |   |   |
|   |   +------------------------------------------------------------------------------------+   |   |
|   +--------------------------------------------------------------------------------------------+   |
|                                                                                                    |
+----------------------------------------------------------------------------------------------------+
```

---

## 5. End-to-End Data Flow

Tracing a single camera frame from physical capture to screen reaction:

```text
Step 1: Frame Ingestion
  Physical Camera (30 FPS, 640x480 BGR)
    │
    ▼
  OpenCV VideoCapture.read() in Python worker thread
    │
    ├──> Branch A (Every Frame): Image Processing for UI Preview
    │      1. Flip horizontally: cv2.flip(frame, 1)
    │      2. Render skeleton overlays (hands + shoulders) on mirrored frame
    │      3. Downsample to 320x240, encode as JPEG (quality=70)
    │      4. Place in single-element atomic buffer for HTTP MJPEG streamer
    │
    └──> Branch B (Inference Pipeline):
           1. Convert BGR to RGB: cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
           2. Execute Holistic model: holistic.process(rgb)
           3. Increment frame_count.
              If frame_count % 5 != 0:
                  Drop from feature queue (skip inference).
              Else:
                  Proceed to Feature Extraction.

Step 2: Feature Extraction (Every 5th Frame ~ 166 ms)
  Results from MediaPipe Holistic:
    - Left Hand (21 x 3) + Right Hand (21 x 3)
    - Left Shoulder (3) + Right Shoulder (3)
    │
    ▼
  Calculate Center C and Shoulder Width W:
    C = (LS + RS) / 2
    W = ||LS[:2] - RS[:2]||
    P_norm = (P - C) / W
    │
    ▼
  Flatten to 132-element float32 vector:
  [lh_norm (63), rh_norm (63), ls_norm (3), rs_norm (3)]
    │
    ▼
  Append to sequence_buffer = deque(maxlen=20)

Step 3: Transformer Model Inference
  Check: len(sequence_buffer) == 20?
    - If NO: Broadcast WS Telemetry: {"status": "BUFFERING", "count": N, "max": 20}
    - If YES:
        1. Reshape sequence buffer to tensor: (1, 20, 132)
        2. Execute model.predict(X_live, verbose=0)
        3. Extract argmax: pred_index, word, confidence
        4. Lookup dynamic threshold:
             threshold = 0.70 if word in {'where','train','destination'} else 0.80

Step 4: Temporal Confirmation & Filtering
  Confidence >= Threshold?
    ├── NO:
    │     Reset candidate: candidate_prediction = None, candidate_count = 0
    │     Broadcast WS Telemetry: {"status": "LOW_CONFIDENCE", "word": word, "conf": confidence}
    │
    └── YES:
          word == candidate_prediction?
            ├── YES: candidate_count += 1
            └── NO:  candidate_prediction = word, candidate_count = 1
          
          Broadcast WS Telemetry:
          {"status": "CONFIRMING", "word": word, "count": candidate_count, "target": 3}

          candidate_count >= 3?
            ├── NO: Continue next sampling loop
            └── YES:
                  word != last_accepted_word?
                    ├── YES:
                    │     CONFIRM GESTURE!
                    │     last_accepted_word = word
                    │     sequence_buffer.clear()
                    │     candidate_count = 0
                    │     Broadcast WS Event:
                    │     {
                    │       "type": "GESTURE_ACCEPTED",
                    │       "gesture": word.lower(),
                    │       "confidence": confidence,
                    │       "timestamp": 1729263445120
                    │     }
                    │
                    └── NO (Duplicate Suppression):
                          sequence_buffer.clear()
                          candidate_count = 0
                          Broadcast WS Telemetry: {"status": "DUPLICATE_SKIPPED", "word": word}

Step 5: Frontend Action Execution
  Kiosk UI receives WebSocket message {"type": "GESTURE_ACCEPTED", "gesture": "train"}
    │
    ▼
  Intent / State Engine (kiosk-intent.js):
    1. Check active modal: If confirmation dialog open, map 'yes' / 'no' intents.
    2. Check current screen:
         - Current: 'home' + Gesture: 'train'  ──> Transition to 'train' view
         - Current: 'train' + Gesture: 'when'   ──> Switch tab to 'when' (Upcoming)
         - Current: 'train' + Gesture: 'route'  ──> Switch tab to 'route'
         - Global Gesture: 'medical' / 'help'  ──> Preempt immediately to Emergency view
    3. Execute view transition:
         - Update state S.scr = 'train'
         - Re-render DOM view container
         - Visual feedback: Pulse green indicator on floating camera widget
         - Reset inactivity timer (act = Date.now())
```

---

## 6. Camera & Preview Strategy

### 6.1 The Single-Camera Ownership Problem
On Windows, webcam drivers (DirectShow / Media Foundation) exclusively lock the camera hardware to the first requesting process. If Python opens `cv2.VideoCapture(0)` and the browser executes `navigator.mediaDevices.getUserMedia()`, one of two failures occurs:
1. The browser throws a `NotReadableError: Could not start video source`.
2. OpenCV fails with `[ WARN:0] global cap.cpp: ... can't open camera`.

Furthermore, capturing video in the browser and streaming raw/compressed frames over WebSocket to Python consumes heavy CPU in Javascript serialization and introduces variable network latency into landmark tracking.

### 6.2 Recommended Strategy: Python Hardware Ownership + MJPEG HTTP Preview
Python must own the camera exclusively. The UI displays the stream using a simple, standard MJPEG endpoint.

```text
+--------------------------------------------------------------------------------+
|                             CAMERA SHARING ARCHITECTURE                        |
|                                                                                |
|  [ Web Camera ]                                                                |
|        |                                                                       |
|        v (Exclusive DirectShow hardware lock)                                  |
|   OpenCV cv2.VideoCapture(0)                                                   |
|        |                                                                       |
|        +-----------------------------------+                                   |
|        | Raw Frame (RGB)                   | Mirrored & Skeleton Frame (BGR)   |
|        v                                   v                                   |
|   MediaPipe Holistic                cv2.resize(frame, (320, 240))              |
|        |                            cv2.imencode('.jpg', frame, [QUALITY, 70]) |
|        v                                   |                                   |
|   Feature Extraction & Model               v                                   |
|        |                            FastAPI /video_feed (StreamingResponse)    |
|        |                                   |                                   |
|        v                                   v                                   |
|   WebSocket (/ws/gestures)          Kiosk UI: <img id="cam-feed"               |
|   (Tiny JSON metadata)                           src="/video_feed" />          |
+--------------------------------------------------------------------------------+
```

#### Why MJPEG is Optimal for this System:
1. **Zero Browser Decoding Overhead**: An HTML `<img>` tag natively renders multipart JPEG streams (`multipart/x-mixed-replace; boundary=frame`) directly using hardware-accelerated image decoders. No WebGL, canvas rendering loops, or WebAssembly required in Javascript.
2. **Bandwidth & CPU Conservation**:
   - The ML pipeline processes frames internally at standard capture resolution (640 $\times$ 480).
   - The preview frame is downsampled to **320 $\times$ 240 at 15–20 FPS** with JPEG compression quality 70 before transmission over `localhost`.
   - Data rate: $\approx 25 \text{ KB/frame} \times 18 \text{ FPS} \approx 450 \text{ KB/s}$, consuming negligible local network stack resources.
3. **Automatic Latency Preservation**: If the browser UI thread is temporarily busy rendering a screen change, HTTP drops intermediate unread MJPEG frames automatically. It never queues stale video frames.
4. **Visual Synchronization**: The skeleton landmarks rendered in OpenCV are drawn directly onto the mirrored image in Python before JPEG encoding. Passengers see their hand landmarks drawn with zero alignment jitter between the skeleton and their physical fingers.

---

## 7. Communication Contracts

Communication between the Python service, Kiosk UI, and backend is split cleanly:
1. **Telemetry & Gesture Stream**: WebSocket (`/ws/gestures`)
2. **System Control & Diagnostic Commands**: REST (`/api/control/*`)
3. **Assistance & Incident Requests**: REST (`/api/assistance/*`)

### 7.1 WebSocket Messages (Python $\rightarrow$ Kiosk UI)

#### Contract 1: Real-Time Recognition Telemetry (High Frequency: ~6 Hz)
Sent after each 5th-frame sample to keep the user informed of tracking progress:
```json
{
  "type": "RECOGNITION_TELEMETRY",
  "data": {
    "status": "CONFIRMING",
    "candidate": "train",
    "confidence": 0.884,
    "threshold": 0.70,
    "confirmation_count": 2,
    "required_confirmations": 3,
    "buffer_fill": 20,
    "buffer_max": 20,
    "timestamp": 1729263445100
  }
}
```

#### Contract 2: Confirmed Gesture Accepted (Event Driven)
Sent when the candidate hits 3 consecutive qualifiers and passes duplicate checks:
```json
{
  "type": "GESTURE_ACCEPTED",
  "data": {
    "gesture": "train",
    "confidence": 0.912,
    "display_name": "Train Information",
    "timestamp": 1729263445266
  }
}
```

#### Contract 3: Status / Diagnostic Notification
Sent when camera state or model readiness changes:
```json
{
  "type": "SYSTEM_STATUS",
  "data": {
    "camera_ready": true,
    "model_loaded": true,
    "fps": 29.8,
    "active_classes": 11,
    "error_code": null
  }
}
```

### 7.2 WebSocket Messages (Kiosk UI $\rightarrow$ Python)

#### Contract 4: Frontend State Notification / Reset
Sent when a user navigates manually via touch or an interaction completes:
```json
{
  "command": "RESET_BUFFERS",
  "reason": "USER_TOUCH_INTERACTION",
  "clear_history": true
}
```

### 7.3 Assistance Request Payload (Kiosk UI $\rightarrow$ Backend REST)

#### Contract 5: Dispatch Creation (`POST /api/assistance/requests`)
Used when submitting SOS, Medical, Security, or Lost Person reports:
```json
{
  "request_id": "REQ-EGM-20261018-0042",
  "terminal_id": "KIOSK-K03",
  "station_code": "MS",
  "station_name": "Chennai Egmore",
  "location_detail": "Main Concourse near Platform 1 Gate",
  "category": "MEDICAL",
  "severity": "HIGH",
  "details": {
    "body_part": "Chest",
    "additional_support_requested": true,
    "discreet_mode": false
  },
  "created_at": "2026-10-18T14:48:32.000Z",
  "status": "RECEIVED"
}
```

#### Contract 6: Backend Dispatch Response
```json
{
  "success": true,
  "request_id": "REQ-EGM-20261018-0042",
  "status": "DISPATCHED",
  "assigned_team": "Egmore Emergency Medical Response Unit 1",
  "estimated_arrival_seconds": 180,
  "acknowledged_by_staff": false
}
```

---

## 8. Latency Analysis & Timing Budget

### 8.1 Physical Timing & Execution Budget

To achieve real-time responsiveness, every link in the pipeline must fit within a deterministic latency budget:

```text
Camera Frame Capture (OpenCV)           :  ~5 ms
MediaPipe Holistic RGB Processing       : ~18 ms
Landmark Extraction & Normalization     :  ~2 ms
Transformer Predict (1, 20, 132)        : ~12 ms
WebSocket Serialization & Localhost Net :  ~1 ms
UI DOM Update & Render Execution        :  ~4 ms
────────────────────────────────────────────────────
Total Pipeline Processing Overhead      : ~42 ms (Well under the 166 ms sampling window)
```

### 8.2 Understanding the Temporal Buffer Latency
The primary latency experienced by the user is **temporal sampling**, not computational delay:
1. **Sampling Rate**: `SAMPLE_EVERY_N_FRAMES = 5`. At a camera frame rate of 30 FPS, 1 sample is acquired every **166.7 ms** ($\approx 6$ samples/second).
2. **Cold-Start Buffer Fill**: The model requires 20 frames before inference begins:
   $$\text{Initial Fill Time} = 20 \times 166.7 \text{ ms} = 3.33 \text{ seconds}$$
3. **Rolling Prediction Cadence**:
   - Once the 20-frame buffer is full, every subsequent 5th frame causes an eviction of the oldest frame and ingestion of the newest frame.
   - Inference runs every 166.7 ms on the sliding 20-frame window.
4. **Confirmation Window**:
   - Requiring 3 consecutive hits means the user must hold/execute the sign steadily for:
     $$3 \times 166.7 \text{ ms} \approx 500 \text{ ms}$$
5. **Post-Acceptance Reset**:
   - `test_live_isl.py` clears the sequence buffer immediately upon confirmation (`sequence_buffer.clear()`).
   - This design prevents ghost activations, but it introduces an intentional **3.33-second recharge time** before the next gesture can be accepted.
   - *Design Insight*: This 3.3-second cooldown is appropriate for a kiosk. It naturally prevents a user from triggering two separate commands while relaxing their hands after a sign.

### 8.3 End-to-End Latency Measurement Methodology
We will measure true gesture-to-UI latency using high-precision software timestamps:
1. When a candidate prediction reaches its 3rd consecutive confirmation, record high-resolution timestamp $T_0 = \text{time.perf\_counter\_ns()}$.
2. Insert $T_0$ into the outgoing WebSocket payload.
3. In the UI Javascript event listener, capture $T_1 = \text{performance.now()}$.
4. After invoking the DOM update, schedule `requestAnimationFrame(() => { T_2 = performance.now(); })`.
5. Measure:
   - Network transmission delay: $T_1 - T_0$
   - Browser rendering delay: $T_2 - T_1$
   - Total delivery overhead: $T_2 - T_0$ (Target: $< 15 \text{ ms}$ on `localhost`).

---

## 9. Frontend Migration Decision: Retain Prototype vs. React

### 9.1 Evaluation Matrix

| Criterion | Retain & Modularize Existing Prototype (Recommended) | Migrate to React (SPA) |
|---|---|---|
| **Visual Design Fidelity** | **100% Preserved**. All micro-animations, color gradients, SVG icons, and typography remain intact immediately. | High risk of subtle visual regressions. All custom CSS variables, SVG path templates, and layout grids would need re-styling in JSX/CSS Modules. |
| **Development Speed** | **Fast (Hours)**. Remove minification, split into 4 clean files, hook up WebSocket client. Ready for end-to-end testing immediately. | **Slow (Days)**. Requires creating project scaffolding (Vite), porting 11 sub-views, rewriting form handlers, re-implementing map canvas logic. |
| **Performance on Kiosk Hardware** | **Optimal**. Pure Vanilla DOM updates execute in $< 2 \text{ ms}$. Near-zero memory footprint. No Virtual DOM diffing overhead. | Good, but incurs React runtime overhead, bundle hydration, and unnecessary dependency weight for a single-screen kiosk. |
| **Maintainability** | **High** when de-minified and structured into modules (`app.js`, `kiosk-state.js`, `websocket.js`, `views/*.js`). | High component reusability, but over-engineered for a kiosk running one single dedicated interface. |
| **Tooling & Build Steps** | **Zero**. Runs directly in any Chromium-based browser or Electron/Tauri wrapper. No `node_modules`, no compile steps. | Requires Node.js, npm/pnpm, build scripts, transpilation, and packaging pipelines. |

### 9.2 Recommendation
**Explicit Recommendation: Retain the existing HTML/CSS/JavaScript foundation and modularize it into clean ES6 code.**

Do not migrate to React at this stage. The prototype's design is already tailored to the project requirements. Migrating to React would consume significant development time without improving user experience, recognition accuracy, or system latency. 

We will take the 107-line minified file and expand it into clean, maintainable files:
- `index.html`: Clean markup container and modal definitions.
- `styles/main.css`: The existing curated design system with clear comments.
- `src/state.js`: Predictable state machine with actions and subscriptions.
- `src/intent-router.js`: Translates gesture tokens and touch events into state actions.
- `src/ws-client.js`: Robust WebSocket client with auto-reconnection and telemetry callbacks.
- `src/views/`: Individual modular template functions for each screen (`home.js`, `train.js`, `navigation.js`, `assistance.js`).

*(If the academic requirements strictly mandate a React deliverable for evaluation later, the modular state/view separation established here will allow a direct 1-to-1 conversion into React functional components in a later phase).*

---

## 10. Intent Engine & Interaction State Machine

### 10.1 Vocabulary & Action Mapping

The model vocabulary contains 11 classes. Here is how they map into the kiosk state machine:

```text
[ Model Gesture ]       [ Current Context ]       [ Target Action / Screen ]
─────────────────────────────────────────────────────────────────────────────
TRAIN               ──> ANY                ──> Go to Train Hub (Tabs: Board / Route)
WHEN                ──> 'train' Screen     ──> Show Upcoming Trains Tab
WHEN                ──> OTHER Screens      ──> Go to Train Hub -> Show Upcoming
DESTINATION         ──> 'train' Screen     ──> Open Destination Search Filter
ROUTE               ──> 'train' Screen     ──> Open Route & Station Stops View
PLATFORM            ──> ANY                ──> Show Platform Verification Summary
WHERE               ──> ANY                ──> Go to Station Navigation Hub
TICKET              ──> ANY                ──> Show Ticket Counter & UTS Info
HELP                ──> ANY                ──> Open Assistance Options Hub
MEDICAL             ──> ANY (Preempt)      ──> Trigger Medical Alert Flow
SECURITY            ──> ANY (Preempt)      ──> Trigger Silent Security Flow
LOST                ──> ANY                ──> Open Lost Reporting Hub
```

### 10.2 Context-Aware Ambiguity Resolution
1. **Hierarchical Navigation**:
   - If a passenger signs `WHEN` while on the `home` screen, the intent engine avoids throwing an error; it understands the intent context and routes directly to the Train Hub with the "Upcoming Departures" tab pre-selected.
2. **Safety Preemption (Emergency Priority)**:
   - Gestures for `MEDICAL`, `SECURITY`, and `HELP` possess **global preemption priority**. Regardless of whether a passenger is deep within a destination search or looking at train routes, signing `MEDICAL` immediately transitions the interface to the Emergency Assistance screen.
3. **Confirmation & Cancellation**:
   - On screens requiring confirmation (e.g., cancelling an SOS alert or confirming assistance dispatch), gestures are mapped safely:
     - Physical touchscreen buttons remain available for instant touch override (`Yes` / `No`).
     - A simple gesture hold or repeated gesture acts as a secondary confirmation.
4. **Inactivity & Session Reset**:
   - The kiosk maintains a 45-second touch/gesture activity timer.
   - At 45 seconds of inactivity: Displays a non-blocking modal: *"Still there? Wave hand or touch screen."*
   - At 55 seconds: Automatically clears user data (entered phone numbers, names), resets state to `home`, and purges recognition buffers.

---

## 11. Backend & Data Architecture

### 11.1 Incremental Backend Plan

```text
Phase 1: Local Monolithic Python Service
┌─────────────────────────────────────────────────────────────┐
│ Python Process (FastAPI)                                    │
│  ├── Vision & Transformer Loop (OpenCV + MediaPipe)        │
│  ├── WebSocket Service (/ws/gestures)                      │
│  ├── MJPEG Video Stream (/video_feed)                       │
│  └── Static Mock Data Endpoints (/api/trains, /api/map)     │
└─────────────────────────────────────────────────────────────┘
  * Fully self-contained. Zero database configuration. Zero Node.js dependency.

Phase 2: Decoupled Backend & Persistence (When Staff Portal is added)
┌───────────────────────────┐         ┌───────────────────────────┐
│ Python Recognition Engine │         │ Node.js / Express Backend │
│  - Camera capture         │         │  - Train Schedule Engine  │
│  - Transformer inference  │         │  - SQLite Database        │
│  - WebSocket events       │◄───────►│  - Staff Dashboard Server │
└───────────────────────────┘         │  - WebSocket Station Hub  │
                                      └─────────────┬─────────────┘
                                                    │
                                      ┌─────────────▼─────────────┐
                                      │ Staff Web Dashboard       │
                                      └───────────────────────────┘
```

### 11.2 Station Data Schema (Decoupled Configuration)
To ensure SignMeet can support other stations (e.g., Chennai Central `MAS`, Coimbatore `CBE`) without code modifications, station data is decoupled into structured JSON configurations:

```json
{
  "station_code": "MS",
  "station_name": "Chennai Egmore",
  "zone": "Southern Railway",
  "kiosks": [
    {
      "kiosk_id": "K-03",
      "location_name": "Main Concourse",
      "coordinates": { "x": 300, "y": 200 },
      "nearest_platform": "Platform 1"
    }
  ],
  "facilities": [
    {
      "id": "lift-p1",
      "type": "lift",
      "name": "Platform 1 Concourse Lift",
      "step_free": true,
      "coordinates": { "x": 110, "y": 180 },
      "path_from_k03": [[300, 200], [300, 165], [110, 165], [110, 180]],
      "directions_en": [
        "Walk straight to the concourse crossing",
        "Turn left along the blue floor line",
        "Lift is beside the Platform 1 gate"
      ]
    }
  ]
}
```

### 11.3 Realistic Train Schedule vs. Real-Time Status
- **Current Approach (Baseline)**: The application uses a static timetable schedule representing realistic daily trains departing Chennai Egmore (e.g., *12635 Vaigai Express*, *12637 Pandian Express*, *16101 Boat Mail*).
- **Verified Data Boundary**: The interface explicitly displays a label: `Scheduled departure times (Verified daily timetable). For live running status, check railway station platform indicators.`
- **Future Integration Point**: Real-time integration with Indian Railways APIs (e.g., NTES/CRIS) requires commercial API credentials or National Data Sharing agreements. The architecture provides clean service abstractions (`TrainService.getUpcomingTrains()`) so that a real-time feed can be substituted without changing UI components.

---

## 12. Station Navigation Representation

### 12.1 Demonstrative Schematic vs. Floor Plan
The prototype's current station map is a **topological schematic representation**, not a scale architectural drawing:
- Platforms 1–11 are drawn as 5 parallel horizontal corridors.
- Facilities (Lift, Escalator, Washroom, Exit) are represented as point nodes $(X, Y)$ on a normalized $600 \times 300$ grid.
- Route paths are polylines: sequences of coordinate pairs connected by dashes.

```text
+-------------------------------------------------------------+
|                STATION SCHEMATIC TOPOLOGY (600 x 300)       |
|                                                             |
|  [P1–2]  -------------------------------------------------  |
|  [P3–4]  -------------------------------------------------  |
|  [P5–6]  -------------------------------------------------  |
|  [P7–8]  -------------------------------------------------  |
|  [P9–11] -------------------------------------------------  |
|                                                             |
|          +---------------------------------------+          |
|  ( L )   |             MAIN CONCOURSE            |  ( E )   |
|  [Lift]  |                                       |[Escalator]
|          |                 (K-03)                |          |
|          |              * You Are Here           |   ( W )  |
|          +---------------------------------------+ [Washroom|
|                             |                               |
|                         [Entrance]                          |
|                            ( X )                            |
+-------------------------------------------------------------+
```

### 12.2 Graph-Based Routing Engine
To maintain and scale station navigation, facilities should be modeled as an adjacency list graph:
1. **Nodes**: Landmarks, corridor junctions, platform gates, elevators, ramps.
2. **Edges**: Walking corridors with weights (distance in meters) and accessibility flags (`step_free: true | false`).
3. **Route Finding**: When a passenger toggles **Step-free route: ON**, the routing engine filters out edges tagged with stairs/escalators and runs Dijkstra's algorithm to compute the shortest accessible polyline from the kiosk's current coordinates to the target facility.

---

## 13. Assistance & Staff Workflow

```text
+------------------+         +---------------------+         +---------------------+
| Passenger Kiosk  |         |   Backend Server    |         |   Staff Terminal    |
+--------+---------+         +----------+----------+         +----------+----------+
         |                              |                               |
         | 1. Sign 'MEDICAL' or SOS     |                               |
         |----------------------------->|                               |
         |                              | 2. Emit WebSocket Alert       |
         |                              |------------------------------>|
         |                              |                               | [Beep / Alert Tone]
         |                              |                               | Displays: Kiosk K-03,
         |                              |                               | Concourse, High Priority
         | 3. Render Status:            |                               |
         |    "Alert Sent. Help Coming."|                               |
         |                              | 4. Staff Clicks 'Acknowledge' |
         |                              |<------------------------------|
         | 5. Update Status:            |                               |
         |    "Staff En Route (2 min)"  |                               |
         |<-----------------------------|                               |
         |                              | 6. Staff Arrives & Clears Req |
         | 7. Reset to Neutral Home     |<------------------------------|
         |<-----------------------------|                               |
```

### 13.1 Handling Offline & Failure Modes
1. **Unacknowledged Alerts**: If an SOS or Medical request is not acknowledged by a staff terminal within 90 seconds, the kiosk UI alerts the passenger with backup contact directions: *"Alert is queued. Please also press the physical red emergency call button located directly on the pillar beside this kiosk."*
2. **Clear Passenger Expectations**: The UI never presents a misleading message like *"Staff have arrived"* based on a blind client timer. In the final system, status steps advance only on verified server acknowledgements.

---

## 14. Startup, Performance & Deployment Plan

### 14.1 Single-Command Local Launch
Running the system on a single kiosk machine requires an orchestrated startup:
1. **Hardware Verification**: Checks webcam availability at index `0`.
2. **Model Pre-warming**: Loads `isl_transformer_best_132.keras` once during startup, passes a dummy $(1, 20, 132)$ zeros tensor through `model.predict()` to trigger TensorFlow graph compilation and cache memory allocations.
3. **Server Initialization**: Launches FastAPI / Uvicorn on `http://localhost:8000`.
4. **Browser Launch**: Launches Microsoft Edge or Google Chrome in dedicated Kiosk App Mode:
   ```powershell
   # Kiosk Startup Script (run_signmeet.bat)
   start "" python server.py
   timeout /t 3 /nobreak
   start "" msedge --kiosk http://localhost:8000 --edge-kiosk-type=fullscreen --no-first-run
   ```

### 14.2 Graceful Shutdown & Resource Cleanup
- Listens for `SIGINT` / `SIGTERM` signals.
- Releases OpenCV `cap.release()`.
- Closes MediaPipe Holistic context to free native C++ graph memory.
- Gracefully disconnects active WebSockets before process termination.

---

## 15. Proposed Folder Structure

```text
SignMeet/
├── assets/
│   ├── models/
│   │   └── isl_transformer_best_132.keras    # Trained Transformer model
│   ├── station_data/
│   │   ├── stations.json                     # Station registry (MS, MAS, etc.)
│   │   ├── egmore_schedule.json              # Verified train timetables
│   │   └── egmore_map.json                   # Facilities, coordinates, routes
│   └── icons/                                # Custom SVG symbols
│
├── core_vision/                              # Python Recognition Subsystem
│   ├── __init__.py
│   ├── config.py                             # Thresholds, sampling rates, paths
│   ├── camera_stream.py                      # Threaded OpenCV capture & MJPEG buffer
│   ├── landmark_extractor.py                 # MediaPipe Holistic & 132-feat norm
│   ├── model_runner.py                       # PositionalEncoding & Keras inference
│   └── gesture_pipeline.py                   # Deque buffer, confirmation & suppression
│
├── server/                                   # Local Communication Layer
│   ├── __init__.py
│   ├── app.py                                # FastAPI app definition
│   ├── ws_manager.py                         # WebSocket connection & event broadcast
│   └── routes/
│       ├── stream.py                         # /video_feed multipart MJPEG streamer
│       ├── api_kiosk.py                      # Train info & assistance endpoints
│       └── api_control.py                    # Buffer reset & telemetry controls
│
├── frontend/                                 # Modular Kiosk Web Interface
│   ├── index.html                            # Master kiosk HTML container
│   ├── css/
│   │   ├── variables.css                     # Curated color tokens, dark/light theme
│   │   ├── layout.css                        # Kiosk grid, floating webcam frame
│   │   └── components.css                    # Buttons, cards, tables, modals
│   └── js/
│       ├── app.js                            # App bootstrap & event wiring
│       ├── state.js                          # Kiosk state store & subscribers
│       ├── ws_client.js                      # WebSocket handler with auto-reconnect
│       ├── intent_router.js                  # Maps gesture/touch events to actions
│       ├── navigation_graph.js               # Route calculation & step-free paths
│       └── views/                            # Screen view templates
│           ├── home_view.js
│           ├── train_view.js
│           ├── map_view.js
│           └── assistance_view.js
│
├── scripts/
│   ├── run_kiosk.bat                         # One-click startup for Windows kiosk
│   └── benchmark_latency.py                  # End-to-end timing evaluation tool
│
├── test_live_isl.py                          # Preserved original working standalone script
└── README.md                                 # Project documentation & reference
```

---

## 16. Implementation Phases & Acceptance Criteria

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: Vision Engine Modularization & Baseline Verification               │
│ - Extract core_vision/ modules from test_live_isl.py without logic changes. │
│ - Target: Pass identical 132-feat vectors and verify model loading.         │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────────┐
│ PHASE 2: Local Bridge Server & Camera Stream                                │
│ - Implement FastAPI server with /video_feed (MJPEG) and /ws/gestures.       │
│ - Target: Live mirrored video and JSON telemetry viewable in web browser.   │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────────┐
│ PHASE 3: Frontend Modularization & Integration                              │
│ - De-minify prototype into modular JS/CSS files; connect to WebSocket feed. │
│ - Target: Signing 'TRAIN' physically switches the UI from Home to Train view│
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────────┐
│ PHASE 4: Intent Router & Navigation Refinement                              │
│ - Implement context-aware intent engine, step-free map routing, and timeouts│
│ - Target: Smooth multi-gesture navigation without ghost triggers.           │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────────┐
│ PHASE 5: Assistance Workflow & Local Validation                             │
│ - Add assistance request logging, latency benchmark script, and kiosk runner│
│ - Target: Sub-50ms system latency, robust kiosk auto-recovery on disconnect │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Detailed Phase Milestones:

#### Phase 1: Recognition Engine Modularization
- **Objective**: Package the working inference code from `test_live_isl.py` into clean Python classes (`CameraStream`, `LandmarkExtractor`, `ModelRunner`, `GesturePipeline`) without changing a single mathematical operation or threshold.
- **Acceptance Criteria**: Running a test harness produces identical predictions, confidence values, and confirmation timings as the original script.

#### Phase 2: Local Bridge Server (FastAPI + WebSockets)
- **Objective**: Create the async FastAPI application hosting `/video_feed` and `/ws/gestures`.
- **Acceptance Criteria**: Navigating to `http://localhost:8000/video_feed` in Chrome displays the live webcam feed with skeleton landmarks at $\ge 20 \text{ FPS}$, and connecting a WebSocket client receives real-time JSON candidate telemetry.

#### Phase 3: Frontend Integration
- **Objective**: Unpack the HTML prototype into modular files, replace the floating camera placeholder with `<img src="http://localhost:8000/video_feed">`, and wire the WebSocket client to trigger screen navigation.
- **Acceptance Criteria**: Signing `TRAIN`, `WHERE`, `HELP`, or `MEDICAL` in front of the camera causes the browser interface to automatically switch screens with zero manual mouse clicks.

#### Phase 4: Intent Logic & Ambiguity Resolution
- **Objective**: Implement the context-aware intent engine (`intent_router.js`) handling sub-tabs (`WHEN`, `DESTINATION`, `ROUTE`), accessibility toggles, and session inactivity timeouts.
- **Acceptance Criteria**: Performing `TRAIN` followed by `WHEN` lands directly on upcoming train departures; 45 seconds of inactivity prompts the timeout dialog; physical touch inputs coexist seamlessly with gesture events.

#### Phase 5: Hardening, Latency Profiling & Documentation
- **Objective**: Implement graceful shutdown, startup automation script (`run_kiosk.bat`), latency benchmarking tool, and updated documentation.
- **Acceptance Criteria**: Total measured latency from confirmation event to DOM paint is $< 25 \text{ ms}$; the complete kiosk boots into fullscreen mode via a single double-click.

---

## 17. Risks & Unresolved Architectural Decisions

1. **Dataset Folder vs. Model Class Order Dependency**:
   - In `test_live_isl.py`, class names are sorted alphabetically from `os.listdir(DATASET_PATH)`.
   - *Risk*: If the dataset folder is moved, renamed, or classes are missing on another computer, class indices will misalign with the trained model's output neurons.
   - *Recommendation for Approval*: Hardcode the verified list of 11 classes in `config.py` in the exact alphabetical order used during model training:
     `['Destination', 'Platform', 'Route', 'Ticket', 'Train', 'When', 'Where', 'help', 'lost', 'medical', 'security']`.
2. **Cold-Start Buffer Delay (3.33 Seconds)**:
   - Requiring 20 frames sampled every 5th frame means that whenever the buffer is cleared (after an accepted gesture or idle reset), the user must sign for 3.33 seconds before inference can confirm the next sign.
   - *Decision*: Confirm whether this 3.3-second cadence feels natural for passengers during testing, or whether we should evaluate a smaller buffer (e.g. 15 frames) or a lower sampling skip (every 3 frames) in future model retraining.
3. **Staff Interface Scope**:
   - For this academic prototype stage, should the staff interface be an adjacent split-screen browser tab on the same machine, or will testing focus solely on the passenger-facing kiosk?

---

## Summary & Architectural Recommendation

The optimal architecture for SignMeet is a **locally co-located, single-computer kiosk architecture**:
1. **Python** acts as the dedicated Vision & Inference host, holding exclusive ownership of the webcam hardware and preserving the verified 132-feature Transformer pipeline.
2. **FastAPI** bridges Python and the UI with zero external dependencies, streaming an optimized MJPEG video feed to the UI's floating camera container and broadcasting confirmed gesture events over a lightweight local WebSocket.
3. The **Kiosk Interface** retains the existing, beautifully styled HTML/CSS design, de-minified and organized into clean ES6 modules for maximum performance, maintainability, and zero build-step overhead.

This approach guarantees the lowest possible latency, eliminates camera device conflicts, avoids unnecessary frame uploads, preserves all working model code, and produces an integrated, impressive, and fully functional prototype.
