"""
HTTP API for the Acadomi podcast generator.
Called by the Express backend only (keep behind firewall in production).
"""
from __future__ import annotations

import os
import traceback

from dotenv import load_dotenv
from flask import Flask, jsonify, request

from podcast_logic import build_podcast_payload, ensure_pydub_ffmpeg

# Load .env from this service directory (works no matter the shell cwd)
_here = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_here, ".env"))
load_dotenv()


app = Flask(__name__)


@app.get("/health")
def health():
    ffmpeg_ok = True
    ffmpeg_error: str | None = None
    try:
        ensure_pydub_ffmpeg()
    except Exception as e:
        ffmpeg_ok = False
        ffmpeg_error = str(e)
    return jsonify(
        {
            "ok": True,
            "service": "acadomi-podcast",
            "ffmpeg": {"ok": ffmpeg_ok, "error": ffmpeg_error},
        }
    )


@app.post("/generate-podcast")
def generate_podcast():
    try:
        data = request.get_json(force=True, silent=False)
    except Exception:
        return jsonify({"error": "Invalid JSON"}), 400

    if not data or "text" not in data:
        return jsonify({"error": "Field 'text' is required"}), 400

    text = data.get("text")
    if not isinstance(text, str) or not text.strip():
        return jsonify({"error": "text must be a non-empty string"}), 400

    sk = data.get("geminiApiKey")
    sm = data.get("geminiModel")
    if sk is not None and not isinstance(sk, str):
        return jsonify({"error": "geminiApiKey must be a string if provided"}), 400
    if sm is not None and not isinstance(sm, str):
        return jsonify({"error": "geminiModel must be a string if provided"}), 400

    try:
        payload = build_podcast_payload(
            text,
            gemini_api_key=sk.strip() if isinstance(sk, str) else None,
            gemini_model=sm.strip() if isinstance(sm, str) else None,
        )
        return jsonify(payload)
    except Exception as e:
        print("[podcast] error:", e)
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("FLASK_PORT", "5001"))
    app.run(host="127.0.0.1", port=port, debug=False)
