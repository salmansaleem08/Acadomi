"""
Acadomi tutor microservice: gTTS narration + MediaPipe focus (called by Node only).
Slides and Q&A use Gemini on the Express API.
"""

from __future__ import annotations

import base64
import os
import threading
from io import BytesIO

import cv2
import numpy as np
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from gtts import gTTS
from pydantic import BaseModel, Field

from focus_tracker import FocusTracker, mediapipe_import_ok

_here = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_here, ".env"))
load_dotenv()

app = FastAPI(title="Acadomi Tutor Service", version="1.0.0")

_trackers: dict[str, FocusTracker] = {}
# MediaPipe graphs are not thread-safe; FastAPI runs sync routes in a thread pool.
_face_mesh_lock = threading.Lock()


class TtsBody(BaseModel):
    text: str = Field(..., min_length=1, max_length=8000)


class FocusResetBody(BaseModel):
    session_key: str = Field(..., min_length=8, max_length=64)


class FocusAnalyzeBody(BaseModel):
    session_key: str = Field(..., min_length=8, max_length=64)
    image_base64: str = Field(..., min_length=32)


def _to_api_focus(d: dict) -> dict:
    """Map tracker dict to JSON-friendly camelCase for the frontend."""
    fv = d.get("focus_val")
    out: dict = {
        "faceFound": bool(d.get("face_found", False)),
        "focusVal": None if fv is None else int(fv),
        "status": str(d.get("status", "UNKNOWN")),
        "alarm": bool(d.get("alarm", False)),
        "isCalibrated": bool(d.get("is_calibrated", False)),
    }
    optional = [
        ("pitch", "pitch"),
        ("yaw", "yaw"),
        ("roll", "roll"),
        ("delta_pitch", "deltaPitch"),
        ("delta_yaw", "deltaYaw"),
        ("baseline_pitch", "baselinePitch"),
        ("baseline_yaw", "baselineYaw"),
        ("baseline_ear", "baselineEar"),
        ("ear", "ear"),
        ("delta_ear", "deltaEar"),
        ("gaze_variance", "gazeVariance"),
        ("time_since_blink_sec", "timeSinceBlinkSec"),
        ("time_since_gaze_move_sec", "timeSinceGazeMoveSec"),
        ("pose_score", "poseScore"),
        ("eye_score", "eyeScore"),
        ("gaze_score", "gazeScore"),
        ("raw_focus", "rawFocus"),
        ("calibration_progress", "calibrationProgress"),
    ]
    for snake, camel in optional:
        if snake in d and d[snake] is not None:
            out[camel] = d[snake]
    if "stare_alarm" in d:
        out["stareAlarm"] = bool(d["stare_alarm"])
    return out


@app.get("/health")
def health() -> dict:
    ok, detail = mediapipe_import_ok()
    return {
        "ok": True,
        "service": "acadomi-tutor",
        "port": int(os.environ.get("TUTOR_PORT", "5002")),
        "mediapipe": {"ok": ok, "detail": detail},
    }


@app.post("/tts")
def tts(body: TtsBody) -> dict:
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is empty")
    try:
        buf = BytesIO()
        gTTS(text=text, lang="en", slow=False).write_to_fp(buf)
        raw = buf.getvalue()
        return {
            "mimeType": "audio/mpeg",
            "audioBase64": base64.b64encode(raw).decode("utf-8"),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/focus/reset")
def focus_reset(body: FocusResetBody) -> dict:
    key = body.session_key.strip()
    try:
        _trackers[key] = FocusTracker()
    except ImportError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    return {"ok": True}


@app.post("/focus/analyze")
def focus_analyze(body: FocusAnalyzeBody) -> dict:
    key = body.session_key.strip()
    if key not in _trackers:
        try:
            _trackers[key] = FocusTracker()
        except ImportError as e:
            raise HTTPException(status_code=500, detail=str(e)) from e
    tracker = _trackers[key]

    try:
        raw = base64.b64decode(body.image_base64, validate=False)
    except Exception as e:
        raise HTTPException(status_code=400, detail="invalid image_base64") from e

    arr = np.frombuffer(raw, dtype=np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if frame is None:
        return _to_api_focus(
            {
                "face_found": False,
                "focus_val": 0,
                "status": "BAD FRAME",
                "alarm": False,
                "is_calibrated": tracker.is_calibrated,
            }
        )

    try:
        with _face_mesh_lock:
            result = tracker.process_frame(frame)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"focus processing failed: {e}") from e
    return _to_api_focus(result)


if __name__ == "__main__":
    port = int(os.environ.get("TUTOR_PORT", "5002"))
    uvicorn.run(app, host="127.0.0.1", port=port)
