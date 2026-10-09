"""C3 state transitions and real SQLite/HTTPS agreement lifecycle."""
import copy
import json
import sqlite3
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.app import db, main, consultations, media
from backend.app.errors import APIError


@pytest.fixture
def logic():
    from backend.app import consult
    return consult


def state(**values):
    return {**consultations.empty_state(), "revision": 3, "stage": "concern", **values}


def test_revision_and_text_negation(logic):
    before = state()
    contribution = {"kind": "text", "speaker": "customer", "text": "huwag galawin ang fringe", "input_type": "typed"}
    with pytest.raises(APIError) as error:
        logic.apply_contribution(before, contribution, 2)
    assert error.value.code == "revision_conflict" and error.value.revision == 3
    after = logic.apply_contribution(before, contribution, 3)
    assert after["revision"] == 4
    assert before == state()
    # API.md requires raw text to stay unparsed; C6 supplies the structured change.
    merged = logic.merge_job_result(after, "propose", {"reply": "Fringe stays.", "next_question": None,
        "proposed_changes": [{"field": "change", "op": "add", "value": "fringe", "negated": True}],
        "options": [], "uncertainties": []})
    assert "fringe" in merged["avoid"]
    assert merged["change"] == [] and merged["revision"] == 5


def test_chips_conflicts_and_resolution(logic):
    before = state(keep=["keep the fringe"])
    after = logic.apply_contribution(before, {"kind": "chip", "speaker": "customer", "field": "change", "value": "shorten fringe"}, 3)
    assert len(after["conflicts"]) == 1
    conflict_id = after["conflicts"][0]["id"]
    resolved = logic.apply_contribution(after, {"kind": "resolve_conflict", "conflict_id": conflict_id, "keep": "first"}, 4)
    assert resolved["keep"] == ["keep the fringe"] and resolved["change"] == []
    assert resolved["conflicts"] == []
    conflict = logic.apply_contribution(state(avoid=["fringe"]), {"kind": "chip", "speaker": "customer", "field": "keep", "value": "fringe"}, 3)
    assert len(conflict["conflicts"]) == 1
    removed = logic.apply_contribution(conflict, {"kind": "chip", "speaker": "customer", "field": "avoid", "value": "fringe", "remove": True}, 4)
    assert removed["conflicts"] == []


def test_observations_face_shape_selection_and_stage(logic):
    added = logic.apply_contribution(state(), {"kind": "observation_add", "text": "medium top", "region": "top"}, 3)
    observation = added["observations"][0]
    assert observation["origin"] == "barber" and observation["status"] == "confirmed"
    edited = logic.apply_contribution(added, {"kind": "observation", "observation_id": observation["id"], "status": "confirmed", "text": "short top"}, 4)
    assert edited["observations"][0]["text"] == "short top"
    assert edited["observations"][0]["origin"] == "barber"
    rejected = logic.apply_contribution(edited, {"kind": "observation", "observation_id": observation["id"], "status": "rejected"}, 5)
    assert rejected["observations"][0]["status"] == "rejected"
    face = logic.apply_contribution(rejected, {"kind": "face_shape", "confirmed": "round"}, 6)
    assert face["face_shape"]["confirmed"] == "round"
    selected = logic.apply_contribution(state(options=[{"id": "a"}]), {"kind": "select_option", "option_id": "a"}, 3)
    assert selected["selected_option_id"] == "a"
    photos = logic.apply_contribution(state(), {"kind": "stage", "stage": "photos"}, 3)
    assert photos["stage"] == "photos"
    assert logic.apply_contribution(photos, {"kind": "stage", "stage": "concern"}, 4)["stage"] == "concern"


@pytest.mark.parametrize("contribution", [
    {"kind": "stage", "stage": "options"}, {"kind": "stage", "stage": "completed"},
    {"kind": "select_option", "option_id": "other"},
    {"kind": "observation", "observation_id": "other", "status": "confirmed"},
    {"kind": "face_shape", "confirmed": "triangle"},
    {"kind": "chip", "speaker": "customer", "field": "revision", "value": "9"},
    {"kind": "chip", "speaker": "customer", "field": "styling_effort", "value": "none"},
    {"kind": "text", "speaker": "customer", "text": " ", "input_type": "typed"},
    {"kind": "text", "speaker": "admin", "text": "cut", "input_type": "typed"},
    {"kind": "chip", "speaker": "customer", "field": "keep", "value": "top", "status": "completed"},
])
def test_invalid_contributions_leave_input_unchanged(logic, contribution):
    before = state()
    with pytest.raises(APIError):
        logic.apply_contribution(before, contribution, 3)
    assert before == state()


def test_constraint_change_invalidates_options(logic):
    after = logic.apply_contribution(state(options=[{"id": "a"}], selected_option_id="a"),
        {"kind": "chip", "speaker": "customer", "field": "goal", "value": "easy upkeep"}, 3)
    assert after["goal"] == "easy upkeep"
    assert after["options"] == [] and after["selected_option_id"] is None


def test_candidate_styles_respect_regions_effort_and_preferences(logic):
    catalog = json.loads((db.ROOT / "knowledge/catalog.json").read_text(encoding="utf-8"))
    before = state(avoid=["huwag galawin ang fringe"], styling_effort="low", face_shape={"confirmed": "round"})
    candidates = logic.candidate_styles(catalog, before)
    assert [item["id"] for item in candidates] == []
    candidates = logic.candidate_styles(catalog, state(keep=["fringe"]))
    assert {item["id"] for item in candidates} == {"side_part", "curtains"}
    assert len(logic.candidate_styles(catalog, state(face_shape={"confirmed": "round"}))) == 6


def test_merge_observe_is_pure_preserves_confirmed(logic):
    before = state(observations=[{"id": "known", "text": "short top", "status": "confirmed", "origin": "barber"}])
    result = {"observations": [{"id": "new", "text": "long fringe", "view": "front", "region": "fringe", "uncertain": True, "status": "confirmed", "origin": "barber"}]}
    snapshot = copy.deepcopy((before, result))
    after = logic.merge_job_result(before, "observe", result)
    assert (before, result) == snapshot
    assert after["observations"][0]["status"] == "confirmed"
    assert after["observations"][1]["status"] == "proposed"
    assert after["observations"][1]["origin"] == "ai"
    assert after["revision"] == 4


def test_merge_faceshape_never_keeps_outline_or_overwrites_confirmation(logic):
    result = {"suggested": ["oval"], "ratios": {"lw": 1.3, "jw": .8, "fw": .9}, "outline": [[.1, .2]], "confirmed": "oval", "face_found": True}
    before = state(face_shape={"confirmed": "round", "outline": [[.3, .4]]})
    after = logic.merge_job_result(before, "faceshape", result)
    assert after["face_shape"] == {"suggested": ["oval"], "ratios": {"lw": 1.3, "jw": .8, "fw": .9}, "confirmed": "round", "face_found": True}
    result.update(suggested=[], face_found=False)
    assert logic.merge_job_result(after, "faceshape", result)["face_shape"]["confirmed"] == "round"


def test_merge_propose_remove_add_conflict_and_reply(logic):
    before = state(keep=["fringe"], change=["back"], selected_option_id="old")
    result = {"reply": "Discuss the fringe.", "next_question": "Keep or trim?", "options": [{"id": "new"}], "uncertainties": ["length"],
        "proposed_changes": [{"field": "change", "op": "remove", "value": "back", "negated": False},
                             {"field": "change", "op": "add", "value": "fringe", "negated": False}]}
    after = logic.merge_job_result(before, "propose", result)
    assert after["keep"] == ["fringe"] and after["change"] == ["fringe"]
    assert len(after["conflicts"]) == 1
    assert after["reply"] == "Discuss the fringe." and after["next_question"] == "Keep or trim?"
    assert after["options"] == [{"id": "new"}] and after["selected_option_id"] is None
    assert after["uncertainties"] == ["length"] and after["revision"] == 4
    assert logic.merge_job_result(before, "transcribe", {"text": "huwag"}) == before


def test_agreement_conflict_blocks_confirmation(logic):
    before = state(stage="agreement", conflicts=[{"id": "c", "text": "fringe"}])
    with pytest.raises(APIError) as error:
        logic.confirm_agreement(before, None, "customer", "", 3)
    assert error.value.code == "conflict_unresolved"


@pytest.fixture
def barber(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "test.db")
    monkeypatch.setattr(media, "MEDIA_DIR", tmp_path / "media")
    with TestClient(main.app, base_url="https://localhost:8443", client=("127.0.0.1", 1)) as client:
        yield client


def post(client, path, body, key=None):
    return client.post(path, json=body, headers={"Origin": "https://localhost:8443", "Idempotency-Key": key or str(uuid4())})


def create(client, customer=False):
    body = {}
    if customer:
        body["customer_id"] = post(client, "/api/customers", {"display_name": "Miguel", "retention_consent": True}).json()["id"]
    return post(client, "/api/consultations", body).json()


def contribution(client, cid, revision, **body):
    return post(client, f"/api/consultations/{cid}/contributions", {"expected_revision": revision, **body})


def agreement_stage(client, cid):
    current = client.get(f"/api/consultations/{cid}").json()
    for stage in ("photos", "observations", "options", "agreement"):
        current = contribution(client, cid, current["revision"], kind="stage", stage=stage).json()
    return current


def agree(client, current, role, notes=""):
    return post(client, f'/api/consultations/{current["id"]}/agreements/confirm',
        {"expected_revision": current["revision"], "role": role, "barber_notes": notes})


def test_contribution_revision_scope_roles_origin_and_idempotency(barber):
    cid = create(barber)["id"]
    path = f"/api/consultations/{cid}/contributions"
    body = {"kind": "text", "speaker": "customer", "text": "huwag galawin ang fringe", "input_type": "typed", "expected_revision": 0}
    key = str(uuid4())
    first = post(barber, path, body, key)
    assert first.status_code == 200
    assert first.json()["revision"] == 1
    assert post(barber, path, body, key).json() == first.json()
    stale = post(barber, path, body)
    assert stale.status_code == 409 and stale.json()["revision"] == 1
    with db.connect() as conn:
        rows = conn.execute("SELECT text FROM contributions WHERE consultation_id=? AND input_type='typed'", (cid,)).fetchall()
    assert len(rows) == 1 and rows[0]["text"] == "huwag galawin ang fringe"
    remote = TestClient(main.app, base_url="https://localhost:8443", client=("192.168.1.2", 1))
    assert post(remote, path, body).status_code == 404
    url = post(barber, f"/api/consultations/{cid}/pair", {}).json()["url"]
    remote.get(url, follow_redirects=False)
    assert contribution(remote, cid, 1, kind="face_shape", confirmed="round").status_code == 403
    assert contribution(remote, cid, 1, kind="chip", speaker="customer", field="keep", value="fringe").status_code == 200
    # Speaker is a label for text input, not a grant of barber privileges.
    assert contribution(remote, cid, 2, kind="text", speaker="barber", text="yes", input_type="typed").status_code == 200
    assert agree(remote, remote.get(f"/api/consultations/{cid}").json(), "barber").status_code == 403
    assert post(remote, f"/api/consultations/{cid}/complete", {"actual_notes": "", "save_as_preferred": False, "keep_photos": False}).status_code == 403
    assert barber.post(path, json=body).status_code == 403
    assert post(barber, path, {**body, "kind": "invalid"}).status_code == 422


def test_agreements_are_immutable_versions_and_edits_require_reconfirmation(barber):
    cid = create(barber)["id"]
    current = agreement_stage(barber, cid)
    first = agree(barber, current, "customer").json()
    assert first["agreement"]["customer_confirmed_at"] and first["stage"] == "agreement"
    edited = contribution(barber, cid, first["revision"], kind="chip", speaker="customer", field="keep", value="fringe").json()
    assert edited["agreement"] is None
    current = agree(barber, edited, "barber", "leave fringe").json()
    current = agree(barber, current, "customer").json()
    assert current["stage"] == "cutting" and current["agreement"]["version"] == 1
    original = current["agreement"]
    current = contribution(barber, cid, current["revision"], kind="stage", stage="agreement").json()
    current = contribution(barber, cid, current["revision"], kind="chip", speaker="customer", field="change", value="sides").json()
    current = agree(barber, current, "customer").json()
    current = agree(barber, current, "barber", "trim sides").json()
    assert current["agreement"]["version"] == 2
    with db.connect() as conn:
        rows = conn.execute("SELECT * FROM agreements WHERE consultation_id=? ORDER BY version", (cid,)).fetchall()
    assert len(rows) == 2
    assert json.loads(rows[0]["plan_json"]) == original["plan"]
    assert rows[0]["barber_confirmed_at"] == original["barber_confirmed_at"]


def test_agreement_endpoint_blocked_by_conflict(barber):
    cid = create(barber)["id"]
    contribution(barber, cid, 0, kind="chip", speaker="customer", field="keep", value="fringe")
    contribution(barber, cid, 1, kind="chip", speaker="customer", field="change", value="fringe")
    current = agreement_stage(barber, cid)
    response = agree(barber, current, "customer")
    assert response.status_code == 409 and response.json()["code"] == "conflict_unresolved"


def test_completion_persistence_prefill_media_retention_and_revocation(barber):
    current = create(barber, customer=True)
    cid = current["id"]
    contribution(barber, cid, 0, kind="observation_add", text="medium top", region="top")
    contribution(barber, cid, 1, kind="chip", speaker="customer", field="keep", value="fringe")
    current = agree(barber, agreement_stage(barber, cid), "customer").json()
    current = agree(barber, current, "barber", "leave fringe").json()
    media.MEDIA_DIR.mkdir()
    mids = [str(uuid4()), str(uuid4())]
    with db.connect() as conn:
        for mid, kind, name in zip(mids, ("photo", "audio"), ("photo.jpg", "audio.wav")):
            (media.MEDIA_DIR / name).write_bytes(b"local fixture")
            conn.execute("INSERT INTO media VALUES (?,?,?,?,?,?,?)", (mid, cid, kind, "front" if kind == "photo" else None, name, 0, "now"))
    remote = TestClient(main.app, base_url="https://localhost:8443", client=("192.168.1.2", 1))
    remote.get(post(barber, f"/api/consultations/{cid}/pair", {}).json()["url"], follow_redirects=False)
    key = str(uuid4())
    body = {"actual_notes": "trimmed sides", "save_as_preferred": True, "keep_photos": True}
    response = post(barber, f"/api/consultations/{cid}/complete", body, key)
    assert response.status_code == 200
    assert post(barber, f"/api/consultations/{cid}/complete", body, key).json() == response.json()
    assert remote.get(f"/api/consultations/{cid}").status_code == 404
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM consultations WHERE id=?", (cid,)).fetchone()
        assert row["status"] == row["stage"] == "completed" and row["phone_token_hash"] is None
        assert conn.execute("SELECT COUNT(*) FROM visits").fetchone()[0] == 1
        assert conn.execute("SELECT keep FROM media WHERE id=?", (mids[0],)).fetchone()[0] == 1
        assert conn.execute("SELECT id FROM media WHERE id=?", (mids[1],)).fetchone() is None
    assert (media.MEDIA_DIR / "photo.jpg").exists() and not (media.MEDIA_DIR / "audio.wav").exists()
    profile = barber.get('/api/customers/' + current['customer']['id']).json()
    assert profile["preferred"]["actual_notes"] == "trimmed sides"
    new = post(barber, "/api/consultations", {"customer_id": current["customer"]["id"], "from_visit_id": response.json()["visit_id"]}).json()
    assert new["state"]["keep"] == ["fringe"]
    assert new["state"]["observations"][0]["status"] == "unconfirmed"


def test_completion_requires_agreement_and_temporary_sessions_delete_photos(barber):
    cid = create(barber)["id"]
    body = {"actual_notes": "trim", "save_as_preferred": False, "keep_photos": False}
    assert post(barber, f"/api/consultations/{cid}/complete", body).status_code == 409
    current = agree(barber, agreement_stage(barber, cid), "customer").json()
    current = agree(barber, current, "barber").json()
    media.MEDIA_DIR.mkdir()
    (media.MEDIA_DIR / "temp.jpg").write_bytes(b"fixture")
    with db.connect() as conn:
        conn.execute("INSERT INTO media VALUES (?,?,?,?,?,?,?)", (str(uuid4()), cid, "photo", "front", "temp.jpg", 0, "now"))
    result = post(barber, f"/api/consultations/{cid}/complete", {**body, "keep_photos": True})
    assert result.status_code == 200 and result.json() == {"visit_id": None}
    assert not (media.MEDIA_DIR / "temp.jpg").exists()


def test_complete_transaction_rolls_back_on_database_failure(barber):
    current = create(barber, customer=True)
    cid = current["id"]
    current = agree(barber, agreement_stage(barber, cid), "customer").json()
    current = agree(barber, current, "barber").json()
    with db.connect() as conn:
        conn.execute("CREATE TRIGGER fail_preferred BEFORE UPDATE OF preferred_visit_id ON customers BEGIN SELECT RAISE(ABORT, 'fixture failure'); END")
    with pytest.raises(sqlite3.IntegrityError):
        post(barber, f"/api/consultations/{cid}/complete", {"actual_notes": "trim", "save_as_preferred": True, "keep_photos": False})
    with db.connect() as conn:
        assert conn.execute("SELECT COUNT(*) FROM visits").fetchone()[0] == 0
        assert conn.execute("SELECT status FROM consultations WHERE id=?", (cid,)).fetchone()[0] == "active"


def test_polling_selects_latest_active_job_and_scoped_photos(barber):
    cid = create(barber)["id"]
    old, latest, done, mid = (str(uuid4()) for _ in range(4))
    with db.connect() as conn:
        for jid, status in ((old, "running"), (latest, "queued"), (done, "done")):
            conn.execute("INSERT INTO jobs (id,consultation_id,type,requested_revision,status) VALUES (?,?,?,?,?)", (jid, cid, "observe", 0, status))
        conn.execute("INSERT INTO media VALUES (?,?,?,?,?,?,?)", (mid, cid, "photo", "side", "random.jpg", 0, "now"))
    current = barber.get(f"/api/consultations/{cid}").json()
    assert current["active_job"]["id"] == latest
    assert current["photos"] == [{"id": mid, "view": "side", "url": f"/api/media/{mid}"}]
    assert barber.get(f"/api/consultations/{cid}").json()["revision"] == 0


def test_edits_while_cutting_require_fresh_confirmation(barber):
    cid = create(barber)["id"]
    current = agree(barber, agreement_stage(barber, cid), "customer").json()
    current = agree(barber, current, "barber").json()
    current = contribution(barber, cid, current["revision"], kind="chip", speaker="customer", field="change", value="sides").json()
    assert current["stage"] == "agreement"
    assert post(barber, f"/api/consultations/{cid}/complete", {"actual_notes": "trim", "save_as_preferred": False, "keep_photos": False}).status_code == 409


def test_completion_blocks_plan_changed_by_job_after_confirmation(barber):
    cid = create(barber)["id"]
    current = agree(barber, agreement_stage(barber, cid), "customer").json()
    current = agree(barber, current, "barber").json()
    with db.connect() as conn:
        changed = current["state"]
        changed["keep"] = ["fringe"]
        conn.execute("UPDATE consultations SET state_json=?, revision=revision+1 WHERE id=?", (json.dumps(changed), cid))
    result = post(barber, f"/api/consultations/{cid}/complete", {"actual_notes": "trim", "save_as_preferred": False, "keep_photos": False})
    assert result.status_code == 409


def test_completion_cleanup_failure_can_be_retried(barber, monkeypatch):
    cid = create(barber)["id"]
    current = agree(barber, agreement_stage(barber, cid), "customer").json()
    agree(barber, current, "barber")
    media.MEDIA_DIR.mkdir()
    (media.MEDIA_DIR / "temp.jpg").write_bytes(b"fixture")
    mid = str(uuid4())
    with db.connect() as conn:
        conn.execute("INSERT INTO media VALUES (?,?,?,?,?,?,?)", (mid, cid, "photo", "front", "temp.jpg", 0, "now"))
    delete = media.delete_media
    def fail_once(_):
        raise PermissionError("fixture locked file")
    monkeypatch.setattr(media, "delete_media", fail_once)
    key = str(uuid4())
    body = {"actual_notes": "trim", "save_as_preferred": False, "keep_photos": False}
    response = post(barber, f"/api/consultations/{cid}/complete", body, key)
    assert response.status_code == 422 and response.json()["retryable"] is True
    with db.connect() as conn:
        assert conn.execute("SELECT id FROM media WHERE id=?", (mid,)).fetchone()
        assert conn.execute("SELECT status FROM consultations WHERE id=?", (cid,)).fetchone()[0] == "completed"
    monkeypatch.setattr(media, "delete_media", delete)
    assert post(barber, f"/api/consultations/{cid}/complete", body, key).status_code == 200
    assert not (media.MEDIA_DIR / "temp.jpg").exists()


def test_simultaneous_contributions_use_locked_revision(barber):
    from concurrent.futures import ThreadPoolExecutor
    cid = create(barber)["id"]
    def submit(_):
        return contribution(barber, cid, 0, kind="chip", speaker="customer", field="keep", value="fringe").status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(submit, range(2))) == [200, 409]
    assert barber.get(f"/api/consultations/{cid}").json()["revision"] == 1


def test_invalid_job_change_is_atomic(logic):
    before = state()
    result = {"reply": "", "next_question": None, "options": [], "uncertainties": [], "proposed_changes": [
        {"field": "keep", "op": "add", "value": "fringe", "negated": False},
        {"field": "revision", "op": "add", "value": "9", "negated": False}]}
    with pytest.raises(APIError):
        logic.merge_job_result(before, "propose", result)
    assert before == state()
