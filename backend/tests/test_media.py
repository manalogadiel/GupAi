"""C4 upload validation, canonical photos, persistence, and resource scope."""
import hashlib
import importlib
import io
import re
import sqlite3
import wave
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from PIL import Image


ORIGIN = {"Origin": "https://localhost:8443"}


@pytest.fixture
def setup(tmp_path, monkeypatch):
    db = importlib.import_module("backend.app.db")
    media = importlib.import_module("backend.app.media")
    main = importlib.import_module("backend.app.main")
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "gupai.db")
    monkeypatch.setattr(media, "MEDIA_DIR", tmp_path / "media", raising=False)
    db.initialize()
    ids = [str(uuid4()), str(uuid4())]
    with db.connect() as conn:
        for consultation_id in ids:
            conn.execute(
                "INSERT INTO consultations (id,status,stage,state_json,started_at,phone_token_hash) "
                "VALUES (?,?,?,?,?,?)",
                (consultation_id, "active", "photos", "{}", "2026-10-09T00:00:00+00:00",
                 hashlib.sha256(("token-" + consultation_id).encode()).hexdigest()),
            )
    with TestClient(main.app, base_url="https://localhost:8443",
                    client=("127.0.0.1", 12345)) as client:
        yield client, db, media, ids


def photo(fmt="JPEG", size=(32, 16), exif=None):
    output = io.BytesIO()
    Image.new("RGB", size, "red").save(output, fmt, **({"exif": exif} if exif else {}))
    return output.getvalue()


def upload(setup, content, kind="photo", view="front", consultation_id=None,
           filename="../../untrusted.svg"):
    client, _, _, ids = setup
    fields = {"kind": kind}
    if view is not None:
        fields["view"] = view
    return client.post("/api/consultations/" + (consultation_id or ids[0]) + "/media",
                       data=fields, files={"file": (filename, content, "application/octet-stream")},
                       headers=ORIGIN)


def assert_empty(setup):
    _, db, media, _ = setup
    with db.connect() as conn:
        assert conn.execute("SELECT count(*) FROM media").fetchone()[0] == 0
    assert not media.MEDIA_DIR.exists() or not list(media.MEDIA_DIR.iterdir())


@pytest.mark.parametrize("content", [b'<svg onload="alert(1)"/>', b"", b"GIF89a",
                                     b"\xff\xd8\xffnot-a-jpeg",
                                     b"RIFFxxxxAVI not-webp"])
def test_unsupported_or_corrupt_photo_is_415_and_not_persisted(setup, content):
    response = upload(setup, content)
    assert response.status_code == 415
    assert response.json()["code"] == "unsupported_media"
    assert_empty(setup)


@pytest.mark.parametrize("kind,size", [("photo", 9 * 1024 * 1024),
                                      ("audio", 2 * 1024 * 1024 + 1)])
def test_size_caps_reject_before_persistence(setup, kind, size):
    response = upload(setup, b"x" * size, kind, None if kind == "audio" else "front")
    assert response.status_code == 413
    assert response.json()["code"] == "too_large"
    assert_empty(setup)


@pytest.mark.parametrize("fmt", ["JPEG", "PNG", "WEBP"])
def test_photo_round_trip_canonical_jpeg_and_random_storage(setup, fmt):
    client, db, media, ids = setup
    response = upload(setup, photo(fmt, (2048, 1024)))
    assert response.status_code == 200
    result = response.json()
    assert result == {"id": result["id"], "kind": "photo", "view": "front",
                      "url": "/api/media/" + result["id"]}
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM media WHERE id=?", (result["id"],)).fetchone()
    assert row["consultation_id"] == ids[0]
    assert row["keep"] == 0
    assert re.fullmatch(r"[0-9a-f]{32}\.jpg", row["storage_key"])
    stored = media.MEDIA_DIR / row["storage_key"]
    fetched = client.get(result["url"])
    assert fetched.status_code == 200
    assert fetched.headers["content-type"] == "image/jpeg"
    assert fetched.headers["cache-control"] == "no-store"
    assert fetched.content == stored.read_bytes()
    with Image.open(io.BytesIO(fetched.content)) as image:
        assert image.format == "JPEG"
        assert image.size == (1024, 512)
        assert not image.getexif()


def test_exif_orientation_applied_before_resize_and_all_metadata_stripped(setup):
    client, _, _, _ = setup
    exif = Image.Exif()
    exif[274] = 6
    exif[315] = "private-name"
    response = upload(setup, photo(size=(2048, 1024), exif=exif))
    assert response.status_code == 200
    with Image.open(io.BytesIO(client.get(response.json()["url"]).content)) as image:
        assert image.size == (512, 1024)
        assert not image.getexif()
        assert "exif" not in image.info


@pytest.mark.parametrize("kind,view", [("other", "front"), ("photo", None),
                                      ("photo", "back"), ("audio", "front")])
def test_invalid_kind_or_view_returns_422(setup, kind, view):
    response = upload(setup, photo(), kind, view)
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_input"
    assert_empty(setup)


def audio_bytes(fmt):
    if fmt == "wav":
        output = io.BytesIO()
        with wave.open(output, "wb") as audio:
            audio.setnchannels(1)
            audio.setsampwidth(2)
            audio.setframerate(16000)
            audio.writeframes(b"\0\0" * 160)
        return output.getvalue()
    # Signature fixtures; decoding these containers belongs to the transcribe job.
    return {"webm": b"\x1a\x45\xdf\xa3" + b"\x80" * 20,
            "ogg": b"OggS\x00" + b"\0" * 27,
            "mp4": b"\0\0\0\x18ftypM4A \0\0\0\0M4A isom"}[fmt]


@pytest.mark.parametrize("fmt", ["webm", "ogg", "wav", "mp4"])
def test_audio_stays_on_disk_until_delete_helper_and_is_not_served_as_image(setup, fmt):
    client, db, media, _ = setup
    content = audio_bytes(fmt)
    response = upload(setup, content, "audio", None)
    assert response.status_code == 200
    result = response.json()
    assert result["view"] is None
    assert result["url"] == "/api/media/" + result["id"]
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM media WHERE id=?", (result["id"],)).fetchone()
    stored = media.MEDIA_DIR / row["storage_key"]
    assert re.fullmatch(r"[0-9a-f]{32}\." + fmt, row["storage_key"])
    assert stored.read_bytes() == content
    assert client.get(result["url"]).status_code == 404
    media.delete_media(result["id"])
    assert not stored.exists()
    with db.connect() as conn:
        assert conn.execute("SELECT * FROM media WHERE id=?", (result["id"],)).fetchone() is None
    media.delete_media(result["id"])  # Job cleanup can run more than once.


@pytest.mark.parametrize("brand", [b"iso5", b"iso8", b"mp4a", b"dash"])
def test_mp4_audio_accepted_for_any_browser_brand(setup, brand):
    # Safari's MediaRecorder brand varies by release; decoding validates the track later.
    content = b"\0\0\0\x18ftyp" + brand + b"\0\0\0\0" + brand + b"isom"
    assert upload(setup, content, "audio", None).status_code == 200


@pytest.mark.parametrize("content", [b"<svg/>", b"RIFFxxxxAVI ", b"xxxxftypM4A ",
                                     b"OggS", b"\x1a\x45\xdf\xa3"])
def test_unsupported_audio_rejected(setup, content):
    assert upload(setup, content, "audio", None).status_code == 415
    assert_empty(setup)


def test_phone_scope_checks_upload_and_fetch_without_leaking_other_media(setup):
    client, db, _, ids = setup
    first = upload(setup, photo()).json()
    second = upload(setup, photo(), consultation_id=ids[1]).json()
    with TestClient(client.app, base_url="https://localhost:8443",
                    client=("192.168.1.7", 12345)) as phone:
        phone.cookies.set("gupai_phone", "token-" + ids[0])
        assert phone.get(first["url"]).status_code == 200
        assert phone.get(second["url"]).status_code == 404
        rejected = phone.post("/api/consultations/" + ids[1] + "/media",
                              data={"kind": "photo", "view": "front"},
                              files={"file": ("image.jpg", photo())}, headers=ORIGIN)
        assert rejected.status_code == 404
        allowed = phone.post("/api/consultations/" + ids[0] + "/media",
                             data={"kind": "photo", "view": "side"},
                             files={"file": ("image.jpg", photo())}, headers=ORIGIN)
        assert allowed.status_code == 200
        phone.cookies.clear()
        assert phone.get(first["url"]).status_code == 404
        phone.cookies.set("gupai_phone", "token-" + ids[0])
        with db.connect() as conn:
            conn.execute("UPDATE consultations SET phone_token_hash=NULL WHERE id=?", (ids[0],))
        assert phone.get(first["url"]).status_code == 404


def test_missing_consultation_and_missing_file_are_real_404s(setup):
    client, _, media, _ = setup
    assert upload(setup, photo(), consultation_id=str(uuid4())).status_code == 404
    assert_empty(setup)
    response = upload(setup, photo())
    assert response.status_code == 200
    next(media.MEDIA_DIR.iterdir()).unlink()
    assert client.get(response.json()["url"]).status_code == 404
    assert client.get("/api/media/" + str(uuid4())).status_code == 404


def test_database_failure_cleans_up_new_file(setup, monkeypatch):
    _, db, _, _ = setup
    original = db.connect
    from contextlib import contextmanager

    class FailingInsert:
        def __init__(self, conn):
            self.conn = conn

        def execute(self, sql, parameters=()):
            if sql.startswith("INSERT INTO media"):
                raise sqlite3.OperationalError("disk full")
            return self.conn.execute(sql, parameters)

    @contextmanager
    def fail_insert(*args, **kwargs):
        with original(*args, **kwargs) as conn:
            yield FailingInsert(conn)

    monkeypatch.setattr(db, "connect", fail_insert)
    with pytest.raises(sqlite3.OperationalError):
        upload(setup, photo())
    monkeypatch.setattr(db, "connect", original)
    assert_empty(setup)


@pytest.mark.parametrize("kind,limit", [("photo", 8 * 1024 * 1024),
                                       ("audio", 2 * 1024 * 1024)])
def test_exact_size_limit_is_accepted(setup, kind, limit):
    content = photo() if kind == "photo" else audio_bytes("wav")
    content += b"\0" * (limit - len(content))
    assert upload(setup, content, kind, "side" if kind == "photo" else None).status_code == 200


def test_decompression_bomb_is_rejected_without_persistence(setup, monkeypatch):
    content = photo(size=(32, 32))
    monkeypatch.setattr(Image, "MAX_IMAGE_PIXELS", 600)
    assert upload(setup, content).status_code == 415
    assert_empty(setup)


def test_storage_key_cannot_escape_media_directory_for_fetch_or_delete(setup):
    client, db, media, _ = setup
    result = upload(setup, photo()).json()
    outside = media.MEDIA_DIR.parent / "outside.jpg"
    outside.write_bytes(b"private")
    with db.connect() as conn:
        conn.execute("UPDATE media SET storage_key=? WHERE id=?", ("../outside.jpg", result["id"]))
    assert client.get(result["url"]).status_code == 404
    errors = importlib.import_module("backend.app.errors")
    with pytest.raises(errors.APIError) as exc:
        media.delete_media(result["id"])
    assert exc.value.code == "not_found"
    assert outside.read_bytes() == b"private"


def test_delete_cleans_row_when_file_already_missing(setup):
    _, db, media, _ = setup
    result = upload(setup, audio_bytes("wav"), "audio", None).json()
    next(media.MEDIA_DIR.iterdir()).unlink()
    media.delete_media(result["id"])
    with db.connect() as conn:
        assert conn.execute("SELECT id FROM media WHERE id=?", (result["id"],)).fetchone() is None
