"""Local speech-to-text with faster-whisper (CPU, int8). Loaded once, on first use."""
import threading
from pathlib import Path

from .errors import APIError

_model = None
_lock = threading.Lock()


def _load():
    global _model
    with _lock:
        if _model is None:
            try:
                from faster_whisper import WhisperModel
                _model = WhisperModel("small", device="cpu", compute_type="int8")
            except Exception as exc:  # missing package or model files
                raise APIError("model_unavailable", "Hindi pa handa ang speech model sa laptop.", retryable=True) from exc
    return _model


def transcribe(path: Path) -> dict:
    model = _load()
    try:
        # shortcut: fixed Tagalog decoding handles Taglish better than auto-detect in our samples; re-test per release.
        segments, info = model.transcribe(str(path), language="tl", beam_size=1, vad_filter=True)
        text = " ".join(s.text.strip() for s in segments).strip()
    except Exception as exc:  # corrupt or video-only container
        raise APIError("invalid_input", "Hindi mabasa ang recording. Subukan ulit o mag-type.") from exc
    return {"text": text[:500], "language": info.language}
