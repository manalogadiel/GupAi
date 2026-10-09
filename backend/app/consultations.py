"""Consultation creation, history prefill, and scoped polling (C2)."""
import json
from datetime import datetime, timezone
from uuid import UUID, uuid4
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict
from . import db
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
    job = conn.execute("SELECT * FROM jobs WHERE consultation_id=? AND status IN ('queued','running') ORDER BY rowid LIMIT 1", (cid,)).fetchone()
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
