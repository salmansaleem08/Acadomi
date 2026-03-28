"""MediaPipe FaceMesh focus estimation for the Acadomi AI tutor (webcam frames)."""

from __future__ import annotations

import os
import time
from collections import deque

import cv2
import numpy as np


def _ensure_mediapipe_face_mesh():
    """
    Import FaceMesh without relying on `import mediapipe as mp; mp.solutions`
    (some installs expose a broken top-level module). Also detect a local
    mediapipe.py shadowing the real package.
    """
    here = os.path.dirname(os.path.abspath(__file__))
    shadow = os.path.join(here, "mediapipe.py")
    if os.path.isfile(shadow):
        raise ImportError(
            "File python/services/tutor/mediapipe.py shadows the real 'mediapipe' package. "
            "Rename or remove it, then reinstall: pip install 'mediapipe>=0.10.14,<0.11'"
        )
    try:
        from mediapipe.solutions import face_mesh as face_mesh_module
    except ImportError:
        try:
            from mediapipe.python.solutions import face_mesh as face_mesh_module
        except ImportError as e:
            raise ImportError(
                "Could not import mediapipe FaceMesh. Fix: pip uninstall mediapipe -y && "
                "pip install 'mediapipe>=0.10.14,<0.11' (use Python 3.10–3.12 for best wheel support)."
            ) from e
    if not hasattr(face_mesh_module, "FaceMesh"):
        raise ImportError("mediapipe face_mesh module has no FaceMesh — broken install.")
    return face_mesh_module


_face_mesh_module = None


def _get_face_mesh_module():
    global _face_mesh_module
    if _face_mesh_module is None:
        _face_mesh_module = _ensure_mediapipe_face_mesh()
    return _face_mesh_module


class FocusTracker:
    PITCH_TOLERANCE = 25.0
    HEAD_DOWN_THRESH = 45.0
    YAW_TOLERANCE = 20.0
    EAR_BLINK_THRESH = 0.03
    EAR_DROP_THRESH = 0.04
    SLEEP_LIMIT = 15.0
    HEAD_DOWN_LIMIT = 15.0

    GAZE_MOVE_THRESH = 0.5

    BLINK_THRESHOLD = 15.0
    GAZE_STILL_THRESHOLD = 15.0

    W_POSE = 0.4
    W_EYES = 0.3
    W_GAZE = 0.3

    MAX_CALIB_FRAMES = 30

    LEFT_EYE = [33, 160, 158, 133, 153, 144]
    RIGHT_EYE = [362, 385, 387, 263, 373, 380]

    def __init__(self) -> None:
        fm = _get_face_mesh_module()
        self.face_mesh = fm.FaceMesh(
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self._reset_state()

    def _reset_state(self) -> None:
        self.is_calibrated = False
        self.calibration_frames = 0
        self._calib_pitch_sum = 0.0
        self._calib_yaw_sum = 0.0
        self._calib_ear_sum = 0.0
        self.baseline_pitch = 0.0
        self.baseline_yaw = 0.0
        self.baseline_ear = 0.0

        self.last_blink_time = time.time()
        self.last_gaze_move_time = time.time()

        self.focus_history = deque(maxlen=20)
        self.gaze_history = deque(maxlen=30)

        self.head_down_start_time: float | None = None
        self.eyes_closed_start_time: float | None = None

    def _get_head_pose(self, landmarks, img_w: int, img_h: int) -> tuple[float, float, float]:
        face_3d = np.array(
            [
                [0.0, 0.0, 0.0],
                [0.0, 330.0, -65.0],
                [-225.0, -170.0, -135.0],
                [225.0, -170.0, -135.0],
                [-150.0, 150.0, -125.0],
                [150.0, 150.0, -125.0],
            ],
            dtype=np.float64,
        )
        face_2d = np.array(
            [[landmarks[i].x * img_w, landmarks[i].y * img_h] for i in [1, 152, 33, 263, 61, 291]],
            dtype=np.float64,
        )
        focal_length = float(img_w)
        # Principal point should be image center (cx = w/2, cy = h/2) for stable pose.
        cam_matrix = np.array(
            [
                [focal_length, 0.0, img_w / 2],
                [0.0, focal_length, img_h / 2],
                [0.0, 0.0, 1.0],
            ],
        )
        dist_coeffs = np.zeros((4, 1))
        _, rot_vec, _ = cv2.solvePnP(face_3d, face_2d, cam_matrix, dist_coeffs)
        rmat, _ = cv2.Rodrigues(rot_vec)
        angles, *_ = cv2.RQDecomp3x3(rmat)
        return angles[0], angles[1], angles[2]

    def _calculate_ear(self, landmarks, indices: list[int]) -> float:
        pts = np.array([[landmarks[i].x, landmarks[i].y] for i in indices])
        v1 = float(np.linalg.norm(pts[1] - pts[5]))
        v2 = float(np.linalg.norm(pts[2] - pts[4]))
        h = float(np.linalg.norm(pts[0] - pts[3]))
        return (v1 + v2) / (2.0 * h) if h > 0 else 0.0

    def _get_iris_gaze_score(self, landmarks) -> float:
        l_iris = landmarks[468].x
        l_center = (landmarks[33].x + landmarks[133].x) / 2
        r_iris = landmarks[473].x
        r_center = (landmarks[362].x + landmarks[263].x) / 2
        avg_dist = (abs(l_iris - l_center) + abs(r_iris - r_center)) / 2
        if avg_dist < 0.004:
            return 1.0
        if avg_dist < 0.008:
            return 0.5
        return 0.0

    def process_frame(self, frame: np.ndarray) -> dict:
        h, w, _ = frame.shape
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self.face_mesh.process(rgb)
        if not results.multi_face_landmarks:
            return self._no_face_result()
        lm = results.multi_face_landmarks[0].landmark
        if not self.is_calibrated:
            return self._calibrate(lm, w, h)
        return self._monitor(lm, w, h)

    def _calibrate(self, lm, w: int, h: int) -> dict:
        pitch, yaw, roll = self._get_head_pose(lm, w, h)
        ear = (self._calculate_ear(lm, self.LEFT_EYE) + self._calculate_ear(lm, self.RIGHT_EYE)) / 2.0

        self.calibration_frames += 1
        self._calib_pitch_sum += pitch
        self._calib_yaw_sum += yaw
        self._calib_ear_sum += ear

        if self.calibration_frames >= self.MAX_CALIB_FRAMES:
            n = float(self.MAX_CALIB_FRAMES)
            self.baseline_pitch = self._calib_pitch_sum / n
            self.baseline_yaw = self._calib_yaw_sum / n
            self.baseline_ear = self._calib_ear_sum / n
            self.is_calibrated = True
            self.last_blink_time = time.time()
            self.last_gaze_move_time = time.time()

        progress = self.calibration_frames / float(self.MAX_CALIB_FRAMES)
        return {
            "face_found": True,
            "is_calibrated": self.is_calibrated,
            "status": "CALIBRATING",
            "alarm": False,
            "focus_val": None,
            "pitch": round(pitch, 2),
            "yaw": round(yaw, 2),
            "roll": round(roll, 2),
            "ear": round(ear, 4),
            "calibration_progress": round(min(1.0, progress), 3),
        }

    def _monitor(self, lm, w: int, h: int) -> dict:
        now = time.time()
        pitch, yaw, roll = self._get_head_pose(lm, w, h)
        ear = (self._calculate_ear(lm, self.LEFT_EYE) + self._calculate_ear(lm, self.RIGHT_EYE)) / 2.0

        if (self.baseline_ear - ear) > self.EAR_BLINK_THRESH:
            self.last_blink_time = now
        time_since_blink = now - self.last_blink_time

        iris_mid = (lm[468].x + lm[473].x) / 2.0
        self.gaze_history.append(iris_mid)
        gaze_variance = (
            float(np.var(list(self.gaze_history)) * 10000) if len(self.gaze_history) > 10 else 0.0
        )

        if gaze_variance > self.GAZE_MOVE_THRESH:
            self.last_gaze_move_time = now
        time_since_gaze_move = now - self.last_gaze_move_time

        stare_alarm = time_since_blink > self.BLINK_THRESHOLD and time_since_gaze_move > self.GAZE_STILL_THRESHOLD

        delta_pitch = abs(pitch - self.baseline_pitch)
        delta_yaw = abs(yaw - self.baseline_yaw)
        delta_ear = self.baseline_ear - ear

        pose_score = 1.0 if (delta_pitch < self.PITCH_TOLERANCE and delta_yaw < self.YAW_TOLERANCE) else 0.0
        eye_score = 1.0 if delta_ear < self.EAR_DROP_THRESH else 0.0
        gaze_score = self._get_iris_gaze_score(lm)

        focus_val = pose_score * self.W_POSE + eye_score * self.W_EYES + gaze_score * self.W_GAZE
        alarm_reason: str | None = None

        if delta_ear > self.EAR_DROP_THRESH:
            if self.eyes_closed_start_time is None:
                self.eyes_closed_start_time = now
            elif (now - self.eyes_closed_start_time) > self.SLEEP_LIMIT:
                focus_val, alarm_reason = 0.0, "WAKE UP"
        else:
            self.eyes_closed_start_time = None

        if delta_pitch > self.HEAD_DOWN_THRESH:
            if self.head_down_start_time is None:
                self.head_down_start_time = now
            elif (now - self.head_down_start_time) > self.HEAD_DOWN_LIMIT:
                focus_val, alarm_reason = 0.0, "HEAD DOWN"
        else:
            self.head_down_start_time = None

        if stare_alarm:
            focus_val, alarm_reason = 0.0, "PLEASE BLINK"

        self.focus_history.append(focus_val * 100)
        avg_focus = sum(self.focus_history) / len(self.focus_history)

        if alarm_reason:
            status, alarm_trigger = alarm_reason, True
            self.focus_history.clear()
            self.focus_history.append(0.0)
            avg_focus = 0.0
        elif avg_focus > 75:
            status, alarm_trigger = "FOCUSED", False
        elif avg_focus > 40:
            status, alarm_trigger = "DISTRACTED", False
        else:
            status, alarm_trigger = "NOT FOCUSED", True

        return {
            "face_found": True,
            "focus_val": int(avg_focus),
            "status": status,
            "alarm": alarm_trigger,
            "is_calibrated": True,
            "pitch": round(pitch, 2),
            "yaw": round(yaw, 2),
            "roll": round(roll, 2),
            "delta_pitch": round(delta_pitch, 2),
            "delta_yaw": round(delta_yaw, 2),
            "baseline_pitch": round(self.baseline_pitch, 2),
            "baseline_yaw": round(self.baseline_yaw, 2),
            "baseline_ear": round(self.baseline_ear, 4),
            "ear": round(ear, 4),
            "delta_ear": round(delta_ear, 4),
            "gaze_variance": round(gaze_variance, 4),
            "time_since_blink_sec": round(time_since_blink, 2),
            "time_since_gaze_move_sec": round(time_since_gaze_move, 2),
            "pose_score": pose_score,
            "eye_score": eye_score,
            "gaze_score": gaze_score,
            "stare_alarm": stare_alarm,
            "raw_focus": round(focus_val, 4),
        }

    def _no_face_result(self) -> dict:
        return {
            "face_found": False,
            "focus_val": 0,
            "status": "NO FACE",
            "alarm": True,
            "is_calibrated": self.is_calibrated,
        }


def mediapipe_import_ok() -> tuple[bool, str]:
    """For /health: verify FaceMesh can be loaded."""
    try:
        mod = _ensure_mediapipe_face_mesh()
        return True, str(getattr(mod, "__file__", "mediapipe.face_mesh"))
    except Exception as e:
        return False, str(e)
