import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Pause, Play, Square, X, Download, Search, Bookmark, Trash2, SkipBack, SkipForward, Volume2, RotateCcw, ShieldCheck, Clock, Languages, Sigma } from "lucide-react";
import { putChunk, getChunks, dropChunks, putAudio, getAudio, delAudio } from "./idb";
import { prefs, pending } from "./store";
import { protect, restore } from "./protect";
import { drawGraph, sceneOf } from "./Graph";
import { recStatus, recCtl } from "./recbus";
import { choose, type Mode } from "./transcribe";

type Seg = { start: number; end: number; text: string };
type BM = { id: string; type: string; t: number; seg: number; note: string };
type St = "READY" | "REQUESTING_PERMISSION" | "RECORDING" | "PAUSED" | "TRANSCRIBING" | "COMPLETED" | "ERROR" | "RECOVERABLE_SESSION";
const LABEL: Record<St, string> = { READY: "Ready", REQUESTING_PERMISSION: "Waiting for microphone permission", RECORDING: "Recording", PAUSED: "Paused", TRANSCRIBING: "Saving recording", COMPLETED: "Saved", ERROR: "Error", RECOVERABLE_SESSION: "Unfinished recording found" };
const LANGS: [string, string][] = [["ta-IN", "Tamil"], ["en-US", "English (US)"], ["en-IN", "English (India)"], ["en-GB", "English (UK)"], ["hi-IN", "Hindi"], ["te-IN", "Telugu"], ["ml-IN", "Malayalam"], ["kn-IN", "Kannada"], ["mr-IN", "Marathi"], ["bn-IN", "Bengali"], ["gu-IN", "Gujarati"], ["ur-PK", "Urdu"], ["es-ES", "Spanish"], ["fr-FR", "French"], ["de-DE", "German"], ["ar-SA", "Arabic"], ["zh-CN", "Chinese (Mandarin)"], ["ja-JP", "Japanese"]];
const langName = (c: string) => LANGS.find(l => l[0] === c)?.[1] || c;
const TLANGS = [...new Map(LANGS.map(([c, n]) => [c.split("-")[0], n.replace(/ \(.*\)/, "")] as [string, string])).entries()];
const BMT = ["Important", "Exam Point", "Doubt", "Homework", "Example", "Custom"];
const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const warnLeave = (e: BeforeUnloadEvent) => e.preventDefault();
const elapsedNow = (r: any) => r.base + (r.running ? (performance.now() - r.t0) / 1000 : 0);
const hms = (s: number) => { s = Math.max(0, Math.floor(s)); return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map(x => String(x).padStart(2, "0")).join(":"); };
const mm = (s: number) => { s = Math.floor(Math.max(0, s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const api = async (u: string, o?: RequestInit) => { const r = await fetch(u, o); if (!r.ok) { let m = r.statusText; try { m = (await r.json()).detail || m; } catch { /* keep */ } throw new Error(String(m)); } return r.json(); };
const jsend = (u: string, method: string, body: any) => api(u, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const dl = (name: string, text: string) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" })); a.download = name; a.click(); };

export function Studio() {
  const [st, setSt] = useState<St>("READY"); const [lang, setLang] = useState<string>(prefs().lang || "en-US"); const [q, setQ] = useState("");
  const [devs, setDevs] = useState<MediaDeviceInfo[]>([]); const [dev, setDev] = useState(""); const [perm, setPerm] = useState("unknown");
  const [el, setEl] = useState(0); const [segs, setSegs] = useState<Seg[]>([]); const [bms, setBms] = useState<BM[]>([]); const [interim, setInterim] = useState("");
  const [err, setErr] = useState(""); const [warn, setWarn] = useState(""); const [info, setInfo] = useState<any>(null); const [recov, setRecov] = useState<any>(null); const [saved, setSaved] = useState<Blob | null>(null);
  const R = useRef<any>({ chunks: [], n: 0, base: 0, t0: 0, lastEnd: 0, segs: [], bms: [], running: false, discard: false, gone: false, sid: "", on: false });
  const cv = useRef<HTMLCanvasElement>(null); const savedUrl = useMemo(() => (saved ? URL.createObjectURL(saved) : ""), [saved]);
  const [gcount, setGcount] = useState(0); const [mode, setMode] = useState<Mode>((localStorage.getItem("vb-mode") as Mode) || "auto"); const [off, setOff] = useState<any>(null); const [online, setOnline] = useState(navigator.onLine);
  const sel = choose(mode, info, off, lang); const liveOK = !!SR && (mode === "online" || (mode === "auto" && online));
  const stat = st === "RECORDING" || st === "PAUSED" ? "Recording locally. " + (liveOK ? "Live captions use the browser's online speech service." : "No live transcript; the audio will be transcribed after recording.") : mode === "online" && !online ? "Waiting for connectivity: online transcription needs internet. Recording still works." : sel.t ? `After recording: ${sel.t.label}. ${sel.t.flow}` : `Transcription is unavailable right now (${sel.why}) Recording still works and the audio is saved safely.`;
  const rmModel = async (n: string) => { if (!confirm(`Remove the model "${n}" from this computer? You can add it again later.`)) return; try { await api("/api/offline/models/" + encodeURIComponent(n), { method: "DELETE" }); setOff(await api("/api/offline/info")); } catch (e: any) { setErr(e.message); } };
  const active = st === "RECORDING" || st === "PAUSED";

  const cleanup = () => { const r = R.current; clearInterval(r.timer); clearInterval(r.gtimer); cancelAnimationFrame(r.raf); r.on = false; r.running = false; r.live = false; try { r.recog?.stop(); } catch { /* ignore */ } r.stream?.getTracks().forEach((t: MediaStreamTrack) => t.stop()); r.ctx?.close().catch(() => {}); r.stream = r.ctx = r.recog = r.an = null; removeEventListener("beforeunload", warnLeave); };
  const pollGraph = () => { const r = R.current; if (!r.running) { r.evSeen = Date.now(); return; } try { const a = JSON.parse(localStorage.getItem("vb-gev") || "[]").filter((e: any) => e.at > r.evSeen); if (!a.length) return; r.evSeen = Math.max(...a.map((e: any) => e.at));
    a.forEach((e: any) => { const t = Math.max(0, elapsedNow(r) - (Date.now() - e.at) / 1000), id = crypto.randomUUID(); r.gev.push({ id, t, kind: e.kind, text: e.text, seg: r.segs.length - 1 }); if (e.def) { r.gfr.push({ id, t, def: e.def }); if (r.gfr.length > 150) r.gfr.shift(); } }); setGcount(r.gev.length + r.gsn.length); r.meta?.(); } catch { /* ignore */ } };
  const snap = () => { const r = R.current; try { const g = JSON.parse(localStorage.getItem("vb-graph-last") || "null"); if (!g) { setWarn("No graph yet. Open Graph Studio in another tab or window, build a graph, then try again."); return; } if (r.gsn.length >= 15) { setWarn("At most 15 graph snapshots per recording."); return; } r.gsn.push({ id: crypto.randomUUID(), t: elapsedNow(r), seg: r.segs.length - 1, src: g.src, def: g.def }); setGcount(r.gev.length + r.gsn.length); r.meta?.(); } catch { setWarn("Could not read the graph snapshot."); } };
  const tick = () => setEl(elapsedNow(R.current));
  const draw = () => { const r = R.current, c = cv.current; if (!c) return; const x = c.getContext("2d")!; const w = (c.width = c.clientWidth * 2), h = (c.height = 128); x.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--acc") || "#2dd4bf";
    if (r.an && r.running) { const d = new Uint8Array(r.an.fftSize); r.an.getByteTimeDomainData(d); const bars = 56, step = Math.floor(d.length / bars); for (let i = 0; i < bars; i++) { let m = 0; for (let k = 0; k < step; k++) m = Math.max(m, Math.abs(d[i * step + k] - 128)); const bh = Math.max(4, (m / 128) * h * 2); x.fillRect(i * (w / bars) + 2, (h - bh) / 2, w / bars - 4, bh); } } else { x.globalAlpha = 0.3; x.fillRect(0, h / 2 - 1, w, 2); }
    r.raf = requestAnimationFrame(draw); };
  const startRecog = () => { const r = R.current; if (!SR || r.mode === "offline" || (r.mode === "auto" && !navigator.onLine)) return; try { const g = new SR(); g.lang = r.lang; g.continuous = true; g.interimResults = true;
    g.onresult = (e: any) => { let it = ""; for (let i = e.resultIndex; i < e.results.length; i++) { const x = e.results[i]; if (x.isFinal) { const text = x[0].transcript.trim(); if (text) { const end = elapsedNow(r); r.segs.push({ start: r.lastEnd, end, text }); r.lastEnd = end; setSegs([...r.segs]); r.meta?.(); } } else it += x[0].transcript; } setInterim(it); };
    g.onerror = (e: any) => { if (e.error === "no-speech" || e.error === "aborted") return; r.live = false; setWarn("Live transcription stopped (" + e.error + "). Recording continues; transcribe the saved audio afterwards."); };
    g.onend = () => { if (r.running && r.live) { try { g.start(); } catch { /* ignore */ } } };
    r.live = true; r.recog = g; g.start(); } catch { /* live transcription unavailable */ } };
  const persist = async (sid: string, blob: Blob, dur: number, l: string, sg: Seg[], bm: BM[], ex: any = {}) => {
    try { await putAudio(sid, blob); } catch { setSaved(blob); setErr("This device has no room to store the audio. Download it now; it is still held in this tab."); setSt("ERROR"); return; }
    try { await jsend("/api/recordings", "POST", { id: sid, title: "Lecture " + new Date().toLocaleString([], { dateStyle: "medium", timeStyle: "short" }), data: { lang: l, duration: dur, segments: sg, orig: sg, bookmarks: bm, mime: blob.type, gev: ex.gev || [], gsn: ex.gsn || [], gfr: ex.gfr || [] } }); }
    catch (e: any) { setSaved(blob); setErr("Audio is stored on this device, but the lesson record could not be created: " + e.message); setSt("ERROR"); return; }
    await dropChunks(sid); localStorage.removeItem("vb-rec"); setSt("COMPLETED"); location.hash = "#/studio/" + sid;
  };
  const finalize = async () => { const r = R.current; const dur = r.base, sg = r.segs, bm = r.bms, ex = { gev: r.gev, gsn: r.gsn, gfr: r.gfr }; cleanup();
    if (r.discard) { await dropChunks(r.sid); localStorage.removeItem("vb-rec"); if (!r.gone) setSt("READY"); return; }
    if (r.gone) return; setSt("TRANSCRIBING"); setInterim(""); await persist(r.sid, new Blob(r.chunks, { type: r.mime || "audio/webm" }), dur, r.lang, sg, bm, ex); };
  const start = async () => {
    const r = R.current; if (r.on) return; r.on = true; setSt("REQUESTING_PERMISSION"); setErr(""); setWarn(""); setSaved(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("This browser cannot record audio. Use a current Chrome, Edge or Firefox over HTTPS or localhost.");
      const s = await navigator.mediaDevices.getUserMedia({ audio: dev ? { deviceId: { exact: dev } } : true }); r.stream = s; setPerm("granted");
      navigator.mediaDevices.enumerateDevices().then(d => setDevs(d.filter(x => x.kind === "audioinput")));
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(m => MediaRecorder.isTypeSupported(m)) || "";
      const rec = new MediaRecorder(s, { mimeType: mime || undefined, audioBitsPerSecond: 32000 });
      Object.assign(r, { rec, chunks: [], n: 0, base: 0, lastEnd: 0, segs: [], bms: [], discard: false, sid: crypto.randomUUID(), mime: rec.mimeType, lang, mode, gev: [], gsn: [], gfr: [], evSeen: Date.now() }); setSegs([]); setBms([]); setEl(0);
      const ac = new AudioContext(); const an = ac.createAnalyser(); an.fftSize = 1024; ac.createMediaStreamSource(s).connect(an); r.ctx = ac; r.an = an;
      r.meta = () => localStorage.setItem("vb-rec", JSON.stringify({ sid: r.sid, lang: r.lang, mime: r.mime, elapsed: elapsedNow(r), segs: r.segs, bms: r.bms, gev: r.gev, gsn: r.gsn, gfr: r.gfr }));
      rec.ondataavailable = e => { if (!e.data.size) return; r.chunks.push(e.data); putChunk(r.sid, r.n++, e.data).then(r.meta).catch(() => setWarn("Local storage is full or unavailable, so crash recovery is off for this session. Finish soon and download the audio.")); };
      rec.onerror = () => setErr("The recorder reported an error. Audio captured so far is kept; stop to save it.");
      rec.onstop = () => { finalize(); };
      rec.start(5000); r.t0 = performance.now(); r.running = true; try { const g0 = JSON.parse(localStorage.getItem("vb-graph-last") || "null"); if (g0?.def) r.gfr.push({ id: crypto.randomUUID(), t: 0, def: g0.def }); } catch { /* none */ } r.meta(); r.timer = setInterval(tick, 250); r.gtimer = setInterval(pollGraph, 1000); addEventListener("beforeunload", warnLeave); startRecog(); r.raf = requestAnimationFrame(draw); setSt("RECORDING");
    } catch (e: any) { cleanup(); if (e?.name === "NotAllowedError") setPerm("denied"); setErr(e?.name === "NotAllowedError" ? "Microphone permission was denied. Allow it in the browser address bar, then try again." : e?.name === "NotFoundError" ? "No microphone was found." : e?.message || "Could not start recording."); setSt("ERROR"); }
  };
  const pause = () => { const r = R.current; if (r.rec?.state !== "recording") return; r.rec.pause(); r.base = elapsedNow(r); r.running = false; clearInterval(r.timer); r.live = false; try { r.recog?.stop(); } catch { /* ignore */ } setInterim(""); setEl(r.base); setSt("PAUSED"); };
  const resume = () => { const r = R.current; if (r.rec?.state !== "paused") return; r.rec.resume(); r.t0 = performance.now(); r.running = true; r.timer = setInterval(tick, 250); startRecog(); setSt("RECORDING"); };
  const stop = () => { const r = R.current; if (r.rec && r.rec.state !== "inactive") { r.base = elapsedNow(r); r.running = false; r.rec.stop(); } };
  const cancel = () => { if (!confirm("Discard this recording? The audio captured so far will be deleted.")) return; R.current.discard = true; stop(); };
  const addBm = (type: string) => { const r = R.current; const note = type === "Custom" ? prompt("Bookmark note") || "" : ""; r.bms.push({ id: crypto.randomUUID(), type, t: elapsedNow(r), seg: r.segs.length - 1, note }); setBms([...r.bms]); r.meta?.(); };
  const recover = async () => { try { const ch = await getChunks(recov.sid); await persist(recov.sid, new Blob(ch, { type: recov.mime || "audio/webm" }), recov.elapsed || 0, recov.lang, recov.segs || [], recov.bms || [], { gev: recov.gev, gsn: recov.gsn, gfr: recov.gfr }); } catch { setErr("Could not rebuild the recording."); setSt("ERROR"); } };
  const discard = async () => { if (!confirm("Delete the unfinished recording? This cannot be undone.")) return; await dropChunks(recov.sid); localStorage.removeItem("vb-rec"); setRecov(null); setSt("READY"); };

  useEffect(() => {
    (async () => { try { const m = JSON.parse(localStorage.getItem("vb-rec") || "null"); if (m && (await getChunks(m.sid)).length) { setRecov(m); setSt("RECOVERABLE_SESSION"); } else if (m) localStorage.removeItem("vb-rec"); } catch { /* no recovery */ } })();
    api("/api/transcribe/info").then(setInfo).catch(() => setInfo(null)); api("/api/offline/info").then(setOff).catch(() => setOff(null));
    const on = () => setOnline(true), offl = () => setOnline(false); addEventListener("online", on); addEventListener("offline", offl);
    navigator.permissions?.query({ name: "microphone" as PermissionName }).then(p => { setPerm(p.state); p.onchange = () => setPerm(p.state); }).catch(() => {});
    return () => { removeEventListener("online", on); removeEventListener("offline", offl); const r = R.current; r.gone = true; if (r.rec && r.rec.state !== "inactive") r.rec.stop(); cleanup(); };
  }, []);
  recCtl.cur = { pause, resume, stop, snap, bm: addBm };
  useEffect(() => { recStatus.set({ st, el }); }, [st, Math.floor(el)]);
  const langs = useMemo(() => LANGS.filter(([c, n]) => (n + c).toLowerCase().includes(q.toLowerCase())), [q]);
  const mic = st === "PAUSED" ? <Play /> : <Mic />;
  return (
    <div className="page">
      <div className="pagehead"><div><h1>Lecture Studio</h1><p className="mut">Audio is saved in this browser as you go.</p></div><span className={"badge st-" + st} role="status">{LABEL[st]}</span></div>
      {err && <div className="note err" role="alert"><X size={16} /><div>{err} {savedUrl && <a className="btn sm" download="lecture-audio.webm" href={savedUrl}><Download size={14} /> Download audio</a>}</div></div>}
      {warn && <div className="note" role="status"><Clock size={16} />{warn}</div>}
      {st === "RECOVERABLE_SESSION" && recov && <div className="card" role="alert"><h2>Unfinished recording found</h2><p className="mut" style={{ margin: "6px 0 12px" }}>A recording ({langName(recov.lang)}, about {mm(recov.elapsed || 0)}) was interrupted. Recovery depends on what the browser managed to store.</p><div className="row"><button className="primary" onClick={recover}>Recover recording</button><button className="danger" onClick={discard}>Delete it</button></div></div>}
      <div className="studio">
        <div className="card rec">
          <button className={"bigmic" + (st === "RECORDING" ? " live" : "")} aria-label={st === "PAUSED" ? "Resume recording" : "Start recording"} disabled={!(st === "READY" || st === "ERROR" || st === "COMPLETED" || st === "PAUSED")} onClick={st === "PAUSED" ? resume : start}>{st === "RECORDING" ? <Mic /> : mic}</button>
          <div className="timer" aria-label="Elapsed time">{hms(el)}</div>
          
          {active && <canvas ref={cv} className="meter" aria-hidden="true" />}
          {active ? <div className="row" style={{ justifyContent: "center" }}>
            {st === "RECORDING" ? <button onClick={pause}><Pause size={16} /> Pause</button> : <button onClick={resume}><Play size={16} /> Resume</button>}
            <button className="primary" onClick={stop}><Square size={16} /> Stop and finish</button><button className="danger" onClick={cancel}>Cancel</button></div>
            : <p className="mut">{st === "REQUESTING_PERMISSION" ? "Allow microphone access in the browser prompt." : st === "TRANSCRIBING" ? "Saving your recording…" : "Press the microphone to start. The timer and waveform only run while the microphone is live."}</p>}
          {active && <div className="row" style={{ justifyContent: "center" }}>{BMT.map(b => <button key={b} className="sm" onClick={() => addBm(b)}><Bookmark size={13} /> {b}</button>)}<button className="sm" onClick={snap}><Sigma size={13} /> Graph snapshot</button></div>}
          {active && <small className="mut">{gcount} graph event{gcount === 1 ? "" : "s"} captured. Open Graph Studio in another tab or window while recording; changes there are logged with timestamps.</small>}
          {active && bms.length > 0 && <small>{bms.length} bookmark{bms.length === 1 ? "" : "s"} added</small>}
          {active && <div className="livebox" aria-live="polite"><b>Live transcript ({langName(lang)})</b>{!SR && <p className="mut">Live transcription isn't available in this browser. Keep recording and transcribe the saved audio afterwards.</p>}
            {segs.slice(-6).map((s, i) => <p key={i}>{s.text}</p>)}{interim && <p className="mut"><i>{interim}</i></p>}{SR && !segs.length && !interim && <p className="mut">Waiting for speech…</p>}</div>}
        </div>
        <div className="card form" style={{ maxWidth: "none" }}>
          <label><span><Languages size={14} /> Transcription language</span><span className="field search"><Search size={15} /><input placeholder="Search languages" value={q} onChange={e => setQ(e.target.value)} disabled={active} aria-label="Search languages" /></span>
            <select size={5} value={lang} disabled={active} onChange={e => setLang(e.target.value)} aria-label="Transcription language">{langs.map(([c, n]) => <option key={c} value={c}>{n} ({c})</option>)}</select></label>
          <label>Microphone<select value={dev} disabled={active} onChange={e => setDev(e.target.value)}><option value="">System default</option>{devs.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || "Microphone"}</option>)}</select></label>
          <div className="mode-row" role="group" aria-label="Transcription mode">{(["online", "offline", "auto"] as Mode[]).map(m => <button key={m} className={"sm" + (mode === m ? " primary" : "")} disabled={active} onClick={() => { setMode(m); localStorage.setItem("vb-mode", m); }}>{m === "auto" ? "Automatic" : m === "online" ? "Online" : "Offline"}</button>)}</div>
          <div className="note" role="status"><Clock size={16} /><span><b>{online ? "Connected" : "No internet"}.</b> {stat}</span></div>
          <small>Offline engine: {off?.installed ? "Vosk installed" : "not installed"}{off && !off.ffmpeg ? ", ffmpeg missing" : ""}. Free disk: {off?.free_mb ?? "?"} MB. A language works offline only if a matching model is listed here.</small>
          {off?.models?.map((m: any) => <div className="row" key={m.name} style={{ justifyContent: "space-between" }}><small>{m.name} ({m.size_mb} MB, {m.langs.join(", ") || "unknown language"})</small><button className="sm danger" disabled={active} onClick={() => rmModel(m.name)}>Remove</button></div>)}
          {off && !off.models?.length && <small>No models installed. Download a Vosk model and unzip it into backend/models (see README); in-app download is not available.</small>}
          <small>Permission: {perm}. Quality: Opus about 32 kbps (roughly 14 MB per hour).</small>
          <small>Live transcription: {SR ? "available in this browser (uses the browser's speech service over the internet)" : "not available in this browser"}. Saved-audio transcription: {info?.configured ? `configured (${info.provider})` : "not configured on the backend"}. The language list is a set of common choices; support depends on the service and is not checked in advance.</small>
          <small><ShieldCheck size={13} /> Privacy: audio is kept only in this browser's storage. It is uploaded only if you press Transcribe on a recording, and it is deleted when you delete the recording. Transcripts and bookmarks are stored by the VoxBoard backend.</small>
        </div>
      </div>
    </div>
  );
}

export function Review({ id }: { id: string }) {
  const [rec, setRec] = useState<any>(null); const [err, setErr] = useState(""); const [url, setUrl] = useState(""); const [noAudio, setNoAudio] = useState(false); const [info, setInfo] = useState<any>(null);
  const [off, setOff] = useState<any>(null), [tinfo, setTinfo] = useState<any>(null), [view, setView] = useState("both"), [q2, setQ2] = useState(""), [tl, setTl] = useState("en"), [edit2, setEdit2] = useState(-1); const [t, setT] = useState(0); const [play, setPlay] = useState(false); const [rate, setRate] = useState(1); const [vol, setVol] = useState(1); const [q, setQ] = useState(""); const [edit, setEdit] = useState(-1); const [busy, setBusy] = useState(""); const [flt, setFlt] = useState("All");
  const au = useRef<HTMLAudioElement>(null);
  useEffect(() => { let u = ""; api("/api/recordings/" + id).then(d => setRec({ id, title: d.title, ...d.data })).catch(e => setErr(e.message)); api("/api/transcribe/info").then(setInfo).catch(() => {}); api("/api/offline/info").then(setOff).catch(() => {}); api("/api/translate/info").then(setTinfo).catch(() => {});
    getAudio(id).then(b => { if (b) { u = URL.createObjectURL(b); setUrl(u); } else setNoAudio(true); }).catch(() => setNoAudio(true)); return () => { if (u) URL.revokeObjectURL(u); }; }, [id]);
  useEffect(() => { if (au.current) { au.current.playbackRate = rate; au.current.volume = vol; } }, [rate, vol, url]);
  const segs: Seg[] = rec?.segments ?? [];
  const act = segs.findIndex((s, i) => t >= s.start && (i === segs.length - 1 || t < segs[i + 1].start));
  useEffect(() => { if (play) document.getElementById("seg" + act)?.scrollIntoView({ block: "nearest" }); }, [act, play]);
  if (err && !rec) return <div className="page"><div className="note err" role="alert">{err}</div></div>;
  if (!rec) return <div className="page"><div className="card skel" /></div>;
  const dur = rec.duration || 1;
  const save = async (n: any) => { setRec(n); try { await jsend("/api/recordings/" + id, "PUT", { title: n.title, data: { lang: n.lang, duration: n.duration, segments: n.segments, orig: n.orig, bookmarks: n.bookmarks, mime: n.mime, translation: n.translation, gev: n.gev, gsn: n.gsn, gfr: n.gfr } }); setErr(""); } catch (e: any) { setErr("Save failed: " + e.message); } };
  const seek = (s: number) => { if (au.current) au.current.currentTime = s; setT(s); };
  const toggle = () => { const a = au.current; if (a) (a.paused ? a.play() : a.pause()); };
  const jump = (d: number) => { const i = Math.min(segs.length - 1, Math.max(0, (act < 0 ? 0 : act) + d)); if (segs[i]) seek(segs[i].start); };
  const addBm = (type: string) => { const note = type === "Custom" ? prompt("Bookmark note") || "" : ""; save({ ...rec, bookmarks: [...rec.bookmarks, { id: crypto.randomUUID(), type, t, seg: act, note }].sort((a: BM, b: BM) => a.t - b.t) }); };
  const transcribe = async () => { const mode = (localStorage.getItem("vb-mode") as Mode) || "auto"; const { t: tp, why } = choose(mode, info, off, rec.lang); if (!tp) { setErr(why + " The recording is unchanged."); return; }
    if (!confirm(tp.flow + " This replaces the current transcript. Continue?")) return;
    setBusy(tp.id === "online" ? "Sending audio to the online provider…" : "Transcribing offline on this computer…"); setErr("");
    try { const b = await getAudio(id); if (!b) throw new Error("The audio is not on this device."); const sg = await tp.run(b, rec.lang); await save({ ...rec, segments: sg, orig: sg }); } catch (e: any) { setErr(e.message + " The recording is unchanged; you can retry."); } finally { setBusy(""); } };
  const tr = rec.translation && rec.translation.lang === tl ? rec.translation : null;
  const stale = (i: number) => !!tr && !!tr.segs[i]?.text && tr.segs[i].src !== segs[i]?.text;
  const translate = async (only?: number) => {
    const idx = only !== undefined ? [only] : segs.map((_, i) => i).filter(i => !tr || !tr.segs[i]?.text || tr.segs[i].src !== segs[i].text);
    if (!idx.length) { setErr("Nothing to translate: the translation is up to date."); return; }
    if (!tinfo?.configured) { setErr("Translation is not configured on the backend (see README). Your original transcript is unchanged."); return; }
    setBusy(tinfo.local ? "Translating on this computer…" : "Sending text to the online translation service…"); setErr("");
    try { const pz = idx.map(i => protect(segs[i].text)); const d = await jsend("/api/translate", "POST", { texts: pz.map(p => p.masked), source: rec.lang.split("-")[0], target: tl }); const base = tr ? [...tr.segs] : segs.map(() => ({ text: "", src: "" })); idx.forEach((i, k) => { const rs = restore(d.translations[k], pz[k].toks); base[i] = { text: rs.text, src: segs[i].text, warn: !rs.ok }; }); await save({ ...rec, translation: { lang: tl, segs: base } }); }
    catch (e: any) { setErr(e.message + " The original transcript is unchanged."); } finally { setBusy(""); } };
  const copy = (x: string) => navigator.clipboard?.writeText(x).catch(() => setErr("Copy failed."));
  const origText = segs.map(s => `[${mm(s.start)}] ${s.text}`).join("\n"), trText = tr ? segs.map((s, i) => `[${mm(s.start)}] ${tr.segs[i]?.text || ""}`).join("\n") : "";
  const tname = TLANGS.find(l => l[0] === tl)?.[1] || tl;
  const gitems: any[] = [...(rec.gev || []), ...(rec.gsn || [])].sort((a: any, b: any) => a.t - b.t);
  const frames: any[] = [...(rec.gfr || []), ...(rec.gsn || [])].sort((a: any, b: any) => a.t - b.t);
  const attachSnap = () => { try { const g = JSON.parse(localStorage.getItem("vb-graph-last") || "null"); if (!g) { setErr("No graph found. Build one in Graph Studio first."); return; } save({ ...rec, gsn: [...(rec.gsn || []), { id: crypto.randomUUID(), t, seg: act, src: g.src, def: g.def }] }); } catch { setErr("Could not read the graph snapshot."); } };
  const restoreGraph = (g: any) => { if (!confirm("This replaces the graph currently in Graph Studio. Continue?")) return; pending.editGraph = { def: g.def, page: -1, idx: -1 }; location.hash = "#/graph"; };
  const removeG = (g: any) => save({ ...rec, gev: (rec.gev || []).filter((x: any) => x.id !== g.id), gsn: (rec.gsn || []).filter((x: any) => x.id !== g.id) });
  const remove = async () => { if (!confirm("Delete this recording, its audio and transcript? This cannot be undone.")) return; try { await api("/api/recordings/" + id, { method: "DELETE" }); await delAudio(id).catch(() => {}); location.hash = "#/library"; } catch (e: any) { setErr(e.message); } };
  const bmc = (ty: string) => "mk bm-" + ty.replace(/\W/g, "");
  return (
    <div className="page">
      <div className="pagehead"><div><input className="title" style={{ fontSize: 22, width: "min(480px,80vw)" }} value={rec.title} onChange={e => setRec({ ...rec, title: e.target.value })} onBlur={() => save(rec)} aria-label="Recording title" /><p className="mut">{langName(rec.lang)}, {mm(rec.duration)}</p></div>
        <div className="row"><button onClick={() => dl(rec.title + ".txt", segs.map(s => `[${mm(s.start)}] ${s.text}`).join("\n"))}><Download size={16} /> Transcript (TXT)</button><button className="danger" onClick={remove}><Trash2 size={16} /> Delete</button></div></div>
      {err && <div className="note err" role="alert">{err}</div>}{busy && <div className="note" role="status"><Clock size={16} />{busy}</div>}
      <div className="card player">
        {url ? <audio ref={au} src={url} preload="metadata" onTimeUpdate={e => setT(e.currentTarget.currentTime)} onPlay={() => setPlay(true)} onPause={() => setPlay(false)} onEnded={() => setPlay(false)} /> : <div className="note">{noAudio ? "The audio is not stored on this device (recordings stay in the browser that made them). The transcript is still available." : "Loading audio…"}</div>}
        <div className="prow"><button className="ib" aria-label="Previous segment" onClick={() => jump(-1)}><SkipBack size={18} /></button><button className="primary" onClick={toggle} disabled={!url} aria-label={play ? "Pause" : "Play"}>{play ? <Pause size={16} /> : <Play size={16} />}{play ? "Pause" : "Play"}</button><button className="ib" aria-label="Next segment" onClick={() => jump(1)}><SkipForward size={18} /></button>
          <span className="mut" style={{ fontVariantNumeric: "tabular-nums" }}>{mm(t)} / {mm(dur)}</span><span className="sp" />
          {[0.75, 1, 1.25, 1.5, 2].map(r => <button key={r} className={"sm" + (rate === r ? " primary" : "")} onClick={() => setRate(r)}>{r}x</button>)}
          <Volume2 size={16} /><input type="range" min={0} max={1} step={0.05} value={vol} onChange={e => setVol(+e.target.value)} aria-label="Volume" style={{ width: 80 }} />
          {url && <a className="btn sm" href={url} download={rec.title + (rec.mime?.includes("mp4") ? ".m4a" : ".webm")}><Download size={14} /> Audio</a>}</div>
        <input type="range" min={0} max={dur} step={0.5} value={Math.min(t, dur)} onChange={e => seek(+e.target.value)} aria-label="Seek" disabled={!url} style={{ width: "100%" }} />
        <div className="tlb" onClick={e => { const r = e.currentTarget.getBoundingClientRect(); seek(((e.clientX - r.left) / r.width) * dur); }} aria-label="Bookmark timeline"><div className="fill" style={{ width: (t / dur) * 100 + "%" }} />{rec.bookmarks.map((b: BM) => <button key={b.id} className={bmc(b.type)} style={{ left: (b.t / dur) * 100 + "%" }} title={`${b.type} ${mm(b.t)} ${b.note}`} aria-label={`${b.type} at ${mm(b.t)}`} onClick={e => { e.stopPropagation(); seek(b.t); }} />)}</div>
      </div>
      <div className="studio">
        <div className="card">
          <div className="toolrow"><h2>Transcript</h2><span className="sp" /><label className="field search"><Search size={15} /><input placeholder="Search transcript" value={q} onChange={e => setQ(e.target.value)} aria-label="Search transcript" /></label>
            <button className="sm" onClick={transcribe} disabled={!url || !!busy}>Transcribe saved audio</button>
            <button className="sm" onClick={() => confirm("Restore the original transcript? Your edits will be lost.") && save({ ...rec, segments: rec.orig })}><RotateCcw size={14} /> Restore original</button></div>
          <p className="mut" style={{ margin: "6px 0 10px", fontSize: 13 }}>Timestamps are segment level and approximate: live transcripts mark when each phrase was confirmed. Click a time to jump, click text to edit.</p>
          <div className="dual-head">
            <label className="row">Original <select value={rec.lang} onChange={e => save({ ...rec, lang: e.target.value })} aria-label="Original language">{LANGS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></label>
            <label className="row">Translate to <select value={tl} onChange={e => setTl(e.target.value)} aria-label="Translation language">{TLANGS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></label>
            <button className="sm primary" onClick={() => translate()} disabled={!segs.length || !!busy}>{tr ? "Re-translate changed" : "Translate transcript"}</button>
            {["both", "orig", "trans"].map(v => <button key={v} className={"sm" + (view === v ? " primary" : "")} onClick={() => setView(v)}>{v === "both" ? "Side by side" : v === "orig" ? "Original only" : "Translation only"}</button>)}
            <button className="sm" onClick={() => copy(origText)}>Copy original</button><button className="sm" disabled={!tr} onClick={() => copy(trText)}>Copy translation</button>
            <button className="sm" onClick={() => dl(rec.title + "-original.txt", origText)}>Export original</button><button className="sm" disabled={!tr} onClick={() => dl(rec.title + "-" + tl + ".txt", trText)}>Export translation</button><button className="sm" disabled={!tr} onClick={() => dl(rec.title + "-both.txt", segs.map((s, i) => `[${mm(s.start)}] ${s.text}\n        ${tr.segs[i]?.text || ""}`).join("\n"))}>Export both</button></div>
          <small className="mut">Translation: {tinfo?.configured ? (tinfo.local ? "server on this computer" : "online service, text is sent over the internet") : "not configured"}. Numbers, units, chemical formulas and simple equations are masked before translation and restored afterwards; segments where that fails are flagged. Review translations before teaching.</small>
          <div className={"dual" + (view === "orig" ? " one" : view === "trans" ? " one tr-only" : "")}>
            <section><h3 className="pl">Original transcript ({langName(rec.lang)})</h3>
              {segs.length === 0 && <div className="empty"><h3>No transcript yet</h3><p className="mut">Live transcription wasn't available for this recording. Use Transcribe saved audio (online provider or offline engine; see Lecture Studio for status).</p></div>}
              {segs.map((s, i) => (q && !s.text.toLowerCase().includes(q.toLowerCase())) ? null : <div id={"seg" + i} key={i} className={"seg" + (i === act ? " on" : "")}><button className="ts" onClick={() => { seek(s.start); document.getElementById("tseg" + i)?.scrollIntoView({ block: "nearest" }); }}>{mm(s.start)}</button>
                {edit === i ? <textarea autoFocus defaultValue={s.text} onBlur={e => { save({ ...rec, segments: segs.map((x, k) => k === i ? { ...x, text: e.target.value } : x) }); setEdit(-1); }} /> : <p onClick={() => setEdit(i)}>{s.text}</p>}</div>)}</section>
            {view !== "orig" && <section><h3 className="pl tr">Translation to {tname}: machine translated, not the teacher's words</h3>
              <label className="field search"><Search size={15} /><input placeholder="Search translation" value={q2} onChange={e => setQ2(e.target.value)} aria-label="Search translation" /></label>
              {!tr && <p className="mut" style={{ marginTop: 8 }}>No {tname} translation yet. Translate the transcript to create one. The original is never changed.</p>}
              {tr && segs.map((s, i) => (q2 && !(tr.segs[i]?.text || "").toLowerCase().includes(q2.toLowerCase())) ? null : <div id={"tseg" + i} key={i} className={"seg" + (i === act ? " on" : "") + (stale(i) ? " stale" : "")}><button className="ts" onClick={() => { seek(s.start); document.getElementById("seg" + i)?.scrollIntoView({ block: "nearest" }); }}>{mm(s.start)}</button>
                {edit2 === i ? <textarea autoFocus defaultValue={tr.segs[i]?.text} onBlur={e => { save({ ...rec, translation: { ...tr, segs: tr.segs.map((z: any, k: number) => k === i ? { text: e.target.value, src: segs[i].text } : z) } }); setEdit2(-1); }} /> : <p onClick={() => setEdit2(i)}>{tr.segs[i]?.text || <span className="mut">Not translated</span>}</p>}
                {tr.segs[i]?.warn && <small className="err">Check numbers and formulas</small>}{stale(i) && <button className="sm" onClick={() => translate(i)}>Outdated, re-translate</button>}</div>)}</section>}
          </div>
        </div>
        <div className="card"><h2>Graph events and snapshots</h2>
          <p className="mut" style={{ margin: "6px 0 10px", fontSize: 13 }}>Captured while recording when Graph Studio was open in another tab or window, or attached manually. Times are approximate (within about a second); this is a log, not an exact replay.</p>
          {frames.length > 0 && <div style={{ margin: "10px 0" }}><h3 style={{ fontSize: 13, margin: "0 0 6px" }}>Graph replay</h3><p className="mut" style={{ fontSize: 13, marginBottom: 8 }}>Press Play on the audio, or drag the seek bar: the graph below shows the recorded state at that moment (sampled about every half second while changing).</p><GraphReplay frames={frames} t={t} onOpen={d => restoreGraph({ def: d })} /></div>}
          <button className="sm" onClick={attachSnap}><Sigma size={14} /> Attach current Graph Studio graph at {mm(t)}</button>
          {gitems.length === 0 && <p className="mut" style={{ marginTop: 10 }}>No graph events yet.</p>}
          {gitems.map((g: any) => <div className="item" key={g.id} style={{ alignItems: "flex-start" }}><button className="ts" onClick={() => seek(g.t)}>{mm(g.t)}</button><span style={{ flex: 1 }}>{g.src ? <><b>Graph snapshot</b><img src={g.src} alt="Graph snapshot" style={{ width: "100%", maxWidth: 240, display: "block", margin: "6px 0", borderRadius: 6, border: "1px solid var(--line)" }} /><button className="sm" onClick={() => restoreGraph(g)}>Open in Graph Studio</button></> : <><b>{g.kind}</b> {g.text}</>}{g.seg >= 0 && segs[g.seg] && <small className="mut"> near: {segs[g.seg].text.slice(0, 60)}</small>}</span><button className="ib" aria-label="Remove" onClick={() => removeG(g)}><X size={15} /></button></div>)}</div>
        <div className="card"><h2>Bookmarks</h2>
          <div className="row" style={{ margin: "10px 0" }}>{BMT.map(b => <button key={b} className="sm" onClick={() => addBm(b)} title={`Add at ${mm(t)}`}><Bookmark size={13} /> {b}</button>)}</div>
          <select value={flt} onChange={e => setFlt(e.target.value)} aria-label="Filter bookmarks"><option>All</option>{BMT.map(b => <option key={b}>{b}</option>)}</select>
          {rec.bookmarks.length === 0 && <p className="mut" style={{ marginTop: 10 }}>No bookmarks yet. Add one at the current playback time.</p>}
          {rec.bookmarks.filter((b: BM) => flt === "All" || b.type === flt).map((b: BM) => <div className="item" key={b.id}><button className="ts" onClick={() => seek(b.t)}>{mm(b.t)}</button><span style={{ flex: 1 }}><b>{b.type}</b> {b.note}</span><button className="ib" aria-label="Delete bookmark" onClick={() => save({ ...rec, bookmarks: rec.bookmarks.filter((x: BM) => x.id !== b.id) })}><X size={15} /></button></div>)}
        </div>
      </div>
    </div>
  );
}

export function Library() {
  const [ls, setLs] = useState<any[] | null>(null); const [q, setQ] = useState(""); const [err, setErr] = useState("");
  const load = () => api("/api/recordings?q=" + encodeURIComponent(q)).then(d => { setLs(d); setErr(""); }).catch(() => { setErr("Cannot reach the backend on port 8000."); setLs([]); });
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [q]);
  return (
    <div className="page"><div className="pagehead"><div><h1>Transcript Library</h1><p className="mut">Recordings and transcripts. Audio is only available in the browser that recorded it.</p></div><button className="primary" onClick={() => (location.hash = "#/studio")}><Mic size={16} /> Record Lecture</button></div>
      <label className="field search"><Search size={15} /><input placeholder="Search recordings" value={q} onChange={e => setQ(e.target.value)} aria-label="Search recordings" /></label>
      {err && <div className="note err" role="alert">{err}</div>}
      {ls && !err && ls.length === 0 && <div className="empty"><Mic size={24} /><h3>{q ? "No recordings match" : "No recordings yet"}</h3>{!q && <p className="mut">Record your first lecture in the Lecture Studio.</p>}</div>}
      <div className="grid3">{(ls || []).map(r => <article className="card lesson" key={r.id}><a className="lt" href={"#/studio/" + r.id}>{r.title}</a>
        <div className="meta"><span><Clock size={13} /> {mm(r.duration)}</span><span>{langName(r.lang)}</span></div><div className="meta"><span>{r.segments} segments</span><span>{r.bookmarks} bookmarks</span></div>
        <div className="acts"><a className="btn sm primary" href={"#/studio/" + r.id}>Open</a><button className="ib" aria-label="Delete recording" onClick={async () => { if (confirm(`Delete "${r.title}" and its audio?`)) { await api("/api/recordings/" + r.id, { method: "DELETE" }).catch(() => {}); await delAudio(r.id).catch(() => {}); load(); } }}><Trash2 size={16} /></button></div></article>)}</div></div>
  );
}

function GraphReplay({ frames, t, onOpen }: { frames: { t: number; def: any }[]; t: number; onOpen: (d: any) => void }) {
  const ref = useRef<HTMLCanvasElement>(null); let f: any = null; for (const x of frames) { if (x.t <= t) f = x; else break; }
  useEffect(() => { const c = ref.current!; c.width = 960; c.height = 540; const x = c.getContext("2d")!; if (f) drawGraph(x, 960, 540, sceneOf(f.def)); else { x.fillStyle = "#fff"; x.fillRect(0, 0, 960, 540); } }, [f]);
  return <div><canvas ref={ref} className="gcanvas" style={{ aspectRatio: "16/9" }} aria-label="Replayed graph" /><div className="row" style={{ marginTop: 6, alignItems: "center" }}><small className="mut">{f ? `Graph state from ${mm(f.t)}${f.def?.trimmed ? " (annotations not stored for this frame)" : ""}` : "No graph state recorded yet at this time."}</small>{f && <button className="sm" onClick={() => onOpen(f.def)}>Open this state in Graph Studio</button>}</div></div>;
}
