import { useState } from "react";
import { FileUp, Sparkles, Smartphone, Wifi, ShieldCheck, ScanLine } from "lucide-react";
import { newLesson, pending, prefs } from "./store";

export function ImportPage() {
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const go = async (f?: File) => {
    if (!f) return; if (f.type !== "application/pdf") return setErr("Please choose a PDF file."); 
    setBusy(true); try { pending.pdf = f; location.hash = "#/board/" + await newLesson(); } catch { setErr("Could not create a lesson. Is the backend running?"); setBusy(false); }
  };
  return <div className="page"><div className="pagehead"><div><h1>Import PDF</h1><p className="mut">Each PDF page becomes a board page you can annotate. Pages are rendered sharp enough to zoom, crop and rotate on the board.</p></div></div>
    <label className="drop"><FileUp size={26} /><b>{busy ? "Opening board…" : "Choose a PDF to annotate"}</b><span className="mut">A new lesson is created from the file</span><input className="sr" type="file" accept="application/pdf" disabled={busy} onChange={e => go(e.target.files?.[0])} /></label>
    {err && <div className="note err" role="alert">{err}</div>}</div>;
}
export function AiPage() {
  const tasks = ["Summarize lesson", "Key points", "Revision questions", "Multiple-choice questions", "Simplify explanation", "Glossary", "Organize notes", "Suggest examples", "Revision notes"];
  return <div className="page"><div className="pagehead"><div><h1>AI Teaching Assistant</h1><p className="mut">Not available in this build.</p></div></div>
    <div className="note"><Sparkles size={16} /> The backend has no AI provider adapter yet, so none of these tasks run. Everything else in VoxBoard works without it. See the README for the planned configuration variables.</div>
    <div className="grid3">{tasks.map(t => <div className="card act off" key={t}><Sparkles size={16} /><b>{t}</b><small>Unavailable</small></div>)}</div></div>;
}
export function MobilePage() {
  return <div className="page"><div className="pagehead"><div><h1>Mobile Controller</h1><p className="mut">Use your phone as a remote pen and clicker. No app to install.</p></div>
    <button className="primary" onClick={async () => { try { location.hash = "#/board/" + (await (await fetch("/api/lessons")).json())[0]?.id; } catch { /* ignore */ } }}>Open a board to pair</button></div>
    <div className="grid3"><div className="card act"><ScanLine size={18} /><b>1. Show the code</b><small>Open a board and click Pair phone. A QR code and 6-digit code appear.</small></div>
      <div className="card act"><Smartphone size={18} /><b>2. Scan with the phone</b><small>Or open the /#/remote page on the phone and type the code.</small></div>
      <div className="card act"><Wifi size={18} /><b>3. Same network</b><small>Phone and computer must reach each other, usually the same Wi-Fi. Codes expire after 6 hours.</small></div></div>
    <div className="note"><ShieldCheck size={16} /> Browsers restrict some features on plain http addresses on a local network. Use HTTPS for production. Pairing does not guarantee microphone access on the phone.</div></div>;
}
export function SettingsPage() {
  const [p, setP] = useState(prefs());
  const set = (k: string, v: any) => { const n = { ...prefs(), [k]: v }; setP(n); localStorage.setItem("vb", JSON.stringify(n)); if (k === "theme") document.documentElement.dataset.theme = v; };
  return <div className="page"><div className="pagehead"><div><h1>Settings</h1><p className="mut">Saved in this browser.</p></div></div>
    <div className="card form">
      <label>Interface theme<select value={p.theme || "dark"} onChange={e => set("theme", e.target.value)}><option value="dark">Dark</option><option value="light">Light</option></select></label>
      <label>New page background<select value={p.bg || "white"} onChange={e => set("bg", e.target.value)}>{["white", "black", "grid", "ruled", "dots"].map(b => <option key={b}>{b}</option>)}</select></label>
      <label>Default pen colour<input type="color" value={p.color || "#111111"} onChange={e => set("color", e.target.value)} /></label>
      <label>Default pen thickness: {p.width || 4}<input type="range" min={1} max={20} value={p.width || 4} onChange={e => set("width", +e.target.value)} /></label>
      <label>Speech language<select value={p.lang || "en-US"} onChange={e => set("lang", e.target.value)}><option value="en-US">English (US)</option><option value="en-IN">English (India)</option><option value="hi-IN">Hindi</option><option value="ta-IN">Tamil</option><option value="es-ES">Spanish</option></select></label>
      <label>Typing speed: {p.speed || 40} characters/s<input type="range" min={5} max={120} value={p.speed || 40} onChange={e => set("speed", +e.target.value)} /></label>
      <label>Default text size: {p.tsize || 36}<input type="range" min={12} max={120} value={p.tsize || 36} onChange={e => set("tsize", +e.target.value)} /></label>
      <label>Default text colour<input type="color" value={p.tcolor || "#111111"} onChange={e => set("tcolor", e.target.value)} /></label>
      <p className="mut">Speech recognition uses your browser's speech service, which sends audio to the browser vendor over the internet. VoxBoard does not record or store audio. Language availability depends on the browser.</p></div></div>;
}
export function HelpPage() {
  const k: [string, string][] = [["Ctrl+Z / Ctrl+Y", "Undo / redo"], ["Ctrl+C / Ctrl+V", "Copy / paste object"], ["Ctrl+D", "Duplicate object"], ["Delete", "Delete selected object"], ["Double-click text", "Edit text"], ["Esc", "Exit presentation"], ["V H P M E T L A R O K", "Select, Pan, Pen, Highlighter, Eraser, Text, Line, Arrow, Rectangle, Ellipse, Laser"], ["Drag and drop / Ctrl+V", "Drop images, PDFs or JSON on the board; paste images"]];
  return <div className="page"><div className="pagehead"><div><h1>Help and Shortcuts</h1><p className="mut">Select a tool, then draw. Use Select to move or resize, Pan to scroll.</p></div></div>
    <div className="card form">{k.map(([a, b]) => <div className="kv" key={a}><kbd>{a}</kbd><span>{b}</span></div>)}</div></div>;
}
