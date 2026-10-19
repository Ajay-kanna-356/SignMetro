"""
recognition/gesture_pipeline.py
---------------------------------
Maintains recognition state: sequence buffer, candidate confirmation, and
duplicate suppression.  Logic is identical to test_live_isl.py; only the
side-effects (cv2.imshow, print) are removed so it can run headless.
"""

from collections import deque
import numpy as np

from .config import (
    TARGET_FRAMES,
    SAMPLE_EVERY_N,
    DEFAULT_THRESHOLD,
    GESTURE_THRESHOLDS,
    SCREEN_GESTURES,
    CONFIRMATION_FRAMES,
    CLASS_NAMES,
)


class GesturePipeline:
    """
    Stateful recognition pipeline.

    Call process_frame() on every raw frame. It returns a GestureEvent
    when a gesture is confirmed, otherwise None.
    """

    def __init__(self, model_runner, landmark_extractor_fn):
        self.model     = model_runner
        self.extract   = landmark_extractor_fn

        # ---- state identical to test_live_isl.py ----
        self.sequence_buffer     = deque(maxlen=TARGET_FRAMES)
        self.candidate_prediction = None
        self.candidate_count      = 0
        self.last_accepted_word   = None
        self.frame_count          = 0

        # ---- contextual screen gating ----
        self.current_screen      = "home"
        self.allowed_gestures    = SCREEN_GESTURES.get("home", None)

        # ---- telemetry (for status broadcasts) ----
        self.latest_prediction   = "Waiting for frames…"
        self.latest_confidence   = 0.0
        self.latest_threshold    = DEFAULT_THRESHOLD
        self.latest_top          = []
        self.latest_status       = "Show a sign"
        self.buffer_fill         = 0
        self.has_new_inference   = False

    def set_active_screen(self, screen: str, allowed_gestures=None):
        """Update active kiosk screen and filter model vocabulary to valid options."""
        scr = (screen or "home").strip().lower()
        self.current_screen = scr
        if allowed_gestures is not None and len(allowed_gestures) > 0:
            self.allowed_gestures = [g.strip().lower() for g in allowed_gestures]
        else:
            self.allowed_gestures = SCREEN_GESTURES.get(scr, None)

        # Clear candidate to avoid cross-screen gesture leakage
        self.candidate_prediction = None
        self.candidate_count      = 0
        print(f"[Pipeline] Active screen set to '{scr}'. Allowed: {self.allowed_gestures}")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def process_frame(self, holistic_results):
        """
        Process one MediaPipe Holistic result.

        Returns
        -------
        dict | None
            If a gesture was confirmed: {"type": "GESTURE_ACCEPTED", ...}
            Otherwise: None
        """
        self.frame_count += 1
        accepted_event = None

        # ---- sample every N frames ----
        if self.frame_count % SAMPLE_EVERY_N == 0:
            features = self.extract(holistic_results)
            self.sequence_buffer.append(features)
            self.buffer_fill = len(self.sequence_buffer)

            # ---- run inference once buffer is full ----
            if len(self.sequence_buffer) == TARGET_FRAMES:
                accepted_event = self._run_inference()

        return accepted_event

    def get_telemetry(self):
        """Return current recognition state for status broadcasts."""
        return {
            "type":               "RECOGNITION_TELEMETRY",
            "screen":             self.current_screen,
            "allowed_gestures":   self.allowed_gestures,
            "prediction":         self.latest_prediction,
            "confidence":         round(self.latest_confidence, 4),
            "confidence_percent": round(self.latest_confidence * 100, 1),
            "threshold":          self.latest_threshold,
            "threshold_percent":  round(self.latest_threshold * 100, 1),
            "top":                self.latest_top,
            "status":             self.latest_status,
            "candidate":          self.candidate_prediction,
            "confirmation_count": self.candidate_count,
            "required":           CONFIRMATION_FRAMES,
            "buffer_fill":        self.buffer_fill,
            "buffer_max":         TARGET_FRAMES,
        }

    def reset(self, clear_last_word=True):
        """Reset buffers (e.g., when frontend requests it or session resets)."""
        self.sequence_buffer.clear()
        self.candidate_prediction = None
        self.candidate_count      = 0
        self.buffer_fill          = 0
        self.latest_top           = []
        self.has_new_inference    = False

        if clear_last_word:
            self.last_accepted_word = None

        self.latest_prediction = "Waiting for frames…"
        self.latest_confidence = 0.0
        self.latest_threshold  = DEFAULT_THRESHOLD
        self.latest_status     = "Reset complete"

    # ------------------------------------------------------------------
    # Internal helpers — identical logic to test_live_isl.py
    # ------------------------------------------------------------------

    def _get_threshold(self, word: str) -> float:
        return GESTURE_THRESHOLDS.get(word.strip().lower(), DEFAULT_THRESHOLD)

    def _run_inference(self):
        """Run model, apply thresholds and confirmation logic. Returns event or None."""
        seq = np.asarray(self.sequence_buffer, dtype=np.float32)
        _raw_word, _raw_conf, probs = self.model.predict(seq)

        # Filter strictly to allowed gestures for the active screen
        if self.allowed_gestures and len(self.allowed_gestures) > 0:
            eligible_indices = [
                i for i, name in enumerate(CLASS_NAMES)
                if name.lower() in self.allowed_gestures
            ]
        else:
            eligible_indices = list(range(len(CLASS_NAMES)))

        if not eligible_indices:
            eligible_indices = list(range(len(CLASS_NAMES)))

        # Select highest-probability gesture among eligible options ONLY
        best_idx = max(eligible_indices, key=lambda i: probs[i])
        word = CLASS_NAMES[best_idx]
        confidence = float(probs[best_idx])
        threshold = self._get_threshold(word)

        self.latest_prediction = word
        self.latest_confidence = confidence
        self.latest_threshold  = threshold
        self.has_new_inference = True

        # Sort eligible options for top live display
        sorted_eligible = sorted(eligible_indices, key=lambda i: probs[i], reverse=True)[:3]
        self.latest_top = [
            {"sign": CLASS_NAMES[i], "prob": round(float(probs[i]) * 100, 1)}
            for i in sorted_eligible
        ]

        if confidence >= threshold:
            # Same word above threshold consecutively
            if word == self.candidate_prediction:
                self.candidate_count += 1
            else:
                self.candidate_prediction = word
                self.candidate_count      = 1

            self.latest_status = (
                f"Confirming {word}: {self.candidate_count}/{CONFIRMATION_FRAMES}"
            )

            if self.candidate_count >= CONFIRMATION_FRAMES:
                # ---- accepted ----
                if word != self.last_accepted_word:
                    self.last_accepted_word = word
                    self.latest_status      = f"Accepted: {word}"

                    # Reset sequence after confirmation (as in original script)
                    self.sequence_buffer.clear()
                    self.buffer_fill      = 0
                    self.candidate_prediction = None
                    self.candidate_count      = 0

                    return {
                        "type":       "GESTURE_ACCEPTED",
                        "gesture":    word.lower(),
                        "label":      word,
                        "confidence": round(confidence, 4),
                    }
                else:
                    # Duplicate suppression
                    self.latest_status = f"Duplicate skipped: {word}"

                    self.sequence_buffer.clear()
                    self.buffer_fill      = 0
                    self.candidate_prediction = None
                    self.candidate_count      = 0

        else:
            # Confidence fell below threshold — restart confirmation
            self.candidate_prediction = None
            self.candidate_count      = 0
            self.latest_status = (
                f"Low confidence: {confidence:.1%} < {threshold:.0%}"
            )

        return None
