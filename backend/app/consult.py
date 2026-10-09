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

REGIONS = ("top", "sides", "back", "fringe", "crown", "general")
SHAPES = ("oval", "round", "square", "oblong", "heart", "diamond")
STAGES = ("concern", "photos", "observations", "options", "agreement", "cutting")
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
    stage: Literal["concern", "photos", "observations", "options", "agreement", "cutting", "completed", "abandoned"]


CONTRIBUTION = TypeAdapter(Annotated[TextInput | ChipInput | ObservationInput |
    ObservationAddInput | FaceInput | SelectInput | ResolveInput | StageInput,
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
    if any(isinstance(value.get(key), str) and not value[key].strip() for key in ("text", "value")):
        _invalid()
    return value


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
    aliases = {"side": "sides", "bangs": "fringe", "bang": "fringe"}
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


def apply_contribution(state, c, expected_revision):
    """Return a copy with exactly one revision bump; text is never parsed here.

    Routes supply stage as transient metadata. A stage chip moves one step and
    cannot bypass agreement confirmation or visit completion.
    """
    check_revision(state, expected_revision)
    c = validate_contribution(c)
    out = deepcopy(state)
    kind = c["kind"]
    if kind == "chip":
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
        stage, target = out.get("stage", "concern"), c["stage"]
        if stage not in STAGES or target not in STAGES or abs(STAGES.index(stage) - STAGES.index(target)) != 1 or target == "cutting":
            _invalid("Move one step; use confirmation to start cutting and Complete to finish.")
        out["stage"] = target
    # Text/voice is logged by the endpoint. It becomes constraints via C6 propose.
    if kind not in ("stage", "select_option"):
        _invalidate_options(out)
    if kind != "stage" and out.get("stage") == "cutting":
        out["stage"] = "agreement"
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


def merge_job_result(state: dict, job_type: str, result: dict) -> dict:
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
    elif job_type == "propose":
        for proposed in result["proposed_changes"]:
            try:
                change = ProposedChange.model_validate(proposed)
            except ValidationError:
                _invalid("Invalid proposed change.")
            if not change.value.strip():
                _invalid("Invalid proposed change.")
            field = "avoid" if change.field == "change" and change.op == "add" and change.negated else change.field
            _edit_list(out, field, change.op, change.value)
        for key in ("reply", "next_question", "options", "uncertainties"):
            out[key] = deepcopy(result[key])
        if not any(o["id"] == out.get("selected_option_id") for o in out["options"]):
            out["selected_option_id"] = None
        _conflicts(out)
    else:
        _invalid("Unknown job type.")
    out["revision"] = state.get("revision", 0) + 1
    return out


def _agreement_plan(state, barber_notes):
    selected = next((o for o in state["options"] if o["id"] == state["selected_option_id"]), None)
    plan = {field: deepcopy(state[field]) for field in ("keep", "change", "avoid")}
    plan.update(option=deepcopy(selected), face_shape=(state.get("face_shape") or {}).get("confirmed"),
        observations=[o["text"] for o in state["observations"] if o["status"] == "confirmed"], barber_notes=barber_notes)
    return plan


def confirm_agreement(state, agreement, role, barber_notes, expected_revision, now=""):
    """Pure draft confirmation. A fully confirmed version is never changed.

    The route supplies now. Both confirmations bump once each; the second moves
    to cutting. Confirmations of a changed draft restart against its new plan.
    """
    check_revision(state, expected_revision)
    if state["conflicts"]:
        raise APIError("conflict_unresolved", "Resolve the conflict before confirming.")
    if state.get("stage") != "agreement":
        _invalid("Open the agreement step before confirming.")
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


def complete_visit(conn, row, actual_notes, save_as_preferred, keep_photos, now):
    """Write completion inside the caller's BEGIN IMMEDIATE transaction.

    Returns visit_id and media rows needing physical cleanup. The route removes
    those files after the database transaction commits; no nested connection.
    """
    cid = row["id"]
    agreement = conn.execute("SELECT * FROM agreements WHERE consultation_id=? ORDER BY version DESC LIMIT 1", (cid,)).fetchone()
    if row["status"] != "active" or row["stage"] != "cutting" or not agreement or not agreement["customer_confirmed_at"] or not agreement["barber_confirmed_at"]:
        raise APIError("conflict_unresolved", "Both people must confirm the agreement before completing.")
    state = json.loads(row["state_json"])
    if state["conflicts"]:
        raise APIError("conflict_unresolved", "Resolve the conflict before completing.")
    plan = json.loads(agreement["plan_json"])
    if _agreement_plan(state, plan.get("barber_notes", "")) != plan:
        raise APIError("conflict_unresolved", "The plan changed. Confirm a new agreement before completing.")
    if save_as_preferred and not row["customer_id"]:
        _invalid("A temporary consultation cannot be saved as preferred.")
    vid = str(uuid4()) if row["customer_id"] else None
    if vid:
        conn.execute("INSERT INTO visits VALUES (?,?,?,?,?,?)", (vid, row["customer_id"], cid, agreement["id"], actual_notes, now))
        if save_as_preferred:
            conn.execute("UPDATE customers SET preferred_visit_id=? WHERE id=?", (vid, row["customer_id"]))
    state["revision"] = row["revision"] + 1
    conn.execute("UPDATE consultations SET status='completed', stage='completed', revision=?, state_json=?, ended_at=?, "
                 "phone_token_hash=NULL, pair_code_hash=NULL, pair_expires_at=NULL WHERE id=?",
                 (state["revision"], json.dumps(state), now, cid))
    conn.execute("UPDATE jobs SET status='cancelled', finished_at=? WHERE consultation_id=? AND status IN ('queued','running')", (now, cid))
    retain = bool(row["customer_id"] and keep_photos)
    conn.execute("UPDATE media SET keep=CASE WHEN kind='photo' THEN ? ELSE 0 END WHERE consultation_id=?", (int(retain), cid))
    # Unkept rows remain until files are removed, so retries can recover cleanup.
    return {"visit_id": vid}, list(conn.execute("SELECT * FROM media WHERE consultation_id=? AND keep=0", (cid,)))
