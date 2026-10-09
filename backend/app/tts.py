"""Offline Filipino speech from OmniVoice; weights are installed during setup only."""
import io
import json
import re
import threading
import wave
from collections import OrderedDict
from pathlib import Path

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from .auth import require_scope
from .errors import APIError

router = APIRouter()
MODEL_PATH = Path(__file__).resolve().parents[2] / "data/models/omnivoice"
REFERENCE_PATH = Path(__file__).resolve().parents[2] / "knowledge/voices/kuya-gup.wav"
REFERENCE_TEXT = "Gaano kaikli ang gusto mo sa gilid? Panatilihin ba natin ang haba sa ibabaw?"
_model = None
_voice_prompt = None
_cache = OrderedDict()
_lock = threading.Lock()
_SMALL = "sero isa dalawa tatlo apat lima anim pito walo siyam sampu labing-isa labindalawa labintatlo labing-apat labinlima labing-anim labimpito labing-walo labinsiyam".split()
_TENS = {20: "dalawampu", 30: "tatlumpu", 40: "apatnapu", 50: "limampu", 60: "animnapu", 70: "pitumpu", 80: "walumpu", 90: "siyamnapu"}


def _number(value):
    n = int(value)
    if n < 20:
        return _SMALL[n]
    if n < 100:
        return _TENS[n // 10 * 10] + ("'t " + _SMALL[n % 10] if n % 10 else "")
    return " ".join(_SMALL[int(d)] for d in value)


def speech_text(text):
    # Only spoken rendering changes: the original reply remains on screen and in SQLite.
    text = re.sub(r"\bGupAi\b", "Gup ay", text, flags=re.I)
    text = re.sub(r"[*_`#]", "", text)
    text = re.sub(r"\b(\d+)\.(\d+)\b", lambda m: _number(m[1]) + " punto " + " ".join(_SMALL[int(d)] for d in m[2]), text)
    text = re.sub(r"\b\d+\b", lambda m: _number(m[0]), text)
    return " ".join(text.split())


def _load():
    global _model, _voice_prompt
    if _model is None:
        try:
            required = ("model.safetensors", "config.json", "tokenizer.json", "tokenizer_config.json",
                        "audio_tokenizer/model.safetensors", "audio_tokenizer/config.json",
                        "audio_tokenizer/preprocessor_config.json")
            if not all((MODEL_PATH / name).is_file() for name in required):
                raise FileNotFoundError(MODEL_PATH)
            import torch
            from omnivoice import OmniVoice
            # Leave CPU capacity for Whisper; OmniVoice's audio decoder runs on CPU.
            torch.set_num_threads(2)
            device = "mps" if torch.backends.mps.is_available() else "cpu"
            model = OmniVoice.from_pretrained(
                str(MODEL_PATH), device_map=device,
                dtype=torch.float16 if device == "mps" else torch.float32,
                local_files_only=True, load_asr=False,
            ).eval()
            import soundfile as sf
            samples, rate = sf.read(REFERENCE_PATH, dtype="float32")
            prompt = model.create_voice_clone_prompt(
                ref_audio=(torch.from_numpy(samples), rate), ref_text=REFERENCE_TEXT,
                preprocess_prompt=False,
            )
            _model, _voice_prompt = model, prompt
        except Exception as exc:
            raise APIError("model_unavailable", "Hindi pa handa ang lokal na boses.", retryable=True) from exc
    return _model


def synthesize(text):
    text = speech_text(text)
    # shortcut: short consultation turns only; use streaming audio for long narration.
    if not text or len(text) > 600:
        raise APIError("invalid_input", "Masyadong mahaba o walang laman ang sasabihin.")
    if not _lock.acquire(timeout=45):
        raise APIError("in_use", "Nagsasalita pa ang lokal na boses.", retryable=True)
    try:
        if text in _cache:
            _cache.move_to_end(text)
            return _cache[text]
        model = _load()
        import numpy as np
        import torch
        with torch.inference_mode(), torch.random.fork_rng(devices=[]):
            torch.manual_seed(42)
            audio = model.generate(text=text, language="fil", voice_clone_prompt=_voice_prompt, num_step=8)[0]
        frames = (np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes()
        output = io.BytesIO()
        with wave.open(output, "wb") as wav:
            wav.setparams((1, 2, model.sampling_rate, 0, "NONE", "not compressed"))
            wav.writeframes(frames)
        result = output.getvalue()
        _cache[text] = result
        if len(_cache) > 16:
            _cache.popitem(last=False)
        return result
    finally:
        _lock.release()


class SpeechRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    turn_index: int = Field(ge=0, strict=True)


@router.post("/api/consultations/{consultation_id}/speech")
def speech(consultation_id: str, body: SpeechRequest, request: Request):
    row = require_scope(consultation_id, request)
    turns = json.loads(row["state_json"]).get("chat", [])
    if body.turn_index >= len(turns) or turns[body.turn_index].get("role") != "ai":
        raise APIError("invalid_input", "Pumili ng sagot ni Kuya Gup.")
    audio = synthesize(turns[body.turn_index]["text"])
    return Response(audio, media_type="audio/wav", headers={"Cache-Control": "no-store"})
