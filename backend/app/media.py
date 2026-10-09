"""Validated local uploads and consultation-scoped canonical images."""
import io
import secrets
import warnings
from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, File, Form, Request, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, ImageOps, UnidentifiedImageError

from . import db
from .auth import require_scope
from .errors import APIError

router = APIRouter()
MEDIA_DIR = db.ROOT / "data" / "media"


def _photo_jpeg(content):
    signature_ok = (
        content.startswith(b"\xff\xd8\xff")
        or content.startswith(b"\x89PNG\r\n\x1a\n")
        or (content[:4] == b"RIFF" and content[8:12] == b"WEBP")
    )
    if not signature_ok:
        raise APIError("unsupported_media", "Upload a JPEG, PNG, or WebP photo.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(content)) as source:
                if source.format not in {"JPEG", "PNG", "WEBP"}:
                    raise APIError("unsupported_media", "Unsupported photo format.")
                image = ImageOps.exif_transpose(source)
                image.thumbnail((1024, 1024))
                output = io.BytesIO()
                image.convert("RGB").save(output, "JPEG", quality=85)
                return output.getvalue()
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError,
            Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise APIError("unsupported_media", "Photo could not be decoded safely.") from None


def _audio_extension(content):
    # shortcut: container signatures only; C6 must report decoder errors for
    # corrupt or video-only containers. Add track inspection if uploads expand.
    if len(content) >= 8 and content.startswith(b"\x1a\x45\xdf\xa3"):
        return "webm"
    if len(content) >= 27 and content[:5] == b"OggS\x00":
        return "ogg"
    if len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WAVE":
        return "wav"
    # Any ftyp brand: Safari's MediaRecorder brand varies by release; PyAV decoding validates the track.
    if (len(content) >= 16 and content[4:8] == b"ftyp"
            and 16 <= int.from_bytes(content[:4], "big") <= len(content)):
        return "mp4"
    print("[gupai] rejected audio head", content[:16].hex(" "), flush=True)
    raise APIError("unsupported_media", "Upload WebM, OGG, WAV, or MP4 audio.")


def _media_path(storage_key):
    root = MEDIA_DIR.resolve()
    path = (root / storage_key).resolve()
    if path.parent != root:
        raise APIError("not_found", "Media not found.")
    return path


@router.post("/api/consultations/{consultation_id}/media")
def upload_media(
    consultation_id: str,
    request: Request,
    file: UploadFile = File(...),
    kind: Literal["photo", "audio"] = Form(...),
    view: Literal["front", "side"] | None = Form(None),
):
    require_scope(consultation_id, request)
    if (kind == "photo" and view is None) or (kind == "audio" and view is not None):
        raise APIError("invalid_input", "Photos require a front or side view; audio has no view.")
    limit = (8 if kind == "photo" else 2) * 1024 * 1024
    content = file.file.read(limit + 1)
    if len(content) > limit:
        raise APIError("too_large", "Photo limit is 8 MB; audio limit is 2 MB.")
    if kind == "photo":
        content = _photo_jpeg(content)
        extension = "jpg"
    else:
        extension = _audio_extension(content)
    media_id = str(uuid4())
    storage_key = secrets.token_hex(16) + "." + extension
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    path = _media_path(storage_key)
    # Exclusive creation prevents overwriting an existing file on a name collision.
    with path.open("xb") as target:
        try:
            target.write(content)
        except BaseException:
            target.close()
            path.unlink(missing_ok=True)
            raise
    try:
        with db.connect() as conn:
            conn.execute(
                "INSERT INTO media (id,consultation_id,kind,view,storage_key,keep,created_at) "
                "VALUES (?,?,?,?,?,?,?)",
                (media_id, consultation_id, kind, view, storage_key, 0,
                 datetime.now(timezone.utc).isoformat()),
            )
    except BaseException:
        path.unlink(missing_ok=True)
        raise
    return {"id": media_id, "kind": kind, "view": view, "url": "/api/media/" + media_id}


@router.get("/api/media/{media_id}")
def get_media(media_id: str, request: Request):
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM media WHERE id=?", (media_id,)).fetchone()
    if row is None:
        raise APIError("not_found", "Media not found.")
    require_scope(row["consultation_id"], request)
    path = _media_path(row["storage_key"])
    if row["kind"] != "photo" or not path.is_file():
        raise APIError("not_found", "Media not found.")
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "no-store"})


def delete_media(media_id):
    """Internal job/completion cleanup; caller must already authorize the resource."""
    with db.connect() as conn:
        row = conn.execute("SELECT storage_key FROM media WHERE id=?", (media_id,)).fetchone()
        if row is None:
            return
        _media_path(row["storage_key"]).unlink(missing_ok=True)
        conn.execute("DELETE FROM media WHERE id=?", (media_id,))
