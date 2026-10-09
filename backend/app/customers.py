"""Barber-only customer persistence and visit history."""
import json
from datetime import datetime, timezone
from typing import Annotated, Literal
from uuid import uuid4
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, StringConstraints
from . import db
from .auth import require_barber
from .errors import APIError

router = APIRouter(prefix="/api/customers", dependencies=[Depends(require_barber)])
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class CustomerInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    display_name: Name
    nickname: Name | None = None
    retention_consent: Literal[True]


def agreement_dict(row):
    return {"id": row["id"], "version": row["version"], "plan": json.loads(row["plan_json"]),
            "customer_confirmed_at": row["customer_confirmed_at"], "barber_confirmed_at": row["barber_confirmed_at"]}


def visit_dict(conn, row):
    agreement = conn.execute("SELECT * FROM agreements WHERE id=?", (row["agreement_id"],)).fetchone()
    return {"id": row["id"], "completed_at": row["completed_at"], "agreement": agreement_dict(agreement), "actual_notes": row["actual_notes"]}


@router.get("")
def search(q: str = Query(default="", max_length=200)):
    term = q.replace("!", "!!").replace("%", "!%").replace("_", "!_")
    pattern = "%" + term + "%"
    with db.connect() as conn:
        rows = conn.execute("SELECT c.id, c.display_name, c.nickname, c.preferred_visit_id, "
                            "(SELECT MAX(v.completed_at) FROM visits v WHERE v.customer_id=c.id) AS last_visit_at "
                            "FROM customers c WHERE c.display_name LIKE ? ESCAPE '!' OR c.nickname LIKE ? ESCAPE '!' "
                            "ORDER BY c.display_name, c.id LIMIT 20", (pattern, pattern)).fetchall()
    return [dict(row) for row in rows]


@router.post("")
def create(body: CustomerInput):
    now = datetime.now(timezone.utc).isoformat()
    customer = {"id": str(uuid4()), "display_name": body.display_name, "nickname": body.nickname,
                "preferred_visit_id": None, "retention_consent_at": now, "created_at": now}
    with db.connect() as conn:
        conn.execute("INSERT INTO customers VALUES (?,?,?,?,?,?)", tuple(customer.values()))
    return customer


@router.get("/{customer_id}")
def profile(customer_id: str):
    with db.connect() as conn:
        customer = conn.execute("SELECT * FROM customers WHERE id=?", (customer_id,)).fetchone()
        if customer is None:
            raise APIError("not_found", "Customer not found.")
        visits = [visit_dict(conn, row) for row in conn.execute(
            "SELECT * FROM visits WHERE customer_id=? ORDER BY completed_at DESC, id", (customer_id,))]
        preferred = next((visit for visit in visits if visit["id"] == customer["preferred_visit_id"]), None)
    return {"customer": dict(customer), "preferred": preferred, "visits": visits}


@router.delete("/{customer_id}")
def erase(customer_id: str):
    """Right to erasure: the customer, every visit and consultation, and saved photos."""
    from .media import _media_path

    with db.connect() as conn:
        if conn.execute("SELECT 1 FROM customers WHERE id=?", (customer_id,)).fetchone() is None:
            raise APIError("not_found", "Customer not found.")
        if conn.execute("SELECT 1 FROM consultations WHERE customer_id=? AND status='active'", (customer_id,)).fetchone():
            raise APIError("in_use", "Tapusin o itigil muna ang kasalukuyang konsulta.")
        ids = [row["id"] for row in conn.execute("SELECT id FROM consultations WHERE customer_id=?", (customer_id,))]
        marks = ",".join("?" for _ in ids)
        keys = [row["storage_key"] for row in conn.execute(
            f"SELECT storage_key FROM media WHERE consultation_id IN ({marks})", ids)] if ids else []
        conn.execute("UPDATE customers SET preferred_visit_id=NULL WHERE id=?", (customer_id,))
        conn.execute("DELETE FROM visits WHERE customer_id=?", (customer_id,))
        if ids:
            for table in ("media", "agreements", "contributions", "jobs"):
                conn.execute(f"DELETE FROM {table} WHERE consultation_id IN ({marks})", ids)
            conn.execute(f"DELETE FROM consultations WHERE id IN ({marks})", ids)
        conn.execute("DELETE FROM customers WHERE id=?", (customer_id,))
    for key in keys:  # after commit, so a failed transaction never loses photos
        _media_path(key).unlink(missing_ok=True)
    return {"deleted": customer_id}
