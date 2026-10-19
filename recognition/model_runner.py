"""
recognition/model_runner.py
---------------------------
Loads the Keras Transformer model once and exposes a predict() method.
The PositionalEncoding custom layer is defined here exactly as in test_live_isl.py.
"""

import numpy as np
import tensorflow as tf
from tensorflow.keras.models import load_model

from .config import MODEL_PATH, TARGET_FRAMES, NUM_FEATURES, CLASS_NAMES


# ---------------------------------------------------------------------------
# Custom Keras layer — identical to test_live_isl.py
# ---------------------------------------------------------------------------

class PositionalEncoding(tf.keras.layers.Layer):

    def __init__(self, max_len, d_model, **kwargs):
        super().__init__(**kwargs)

        pos = tf.cast(tf.range(max_len)[:, tf.newaxis], tf.float32)
        i   = tf.cast(tf.range(d_model)[tf.newaxis, :], tf.float32)

        angle_rates = 1.0 / tf.pow(
            10000.0,
            (2.0 * tf.floor(i / 2.0)) / tf.cast(d_model, tf.float32)
        )

        angle_rads = pos * angle_rates

        sines   = tf.sin(angle_rads[:, 0::2])
        cosines = tf.cos(angle_rads[:, 1::2])

        self.max_len = max_len
        self.d_model = d_model

        self.pos_encoding = tf.concat([sines, cosines], axis=-1)[tf.newaxis, ...]

    def call(self, x):
        return x + self.pos_encoding[:, :tf.shape(x)[1], :]

    def get_config(self):
        config = super().get_config()
        config.update({"max_len": self.max_len, "d_model": self.d_model})
        return config


# ---------------------------------------------------------------------------
# Model loader / runner
# ---------------------------------------------------------------------------

class ModelRunner:
    """Loads the model once; predict() is called per sequence."""

    def __init__(self):
        self.model      = None
        self.is_loaded  = False
        self.error      = None

    def load(self):
        """Load the model from disk. Call once at startup."""
        print(f"[ModelRunner] Loading model from {MODEL_PATH} …")

        try:
            self.model = load_model(
                MODEL_PATH,
                custom_objects={"PositionalEncoding": PositionalEncoding},
                compile=False,
            )
        except Exception as exc:
            self.error = str(exc)
            print(f"[ModelRunner] ERROR: {exc}")
            return False

        # Validate shape
        expected_in  = (TARGET_FRAMES, NUM_FEATURES)
        expected_out = len(CLASS_NAMES)

        if tuple(self.model.input_shape[1:]) != expected_in:
            self.error = (
                f"Model input shape mismatch: "
                f"expected {expected_in}, got {self.model.input_shape[1:]}"
            )
            print(f"[ModelRunner] ERROR: {self.error}")
            return False

        if self.model.output_shape[-1] != expected_out:
            self.error = (
                f"Model output count {self.model.output_shape[-1]} "
                f"does not match CLASS_NAMES count {expected_out}"
            )
            print(f"[ModelRunner] ERROR: {self.error}")
            return False

        # Warm-up pass — triggers TF graph compilation so the first real
        # prediction is not penalised by XLA/Autograph tracing latency.
        dummy = np.zeros((1, TARGET_FRAMES, NUM_FEATURES), dtype=np.float32)
        self.model.predict(dummy, verbose=0)

        self.is_loaded = True
        print(
            f"[ModelRunner] Model loaded. "
            f"Input {self.model.input_shape} | Output {self.model.output_shape}"
        )
        return True

    def predict(self, sequence: np.ndarray):
        """
        Run inference on one (TARGET_FRAMES, NUM_FEATURES) sequence.

        Returns
        -------
        (class_name: str, confidence: float, probabilities: np.ndarray)
        """
        if not self.is_loaded:
            raise RuntimeError("Model is not loaded.")

        X = sequence[np.newaxis, ...]                   # (1, 20, 132)
        probs = self.model.predict(X, verbose=0)[0]     # (11,)
        idx   = int(np.argmax(probs))
        return CLASS_NAMES[idx], float(probs[idx]), probs
