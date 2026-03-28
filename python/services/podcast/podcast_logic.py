"""
Gemini → two-person script → gTTS + pydub → MP3 bytes.
"""
from __future__ import annotations

import base64
import json
import os
import re
import shutil
import subprocess
import tempfile
from typing import Any

import google.generativeai as genai
import pydub.utils as pydub_utils
from dotenv import load_dotenv
from gtts import gTTS
from pydub import AudioSegment
from pydub.utils import which

_SERVICE_DIR = os.path.dirname(os.path.abspath(__file__))
# Ensure podcast .env is applied when this module loads (before any request).
load_dotenv(os.path.join(_SERVICE_DIR, ".env"))

_ORIGINAL_GET_PROBER_NAME = pydub_utils.get_prober_name
_PYDUB_FFMPEG_READY = False
_WINGET_FFMPEG_SCAN_DONE = False
_WINGET_FFMPEG_DIR: str | None = None


def _ffmpeg_hint() -> str:
    return (
        "Install FFmpeg (ffmpeg + ffprobe). On Windows: add WinGet’s …\\bin to PATH, or set "
        "ACADOMI_FFMPEG in python/services/podcast/.env to that bin folder OR to ffmpeg.exe. "
        "Use forward slashes in .env (C:/Users/...) — backslashes can break python-dotenv (\\U…). "
        "winget install ffmpeg"
    )


def _ffmpeg_path_variants(raw: str) -> list[str]:
    """python-dotenv mangles Windows paths like C:\\Users (\\U…); try sane alternatives."""
    s = raw.strip().strip('"').strip("'")
    if not s:
        return []
    s = os.path.expandvars(s)
    candidates = [s, os.path.normpath(s)]
    if os.name == "nt":
        if "/" in s:
            candidates.append(os.path.normpath(s.replace("/", "\\")))
        if "\\" in s:
            candidates.append(os.path.normpath(s.replace("\\", "/")))
    out: list[str] = []
    seen: set[str] = set()
    for c in candidates:
        if c and c not in seen:
            seen.add(c)
            out.append(c)
    return out


def _discover_winget_ffmpeg_dir() -> str | None:
    """Find a directory that contains ffmpeg.exe and ffprobe.exe under WinGet packages."""
    global _WINGET_FFMPEG_SCAN_DONE, _WINGET_FFMPEG_DIR
    if _WINGET_FFMPEG_SCAN_DONE:
        return _WINGET_FFMPEG_DIR
    _WINGET_FFMPEG_SCAN_DONE = True
    if os.name != "nt":
        return None
    local = os.environ.get("LOCALAPPDATA") or os.path.expandvars(r"%LOCALAPPDATA%")
    packages = os.path.join(local, "Microsoft", "WinGet", "Packages")
    if not os.path.isdir(packages):
        return None
    try:
        for entry in os.scandir(packages):
            if not entry.is_dir():
                continue
            try:
                for root, _, files in os.walk(entry.path):
                    if "ffmpeg.exe" in files and "ffprobe.exe" in files:
                        _WINGET_FFMPEG_DIR = root
                        return root
            except OSError:
                continue
    except OSError:
        return None
    return None


def _parse_ffmpeg_env_with_variants(raw: str) -> tuple[str | None, str | None]:
    for cand in _ffmpeg_path_variants(raw):
        ff, fp = _parse_acadomi_ffmpeg_env(cand)
        if ff or fp:
            return ff, fp
    return None, None


def _exe_in_dir(directory: str, stem: str) -> str | None:
    d = os.path.abspath(directory.strip().strip('"'))
    name = f"{stem}.exe" if os.name == "nt" else stem
    p = os.path.join(d, name)
    return p if os.path.isfile(p) else None


def _parse_acadomi_ffmpeg_env(value: str) -> tuple[str | None, str | None]:
    """
    ACADOMI_FFMPEG may be:
    - path to ffmpeg.exe (ffprobe resolved beside it), or
    - path to a directory containing ffmpeg.exe and ffprobe.exe (common for WinGet).
    """
    v = value.strip().strip('"')
    if not v:
        return None, None
    if os.path.isdir(v):
        ff = _exe_in_dir(v, "ffmpeg")
        fp = _exe_in_dir(v, "ffprobe")
        return ff, fp
    if os.path.isfile(v):
        base = os.path.basename(v).lower()
        if "ffprobe" in base and "ffmpeg" not in base:
            return _same_dir_exe(v, "ffmpeg"), v
        return v, _same_dir_exe(v, "ffprobe")
    return None, None


def _parse_acadomi_ffprobe_env(value: str) -> str | None:
    v = value.strip().strip('"')
    if not v:
        return None
    if os.path.isdir(v):
        return _exe_in_dir(v, "ffprobe")
    if os.path.isfile(v):
        return v
    return None


def _parse_ffprobe_env_with_variants(raw: str) -> str | None:
    for cand in _ffmpeg_path_variants(raw):
        p = _parse_acadomi_ffprobe_env(cand)
        if p:
            return p
    return None


def _same_dir_exe(ffmpeg_path: str, name: str) -> str | None:
    d = os.path.dirname(os.path.abspath(ffmpeg_path))
    if os.name == "nt" and not name.endswith(".exe"):
        name = name + ".exe"
    p = os.path.join(d, name)
    return p if os.path.isfile(p) else None


def _can_spawn(cmd: object) -> bool:
    if cmd is None:
        return False
    exe = str(cmd)
    try:
        kwargs: dict[str, Any] = {
            "args": [exe, "-version"],
            "capture_output": True,
            "timeout": 10,
        }
        if os.name == "nt":
            kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW  # type: ignore[attr-defined]
        r = subprocess.run(**kwargs, check=False)
        return r.returncode == 0
    except (FileNotFoundError, OSError):
        return False


def ensure_pydub_ffmpeg() -> None:
    """
    pydub's mediainfo uses ffprobe by name; on Windows it often is not on PATH while ffmpeg is,
    or neither is found. We point converter at ffmpeg and patch get_prober_name to use ffprobe
    next to ffmpeg or explicit env paths.
    """
    global _PYDUB_FFMPEG_READY
    if _PYDUB_FFMPEG_READY:
        return

    load_dotenv(os.path.join(_SERVICE_DIR, ".env"), override=True)

    env_ff = (
        os.environ.get("ACADOMI_FFMPEG")
        or os.environ.get("FFMPEG_BINARY")
        or os.environ.get("FFMPEG_PATH")
        or ""
    ).strip().strip('"').strip("'")
    env_fp = (
        os.environ.get("ACADOMI_FFPROBE")
        or os.environ.get("FFPROBE_BINARY")
        or os.environ.get("FFPROBE_PATH")
        or ""
    ).strip().strip('"').strip("'")

    ff_path: str | None = None
    fp_path: str | None = None
    if env_ff:
        ff_path, fp_path = _parse_ffmpeg_env_with_variants(env_ff)
    if env_fp:
        fp_only = _parse_ffprobe_env_with_variants(env_fp)
        if fp_only:
            fp_path = fp_only
            if not ff_path:
                ff_path = _same_dir_exe(fp_only, "ffmpeg")

    if not ff_path and not fp_path:
        discovered = _discover_winget_ffmpeg_dir()
        if discovered:
            ff_path, fp_path = _parse_acadomi_ffmpeg_env(discovered)

    if not ff_path:
        w = which("ffmpeg") or shutil.which("ffmpeg")
        ff_path = w if w and os.path.isfile(w) else None
    if not fp_path:
        w = which("ffprobe") or shutil.which("ffprobe")
        fp_path = w if w and os.path.isfile(w) else None
    if ff_path and not fp_path:
        fp_path = _same_dir_exe(ff_path, "ffprobe")
    if fp_path and not ff_path:
        ff_path = _same_dir_exe(fp_path, "ffmpeg")

    if ff_path:
        AudioSegment.converter = ff_path
        AudioSegment.ffmpeg = ff_path

    probe_path = fp_path

    def get_prober_name_patched() -> str:
        if probe_path:
            return probe_path
        return _ORIGINAL_GET_PROBER_NAME()

    pydub_utils.get_prober_name = get_prober_name_patched  # type: ignore[assignment]

    prober = pydub_utils.get_prober_name()
    if not _can_spawn(prober):
        raise RuntimeError(
            f"Cannot run ffprobe ({prober!r}). {_ffmpeg_hint()}"
        )
    if not _can_spawn(AudioSegment.converter):
        raise RuntimeError(
            f"Cannot run ffmpeg ({AudioSegment.converter!r}). {_ffmpeg_hint()}"
        )

    _PYDUB_FFMPEG_READY = True


def _configure_gemini(
    override_key: str | None = None,
    override_model: str | None = None,
) -> str:
    key = (override_key or "").strip() or os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        raise RuntimeError(
            "GEMINI_API_KEY is not set. Either add it to backend/.env (the API forwards it) "
            "or set it in python/services/podcast/.env when running the podcast app alone."
        )
    genai.configure(api_key=key)
    model = (override_model or "").strip() or os.environ.get("GEMINI_MODEL", "").strip()
    return model or "gemini-2.5-flash"


def generate_script_from_gemini(
    source_text: str,
    *,
    gemini_api_key: str | None = None,
    gemini_model: str | None = None,
) -> list[dict[str, str]]:
    model_name = _configure_gemini(gemini_api_key, gemini_model)
    model = genai.GenerativeModel(model_name)

    text = source_text.strip()
    if len(text) > 120_000:
        text = text[:120_000] + "\n\n[truncated for model context]"

    prompt = f"""You are a podcast scriptwriter. Convert the following study material into a natural,
two-person conversational podcast between Alice (female) and Bob (male).

RULES:
- Do NOT invent facts beyond what the material reasonably supports
- Stay faithful to the meaning of the text
- Friendly, clear, suitable for students
- Alternate speakers (Alice, then Bob, then Alice, …)
- About 8–14 short turns total
- Only dialogue, no stage directions
- Output ONLY valid JSON (no markdown fences), exactly this shape:
  [{{"speaker":"Alice","text":"..."}},{{"speaker":"Bob","text":"..."}}, ...]
- speaker must be exactly "Alice" or "Bob"
- text must be plain English suitable for text-to-speech (no emojis, minimal punctuation)

MATERIAL:
---
{text}
---

JSON array only:"""

    response = model.generate_content(prompt)
    raw = (response.text or "").strip()

    # Strip accidental ```json fences
    raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.IGNORECASE)
    raw = re.sub(r"\s*```$", "", raw)

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\[[\s\S]*\]", raw)
        if not m:
            raise ValueError("Gemini did not return valid JSON dialogue") from None
        data = json.loads(m.group())

    if not isinstance(data, list):
        raise ValueError("Expected JSON array of dialogue turns")

    lines: list[dict[str, str]] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        sp = str(item.get("speaker", "")).strip()
        tx = str(item.get("text", "")).strip()
        if sp not in ("Alice", "Bob") or not tx:
            continue
        lines.append({"speaker": sp, "text": tx})

    if len(lines) < 2:
        raise ValueError("Not enough dialogue lines from Gemini; try again or shorten the source.")

    return lines


def create_podcast_mp3_bytes(script: list[dict[str, str]]) -> tuple[bytes, int]:
    """Returns (mp3_bytes, approximate_duration_ms)."""
    ensure_pydub_ffmpeg()
    segments: list[AudioSegment] = []
    tmpdir = tempfile.mkdtemp(prefix="acadomi_pod_")
    try:
        for i, turn in enumerate(script):
            tts = gTTS(
                text=turn["text"],
                lang="en",
                tld="co.uk" if turn["speaker"] == "Alice" else "co.in",
            )
            path = os.path.join(tmpdir, f"line_{i}.mp3")
            tts.save(path)
            seg = AudioSegment.from_mp3(path)
            segments.append(seg)
            segments.append(AudioSegment.silent(duration=400))
        if not segments:
            raise ValueError("No audio segments")
        # drop trailing silence
        if segments and len(segments) > 1:
            segments = segments[:-1]
        combined = segments[0]
        for s in segments[1:]:
            combined += s
        out = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
        out.close()
        try:
            combined.export(out.name, format="mp3", bitrate="64k")
            with open(out.name, "rb") as f:
                data = f.read()
        finally:
            if os.path.exists(out.name):
                os.remove(out.name)
        duration_ms = int(combined.duration_seconds * 1000)
        return data, duration_ms
    finally:
        for name in os.listdir(tmpdir):
            try:
                os.remove(os.path.join(tmpdir, name))
            except OSError:
                pass
        try:
            os.rmdir(tmpdir)
        except OSError:
            pass


def build_podcast_payload(
    source_text: str,
    *,
    gemini_api_key: str | None = None,
    gemini_model: str | None = None,
) -> dict[str, Any]:
    # Fail fast before Gemini (no wasted API calls if audio pipeline cannot run).
    ensure_pydub_ffmpeg()
    script = generate_script_from_gemini(
        source_text,
        gemini_api_key=gemini_api_key,
        gemini_model=gemini_model,
    )
    audio_bytes, duration_ms = create_podcast_mp3_bytes(script)
    return {
        "script": script,
        "mimeType": "audio/mpeg",
        "durationMs": duration_ms,
        "audioBase64": base64.b64encode(audio_bytes).decode("ascii"),
    }
