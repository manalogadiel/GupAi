"""C6: local AI output validation and job staleness, with Ollama mocked."""
import json

from backend.app import ai, consult, db, jobs
from backend.app.consultations import empty_state


def state(**kw):
    return {**empty_state(), "revision": 3, **kw}


def test_build_options_rejects_invented_and_duplicate_ids():
    catalog, sources = ai.load_catalog()
    raw = [{"catalog_id": "mullet_deluxe", "why": "x"}, {"catalog_id": "side_part", "why": "fits"},
           {"catalog_id": "side_part", "why": "dup"}]
    options = ai.build_options(raw, catalog, sources, None, 3)
    assert [o["catalog_id"] for o in options] == ["side_part"]
    assert options[0]["name"] == "Side part" and options[0]["image"].endswith("side_part.svg")
    assert options[0]["id"] == "side_part-r3"


def test_face_shape_note_and_sources_come_from_catalog_not_model():
    catalog, sources = ai.load_catalog()
    options = ai.build_options([{"catalog_id": "short_quiff", "why": "lift"}], catalog, sources, "round", 1)
    assert options[0]["face_shape_note"] and "commonly suggested" in options[0]["face_shape_note"].lower()
    assert options[0]["source_ids"] and all(s in sources for s in options[0]["source_ids"])


def test_every_schema_string_and_array_is_bounded():
    def walk(node):
        if node.get("type") == "string":
            assert "enum" in node or "maxLength" in node, node
        if node.get("type") == "array":
            assert "maxItems" in node, node
            walk(node["items"])
        for child in node.get("properties", {}).values():
            walk(child)
    for schema in (ai.OBSERVE_SCHEMA, ai.EXTRACT_SCHEMA, ai._propose_schema(["side_part"])):
        walk(schema)


def test_negated_fringe_removes_fringe_cutting_styles_before_choosing(monkeypatch):
    seen = {}

    def fake_chat(system, user, schema, images=None, temperature=None):
        if "proposed_changes" in schema["properties"]:
            return {"goal": "Ayusin ang gilid", "proposed_changes": [
                {"field": "keep", "op": "add", "value": "fringe", "negated": False}]}
        seen["ids"] = schema["properties"]["options"]["items"]["properties"]["catalog_id"]["enum"]
        return {"reply": "Dalawang option.", "next_question": "", "uncertainties": [],
                "options": [{"catalog_id": i, "why": "w"}
                            for i in seen["ids"][:2]]}

    monkeypatch.setattr(ai, "chat", fake_chat)
    out = ai.propose(state(), ["Huwag galawin ang fringe"])
    catalog, _ = ai.load_catalog()
    cuts_fringe = {c["id"] for c in catalog if "fringe" in c["changes"]}
    assert seen["ids"] and not (set(seen["ids"]) & cuts_fringe)
    assert {o["catalog_id"] for o in out["options"]} <= set(seen["ids"])
    merged = consult.merge_job_result(state(), "propose", out)
    assert any("fringe" in k for k in merged["keep"])


def test_invalid_model_json_falls_back_to_a_clarifying_question(monkeypatch):
    def broken(system, user, schema, images=None, temperature=None):
        raise ValueError("bad json")

    monkeypatch.setattr(ai, "chat", broken)
    out = ai.propose(state(), [])
    assert out["options"] == [] and out["reply"]


def _seed(tmp_path, monkeypatch, revision, requested):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "g.db")
    db.initialize()
    with db.connect() as conn:
        conn.execute("INSERT INTO consultations (id, status, stage, revision, state_json, started_at) VALUES "
                     "('c1','active','options',?,?, 'now')", (revision, json.dumps(empty_state())))
        conn.execute("INSERT INTO jobs (id, consultation_id, type, requested_revision, status) VALUES ('j1','c1','propose',?,'queued')",
                     (requested,))


def test_stale_job_result_is_not_merged(tmp_path, monkeypatch):
    _seed(tmp_path, monkeypatch, revision=5, requested=4)
    monkeypatch.setattr(jobs, "_run", lambda job, snap: {"proposed_changes": [], "reply": "late", "next_question": None,
                                                         "options": [], "uncertainties": []})
    jobs._process("j1")
    with db.connect() as conn:
        assert conn.execute("SELECT status FROM jobs WHERE id='j1'").fetchone()["status"] == "stale"
        row = conn.execute("SELECT revision, state_json FROM consultations WHERE id='c1'").fetchone()
    assert row["revision"] == 5 and json.loads(row["state_json"])["reply"] is None


def test_done_job_merges_and_bumps_revision(tmp_path, monkeypatch):
    _seed(tmp_path, monkeypatch, revision=2, requested=2)
    monkeypatch.setattr(jobs, "_run", lambda job, snap: {"proposed_changes": [], "reply": "Heto", "next_question": None,
                                                         "options": [], "uncertainties": [], "goal": "Malinis na gilid"})
    jobs._process("j1")
    with db.connect() as conn:
        row = conn.execute("SELECT revision, state_json FROM consultations WHERE id='c1'").fetchone()
    assert row["revision"] == 3
    saved = json.loads(row["state_json"])
    assert saved["reply"] == "Heto" and saved["goal"] == "Malinis na gilid"


def test_model_failure_marks_job_failed_and_keeps_state(tmp_path, monkeypatch):
    _seed(tmp_path, monkeypatch, revision=2, requested=2)

    def down(job, snap):
        raise ai.APIError("model_unavailable", "Ollama down", retryable=True)

    monkeypatch.setattr(jobs, "_run", down)
    jobs._process("j1")
    with db.connect() as conn:
        job = conn.execute("SELECT * FROM jobs WHERE id='j1'").fetchone()
        row = conn.execute("SELECT revision FROM consultations WHERE id='c1'").fetchone()
    assert job["status"] == "failed" and job["error_code"] == "model_unavailable" and row["revision"] == 2


def test_negation_rule_protects_part_even_if_model_misreads(monkeypatch):
    monkeypatch.setattr(ai, "chat", lambda *a, **k: {"goal": "g", "proposed_changes": [
        {"field": "change", "op": "add", "value": "mas maikli ang fringe", "negated": False}]})
    out = ai.extract(["Gusto ko maikli sa gilid pero huwag galawin ang fringe"])
    assert {"field": "keep", "op": "add", "value": "fringe", "negated": True} in out["proposed_changes"]
    assert not any(c["field"] == "change" and "fringe" in c["value"] for c in out["proposed_changes"])
    assert [k["value"] for k in ai._negated_keeps(["wag mo gupitin yung bangs", "ayoko ng mahaba"])] == ["bangs"]
