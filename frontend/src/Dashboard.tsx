import { useEffect, useMemo, useState } from "react";
import { Plus, Play, Smartphone, FileUp, Search, Clock, MoreHorizontal, Pencil, Copy, Trash2, Layers, Mic, QrCode } from "lucide-react";
import { newLesson } from "./store";
type L = { id: string; title: string; created: number; modified: number; pages: number };
const when = (t: number) => new Date(t * 1000).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

export default function Dashboard({ full }: { full?: boolean }) {
  const [ls, setLs] = useState<L[] | null>(null); const [q, setQ] = useState(""); const [sort, setSort] = useState("modified"); const [err, setErr] = useState("");
  const load = () => fetch("/api/lessons?q=" + encodeURIComponent(q)).then(r => { if (!r.ok) throw 0; return r.json(); }).then(d => { setLs(d); setErr(""); }).catch(() => { setErr("Cannot reach the backend on port 8000. Start it, then refresh."); setLs([]); });
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [q]);
  const rows = useMemo(() => { const a = [...(ls || [])]; a.sort((x, y) => sort === "title" ? x.title.localeCompare(y.title) : sort === "pages" ? y.pages - x.pages : sort === "created" ? y.created - x.created : y.modified - x.modified); return full ? a : a.slice(0, 6); }, [ls, sort, full]);
  const create = async () => { try { location.hash = "#/board/" + await newLesson(); } catch { setErr("Could not create a lesson. Is the backend running?"); } };
  const rename = async (l: L) => { const t = prompt("Rename lesson", l.title)?.trim(); if (!t) return; const r = await fetch("/api/lessons/" + l.id); if (!r.ok) return setErr("Rename failed."); const d = await r.json(); await fetch("/api/lessons/" + l.id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: t, data: d.data }) }); load(); };
  const act = async (f: () => Promise<any>) => { try { await f(); load(); } catch { setErr("Action failed."); } };
  const last = ls?.slice().sort((a, b) => b.modified - a.modified)[0];
  return (
    <div className="page">
      <div className="pagehead"><div><h1>{full ? "My Lessons" : "Welcome back"}</h1><p className="mut">{full ? "Search, sort and manage every lesson." : "Intelligent Teaching Workspace. Speak. Teach. Write. Inspire."}</p></div>
        <div className="row"><button className="primary" onClick={create}><Plus size={16} /> Create New Board</button></div></div>
      {!full && <div className="actions">
        <button className="card act" disabled={!last} onClick={() => last && (location.hash = "#/board/" + last.id)}><Play size={18} /><b>Continue Lesson</b><small>{last ? last.title : "No lessons yet"}</small></button>
        <button className="card act" onClick={() => (location.hash = "#/studio")}><Mic size={18} /><b>Record Lecture</b><small>Up to 60 minutes, with transcript</small></button>
        <button className="card act" onClick={() => (location.hash = "#/mobile")}><Smartphone size={18} /><b>Connect Mobile</b><small>Pair a phone as remote</small></button>
        <button className="card act" onClick={() => (location.hash = "#/import")}><FileUp size={18} /><b>Import PDF</b><small>Annotate pages on the board</small></button>
      </div>}
      <div className="toolrow"><h2>{full ? "All lessons" : "Recent lessons"} <span className="badge">{ls?.length ?? 0}</span></h2><span className="sp" />
        <label className="field search"><Search size={15} /><input placeholder="Search lessons" aria-label="Search lessons" value={q} onChange={e => setQ(e.target.value)} /></label>
        <select aria-label="Sort" value={sort} onChange={e => setSort(e.target.value)}><option value="modified">Last edited</option><option value="created">Newest</option><option value="title">Title</option><option value="pages">Pages</option></select></div>
      {err && <div className="note err" role="alert">{err}</div>}
      {ls === null && <div className="grid3">{[0, 1, 2].map(i => <div key={i} className="card skel" />)}</div>}
      {ls && !err && rows.length === 0 && (q ? <div className="empty"><Search size={22} /><h3>No lessons match "{q}"</h3></div> :
        <div className="empty"><Layers size={24} /><h3>Create your first board</h3><p className="mut">Three steps to your first lesson:</p>
          <ol><li><Plus size={14} /> Create a board</li><li><Mic size={14} /> Press the microphone and speak. Text types itself onto the board</li><li><QrCode size={14} /> Pair your phone to draw and turn pages remotely</li></ol>
          <button className="primary" onClick={create}><Plus size={16} /> Create New Board</button></div>)}
      <div className="grid3">{rows.map(l => (
        <article className="card lesson" key={l.id}>
          <a className="lt" href={"#/board/" + l.id}>{l.title}</a>
          <div className="meta"><span><Clock size={13} /> {when(l.modified)}</span><span>{l.pages} {l.pages === 1 ? "page" : "pages"}</span></div>
          <div className="acts"><a className="btn sm primary" href={"#/board/" + l.id}>Open</a>
            <details className="menu"><summary className="ib" aria-label="More actions"><MoreHorizontal size={18} /></summary><div className="pop">
              <button onClick={() => rename(l)}><Pencil size={14} /> Rename</button>
              <button onClick={() => act(async () => { const r = await fetch(`/api/lessons/${l.id}/duplicate`, { method: "POST" }); if (!r.ok) throw 0; })}><Copy size={14} /> Duplicate</button>
              <button className="danger" onClick={() => confirm(`Delete "${l.title}"? This cannot be undone.`) && act(() => fetch("/api/lessons/" + l.id, { method: "DELETE" }))}><Trash2 size={14} /> Delete</button></div></details></div>
        </article>))}</div>
    </div>
  );
}
