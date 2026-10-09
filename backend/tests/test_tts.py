"""Speech serves only scoped, persisted AI replies; no arbitrary text endpoint."""
import io
import json
import wave

import pytest
from fastapi.testclient import TestClient
from backend.app import db, main

ORIGIN = {"Origin": "https://localhost:8443"}


@pytest.fixture
def barber(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "test.db")
    with TestClient(main.app, base_url="https://localhost:8443", client=("127.0.0.1", 1)) as client:
        cid = client.post("/api/consultations", json={}, headers=ORIGIN).json()["id"]
        with db.connect() as conn:
            row = conn.execute("SELECT state_json FROM consultations WHERE id=?", (cid,)).fetchone()
            state = json.loads(row["state_json"])
            state["chat"] = [{"role": "customer", "text": "Maikli."}, {"role": "ai", "text": "Gaano kaikli sa gilid?"}]
            conn.execute("UPDATE consultations SET state_json=? WHERE id=?", (json.dumps(state), cid))
        yield client, cid


def test_speech_returns_audio_for_persisted_ai_turn(barber, monkeypatch):
    from backend.app import tts
    client, cid = barber
    def render(text):
        assert text == "Gaano kaikli sa gilid?"
        output = io.BytesIO()
        with wave.open(output, "wb") as wav:
            wav.setparams((1, 2, 16000, 0, "NONE", "not compressed"))
            wav.writeframes(b'\0\0' * 160)
        return output.getvalue()
    monkeypatch.setattr(tts, "synthesize", render)
    response = client.post(f"/api/consultations/{cid}/speech", json={"turn_index": 1}, headers=ORIGIN)
    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/wav"
    assert response.headers["cache-control"] == "no-store"
    with wave.open(io.BytesIO(response.content)) as wav:
        assert wav.getframerate() == 16000
        assert wav.getnframes() == 160


@pytest.mark.parametrize("body", [{"turn_index": 0}, {"turn_index": -1}, {"turn_index": 2}, {"turn_index": True}, {"turn_index": 1, "text": "Injected"}])
def test_speech_rejects_non_ai_or_invalid_turns(barber, body):
    client, cid = barber
    response = client.post(f"/api/consultations/{cid}/speech", json=body, headers=ORIGIN)
    assert response.status_code == 422


def test_speech_requires_origin_and_consultation_scope(barber):
    client, cid = barber
    path = f"/api/consultations/{cid}/speech"
    assert client.post(path, json={"turn_index": 1}).status_code == 403
    with TestClient(main.app, base_url="https://localhost:8443", client=("192.168.1.5", 1)) as remote:
        assert remote.post(path, json={"turn_index": 1}, headers=ORIGIN).status_code == 404


def test_missing_local_model_returns_unavailable_without_download(tmp_path, monkeypatch):
    from backend.app import tts
    monkeypatch.setattr(tts, "MODEL_PATH", tmp_path / "missing")
    monkeypatch.setattr(tts, "_model", None)
    from backend.app.errors import APIError
    with pytest.raises(APIError) as error:
        tts.synthesize("Kumusta!")
    assert error.value.code == "model_unavailable"


def test_spoken_numbers_and_markup_preserve_meaning():
    from backend.app.tts import speech_text
    assert speech_text("**GupAi**: 2 hanggang 3 minuto.\nAyos?") == "Gup ay: dalawa hanggang tatlo minuto. Ayos?"
    assert speech_text("12 at 25") == "labindalawa at dalawampu't lima"
    assert speech_text("2.5 cm") == "dalawa punto lima cm"


def test_paired_phone_can_hear_only_its_consultation(barber, monkeypatch):
    import hashlib
    from backend.app import tts
    client, cid = barber
    other = client.post("/api/consultations", json={}, headers=ORIGIN).json()["id"]
    with db.connect() as conn:
        conn.execute("UPDATE consultations SET phone_token_hash=? WHERE id=?", (hashlib.sha256(b"paired-test-token").hexdigest(), cid))
    monkeypatch.setattr(tts, "synthesize", lambda _: b"RIFF-test")
    with TestClient(main.app, base_url="https://localhost:8443", client=("192.168.1.5", 1)) as remote:
        remote.cookies.set("gupai_phone", "paired-test-token")
        assert remote.post(f"/api/consultations/{cid}/speech", json={"turn_index": 1}, headers=ORIGIN).status_code == 200
        assert remote.post(f"/api/consultations/{other}/speech", json={"turn_index": 1}, headers=ORIGIN).status_code == 404


def test_busy_voice_has_bounded_wait(monkeypatch):
    from backend.app import tts
    from backend.app.errors import APIError
    class BusyLock:
        def acquire(self, *, timeout):
            assert timeout == 45
            return False
    monkeypatch.setattr(tts, "_lock", BusyLock())
    with pytest.raises(APIError) as error:
        tts.synthesize("Kumusta")
    assert error.value.code == "in_use"


def test_synthesis_uses_fixed_reference_and_reuses_audio(monkeypatch):
    from backend.app import tts
    import numpy as np
    prompt = object()
    calls = []
    class Model:
        sampling_rate = 24000
        def generate(self, **kwargs):
            assert kwargs["voice_clone_prompt"] is prompt
            assert "instruct" not in kwargs
            calls.append(kwargs["text"])
            return [np.zeros(240, dtype=np.float32)]
    monkeypatch.setattr(tts, "_voice_prompt", prompt)
    monkeypatch.setattr(tts, "_load", lambda: Model())
    from collections import OrderedDict
    monkeypatch.setattr(tts, "_cache", OrderedDict())
    first = tts.synthesize("Magandang umaga!")
    second = tts.synthesize("Magandang umaga!")
    assert first == second
    assert len(calls) == 1


def test_cached_audio_does_not_wait_for_busy_model(monkeypatch):
    from backend.app import tts
    from collections import OrderedDict
    monkeypatch.setattr(tts, '_cache', OrderedDict({'Kumusta': b'cached-wav'}))
    class BusyLock:
        def acquire(self, **kwargs):
            raise AssertionError('Cached speech must not wait for inference')
    monkeypatch.setattr(tts, '_lock', BusyLock())
    assert tts.synthesize('Kumusta') == b'cached-wav'
