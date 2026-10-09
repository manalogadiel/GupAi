"""Local speech-to-text with faster-whisper (CPU, int8). Loaded once, on first use."""
import threading
from pathlib import Path

from .errors import APIError

_model = None
_lock = threading.Lock()


def available() -> bool:
    """Check cached weights without downloading or loading the speech model."""
    try:
        from huggingface_hub import snapshot_download
        path = Path(snapshot_download("Systran/faster-whisper-small", local_files_only=True, allow_patterns=["model.bin", "config.json", "tokenizer.json", "vocabulary.txt"]))
        return all((path / name).is_file() for name in ("model.bin", "config.json", "tokenizer.json", "vocabulary.txt"))
    except Exception:
        return False


def _load():
    global _model
    with _lock:
        if _model is None:
            try:
                from faster_whisper import WhisperModel
                _model = WhisperModel("small", device="cpu", compute_type="int8", local_files_only=True)
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
