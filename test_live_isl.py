import os
import cv2
import numpy as np
import tensorflow as tf
import mediapipe as mp

from collections import deque
from tensorflow.keras.models import load_model


# =====================================
# CONFIGURATION
# =====================================

MODEL_PATH = "isl_transformer_best_132.keras"
DATASET_PATH = "dataset_sign_metro"

TARGET_FRAMES = 20
NUM_FEATURES = 132
SAMPLE_EVERY_N_FRAMES = 5

DEFAULT_THRESHOLD = 0.80
LOW_THRESHOLD = 0.70

LOW_CONFIDENCE_WORDS = {
    "where",
    "train",
    "destination"
}

CONFIRMATION_FRAMES = 3
CAMERA_INDEX = 0


# =====================================
# CLASS NAMES
# =====================================

if not os.path.isdir(DATASET_PATH):
    raise FileNotFoundError(
        f"Dataset directory not found: {DATASET_PATH}"
    )

CLASS_NAMES = sorted([
    name for name in os.listdir(DATASET_PATH)
    if os.path.isdir(os.path.join(DATASET_PATH, name))
])

NUM_CLASSES = len(CLASS_NAMES)

print("Classes:", CLASS_NAMES)
print("Number of classes:", NUM_CLASSES)


# =====================================
# POSITIONAL ENCODING
# =====================================

class PositionalEncoding(tf.keras.layers.Layer):

    def __init__(self, max_len, d_model, **kwargs):
        super().__init__(**kwargs)

        pos = tf.cast(
            tf.range(max_len)[:, tf.newaxis],
            tf.float32
        )

        i = tf.cast(
            tf.range(d_model)[tf.newaxis, :],
            tf.float32
        )

        angle_rates = 1.0 / tf.pow(
            10000.0,
            (2.0 * tf.floor(i / 2.0))
            / tf.cast(d_model, tf.float32)
        )

        angle_rads = pos * angle_rates

        sines = tf.sin(angle_rads[:, 0::2])
        cosines = tf.cos(angle_rads[:, 1::2])

        self.max_len = max_len
        self.d_model = d_model

        self.pos_encoding = tf.concat(
            [sines, cosines],
            axis=-1
        )[tf.newaxis, ...]

    def call(self, x):
        return x + self.pos_encoding[:, :tf.shape(x)[1], :]

    def get_config(self):
        config = super().get_config()

        config.update({
            "max_len": self.max_len,
            "d_model": self.d_model
        })

        return config


# =====================================
# LOAD MODEL
# =====================================

print("\nLoading Transformer model...")

model = load_model(
    MODEL_PATH,
    custom_objects={
        "PositionalEncoding": PositionalEncoding
    },
    compile=False
)

print("Model loaded successfully!")
print("Input shape:", model.input_shape)
print("Output shape:", model.output_shape)

if tuple(model.input_shape[1:]) != (
    TARGET_FRAMES,
    NUM_FEATURES
):
    raise ValueError(
        f"Expected input (None, 20, 132), "
        f"got {model.input_shape}"
    )

if model.output_shape[-1] != NUM_CLASSES:
    raise ValueError(
        "Model output count does not match dataset classes. "
        "Check DATASET_PATH and class ordering."
    )


# =====================================
# MEDIAPIPE SETUP
# =====================================

mp_holistic = mp.solutions.holistic


def hand_arr(hand):

    if hand:
        return np.array(
            [[p.x, p.y, p.z] for p in hand.landmark],
            dtype=np.float32
        )

    return np.zeros((21, 3), dtype=np.float32)


# =====================================
# EXTRACT 132 FEATURES
# ORIGINAL, UNFLIPPED FRAME
# =====================================

def extract_landmarks(results):

    lh = hand_arr(results.left_hand_landmarks)
    rh = hand_arr(results.right_hand_landmarks)

    if results.pose_landmarks:

        pose = results.pose_landmarks.landmark

        ls = np.array(
            [pose[11].x, pose[11].y, pose[11].z],
            dtype=np.float32
        )

        rs = np.array(
            [pose[12].x, pose[12].y, pose[12].z],
            dtype=np.float32
        )

    else:

        ls = np.zeros(3, dtype=np.float32)
        rs = np.zeros(3, dtype=np.float32)

    center = (ls + rs) / 2.0

    width = np.linalg.norm(ls[:2] - rs[:2])

    if width == 0:
        width = 1.0

    def normalize_hand(hand):

        mask = hand.any(axis=1, keepdims=True)

        return np.where(
            mask,
            (hand - center) / width,
            0.0
        )

    lh = normalize_hand(lh)
    rh = normalize_hand(rh)

    ls = (ls - center) / width
    rs = (rs - center) / width

    features = np.concatenate([
        lh.ravel(),
        rh.ravel(),
        ls,
        rs
    ]).astype(np.float32)

    if features.shape != (NUM_FEATURES,):
        raise ValueError(
            f"Unexpected feature shape: {features.shape}"
        )

    return features


# =====================================
# RECOGNITION STATE
# =====================================

sequence_buffer = deque(maxlen=TARGET_FRAMES)

collected_words = []

candidate_prediction = None
candidate_count = 0

# Previous confirmed word
last_accepted_word = None

latest_prediction = "Waiting for frames..."
latest_confidence = 0.0
latest_threshold = DEFAULT_THRESHOLD
latest_status = "Show a sign"

frame_count = 0


def get_threshold(word):

    return (
        LOW_THRESHOLD
        if word.strip().lower() in LOW_CONFIDENCE_WORDS
        else DEFAULT_THRESHOLD
    )


def reset_candidate():

    global candidate_prediction, candidate_count

    candidate_prediction = None
    candidate_count = 0


def reset_prediction_state(clear_words=False):

    global last_accepted_word
    global latest_prediction, latest_confidence
    global latest_threshold, latest_status

    sequence_buffer.clear()
    reset_candidate()

    last_accepted_word = None

    latest_prediction = "Waiting for frames..."
    latest_confidence = 0.0
    latest_threshold = DEFAULT_THRESHOLD
    latest_status = "Reset complete"

    if clear_words:
        collected_words.clear()


# =====================================
# OPEN WEBCAM
# =====================================

cap = cv2.VideoCapture(CAMERA_INDEX)

if not cap.isOpened():
    raise RuntimeError("Could not open webcam.")

print("\nWebcam started.")
print("Q = Quit | R = Reset buffers | S = Clear words")


# =====================================
# LIVE RECOGNITION
# =====================================

try:

    with mp_holistic.Holistic(
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5
    ) as holistic:

        while True:

            ok, frame = cap.read()

            if not ok:
                break

            # =====================================
            # 1. PROCESS ORIGINAL FRAME
            # =====================================

            rgb = cv2.cvtColor(
                frame,
                cv2.COLOR_BGR2RGB
            )

            results = holistic.process(rgb)

            frame_count += 1
            new_sample_added = False

            # =====================================
            # 2. COLLECT LANDMARK FEATURES
            # =====================================

            if frame_count % SAMPLE_EVERY_N_FRAMES == 0:

                features = extract_landmarks(results)

                sequence_buffer.append(features)

                new_sample_added = True

            # =====================================
            # 3. MODEL PREDICTION
            # =====================================

            if (
                new_sample_added
                and len(sequence_buffer) == TARGET_FRAMES
            ):

                X_live = np.asarray(
                    sequence_buffer,
                    dtype=np.float32
                )[np.newaxis, ...]

                probabilities = model.predict(
                    X_live,
                    verbose=0
                )[0]

                pred_index = int(np.argmax(probabilities))

                word = CLASS_NAMES[pred_index]

                confidence = float(
                    probabilities[pred_index]
                )

                threshold = get_threshold(word)

                latest_prediction = word
                latest_confidence = confidence
                latest_threshold = threshold

                # =====================================
                # 4. CONFIDENCE + CONSECUTIVE CHECK
                # =====================================

                if confidence >= threshold:

                    # Same word above threshold consecutively
                    if word == candidate_prediction:

                        candidate_count += 1

                    else:

                        # Different word: start confirmation again
                        candidate_prediction = word
                        candidate_count = 1

                    latest_status = (
                        f"Confirming {word}: "
                        f"{candidate_count}/"
                        f"{CONFIRMATION_FRAMES}"
                    )

                    print(
                        f"\rPrediction: {word} | "
                        f"Confidence: {confidence:.1%} | "
                        f"Confirmation: "
                        f"{candidate_count}/"
                        f"{CONFIRMATION_FRAMES}",
                        end="",
                        flush=True
                    )

                    # =================================
                    # 5. ACCEPT AFTER 3 CONSECUTIVE HITS
                    # =================================

                    if candidate_count >= CONFIRMATION_FRAMES:

                        if word != last_accepted_word:

                            collected_words.append(word)

                            last_accepted_word = word

                            latest_status = f"Accepted: {word}"

                            print(
                                f"\nAccepted: {word} "
                                f"({confidence:.1%})"
                            )

                            print(
                                "Words:",
                                " ".join(collected_words)
                            )

                        else:

                            # Prevent consecutive duplicates
                            latest_status = (
                                f"Duplicate skipped: {word}"
                            )

                            print(
                                f"\nDuplicate skipped: {word}"
                            )

                        # Reset the sequence after confirmation.
                        # A fresh 20-frame sequence is needed next.
                        sequence_buffer.clear()

                        reset_candidate()

                else:

                    # Confidence fell below this word's threshold.
                    # Consecutive confirmation must restart.
                    reset_candidate()

                    latest_status = (
                        f"Low confidence: "
                        f"{confidence:.1%} < {threshold:.0%}"
                    )

            # =====================================
            # 6. MIRRORED PREVIEW
            # =====================================

            display_frame = cv2.flip(frame.copy(), 1)

            h, w, _ = display_frame.shape

            # =====================================
            # 7. DRAW MIRRORED HAND LANDMARKS
            # =====================================

            def draw_mirrored_hand(hand_landmarks):

                if not hand_landmarks:
                    return

                mirrored_points = []

                for p in hand_landmarks.landmark:

                    mirrored_points.append(
                        (
                            int((1.0 - p.x) * w),
                            int(p.y * h)
                        )
                    )

                for connection in mp_holistic.HAND_CONNECTIONS:

                    start_idx, end_idx = connection

                    p1 = mirrored_points[start_idx]
                    p2 = mirrored_points[end_idx]

                    cv2.line(
                        display_frame,
                        p1,
                        p2,
                        (0, 255, 0),
                        2
                    )

                for px, py in mirrored_points:

                    cv2.circle(
                        display_frame,
                        (px, py),
                        3,
                        (0, 0, 255),
                        -1
                    )

            draw_mirrored_hand(
                results.left_hand_landmarks
            )

            draw_mirrored_hand(
                results.right_hand_landmarks
            )

            # =====================================
            # 8. DRAW SHOULDER POINTS
            # =====================================

            if results.pose_landmarks:

                pose = results.pose_landmarks.landmark

                for index in [11, 12]:

                    point = pose[index]

                    if point.visibility > 0.5:

                        px = int((1.0 - point.x) * w)
                        py = int(point.y * h)

                        cv2.circle(
                            display_frame,
                            (px, py),
                            7,
                            (0, 255, 0),
                            -1
                        )

            # =====================================
            # 9. DISPLAY INFORMATION
            # =====================================

            cv2.rectangle(
                display_frame,
                (10, 10),
                (display_frame.shape[1] - 10, 225),
                (30, 30, 30),
                -1
            )

            words_text = " ".join(collected_words[-5:])

            lines = [
                (
                    f"Prediction: {latest_prediction}",
                    45,
                    (0, 255, 255)
                ),
                (
                    f"Confidence: {latest_confidence:.1%}",
                    80,
                    (255, 255, 255)
                ),
                (
                    f"Required: {latest_threshold:.0%}",
                    115,
                    (255, 255, 255)
                ),
                (
                    f"Status: {latest_status}",
                    150,
                    (0, 255, 0)
                ),
                (
                    f"Words: {words_text}",
                    185,
                    (255, 255, 255)
                ),
                (
                    f"Buffer: {len(sequence_buffer)}/20",
                    215,
                    (200, 200, 200)
                )
            ]

            for text, y, color in lines:

                cv2.putText(
                    display_frame,
                    text[:65],
                    (25, y),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.62,
                    color,
                    2
                )

            cv2.imshow(
                "SignMeet - Live ISL Recognition",
                display_frame
            )

            # =====================================
            # 10. KEYBOARD CONTROLS
            # =====================================

            key = cv2.waitKey(1) & 0xFF

            if key == ord("q"):
                break

            elif key == ord("r"):

                reset_prediction_state()

                print("\nPrediction buffers reset.")

            elif key == ord("s"):

                reset_prediction_state(clear_words=True)

                print("\nRecognized words cleared.")

finally:

    cap.release()
    cv2.destroyAllWindows()

print("\nFinal collected words:", collected_words)
print("Webcam stopped.")