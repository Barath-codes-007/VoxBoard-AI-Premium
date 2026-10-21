import { useEffect, useRef, useState } from "react";
import { wsUrl } from "./store";
export default function Remote() {
  const [code, setCode] = useState(new URLSearchParams(location.hash.split("?")[1] || "").get("code") || "");
  const [on, setOn] = useState(false); const [msg, setMsg] = useState(""); const ws = useRef<WebSocket | null>(null);
  const send = (o: object) => ws.current?.readyState === 1 && ws.current.send(JSON.stringify(o));
  const connect = () => {
    const w = new WebSocket(wsUrl(`/ws/${code}?role=remote`));
    w.onopen = () => { setOn(true); setMsg(""); }; w.onclose = () => { setOn(false); setMsg("Disconnected or invalid code."); }; ws.current = w;
  };
  useEffect(() => { if (code.length === 6 && !on) connect(); return () => ws.current?.close(); }, []);
  const pad = useRef<HTMLCanvasElement>(null); const down = useRef(false);
  const pt = (e: React.PointerEvent) => { const r = pad.current!.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; };
  if (!on) return (<main className="home"><h2>Connect to board</h2><input inputMode="numeric" maxLength={6} placeholder="6-digit code" value={code} onChange={e => setCode(e.target.value)} /><button onClick={connect}>Connect</button><p className="err">{msg}</p></main>);
  const B = (l: string, cmd: any) => <button key={l} onClick={() => send(cmd)}>{l}</button>;
  return (
    <main className="remote">
      <p className="pill">Connected</p>
      <div className="grid">{[B("Pen", { cmd: "tool", v: "pen" }), B("Eraser", { cmd: "tool", v: "eraser" }), B("Undo", { cmd: "undo" }), B("Redo", { cmd: "redo" }), B("Prev", { cmd: "prev" }), B("Next", { cmd: "next" }), B("Listen", { cmd: "listen" }), B("Zoom +", { cmd: "zoom", v: 1.2 }), B("Zoom -", { cmd: "zoom", v: 0.8 }), B("Present", { cmd: "present" })]}</div>
      <div className="row">{["#111111", "#d62828", "#1d4ed8", "#15803d"].map(c => <button key={c} className="sw" aria-label={"Colour " + c} style={{ background: c }} onClick={() => send({ cmd: "color", v: c })}> </button>)}</div>
      <canvas ref={pad} className="pad" onPointerDown={e => { down.current = true; send({ cmd: "stroke", phase: "start", ...pt(e) }); }} onPointerMove={e => down.current && send({ cmd: "stroke", phase: "move", ...pt(e) })} onPointerUp={() => { down.current = false; send({ cmd: "stroke", phase: "end" }); }} />
      <button className="ghost" onClick={() => { ws.current?.close(); setOn(false); }}>Disconnect</button>
    </main>
  );
}
