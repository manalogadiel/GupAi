"""v3: hair profile, interview agenda, opener, ranked catalog suggestions."""
import json

import pytest

from backend.app import ai, consult
from backend.app.conversation import brief_defaults, next_slot, validate_brief_updates

HAIR = {"density": "thin", "strand": "fine", "texture": "straight", "hairline": "normal", "cowlick": False, "uncertain": True}


def test_observe_merge_stores_hair_suggestion_and_keeps_barber_confirmation():
    state = consult.empty_state()
    state["hair_profile"] = {"suggested": None, "confirmed": {**HAIR, "density": "thick"}}
    out = consult.merge_job_result(state, "observe", {"observations": [], "hair": HAIR})
    assert out["hair_profile"]["suggested"] == HAIR
    assert out["hair_profile"]["confirmed"]["density"] == "thick"
    assert state["hair_profile"]["suggested"] is None


def test_barber_confirms_hair_profile_with_validated_values():
    state = {**consult.empty_state(), "revision": 0}
    body = {"kind": "hair_profile", "density": "thin", "strand": "fine", "texture": "wavy", "hairline": "receding"}
    out = consult.apply_contribution(state, body, 0)
    assert out["hair_profile"]["confirmed"] == {k: v for k, v in body.items() if k != "kind"}
    with pytest.raises(Exception):
        consult.apply_contribution(state, {**body, "texture": "bald"}, 0)


def test_problem_detail_is_a_quoted_customer_fact():
    turns = [{"id": "a", "speaker": "customer", "text": "Umaalsa yung gilid pag humaba, lalo sa umaga."}]
    ok = validate_brief_updates([{"field": "problem_detail", "value": "Umaalsa yung gilid pag humaba",
                                  "source_text": "Umaalsa yung gilid pag humaba"}], turns)
    assert ok[0]["value"] == "Umaalsa yung gilid pag humaba"
    assert validate_brief_updates([{"field": "problem_detail", "value": "balding", "source_text": "lalo sa umaga"}], turns) == []


def test_interview_asks_problem_then_occasion_then_cut_then_routine():
    from backend.app.conversation import interview_complete
    brief = brief_defaults()
    assert next_slot(brief, []) == "problem"
    assert next_slot(brief, ["puffy_sides"]) == "occasion"
    brief["occasion"] = "school"
    assert next_slot(brief, ["puffy_sides"]) == "desired_cut"
    brief["desired_cut"] = "low fade"
    assert next_slot(brief, ["puffy_sides"]) == "desired_impression"
    brief["desired_impression"] = ["malinis"]
    assert next_slot(brief, ["puffy_sides"]) == "keep_avoid"
    brief["preferences"] = "iwan ang bangs"
    assert next_slot(brief, ["puffy_sides"]) == "styling_minutes"
    assert not interview_complete(brief, ["puffy_sides"])
    brief["styling_minutes"] = 0
    assert next_slot(brief, ["puffy_sides"]) == "done" and interview_complete(brief, ["puffy_sides"])


def test_answers_are_captured_without_the_model():
    from backend.app.conversation import explicit_brief_updates
    def capture(text):
        return {u["field"]: u["value"] for u in explicit_brief_updates([{"id": "a", "speaker": "customer", "text": text}])}
    assert capture("Wala naman problema sa buhok ko.")["problem_detail"] == "wala"
    assert capture("Para sa trabaho.")["occasion"] == "trabaho"
    assert capture("May kasal ako sa Sabado.")["occasion"] == "kasal"
    assert "occasion" not in capture("Hindi para sa trabaho.")
    assert capture("Gusto ko ng two block tapos low fade.")["desired_cut"] == "two block, low fade"
    assert capture("Bahala ka na, Kuya.")["desired_cut"] == "bahala si Kuya Gup"
    assert capture("Hilamos lang ako.")["styling_minutes"] == 0


def test_complete_interview_closes_and_sends_to_the_scan(monkeypatch):
    state = {**consult.empty_state(), "stage": "goal", "problems": ["puffy_sides"]}
    state["brief"] = {**brief_defaults(), "occasion": "school", "desired_cut": "low fade", "desired_impression": ["malinis"], "preferences": "wala"}
    state["chat"] = [{"role": "customer", "text": "10 minuto lang ako mag-ayos."}]
    monkeypatch.setattr(ai, "stream_json", lambda *a, **k: {"reply": "Ayos! May iba pa?", "brief_updates": [], "proposed_changes": []})
    out = ai.chat_reply(state, ["10 minuto lang ako mag-ayos."], lambda t: None)
    assert out["reply"].endswith(ai.CLOSING) and "10 minuto" in out["reply"]


def test_named_cut_leads_the_suggestions():
    state = consult.empty_state()
    state["brief"] = {**brief_defaults(), "desired_cut": "burst fade"}
    assert ai.shortlist_parts(ai.load_parts()["sides"], state)[0]["id"] == "burst_fade"


def test_transcription_is_primed_with_barber_vocabulary(monkeypatch, tmp_path):
    from backend.app import stt
    seen = {}
    class Model:
        def transcribe(self, audio, **kw):
            seen.update(kw)
            class Info: language = "tl"
            return [type("S", (), {"text": " low fade sa gilid"})()], Info()
    monkeypatch.setattr(stt, "_load", lambda: Model())
    monkeypatch.setattr(stt, "_decode_audio", lambda path: [0.0])
    assert stt.transcribe(tmp_path / "x.wav")["text"] == "low fade sa gilid"
    assert "gilid" in seen["initial_prompt"] and seen["beam_size"] == 3


def test_opener_greets_and_asks_problem_without_a_model_call(monkeypatch):
    monkeypatch.setattr(ai, "stream_json", lambda *a, **k: pytest.fail("opener must not call the model"))
    pieces = []
    out = ai.chat_reply({**consult.empty_state(), "stage": "goal"}, [], pieces.append)
    assert "Kuya Gup" in out["reply"] and "?" in out["reply"]
    assert "".join(pieces) == out["reply"]
    assert out["brief_updates"] == [] and out["proposed_changes"] == []


@pytest.mark.parametrize("complete", [False, True])
def test_chat_publishes_only_the_final_agenda_checked_reply(monkeypatch, complete):
    state = {**consult.empty_state(), "stage": "goal", "problems": ["puffy_sides"]}
    text = "Para sa school."
    if complete:
        state["brief"] = {**brief_defaults(), "occasion": "school", "desired_cut": "low fade",
                          "desired_impression": ["malinis"], "preferences": "wala"}
        text = "10 minuto lang ako mag-ayos."
    state["chat"] = [{"role": "customer", "text": text}]
    pieces = []

    def model(system, user, schema, on_token):
        on_token("Ayos! ")
        on_token("May iba pa?")
        return {"reply": "Ayos! May iba pa?", "brief_updates": [], "proposed_changes": []}

    monkeypatch.setattr(ai, "stream_json", model)
    result = ai.chat_reply(state, [text], pieces.append)
    assert result["reply"] != "Ayos! May iba pa?"
    assert "".join(pieces) == result["reply"]
    assert all(result["reply"].startswith("".join(pieces[:i + 1])) for i in range(len(pieces)))


def test_ranking_uses_problem_face_and_hair_fit():
    state = consult.empty_state()
    state["problems"] = ["puffy_sides"]
    state["face_shape"] = {"suggested": ["oblong"], "confirmed": "oblong"}
    state["hair_profile"] = {"suggested": None, "confirmed": {**HAIR, "density": "thin"}}
    ranked = [o["id"] for o in ai.shortlist_parts(ai.load_parts()["sides"], state)]
    assert len(ranked) == ai.SHORTLIST
    # oblong + thin hair: gentle sides that still fix puffiness beat a high fade
    assert ranked.index("scissor_over_comb") < ranked.index("high_fade") if "high_fade" in ranked else True
    assert ranked[0] in ("scissor_over_comb", "taper")


def test_suggest_returns_reasons_desc_and_considers_new_turns(monkeypatch):
    state = consult.empty_state()
    state["problems"] = ["puffy_sides"]
    state["face_shape"] = {"suggested": ["round"], "confirmed": "round"}
    state["hair_profile"] = {"suggested": None, "confirmed": {**HAIR, "density": "thick"}}
    state["brief"] = {**brief_defaults(), "occasion": "school"}
    state["chat"] = [{"role": "customer", "text": "Ayoko ng sobrang kita ang anit."}]
    seen = []

    def fake(system, user, schema, **kwargs):
        seen.append(json.loads(user))
        return {"choices": [{"id": "low_fade", "evidence_index": 0, "factor": "occasion"}]}
    monkeypatch.setattr(ai, "chat", fake)
    out = ai.suggest(state, "sides")
    option = out["options"][0]
    assert option["desc"] and option["id"] == "low_fade"
    labels = " ".join(r["label"] for r in option["reasons"])
    assert "Problema" in labels and "Mukha" in labels and "Buhok" in labels
    assert seen[0]["hair"]["density"] == "thick"
    assert "Ayoko ng sobrang kita ang anit." in seen[0]["recent_customer_words"]


def test_parts_catalog_endpoint_lists_every_cut_for_the_full_list():
    from fastapi.testclient import TestClient
    from backend.app import main
    with TestClient(main.app, base_url="https://localhost:8443", client=("192.168.1.9", 1)) as phone:
        body = phone.get("/api/parts").json()
    assert [o["id"] for o in body["sides"]] == [o["id"] for o in ai.load_parts()["sides"]]
    assert set(body["top"][0]) == {"id", "name", "desc", "maintenance", "pros", "cons"}


def test_any_catalog_cut_can_be_chosen_from_the_full_list():
    state = {**consult.empty_state(), "revision": 0}
    out = consult.apply_contribution(state, {"kind": "choose_part", "part": "top", "option_id": "two_block"}, 0)
    assert out["top"]["choice"] == {"id": "two_block", "custom": None}
    with pytest.raises(Exception):
        consult.apply_contribution(state, {"kind": "choose_part", "part": "top", "option_id": "low_fade"}, 0)


def _state_after_problem():
    state = {**consult.empty_state(), "stage": "goal", "problems": ["puffy_sides"]}
    state["chat"] = [{"role": "ai", "text": "Ano ang problema mo?"}, {"role": "customer", "text": "Umaalsa ang gilid."},
                     {"role": "ai", "text": "Low taper ang solusyon. Para saan ang gupit na ito: school, work, o may okasyon?"},
                     {"role": "customer", "text": "Para sa school, gusto ko malinis tingnan. 5 minutes lang ako mag-ayos."}]
    return state


def test_repeated_reply_and_answered_question_are_replaced(monkeypatch):
    state = _state_after_problem()
    seen = []
    def fake(system, user, schema, on_token):
        seen.append(json.loads(user))
        return {"reply": state["chat"][2]["text"], "brief_updates": [], "proposed_changes": []}
    monkeypatch.setattr(ai, "stream_json", fake)
    out = ai.chat_reply(state, [state["chat"][3]["text"]], lambda t: None)
    assert out["reply"] != state["chat"][2]["text"] and "Para saan" not in out["reply"]
    assert out["reply"].endswith(ai.SLOT_QUESTIONS["desired_cut"])
    # earlier Kuya Gup replies are not handed back to the model to copy
    assert all(t.get("role") != "ai" for t in seen[0]["history"])


def test_tingnan_phrase_is_the_desired_impression():
    from backend.app.conversation import explicit_brief_updates
    values = {u["field"]: u["value"] for u in explicit_brief_updates(
        [{"id": "a", "speaker": "customer", "text": "Para sa school, gusto ko malinis tingnan."}])}
    assert values["desired_impression"] == ["malinis"]


def test_ayoko_phrase_becomes_an_avoid_even_if_the_model_misses_it(monkeypatch):
    monkeypatch.setattr(ai, "stream_json", lambda *a, **k: {"reply": "Sige. Anong dating ang gusto mo?", "brief_updates": [], "proposed_changes": []})
    out = ai.chat_reply({**consult.empty_state(), "stage": "goal"}, ["Ayoko ng sobrang kita ang anit."], lambda t: None)
    assert {"field": "avoid", "op": "add", "value": "sobrang kita ang anit", "negated": False} in out["proposed_changes"]
    out = ai.chat_reply({**consult.empty_state(), "stage": "goal"}, ["Hindi ayoko, okay lang."], lambda t: None)
    assert not [c for c in out["proposed_changes"] if c["field"] == "avoid"]


def test_off_agenda_question_is_replaced_but_the_acknowledgement_stays(monkeypatch):
    state = {**consult.empty_state(), "stage": "goal", "problems": ["puffy_sides"],
             "chat": [{"role": "customer", "text": "Para sa school."}]}
    monkeypatch.setattr(ai, "stream_json", lambda *a, **k: {
        "reply": "Okay lang sa school. Ang puffy sides yung issue? Kailan 'yan nangyayari?", "brief_updates": [], "proposed_changes": []})
    out = ai.chat_reply(state, ["Para sa school."], lambda t: None)
    assert out["reply"] == "Okay lang sa school. " + ai.SLOT_QUESTIONS["desired_cut"]


def test_a_wanted_cut_is_not_misfiled_as_keep(monkeypatch):
    state = {**consult.empty_state(), "stage": "goal", "problems": ["puffy_sides"],
             "chat": [{"role": "customer", "text": "Gusto ko ng low fade."}]}
    state["brief"] = {**brief_defaults(), "occasion": "school"}
    monkeypatch.setattr(ai, "stream_json", lambda *a, **k: {"reply": "Ayos.", "brief_updates": [],
        "proposed_changes": [{"field": "keep", "op": "add", "value": "low fade", "negated": False}]})
    out = ai.chat_reply(state, ["Gusto ko ng low fade."], lambda t: None)
    assert out["proposed_changes"] == [] and out["brief_updates"][0]["value"] == "low fade"


SCREENSHOT = ["hindi ko alam kung pano aayusin dahil maganda pag bagong gupit pero pag pinapahaba ay napangit",
              "ang problema ko ay pag nahaba ay napangit", "Hirap akong i-style ang buhok ko."]


@pytest.mark.parametrize("text", SCREENSHOT + ["May puyo ako na ayaw sumunod.", "Mabilis humaba ang buhok ko.",
                                               "Gusto kong matakpan nang kaunti ang noo ko."])
def test_real_problem_answers_are_recognised(text):
    assert ai.detect_problems([text])


def _turn(state, text, reply, monkeypatch):
    monkeypatch.setattr(ai, "stream_json", lambda *a, **k: {"reply": reply, "brief_updates": [], "proposed_changes": []})
    state["chat"].append({"role": "customer", "text": text})
    out = ai.chat_reply(state, [text], lambda t: None)
    merged = consult.merge_job_result({**state, "revision": 0}, "chat", out)
    merged.pop("revision")
    return merged, out["reply"]


def test_screenshot_conversation_moves_on_after_the_first_answer(monkeypatch):
    state = {**consult.empty_state(), "stage": "goal", "chat": [{"role": "ai", "text": ai.OPENERS["goal"]}]}
    state, reply = _turn(state, SCREENSHOT[0], "Hindi ko alam kung ano ang problema. Ano ang problema?", monkeypatch)
    assert "hindi ko alam" not in reply.lower()
    assert reply.endswith(ai.SLOT_QUESTIONS["occasion"]) and ai.SLOT_QUESTIONS["problem"] not in reply


def test_free_text_answers_fill_the_slot_that_was_asked(monkeypatch):
    state = {**consult.empty_state(), "stage": "goal", "chat": [{"role": "ai", "text": ai.OPENERS["goal"]}]}
    state, reply = _turn(state, "parang buhaghag lagi pag gising", "Sige.", monkeypatch)
    assert state["brief"]["problem_detail"] == "parang buhaghag lagi pag gising"
    state, reply = _turn(state, "para sa reunion namin", "Ayos.", monkeypatch)
    assert state["brief"]["occasion"] == "para sa reunion namin"
    state, reply = _turn(state, "yung parang kay idol sa basketball", "Ayos.", monkeypatch)
    assert state["brief"]["desired_cut"] == "yung parang kay idol sa basketball"
    state, reply = _turn(state, "yung mukhang fresh at malinis", "Ayos.", monkeypatch)
    assert state["brief"]["desired_impression"] == ["yung mukhang fresh at malinis"]
    state, reply = _turn(state, "wala naman", "Ayos.", monkeypatch)
    assert state["brief"]["preferences"] == "wala"
    state, reply = _turn(state, "mabilisan lang tuwing umaga", "Ayos.", monkeypatch)
    assert state["brief"]["maintenance_preference"] == "mabilisan lang tuwing umaga"
    assert reply.endswith(ai.CLOSING)


def test_v2_database_upgrades_to_left_and_right_photo_views(tmp_path):
    import sqlite3
    from backend.app import db
    path = tmp_path / "v2.db"
    db.initialize(path)
    with db.connect(path) as conn:  # rebuild media as v2 had it, with one existing photo
        conn.execute("PRAGMA foreign_keys=OFF")
        conn.execute("INSERT INTO consultations (id,status,stage,state_json,started_at) VALUES ('c','active','photos','{}','now')")
        conn.execute("DROP TABLE media")
        conn.execute("CREATE TABLE media (id TEXT PRIMARY KEY, consultation_id TEXT NOT NULL REFERENCES consultations(id), "
                     "kind TEXT NOT NULL CHECK (kind IN ('photo','audio')), view TEXT CHECK (view IN ('front','side')), "
                     "storage_key TEXT NOT NULL UNIQUE, keep INTEGER NOT NULL DEFAULT 0 CHECK (keep IN (0,1)), created_at TEXT NOT NULL)")
        conn.execute("INSERT INTO media VALUES ('m','c','photo','side','k.jpg',0,'now')")
        conn.execute("PRAGMA user_version=2")
    db.initialize(path)
    with db.connect(path) as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 4
        assert conn.execute("SELECT view FROM media WHERE id='m'").fetchone()[0] == "side"
        conn.execute("INSERT INTO media VALUES ('l','c','photo','left','l.jpg',0,'now')")
        conn.execute("INSERT INTO media VALUES ('r','c','photo','reference','r.jpg',0,'now')")
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute("INSERT INTO media VALUES ('x','c','photo','top','x.jpg',0,'now')")


def test_stt_checks_the_configured_model(monkeypatch):
    from backend.app import stt
    seen = []
    import huggingface_hub
    monkeypatch.setattr(huggingface_hub, "snapshot_download", lambda repo, **k: seen.append(repo) or (_ for _ in ()).throw(OSError()))
    assert stt.available() is False
    assert any("turbo" in r for r in seen)


def test_filler_is_not_an_answer_and_the_question_is_reasked(monkeypatch):
    state = {**consult.empty_state(), "stage": "goal", "chat": [{"role": "ai", "text": ai.OPENERS["goal"]}]}
    state, reply = _turn(state, "yun na nga ang problema", "Sige.", monkeypatch)
    assert not state["brief"].get("problem_detail")
    assert reply.endswith("Para sigurado ako, " + ai.SLOT_QUESTIONS["problem"][0].lower() + ai.SLOT_QUESTIONS["problem"][1:])


def test_model_cannot_fill_an_agenda_slot_that_was_not_asked(monkeypatch):
    state = {**consult.empty_state(), "stage": "goal", "problems": ["puffy_sides"],
             "chat": [{"role": "customer", "text": "Para sa school, gusto ko medyo mahaba."}]}
    monkeypatch.setattr(ai, "stream_json", lambda *a, **k: {"reply": "Ayos.", "proposed_changes": [], "brief_updates": [
        {"field": "maintenance_preference", "value": "medyo mahaba", "source_text": "medyo mahaba"}]})
    out = ai.chat_reply(state, ["Para sa school, gusto ko medyo mahaba."], lambda t: None)
    fields = {u["field"] for u in out["brief_updates"]}
    assert "occasion" in fields and "maintenance_preference" not in fields


def test_keeps_must_name_a_hair_region(monkeypatch):
    state = {**consult.empty_state(), "stage": "goal", "chat": [{"role": "customer", "text": "Huwag galawin ang bangs, school look."}]}
    monkeypatch.setattr(ai, "stream_json", lambda *a, **k: {"reply": "Ayos.", "brief_updates": [], "proposed_changes": [
        {"field": "keep", "op": "add", "value": "school look", "negated": False},
        {"field": "keep", "op": "add", "value": "bangs", "negated": False}]})
    out = ai.chat_reply(state, ["Huwag galawin ang bangs, school look."], lambda t: None)
    assert [c["value"] for c in out["proposed_changes"] if c["field"] == "keep"] == ["bangs"]


def test_a_queued_chat_is_reused_instead_of_stacking_replies(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient
    from uuid import uuid4
    from backend.app import db, jobs, main
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "t.db")
    monkeypatch.setattr(jobs, "_ensure_worker", lambda: None)
    hdr = lambda: {"Origin": "https://localhost:8443", "Idempotency-Key": str(uuid4())}
    with TestClient(main.app, base_url="https://localhost:8443", client=("127.0.0.1", 1)) as client:
        c = client.post("/api/consultations", json={}, headers=hdr()).json()
        first = client.post(f"/api/consultations/{c['id']}/jobs", json={"type": "chat", "expected_revision": 0}, headers=hdr()).json()
        second = client.post(f"/api/consultations/{c['id']}/jobs", json={"type": "chat", "expected_revision": 0}, headers=hdr()).json()
    assert first["id"] == second["id"]


def test_reference_photo_names_the_cut_and_moves_the_interview_on(monkeypatch):
    state = {**consult.empty_state(), "stage": "goal", "problems": ["puffy_sides"]}
    state["brief"] = {**brief_defaults(), "occasion": "school"}
    monkeypatch.setattr(ai, "chat", lambda *a, **k: {"sides": "low_fade", "top": "textured_crop", "summary": "Malinis na gilid, may texture sa taas."})
    monkeypatch.setattr(ai, "image_b64", lambda path: "x")
    out = ai.describe_reference("ref.jpg", state)
    assert out["desired_cut"] == "Low fade + Textured crop"
    assert "Low fade + Textured crop" in out["reply"] and out["reply"].endswith(ai.SLOT_QUESTIONS["desired_impression"])
    merged = consult.merge_job_result({**state, "revision": 0}, "observe", {**out, "observations": []}, media_id="m1")
    assert merged["brief"]["desired_cut"] == "Low fade + Textured crop"
    assert merged["chat"][-2] == {"role": "customer", "text": "Reference photo", "media_id": "m1"}
    assert merged["chat"][-1]["role"] == "ai"


def test_unclear_reference_still_fills_the_slot(monkeypatch):
    state = {**consult.empty_state(), "stage": "goal", "problems": ["puffy_sides"]}
    monkeypatch.setattr(ai, "chat", lambda *a, **k: {"sides": "unclear", "top": "unclear", "summary": "Hindi malinaw ang buhok sa larawan."})
    monkeypatch.setattr(ai, "image_b64", lambda path: "x")
    out = ai.describe_reference("ref.jpg", state)
    assert out["desired_cut"] == "ayon sa reference photo"


def test_keep_and_avoid_answer_fills_the_lists_and_the_slot(monkeypatch):
    state = {**consult.empty_state(), "stage": "goal", "problems": ["puffy_sides"], "chat": []}
    state["brief"] = {**brief_defaults(), "occasion": "school", "desired_cut": "low fade", "desired_impression": ["malinis"]}
    state, reply = _turn(state, "Iwan mo yung bangs, ayoko ng kita ang anit.", "Sige.", monkeypatch)
    assert "fringe" in state["keep"] and "kita ang anit" in state["avoid"]
    assert state["brief"]["preferences"] and reply.endswith(ai.SLOT_QUESTIONS["styling_minutes"])


def test_ack_has_clean_punctuation_and_problems_are_not_avoids(monkeypatch):
    assert ai._ack([{"field": "preferences", "value": "Iwan mo yung bangs."}]) == "Noted: “Iwan mo yung bangs”."
    state = {**consult.empty_state(), "stage": "goal", "chat": [{"role": "customer", "text": "Umaalsa yung gilid ko."}]}
    monkeypatch.setattr(ai, "stream_json", lambda *a, **k: {"reply": "Gets.", "brief_updates": [], "proposed_changes": [
        {"field": "avoid", "op": "add", "value": "puffy sides", "negated": False}]})
    out = ai.chat_reply(state, ["Umaalsa yung gilid ko."], lambda t: None)
    assert out["proposed_changes"] == [] and out["problems_detected"] == ["puffy_sides"]


def test_an_echo_of_the_customer_is_not_an_acknowledgement(monkeypatch):
    state = {**consult.empty_state(), "stage": "goal", "problems": ["puffy_sides"], "chat": []}
    state["brief"] = {**brief_defaults(), "occasion": "school", "desired_cut": "low fade", "desired_impression": ["malinis"]}
    state, reply = _turn(state, "Iwan mo yung bangs, ayoko ng kita ang anit.", "At ayoko ng kita ang anit sa dulo.", monkeypatch)
    assert "At ayoko" not in reply and reply.startswith("Noted:")


@pytest.mark.parametrize("text,minutes", [("Mga limang minuto lang ako mag ayos.", 5), ("sampung minuto", 10),
                                          ("Labing-limang minuto siguro", 15), ("kalahating oras", 30), ("dalawang minuto", 2)])
def test_spoken_number_words_become_minutes(text, minutes):
    from backend.app.conversation import explicit_brief_updates
    values = {u["field"]: u["value"] for u in explicit_brief_updates([{"id": "a", "speaker": "customer", "text": text}])}
    assert values["styling_minutes"] == minutes


def test_model_keeps_need_the_customer_to_name_that_area(monkeypatch):
    state = {**consult.empty_state(), "stage": "goal", "chat": [{"role": "customer", "text": "Gusto ko malinis tingnan."}]}
    monkeypatch.setattr(ai, "stream_json", lambda *a, **k: {"reply": "Ayos.", "brief_updates": [], "proposed_changes": [
        {"field": "keep", "op": "add", "value": "clean sides", "negated": False}]})
    out = ai.chat_reply(state, ["Gusto ko malinis tingnan."], lambda t: None)
    assert out["proposed_changes"] == []  # a hallucinated keep would block every sides cut


def test_rule_based_keep_wins_over_the_models_raw_phrase(monkeypatch):
    state = {**consult.empty_state(), "stage": "goal", "chat": [{"role": "customer", "text": "Iwan mo yung bangs."}]}
    monkeypatch.setattr(ai, "stream_json", lambda *a, **k: {"reply": "Ayos.", "brief_updates": [], "proposed_changes": [
        {"field": "keep", "op": "add", "value": "Iwan mo yung bangs", "negated": False}]})
    out = ai.chat_reply(state, ["Iwan mo yung bangs."], lambda t: None)
    assert [c["value"] for c in out["proposed_changes"]] == ["fringe"]


def test_minutes_answer_is_acknowledged_once(monkeypatch):
    state = {**consult.empty_state(), "stage": "goal", "problems": ["puffy_sides"], "chat": []}
    state["brief"] = {**brief_defaults(), "occasion": "school", "desired_cut": "low fade", "desired_impression": ["malinis"], "preferences": "wala"}
    monkeypatch.setattr(ai, "stream_json", lambda *a, **k: {"reply": "Ayos.", "proposed_changes": [], "brief_updates": [
        {"field": "maintenance_preference", "value": "Limang minuto lang", "source_text": "Limang minuto lang"}]})
    state["chat"].append({"role": "customer", "text": "Limang minuto lang ako."})
    out = ai.chat_reply(state, ["Limang minuto lang ako."], lambda t: None)
    assert out["reply"].startswith("Noted: 5 minuto sa pag-aayos.")
