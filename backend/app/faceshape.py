"""Local face-shape heuristic; job results only, with no persistence or identity data."""
from math import hypot, isfinite
from pathlib import Path

from .errors import APIError

MODEL_PATH = Path(__file__).resolve().parents[2] / "knowledge/models/face_landmarker.task"
# Ordered around the perimeter, starting at the forehead (MediaPipe FACE_OVAL).
FACE_OVAL = (10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
             397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
             172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109)


def _shape(lw, jw, fw):
    if lw >= 1.50:
        return "oblong"
    if lw <= 1.15:
        return "square" if jw >= .90 else "round"
    if fw - jw >= .12:
        return "heart"
    if fw < .85 and jw < .85:
        return "diamond"
    if jw >= .90:
        return "square"
    return "oval"


def classify_ratios(lw: float, jw: float, fw: float) -> list[str]:
    """PRD section 12 in order; primary shape then one adjacent alternative.

    Cross nearby boundaries independently; masked boundaries cannot add a shape.
    At multiple boundaries, prefer the first alternative in PRD rule order.
    """
    if not all(isfinite(value) and value > 0 for value in (lw, jw, fw)):
        raise ValueError("Ratios must be finite and positive.")
    suggested = [_shape(lw, jw, fw)]
    # Each entry is (value, threshold, ratio index to vary).
    boundaries = ((lw, 1.50, 0), (lw, 1.15, 0),
                  (fw - jw, .12, 2), (fw, .85, 2),
                  (jw, .85, 1), (jw, .90, 1))
    for value, threshold, index in boundaries:
        if abs(value - threshold) > .04 + 1e-12:
            continue
        for side in (-1, 1):
            ratios = [lw, jw, fw]
            ratios[index] += threshold - value + side * 1e-9
            alternative = _shape(*ratios)
            if alternative not in suggested:
                return suggested + [alternative]
    return suggested


def result_from_landmarks(landmarks, width: int, height: int) -> dict:
    """Measure 2D pixel distances; discard z and all non-outline landmarks."""
    if width <= 0 or height <= 0 or len(landmarks) <= max(FACE_OVAL):
        raise ValueError("Invalid landmark geometry.")
    if not all(isfinite(p.x) and isfinite(p.y) for p in landmarks):
        raise ValueError("Invalid landmark coordinates.")

    def distance(a, b):
        return hypot((landmarks[a].x - landmarks[b].x) * width,
                     (landmarks[a].y - landmarks[b].y) * height)

    cheek = distance(234, 454)
    if cheek <= 0:
        raise ValueError("Cheek width must be positive.")
    ratios = {"lw": distance(10, 152) / cheek,
              "jw": distance(172, 397) / cheek,
              "fw": distance(54, 284) / cheek}
    outline = [[min(1.0, max(0.0, landmarks[i].x)),
                min(1.0, max(0.0, landmarks[i].y))] for i in FACE_OVAL]
    return {"suggested": classify_ratios(**ratios), "ratios": ratios,
            "outline": outline, "confirmed": None, "face_found": True}


def estimate_face_shape(image_path: str | Path, *, model_path: str | Path | None = None) -> dict:
    """Run on an internal canonical front-photo path, resolved by the scoped job.

    Returns the API FaceShapeResult. No-face ratios are zero sentinels, never
    measurements; callers must check face_found. No file or database writes.
    """
    model = Path(model_path) if model_path is not None else MODEL_PATH
    if not model.is_file():
        raise APIError("model_unavailable", "Face landmarker is not ready.", retryable=True)
    try:
        import mediapipe as mp
        from mediapipe.tasks.python import vision
    except ImportError as exc:
        raise APIError("model_unavailable", "Face landmarker is not ready.", retryable=True) from exc
    try:
        image = mp.Image.create_from_file(str(image_path))
    except (OSError, RuntimeError, ValueError) as exc:
        raise APIError("invalid_input", "Use a valid front photo.") from exc
    # shortcut: load model per job, reuse a worker-owned detector if measured latency requires it.
    options = vision.FaceLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=str(model)),
        running_mode=vision.RunningMode.IMAGE, num_faces=1,
        output_face_blendshapes=False, output_facial_transformation_matrixes=False)
    try:
        with vision.FaceLandmarker.create_from_options(options) as detector:
            detection = detector.detect(image)
    except (OSError, RuntimeError, ValueError) as exc:
        raise APIError("model_unavailable", "Face landmarker could not run.", retryable=True) from exc
    if not detection.face_landmarks:
        return {"suggested": [], "ratios": {"lw": 0.0, "jw": 0.0, "fw": 0.0},
                "outline": [], "confirmed": None, "face_found": False}
    # shortcut: uncalibrated PRD thresholds, tune with consenting photos after barber validation.
    return result_from_landmarks(detection.face_landmarks[0], image.width, image.height)
