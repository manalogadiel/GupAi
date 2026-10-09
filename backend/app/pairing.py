"""Hashed, ten-minute, single-use pairing and scoped phone sessions."""
import base64
import hashlib
import io
import os
import socket
import ipaddress
import secrets
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse
import qrcode
from . import db
from .auth import require_barber
from .errors import APIError

router = APIRouter()


@router.post("/api/consultations/{consultation_id}/pair", dependencies=[Depends(require_barber)])
def issue(consultation_id: str, request: Request):
    code = secrets.token_hex(16)
    expires = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
    # shortcut: set GUPAI_PAIR_BASE_URL to the hotspot HTTPS origin when laptop uses localhost.
    base_url = os.environ.get("GUPAI_PAIR_BASE_URL", str(request.base_url)).rstrip("/")
    if not os.environ.get("GUPAI_PAIR_BASE_URL") and request.url.hostname in ("localhost", "127.0.0.1", "::1"):
        try:
            addresses = sorted({item[4][0] for item in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)})
            address = next((a for a in addresses if ipaddress.ip_address(a).is_private
                            and not ipaddress.ip_address(a).is_loopback
                            and not ipaddress.ip_address(a).is_link_local), None)
            if address:
                base_url = f"{request.url.scheme}://{address}:{request.url.port or 8443}"
        except OSError:
            pass  # Explicit GUPAI_PAIR_BASE_URL remains available for unusual LAN configurations.
    url = base_url + "/pair?code=" + code
    png = io.BytesIO()
    qrcode.make(url).save(png, format="PNG")
    with db.connect() as conn:
        changed = conn.execute("UPDATE consultations SET pair_code_hash=?, pair_expires_at=? WHERE id=? AND status='active'",
                               (hashlib.sha256(code.encode()).hexdigest(), expires, consultation_id)).rowcount
        if not changed:
            raise APIError("not_found", "Active consultation not found.")
    return {"url": url, "qr_png_data_url": "data:image/png;base64," + base64.b64encode(png.getvalue()).decode(), "expires_at": expires}


@router.get("/pair")
def redeem(request: Request, code: str = ""):
    now = datetime.now(timezone.utc).isoformat()
    token = secrets.token_hex(32)
    digest = hashlib.sha256(code.encode()).hexdigest()
    with db.connect() as conn:
        # The write lock makes code consumption single-use even for simultaneous requests.
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT id FROM consultations WHERE pair_code_hash=? AND pair_expires_at>? AND status='active'",
                           (digest, now)).fetchone()
        if row is None:
            raise APIError("pair_expired", "Pairing code expired or already used. Ask the barber for a new QR.")
        conn.execute("UPDATE consultations SET pair_code_hash=NULL, pair_expires_at=NULL, phone_token_hash=? WHERE id=?",
                     (hashlib.sha256(token.encode()).hexdigest(), row["id"]))
    response = RedirectResponse("/phone?c=" + row["id"], status_code=302)
    response.set_cookie("gupai_phone", token, httponly=True, secure=request.url.scheme == "https", samesite="strict", path="/")
    response.headers["Cache-Control"] = "no-store"
    return response
