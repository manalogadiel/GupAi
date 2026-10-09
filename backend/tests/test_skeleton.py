"""C1 boundary tests: schema, readiness, restart recovery, and HTTP security."""
import importlib
import sqlite3

import httpx
import pytest
from fastapi import Body
from fastapi.testclient import TestClient


def modules():
    # Imports inside tests make absent C1 modules visible as test failures.
    return (importlib.import_module("backend.app.main"),
            importlib.import_module("backend.app.db"),
            importlib.import_module("backend.app.health"))


@pytest.fixture
def client(tmp_path, monkeypatch):
    main, db, health = modules()
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "gupai.db")
    monkeypatch.setattr(health, "OLLAMA_URL", "http://127.0.0.1:1")
    with TestClient(main.app, base_url="https://localhost:8443") as test_client:
        yield test_client


def test_schema_has_seven_tables_and_enforces_foreign_keys(tmp_path):
    _, db, _ = modules()
    path = tmp_path / "gupai.db"
    db.initialize(path)
    db.initialize(path)
    with db.connect(path) as conn:
        tables = {row[0] for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'")}
        assert tables == {"customers", "consultations", "contributions", "media",
                          "agreements", "visits", "jobs"}
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 4
        assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute("INSERT INTO contributions VALUES (?, ?, ?, ?, ?, ?)",
                         ("c", "missing", "customer", "typed", "hello", "now"))


def test_startup_recovers_only_running_jobs(tmp_path, monkeypatch):
    main, db, _ = modules()
    path = tmp_path / "gupai.db"
    monkeypatch.setattr(db, "DB_PATH", path)
    db.initialize()
    with db.connect() as conn:
        conn.execute("INSERT INTO consultations (id, status, stage, revision, state_json, started_at) "
                     "VALUES (?, ?, ?, ?, ?, ?)", ("c", "active", "photos", 0, "{}", "now"))
        for status in ("running", "queued", "done"):
            conn.execute("INSERT INTO jobs (id, consultation_id, type, requested_revision, status) "
                         "VALUES (?, ?, ?, ?, ?)", (status, "c", "observe", 0, status))
    with TestClient(main.app):
        with db.connect() as conn:
            rows = {row["id"]: row for row in conn.execute("SELECT * FROM jobs")}
            assert rows["running"]["status"] == "failed"
            assert rows["running"]["error_code"]
            assert rows["running"]["finished_at"]
            assert rows["queued"]["status"] == "queued"
            assert rows["done"]["status"] == "done"


@pytest.mark.parametrize("path", ["/api/health", "/api/missing", "/phone"])
def test_security_headers_cover_success_and_errors(client, path):
    response = client.get(path)
    assert response.headers["content-security-policy"] == (
        "default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert response.headers["x-frame-options"] == "DENY"


@pytest.mark.parametrize("method", ["POST", "DELETE", "PUT", "PATCH"])
@pytest.mark.parametrize("origin", [None, "null", "https://evil.example",
                                  "https://localhost:8443.evil.example", "http://localhost:8443"])
def test_mutations_reject_missing_or_foreign_origin(client, method, origin):
    response = client.request(method, "/api/missing",
                              headers={} if origin is None else {"Origin": origin})
    assert response.status_code == 403
    assert response.json() == {"code": "forbidden", "message": "Matching Origin required.",
                               "retryable": False}
    assert response.headers["x-frame-options"] == "DENY"


def test_same_origin_reaches_router_and_errors_use_contract(client):
    response = client.post("/api/missing", headers={"Origin": "https://localhost:8443"})
    assert response.status_code == 404
    assert response.json()["code"] == "not_found"
    assert response.json()["retryable"] is False
    assert "revision" not in response.json()


def test_validation_and_revision_errors_use_contract(client):
    main, _, _ = modules()
    errors = importlib.import_module("backend.app.errors")
    async def validation(value: int = Body(...)):
        return value
    async def conflict():
        raise errors.APIError("revision_conflict", "Refresh first.", retryable=True, revision=7)
    main.app.add_api_route("/api/test-validation", validation, methods=["POST"])
    main.app.add_api_route("/api/test-conflict", conflict, methods=["GET"])
    main.app.router.routes.insert(0, main.app.router.routes.pop())
    main.app.router.routes.insert(0, main.app.router.routes.pop())
    try:
        response = client.post("/api/test-validation", json="bad",
                               headers={"Origin": "https://localhost:8443"})
        assert response.status_code == 422
        assert response.json()["code"] == "invalid_input"
        assert set(response.json()) == {"code", "message", "retryable"}
        response = client.get("/api/test-conflict")
        assert response.status_code == 409
        assert response.json() == {"code": "revision_conflict", "message": "Refresh first.",
                                   "retryable": True, "revision": 7}
    finally:
        main.app.router.routes[:] = [r for r in main.app.router.routes
                                     if getattr(r, "path", "") not in
                                     {"/api/test-validation", "/api/test-conflict"}]


def test_health_missing_dependencies_is_truthful(client, monkeypatch, tmp_path):
    _, _, health = modules()
    monkeypatch.setattr(health, "LANDMARKER_PATH", tmp_path / "absent.task")
    def unavailable(name):
        raise ImportError("not installed")
    monkeypatch.setattr(health.importlib, "import_module", unavailable)
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"ollama": False, "vision_model": None,
                               "whisper": False, "face_landmarker": False}


@pytest.mark.parametrize("models, expected", [
    (["qwen3.5:2b", "qwen3.5:4b"], "qwen3.5:4b"),
    (["qwen3.5:2b"], None), (["gemma3:4b"], None),
    (["unrelated:latest"], None)])
def test_health_selects_available_vision_model(client, monkeypatch, tmp_path, models, expected):
    _, _, health = modules()
    model_file = tmp_path / "face_landmarker.task"
    model_file.write_bytes(b"model")
    monkeypatch.setattr(health, "LANDMARKER_PATH", model_file)
    monkeypatch.setattr(health.importlib, "import_module", lambda name: object())
    monkeypatch.setattr(health.stt, "available", lambda: True)
    real_client = httpx.AsyncClient
    def transport(request):
        assert str(request.url) == "http://127.0.0.1:11434/api/tags"
        return httpx.Response(200, json={"models": [{"name": name} for name in models]})
    monkeypatch.setattr(health, "OLLAMA_URL", "http://127.0.0.1:11434")
    monkeypatch.setattr(health.httpx, "AsyncClient",
                        lambda **kw: real_client(transport=httpx.MockTransport(transport), **kw))
    assert client.get("/api/health").json() == {
        "ollama": True, "vision_model": expected, "whisper": True, "face_landmarker": True}


def test_static_assets_and_phone_fallback_do_not_hide_api_errors(client, monkeypatch, tmp_path):
    main, _, _ = modules()
    (tmp_path / "index.html").write_text("<html>GupAi</html>", encoding="utf8")
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "app.js").write_text("console.log('local')", encoding="utf8")
    monkeypatch.setattr(main, "FRONTEND_DIST", tmp_path)
    assert client.get("/").text == "<html>GupAi</html>"
    assert client.get("/phone").text == "<html>GupAi</html>"
    assert client.get("/phone/consultation").text == "<html>GupAi</html>"
    assert client.get("/assets/app.js").text == "console.log('local')"
    assert client.get("/assets/missing.js").status_code == 404
    assert client.get("/api/missing").json()["code"] == "not_found"
    assert client.get("/pair").status_code == 410  # real route since C2: missing code is expired
    assert client.get("/%2e%2e/docs/PRD.md").status_code == 404
