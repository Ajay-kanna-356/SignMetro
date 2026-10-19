"""
recognition/landmark_extractor.py
----------------------------------
Extracts and normalises the 132-feature vector from MediaPipe Holistic results.
Logic is identical to test_live_isl.py — do not change the maths here.
"""

import numpy as np
from .config import NUM_FEATURES


def _hand_arr(hand):
    """Return (21, 3) float32 for a hand, or zeros if hand is absent."""
    if hand:
        return np.array([[p.x, p.y, p.z] for p in hand.landmark], dtype=np.float32)
    return np.zeros((21, 3), dtype=np.float32)


def extract_landmarks(results) -> np.ndarray:
    """
    Extract 132 normalised features from a MediaPipe Holistic result.

    Feature layout (same as training data):
        [lh_norm  (63)] [rh_norm  (63)] [ls_norm (3)] [rs_norm (3)]
    """
    lh = _hand_arr(results.left_hand_landmarks)
    rh = _hand_arr(results.right_hand_landmarks)

    if results.pose_landmarks:
        pose = results.pose_landmarks.landmark
        ls   = np.array([pose[11].x, pose[11].y, pose[11].z], dtype=np.float32)
        rs   = np.array([pose[12].x, pose[12].y, pose[12].z], dtype=np.float32)
    else:
        ls = np.zeros(3, dtype=np.float32)
        rs = np.zeros(3, dtype=np.float32)

    center = (ls + rs) / 2.0
    width  = np.linalg.norm(ls[:2] - rs[:2])

    if width == 0:
        width = 1.0

    def _norm(hand):
        mask = hand.any(axis=1, keepdims=True)
        return np.where(mask, (hand - center) / width, 0.0)

    lh = _norm(lh)
    rh = _norm(rh)
    ls = (ls - center) / width
    rs = (rs - center) / width

    features = np.concatenate([
        lh.ravel(), rh.ravel(), ls, rs
    ]).astype(np.float32)

    if features.shape != (NUM_FEATURES,):
        raise ValueError(f"Unexpected feature shape: {features.shape}")

    return features
