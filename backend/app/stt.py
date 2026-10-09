"""Local speech-to-text with faster-whisper (CPU, int8). Loaded once, on first use."""
import os
import threading
from pathlib import Path

from .errors import APIError

_model = None
_lock = threading.Lock()
# large-v3-turbo: much lower Tagalog/Taglish error rate, near small's speed on CPU int8. small is the light fallback.
MODEL = os.environ.get("GUPAI_WHISPER", "large-v3-turbo")
FALLBACK = "small"


def _cached(name) -> bool:
    """Check cached weights without downloading or loading the speech model."""
    try:
        from faster_whisper.utils import _MODELS
        from huggingface_hub import snapshot_download
        files = ["model.bin", "config.json", "tokenizer.json"]
        path = Path(snapshot_download(_MODELS.get(name, name), local_files_only=True, allow_patterns=files + ["vocabulary.*"]))
        return all((path / f).is_file() for f in files)
    except Exception:
        return False


def available() -> bool:
    return _cached(MODEL) or _cached(FALLBACK)


def _load():
    global _model
    with _lock:
        if _model is None:
            try:
                from faster_whisper import WhisperModel
                # shortcut: falls back to small when turbo was never downloaded; run the README setup line to upgrade.
                name = MODEL if _cached(MODEL) else FALLBACK
                _model = WhisperModel(name, device="cpu", compute_type="int8", local_files_only=True)
            except Exception as exc:  # missing package or model files
                raise APIError("model_unavailable", "Hindi pa handa ang speech model sa laptop.", retryable=True) from exc
    return _model


# Primes Whisper with the words customers actually say in a barbershop (Taglish + cut names).
VOCAB = ("Kuya Gup, gupit, gilid, ibabaw, likod, patilya, bangs, umaalsa, pumupuff, puyo, makapal, manipis, "
         "low fade, mid fade, high fade, skin fade, taper, undercut, two block, textured crop, side part, "
         "wax, pomade, school, trabaho, kasal, minuto, bahala ka na.")


def _decode_audio(path: Path):
    """Use public PyAV APIs; v19 removed faster-whisper's metadata_errors argument."""
    import av
    import numpy as np

    resampler = av.AudioResampler(format="fltp", layout="mono", rate=16000)
    chunks = []
    with av.open(str(path), mode="r") as container:
        for frame in container.decode(audio=0):
            frame.pts = None
            chunks.extend(converted.to_ndarray().reshape(-1) for converted in resampler.resample(frame))
        chunks.extend(converted.to_ndarray().reshape(-1) for converted in resampler.resample(None))
    if not chunks:
        raise ValueError("Recording contains no audio samples.")
    return np.concatenate(chunks).astype(np.float32, copy=False)


def transcribe(path: Path) -> dict:
    model = _load()
    try:
        # shortcut: fixed Tagalog decoding handles Taglish better than auto-detect in our samples; re-test per release.
        segments, info = model.transcribe(_decode_audio(path), language="tl", beam_size=3, vad_filter=True,
                                          initial_prompt=VOCAB)
        text = " ".join(s.text.strip() for s in segments).strip()
    except Exception as exc:  # corrupt or video-only container
        raise APIError("invalid_input", "Hindi mabasa ang recording. Subukan ulit o mag-type.") from exc
    if not text:
        raise APIError("invalid_input", "Walang malinaw na boses. Ulitin ang recording o mag-type.")
    return {"text": text[:500], "language": info.language}
