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
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict

from . import ai, consult, db, faceshape, media, stt
from .auth import require_scope
from .errors import APIError

router = APIRouter()
_wake = threading.Event()
_worker = None
_worker_lock = threading.Lock()
# shortcut: streaming text is process-local and disappears on restart; add durable
# stream storage if clients must resume partial replies after a laptop restart.
_transient: dict[str, dict] = {}  # job_id -> result fields never written to SQLite
_TRANSIENT_KEYS = {"faceshape": ("outline",), "transcribe": ("text",)}
# Conversation first: a customer waiting on Kuya Gup outranks background photo analysis.
_PRIORITY = "CASE type WHEN 'chat' THEN 0 WHEN 'transcribe' THEN 1 WHEN 'suggest' THEN 2 WHEN 'faceshape' THEN 3 ELSE 4 END"


class JobInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    type: Literal["transcribe", "observe", "faceshape", "propose", "chat", "recommend", "suggest", "checkpoint"]
    media_id: str | None = None
    part: Literal["sides", "top"] | None = None
    expected_revision: int


def _now():
    return datetime.now(timezone.utc).isoformat()


def job_dict(row) -> dict:
    elapsed = 0.0
    if row["started_at"]:
        end = datetime.fromisoformat(row["finished_at"]) if row["finished_at"] else datetime.now(timezone.utc)
        elapsed = max(0.0, (end - datetime.fromisoformat(row["started_at"])).total_seconds())
    result = json.loads(row["result_json"]) if row["result_json"] else None
    if result is not None:
        result.pop("_text_cursor", None)
    if result is not None and row["id"] in _transient:
        result = {**result, **{k: v for k, v in _transient[row["id"]].items() if k in _TRANSIENT_KEYS.get(row["type"], ())}}
    error = None
    if row["error_code"]:
        error = {"code": row["error_code"], "message": (result or {}).get("message") or "Hindi natapos ang AI job."}
    return {"id": row["id"], "type": row["type"], "status": row["status"], "requested_revision": row["requested_revision"],
            "started_at": row["started_at"], "finished_at": row["finished_at"], "elapsed_s": round(elapsed, 1),
            "result": None if error else result, "error": error,
            "partial_text": _transient.get(row["id"], {}).get("partial_text"),
            "progress": {"phase": 'queued' if row['status']=='queued' else
                'transcribing' if row['type']=='transcribe' and row['status']=='running' else
                'composing' if row['status']=='running' else row['status'],
                "queued_ahead": _queue_ahead(row) if row['status']=='queued' else None,
                "first_token_ms": _transient.get(row['id'],{}).get('first_token_ms')},
            "timing": _transient.get(row['id'],{}).get('timing')}


def _queue_ahead(row):
    with db.connect() as conn:
        return conn.execute("SELECT COUNT(*) FROM jobs WHERE status IN ('queued','running') AND rowid < (SELECT rowid FROM jobs WHERE id=?)",(row['id'],)).fetchone()[0]


def _ensure_worker():
    global _worker
    with _worker_lock:
        if _worker is None or not _worker.is_alive():
            _worker = threading.Thread(target=_loop, name="gupai-inference", daemon=True)
            _worker.start()
    _wake.set()


@router.post("/api/consultations/{consultation_id}/jobs")
def start(consultation_id: str, request: Request, body: JobInput):
    require_scope(consultation_id, request)
    with db.connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        require_scope(consultation_id, request)
        row = conn.execute("SELECT * FROM consultations WHERE id=?", (consultation_id,)).fetchone()
        if row["status"] != "active":
            raise APIError("not_found", "Active consultation not found.")
        if body.type != "transcribe" and body.expected_revision != row["revision"]:
            raise APIError("revision_conflict", "Consultation changed. Refresh and try again.", retryable=True, revision=row["revision"])
        if body.expected_revision < 0:
            raise APIError("invalid_input", "A nonnegative expected_revision is required.")
        if row["stage"] in ("cutting", "done") and body.type != "checkpoint":
            raise APIError("conflict_unresolved", "Nakapirmi na ang plano. Checkpoint lang habang ginugupitan.")
        if body.type in ("suggest", "checkpoint") and body.part is None:
            raise APIError("invalid_input", "Choose sides or top.")
        if body.type in ("transcribe", "observe", "faceshape", "checkpoint"):
            m = conn.execute("SELECT * FROM media WHERE id=? AND consultation_id=?", (body.media_id or "", consultation_id)).fetchone()
            want = "audio" if body.type == "transcribe" else "photo"
            if m is None or m["kind"] != want:
                raise APIError("not_found", "Media not found for this consultation.")
            if body.type == "faceshape" and m["view"] != "front":
                raise APIError("invalid_input", "Face shape needs the front photo.")
        if body.type == "checkpoint" and row["stage"] != "cutting":
            raise APIError("invalid_input", "Checkpoint is only available while cutting.")
        job_id = str(uuid4())
        conn.execute("INSERT INTO jobs (id, consultation_id, type, requested_revision, status, result_json, error_code, started_at, finished_at) "
                     "VALUES (?,?,?,?,?,?,?,?,?)",
                     (job_id, consultation_id, body.type, row["revision"], "queued",
                      json.dumps({"media_id": body.media_id, "part": body.part}), None, None, None))
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


@router.get("/api/jobs/{job_id}/stream")
def stream(job_id: str, request: Request):
    """Server-sent events: `delta` with new reply text, then `done` with the final job."""
    _scoped_job(job_id, request)

    def events():
        sent, deadline = 0, time.monotonic() + 300
        while True:
            with db.connect() as conn:
                row = conn.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
            text = _transient.get(job_id, {}).get("partial_text") or ""
            if len(text) > sent:
                yield "event: delta\ndata: " + json.dumps({"text": text[sent:]}) + "\n\n"
                sent = len(text)
            if row["status"] not in ("queued", "running") or time.monotonic() > deadline:
                yield "event: done\ndata: " + json.dumps(job_dict(row)) + "\n\n"
                return
            time.sleep(0.08)

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-store"})


@router.delete("/api/jobs/{job_id}")
def cancel(job_id: str, request: Request):
    _scoped_job(job_id, request)
    audio_id=None
    with db.connect() as conn:
        conn.execute('BEGIN IMMEDIATE')
        row=conn.execute('SELECT * FROM jobs WHERE id=?',(job_id,)).fetchone()
        if row['status']=='queued' and row['type']=='transcribe':
            audio_id=json.loads(row['result_json'] or '{}').get('media_id')
        # Running calls finish without merging; their finally block removes audio.
        conn.execute("UPDATE jobs SET status='cancelled', finished_at=? WHERE id=? AND status IN ('queued','running')", (_now(), job_id))
        out=job_dict(conn.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone())
    if audio_id:
        media.delete_media(audio_id)
    return out


# ---------- worker ----------

def _state(row):
    return {**json.loads(row["state_json"]), "revision": row["revision"]}


def _new_texts(conn, consultation_id):
    """Typed/voice text since the last finished chat/propose job."""
    last = conn.execute("SELECT started_at,finished_at,result_json FROM jobs WHERE consultation_id=? AND type IN ('chat','propose') AND status='done' "
                        "ORDER BY rowid DESC LIMIT 1", (consultation_id,)).fetchone()
    saved = json.loads(last["result_json"] or "{}") if last else {}
    if not last or "_text_cursor" in saved:
        # SQLite row order is reliable even when Windows gives two writes the same clock tick.
        rows = conn.execute("SELECT text FROM contributions WHERE consultation_id=? AND input_type IN ('typed','voice') "
                            "AND rowid > ? ORDER BY rowid", (consultation_id, saved.get("_text_cursor", 0))).fetchall()
    else:
        # Compatibility with completed jobs written before the cursor was introduced.
        since = last["started_at"] or last["finished_at"]
        rows = conn.execute("SELECT text FROM contributions WHERE consultation_id=? AND input_type IN ('typed','voice') "
                            "AND created_at > ? ORDER BY rowid", (consultation_id, since)).fetchall()
    return [r["text"] for r in rows][-4:]


def _run(job, conn_snapshot):
    """Model work, outside any DB transaction."""
    t = job["type"]
    if t == "chat":
        def on_token(piece):
            _transient.setdefault(job["id"], {"partial_text": ""})["partial_text"] += piece
        return ai.chat_reply(conn_snapshot["state"], conn_snapshot["texts"], on_token)
    if t == "recommend":
        return ai.recommend(conn_snapshot["state"])
    if t == "suggest":
        return ai.suggest(conn_snapshot["state"], conn_snapshot["part"])
    if t == "propose":
        return ai.propose(conn_snapshot["state"], conn_snapshot["texts"])
    path = media.MEDIA_DIR / conn_snapshot["media"]["storage_key"]
    if t == "checkpoint":
        return ai.checkpoint(conn_snapshot["state"], path, conn_snapshot["part"])
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
        if row["status"] != "active":
            conn.execute("UPDATE jobs SET status='cancelled', finished_at=? WHERE id=?", (_now(), job_id))
            return
        inputs = json.loads(job["result_json"] or "{}")
        media_id = inputs.get("media_id")
        m = conn.execute("SELECT * FROM media WHERE id=? AND consultation_id=?", (media_id, row["id"])).fetchone() if media_id else None
        snapshot = {"state": _state(row), "texts": _new_texts(conn, row["id"]) if job["type"] in ("propose", "chat") else [],
                    "media": dict(m) if m else None, "part": inputs.get("part")}
        if job["type"] == "chat":
            source_rows=conn.execute("SELECT id,speaker,text FROM contributions WHERE consultation_id=? AND input_type IN ('typed','voice') ORDER BY rowid DESC LIMIT 4",(row['id'],)).fetchall()
            snapshot['state']['stage']=row['stage']
            snapshot['state']['_source_turns']=[dict(t) for t in reversed(source_rows) if t['text'] in snapshot['texts']]
            _transient[job_id] = {"partial_text": ""}
        snapshot["text_cursor"] = conn.execute("SELECT COALESCE(MAX(rowid),0) FROM contributions WHERE consultation_id=?", (row["id"],)).fetchone()[0]
        conn.execute("UPDATE jobs SET status='running', started_at=? WHERE id=?", (_now(), job_id))
    started = time.perf_counter()
    ai._metrics.last={}; ai._metrics.first_token_ms=None
    error, result = None, None
    try:
        if job["type"] in ("transcribe", "observe", "faceshape", "checkpoint") and snapshot["media"] is None:
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
    _transient.setdefault(job_id,{}).update(timing=getattr(ai._metrics,'last',{}),first_token_ms=getattr(ai._metrics,'first_token_ms',None))
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
        if job["type"] in ("chat", "propose"):
            stored["_text_cursor"] = snapshot["text_cursor"]
        hidden = {k: v for k, v in result.items() if k in _TRANSIENT_KEYS.get(job["type"], ())}
        if job["type"] != "transcribe":
            if (row["status"] != "active"
                    or (row["stage"] in ("cutting", "done") and job["type"] != "checkpoint")
                    or (job["type"] not in ("chat", "checkpoint") and row["revision"] != job["requested_revision"])):
                conn.execute("UPDATE jobs SET status='stale', finished_at=? WHERE id=?", (_now(), job_id))
                return
            merged = consult.merge_job_result(_state(row), job["type"], result, snapshot["part"], media_id)
            if job["type"] == "propose" and result.get("goal"):
                merged["goal"] = result["goal"]
            revision = merged.pop("revision")
            conn.execute("UPDATE consultations SET revision=?, state_json=? WHERE id=?", (revision, json.dumps(merged), row["id"]))
        _transient.setdefault(job_id, {}).update(hidden)
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


def _next_job(conn):
    row = conn.execute(f"SELECT id FROM jobs WHERE status='queued' ORDER BY {_PRIORITY}, rowid LIMIT 1").fetchone()
    return row["id"] if row else None


def _loop():
    warmup()
    while True:
        with db.connect() as conn:
            nxt = _next_job(conn)
        if nxt is None:
            _wake.wait(timeout=5)
            _wake.clear()
            continue
        try:
            _process(nxt)
        except Exception as exc:  # DB hiccup: mark failed so the queue moves on
            print(f"[gupai] worker error: {exc!r}", flush=True)
            with db.connect() as conn:
                conn.execute("UPDATE jobs SET status='failed', error_code='model_unavailable', finished_at=? "
                             "WHERE id=? AND status IN ('queued','running')", (_now(), nxt))
