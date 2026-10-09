"""Readiness checks only; no model loading or downloads."""
import importlib
from pathlib import Path

import httpx
from fastapi import APIRouter

router = APIRouter()
OLLAMA_URL = "http://127.0.0.1:11434"
LANDMARKER_PATH = Path(__file__).resolve().parents[2] / "knowledge/models/face_landmarker.task"
VISION_MODELS = ("qwen3.5:4b", "qwen3.5:2b", "gemma3:4b")


@router.get("/api/health")
async def health():
    ollama = False
    vision_model = None
    try:
        # Ignore proxy environment variables: readiness stays on loopback.
        async with httpx.AsyncClient(timeout=2.0, trust_env=False, follow_redirects=False) as client:
            response = await client.get(OLLAMA_URL + "/api/tags")
            response.raise_for_status()
            payload = response.json()
            names = {model["name"] for model in payload["models"]}
            ollama = True
            vision_model = next((name for name in VISION_MODELS if name in names), None)
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        pass
    try:
        importlib.import_module("faster_whisper")
        whisper = True
    except (ImportError, OSError, RuntimeError):
        whisper = False
    return {"ollama": ollama, "vision_model": vision_model, "whisper": whisper,
            "face_landmarker": LANDMARKER_PATH.is_file()}
