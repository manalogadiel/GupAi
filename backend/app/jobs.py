"""Single local inference worker (FIFO), persisted jobs, and job endpoints (API.md 12-14).

One model job runs at a time on the shop laptop. Results that must not be persisted
(face outline, transcript text) live only in memory and are returned by GET /api/jobs/{id}.
"""
import json
import threading
import time
from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict

from . import ai, consult, db, faceshape, media, stt
from .auth import require_scope
from .errors import APIError

router = APIRouter()
_wake = threading.Event()
_worker = None
_transient: dict[str, dict] = {}  # job_id -> result fields never written to SQLite
_TRANSIENT_KEYS = {"faceshape": ("outline",), "transcribe": ("text",)}


class JobInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["transcribe", "observe", "faceshape", "propose"]
    media_id: str | None = None
    expected_revision: int


def _now():
    return datetime.now(timezone.utc).isoformat()


def job_dict(row) -> dict:
    elapsed = 0.0
    if row["started_at"]:
        end = datetime.fromisoformat(row["finished_at"]) if row["finished_at"] else datetime.now(timezone.utc)
        elapsed = max(0.0, (end - datetime.fromisoformat(row["started_at"])).total_seconds())
    result = json.loads(row["result_json"]) if row["result_json"] else None
    if result is not None and row["id"] in _transient:
        result = {**result, **_transient[row["id"]]}
    error = None
    if row["error_code"]:
        error = {"code": row["error_code"], "message": (result or {}).get("message") or "Hindi natapos ang AI job."}
    return {"id": row["id"], "type": row["type"], "status": row["status"], "requested_revision": row["requested_revision"],
            "started_at": row["started_at"], "finished_at": row["finished_at"], "elapsed_s": round(elapsed, 1),
            "result": None if error else result, "error": error}


def _ensure_worker():
    global _worker
    if _worker is None or not _worker.is_alive():
        _worker = threading.Thread(target=_loop, name="gupai-inference", daemon=True)
        _worker.start()
    _wake.set()


@router.post("/api/consultations/{consultation_id}/jobs")
def start(consultation_id: str, request: Request, body: JobInput):
    require_scope(consultation_id, request)
    with db.connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT * FROM consultations WHERE id=?", (consultation_id,)).fetchone()
        if row["status"] != "active":
            raise APIError("not_found", "Active consultation not found.")
        if body.type != "transcribe" and body.expected_revision != row["revision"]:
            raise APIError("revision_conflict", "Consultation changed. Refresh and try again.", retryable=True, revision=row["revision"])
        if body.type != "propose":
            m = conn.execute("SELECT * FROM media WHERE id=? AND consultation_id=?", (body.media_id or "", consultation_id)).fetchone()
            want = "audio" if body.type == "transcribe" else "photo"
            if m is None or m["kind"] != want:
                raise APIError("not_found", "Media not found for this consultation.")
            if body.type == "faceshape" and m["view"] != "front":
                raise APIError("invalid_input", "Face shape needs the front photo.")
        job_id = str(uuid4())
        conn.execute("INSERT INTO jobs (id, consultation_id, type, requested_revision, status, result_json, error_code, started_at, finished_at) "
                     "VALUES (?,?,?,?,?,?,?,?,?)",
                     (job_id, consultation_id, body.type, row["revision"], "queued",
                      json.dumps({"media_id": body.media_id}) if body.media_id else None, None, None, None))
        out = job_dict(conn.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone())
    _ensure_worker()
    return {**out, "result": None}


def _scoped_job(job_id, request):
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
    if row is None:
        raise APIError("not_found", "Job not found.")
    require_scope(row["consultation_id"], request)
    return row


@router.get("/api/jobs/{job_id}")
def get(job_id: str, request: Request):
    row = _scoped_job(job_id, request)
    out = job_dict(row)
    if row["status"] in ("queued", "running"):
        out["result"] = None  # result_json holds the media_id input until the job finishes
    return out


@router.delete("/api/jobs/{job_id}")
def cancel(job_id: str, request: Request):
    _scoped_job(job_id, request)
    with db.connect() as conn:
        # shortcut: a running model call cannot be interrupted; its result is discarded on completion.
        conn.execute("UPDATE jobs SET status='cancelled', finished_at=? WHERE id=? AND status IN ('queued','running')", (_now(), job_id))
        return job_dict(conn.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone())


# ---------- worker ----------

def _state(row):
    return {**json.loads(row["state_json"]), "revision": row["revision"]}


def _new_texts(conn, consultation_id):
    """Typed/voice text since the last finished propose job (older text was already applied)."""
    last = conn.execute("SELECT finished_at FROM jobs WHERE consultation_id=? AND type='propose' AND status='done' "
                        "ORDER BY finished_at DESC LIMIT 1", (consultation_id,)).fetchone()
    since = last["finished_at"] if last else ""
    rows = conn.execute("SELECT text FROM contributions WHERE consultation_id=? AND input_type IN ('typed','voice') "
                        "AND created_at > ? ORDER BY created_at", (consultation_id, since)).fetchall()
    return [r["text"] for r in rows][-4:]


def _run(job, conn_snapshot):
    """Model work, outside any DB transaction."""
    t = job["type"]
    if t == "propose":
        return ai.propose(conn_snapshot["state"], conn_snapshot["texts"])
    path = media.MEDIA_DIR / conn_snapshot["media"]["storage_key"]
    if t == "observe":
        return ai.observe(path, conn_snapshot["media"]["view"] or "front")
    if t == "faceshape":
        return faceshape.estimate_face_shape(path)
    return stt.transcribe(path)


def _process(job_id):
    with db.connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        job = conn.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
        if job is None or job["status"] != "queued":
            return
        row = conn.execute("SELECT * FROM consultations WHERE id=?", (job["consultation_id"],)).fetchone()
        media_id = json.loads(job["result_json"] or "{}").get("media_id")
        m = conn.execute("SELECT * FROM media WHERE id=?", (media_id,)).fetchone() if media_id else None
        snapshot = {"state": _state(row), "texts": _new_texts(conn, row["id"]) if job["type"] == "propose" else [],
                    "media": dict(m) if m else None}
        conn.execute("UPDATE jobs SET status='running', started_at=? WHERE id=?", (_now(), job_id))
    started = time.perf_counter()
    error, result = None, None
    try:
        if job["type"] != "propose" and snapshot["media"] is None:
            raise APIError("not_found", "Media no longer exists.")
        result = _run(job, snapshot)
    except APIError as exc:
        error = exc
    except Exception:  # never let one bad job kill the worker
        error = APIError("model_unavailable", "Nagka-problema ang local AI job. Subukan ulit.", retryable=True)
    finally:
        if job["type"] == "transcribe" and media_id:
            try:
                media.delete_media(media_id)  # raw audio is never retained
            except OSError:
                pass
    print(f"[gupai] job {job['type']} {time.perf_counter() - started:.1f}s {'error ' + error.code if error else 'ok'}", flush=True)

    with db.connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        current = conn.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
        if current["status"] == "cancelled":
            return
        if error:
            conn.execute("UPDATE jobs SET status='failed', error_code=?, result_json=?, finished_at=? WHERE id=?",
                         (error.code, json.dumps({"message": error.message}), _now(), job_id))
            return
        row = conn.execute("SELECT * FROM consultations WHERE id=?", (job["consultation_id"],)).fetchone()
        stored = {k: v for k, v in result.items() if k not in _TRANSIENT_KEYS.get(job["type"], ())}
        hidden = {k: v for k, v in result.items() if k in _TRANSIENT_KEYS.get(job["type"], ())}
        if job["type"] != "transcribe":
            if row["status"] != "active" or row["revision"] != job["requested_revision"]:
                conn.execute("UPDATE jobs SET status='stale', finished_at=? WHERE id=?", (_now(), job_id))
                return
            merged = consult.merge_job_result(_state(row), job["type"], result)
            if job["type"] == "propose" and result.get("goal"):
                merged["goal"] = result["goal"]
            revision = merged.pop("revision")
            conn.execute("UPDATE consultations SET revision=?, state_json=? WHERE id=?", (revision, json.dumps(merged), row["id"]))
        _transient[job_id] = hidden
        conn.execute("UPDATE jobs SET status='done', result_json=?, finished_at=? WHERE id=?", (json.dumps(stored), _now(), job_id))


def warmup():
    """Load every local model before the first customer: Ollama weights, face landmarker, whisper."""
    for name, fn in (("ollama", lambda: ai.chat("Reply ok.", "ok", {"type": "object", "properties": {"ok": {"type": "boolean"}}})),
                     ("faceshape", faceshape.warm), ("whisper", stt._load)):
        started = time.perf_counter()
        try:
            fn()
            print(f"[gupai] warm {name} {time.perf_counter() - started:.1f}s", flush=True)
        except Exception as exc:  # readiness is still reported honestly by /api/health
            print(f"[gupai] warm {name} failed: {exc!r}", flush=True)


def _loop():
    warmup()
    while True:
        with db.connect() as conn:
            nxt = conn.execute("SELECT id FROM jobs WHERE status='queued' ORDER BY rowid LIMIT 1").fetchone()
        if nxt is None:
            _wake.wait(timeout=5)
            _wake.clear()
            continue
        try:
            _process(nxt["id"])
        except Exception as exc:  # DB hiccup: mark failed so the queue moves on
            print(f"[gupai] worker error: {exc!r}", flush=True)
            with db.connect() as conn:
                conn.execute("UPDATE jobs SET status='failed', error_code='model_unavailable', finished_at=? "
                             "WHERE id=? AND status IN ('queued','running')", (_now(), nxt["id"]))
