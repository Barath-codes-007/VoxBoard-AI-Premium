import os, tempfile
os.environ["VOXBOARD_DB"] = os.path.join(tempfile.mkdtemp(), "t.db")
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
import pytest
from app.main import app
c = TestClient(app)

def test_lesson_crud():
    i = c.post("/api/lessons", json={"title": "A", "data": {"pages": [{}, {}]}}).json()["id"]
    assert c.get(f"/api/lessons/{i}").json()["data"]["pages"] == [{}, {}]
    assert c.get("/api/lessons?q=A").json()[0]["pages"] == 2
    c.put(f"/api/lessons/{i}", json={"title": "B", "data": {}})
    assert c.get(f"/api/lessons/{i}").json()["title"] == "B"
    c.delete(f"/api/lessons/{i}")
    assert c.get(f"/api/lessons/{i}").status_code == 404

def test_ai_unconfigured():
    assert c.post("/api/ai", json={"task": "summary", "text": "x"}).status_code == 503

def test_pairing_and_rejection():
    s = c.post("/api/sessions").json()
    with pytest.raises(WebSocketDisconnect):
        with c.websocket_connect("/ws/000000?role=remote"): pass
    with pytest.raises(WebSocketDisconnect):
        with c.websocket_connect(f"/ws/{s['code']}?role=host&token=bad"): pass
    with c.websocket_connect(f"/ws/{s['code']}?role=host&token={s['token']}") as h:
        with c.websocket_connect(f"/ws/{s['code']}?role=remote") as r:
            assert h.receive_json()["remotes"] == 1
            r.send_json({"type": "x", "cmd": "undo"})
            assert h.receive_json()["cmd"] == "undo"


def test_recordings_crud_and_stt_unconfigured():
    i = "0f0f0f0f-1111-2222-3333-444444444444"
    assert c.post("/api/recordings", json={"id": i, "title": "L", "data": {"segments": [{"start": 0, "end": 1, "text": "x"}], "duration": 5}}).json()["id"] == i
    assert c.post("/api/recordings", json={"id": i}).status_code == 409
    assert c.get("/api/recordings").json()[0]["segments"] == 1
    assert c.get(f"/api/recordings/{i}").json()["data"]["duration"] == 5
    c.delete(f"/api/recordings/{i}")
    assert c.get(f"/api/recordings/{i}").status_code == 404
    assert c.get("/api/transcribe/info").json()["configured"] is False
    assert c.post("/api/transcribe", files={"file": ("a.webm", b"x", "audio/webm")}).status_code == 503


def test_offline_and_translate_unconfigured():
    i = c.get("/api/offline/info").json()
    assert i["engine"] == "vosk" and isinstance(i["models"], list)
    assert c.get("/api/translate/info").json()["configured"] is False
    assert c.post("/api/translate", json={"texts": ["hi"], "source": "en", "target": "ta"}).status_code == 503
    assert c.delete("/api/offline/models/nope").status_code == 404
