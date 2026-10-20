import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LayoutDashboard, Library, PenTool, FileUp, Sparkles, Smartphone, Settings, HelpCircle, Menu, PanelLeftClose, PanelLeftOpen, Mic, FileText, Sigma } from "lucide-react";
import Board from "./Board";
import Remote from "./Remote";
import Dashboard from "./Dashboard";
import { ImportPage, AiPage, MobilePage, SettingsPage, HelpPage } from "./Pages";
import { Studio, Review, Library as TLibrary } from "./Studio";
import { recStatus, recCtl } from "./recbus";
import Graph from "./Graph";
import { openLast, prefs } from "./store";
import "./styles.css";

const NAV = [["", "Dashboard", LayoutDashboard], ["lessons", "My Lessons", Library], ["board", "Smartboard", PenTool], ["studio", "Lecture Studio", Mic], ["library", "Transcript Library", FileText], ["graph", "Graph Studio", Sigma], ["import", "Import PDF", FileUp], ["ai", "AI Assistant", Sparkles], ["mobile", "Mobile Controller", Smartphone], ["settings", "Settings", Settings], ["help", "Help", HelpCircle]] as const;

export default function App() {
  const [hash, setHash] = useState(location.hash || "#/"); const [col, setCol] = useState(false); const [drawer, setDrawer] = useState(false);
  useEffect(() => { document.documentElement.dataset.theme = prefs().theme || "dark"; const f = () => { setHash(location.hash || "#/"); setDrawer(false); }; addEventListener("hashchange", f); return () => removeEventListener("hashchange", f); }, []);
  const [view, arg] = hash.slice(2).split("?")[0].split("/");
  // Lecture Studio stays mounted (in a portal) once opened, so a recording keeps running while you use the board or Graph Studio.
  const studioOn = view === "studio" && !arg; const host = useMemo(() => document.createElement("div"), []); const slot = useRef<HTMLDivElement>(null); const [seen, setSeen] = useState(false);
  useEffect(() => { if (studioOn) setSeen(true); }, [studioOn]);
  useLayoutEffect(() => { if (studioOn && slot.current) slot.current.appendChild(host); else host.remove(); }, [studioOn, hash]);
  const keep = seen || studioOn ? createPortal(<Studio />, host) : null; const bar = <RecBar hide={studioOn} />;
  if (view === "remote") return <><Remote />{keep}{null}</>;
  if (view === "board" && arg) return <><Board lessonId={arg} />{keep}{bar}</>;
  const go = async (k: string) => { if (k === "board") { try { location.hash = "#/board/" + await openLast(); } catch { location.hash = "#/"; } } else location.hash = "#/" + k; };
  const page = view === "graph" ? <Graph lessonId={arg} /> : view === "studio" ? (arg ? <Review id={arg} /> : null) : view === "library" ? <TLibrary /> : view === "lessons" ? <Dashboard full /> : view === "import" ? <ImportPage /> : view === "ai" ? <AiPage /> : view === "mobile" ? <MobilePage /> : view === "settings" ? <SettingsPage /> : view === "help" ? <HelpPage /> : <Dashboard />;
  return (
    <>
    <div className={"shell" + (col ? " col" : "") + (drawer ? " open" : "")}>
      <aside className="side" aria-label="Main navigation">
        <div className="brand"><span className="logo"><Mic size={16} /></span><span className="bn"><b>VoxBoard AI</b><small>Intelligent Teaching Workspace</small></span></div>
        <nav>{NAV.map(([k, l, I]) => <button key={k} className={"nav" + ((view || "") === k ? " active" : "")} aria-current={(view || "") === k ? "page" : undefined} data-tip={l} onClick={() => go(k)}><I size={18} /><span>{l}</span></button>)}</nav>
        <button className="nav collapse" onClick={() => setCol(c => !c)} aria-label="Collapse sidebar">{col ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}<span>Collapse</span></button>
      </aside>
      <div className="scrim" onClick={() => setDrawer(false)} />
      <div className="content"><header className="mbar"><button className="ib" aria-label="Open menu" onClick={() => setDrawer(true)}><Menu size={18} /></button><b>VoxBoard AI</b></header><main>{studioOn ? <div ref={slot} /> : page}</main></div>
    </div>
    {keep}{bar}
    </>
  );
}

function RecBar({ hide }: { hide: boolean }) {
  const rs = recStatus.use(); if (hide || (rs.st !== "RECORDING" && rs.st !== "PAUSED")) return null;
  const c = recCtl.cur, t = Math.floor(rs.el), p = (n: number) => String(n).padStart(2, "0");
  return <div className="recbar" role="status"><span className={"dot" + (rs.st === "RECORDING" ? " live" : "")} /><b>{p(Math.floor(t / 3600))}:{p(Math.floor((t % 3600) / 60))}:{p(t % 60)}</b><span>{rs.st === "PAUSED" ? "Paused" : "Recording"}</span>
    {rs.st === "RECORDING" ? <button className="sm" onClick={() => c?.pause()}>Pause</button> : <button className="sm" onClick={() => c?.resume()}>Resume</button>}
    <button className="sm" onClick={() => c?.snap()}>Graph snapshot</button><button className="sm" onClick={() => c?.bm("Important")}>Bookmark</button><button className="sm primary" onClick={() => c?.stop()}>Stop and save</button><a className="btn sm" href="#/studio">Studio</a></div>;
}
