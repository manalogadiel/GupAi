"""One-off: expand knowledge/parts.json with more PH barbershop cuts, a Tagalog desc and hair_fit.

Run once: .venv/bin/python scripts/expand_parts.py  (idempotent; rewrites the file).
Notes stay conditional ("may", "commonly suggested") and keep "customer preference comes first".
"""
import json
from pathlib import Path

PATH = Path(__file__).resolve().parents[1] / "knowledge/parts.json"
SRC = ["opentextbc_consultation", "pall_mall_face_shapes", "manual_face_shapes", "gentlemans_gazette_face_shapes"]
SHAPES = ("oval", "round", "square", "oblong", "heart", "diamond")
PROBLEMS = ("puffy_sides", "cowlick", "hard_to_style", "grows_fast", "flat_top", "wide_forehead")
SHAPE_REASON = {
    "oval": "many outlines can work",
    "round": "height on top with tidy sides may add apparent length",
    "square": "it can echo or soften a defined jawline",
    "oblong": "side fullness and a lower top may limit apparent length",
    "heart": "a softer outline may balance a wider forehead",
    "diamond": "fullness at the fringe and lower sides may balance cheekbone width",
}

DESC = {  # Tagalog one-liners for cards and the full list
    "skin_fade": "Kalbo sa baba ng gilid, unti-unting humahaba pataas. Malinis at matapang.",
    "low_fade": "Fade na mababa, malapit sa tenga. Malinis pero hindi masyadong litaw ang anit.",
    "mid_fade": "Fade na nagsisimula sa gitna ng gilid. Balanse ng linis at haba.",
    "high_fade": "Fade na mataas, halos hanggang sa itaas ng gilid. Matapang ang contrast.",
    "drop_fade": "Fade na bumababa sa likod ng tenga, sumusunod sa hugis ng ulo.",
    "burst_fade": "Paikot na fade sa paligid ng tenga lang; may haba pa sa likod.",
    "taper": "Unti-unting umiikli sa patilya at batok lang. Pinaka-natural at pang-opisina.",
    "undercut": "Maikli ang gilid, biglang humahaba sa ibabaw. Walang blending, kitang hiwalay.",
    "scissor_over_comb": "Gunting lang, walang makina. Malambot at natural ang gilid.",
    "uniform": "Pantay na haba sa buong gilid gamit ang isang guard. Simple at madali.",
    "textured_crop": "Maikling ibabaw na may texture, bangs na bahagyang pababa. Low maintenance.",
    "french_crop": "Maikli at diretsong bangs sa harap, malinis ang linya. Pang-everyday.",
    "side_part": "May hati sa gilid, suklay patagilid. Classic at pormal.",
    "comb_over": "Suklay patagilid nang mas mahaba, may konting volume. Pang-opisina.",
    "quiff": "Angat ang buhok sa harap, may volume. Kailangan ng blower o wax.",
    "pompadour": "Mataas at bilugang angat sa harap, suklay patalikod. Pang-porma.",
    "slick_back": "Suklay patalikod lahat, makinis. Kailangan ng pomade.",
    "curtains": "Hati sa gitna, bumabagsak ang buhok sa magkabilang gilid ng noo.",
    "messy_fringe": "Mahabang bangs na may texture, magulo pero sinadya. Pang-bata ang dating.",
    "two_block": "Korean style: mahaba ang ibabaw na tumatakip sa maikling gilid.",
    "faux_hawk": "Mas mataas sa gitna ng ibabaw, parang mohawk pero hindi kalbo ang gilid.",
    "keep_length": "Haba muna. Ayos lang ng kaunti, hindi binabago ang hugis.",
    "buzz": "Maikli at pantay ang buong ibabaw gamit ang makina. Pinakamadali.",
}

# hair_fit: only non-neutral entries. Keys: thin, thick, wavy, curly, coily.
HAIR = {
    "skin_fade": {"thick": ("helps", "Removing side bulk may suit thick hair that puffs out."),
                  "thin": ("care", "Very close sides may make thin top hair look sparser by contrast; the barber should check.")},
    "low_fade": {"thick": ("helps", "A low fade may control thick side bulk while keeping coverage above the ear.")},
    "mid_fade": {"thick": ("helps", "A mid fade may remove thick side bulk that makes the head look wide.")},
    "high_fade": {"thick": ("helps", "A high fade may remove most side bulk from thick hair."),
                  "thin": ("care", "A high fade can make thin hair on top look sparser; consider a lower fade.")},
    "drop_fade": {"thick": ("helps", "Following the head shape may keep thick hair from bulging behind the ear."),
                  "curly": ("helps", "A drop fade may keep curly sides neat while the top stays full.")},
    "burst_fade": {"curly": ("helps", "Keeping length at the back while clearing around the ear may suit curly or coily hair."),
                   "coily": ("helps", "A burst fade is commonly used with coily texture to keep shape around the ear.")},
    "taper": {"thin": ("helps", "A gentle taper keeps more hair on the sides, which may make thin hair look fuller."),
              "wavy": ("helps", "A taper may let wavy sides lie naturally without a hard line.")},
    "undercut": {"thick": ("helps", "An undercut may remove heavy bulk underneath thick hair."),
                 "thin": ("care", "A disconnected undercut can expose how thin the top is; the barber should check.")},
    "scissor_over_comb": {"thin": ("helps", "Scissors keep softer length on the sides, which may suit thin hair."),
                          "wavy": ("helps", "Scissor work may follow wavy texture more naturally.")},
    "uniform": {"thin": ("helps", "Even length may avoid exposing scalp on thin hair."),
                "curly": ("care", "One guard length on curly hair may puff unevenly; the barber should check.")},
    "textured_crop": {"thin": ("helps", "Texture on a short top may make thin hair look fuller."),
                      "thick": ("helps", "Point-cut texture may remove weight from thick hair."),
                      "wavy": ("helps", "A crop can use natural wave as texture.")},
    "french_crop": {"thin": ("helps", "A short forward fringe may hide a thinning front and look fuller."),
                    "curly": ("care", "A straight blunt fringe may spring up on curly hair; the barber should check.")},
    "side_part": {"thin": ("care", "A hard part may show scalp on thin hair; a soft part is gentler."),
                  "thick": ("helps", "Thick hair commonly holds a side part well.")},
    "comb_over": {"thick": ("helps", "Thick hair commonly holds a comb over shape well."),
                  "thin": ("care", "Combing thin hair over a long distance may look flat; the barber should check.")},
    "quiff": {"thin": ("care", "A quiff needs lift; thin hair may need more product to hold it."),
              "thick": ("helps", "Thick hair commonly holds quiff volume well."),
              "wavy": ("helps", "Natural wave may add volume to a quiff.")},
    "pompadour": {"thin": ("care", "A pompadour needs density and length; thin hair may struggle to hold it."),
                  "thick": ("helps", "Thick hair commonly suits pompadour volume.")},
    "slick_back": {"thin": ("care", "Slicking thin hair back may show scalp lines."),
                   "curly": ("care", "Curly hair may resist lying flat when slicked back."),
                   "thick": ("helps", "Thick straight or wavy hair commonly holds a slick back.")},
    "curtains": {"wavy": ("helps", "Natural wave may help curtains fall apart at the middle."),
                 "thin": ("care", "A centre part may show scalp on thin hair; the barber should check.")},
    "messy_fringe": {"thin": ("helps", "Textured forward length may make thin hair look fuller."),
                     "wavy": ("helps", "Wave may add natural mess to the fringe."),
                     "curly": ("helps", "Curly hair commonly suits a loose textured fringe.")},
    "two_block": {"thick": ("helps", "The short underneath layer may remove heavy bulk from thick straight hair."),
                  "curly": ("care", "Two block usually relies on straight hair lying over the sides; curls may spring out.")},
    "faux_hawk": {"thick": ("helps", "Thick hair commonly holds the raised centre."),
                  "thin": ("care", "Thin hair may need product to keep a raised centre.")},
    "keep_length": {"curly": ("helps", "Keeping length may let curls hang instead of puffing."),
                    "coily": ("helps", "Retained length may keep coily shape and coverage.")},
    "buzz": {"thin": ("helps", "An even short length may make thinning less noticeable."),
             "coily": ("helps", "A short even length is commonly easy to maintain for coily hair.")},
}

NEW = {  # id: (group, name, pros, cons, maintenance, face fits, problem fits)
    "high_fade": ("sides", "High fade", ["Very clean outline", "Strong contrast with the top"],
                  ["Regrowth shows quickly", "Shows more scalp on the sides"],
                  "Touch up every 2 weeks to keep the high contrast.",
                  dict(oval="suggested", round="suggested", square="suggested", oblong="care", heart="care", diamond="care"),
                  dict(puffy_sides="helps", hard_to_style="helps", grows_fast="worse")),
    "drop_fade": ("sides", "Drop fade", ["Follows the head shape", "Clean behind the ear"],
                  ["More detailed to maintain"],
                  "Touch up every 2 to 3 weeks to keep the curve behind the ear.",
                  dict(oval="suggested", round="suggested", square="suggested", oblong="neutral", heart="neutral", diamond="neutral"),
                  dict(puffy_sides="helps", hard_to_style="helps", grows_fast="worse")),
    "burst_fade": ("sides", "Burst fade", ["Clean around the ear", "Keeps length at the back"],
                   ["Distinct look that not every school or office allows"],
                   "Touch up every 2 to 3 weeks around the ear.",
                   dict(oval="suggested", round="neutral", square="suggested", oblong="suggested", heart="neutral", diamond="neutral"),
                   dict(puffy_sides="helps", grows_fast="worse")),
    "undercut": ("sides", "Undercut", ["Removes bulk underneath", "Long top can be styled many ways"],
                 ["Disconnection shows as it grows out", "Needs top styling"],
                 "Clip the sides every 2 to 3 weeks; style the top daily.",
                 dict(oval="suggested", round="suggested", square="suggested", oblong="care", heart="neutral", diamond="neutral"),
                 dict(puffy_sides="helps", hard_to_style="worse", grows_fast="worse")),
    "french_crop": ("top", "French crop", ["Very easy daily styling", "Fringe softens the forehead"],
                    ["Short fringe may not suit a formal look"],
                    "Trim every 3 to 4 weeks; a little matte clay is optional.",
                    dict(oval="suggested", round="neutral", square="suggested", oblong="suggested", heart="suggested", diamond="suggested"),
                    dict(hard_to_style="helps", flat_top="helps", wide_forehead="helps", cowlick="neutral")),
    "comb_over": ("top", "Comb over", ["Neat and professional", "Works with longer top length"],
                  ["Needs daily combing and a little product"],
                  "Trim every 4 weeks; comb with light pomade daily.",
                  dict(oval="suggested", round="suggested", square="suggested", oblong="neutral", heart="suggested", diamond="neutral"),
                  dict(hard_to_style="worse", flat_top="helps", cowlick="helps")),
    "pompadour": ("top", "Pompadour", ["Strong, stylish volume", "Adds height"],
                  ["Needs blow-dry and product every day", "Needs enough length"],
                  "Trim every 4 to 5 weeks; blow-dry and pomade daily.",
                  dict(oval="suggested", round="suggested", square="suggested", oblong="care", heart="care", diamond="neutral"),
                  dict(hard_to_style="worse", flat_top="helps", wide_forehead="worse", grows_fast="neutral")),
    "slick_back": ("top", "Slick back", ["Polished, formal look", "Works for events"],
                   ["Needs pomade daily", "Shows the full forehead"],
                   "Trim every 4 to 5 weeks; pomade daily.",
                   dict(oval="suggested", round="neutral", square="suggested", oblong="care", heart="care", diamond="neutral"),
                   dict(hard_to_style="worse", wide_forehead="worse", cowlick="worse")),
    "messy_fringe": ("top", "Messy fringe", ["Youthful, relaxed look", "Covers part of the forehead"],
                     ["May fall into the eyes as it grows"],
                     "Trim every 3 to 4 weeks; texture spray or clay is optional.",
                     dict(oval="suggested", round="care", square="suggested", oblong="suggested", heart="suggested", diamond="suggested"),
                     dict(wide_forehead="helps", hard_to_style="helps", flat_top="helps")),
    "two_block": ("top", "Two block", ["Popular Korean style", "Long top hides a short underneath"],
                  ["Needs length on top", "Works best on straight hair"],
                  "Clip underneath every 3 weeks; trim top every 5 to 6 weeks.",
                  dict(oval="suggested", round="neutral", square="suggested", oblong="suggested", heart="suggested", diamond="suggested"),
                  dict(puffy_sides="helps", wide_forehead="helps", hard_to_style="neutral")),
    "faux_hawk": ("top", "Faux hawk", ["Adds height without shaving the sides", "Playful, bold look"],
                  ["Needs product to hold the centre", "Not always allowed in school"],
                  "Trim every 3 to 4 weeks; clay or wax daily.",
                  dict(oval="suggested", round="suggested", square="suggested", oblong="care", heart="neutral", diamond="neutral"),
                  dict(flat_top="helps", hard_to_style="worse", wide_forehead="worse")),
}

PROBLEM_NOTE = {
    "helps": "{name} may help with this if it matches the look you want.",
    "neutral": "{name} does not change this much on its own; discuss it with the barber.",
    "worse": "{name} may make this more noticeable; discuss it with the barber first.",
}


def face_note(name, shape, fit):
    reason = SHAPE_REASON[shape]
    if fit == "care":
        return f"{name} needs care for {shape} faces; the barber should check because {reason} matters here; customer preference comes first."
    return f"{name} is commonly suggested for {shape} faces because {reason}; customer preference comes first."


def build(oid, spec):
    group, name, pros, cons, maintenance, faces, problems = spec
    return group, {"id": oid, "name": name, "desc": DESC[oid], "pros": pros, "cons": cons, "maintenance": maintenance,
        "face_shape_fit": {s: {"fit": faces[s], "note": face_note(name, s, faces[s])} for s in SHAPES},
        "problem_fit": {p: {"fit": problems.get(p, "neutral"),
                            "note": PROBLEM_NOTE[problems.get(p, "neutral")].format(name=name)} for p in PROBLEMS},
        "source_ids": SRC}


def main():
    parts = json.loads(PATH.read_text(encoding="utf-8-sig"))
    for group in parts.values():
        for part in group:
            part["desc"] = DESC[part["id"]]
    for oid, spec in NEW.items():
        group, entry = build(oid, spec)
        if not any(p["id"] == oid for p in parts[group]):
            parts[group].append(entry)
    for group in parts.values():
        for part in group:
            part["hair_fit"] = {k: {"fit": fit, "note": note} for k, (fit, note) in HAIR.get(part["id"], {}).items()}
    PATH.write_text(json.dumps(parts, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print({g: len(v) for g, v in parts.items()})


if __name__ == "__main__":
    main()
