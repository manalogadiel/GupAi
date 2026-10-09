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
    state["brief"] = {**brief_defaults(), "occasion": "school", "desired_cut": "low fade"}
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
    state, reply = _turn(state, "mabilisan lang tuwing umaga", "Ayos.", monkeypatch)
    assert state["brief"]["maintenance_preference"] == "mabilisan lang tuwing umaga"
    assert reply.endswith(ai.CLOSING)
