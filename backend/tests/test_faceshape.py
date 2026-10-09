"""C5: PRD rule precedence, boundary uncertainty, geometry and local inference."""
import importlib
import json
import math
from pathlib import Path
from types import SimpleNamespace

import pytest
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]


def module():
    return importlib.import_module("backend.app.faceshape")


@pytest.mark.parametrize("ratios, expected", [
    ((1.65, .76, .95), ["oblong"]),
    ((1.05, .96, .96), ["square"]),
    ((1.05, .75, .95), ["round"]),
    ((1.30, .70, .95), ["heart"]),
    ((1.30, .75, .75), ["diamond"]),
    ((1.30, .96, .96), ["square"]),
    ((1.30, .84, .91), ["oval"]),
])
def test_rule_table_and_precedence(ratios, expected):
    assert module().classify_ratios(*ratios) == expected


@pytest.mark.parametrize("ratios, expected", [
    ((1.50, .80, .90), ["oblong", "oval"]),
    ((1.15, .75, .95), ["round", "heart"]),
    ((1.30, .70, .82), ["heart", "diamond"]),
    ((1.30, .80, .85), ["oval", "diamond"]),
    ((1.30, .85, .80), ["oval", "diamond"]),
    ((1.30, .90, .95), ["square", "oval"]),
    ((1.46, .80, .90), ["oval", "oblong"]),
    ((1.54, .80, .90), ["oblong", "oval"]),
    ((1.459, .84, .91), ["oval"]),
    ((1.541, .80, .90), ["oblong"]),
    # A boundary masked by an earlier rule must not invent an alternative.
    ((1.65, .90, .85), ["oblong"]),
])
def test_between_band_inclusive_and_only_effective_boundaries(ratios, expected):
    assert module().classify_ratios(*ratios) == expected


@pytest.mark.parametrize("ratios", [(0, .8, .9), (1.3, -.8, .9),
                                      (math.nan, .8, .9), (1.3, math.inf, .9)])
def test_invalid_ratios_rejected(ratios):
    with pytest.raises(ValueError):
        module().classify_ratios(*ratios)


def landmarks():
    points = [SimpleNamespace(x=.5, y=.5, z=0) for _ in range(478)]
    # 200x100 image: C=100px, L=130px, J=80px, F=90px.
    for index, x, y in [(10,.5,-.15), (152,.5,1.15), (234,.25,.5),
                         (454,.75,.5), (172,.3,.8), (397,.7,.8),
                         (54,.275,.2), (284,.725,.2)]:
        points[index] = SimpleNamespace(x=x, y=y, z=99)
    return points


def test_landmarks_use_pixel_aspect_ratio_and_return_only_outline():
    result = module().result_from_landmarks(landmarks(), 200, 100)
    assert result["ratios"] == pytest.approx({"lw":1.3, "jw":.8, "fw":.9})
    assert result["suggested"] == ["oval", "heart"]
    assert result["confirmed"] is None
    assert result["face_found"] is True
    assert len(result["outline"]) == 36
    assert result["outline"][0] == [.5, 0]
    assert result["outline"][18] == [.5, 1]
    assert all(0 <= value <= 1 for point in result["outline"] for value in point)
    assert set(result) == {"ratios", "suggested", "confirmed", "face_found", "outline"}


def test_degenerate_landmarks_rejected():
    with pytest.raises(ValueError):
        module().result_from_landmarks([SimpleNamespace(x=.5,y=.5)] * 478, 100, 100)


def test_no_face_image_runs_real_bundled_model(tmp_path):
    image = tmp_path / "blank.jpg"
    Image.new("RGB", (128,128), "white").save(image)
    assert module().estimate_face_shape(image) == {
        "face_found": False, "suggested": [], "confirmed": None,
        "ratios": {"lw":0.0, "jw":0.0, "fw":0.0}, "outline": []}


def test_missing_model_returns_real_error(tmp_path):
    from backend.app.errors import APIError
    with pytest.raises(APIError) as error:
        module().estimate_face_shape(tmp_path / "photo.jpg", model_path=tmp_path / "absent.task")
    assert error.value.code == "model_unavailable"


def test_catalog_contract_and_citations():
    catalog = json.loads((ROOT / "knowledge/catalog.json").read_text(encoding="utf8"))
    sources = json.loads((ROOT / "knowledge/sources.json").read_text(encoding="utf8"))
    source_ids = {source["id"] for source in sources}
    assert len(source_ids) == len(sources) == 6
    assert {style["id"] for style in catalog} == {
        "crew_cut", "buzz_cut", "side_part", "textured_crop", "curtains", "short_quiff"}
    assert len(catalog) == 6
    for style in catalog:
        assert style["image"] == f'/assets/catalog/{style["id"]}.svg'
        assert style["effort"] in {"low","medium","high"}
        assert all(style[key] for key in ("name","stays","changes","maintenance","limitations","source_ids"))
        assert set(style["source_ids"]) <= source_ids
        assert set(style["face_shape_notes"]) == {"oval","round","square","oblong","heart","diamond"}
        for note in style["face_shape_notes"].values():
            assert note["fit"] in {"suggested","neutral","care"}
            assert "commonly suggested" in note["note"].lower()
            assert "because" in note["note"].lower()
            assert note["source_ids"] and set(note["source_ids"]) <= source_ids
        assert "sources disagree" in style["face_shape_notes"]["oblong"]["note"].lower()
    by_id = {style["id"]: style for style in catalog}
    assert by_id["buzz_cut"]["face_shape_notes"]["round"]["fit"] == "care"
    assert by_id["short_quiff"]["face_shape_notes"]["round"]["fit"] == "suggested"
    assert by_id["curtains"]["face_shape_notes"]["heart"]["fit"] == "suggested"
