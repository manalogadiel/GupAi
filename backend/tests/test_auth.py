"""C2 contract tests using real SQLite and HTTPS clients."""
import base64
import hashlib
import json
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlsplit
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from backend.app import db, main

ORIGIN = {"Origin": "https://localhost:8443"}


@pytest.fixture
def barber(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "test.db")
    with TestClient(main.app, base_url="https://localhost:8443", client=("127.0.0.1", 1)) as client:
        yield client


def create(client, **body):
    response = client.post("/api/consultations", json=body, headers=ORIGIN)
    assert response.status_code == 200
    return response.json()


def phone():
    return TestClient(main.app, base_url="https://localhost:8443", client=("192.168.1.2", 1))


def issue(client, cid):
    response = client.post(f"/api/consultations/{cid}/pair", headers=ORIGIN)
    assert response.status_code == 200
    return response.json()


def test_customer_search_profile_and_persistence(barber):
    body = {"display_name": "Miguel", "nickname": "Migs", "retention_consent": True}
    response = barber.post("/api/customers", json=body, headers=ORIGIN)
    assert response.status_code == 200
    customer = response.json()
    assert customer["display_name"] == "Miguel"
    assert customer["retention_consent_at"]
    found = barber.get("/api/customers?q=Migs").json()
    assert found == [{"id": customer["id"], "display_name": "Miguel", "nickname": "Migs", "last_visit_at": None, "preferred_visit_id": None}]
    profile = barber.get('/api/customers/' + customer['id']).json()
    assert profile == {"customer": customer, "preferred": None, "visits": []}
    assert barber.get("/api/customers?q=' OR 1=1 --").json() == []
    with db.connect() as conn:
        assert conn.execute("SELECT COUNT(*) FROM customers").fetchone()[0] == 1
    assert barber.get('/api/customers/' + str(uuid4())).status_code == 404


@pytest.mark.parametrize("body", [
    {"display_name": "Miguel", "retention_consent": False},
    {"display_name": "Miguel"},
    {"display_name": "  ", "retention_consent": True},
    {"display_name": "Miguel", "retention_consent": True, "preferred_visit_id": "x"},
])
def test_invalid_customer_never_persisted(barber, body):
    assert barber.post("/api/customers", json=body, headers=ORIGIN).status_code == 422
    with db.connect() as conn:
        assert conn.execute("SELECT COUNT(*) FROM customers").fetchone()[0] == 0


def test_non_loopback_cannot_access_barber_routes(barber):
    cid = create(barber)["id"]
    remote = phone()
    for method, path, body in [
        ("GET", "/api/customers", None), ("POST", "/api/customers", {}),
        ("GET", "/api/customers/x", None), ("POST", "/api/consultations", {}),
        ("GET", "/api/consultations/active", None),
        ("POST", f"/api/consultations/{cid}/pair", None),
    ]:
        assert remote.request(method, path, json=body, headers={**ORIGIN, "X-Forwarded-For": "127.0.0.1"}).status_code == 403


def test_consultation_defaults_and_one_active(barber):
    assert barber.get("/api/consultations/active").json() is None
    consultation = create(barber)
    assert consultation["status"] == "active"
    assert consultation["stage"] == "concern"
    assert consultation["revision"] == 0
    assert consultation["customer"] is None
    assert consultation["photos"] == []
    assert consultation["agreement"] is None
    assert consultation["active_job"] is None
    assert consultation["phone_paired"] is False
    assert consultation["state"] == {"goal": "", "keep": [], "change": [], "avoid": [], "styling_effort": None, "observations": [], "face_shape": None, "options": [], "selected_option_id": None, "conflicts": [], "reply": None, "next_question": None, "uncertainties": []}
    assert barber.get("/api/consultations/active").json() == consultation
    assert barber.get('/api/consultations/' + consultation['id']).json() == consultation
    assert barber.post("/api/consultations", json={}, headers=ORIGIN).status_code == 409
    assert barber.get('/api/consultations/' + str(uuid4())).status_code == 404


def test_pairing_hash_cookie_single_use_scope_and_revocation(barber):
    a = create(barber)["id"]
    with db.connect() as conn:
        conn.execute("UPDATE consultations SET status='completed' WHERE id=?", (a,))
    b = create(barber)["id"]
    with db.connect() as conn:
        conn.execute("UPDATE consultations SET status='active' WHERE id=?", (a,))
    pairing = issue(barber, a)
    url = urlsplit(pairing["url"])
    assert url.scheme == "https" and url.path == "/pair"
    code = parse_qs(url.query)["code"][0]
    assert len(bytes.fromhex(code)) == 16
    assert base64.b64decode(pairing["qr_png_data_url"].split(",")[1]).startswith(b'\x89PNG\r\n\x1a\n')
    expiry = datetime.fromisoformat(pairing["expires_at"])
    assert 590 < (expiry - datetime.now(timezone.utc)).total_seconds() <= 600
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM consultations WHERE id=?", (a,)).fetchone()
        assert row["pair_code_hash"] == hashlib.sha256(code.encode()).hexdigest()
        assert code not in str(dict(row))
    remote = phone()
    response = remote.get(pairing["url"], follow_redirects=False)
    assert response.status_code == 302 and response.headers["location"].startswith("/phone?c=")
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie and "secure" in cookie and "samesite=strict" in cookie
    assert remote.get(f"/api/consultations/{a}").status_code == 200
    assert remote.get(f"/api/consultations/{b}").status_code == 404
    assert phone().get(f"/api/consultations/{a}").status_code == 404
    assert remote.get(pairing["url"]).status_code == 410
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM consultations WHERE id=?", (a,)).fetchone()
        assert row["pair_code_hash"] is None
        assert row["phone_token_hash"] == hashlib.sha256(remote.cookies.get("gupai_phone").encode()).hexdigest()
        conn.execute("UPDATE consultations SET status='completed' WHERE id=?", (a,))
    assert remote.get(f"/api/consultations/{a}").status_code == 404
    assert barber.post(f"/api/consultations/{a}/pair", headers=ORIGIN).status_code == 404


def test_expired_invalid_and_replaced_pair_codes(barber):
    cid = create(barber)["id"]
    first = issue(barber, cid)
    second = issue(barber, cid)
    assert phone().get(first["url"]).status_code == 410
    with db.connect() as conn:
        conn.execute("UPDATE consultations SET pair_expires_at=? WHERE id=?", ((datetime.now(timezone.utc)-timedelta(seconds=1)).isoformat(), cid))
    assert phone().get(second["url"]).status_code == 410
    assert phone().get("/pair?code=bogus").status_code == 410
    assert phone().get("/pair").status_code == 410


@pytest.mark.parametrize("has_ratios", [True, False])
def test_return_visit_prefill_and_customer_scope(barber, has_ratios):
    customer = barber.post("/api/customers", json={"display_name": "Ben", "retention_consent": True}, headers=ORIGIN).json()
    old = create(barber, customer_id=customer["id"])["id"]
    aid, vid = str(uuid4()), str(uuid4())
    plan = {"keep": ["fringe"], "change": ["sides"], "avoid": ["buzz"], "option": None, "face_shape": "round", "observations": ["medium top"], "barber_notes": "old notes"}
    with db.connect() as conn:
        historical_state = {"observations": [{"text": "medium top", "view": "side", "region": "top", "uncertain": False}],
                            "face_shape": {"confirmed": "round", "ratios": {"lw": 1.1, "jw": 0.8, "fw": 0.9}}}
        if not has_ratios:
            historical_state["face_shape"].pop("ratios")
        conn.execute("UPDATE consultations SET status='completed', state_json=? WHERE id=?", (json.dumps(historical_state), old))
        conn.execute("INSERT INTO agreements VALUES (?,?,?,?,?,?)", (aid, old, 1, json.dumps(plan), "now", "now"))
        conn.execute("INSERT INTO visits VALUES (?,?,?,?,?,?)", (vid, customer["id"], old, aid, "trimmed", "now"))
        conn.execute("UPDATE customers SET preferred_visit_id=? WHERE id=?", (vid, customer["id"]))
    other = barber.post("/api/customers", json={"display_name": "Other", "retention_consent": True}, headers=ORIGIN).json()
    assert barber.post("/api/consultations", json={"customer_id": other["id"], "from_visit_id": vid}, headers=ORIGIN).status_code == 404
    assert barber.post("/api/consultations", json={"customer_id": str(uuid4())}, headers=ORIGIN).status_code == 404
    new = create(barber, customer_id=customer["id"], from_visit_id=vid)
    assert new["customer"]["id"] == customer["id"]
    assert new["state"]["keep"] == ["fringe"]
    assert new["state"]["change"] == ["sides"]
    assert new["state"]["avoid"] == ["buzz"]
    assert new["state"]["face_shape"]["confirmed"] == "round"
    expected_ratios = {"lw": 1.1, "jw": 0.8, "fw": 0.9} if has_ratios else {"lw": 0.0, "jw": 0.0, "fw": 0.0}
    assert new["state"]["face_shape"]["ratios"] == expected_ratios
    assert new["state"]["face_shape"]["outline"] == []
    assert new["state"]["observations"][0]["text"] == "medium top"
    assert new["state"]["observations"][0]["status"] == "unconfirmed"
    assert new["state"]["observations"][0]["origin"] == "history"
    assert new["state"]["observations"][0]["view"] == "side"
    assert new["state"]["observations"][0]["region"] == "top"
    profile = barber.get('/api/customers/' + customer['id']).json()
    assert profile["preferred"]["id"] == vid
    assert profile["visits"][0]["agreement"]["plan"] == plan
    assert barber.get("/api/customers?q=Ben").json()[0]["last_visit_at"] == "now"


def test_spa_refresh_static_and_private_routes(barber, monkeypatch, tmp_path):
    (tmp_path / "index.html").write_text("<html>app</html>")
    (tmp_path / "app.js").write_text("local javascript")
    monkeypatch.setattr(main, "FRONTEND_DIST", tmp_path)
    for path in ["/customers", "/consult/" + str(uuid4()), "/phone"]:
        assert barber.get(path).text == "<html>app</html>"
    assert barber.get("/app.js").text == "local javascript"
    for path in ["/api/missing", "/assets/missing.js", "/media", "/media/secret.jpg", "/pair/other", "/%2e%2e/docs/PRD.md"]:
        assert barber.get(path).status_code == 404
    assert barber.get("/pair").status_code == 410


def test_pair_url_can_use_hotspot_address(barber, monkeypatch):
    monkeypatch.setenv("GUPAI_PAIR_BASE_URL", "https://192.168.43.10:8443")
    pairing = issue(barber, create(barber)["id"])
    assert pairing["url"].startswith("https://192.168.43.10:8443/pair?code=")


def test_search_literal_wildcards_and_twenty_result_cap(barber):
    with db.connect() as conn:
        for i in range(25):
            conn.execute("INSERT INTO customers VALUES (?,?,?,?,?,?)", (str(uuid4()), f"Person {i}", None, None, "now", "now"))
        conn.execute("INSERT INTO customers VALUES (?,?,?,?,?,?)", (str(uuid4()), "100%_!", None, None, "now", "now"))
    assert len(barber.get("/api/customers").json()) == 20
    assert [c["display_name"] for c in barber.get("/api/customers?q=%25_").json()] == ["100%_!"]


def test_ipv6_barber_and_consultation_validation(barber):
    ipv6 = TestClient(main.app, base_url="https://localhost:8443", client=("::1", 1))
    assert ipv6.get("/api/customers").status_code == 200
    for body in [{"customer_id": "bad"}, {"from_visit_id": "bad"}, {"status": "completed"}]:
        assert barber.post("/api/consultations", json=body, headers=ORIGIN).status_code == 422
    with db.connect() as conn:
        assert conn.execute("SELECT COUNT(*) FROM consultations").fetchone()[0] == 0


def test_new_pairing_revokes_previous_phone_after_redemption(barber):
    cid = create(barber)["id"]
    first = phone()
    assert first.get(issue(barber, cid)["url"], follow_redirects=False).status_code == 302
    second = phone()
    assert second.get(issue(barber, cid)["url"], follow_redirects=False).status_code == 302
    assert first.get(f"/api/consultations/{cid}").status_code == 404
    assert second.get(f"/api/consultations/{cid}").status_code == 200


def test_simultaneous_redemption_consumes_code_once(barber):
    from concurrent.futures import ThreadPoolExecutor
    url = issue(barber, create(barber)["id"])["url"]
    def redeem_once(_):
        return phone().get(url, follow_redirects=False).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(redeem_once, range(2))) == [302, 410]


def test_polling_returns_real_media_agreement_job_and_restart_state(barber):
    cid = create(barber)["id"]
    mid, aid, jid = str(uuid4()), str(uuid4()), str(uuid4())
    with db.connect() as conn:
        conn.execute("INSERT INTO media VALUES (?,?,?,?,?,?,?)", (mid, cid, "photo", "front", "random.jpg", 0, "now"))
        conn.execute("INSERT INTO agreements VALUES (?,?,?,?,?,?)", (aid, cid, 1, '{"keep":["fringe"]}', "now", None))
        conn.execute("INSERT INTO jobs (id,consultation_id,type,requested_revision,status) VALUES (?,?,?,?,?)", (jid, cid, "observe", 0, "queued"))
    consultation = barber.get(f"/api/consultations/{cid}").json()
    assert consultation["photos"] == [{"id": mid, "view": "front", "url": f"/api/media/{mid}"}]
    assert consultation["agreement"]["id"] == aid
    assert consultation["agreement"]["plan"] == {"keep": ["fringe"]}
    assert consultation["active_job"] == {"id": jid, "type": "observe", "status": "queued", "requested_revision": 0,
                                           "started_at": None, "finished_at": None, "elapsed_s": 0.0, "result": None, "error": None}
    with TestClient(main.app, base_url="https://localhost:8443", client=("127.0.0.1", 1)) as restarted:
        assert restarted.get("/api/consultations/active").json() == consultation
