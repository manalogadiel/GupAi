"""C7 contract tests: real HTTPS routes/SQLite, with only local inference mocked."""
import json
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from threading import Event
from threading import Thread
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.app import ai, consult, db, jobs, main, media
from backend.app.errors import APIError

ORIGIN = {"Origin": "https://localhost:8443"}
PICK = {"catalog_id": "side_part", "name": "Side part", "image": "/assets/catalog/side_part.webp", "why": "Madaling ayusin."}
OTHER = {**PICK, "catalog_id": "curtains", "name": "Curtains"}
RECOMMEND = {"top_pick": PICK, "alternatives": [OTHER], "face_note": "Tantiya lang."}
PART = {"id": "taper", "name": "Taper", "pros": ["Malinis"], "cons": ["Regular trim"], "why": "Para sa gilid", "maintenance": "Trim regularly"}
SUGGEST = {"options": [PART], "recommended_id": "taper", "intro": "Ayusin ang gilid."}
CHAT = {"reply": "Sige, ingatan ang fringe.", "problems_detected": ["puffy_sides"],
        "proposed_changes": [{"field": "change", "op": "add", "value": "fringe", "negated": True}], "goal": "Malinis na gilid"}


@pytest.fixture
def barber(tmp_path, monkeypatch):
    # Keep simulated phone cookies on the TestClient's configured host.
    monkeypatch.setenv('GUPAI_PAIR_BASE_URL', 'https://localhost:8443')
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "test.db")
    monkeypatch.setattr(media, "MEDIA_DIR", tmp_path / "media")
    monkeypatch.setattr(jobs, "_ensure_worker", lambda: None)
    jobs._transient.clear()
    with TestClient(main.app, base_url="https://localhost:8443", client=("127.0.0.1", 1)) as client:
        yield client
    jobs._transient.clear()


def post(client, path, body, key=None):
    return client.post(path, json=body, headers={**ORIGIN, "Idempotency-Key": key or str(uuid4())})


def create(client, **body):
    response = post(client, "/api/consultations", body)
    assert response.status_code == 200, response.text
    return response.json()


def contribute(client, current, **body):
    return post(client, f'/api/consultations/{current["id"]}/contributions', {**body, "expected_revision": current["revision"]})


def saved(cid):
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM consultations WHERE id=?", (cid,)).fetchone()
    return {**json.loads(row["state_json"]), "stage": row["stage"], "revision": row["revision"]}


def seed(cid, stage=None, **changes):
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM consultations WHERE id=?", (cid,)).fetchone()
        state = {**json.loads(row["state_json"]), **changes}
        conn.execute("UPDATE consultations SET state_json=?, stage=? WHERE id=?", (json.dumps(state), stage or row["stage"], cid))


def start_job(client, current, job_type, **body):
    response = post(client, f'/api/consultations/{current["id"]}/jobs',
                    {"type": job_type, "expected_revision": current["revision"], **body})
    assert response.status_code == 200, response.text
    return response.json()


def photo(cid):
    mid = str(uuid4())
    with db.connect() as conn:
        conn.execute("INSERT INTO media VALUES (?,?,?,?,?,?,?)", (mid, cid, "photo", "side", mid + ".jpg", 0, "now"))
    return mid


def phone(client, cid, host):
    remote = TestClient(main.app, base_url="https://localhost:8443", client=(host, 1))
    pairing = post(client, f"/api/consultations/{cid}/pair", {}).json()
    assert remote.get(pairing["url"], follow_redirects=False).status_code == 302
    return remote


def summary(client, current):
    current = contribute(client, current, kind="face_shape", confirmed="round").json()
    for stage in ("goal", "reveal"):
        current = contribute(client, current, kind="stage", stage=stage).json()
    current = contribute(client, current, kind="reveal").json()
    seed(current["id"], recommendations=RECOMMEND, sides={**SUGGEST, "choice": None})
    current = contribute(client, current, kind="pick_style", catalog_id="side_part").json()
    current = contribute(client, current, kind="choose_part", part="sides", option_id="taper").json()
    current = contribute(client, current, kind="choose_part", part="top", custom="Keep the length").json()
    for stage in ("sides", "top", "summary"):
        response = contribute(client, current, kind="stage", stage=stage)
        assert response.status_code == 200, response.text
        current = response.json()
    return current


def confirm(client, current, role):
    return post(client, f'/api/consultations/{current["id"]}/agreements/confirm',
                {"role": role, "barber_notes": "trim" if role == "barber" else "", "expected_revision": current["revision"]})


def test_new_state_multiple_chairs_and_newest_active(barber):
    first = create(barber)
    second = create(barber, chair_label="Window")
    assert first["stage"] == second["stage"] == "photos"
    assert first["chair_label"] == "Upuan 1" and second["chair_label"] == "Window"
    state = first["state"]
    assert state["problems"] == state["chat"] == [] and state["revealed"] is False
    assert state["recommendations"] is state["selected_style"] is None
    assert state["sides"] == state["top"] == {"options": [], "recommended_id": None, "intro": None, "choice": None}
    assert state["checkpoints"] == {"sides": None, "top": None}
    assert create(barber)["chair_label"] == "Upuan 3"
    listing = barber.get("/api/consultations/active-list").json()
    assert [r["id"] for r in listing] == [barber.get("/api/consultations/active").json()["id"], second["id"], first["id"]]
    assert set(listing[0]) == {"id", "chair_label", "customer", "stage", "phone_paired", "started_at"}
    assert post(barber, "/api/consultations", {"chair_label": "x" * 31}).status_code == 422


def test_two_chairs_two_phones_cross_access_is_404(barber):
    a, b = create(barber), create(barber)
    pa, pb = phone(barber, a["id"], "192.168.1.2"), phone(barber, b["id"], "192.168.1.3")
    ja = start_job(barber, a, "chat")
    ma = photo(a["id"])
    for own, other, remote in ((a, b, pa), (b, a, pb)):
        assert remote.get(f'/api/consultations/{own["id"]}').status_code == 200
        assert remote.get(f'/api/consultations/{other["id"]}').status_code == 404
        assert contribute(remote, other, kind="problem", id="cowlick").status_code == 404
        assert post(remote, f'/api/consultations/{other["id"]}/jobs', {"type": "chat", "expected_revision": 0}).status_code == 404
        assert remote.get("/api/consultations/active-list").status_code == 403
    assert pb.get('/api/jobs/' + ja["id"]).status_code == 404
    assert pb.delete('/api/jobs/' + ja["id"], headers=ORIGIN).status_code == 404
    assert pb.get('/api/media/' + ma).status_code == 404
    assert post(pb, f'/api/consultations/{b["id"]}/jobs', {"type": "checkpoint", "media_id": ma, "part": "sides", "expected_revision": 0}).status_code == 404
    assert all(row["phone_paired"] for row in barber.get("/api/consultations/active-list").json())


def test_stage_and_reveal_gates_do_not_write_on_error(barber):
    current = create(barber)
    assert contribute(barber, current, kind="reveal").status_code == 422
    assert contribute(barber, current, kind="stage", stage="sides").status_code == 422
    current = contribute(barber, current, kind="stage", stage="goal").json()
    response = contribute(barber, current, kind="stage", stage="reveal")
    assert response.status_code == 200  # shape can be unknown until face-only Reveal
    current = response.json()
    current = contribute(barber, current, kind="stage", stage="goal").json()
    current = contribute(barber, current, kind="face_shape", confirmed="round").json()
    seed(current["id"], recommendations=RECOMMEND)
    before = saved(current["id"])
    for _ in range(2):
        hidden = barber.get(f'/api/consultations/{current["id"]}').json()["state"]
        assert hidden["face_shape"] is hidden["recommendations"] is None
    assert saved(current["id"]) == before
    current = contribute(barber, current, kind="stage", stage="reveal").json()
    remote = phone(barber, current["id"], "192.168.1.2")
    assert contribute(remote, current, kind="reveal").status_code == 403
    current = contribute(barber, current, kind="reveal").json()
    visible = remote.get(f'/api/consultations/{current["id"]}').json()["state"]
    assert visible["face_shape"]["confirmed"] == "round" and visible["recommendations"] == RECOMMEND
    current = contribute(barber, current, kind="stage", stage="sides").json()
    current = contribute(barber, current, kind="stage", stage="top").json()
    response = contribute(barber, current, kind="stage", stage="summary")
    assert response.status_code == 409 and response.json()["code"] == "conflict_unresolved"
    assert "style" not in response.json()["message"] and "sides" in response.json()["message"] and "top" in response.json()["message"]
    assert contribute(barber, current, kind="stage", stage="cutting").status_code == 422
    assert confirm(barber, current, "customer").status_code == 422


@pytest.mark.parametrize("body", [
    {"kind": "problem", "id": "unknown"},
    {"kind": "choose_part", "part": "back", "custom": "trim"},
    {"kind": "choose_part", "part": "top"},
    {"kind": "choose_part", "part": "sides", "option_id": "taper", "custom": "trim"},
    {"kind": "choose_part", "part": "sides", "option_id": "other"},
    {"kind": "choose_part", "part": "top", "custom": "x" * 121},
    {"kind": "choose_part", "part": "top", "custom": "   "},
    {"kind": "pick_style", "catalog_id": "invented"},
])
def test_invalid_v2_contributions_leave_state_unchanged(barber, body):
    current = create(barber)
    seed(current["id"], recommendations=RECOMMEND, sides={**SUGGEST, "choice": None})
    before = saved(current["id"])
    assert contribute(barber, current, **body).status_code == 422
    assert saved(current["id"]) == before


def test_problems_chat_limit_part_choices_and_revision_replay(barber):
    current = create(barber)
    for _ in range(2):
        current = contribute(barber, current, kind="problem", id="cowlick").json()
    assert current["state"]["problems"] == ["cowlick"]
    current = contribute(barber, current, kind="problem", id="cowlick", remove=True).json()
    assert current["state"]["problems"] == []
    for i in range(14):
        current = contribute(barber, current, kind="text", speaker="customer", input_type="typed", text=f"message {i}").json()
    assert len(current["state"]["chat"]) == 12 and current["state"]["chat"][0]["text"] == "message 2"
    old = dict(current)
    seed(current["id"], recommendations=RECOMMEND, sides={**SUGGEST, "choice": None})
    current = contribute(barber, current, kind="pick_style", catalog_id="curtains").json()
    assert current["state"]["selected_style"] == "curtains"
    assert contribute(barber, old, kind="problem", id="cowlick").status_code == 409
    current = contribute(barber, current, kind="choose_part", part="sides", option_id="taper").json()
    assert current["state"]["sides"]["choice"] == {"id": "taper", "custom": None}
    current = contribute(barber, current, kind="choose_part", part="top", custom="Keep length").json()
    assert current["state"]["top"]["choice"] == {"id": None, "custom": "Keep length"}
    key = str(uuid4())
    body = {"kind": "problem", "id": "flat_top", "expected_revision": current["revision"]}
    path = f'/api/consultations/{current["id"]}/contributions'
    first = post(barber, path, body, key)
    assert first.status_code == 200 and post(barber, path, body, key).json() == first.json()
    assert saved(current["id"])["revision"] == current["revision"] + 1


def test_summary_confirmation_records_resolved_names_and_cutting_cannot_go_back(barber):
    current = summary(barber, create(barber))
    assert contribute(barber, current, kind="stage", stage="cutting").status_code == 422
    current = confirm(barber, current, "customer").json()
    assert current["stage"] == "summary"
    current = confirm(barber, current, "barber").json()
    assert current["stage"] == "cutting"
    plan = current["agreement"]["plan"]
    assert plan["selected_style"] == "side_part" and plan["sides_choice"] == "Taper"
    assert plan["top_choice"] == "Keep the length" and plan["problems"] == []
    assert contribute(barber, current, kind="stage", stage="summary").status_code == 422
    current = contribute(barber, current, kind="stage", stage="done").json()
    assert current["stage"] == "done"


def test_summary_missing_choice_and_open_conflict_block_confirmation(barber):
    current = create(barber)
    seed(current["id"], stage="summary")
    assert confirm(barber, current, "customer").status_code == 409
    current = summary(barber, create(barber))
    current = contribute(barber, current, kind="chip", speaker="customer", field="keep", value="fringe").json()
    current = contribute(barber, current, kind="chip", speaker="customer", field="change", value="trim fringe").json()
    assert confirm(barber, current, "customer").status_code == 409


@pytest.mark.parametrize("stage", ["cutting", "done"])
def test_rating_saved_and_other_chair_stays_paired(barber, stage):
    customer = post(barber, "/api/customers", {"display_name": "Test", "retention_consent": True}).json()
    current = summary(barber, create(barber, customer_id=customer["id"]))
    current = confirm(barber, current, "customer").json()
    current = confirm(barber, current, "barber").json()
    if stage == "done":
        current = contribute(barber, current, kind="stage", stage="done").json()
    other = create(barber)
    remote = phone(barber, other["id"], "192.168.1.3")
    own_phone = phone(barber, current["id"], "192.168.1.2")
    body = {"actual_notes": "Trimmed", "save_as_preferred": True, "keep_photos": False, "rating": {"score": 5, "tags": ["malinis", "sakto"]}}
    key = str(uuid4())
    path = f'/api/consultations/{current["id"]}/complete'
    response = post(barber, path, body, key)
    assert response.status_code == 200, response.text
    assert post(barber, path, body, key).json() == response.json()
    with db.connect() as conn:
        visit = conn.execute("SELECT * FROM visits WHERE id=?", (response.json()["visit_id"],)).fetchone()
        assert visit["rating"] == 5 and json.loads(visit["rating_tags"]) == ["malinis", "sakto"]
        assert conn.execute("SELECT preferred_visit_id FROM customers WHERE id=?", (customer["id"],)).fetchone()[0] == visit["id"]
    assert saved(current["id"])["stage"] == "done"
    assert own_phone.get(f'/api/consultations/{current["id"]}').status_code == 404
    assert remote.get(f'/api/consultations/{other["id"]}').status_code == 200


@pytest.mark.parametrize("rating", [{"score": 0, "tags": []}, {"score": 6, "tags": []}, {"score": True, "tags": []},
                                    {"score": 3, "tags": ["x"] * 6}, {"score": 3, "tags": ["x" * 41]}])
def test_invalid_ratings_do_not_complete(barber, rating):
    current = create(barber)
    response = post(barber, f'/api/consultations/{current["id"]}/complete',
                    {"actual_notes": "", "save_as_preferred": False, "keep_photos": False, "rating": rating})
    assert response.status_code == 422
    assert saved(current["id"])["stage"] == "photos"


def test_temporary_rating_accepted_without_visit(barber):
    current = summary(barber, create(barber))
    current = confirm(barber, current, "customer").json()
    current = confirm(barber, current, "barber").json()
    response = post(barber, f'/api/consultations/{current["id"]}/complete',
                    {"actual_notes": "", "save_as_preferred": False, "keep_photos": False, "rating": {"score": 4, "tags": []}})
    assert response.status_code == 200 and response.json() == {"visit_id": None}
    with db.connect() as conn:
        assert conn.execute("SELECT COUNT(*) FROM visits").fetchone()[0] == 0


def test_chat_streams_while_running_merges_latest_revision_and_tracks_new_texts(barber, monkeypatch):
    current = create(barber)
    current = contribute(barber, current, kind="text", speaker="customer", input_type="typed", text="Huwag galawin ang fringe").json()
    job = start_job(barber, current, "chat")
    ready, finish = Event(), Event()
    seen = []

    def chat(state, texts, on_token):
        seen.extend(texts)
        on_token("Sige, ")
        on_token("ingatan ang fringe.")
        ready.set()
        assert finish.wait(5)
        return CHAT

    monkeypatch.setattr(ai, "chat_reply", chat)
    with ThreadPoolExecutor(max_workers=1) as pool:
        work = pool.submit(jobs._process, job["id"])
        try:
            assert ready.wait(5)
            running = barber.get('/api/jobs/' + job["id"]).json()
            assert running["status"] == "running" and running["partial_text"] == CHAT["reply"]
            current = contribute(barber, current, kind="problem", id="cowlick").json()
        finally:
            finish.set()
        work.result(timeout=5)
    done = barber.get('/api/jobs/' + job["id"]).json()
    assert done["status"] == "done" and done["partial_text"] == CHAT["reply"]
    result = saved(current["id"])
    assert result["revision"] == current["revision"] + 1
    assert result["problems"] == ["cowlick", "puffy_sides"] and result["avoid"] == ["fringe"]
    assert result["goal"] == "Malinis na gilid" and result["chat"][-1] == {"role": "ai", "text": CHAT["reply"]}
    assert seen == ["Huwag galawin ang fringe"]
    with db.connect() as conn:
        assert jobs._new_texts(conn, current["id"]) == []
        assert "partial_text" not in conn.execute("SELECT result_json FROM jobs WHERE id=?", (job["id"],)).fetchone()[0]


def test_text_sent_during_chat_is_extracted_by_the_next_chat(barber, monkeypatch):
    current = create(barber)
    current = contribute(barber, current, kind="text", speaker="customer", input_type="typed", text="Ayusin ang gilid").json()

    def first_chat(state, texts, on_token):
        response = contribute(barber, current, kind="text", speaker="customer", input_type="typed", text="Keep the fringe")
        assert response.status_code == 200
        # Reproduce equal Windows clock ticks deterministically: timestamps cannot be the cursor.
        with db.connect() as conn:
            started = conn.execute("SELECT started_at FROM jobs WHERE consultation_id=? AND status='running'", (current["id"],)).fetchone()[0]
            conn.execute("UPDATE contributions SET created_at=? WHERE consultation_id=? AND text='Keep the fringe'", (started,current["id"]))
        return {"reply": "Sige.", "goal": "", "problems_detected": [], "proposed_changes": []}

    monkeypatch.setattr(ai, "chat_reply", first_chat)
    job = start_job(barber, current, "chat")
    jobs._process(job["id"])
    with db.connect() as conn:
        assert jobs._new_texts(conn, current["id"]) == ["Keep the fringe"]
    current = barber.get(f'/api/consultations/{current["id"]}').json()

    def next_chat(state, texts, on_token):
        assert texts == ["Keep the fringe"]
        return {"reply": "Fringe stays.", "goal": "", "problems_detected": [],
                "proposed_changes": [{"field": "keep", "op": "add", "value": "fringe", "negated": False}]}

    monkeypatch.setattr(ai, "chat_reply", next_chat)
    job = start_job(barber, current, "chat")
    jobs._process(job["id"])
    assert saved(current["id"])["keep"] == ["fringe"]


@pytest.mark.parametrize("job_type", ["recommend", "suggest"])
def test_recommend_and_suggest_discard_stale_results(barber, monkeypatch, job_type):
    current = create(barber)
    job = start_job(barber, current, job_type, **({"part": "sides"} if job_type == "suggest" else {}))

    def inference(*args):
        contribute(barber, current, kind="problem", id="cowlick")
        return RECOMMEND if job_type == "recommend" else SUGGEST

    monkeypatch.setattr(ai, job_type, inference)
    jobs._process(job["id"])
    assert barber.get('/api/jobs/' + job["id"]).json()["status"] == "stale"
    state = saved(current["id"])
    assert state["recommendations"] is None and state["sides"]["options"] == []
    assert state["problems"] == ["cowlick"]


def test_recommend_and_suggest_merge_and_clear_obsolete_choice(barber, monkeypatch):
    current = create(barber)
    monkeypatch.setattr(ai, "recommend", lambda state: RECOMMEND)
    job = start_job(barber, current, "recommend")
    jobs._process(job["id"])
    assert saved(current["id"])["selected_style"] == "side_part"
    current = barber.get(f'/api/consultations/{current["id"]}').json()
    monkeypatch.setattr(ai, "suggest", lambda state, part: SUGGEST)
    job = start_job(barber, current, "suggest", part="sides")
    jobs._process(job["id"])
    current = barber.get(f'/api/consultations/{current["id"]}').json()
    current = contribute(barber, current, kind="choose_part", part="sides", option_id="taper").json()
    job = start_job(barber, current, "suggest", part="sides")
    jobs._process(job["id"])
    assert saved(current["id"])["sides"]["choice"] == {"id": "taper", "custom": None}
    current = barber.get(f'/api/consultations/{current["id"]}').json()
    monkeypatch.setattr(ai, "suggest", lambda state, part: {"options": [], "recommended_id": None, "intro": "Manual notes"})
    job = start_job(barber, current, "suggest", part="sides")
    jobs._process(job["id"])
    assert saved(current["id"])["sides"]["choice"] is None


def test_checkpoint_requires_cutting_and_scoped_photo_then_merges_without_stale_check(barber, monkeypatch):
    current = create(barber)
    mid = photo(current["id"])
    path = f'/api/consultations/{current["id"]}/jobs'
    body = {"type": "checkpoint", "part": "sides", "media_id": mid, "expected_revision": 0}
    assert post(barber, path, body).status_code == 422
    seed(current["id"], stage="cutting")
    for invalid in ({**body, "part": "back"}, {k: v for k, v in body.items() if k != "part"}):
        assert post(barber, path, invalid).status_code == 422
    seen = []

    def checkpoint(state, image_path, part):
        seen.append((image_path, part))
        with db.connect() as conn:
            conn.execute("UPDATE consultations SET revision=revision+1 WHERE id=?", (current["id"],))
        return {"status": "review", "note": "Check the sides."}

    monkeypatch.setattr(ai, "checkpoint", checkpoint)
    job = start_job(barber, current, "checkpoint", part="sides", media_id=mid)
    jobs._process(job["id"])
    assert barber.get('/api/jobs/' + job["id"]).json()["status"] == "done"
    state = saved(current["id"])
    assert state["revision"] == 2 and state["checkpoints"]["sides"] == {"status": "review", "note": "Check the sides.", "media_id": mid}
    assert seen == [(media.MEDIA_DIR / (mid + ".jpg"), "sides")]


def test_chat_failure_and_cancel_never_merge(barber, monkeypatch):
    current = create(barber)

    def fail(*args):
        raise APIError("model_unavailable", "Offline model missing", retryable=True)

    monkeypatch.setattr(ai, "chat_reply", fail)
    job = start_job(barber, current, "chat")
    jobs._process(job["id"])
    failed = barber.get('/api/jobs/' + job["id"]).json()
    assert failed["status"] == "failed" and failed["error"]["code"] == "model_unavailable"

    def cancel(state, texts, on_token):
        on_token("Sige")
        barber.delete('/api/jobs/' + job["id"], headers=ORIGIN)
        return CHAT

    monkeypatch.setattr(ai, "chat_reply", cancel)
    job = start_job(barber, current, "chat")
    jobs._process(job["id"])
    assert barber.get('/api/jobs/' + job["id"]).json()["status"] == "cancelled"
    assert saved(current["id"])["revision"] == 0


def test_simultaneous_chairs_start_only_one_inference_worker(monkeypatch):
    starting, allow_start, stop, second_returned = Event(), Event(), Event(), Event()
    workers, loops = [], []

    class DelayedThread(Thread):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            workers.append(self)

        def start(self):
            if len(workers) == 1:
                starting.set()
                assert allow_start.wait(5)
            super().start()

    def loop():
        loops.append("running")
        stop.wait(5)

    def second():
        jobs._ensure_worker()
        second_returned.set()

    monkeypatch.setattr(jobs, "_worker", None)
    monkeypatch.setattr(jobs.threading, "Thread", DelayedThread)
    monkeypatch.setattr(jobs, "_loop", loop)
    first_caller = Thread(target=jobs._ensure_worker)
    second_caller = Thread(target=second)
    try:
        first_caller.start()
        assert starting.wait(5)
        second_caller.start()
        second_returned.wait(.1)
        allow_start.set()
        first_caller.join(5)
        second_caller.join(5)
        assert not first_caller.is_alive() and not second_caller.is_alive()
        assert loops == ["running"]
    finally:
        allow_start.set()
        stop.set()
        first_caller.join(5)
        if second_caller.ident:
            second_caller.join(5)
        for worker in workers:
            if worker.ident:
                worker.join(5)


def legacy_database(path):
    with sqlite3.connect(path) as conn:
        conn.executescript("""
        CREATE TABLE customers(id TEXT PRIMARY KEY, display_name TEXT NOT NULL, nickname TEXT,
            preferred_visit_id TEXT REFERENCES visits(id), retention_consent_at TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE consultations(id TEXT PRIMARY KEY, customer_id TEXT REFERENCES customers(id), status TEXT NOT NULL,
            stage TEXT NOT NULL CHECK(stage IN ('concern','photos','observations','options','agreement','cutting','completed','abandoned')),
            revision INTEGER NOT NULL DEFAULT 0, state_json TEXT NOT NULL, pair_code_hash TEXT, pair_expires_at TEXT,
            phone_token_hash TEXT, started_at TEXT NOT NULL, ended_at TEXT);
        CREATE TABLE contributions(id TEXT PRIMARY KEY, consultation_id TEXT NOT NULL REFERENCES consultations(id), speaker TEXT NOT NULL,
            input_type TEXT NOT NULL CHECK(input_type IN ('typed','stage')), text TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE media(id TEXT PRIMARY KEY, consultation_id TEXT NOT NULL REFERENCES consultations(id), kind TEXT NOT NULL,
            view TEXT, storage_key TEXT NOT NULL UNIQUE, keep INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
        CREATE TABLE agreements(id TEXT PRIMARY KEY, consultation_id TEXT NOT NULL REFERENCES consultations(id), version INTEGER NOT NULL,
            plan_json TEXT NOT NULL, customer_confirmed_at TEXT, barber_confirmed_at TEXT, UNIQUE(consultation_id,version));
        CREATE TABLE visits(id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id), consultation_id TEXT NOT NULL REFERENCES consultations(id),
            agreement_id TEXT NOT NULL REFERENCES agreements(id), actual_notes TEXT NOT NULL, completed_at TEXT NOT NULL);
        CREATE TABLE jobs(id TEXT PRIMARY KEY, consultation_id TEXT NOT NULL REFERENCES consultations(id),
            type TEXT NOT NULL CHECK(type IN ('transcribe','observe','faceshape','propose')), requested_revision INTEGER NOT NULL,
            status TEXT NOT NULL, result_json TEXT, error_code TEXT, started_at TEXT, finished_at TEXT);
        INSERT INTO customers VALUES('customer','Test',NULL,'visit','now','now');
        INSERT INTO consultations VALUES('chair','customer','active','concern',7,'{"keep":["fringe"]}',NULL,NULL,'token','now',NULL);
        INSERT INTO agreements VALUES('agreement','chair',1,'{"keep":["fringe"]}','now','now');
        INSERT INTO visits VALUES('visit','customer','chair','agreement','trim','now');
        INSERT INTO contributions VALUES('input','chair','customer','typed','keep fringe','now');
        INSERT INTO jobs VALUES('oldjob','chair','propose',7,'done','{}',NULL,'now','now');
        PRAGMA user_version=1;
        """)


def test_migration_v1_keeps_related_rows_and_accepts_v2_writes(tmp_path):
    path = tmp_path / "v1.db"
    legacy_database(path)
    db.initialize(path)
    db.initialize(path)
    with db.connect(path) as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 2
        assert list(conn.execute("PRAGMA foreign_key_check")) == []
        row = conn.execute("SELECT * FROM consultations").fetchone()
        assert row["phone_token_hash"] == "token" and row["revision"] == 7
        assert row["stage"] == "goal" and row["chair_label"]
        state = json.loads(row["state_json"])
        assert state["keep"] == ["fringe"] and state["revealed"] is False and state["chat"] == []
        assert conn.execute("SELECT rating,rating_tags FROM visits").fetchone()[:] == (None, None)
        assert conn.execute("SELECT text FROM contributions").fetchone()[0] == "keep fringe"
        conn.execute("UPDATE consultations SET stage='summary' WHERE id='chair'")
        conn.execute("INSERT INTO contributions VALUES('v2','chair','customer','choose_part','{}','now')")
        conn.execute("INSERT INTO jobs(id,consultation_id,type,requested_revision,status) VALUES('v2job','chair','chat',7,'queued')")


@pytest.mark.parametrize("edit", [None, {"selected_style": "side_part"},
                                  {"sides": {"options": [], "choice": {"id": None, "custom": "Trim sides"}}},
                                  {"top": {"options": [], "choice": {"id": None, "custom": "Trim top"}}},
                                  {"problems": ["cowlick"]}])
def test_migrated_v1_cutting_agreement_can_complete_only_with_unchanged_preferences(tmp_path, edit):
    path = tmp_path / "cutting.db"
    legacy_database(path)
    plan = {"keep": ["fringe"], "change": [], "avoid": [], "option": None, "face_shape": None,
            "observations": [], "barber_notes": "trim"}
    with db.connect(path) as conn:
        conn.execute("UPDATE consultations SET stage='cutting' WHERE id='chair'")
        conn.execute("UPDATE agreements SET plan_json=? WHERE id='agreement'", (json.dumps(plan),))
    db.initialize(path)
    with db.connect(path) as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT * FROM consultations WHERE id='chair'").fetchone()
        if edit:
            value = {**json.loads(row["state_json"]), **edit}
            conn.execute("UPDATE consultations SET state_json=? WHERE id='chair'", (json.dumps(value),))
            row = conn.execute("SELECT * FROM consultations WHERE id='chair'").fetchone()
            with pytest.raises(APIError) as error:
                consult.complete_visit(conn, row, "Trimmed", False, False, "now")
            assert error.value.code == "conflict_unresolved"
            assert conn.execute("SELECT COUNT(*) FROM visits").fetchone()[0] == 1
            return
        result, cleanup = consult.complete_visit(conn, row, "Trimmed", False, False, "now", {"score": 4, "tags": []})
        assert result["visit_id"] and cleanup == []
        assert json.loads(conn.execute("SELECT plan_json FROM agreements WHERE id='agreement'").fetchone()[0]) == plan
        assert conn.execute("SELECT rating FROM visits WHERE id=?", (result["visit_id"],)).fetchone()[0] == 4
