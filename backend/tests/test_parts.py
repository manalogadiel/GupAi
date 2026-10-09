"""K2: validate the offline, composable haircut-parts catalog contract."""
import json
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]
IDS = {
    "sides": {"skin_fade", "low_fade", "mid_fade", "high_fade", "drop_fade", "burst_fade", "taper",
              "undercut", "scissor_over_comb", "uniform"},
    "top": {"textured_crop", "french_crop", "side_part", "comb_over", "quiff", "pompadour", "slick_back",
            "curtains", "messy_fringe", "two_block", "faux_hawk", "keep_length", "buzz"},
}
SHAPES = {"oval", "round", "square", "oblong", "heart", "diamond"}
PROBLEMS = {"puffy_sides", "cowlick", "hard_to_style", "grows_fast", "flat_top", "wide_forehead"}


def load_parts():
    path = ROOT / "knowledge/parts.json"
    assert path.is_file(), "K2 requires an offline knowledge/parts.json catalog"
    return json.loads(path.read_text(encoding="utf8"))


def test_exact_groups_and_unique_ids():
    parts = load_parts()
    assert set(parts) == set(IDS)
    for group, expected in IDS.items():
        assert isinstance(parts[group], list)
        assert len(parts[group]) == len(expected)
        assert {part["id"] for part in parts[group]} == expected


@pytest.mark.parametrize("group", ["sides", "top"])
def test_fields_and_complete_fit_maps(group):
    parts = load_parts()
    for part in parts[group]:
        assert set(part) == {
            "id", "name", "desc", "pros", "cons", "maintenance",
            "face_shape_fit", "problem_fit", "hair_fit", "source_ids",
        }
        assert isinstance(part["desc"], str) and 10 < len(part["desc"]) <= 120
        assert set(part["hair_fit"]) <= {"thin", "thick", "wavy", "curly", "coily"}
        assert all(e["fit"] in {"helps", "care"} and e["note"].strip() for e in part["hair_fit"].values())
        for field in ("id", "name", "maintenance"):
            assert isinstance(part[field], str) and part[field].strip()
        for field, minimum in (("pros", 2), ("cons", 1)):
            assert isinstance(part[field], list)
            assert minimum <= len(part[field]) <= 3
            assert all(isinstance(text, str) and text.strip() for text in part[field])
        for field, keys, enums in (
            ("face_shape_fit", SHAPES, {"suggested", "neutral", "care"}),
            ("problem_fit", PROBLEMS, {"helps", "neutral", "worse"}),
        ):
            assert set(part[field]) == keys
            for entry in part[field].values():
                assert set(entry) == {"fit", "note"}
                assert entry["fit"] in enums
                assert isinstance(entry["note"], str) and entry["note"].strip()


def test_citations_reference_existing_sources():
    parts = load_parts()
    sources = json.loads((ROOT / "knowledge/sources.json").read_text(encoding="utf8"))
    known = {source["id"] for source in sources}
    for group in parts.values():
        for part in group:
            assert isinstance(part["source_ids"], list) and part["source_ids"]
            assert all(isinstance(source_id, str) for source_id in part["source_ids"])
            assert len(part["source_ids"]) == len(set(part["source_ids"]))
            assert set(part["source_ids"]) <= known
