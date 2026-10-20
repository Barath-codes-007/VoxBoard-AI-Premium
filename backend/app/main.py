import importlib.util, json, os, re, secrets, shutil, sqlite3, subprocess, tempfile, time, uuid
from starlette.concurrency import run_in_threadpool
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

DB = os.environ.get("VOXBOARD_DB", "voxboard.db")
app = FastAPI(title="VoxBoard AI")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

def db():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    c.execute("create table if not exists lessons(id text primary key,title text,data text,created real,modified real)")
    c.execute("create table if not exists recordings(id text primary key,title text,data text,created real,modified real)")
    return c

class LessonIn(BaseModel):
    title: str = Field(default="Untitled lesson", max_length=120)
    data: dict = {}

@app.get("/api/lessons")
def list_lessons(q: str = ""):
    with db() as c:
        rows = c.execute("select id,title,created,modified,data from lessons where title like ? order by modified desc", (f"%{q}%",)).fetchall()
    return [{"id": r["id"], "title": r["title"], "created": r["created"], "modified": r["modified"],
             "pages": len(json.loads(r["data"]).get("pages", []))} for r in rows]

@app.post("/api/lessons")
def create_lesson(l: LessonIn):
    i, t = uuid.uuid4().hex, time.time()
    with db() as c:
        c.execute("insert into lessons values(?,?,?,?,?)", (i, l.title, json.dumps(l.data), t, t))
    return {"id": i}

@app.get("/api/lessons/{i}")
def get_lesson(i: str):
    with db() as c:
        r = c.execute("select * from lessons where id=?", (i,)).fetchone()
    if not r: raise HTTPException(404, "Lesson not found")
    return {"id": i, "title": r["title"], "data": json.loads(r["data"]), "modified": r["modified"]}

@app.put("/api/lessons/{i}")
def save_lesson(i: str, l: LessonIn):
    raw = json.dumps(l.data)
    if len(raw) > 250_000_000: raise HTTPException(413, "Lesson too large")
    with db() as c:
        n = c.execute("update lessons set title=?,data=?,modified=? where id=?", (l.title, raw, time.time(), i)).rowcount
    if not n: raise HTTPException(404, "Lesson not found")
    return {"ok": True}

@app.delete("/api/lessons/{i}")
def delete_lesson(i: str):
    with db() as c: c.execute("delete from lessons where id=?", (i,))
    return {"ok": True}

@app.post("/api/lessons/{i}/duplicate")
def duplicate(i: str):
    l = get_lesson(i)
    return create_lesson(LessonIn(title=l["title"] + " (copy)", data=l["data"]))

class AIReq(BaseModel):
    task: str
    text: str = Field(max_length=20000)

@app.post("/api/ai")
def ai(r: AIReq):
    if os.environ.get("AI_PROVIDER", "none") == "none" or not os.environ.get("AI_API_KEY"):
        raise HTTPException(503, "AI is not configured. Set AI_PROVIDER and AI_API_KEY in .env (see README).")
    raise HTTPException(501, "No provider adapter is implemented yet.")

# ---- pairing + realtime ----
sessions: dict[str, dict] = {}

@app.post("/api/sessions")
def new_session():
    for k in [k for k, v in sessions.items() if time.time() - v["t"] > 21600]: sessions.pop(k, None)
    code = "".join(secrets.choice("0123456789") for _ in range(6))
    while code in sessions: code = "".join(secrets.choice("0123456789") for _ in range(6))
    sessions[code] = {"token": secrets.token_urlsafe(16), "host": None, "remotes": set(), "t": time.time()}
    return {"code": code, "token": sessions[code]["token"]}

@app.websocket("/ws/{code}")
async def ws(sock: WebSocket, code: str, role: str = "remote", token: str = ""):
    s = sessions.get(code)
    if not s or time.time() - s["t"] > 21600 or (role == "host" and token != s["token"]) or role not in ("host", "remote"):
        await sock.close(code=4401); return
    await sock.accept()
    if role == "host": s["host"] = sock
    else: s["remotes"].add(sock)
    if s["host"]: await s["host"].send_json({"type": "status", "remotes": len(s["remotes"])})
    try:
        while True:
            m = await sock.receive_json()
            if role == "remote" and s["host"]:
                await s["host"].send_json({"type": "cmd", **{k: v for k, v in m.items() if k != "type"}})
            elif role == "host":
                for r in list(s["remotes"]): await r.send_json(m)
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        if role == "host": s["host"] = None
        else:
            s["remotes"].discard(sock)
            if s["host"]:
                try: await s["host"].send_json({"type": "status", "remotes": len(s["remotes"])})
                except Exception: pass


# ---- lecture recordings (metadata + transcript only; audio stays in the browser) ----
class RecIn(BaseModel):
    id: str | None = Field(default=None, pattern=r"^[0-9a-fA-F-]{8,40}$")
    title: str = Field(default="Untitled recording", max_length=160)
    data: dict = {}

@app.get("/api/recordings")
def rec_list(q: str = ""):
    with db() as c:
        rows = c.execute("select * from recordings where title like ? order by created desc", (f"%{q}%",)).fetchall()
    out = []
    for r in rows:
        d = json.loads(r["data"])
        out.append({"id": r["id"], "title": r["title"], "created": r["created"], "lang": d.get("lang", ""), "duration": d.get("duration", 0),
                    "segments": len(d.get("segments", [])), "bookmarks": len(d.get("bookmarks", []))})
    return out

@app.post("/api/recordings")
def rec_create(r: RecIn):
    i, t, raw = r.id or uuid.uuid4().hex, time.time(), json.dumps(r.data)
    if len(raw) > 20_000_000: raise HTTPException(413, "Recording record too large")
    try:
        with db() as c: c.execute("insert into recordings values(?,?,?,?,?)", (i, r.title, raw, t, t))
    except sqlite3.IntegrityError:
        raise HTTPException(409, "Recording already exists")
    return {"id": i}

@app.get("/api/recordings/{i}")
def rec_get(i: str):
    with db() as c: r = c.execute("select * from recordings where id=?", (i,)).fetchone()
    if not r: raise HTTPException(404, "Recording not found")
    return {"id": i, "title": r["title"], "data": json.loads(r["data"]), "created": r["created"]}

@app.put("/api/recordings/{i}")
def rec_save(i: str, r: RecIn):
    raw = json.dumps(r.data)
    if len(raw) > 20_000_000: raise HTTPException(413, "Recording record too large")
    with db() as c: n = c.execute("update recordings set title=?,data=?,modified=? where id=?", (r.title, raw, time.time(), i)).rowcount
    if not n: raise HTTPException(404, "Recording not found")
    return {"ok": True}

@app.delete("/api/recordings/{i}")
def rec_delete(i: str):
    with db() as c: c.execute("delete from recordings where id=?", (i,))
    return {"ok": True}

@app.get("/api/transcribe/info")
def stt_info():
    p = os.environ.get("STT_PROVIDER", "none")
    return {"provider": p, "configured": p != "none" and bool(os.environ.get("STT_API_KEY")), "max_mb": 25}

@app.post("/api/transcribe")
async def transcribe(file: UploadFile = File(...), language: str = Form("")):
    prov, key = os.environ.get("STT_PROVIDER", "none"), os.environ.get("STT_API_KEY", "")
    if prov == "none" or not key:
        raise HTTPException(503, "Saved-audio transcription is not configured. Set STT_PROVIDER=openai and STT_API_KEY on the backend (see README).")
    data = await file.read()
    if len(data) > 25 * 1024 * 1024: raise HTTPException(413, "Audio is larger than 25 MB, the provider limit.")
    import httpx
    base = os.environ.get("STT_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    form = {"model": os.environ.get("STT_MODEL", "whisper-1"), "response_format": "verbose_json"}
    if language: form["language"] = language[:3]
    try:
        async with httpx.AsyncClient(timeout=600) as c:
            r = await c.post(base + "/audio/transcriptions", headers={"Authorization": "Bearer " + key},
                             files={"file": (file.filename or "audio.webm", data, file.content_type or "audio/webm")}, data=form)
    except httpx.HTTPError:
        raise HTTPException(502, "Could not reach the transcription service.")
    if r.status_code != 200: raise HTTPException(502, f"Transcription service returned an error ({r.status_code}).")
    j = r.json()
    return {"text": j.get("text", ""), "segments": [{"start": float(s["start"]), "end": float(s["end"]), "text": str(s["text"]).strip()} for s in j.get("segments", [])]}


# ---- offline transcription (optional Vosk engine; models are folders in backend/models) ----
MODELS = os.environ.get("VOSK_MODELS_DIR", os.path.join(os.path.dirname(os.path.dirname(__file__)), "models"))

def _models():
    out = []
    if os.path.isdir(MODELS):
        for n in sorted(os.listdir(MODELS)):
            p = os.path.join(MODELS, n)
            if os.path.isdir(p):
                size = sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(p) for f in fs) // 1_000_000
                m = re.search(r"model(?:-small)?-([a-z]{2,3})(?:-|$)", n.lower())
                out.append({"name": n, "size_mb": size, "langs": [m.group(1)] if m else []})
    return out

@app.get("/api/offline/info")
def offline_info():
    base = MODELS if os.path.isdir(MODELS) else os.path.dirname(MODELS)
    return {"engine": "vosk", "installed": importlib.util.find_spec("vosk") is not None, "ffmpeg": shutil.which("ffmpeg") is not None,
            "models": _models(), "free_mb": shutil.disk_usage(base).free // 1_000_000, "models_dir": MODELS}

@app.delete("/api/offline/models/{name}")
def offline_remove(name: str):
    if name not in [m["name"] for m in _models()]: raise HTTPException(404, "Model not found")
    shutil.rmtree(os.path.join(MODELS, name)); return {"ok": True}

def _vosk_run(src, model_dir):
    import wave, vosk
    wav = src + ".wav"
    subprocess.run(["ffmpeg", "-y", "-i", src, "-ar", "16000", "-ac", "1", "-f", "wav", wav], check=True, capture_output=True)
    wf = wave.open(wav, "rb"); rec = vosk.KaldiRecognizer(vosk.Model(model_dir), wf.getframerate()); rec.SetWords(True); segs = []
    def take(r):
        w = r.get("result", [])
        if r.get("text") and w: segs.append({"start": w[0]["start"], "end": w[-1]["end"], "text": r["text"]})
    while True:
        d = wf.readframes(4000)
        if not d: break
        if rec.AcceptWaveform(d): take(json.loads(rec.Result()))
    take(json.loads(rec.FinalResult())); return segs

@app.post("/api/offline/transcribe")
async def offline_transcribe(file: UploadFile = File(...), language: str = Form("")):
    info = offline_info()
    if not info["installed"]: raise HTTPException(503, "No offline engine is installed. Install vosk on the backend (see README).")
    if not info["ffmpeg"]: raise HTTPException(503, "ffmpeg was not found on the backend.")
    m = next((x for x in info["models"] if language[:3].lower() in x["langs"]), None)
    if not m: raise HTTPException(503, "No installed offline model matches this language.")
    data = await file.read()
    if len(data) > 300 * 1024 * 1024: raise HTTPException(413, "Audio file is too large.")
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "in.audio")
        with open(p, "wb") as fh: fh.write(data)
        try: segs = await run_in_threadpool(_vosk_run, p, os.path.join(MODELS, m["name"]))
        except Exception: raise HTTPException(500, "Offline transcription failed.")
    if not segs: raise HTTPException(422, "No speech was recognized.")
    return {"segments": segs}

# ---- translation (LibreTranslate-compatible server; may be self-hosted on this machine) ----
@app.get("/api/translate/info")
def tr_info():
    from urllib.parse import urlparse
    u = os.environ.get("TRANSLATE_URL", "")
    return {"configured": bool(u), "local": (urlparse(u).hostname or "") in ("localhost", "127.0.0.1", "::1")}

class TrIn(BaseModel):
    texts: list[str] = Field(max_length=500)
    source: str = Field(max_length=8)
    target: str = Field(max_length=8)

@app.post("/api/translate")
async def translate(t: TrIn):
    u = os.environ.get("TRANSLATE_URL", "").rstrip("/")
    if not u: raise HTTPException(503, "Translation is not configured. Set TRANSLATE_URL to a LibreTranslate-compatible server (see README).")
    if sum(len(x) for x in t.texts) > 200_000: raise HTTPException(413, "Text is too long to translate at once.")
    import httpx
    body = {"q": t.texts, "source": t.source, "target": t.target, "format": "text"}
    if os.environ.get("TRANSLATE_API_KEY"): body["api_key"] = os.environ["TRANSLATE_API_KEY"]
    try:
        async with httpx.AsyncClient(timeout=120) as c: r = await c.post(u + "/translate", json=body)
    except httpx.HTTPError: raise HTTPException(502, "Could not reach the translation server.")
    if r.status_code != 200: raise HTTPException(502, f"Translation server returned an error ({r.status_code}).")
    d = r.json().get("translatedText")
    if isinstance(d, str): d = [d]
    if not isinstance(d, list) or len(d) != len(t.texts): raise HTTPException(502, "Unexpected response from the translation server.")
    return {"translations": d}
