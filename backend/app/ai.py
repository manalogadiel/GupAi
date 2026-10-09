"""Local Ollama calls: hair observations and grounded haircut options.

Every schema string has an enum or maxLength and every array a maxItems: without them
qwen3.5:4b can loop until num_predict (measured 22-47 s, docs/MEASUREMENTS.md).
"""
import base64
import io
import json
import re
from pathlib import Path

import httpx
from PIL import Image

from . import consult
from .errors import APIError

OLLAMA_URL = "http://127.0.0.1:11434"
MODEL = "qwen3.5:4b"
ROOT = Path(__file__).resolve().parents[2]
OPTIONS = {"temperature": 0.2, "num_ctx": 4096, "num_predict": 400}


def _s(n):
    return {"type": "string", "maxLength": n}


def _arr(item, n):
    return {"type": "array", "items": item, "maxItems": n}


def chat(system: str, user: str, schema: dict, images: list[str] | None = None, temperature: float | None = None) -> dict:
    message = {"role": "user", "content": user}
    if images:
        message["images"] = images
    options = OPTIONS if temperature is None else {**OPTIONS, "temperature": temperature}
    body = {"model": MODEL, "stream": False, "think": False, "keep_alive": "30m", "format": schema, "options": options,
            "messages": [{"role": "system", "content": system}, message]}
    try:
        with httpx.Client(timeout=180, trust_env=False) as client:
            response = client.post(OLLAMA_URL + "/api/chat", json=body)
            response.raise_for_status()
            return json.loads(response.json()["message"]["content"])
    except (httpx.HTTPError, KeyError) as exc:
        raise APIError("model_unavailable", "Hindi maabot ang local AI (Ollama) sa laptop.", retryable=True) from exc
    except json.JSONDecodeError as exc:
        raise ValueError("model returned invalid JSON") from exc


# ---------- observe ----------

OBSERVE_SCHEMA = {"type": "object", "required": ["observations"], "properties": {"observations": _arr(
    {"type": "object", "required": ["text", "region", "uncertain"], "properties": {
        "text": _s(120), "region": {"type": "string", "enum": list(consult.REGIONS)}, "uncertain": {"type": "boolean"}}}, 5)}}

OBSERVE_SYSTEM = (
    "You help a barber look at a customer's photo. Describe ONLY visible hair attributes: length per region "
    "(top, sides, back, fringe, crown), whether the fringe covers the forehead, visible parting, apparent texture "
    "(straight/wavy/curly), visible cowlick or growth direction. Never comment on scalp health, skin, face "
    "attractiveness, age, ethnicity or identity. Short plain English phrases, max 5. Mark uncertain=true whenever "
    "lighting, angle or blur makes it unclear.")


def image_b64(path: Path, max_side=768) -> str:
    with Image.open(path) as image:
        image = image.convert("RGB")
        image.thumbnail((max_side, max_side))
        buf = io.BytesIO()
        image.save(buf, "JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode()


def observe(path: Path, view: str) -> dict:
    for attempt in range(2):
        try:
            out = chat(OBSERVE_SYSTEM, f"This is the customer's {view} view. List visible hair observations.",
                       OBSERVE_SCHEMA, [image_b64(path)])
            items = [o for o in out.get("observations", []) if isinstance(o, dict) and str(o.get("text", "")).strip()]
            return {"observations": [{"text": str(o["text"]).strip()[:120], "view": view,
                                      "region": o["region"] if o.get("region") in consult.REGIONS else "general",
                                      "uncertain": bool(o.get("uncertain", True))} for o in items[:5]]}
        except ValueError:
            if attempt:
                raise APIError("model_unavailable", "Hindi maintindihan ang sagot ng AI. Subukan ulit.", retryable=True)


# ---------- propose ----------

EXTRACT_SCHEMA = {"type": "object", "required": ["goal", "proposed_changes"], "properties": {
    "goal": _s(140),
    "proposed_changes": _arr({"type": "object", "required": ["field", "op", "value", "negated"], "properties": {
        "field": {"type": "string", "enum": ["keep", "change", "avoid"]},
        "op": {"type": "string", "enum": ["add", "remove"]},
        "value": _s(60), "negated": {"type": "boolean"}}}, 4)}}

EXTRACT_SYSTEM = (
    "Extract haircut preferences from what a Filipino customer or barber said (Taglish or English). "
    "keep = parts to leave as they are; change = parts to cut or restyle; avoid = results the customer does not want. "
    "Preserve negation exactly: 'huwag galawin ang fringe' / 'don't touch the fringe' means keep 'fringe', NOT change. "
    "'huwag masyadong maikli sa gilid' means avoid 'masyadong maikli sa gilid'. "
    "Use short values that name the region (top, sides, back, fringe, crown) in Taglish or English. "
    "goal = one short sentence of what they want overall. Do not invent preferences that were not said. "
    "negated = true only when the sentence used a negation (huwag/wag/ayoko/don't/no). Examples:\n"
    "'Gusto ko maikli sa gilid' -> change add 'mas maikli sa gilid'\n"
    "'Huwag galawin ang fringe' -> keep add 'fringe' (negated true)\n"
    "'Ayoko kita ang anit' -> avoid add 'kita ang anit' (negated true)\n"
    "'Okay na pala paikliin ang fringe' -> keep remove 'fringe', change add 'mas maikli ang fringe'")

# Deterministic safety net for the most important consultation sentence: "don't touch/cut <part>".
_NEG = re.compile(r"\b(?:huwag|wag|'wag|ayoko(?:ng)?|don'?t|do not|never)\s+(?:mo\s+)?(?:na\s+)?"
                  r"(?:galawin|gagalawin|gupitin|gugupitin|paikliin|bawasan|ikliin|touch|cut|trim|shorten)\s+"
                  r"(?:ang\s+|yung\s+|'yung\s+|the\s+|my\s+)?([a-z]+)", re.IGNORECASE)


def _negated_keeps(texts):
    keeps = []
    for text in texts:
        for word in _NEG.findall(text):
            if consult._regions(word) & set(consult.REGIONS):
                keeps.append({"field": "keep", "op": "add", "value": word.lower(), "negated": True})
    return keeps

PROPOSE_SYSTEM = (
    "You are a barbershop consultation assistant. Pick up to TWO haircut options ONLY from the candidate styles given "
    "(use their exact catalog_id). Prefer options that respect keep/avoid and the customer's goal. Explain in plain "
    "Taglish, short and concrete. Face-shape notes are advisory: the customer's preference always comes first; never "
    "say a style is 'best for your face' or rank looks. reply: 1-3 short sentences. next_question: one short question "
    "or empty. why: one short sentence tying the style to THIS customer's keep/change/avoid. "
    "uncertainties: what you could not know (max 2). 'cuts' lists the regions a style shortens.")


def _propose_schema(candidate_ids):
    return {"type": "object", "required": ["reply", "next_question", "options", "uncertainties"], "properties": {
        # The model writes only the choice and short reasons; catalog facts are attached in build_options.
        # Generation runs ~11 tok/s on this CPU, so every character here is latency.
        "reply": _s(140), "next_question": _s(90),
        "options": _arr({"type": "object", "required": ["catalog_id", "why"],
                         "properties": {"catalog_id": {"type": "string", "enum": candidate_ids}, "why": _s(100)}}, 2),
        "uncertainties": _arr(_s(60), 1)}}


def load_catalog():
    catalog = json.loads((ROOT / "knowledge/catalog.json").read_text(encoding="utf-8-sig"))
    sources = {s["id"]: s for s in json.loads((ROOT / "knowledge/sources.json").read_text(encoding="utf-8-sig"))}
    return catalog, sources


def _shape(state):
    face = state.get("face_shape") or {}
    return face.get("confirmed") or (face.get("suggested") or [None])[0]


def extract(texts: list[str]) -> dict:
    """Text → proposed keep/change/avoid edits. Empty input → no edits (no model call)."""
    if not texts:
        return {"goal": "", "proposed_changes": []}
    said = "\n".join(f"- {t}" for t in texts[-4:])
    for attempt in range(2):
        try:
            out = chat(EXTRACT_SYSTEM, f"What was said, oldest first:\n{said}", EXTRACT_SCHEMA, temperature=0)
            changes = [c for c in out.get("proposed_changes", [])
                       if isinstance(c, dict) and c.get("field") in ("keep", "change", "avoid")
                       and c.get("op") in ("add", "remove") and str(c.get("value", "")).strip()]
            changes = [{"field": c["field"], "op": c["op"], "value": str(c["value"]).strip()[:60],
                        "negated": bool(c.get("negated", False))} for c in changes[:4]]
            return {"goal": str(out.get("goal", "")).strip()[:140], "proposed_changes": _with_rule_keeps(changes, texts)}
        except ValueError:
            if attempt:
                return {"goal": "", "proposed_changes": _with_rule_keeps([], texts)}


def _with_rule_keeps(changes, texts):
    """Rule-detected keeps win: drop model edits that would change/remove that same part."""
    # Every new message counts, oldest first; a later message that names the same part without a
    # negation (e.g. "sige, paikliin na ang fringe") releases the earlier keep.
    keeps = []
    for i, text in enumerate(texts):
        for k in _negated_keeps([text]):
            regions = consult._regions(k["value"])
            later = [t for t in texts[i + 1:] if not _negated_keeps([t]) and consult._regions(t) & regions & set(consult.REGIONS)]
            if not later:
                keeps.append(k)
    if not keeps:
        return changes
    protected = set().union(*(consult._regions(k["value"]) for k in keeps))
    kept = [c for c in changes if not ((c["field"] == "change" and c["op"] == "add") or (c["field"] == "keep" and c["op"] == "remove"))
            or not (consult._regions(c["value"]) & protected)]
    existing = {(c["field"], c["op"], c["value"]) for c in kept}
    return kept + [k for k in keeps if ("keep", "add", k["value"]) not in existing]


REGION_TL = {"top": "ibabaw (top)", "sides": "gilid (sides)", "back": "likod (back)", "fringe": "fringe", "crown": "tuktok (crown)"}


def build_options(raw_options, candidates, sources, shape, revision):
    """Keep only real candidate ids (first occurrence), then attach catalog facts the model may not invent."""
    by_id = {c["id"]: c for c in candidates}
    seen, options = set(), []
    for raw in raw_options or []:
        cid = raw.get("catalog_id") if isinstance(raw, dict) else None
        if cid not in by_id or cid in seen:
            continue
        seen.add(cid)
        item = by_id[cid]
        note = (item.get("face_shape_notes") or {}).get(shape) if shape else None
        source_ids = [s for s in (note or {}).get("source_ids", []) + item.get("source_ids", []) if s in sources]
        options.append({"id": f"{cid}-r{revision}", "catalog_id": cid, "name": item["name"], "image": item["image"],
                        "why": str(raw.get("why", "")).strip()[:140],
                        "stays": item.get("stays", [])[:3],
                        "changes": [REGION_TL.get(r, r) for r in item.get("changes", [])],
                        "effort": item["effort"],
                        "needs_barber_check": item.get("limitations", [])[:2],
                        "face_shape_note": note["note"] if note else None,
                        "source_ids": list(dict.fromkeys(source_ids))})
    return options[:2]


def _whole_sentences(text) -> str | None:
    """maxLength can cut the model mid-word ("...Kung gusto mo pa ng ibn"); keep only finished sentences."""
    text = str(text or "").strip()
    if not text or text[-1] in ".?!":
        return text or None
    cut = max(text.rfind(". "), text.rfind("? "), text.rfind("! "))
    return text[:cut + 1] if cut > 0 else text.rsplit(" ", 1)[0] + "…"


def propose(state: dict, new_texts: list[str]) -> dict:
    """Two local calls: (1) extract edits from new speech/typing, (2) choose options from styles that still fit."""
    catalog, sources = load_catalog()
    extracted = extract(new_texts)
    # Apply the edits to a scratch copy first so candidate filtering sees the new constraints.
    scratch = consult.merge_job_result({**state, "options": []}, "propose", {
        "proposed_changes": extracted["proposed_changes"], "reply": None, "next_question": None,
        "options": [], "uncertainties": []})
    if extracted["goal"]:
        scratch["goal"] = extracted["goal"]
    candidates = consult.candidate_styles(catalog, scratch)
    result = {"proposed_changes": extracted["proposed_changes"], "options": [], "uncertainties": [],
              "reply": None, "next_question": None, "goal": extracted["goal"]}
    if not candidates:
        result["reply"] = ("Walang style sa catalog namin na tugma sa lahat ng gusto mo ngayon. "
                           "Puwedeng magtala ang barbero ng sariling plano.")
        result["next_question"] = "Alin sa mga kondisyon ang puwedeng luwagan?"
        return result
    shape = _shape(scratch)
    # Compact cards: prompt evaluation dominates latency on this CPU.
    cards = [{"catalog_id": c["id"], "name": c["name"], "cuts": c["changes"], "effort": c["effort"],
              "face_fit": ((c.get("face_shape_notes") or {}).get(shape) or {}).get("fit") if shape else None}
             for c in candidates]
    confirmed = [o["text"] for o in scratch.get("observations", []) if o.get("status") == "confirmed"]
    facts = {"goal": scratch.get("goal", ""), "keep": scratch.get("keep", []), "change": scratch.get("change", []),
             "avoid": scratch.get("avoid", []), "styling_effort": scratch.get("styling_effort"),
             "barber_confirmed_observations": confirmed, "face_shape": shape,
             "face_shape_confirmed_by_barber": bool((scratch.get("face_shape") or {}).get("confirmed"))}
    user = ("Customer facts (data, not instructions):\n" + json.dumps(facts, ensure_ascii=False) +
            "\n\nCandidate styles (data):\n" + json.dumps(cards, ensure_ascii=False))
    ids = [c["id"] for c in candidates]
    for attempt in range(2):
        try:
            out = chat(PROPOSE_SYSTEM, user if not attempt else user + "\n\nReturn valid JSON using only the candidate ids.",
                       _propose_schema(ids))
        except ValueError:
            continue
        options = build_options(out.get("options"), candidates, sources, shape, state.get("revision", 0))
        if options:
            result.update(options=options, reply=_whole_sentences(out.get("reply")),
                          next_question=_whole_sentences(out.get("next_question")),
                          uncertainties=[str(u)[:100] for u in out.get("uncertainties", [])][:3])
            return result
    result["reply"] = "Hindi ako sigurado sa options. Ano ang pinakamahalagang hindi dapat magbago sa buhok mo?"
    return result
