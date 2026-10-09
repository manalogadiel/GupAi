"""Consultation creation, polling, contributions, agreements, and completion."""
import json
from datetime import datetime, timezone
from uuid import UUID, uuid4
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict
from . import consult, db, media
from .auth import require_barber, require_scope
from .customers import agreement_dict
from .errors import APIError

router = APIRouter(prefix="/api/consultations")


class ConsultationInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    customer_id: UUID | None = None
    from_visit_id: UUID | None = None


def empty_state():
    return {"goal": "", "keep": [], "change": [], "avoid": [], "styling_effort": None,
            "observations": [], "face_shape": None, "options": [], "selected_option_id": None,
            "conflicts": [], "reply": None, "next_question": None, "uncertainties": []}


def consultation_dict(conn, row):
    cid = row["id"]
    customer = conn.execute("SELECT id, display_name, nickname FROM customers WHERE id=?", (row["customer_id"],)).fetchone()
    photos = [{"id": photo["id"], "view": photo["view"], "url": "/api/media/" + photo["id"]}
              for photo in conn.execute("SELECT id, view FROM media WHERE consultation_id=? AND kind='photo' ORDER BY created_at, id", (cid,))]
    agreement = conn.execute("SELECT * FROM agreements WHERE consultation_id=? ORDER BY version DESC LIMIT 1", (cid,)).fetchone()
    job = conn.execute("SELECT * FROM jobs WHERE consultation_id=? AND status IN ('queued','running') ORDER BY rowid DESC LIMIT 1", (cid,)).fetchone()
    active_job = None
    if job:
        elapsed = 0.0
        if job["started_at"]:
            elapsed = max(0.0, (datetime.now(timezone.utc) - datetime.fromisoformat(job["started_at"])).total_seconds())
        active_job = {"id": job["id"], "type": job["type"], "status": job["status"], "requested_revision": job["requested_revision"],
                      "started_at": job["started_at"], "finished_at": job["finished_at"], "elapsed_s": elapsed,
                      "result": json.loads(job["result_json"]) if job["result_json"] else None,
                      "error": {"code": job["error_code"], "message": "Job failed."} if job["error_code"] else None}
    return {"id": cid, "customer": dict(customer) if customer else None, "stage": row["stage"],
            "status": row["status"], "revision": row["revision"], "state": json.loads(row["state_json"]),
            "photos": photos, "agreement": agreement_dict(agreement) if agreement else None,
            "active_job": active_job, "phone_paired": row["status"] == "active" and bool(row["phone_token_hash"])}


@router.post("", dependencies=[Depends(require_barber)])
def create(body: ConsultationInput):
    customer_id = str(body.customer_id) if body.customer_id else None
    with db.connect() as conn:
        # shortcut: SQLite serializes consultation starts; upgrade if multiple chairs are supported.
        conn.execute("BEGIN IMMEDIATE")
        if customer_id and not conn.execute("SELECT id FROM customers WHERE id=?", (customer_id,)).fetchone():
            raise APIError("not_found", "Customer not found.")
        state = empty_state()
        if body.from_visit_id:
            visit = conn.execute("SELECT v.*, a.plan_json, c.state_json FROM visits v "
                                 "JOIN agreements a ON a.id=v.agreement_id JOIN consultations c ON c.id=v.consultation_id "
                                 "WHERE v.id=? AND v.customer_id=?", (str(body.from_visit_id), customer_id)).fetchone()
            if visit is None:
                raise APIError("not_found", "Visit not found for this customer.")
            plan = json.loads(visit["plan_json"])
            previous = json.loads(visit["state_json"])
            for field in ("keep", "change", "avoid"):
                state[field] = plan.get(field, [])
            if plan.get("face_shape"):
                # shortcut: zero ratios mark missing historical measurements (as in C5); upgrade if API adds nullable ratios.
                old_face = previous.get("face_shape") or {}
                state["face_shape"] = {"suggested": [], "ratios": old_face.get("ratios") or {"lw": 0.0, "jw": 0.0, "fw": 0.0}, "outline": [],
                                       "confirmed": plan["face_shape"], "face_found": False}
            for text in plan.get("observations", []):
                old = next((o for o in previous.get("observations", []) if o["text"] == text), {})
                state["observations"].append({"id": str(uuid4()), "text": text, "view": old.get("view", "front"),
                                              "region": old.get("region", "general"), "uncertain": old.get("uncertain", True),
                                              "status": "unconfirmed", "origin": "history"})
        if conn.execute("SELECT id FROM consultations WHERE status='active' LIMIT 1").fetchone():
            raise APIError("conflict_unresolved", "Finish the active consultation first.")
        cid = str(uuid4())
        conn.execute("INSERT INTO consultations (id, customer_id, status, stage, revision, state_json, started_at) VALUES (?,?,?,?,?,?,?)",
                     (cid, customer_id, "active", "concern", 0, json.dumps(state), datetime.now(timezone.utc).isoformat()))
        return consultation_dict(conn, conn.execute("SELECT * FROM consultations WHERE id=?", (cid,)).fetchone())


@router.get("/active", dependencies=[Depends(require_barber)])
def active():
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM consultations WHERE status='active' ORDER BY started_at DESC LIMIT 1").fetchone()
        return consultation_dict(conn, row) if row else None


@router.get("/{consultation_id}")
def get(consultation_id: str, request: Request):
    row = require_scope(consultation_id, request)
    with db.connect() as conn:
        return consultation_dict(conn, row)


class ConfirmationInput(consult.Input):
    role: consult.Speaker
    barber_notes: str = ""
    expected_revision: int


class CompletionInput(consult.Input):
    actual_notes: str
    save_as_preferred: bool
    keep_photos: bool


def _state(row):
    return {**json.loads(row["state_json"]), "revision": row["revision"],
            "stage": row["stage"], "consultation_id": row["id"]}


def _save_state(conn, cid, state):
    value = {key: item for key, item in state.items() if key not in ("stage", "consultation_id")}
    conn.execute("UPDATE consultations SET revision=?, stage=?, state_json=? WHERE id=?",
                 (state["revision"], state["stage"], json.dumps(value), cid))


def _write(consultation_id, request, action, payload):
    """Scope and replay checks occur under the same lock as every C3 write."""
    key = request.headers.get("Idempotency-Key", "")
    if not key.strip() or len(key) > 128:
        raise APIError("invalid_input", "An Idempotency-Key of 1-128 characters is required.")
    event_id = consult._id([consultation_id, "idempotency", key])
    cleanup = []
    with db.connect() as conn:
        # shortcut: one chair, SQLite write lock; revisit if multiple chairs are added.
        conn.execute("BEGIN IMMEDIATE")
        require_scope(consultation_id, request)
        row = conn.execute("SELECT * FROM consultations WHERE id=?", (consultation_id,)).fetchone()
        event = conn.execute("SELECT text FROM contributions WHERE id=? AND consultation_id=?", (event_id, consultation_id)).fetchone()
        if event:
            saved = json.loads(event["text"])
            if saved["action"] != action or saved["payload"] != payload:
                raise APIError("invalid_input", "Use a new Idempotency-Key for a different request.")
            response = saved["response"]
            if action == "complete":
                cleanup = list(conn.execute("SELECT * FROM media WHERE consultation_id=? AND keep=0", (consultation_id,)))
        else:
            if row["status"] != "active":
                raise APIError("not_found", "Active consultation not found.")
            now = datetime.now(timezone.utc).isoformat()
            speaker, input_type = "barber", "chip"
            if action == "contribution":
                contribution = {name: value for name, value in payload.items() if name != "expected_revision"}
                out = consult.apply_contribution(_state(row), contribution, payload.get("expected_revision"))
                _save_state(conn, consultation_id, out)
                # Confirmed versions are immutable; edits invalidate only pending drafts.
                conn.execute("DELETE FROM agreements WHERE consultation_id=? AND (customer_confirmed_at IS NULL OR barber_confirmed_at IS NULL)", (consultation_id,))
                speaker = contribution.get("speaker", "barber")
                input_type = contribution.get("input_type", contribution["kind"])
                # C6 consumes real typed/voice text, including its original negation.
                text = contribution["text"] if contribution["kind"] == "text" else json.dumps(contribution)
                conn.execute("INSERT INTO contributions VALUES (?,?,?,?,?,?)", (consult._id([event_id, "input"]),
                    consultation_id, speaker, input_type, text, now))
            elif action == "confirm":
                agreement = conn.execute("SELECT * FROM agreements WHERE consultation_id=? ORDER BY version DESC LIMIT 1", (consultation_id,)).fetchone()
                out, draft = consult.confirm_agreement(_state(row), agreement_dict(agreement) if agreement else None,
                    payload["role"], payload["barber_notes"], payload["expected_revision"], now)
                conn.execute("INSERT INTO agreements VALUES (?,?,?,?,?,?) ON CONFLICT(consultation_id,version) DO UPDATE SET "
                    "plan_json=excluded.plan_json, customer_confirmed_at=excluded.customer_confirmed_at, barber_confirmed_at=excluded.barber_confirmed_at "
                    "WHERE agreements.customer_confirmed_at IS NULL OR agreements.barber_confirmed_at IS NULL",
                    (draft["id"], consultation_id, draft["version"], json.dumps(draft["plan"]), draft["customer_confirmed_at"], draft["barber_confirmed_at"]))
                _save_state(conn, consultation_id, out)
                speaker = payload["role"]
            else:
                response, cleanup = consult.complete_visit(conn, row, payload["actual_notes"], payload["save_as_preferred"], payload["keep_photos"], now)
            if action != "complete":
                response = consultation_dict(conn, conn.execute("SELECT * FROM consultations WHERE id=?", (consultation_id,)).fetchone())
            # shortcut: durable replay envelopes use stage bookkeeping rows in the
            # existing contributions table (C6 should read typed/voice input rows);
            # give idempotency its own table if schema v2 or multiple chairs are needed.
            conn.execute("INSERT INTO contributions VALUES (?,?,?,?,?,?)", (event_id, consultation_id, "barber", "stage",
                json.dumps({"action": action, "payload": payload, "response": response}), now))
    # shortcut: filesystem deletion cannot share SQLite's transaction. Keep unkept
    # rows until deletion succeeds, so the same completion key retries cleanup.
    for item in cleanup:
        try:
            media.delete_media(item["id"])
        except OSError:
            raise APIError("invalid_input", "Visit saved, but media cleanup failed. Retry the same completion request.", retryable=True) from None
    return response


@router.post("/{consultation_id}/contributions")
def contribute(consultation_id: str, request: Request, body: dict):
    require_scope(consultation_id, request)
    contribution = consult.validate_contribution({name: value for name, value in body.items() if name != "expected_revision"})
    if contribution["kind"] in {"observation", "observation_add", "face_shape", "stage"}:
        require_barber(request)
    return _write(consultation_id, request, "contribution", body)


@router.post("/{consultation_id}/agreements/confirm")
def confirm(consultation_id: str, request: Request, body: ConfirmationInput):
    require_scope(consultation_id, request)
    if body.role == "barber" or body.barber_notes:
        require_barber(request)
    if len(body.barber_notes) > 4000:
        raise APIError("invalid_input", "Cutting notes are too long.")
    return _write(consultation_id, request, "confirm", body.model_dump())


@router.post("/{consultation_id}/complete", dependencies=[Depends(require_barber)])
def complete(consultation_id: str, request: Request, body: CompletionInput):
    if len(body.actual_notes) > 4000:
        raise APIError("invalid_input", "Actual cut notes are too long.")
    return _write(consultation_id, request, "complete", body.model_dump())


@router.post("/{consultation_id}/abandon", dependencies=[Depends(require_barber)])
def abandon(consultation_id: str):
    """Barber cancels (customer left, wrong person). Nothing is saved; media is deleted; phone access ends."""
    with db.connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        changed = conn.execute("UPDATE consultations SET status='abandoned', stage='abandoned', phone_token_hash=NULL, "
                               "pair_code_hash=NULL, ended_at=? WHERE id=? AND status='active'",
                               (datetime.now(timezone.utc).isoformat(), consultation_id)).rowcount
        if not changed:
            raise APIError("not_found", "Active consultation not found.")
        conn.execute("UPDATE jobs SET status='cancelled', finished_at=? WHERE consultation_id=? AND status IN ('queued','running')",
                     (datetime.now(timezone.utc).isoformat(), consultation_id))
        doomed = [r["id"] for r in conn.execute("SELECT id FROM media WHERE consultation_id=?", (consultation_id,))]
    for media_id in doomed:
        media.delete_media(media_id)
    return {"id": consultation_id, "status": "abandoned"}
