"""Pure consultation helpers; complete_visit uses the caller's SQLite transaction.

Revision contract for C6: inject the consultations.revision into state before
calling merge_job_result. Observe/faceshape/propose each return revision + 1;
transcribe returns an unchanged copy (the reviewed text is a later contribution).
The worker must check requested_revision against the locked row BEFORE merging,
and atomically persist BOTH state_json and the returned revision. These helpers
perform no I/O, timestamps or random generation. The application owns the stage.
"""
import json
import re
from copy import deepcopy
from typing import Annotated, Literal
from uuid import NAMESPACE_URL, uuid4, uuid5

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, ValidationError

from .errors import APIError
from .conversation import brief_defaults, merge_brief

REGIONS = ("top", "sides", "back", "fringe", "crown", "general")
SHAPES = ("oval", "round", "square", "oblong", "heart", "diamond")
STAGES = ("photos", "goal", "reveal", "sides", "top", "summary", "cutting", "done")
PROBLEMS = ("puffy_sides", "cowlick", "hard_to_style", "grows_fast", "flat_top", "wide_forehead")
Text = Annotated[str, Field(min_length=1, max_length=4000)]
Speaker = Literal["customer", "barber"]
Region = Literal["top", "sides", "back", "fringe", "crown", "general"]
Shape = Literal["oval", "round", "square", "oblong", "heart", "diamond"]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class TextInput(Input):
    kind: Literal["text"]
    speaker: Speaker
    text: Text
    input_type: Literal["typed", "voice"]


class ChipInput(Input):
    kind: Literal["chip"]
    speaker: Speaker
    field: Literal["keep", "change", "avoid", "styling_effort", "goal"]
    value: Text
    remove: bool = False


class ObservationInput(Input):
    kind: Literal["observation"]
    observation_id: Text
    status: Literal["confirmed", "rejected"]
    text: Text | None = None


class ObservationAddInput(Input):
    kind: Literal["observation_add"]
    text: Text
    region: Region


class FaceInput(Input):
    kind: Literal["face_shape"]
    confirmed: Shape


class SelectInput(Input):
    kind: Literal["select_option"]
    option_id: Text


class ResolveInput(Input):
    kind: Literal["resolve_conflict"]
    conflict_id: Text
    keep: Literal["first", "second"]


class StageInput(Input):
    kind: Literal["stage"]
    stage: Literal["photos", "goal", "reveal", "sides", "top", "summary", "cutting", "done", "abandoned"]


class ProblemInput(Input):
    kind: Literal["problem"]
    id: Literal["puffy_sides", "cowlick", "hard_to_style", "grows_fast", "flat_top", "wide_forehead"]
    remove: bool = False


class RevealInput(Input):
    kind: Literal["reveal"]


class PickInput(Input):
    kind: Literal["pick_style"]
    catalog_id: Text


class PartInput(Input):
    kind: Literal["choose_part"]
    part: Literal["sides", "top"]
    option_id: Text | None = None
    custom: Annotated[str, Field(min_length=1, max_length=120)] | None = None


class RatingContribution(Input):
    kind: Literal["rating"]
    score: Annotated[int, Field(ge=1, le=5)]
    tags: Annotated[list[Annotated[str, Field(min_length=1, max_length=40)]], Field(max_length=5)]


CONTRIBUTION = TypeAdapter(Annotated[TextInput | ChipInput | ObservationInput |
    ObservationAddInput | FaceInput | SelectInput | ResolveInput | StageInput |
    ProblemInput | RevealInput | PickInput | PartInput | RatingContribution,
    Field(discriminator="kind")])


class ProposedChange(Input):
    field: Literal["keep", "change", "avoid"]
    op: Literal["add", "remove"]
    value: Text
    negated: bool


def _invalid(message="Check the contribution fields."):
    raise APIError("invalid_input", message)


def validate_contribution(contribution):
    try:
        value = CONTRIBUTION.validate_python(contribution).model_dump(exclude_none=True)
    except ValidationError:
        _invalid()
    if any(isinstance(value.get(key), str) and not value[key].strip() for key in ("text", "value", "custom")):
        _invalid()
    if value["kind"] == "choose_part" and (("option_id" in value) == ("custom" in value)):
        _invalid("Choose exactly one option or custom description.")
    return value


def empty_state():
    return {"goal": "", "keep": [], "change": [], "avoid": [], "styling_effort": None,
            "observations": [], "face_shape": None, "options": [], "selected_option_id": None,
            "conflicts": [], "reply": None, "next_question": None, "uncertainties": [],
            "problems": [], "chat": [], "revealed": False, "recommendations": None, "selected_style": None,
            "sides": {"options": [], "recommended_id": None, "intro": None, "choice": None},
            "top": {"options": [], "recommended_id": None, "intro": None, "choice": None},
            "checkpoints": {"sides": None, "top": None}, "rating": None, "brief": brief_defaults()}


def require_summary(state):
    missing = [name for name, value in (("sides", state["sides"].get("choice")), ("top", state["top"].get("choice"))) if not value]
    if missing:
        raise APIError("conflict_unresolved", "Piliin muna ang " + ", ".join(missing) + " bago ang summary.")


def check_revision(state, expected_revision):
    revision = state.get("revision", 0)
    if type(expected_revision) is not int or expected_revision < 0:
        _invalid("A nonnegative expected_revision is required.")
    if expected_revision != revision:
        raise APIError("revision_conflict", "Consultation changed. Refresh and try again.", retryable=True, revision=revision)


def _id(value):
    return str(uuid5(NAMESPACE_URL, json.dumps(value, sort_keys=True, ensure_ascii=False)))


def _regions(value):
    # shortcut: explicit English/Taglish region words only; expand with a reviewed
    # vocabulary if the catalog or customer chips gain more anatomical regions.
    words = set(re.findall(r"[a-z]+", value.casefold()))
    aliases = {"side": "sides", "bangs": "fringe", "bang": "fringe", "gilid": "sides", "likod": "back",
               "batok": "back", "ibabaw": "top", "taas": "top", "tuktok": "crown", "noo": "fringe"}
    words.update(aliases[word] for word in list(words) if word in aliases)
    return words.intersection(REGIONS) or {value.strip().casefold()}


def _conflict_pairs(state):
    pairs = []
    # first/second follows Keep, Change, Avoid order, independently of write order.
    for left, right in (("keep", "change"), ("keep", "avoid"), ("change", "avoid")):
        for first in state[left]:
            for second in state[right]:
                if _regions(first) & _regions(second):
                    refs = ((left, first), (right, second))
                    pairs.append(({"id": _id(refs), "text": f"{left}: {first}; {right}: {second}"}, refs))
    return pairs


def _conflicts(state):
    state["conflicts"] = [conflict for conflict, _ in _conflict_pairs(state)]


def _edit_list(state, field, op, value):
    if op == "add" and value not in state[field]:
        state[field].append(value)
    elif op == "remove":
        state[field] = [item for item in state[field] if item != value]


def _invalidate_options(state):
    state["options"] = []
    state["selected_option_id"] = None
    # The reply described the old options; leaving it would point at cards that are gone.
    state["reply"] = None
    state["next_question"] = None
    state["recommendations"] = None
    state["selected_style"] = None
    for part in ("sides", "top"):
        # Keep a customer's explicit custom description; suggestions are derived data.
        choice = state[part].get("choice")
        state[part] = {"options": [], "recommended_id": None, "intro": None,
                       "choice": choice if choice and choice.get("custom") else None}


def apply_contribution(state, c, expected_revision):
    """Return a copy with exactly one revision bump; text is never parsed here.

    Routes supply stage as transient metadata. A stage chip moves one step and
    cannot bypass agreement confirmation or visit completion.
    """
    check_revision(state, expected_revision)
    c = validate_contribution(c)
    out = deepcopy(state)
    kind = c["kind"]
    if out.get("stage") in ("cutting", "done") and kind not in ("stage", "rating"):
        raise APIError("conflict_unresolved", "Nagsimula na ang gupit. Nakapirmi na ang napagkasunduang plano.")
    if kind == "rating":
        if out.get("stage") != "done":
            _invalid("I-rate pagkatapos matapos ang gupit.")
        out["rating"] = {"score": c["score"], "tags": list(dict.fromkeys(c["tags"]))}
    elif kind == "text":
        out["chat"] = (out["chat"] + [{"role": c["speaker"], "text": c["text"]}])[-12:]
    elif kind == "problem":
        _edit_list(out, "problems", "remove" if c["remove"] else "add", c["id"])
    elif kind == "reveal":
        if out.get("stage") != "reveal":
            _invalid("Open the reveal step first.")
        out["revealed"] = True
    elif kind == "pick_style":
        rec = out.get("recommendations")
        if not rec or c["catalog_id"] not in [p["catalog_id"] for p in [rec["top_pick"], *rec["alternatives"]]]:
            _invalid("Pick a recommended style.")
        out["selected_style"] = c["catalog_id"]
    elif kind == "choose_part":
        part = out[c["part"]]
        if "option_id" in c and not any(o["id"] == c["option_id"] for o in part["options"]):
            _invalid("Pick an available part option.")
        part["choice"] = {"id": c.get("option_id"), "custom": c.get("custom")}
    elif kind == "chip":
        field, value = c["field"], c["value"]
        if field in ("keep", "change", "avoid"):
            _edit_list(out, field, "remove" if c["remove"] else "add", value)
        elif field == "styling_effort":
            if value not in ("low", "medium", "high"):
                _invalid()
            out[field] = None if c["remove"] else value
        else:
            out[field] = "" if c["remove"] else value
    elif kind == "observation":
        observation = next((o for o in out["observations"] if o["id"] == c["observation_id"]), None)
        if observation is None:
            raise APIError("not_found", "Observation not found.")
        observation["status"] = c["status"]
        if "text" in c:
            observation.update(text=c["text"], origin="barber", uncertain=False)
    elif kind == "observation_add":
        out["observations"].append({"id": _id([out.get("consultation_id"), expected_revision, c]), "text": c["text"],
            "region": c["region"], "view": "front", "uncertain": False, "status": "confirmed", "origin": "barber"})
    elif kind == "face_shape":
        face = out.get("face_shape") or {"suggested": [], "ratios": {"lw": 0., "jw": 0., "fw": 0.}, "face_found": False}
        face.pop("outline", None)
        face["confirmed"] = c["confirmed"]
        out["face_shape"] = face
    elif kind == "select_option":
        if not any(o["id"] == c["option_id"] for o in out["options"]):
            raise APIError("not_found", "Option not found.")
        if out["conflicts"]:
            raise APIError("conflict_unresolved", "Resolve the conflict first.")
        out["selected_option_id"] = c["option_id"]
    elif kind == "resolve_conflict":
        refs = next((refs for conflict, refs in _conflict_pairs(out) if conflict["id"] == c["conflict_id"]), None)
        if refs is None:
            raise APIError("not_found", "Conflict not found.")
        field, value = refs[1 if c["keep"] == "first" else 0]
        _edit_list(out, field, "remove", value)
    elif kind == "stage":
        stage, target = out.get("stage", "photos"), c["stage"]
        ordinary = stage in STAGES[:6] and target in STAGES[:6] and abs(STAGES.index(stage) - STAGES.index(target)) == 1
        if not ordinary and (stage, target) != ("cutting", "done"):
            _invalid("Move one step; use confirmation to start cutting and Complete to finish.")
        if target == "summary":
            require_summary(out)
        out["stage"] = target
    # Text/voice is logged by the endpoint. It becomes constraints via C6 propose.
    if kind not in ("text", "stage", "select_option", "reveal", "pick_style", "choose_part", "rating"):
        _invalidate_options(out)
    _conflicts(out)
    out["revision"] = expected_revision + 1
    return out


def candidate_styles(catalog, state):
    """Filter catalog entries by protected regions and maximum styling effort.

    Face-shape guidance remains advisory; it never removes a preferred style.
    """
    protected = set().union(*(_regions(v) for v in state.get("keep", []) + state.get("avoid", [])))
    effort = {"low": 0, "medium": 1, "high": 2}
    maximum = effort.get(state.get("styling_effort"), 2)
    candidates = []
    for item in catalog:
        changes = set().union(*(_regions(v) for v in item["changes"]))
        if changes & protected or item["id"].casefold() in protected or item["name"].casefold() in protected:
            continue
        if effort[item["effort"]] <= maximum:
            candidates.append(deepcopy(item))
    return candidates


def merge_job_result(state: dict, job_type: str, result: dict, part=None, media_id=None) -> dict:
    """Merge a validated C6 result without mutating either argument.

    Observe appends new AI proposals and preserves human confirmations. Faceshape
    stores only suggested/ratios/face_found and the existing human confirmation.
    For a negated change.add, protect the value in Avoid instead of Change. Other
    negated edits retain their field/op (e.g. remove an old Keep constraint).
    Each state-producing job bumps revision once; transcribe never bumps it.
    Staleness/auth/transaction checks belong to the worker, before this call.
    """
    out = deepcopy(state)
    if job_type == "transcribe":
        return out
    if job_type == "observe":
        used = {o["id"] for o in out["observations"]}
        for index, observation in enumerate(result["observations"]):
            item = {key: deepcopy(observation[key]) for key in ("text", "view", "region", "uncertain")}
            oid = observation.get("id") or _id([state.get("revision", 0), index, item])
            if oid in used:
                oid = _id([oid, state.get("revision", 0), index, item])
            item.update(id=oid, status="proposed", origin="ai")
            out["observations"].append(item)
            used.add(oid)
        _invalidate_options(out)
    elif job_type == "faceshape":
        out["face_shape"] = {key: deepcopy(result[key]) for key in ("suggested", "ratios", "face_found")}
        out["face_shape"]["confirmed"] = (state.get("face_shape") or {}).get("confirmed")
        _invalidate_options(out)
    elif job_type in ("propose", "chat"):
        for proposed in result["proposed_changes"]:
            try:
                change = ProposedChange.model_validate(proposed)
            except ValidationError:
                _invalid("Invalid proposed change.")
            if not change.value.strip():
                _invalid("Invalid proposed change.")
            field = "avoid" if change.field == "change" and change.op == "add" and change.negated else change.field
            _edit_list(out, field, change.op, change.value)
        if job_type == "chat":
            changed=bool(result.get('proposed_changes') or any(out.get('brief',{}).get(u['field'])!=u['value'] for u in result.get('brief_updates',[])) or
                any(p not in out['problems'] for p in result.get('problems_detected',[])))
            if changed:
                previous_sides=deepcopy(out['sides'])
                top_only=result.get('phase')=='top' and not result.get('brief_updates') and bool(result.get('proposed_changes')) and all(
                    _regions(change['value']) and _regions(change['value']) <= {'top','fringe','crown'} for change in result['proposed_changes'])
                _invalidate_options(out)
                if top_only: out['sides']=previous_sides
            out['brief']=merge_brief(out.get('brief'),result.get('brief_updates',[]))
            out["chat"] = (out["chat"] + [{"role": "ai", "text": result["reply"]}])[-12:]
            for problem in result["problems_detected"]:
                if problem not in PROBLEMS:
                    _invalid("Invalid detected problem.")
                _edit_list(out, "problems", "add", problem)
            if result.get("goal"):
                out["goal"] = result["goal"]
        else:
            for key in ("reply", "next_question", "options", "uncertainties"):
                out[key] = deepcopy(result[key])
            if not any(o["id"] == out.get("selected_option_id") for o in out["options"]):
                out["selected_option_id"] = None
        _conflicts(out)
    elif job_type == "recommend":
        out["recommendations"] = deepcopy(result)
        if out["selected_style"] is None:
            out["selected_style"] = result["top_pick"]["catalog_id"]
    elif job_type == "suggest":
        target = out[part]
        target.update({key: deepcopy(result[key]) for key in ("options", "recommended_id", "intro")})
        if target["choice"] and not target["choice"].get("custom") and not any(o["id"] == target["choice"]["id"] for o in target["options"]):
            target["choice"] = None
    elif job_type == "checkpoint":
        out["checkpoints"][part] = {"status": result["status"], "note": result["note"], "media_id": media_id}
    else:
        _invalid("Unknown job type.")
    out["revision"] = state.get("revision", 0) + 1
    return out


def _agreement_plan(state, barber_notes):
    selected = next((o for o in state["options"] if o["id"] == state["selected_option_id"]), None)
    plan = {field: deepcopy(state[field]) for field in ("keep", "change", "avoid")}
    plan.update(option=deepcopy(selected), face_shape=(state.get("face_shape") or {}).get("confirmed"),
        observations=[o["text"] for o in state["observations"] if o["status"] == "confirmed"], barber_notes=barber_notes,
        selected_style=state["selected_style"], sides_choice=_choice_name(state["sides"]),
        top_choice=_choice_name(state["top"]), problems=deepcopy(state["problems"]))
    if any(v is not None and v!='' and v!=[] for k,v in state.get('brief',{}).items() if k!='evidence'):
        plan['brief']={key:deepcopy(value) for key,value in state['brief'].items() if key!='evidence'}
    return plan


def _choice_name(part):
    choice = part["choice"]
    if not choice:
        return None
    return choice["custom"] or next((o["name"] for o in part["options"] if o["id"] == choice["id"]), None)


def confirm_agreement(state, agreement, role, barber_notes, expected_revision, now=""):
    """Pure draft confirmation. A fully confirmed version is never changed.

    The route supplies now. Both confirmations bump once each; the second moves
    to cutting. Confirmations of a changed draft restart against its new plan.
    """
    check_revision(state, expected_revision)
    if state["conflicts"]:
        raise APIError("conflict_unresolved", "Resolve the conflict before confirming.")
    if state.get("stage") != "summary":
        _invalid("Open the summary step before confirming.")
    require_summary(state)
    if role not in ("customer", "barber"):
        _invalid()
    out = deepcopy(state)
    old_notes = agreement["plan"].get("barber_notes", "") if agreement else ""
    plan = _agreement_plan(out, barber_notes if role == "barber" else old_notes)
    immutable = bool(agreement and agreement["customer_confirmed_at"] and agreement["barber_confirmed_at"])
    if agreement is None or immutable:
        draft = {"id": _id([state.get("consultation_id"), expected_revision, "agreement"]),
                 "version": agreement["version"] + 1 if agreement else 1, "plan": plan,
                 "customer_confirmed_at": None, "barber_confirmed_at": None}
    else:
        draft = deepcopy(agreement)
        # Barber cutting notes do not alter the customer's confirmed preferences.
        if any(plan[key] != draft["plan"].get(key) for key in plan if key != "barber_notes"):
            draft["customer_confirmed_at"] = draft["barber_confirmed_at"] = None
        draft["plan"] = plan
    draft[role + "_confirmed_at"] = now
    if draft["customer_confirmed_at"] and draft["barber_confirmed_at"]:
        out["stage"] = "cutting"
    out["revision"] = expected_revision + 1
    return out, draft


def complete_visit(conn, row, actual_notes, save_as_preferred, keep_photos, now, rating=None):
    """Write completion inside the caller's BEGIN IMMEDIATE transaction.

    Returns visit_id and media rows needing physical cleanup. The route removes
    those files after the database transaction commits; no nested connection.
    """
    cid = row["id"]
    agreement = conn.execute("SELECT * FROM agreements WHERE consultation_id=? ORDER BY version DESC LIMIT 1", (cid,)).fetchone()
    if row["status"] != "active" or row["stage"] not in ("cutting", "done") or not agreement or not agreement["customer_confirmed_at"] or not agreement["barber_confirmed_at"]:
        raise APIError("conflict_unresolved", "Both people must confirm the agreement before completing.")
    state = json.loads(row["state_json"])
    if state["conflicts"]:
        raise APIError("conflict_unresolved", "Resolve the conflict before completing.")
    plan = json.loads(agreement["plan_json"])
    current_plan = _agreement_plan(state, plan.get("barber_notes", ""))
    v2_defaults = {"selected_style": None, "sides_choice": None, "top_choice": None, "problems": []}
    # Keep immutable v1 plans completable after migration, only while their new
    # preferences remain empty. Every original plan field is still compared.
    if not any(key in plan for key in v2_defaults) and all(current_plan[key] == value for key, value in v2_defaults.items()):
        current_plan = {key: value for key, value in current_plan.items() if key not in v2_defaults}
    if 'brief' not in plan: current_plan.pop('brief',None)
    if current_plan != plan:
        raise APIError("conflict_unresolved", "The plan changed. Confirm a new agreement before completing.")
    if save_as_preferred and not row["customer_id"]:
        _invalid("A temporary consultation cannot be saved as preferred.")
    rating = state.get("rating") or rating
    vid = str(uuid4()) if row["customer_id"] else None
    if vid:
        conn.execute("INSERT INTO visits (id,customer_id,consultation_id,agreement_id,actual_notes,completed_at,rating,rating_tags) VALUES (?,?,?,?,?,?,?,?)",
                     (vid, row["customer_id"], cid, agreement["id"], actual_notes, now,
                      rating["score"] if rating else None, json.dumps(rating["tags"]) if rating else None))
        if save_as_preferred:
            conn.execute("UPDATE customers SET preferred_visit_id=? WHERE id=?", (vid, row["customer_id"]))
    state["revision"] = row["revision"] + 1
    conn.execute("UPDATE consultations SET status='completed', stage='done', revision=?, state_json=?, ended_at=?, "
                 "phone_token_hash=NULL, pair_code_hash=NULL, pair_expires_at=NULL WHERE id=?",
                 (state["revision"], json.dumps(state), now, cid))
    conn.execute("UPDATE jobs SET status='cancelled', finished_at=? WHERE consultation_id=? AND status IN ('queued','running')", (now, cid))
    retain = bool(row["customer_id"] and keep_photos)
    conn.execute("UPDATE media SET keep=CASE WHEN kind='photo' THEN ? ELSE 0 END WHERE consultation_id=?", (int(retain), cid))
    # Unkept rows remain until files are removed, so retries can recover cleanup.
    return {"visit_id": vid}, list(conn.execute("SELECT * FROM media WHERE consultation_id=? AND keep=0", (cid,)))
