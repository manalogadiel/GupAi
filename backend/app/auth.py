"""Loopback barber access and consultation-scoped phone cookies."""
import hashlib
import hmac
from fastapi import Request
from . import db
from .errors import APIError


def is_barber(request: Request):
    return request.client is not None and request.client.host in {"127.0.0.1", "::1"}


def require_barber(request: Request):
    if not is_barber(request):
        raise APIError("forbidden", "Barber access required.")


def require_scope(consultation_id: str, request: Request):
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM consultations WHERE id=?", (consultation_id,)).fetchone()
    if row is None:
        raise APIError("not_found", "Consultation not found.")
    if is_barber(request):
        return row
    token = request.cookies.get("gupai_phone")
    digest = hashlib.sha256(token.encode()).hexdigest() if token else ""
    if row["status"] != "active" or not row["phone_token_hash"] or not hmac.compare_digest(digest, row["phone_token_hash"]):
        raise APIError("not_found", "Consultation not found.")
    return row
