"""
recognition/service.py
-----------------------
Main entry point for the Python recognition service.

Responsibilities:
  1. Open the webcam (exclusive ownership — browser must NOT call getUserMedia).
  2. Run MediaPipe Holistic + Transformer inference in the camera loop.
  3. Serve the mirrored preview as an MJPEG stream (HTTP, port 8766).
  4. Broadcast gesture events and telemetry over WebSockets (port 8765).

Start with:
    python -m recognition.service
"""

import asyncio
import json
import sys
import threading
import time
import traceback

import cv2
import mediapipe as mp
import numpy as np

# ---- asyncio-compatible WebSocket server ----
import websockets

# ---- local modules ----
from .config import (
    CAMERA_INDEX,
    MJPEG_HOST,
    MJPEG_PORT,
    PYTHON_SERVICE_HOST,
    PYTHON_SERVICE_PORT,
    PREVIEW_WIDTH,
    PREVIEW_HEIGHT,
    PREVIEW_JPEG_QUALITY,
)
from .model_runner import ModelRunner
from .landmark_extractor import extract_landmarks
from .gesture_pipeline import GesturePipeline

# ====================================================================
# Shared state between threads
# ====================================================================

_lock                = threading.Lock()
_latest_jpeg: bytes  = b""          # Current preview JPEG
_camera_ready        = False
_model_ready         = False
_model_error         = None

# Connected WebSocket clients
_ws_clients: set     = set()
_ws_clients_lock     = threading.Lock()

# Outgoing event queue (camera thread -> WS broadcast task)
_event_queue: asyncio.Queue | None = None

# ====================================================================
# MJPEG HTTP preview server (pure Python, no external web framework)
# ====================================================================

import socket
from http.server import BaseHTTPRequestHandler, HTTPServer


class _MJPEGHandler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        pass   # Suppress per-request logs

    def do_GET(self):
        if self.path in ("/", "/video_feed"):
            self.send_response(200)
            self.send_header(
                "Content-Type",
                "multipart/x-mixed-replace; boundary=frame"
            )
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()

            try:
                while True:
                    with _lock:
                        jpeg = _latest_jpeg

                    if jpeg:
                        self.wfile.write(b"--frame\r\n")
                        self.wfile.write(b"Content-Type: image/jpeg\r\n\r\n")
                        self.wfile.write(jpeg)
                        self.wfile.write(b"\r\n")
                    else:
                        time.sleep(0.05)
            except (BrokenPipeError, ConnectionResetError):
                pass

        elif self.path == "/status":
            body = json.dumps({
                "camera_ready": _camera_ready,
                "model_ready":  _model_ready,
                "model_error":  _model_error,
            }).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)

        else:
            self.send_response(404)
            self.end_headers()


def _run_mjpeg_server():
    server = HTTPServer((MJPEG_HOST, MJPEG_PORT), _MJPEGHandler)
    print(f"[MJPEG] Preview stream → http://localhost:{MJPEG_PORT}/video_feed")
    server.serve_forever()


# ====================================================================
# Camera / recognition loop (runs in a dedicated thread)
# ====================================================================

def _camera_loop(loop: asyncio.AbstractEventLoop, pipeline: GesturePipeline):
    global _camera_ready, _latest_jpeg

    mp_holistic = mp.solutions.holistic

    cap = cv2.VideoCapture(CAMERA_INDEX)
    if not cap.isOpened():
        print(f"[Camera] ERROR: Cannot open camera index {CAMERA_INDEX}.")
        _camera_ready = False
        _push_event(loop, {
            "type":  "SYSTEM_STATUS",
            "camera_ready": False,
            "model_ready":  _model_ready,
            "error": f"Cannot open camera index {CAMERA_INDEX}",
        })
        return

    _camera_ready = True
    print(f"[Camera] Webcam {CAMERA_INDEX} opened.")
    _push_event(loop, {
        "type":         "SYSTEM_STATUS",
        "camera_ready": True,
        "model_ready":  _model_ready,
        "error":        None,
    })

    try:
        with mp_holistic.Holistic(
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        ) as holistic:

            while True:
                ok, frame = cap.read()
                if not ok:
                    print("[Camera] Frame read failed — stopping loop.")
                    break

                # ---- inference (original, unflipped frame) ----
                rgb     = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                results = holistic.process(rgb)

                # ---- gesture pipeline ----
                event = pipeline.process_frame(results)

                if event:
                    print(f"[Pipeline] Accepted: {event['label']} ({event['confidence']:.1%})")
                    _push_event(loop, event)

                # ---- telemetry every new inference or ~10 frames ----
                if pipeline.has_new_inference or pipeline.frame_count % 10 == 0:
                    pipeline.has_new_inference = False
                    _push_event(loop, pipeline.get_telemetry())

                # ---- build mirrored MJPEG preview ----
                display = cv2.flip(frame, 1)
                h, w, _ = display.shape

                # Draw mirrored hand skeleton
                _draw_mirrored_hand(display, results.left_hand_landmarks,  w, h, mp_holistic)
                _draw_mirrored_hand(display, results.right_hand_landmarks, w, h, mp_holistic)

                # Draw shoulder markers
                if results.pose_landmarks:
                    for idx in [11, 12]:
                        pt = results.pose_landmarks.landmark[idx]
                        if pt.visibility > 0.5:
                            px = int((1.0 - pt.x) * w)
                            py = int(pt.y * h)
                            cv2.circle(display, (px, py), 7, (0, 220, 0), -1)

                # Overlay minimal status text
                status_text = pipeline.latest_status[:60]
                cv2.rectangle(display, (0, h - 28), (w, h), (0, 0, 0), -1)
                cv2.putText(display, status_text, (6, h - 8),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1)

                # Downsample + JPEG encode for preview
                small = cv2.resize(display, (PREVIEW_WIDTH, PREVIEW_HEIGHT))
                ret, buf = cv2.imencode(
                    ".jpg", small,
                    [cv2.IMWRITE_JPEG_QUALITY, PREVIEW_JPEG_QUALITY]
                )
                if ret:
                    with _lock:
                        _latest_jpeg = buf.tobytes()

    except Exception as exc:
        print(f"[Camera] Unhandled exception: {exc}")
        traceback.print_exc()
    finally:
        cap.release()
        _camera_ready = False
        print("[Camera] Released.")


def _draw_mirrored_hand(frame, hand_landmarks, w, h, mp_holistic):
    if not hand_landmarks:
        return
    pts = [(int((1.0 - p.x) * w), int(p.y * h)) for p in hand_landmarks.landmark]
    for s, e in mp_holistic.HAND_CONNECTIONS:
        cv2.line(frame, pts[s], pts[e], (0, 255, 0), 2)
    for px, py in pts:
        cv2.circle(frame, (px, py), 3, (0, 0, 255), -1)


# ====================================================================
# WebSocket server (asyncio)
# ====================================================================

async def _ws_handler(websocket):
    """Handle one WebSocket client connection."""
    addr = websocket.remote_address
    print(f"[WS] Client connected: {addr}")

    with _ws_clients_lock:
        _ws_clients.add(websocket)

    # Send current status immediately on connect
    await _safe_send(websocket, {
        "type":         "SYSTEM_STATUS",
        "camera_ready": _camera_ready,
        "model_ready":  _model_ready,
        "error":        _model_error,
    })

    try:
        async for raw in websocket:
            try:
                msg = json.loads(raw)
                _handle_ws_command(msg)
            except json.JSONDecodeError:
                pass
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        with _ws_clients_lock:
            _ws_clients.discard(websocket)
        print(f"[WS] Client disconnected: {addr}")


def _handle_ws_command(msg: dict):
    """Process commands sent from the Node backend or browser."""
    cmd = msg.get("command")
    if cmd == "RESET_BUFFERS":
        if _pipeline_ref:
            _pipeline_ref.reset()
        print("[WS] Buffer reset requested by client.")
    elif cmd == "SET_SCREEN":
        if _pipeline_ref:
            screen = msg.get("screen", "home")
            allowed = msg.get("allowed_gestures")
            _pipeline_ref.set_active_screen(screen, allowed)


async def _broadcast_loop():
    """Drain the event queue and fan-out to all connected WS clients."""
    while True:
        event = await _event_queue.get()
        payload = json.dumps(event)

        with _ws_clients_lock:
            clients = list(_ws_clients)

        dead = set()
        for ws in clients:
            try:
                await ws.send(payload)
            except Exception:
                dead.add(ws)

        if dead:
            with _ws_clients_lock:
                _ws_clients.difference_update(dead)


def _push_event(loop: asyncio.AbstractEventLoop, event: dict):
    """Thread-safe enqueue from camera thread to asyncio broadcast loop."""
    if _event_queue is not None:
        asyncio.run_coroutine_threadsafe(_event_queue.put(event), loop)


async def _safe_send(ws, payload: dict):
    try:
        await ws.send(json.dumps(payload))
    except Exception:
        pass


# ====================================================================
# Entry point
# ====================================================================

_pipeline_ref: GesturePipeline | None = None   # Set in main() for command handler


async def _main_async():
    global _event_queue, _pipeline_ref, _model_ready, _model_error

    _event_queue = asyncio.Queue()

    # ---- Load model ----
    runner = ModelRunner()
    ok = runner.load()
    _model_ready = ok
    _model_error = runner.error if not ok else None

    if not ok:
        print(f"[Service] FATAL: Model failed to load. {runner.error}")
        print("[Service] Service will start, but inference is disabled.")

    # ---- Create gesture pipeline ----
    pipeline = GesturePipeline(runner, extract_landmarks)
    _pipeline_ref = pipeline

    # ---- Start MJPEG server in a daemon thread ----
    mjpeg_thread = threading.Thread(target=_run_mjpeg_server, daemon=True)
    mjpeg_thread.start()

    # ---- Start camera loop in a daemon thread ----
    loop = asyncio.get_running_loop()
    cam_thread = threading.Thread(
        target=_camera_loop, args=(loop, pipeline), daemon=True
    )
    cam_thread.start()

    # ---- Start WebSocket server ----
    print(f"[WS] Gesture WebSocket → ws://localhost:{PYTHON_SERVICE_PORT}")
    ws_server = await websockets.serve(
        _ws_handler,
        PYTHON_SERVICE_HOST,
        PYTHON_SERVICE_PORT,
    )

    # ---- Run broadcast loop alongside WS server ----
    await asyncio.gather(
        ws_server.wait_closed(),
        _broadcast_loop(),
    )


def main():
    print("=" * 60)
    print("  SignMeet — Python Recognition Service")
    print("=" * 60)
    try:
        asyncio.run(_main_async())
    except KeyboardInterrupt:
        print("\n[Service] Shutting down.")
    except Exception as e:
        print(f"\n[Service] Fatal error: {e}")
        traceback.print_exc()


if __name__ == "__main__":
    main()
