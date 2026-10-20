import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { ChevronLeft, Smartphone, Presentation, Mic, MicOff, Settings, MousePointer2, Hand, Pencil, Highlighter, Eraser, Type, Minus, ArrowUpRight, Square, Circle, Crosshair, Undo2, Redo2, ZoomIn, ZoomOut, Maximize, ImagePlus, FileUp, FileJson, Download, Palette, Copy, Trash2, Plus, Bold, Italic, AlignLeft, AlignCenter, AlignRight, List, ListOrdered, MoreHorizontal, Triangle, Diamond, Pentagon, Hexagon, Star, MoveHorizontal, RectangleHorizontal, PaintBucket, BringToFront, SendToBack, ArrowLeft, ArrowRight, Expand, RotateCcw, Sigma, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { pending } from "./store";
import { jsPDF } from "jspdf";
import { browserSpeech } from "./voice";
import { makeQueue } from "./queue";

type Obj = { k: "pen" | "hl" | "eraser" | "line" | "arrow" | "rect" | "ellipse" | "text" | "img" | "rrect" | "darrow" | "triangle" | "diamond" | "pentagon" | "hexagon" | "star" | "cross"; c: string; w: number; p: number[][]; text?: string; t0?: number; src?: string; b?: boolean; i?: boolean; f?: boolean; d?: boolean; a?: number; graph?: any };
type Page = { id: string; name: string; bg: string; objs: Obj[] };
const prefs = (): any => { try { return JSON.parse(localStorage.getItem("vb") || "{}"); } catch { return {}; } };
const np = (n: number): Page => ({ id: Math.random().toString(36).slice(2), name: "Page " + n, bg: prefs().bg || "white", objs: [] });
const bgColor: Record<string, string> = { white: "#fff", black: "#111", grid: "#fff", ruled: "#fff", dots: "#fff" };
const imgs: Record<string, HTMLImageElement> = {}; let onImg: () => void = () => {};
const mctx = document.createElement("canvas").getContext("2d")!;
const SHAPES: [Obj["k"], LucideIcon, string][] = [["line", Minus, "Line"], ["arrow", ArrowUpRight, "Arrow"], ["darrow", MoveHorizontal, "Double arrow"], ["rect", Square, "Rectangle"], ["rrect", RectangleHorizontal, "Rounded rectangle"], ["ellipse", Circle, "Ellipse"], ["triangle", Triangle, "Triangle"], ["diamond", Diamond, "Diamond"], ["pentagon", Pentagon, "Pentagon"], ["hexagon", Hexagon, "Hexagon"], ["star", Star, "Star"], ["cross", Plus, "Cross"]];
const KEYS: Record<string, Obj["k"] | "pan" | "laser" | "select"> = { v: "select", h: "pan", p: "pen", m: "hl", e: "eraser", t: "text", l: "line", a: "arrow", r: "rect", o: "ellipse", k: "laser" };
const reg = (n: number, x0: number, y0: number, x1: number, y1: number) => Array.from({ length: n }, (_, i) => { const t = (2 * Math.PI * i) / n; return [(x0 + x1) / 2 + ((x1 - x0) / 2) * Math.sin(t), (y0 + y1) / 2 - ((y1 - y0) / 2) * Math.cos(t)]; });
const POLY: Record<string, (a: number, b: number, c: number, d: number) => number[][]> = {
  triangle: (a, b, c, d) => [[(a + c) / 2, b], [c, d], [a, d]],
  diamond: (a, b, c, d) => [[(a + c) / 2, b], [c, (b + d) / 2], [(a + c) / 2, d], [a, (b + d) / 2]],
  pentagon: (a, b, c, d) => reg(5, a, b, c, d), hexagon: (a, b, c, d) => reg(6, a, b, c, d),
  star: (a, b, c, d) => { const o = reg(5, a, b, c, d), cx = (a + c) / 2, cy = (b + d) / 2, out: number[][] = []; o.forEach((p, i) => { out.push(p); const n = o[(i + 1) % 5]; out.push([cx + ((p[0] + n[0]) / 2 - cx) * 0.45, cy + ((p[1] + n[1]) / 2 - cy) * 0.45]); }); return out; },
  cross: (a, b, c, d) => { const w = (c - a) / 3, h = (d - b) / 3; return [[a + w, b], [a + 2 * w, b], [a + 2 * w, b + h], [c, b + h], [c, b + 2 * h], [a + 2 * w, b + 2 * h], [a + 2 * w, d], [a + w, d], [a + w, b + 2 * h], [a, b + 2 * h], [a, b + h], [a + w, b + h]]; },
};
const head = (ctx: CanvasRenderingContext2D, f: number[], t: number[], w: number) => { const g = Math.atan2(t[1] - f[1], t[0] - f[0]), L = 12 + w * 2; for (const s of [-0.5, 0.5]) { ctx.moveTo(t[0], t[1]); ctx.lineTo(t[0] - L * Math.cos(g + s), t[1] - L * Math.sin(g + s)); } };
const corners = (b: number[]) => [[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]]];
const bbox = (o: Obj): number[] => {
  if (o.k === "text") { const x = o.p[0][0], y = o.p[0][1]; mctx.font = `${o.i ? "italic " : ""}${o.b ? "bold " : ""}${o.w}px sans-serif`; return [x, y - o.w, x + mctx.measureText(o.text || "").width, y + o.w * 0.25]; }
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const q of o.p) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
  const pad = o.w / 2 + 4; return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
};

function Thumb({ pg, draw, on, label, click, rename }: { pg: Page; draw: (c: CanvasRenderingContext2D, p: Page, w: number, h: number) => boolean; on: boolean; label: string; click: () => void; rename: () => void }) {
  const r = useRef<HTMLCanvasElement>(null);
  useEffect(() => { const x = r.current!.getContext("2d")!; x.save(); x.scale(0.1, 0.1); draw(x, { ...pg, objs: pg.objs.map(o => ({ ...o, t0: undefined })) }, 1600, 900); x.restore(); }, [pg, draw]);
  return <button className={"thumb" + (on ? " on" : "")} onClick={click} onDoubleClick={rename} title="Double-click to rename"><canvas ref={r} width={160} height={90} /><span>{label}</span></button>;
}

export default function Board({ lessonId }: { lessonId: string }) {
  const [title, setTitle] = useState("Untitled lesson");
  const [pages, setPages] = useState<Page[]>([np(1)]); const [cur, setCur] = useState(0);
  const [tool, setTool] = useState<Obj["k"] | "pan" | "laser" | "select">("pen");
  const P = useMemo(prefs, []); const [color, setColor] = useState<string>(P.color || "#111111"); const [width, setWidth] = useState<number>(P.width || 4);
  const [theme, setTheme] = useState<string>(P.theme || "auto"); const [modal, setModal] = useState(""); const [sel, setSel] = useState(-1); const [fill, setFill] = useState(false); const [dash, setDash] = useState(false); const [alpha, setAlpha] = useState(1);
  const [zoom, setZoom] = useState(1); const [save, setSave] = useState("Saved");
  const [listening, setListening] = useState(false); const [interim, setInterim] = useState("");
  const [lang, setLang] = useState<string>(P.lang || "en-US"); const [speed, setSpeed] = useState<number>(P.speed || 40); const [anim, setAnim] = useState<boolean>(P.anim ?? true);
  const [err, setErr] = useState(""); const [verr, setVerr] = useState(false); const [busy, setBusy] = useState(""); const [focus, setFocus] = useState(false); const [dock, setDock] = useState(() => innerWidth > 900); const [typed, setTyped] = useState(""); const [pair, setPair] = useState<{ code: string; qr: string; n: number } | null>(null);
  const [transcript, setTranscript] = useState(""); const [present, setPresent] = useState(false);
  const cv = useRef<HTMLCanvasElement>(null); const draft = useRef<Obj | null>(null); const loaded = useRef(false);
  const selRef = useRef(-1); const dragRef = useRef<number[] | null>(null); const stage = useRef<HTMLDivElement>(null); const clip = useRef<Obj | null>(null);
  const resizeRef = useRef<{ h: number; box: number[]; orig: Obj } | null>(null);
  const hist = useRef<Page[][]>([]); const fut = useRef<Page[][]>([]); const skip = useRef(false); const prevPages = useRef(pages); const snapped = useRef(false);
  useEffect(() => {
    if (skip.current) skip.current = false;
    else if (prevPages.current !== pages) {
      const busy = !!(dragRef.current || resizeRef.current);
      if (!busy || !snapped.current) { hist.current.push(prevPages.current); if (hist.current.length > 100) hist.current.shift(); fut.current = []; if (busy) snapped.current = true; }
    }
    prevPages.current = pages;
  }, [pages]);
  useEffect(() => { localStorage.setItem("vb", JSON.stringify({ ...prefs(), color, width, lang, speed, anim, theme })); }, [color, width, lang, speed, anim, theme]);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { selRef.current = -1; setSel(-1); }, [cur]);
  const st = useRef({ pages, cur, color, width, tool, speed, anim, lang, fill, dash, alpha }); st.current = { pages, cur, color, width, tool, speed, anim, lang, fill, dash, alpha };
  const page = pages[cur]; const accept = useMemo(makeQueue, []);

  const mut = useCallback((f: (p: Page) => Page) => { setPages(ps => ps.map((p, i) => (i === st.current.cur ? f(p) : p))); setSave("Unsaved"); }, []);

  // load + autosave
  useEffect(() => { fetch("/api/lessons/" + lessonId).then(r => { if (!r.ok) throw 0; return r.json(); }).then(l => { setTitle(l.title); if (l.data.pages?.length) { skip.current = true; setPages(l.data.pages); } setTranscript(l.data.transcript || ""); loaded.current = true; }).catch(() => setErr("Could not load lesson. Is the backend running?")); }, [lessonId]);
  useEffect(() => {
    if (!loaded.current || save !== "Unsaved") return;
    const t = setTimeout(async () => { setSave("Saving…"); try { const r = await fetch("/api/lessons/" + lessonId, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, data: { pages, transcript } }) }); setSave(r.ok ? "Saved" : "Save failed"); } catch { setSave("Save failed"); } }, 1200);
    return () => clearTimeout(t);
  }, [pages, title, transcript, save, lessonId]);
  useEffect(() => { const f = (e: BeforeUnloadEvent) => { if (save !== "Saved") e.preventDefault(); }; addEventListener("beforeunload", f); return () => removeEventListener("beforeunload", f); }, [save]);

  const draw = useCallback((ctx: CanvasRenderingContext2D, pg: Page, W: number, H: number, showSel = false) => {
    ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.fillStyle = bgColor[pg.bg] || pg.bg; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = pg.bg === "black" ? "#444" : "#dde"; ctx.lineWidth = 1; ctx.fillStyle = ctx.strokeStyle;
    if (pg.bg === "grid" || pg.bg === "ruled") for (let y = 40; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    if (pg.bg === "grid") for (let x = 40; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    if (pg.bg === "dots") for (let y = 40; y < H; y += 40) for (let x = 40; x < W; x += 40) ctx.fillRect(x, y, 2, 2);
    let animating = false;
    const all = draft.current ? [...pg.objs, draft.current] : pg.objs;
    for (const o of all) {
      ctx.lineCap = ctx.lineJoin = "round"; ctx.lineWidth = o.w; ctx.strokeStyle = ctx.fillStyle = o.c; ctx.globalAlpha = o.k === "hl" ? 0.35 : (o.a ?? 1); ctx.setLineDash(o.d ? [o.w * 2 + 2, o.w * 2] : []);
      ctx.globalCompositeOperation = "source-over";
      if (o.k === "text") {
        ctx.globalAlpha = 1; ctx.font = `${o.i ? "italic " : ""}${o.b ? "bold " : ""}${o.w}px sans-serif`;
        let s = o.text || ""; if (o.t0 && st.current.anim) { const n = Math.floor(((performance.now() - o.t0) / 1000) * st.current.speed); if (n < s.length) { s = s.slice(0, n); animating = true; } }
        ctx.fillText(s, o.p[0][0], o.p[0][1]); continue;
      }
      const [a, b] = [o.p[0], o.p[o.p.length - 1]];
      if (o.k === "img") { ctx.globalAlpha = 1; let im = imgs[o.src!]; if (!im) { im = new Image(); im.onload = () => onImg(); im.src = o.src!; imgs[o.src!] = im; } if (im.complete && im.naturalWidth) ctx.drawImage(im, a[0], a[1], b[0] - a[0], b[1] - a[1]); continue; }
      ctx.beginPath();
      if (o.k === "pen" || o.k === "hl" || o.k === "eraser") { if (o.k === "eraser") { ctx.strokeStyle = bgColor[pg.bg] || pg.bg; } ctx.moveTo(a[0], a[1]); o.p.forEach(q => ctx.lineTo(q[0], q[1])); }
      else if (o.k === "line" || o.k === "arrow") { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); if (o.k === "arrow") { const g = Math.atan2(b[1] - a[1], b[0] - a[0]), L = 12 + o.w * 2; for (const s of [-0.5, 0.5]) { ctx.moveTo(b[0], b[1]); ctx.lineTo(b[0] - L * Math.cos(g + s), b[1] - L * Math.sin(g + s)); } } }
      else if (o.k === "darrow") { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); head(ctx, a, b, o.w); head(ctx, b, a, o.w); }
      else if (o.k === "rect") ctx.rect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
      else if (o.k === "ellipse") ctx.ellipse((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.abs(b[0] - a[0]) / 2, Math.abs(b[1] - a[1]) / 2, 0, 0, 7);
      else if (o.k === "rrect") ctx.roundRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), 24);
      else { const q = POLY[o.k]?.(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])); if (q) { ctx.moveTo(q[0][0], q[0][1]); for (const z of q.slice(1)) ctx.lineTo(z[0], z[1]); ctx.closePath(); } }
      if (o.f && !["pen", "hl", "eraser", "line", "arrow", "darrow"].includes(o.k)) { const ga = ctx.globalAlpha; ctx.globalAlpha = ga * 0.3; ctx.fill(); ctx.globalAlpha = ga; }
      ctx.stroke();
    }
    if (showSel && selRef.current >= 0 && pg.objs[selRef.current]) { const q = bbox(pg.objs[selRef.current]); ctx.setLineDash([8, 6]); ctx.strokeStyle = "#0b6e6e"; ctx.lineWidth = 2; ctx.strokeRect(q[0], q[1], q[2] - q[0], q[3] - q[1]); ctx.setLineDash([]); ctx.fillStyle = "#fff"; for (const c of corners(q)) { ctx.fillRect(c[0] - 7, c[1] - 7, 14, 14); ctx.strokeRect(c[0] - 7, c[1] - 7, 14, 14); } }
    ctx.globalAlpha = 1; return animating;
  }, []);

  useEffect(() => {
    let raf = 0; const c = cv.current!; const ctx = c.getContext("2d")!;
    const tick = () => { const a = draw(ctx, st.current.pages[st.current.cur], c.width, c.height, true); if (a || draft.current) raf = requestAnimationFrame(tick); };
    tick(); return () => cancelAnimationFrame(raf);
  }, [pages, cur, draw, zoom, sel]);

  useEffect(() => { const c = cv.current!; c.width = 1600; c.height = 900; }, []);
  const xy = (e: React.PointerEvent) => { const r = cv.current!.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * 1600, ((e.clientY - r.top) / r.height) * 900]; };
  const redraw = () => { const c = cv.current!; draw(c.getContext("2d")!, st.current.pages[st.current.cur], c.width, c.height, true); }; onImg = redraw;

  const onDown = (e: React.PointerEvent) => {
    if (present) return; const p = xy(e); const { tool: t, color: c, width: w, fill: fl, dash: ds, alpha: al } = st.current;
    if (t === "pan" || t === "laser") return;
    (e.target as Element).setPointerCapture(e.pointerId);
    if (t === "select") { const objs = st.current.pages[st.current.cur].objs; const so = selRef.current >= 0 ? objs[selRef.current] : undefined; if (so) { const bx = bbox(so); const hi = corners(bx).findIndex(c => Math.abs(p[0] - c[0]) < 16 && Math.abs(p[1] - c[1]) < 16); if (hi >= 0) { resizeRef.current = { h: hi, box: bx, orig: so }; return; } } let h = -1; for (let i = objs.length - 1; i >= 0; i--) { const q = bbox(objs[i]); if (p[0] >= q[0] && p[0] <= q[2] && p[1] >= q[1] && p[1] <= q[3]) { h = i; break; } } selRef.current = h; setSel(h); dragRef.current = h >= 0 ? p : null; redraw(); return; }
    if (t === "text") { const s = prompt("Text:"); if (s) { mut(pg => ({ ...pg, objs: [...pg.objs, { k: "text", c, w: w * 5, p: [p], text: s }] })); } return; }
    draft.current = { k: t, c, w: t === "hl" ? w * 3 : t === "eraser" ? w * 4 : w, p: [p], f: fl, d: ds, a: t === "eraser" ? undefined : al }; redraw();
  };
  const onMove = (e: React.PointerEvent) => {
    const t = st.current.tool;
    if (t === "pan" && e.buttons) { stage.current!.scrollLeft -= e.movementX; stage.current!.scrollTop -= e.movementY; return; }
    if (t === "laser" || present) { const p = xy(e); redraw(); const x = cv.current!.getContext("2d")!; x.fillStyle = "rgba(255,0,0,.85)"; x.beginPath(); x.arc(p[0], p[1], 14, 0, 7); x.fill(); return; }
    if (resizeRef.current && selRef.current >= 0) {
      const p = xy(e), { h, box, orig } = resizeRef.current, i = selRef.current;
      const cx = h % 2 ? box[2] : box[0], cy = h < 2 ? box[1] : box[3], ax = h % 2 ? box[0] : box[2], ay = h < 2 ? box[3] : box[1];
      const sx = Math.max(0.05, (p[0] - ax) / ((cx - ax) || 1)), sy = Math.max(0.05, (p[1] - ay) / ((cy - ay) || 1));
      const nx = orig.k === "text" ? { ...orig, w: Math.max(8, Math.round(orig.w * sy)), p: [[ax + (orig.p[0][0] - ax) * sy, ay + (orig.p[0][1] - ay) * sy]] } : { ...orig, p: orig.p.map(q => [ax + (q[0] - ax) * sx, ay + (q[1] - ay) * sy]) };
      setPages(ps => ps.map((pg, j) => j === st.current.cur ? { ...pg, objs: pg.objs.map((o, k) => k === i ? nx : o) } : pg)); setSave("Unsaved"); return;
    }
    if (dragRef.current && selRef.current >= 0) { const p = xy(e); const dx = p[0] - dragRef.current[0], dy = p[1] - dragRef.current[1], i = selRef.current; dragRef.current = p; setPages(ps => ps.map((pg, j) => j === st.current.cur ? { ...pg, objs: pg.objs.map((o, k) => k === i ? { ...o, p: o.p.map(q => [q[0] + dx, q[1] + dy]) } : o) } : pg)); setSave("Unsaved"); return; }
    if (!draft.current) return; const p = xy(e); const d = draft.current; if (["pen", "hl", "eraser"].includes(d.k)) d.p.push(p); else d.p[1] = p; redraw(); requestAnimationFrame(redraw); };
  const onUp = () => { if (resizeRef.current || dragRef.current) { resizeRef.current = null; dragRef.current = null; snapped.current = false; return; } const d = draft.current; draft.current = null; if (d) { mut(pg => ({ ...pg, objs: [...pg.objs, d] })); } };

  const undo = () => { const h = hist.current.pop(); if (!h) return; fut.current.push(st.current.pages); skip.current = true; setPages(h); setCur(c => Math.min(c, h.length - 1)); setSave("Unsaved"); };
  const redoF = () => { const h = fut.current.pop(); if (!h) return; hist.current.push(st.current.pages); skip.current = true; setPages(h); setCur(c => Math.min(c, h.length - 1)); setSave("Unsaved"); };
  const addText = useCallback((s: string) => {
    mut(pg => { const n = pg.objs.filter(o => o.k === "text").length; const size = 36; const perCol = 20; const x = 60 + Math.floor(n / perCol) * 520; const y = 70 + (n % perCol) * 44;
      return { ...pg, objs: [...pg.objs, { k: "text", c: st.current.color, w: size, p: [[x, y]], text: s, t0: performance.now() }] }; });
    setTranscript(t => t + s + "\n");
  }, [mut]);

  const speech = useMemo(() => browserSpeech(setInterim, t => { const p = accept(t); if (p) addText(p); setInterim(""); }, m => { setErr(m); setVerr(true); setListening(false); }, () => setListening(false)), [accept, addText]);
  const toggleListen = () => { if (listening) { speech.stop(); setListening(false); } else { setErr(""); setVerr(false); speech.start(st.current.lang); setListening(true); } };

  const delSel = () => { if (sel < 0) return; const i = sel; mut(pg => ({ ...pg, objs: pg.objs.filter((_, k) => k !== i) })); selRef.current = -1; setSel(-1); };
  const dup = () => { const o = page.objs[sel]; if (!o) return; const c = { ...o, p: o.p.map(q => [q[0] + 30, q[1] + 30]), t0: undefined }; const n = page.objs.length; mut(pg => ({ ...pg, objs: [...pg.objs, c] })); selRef.current = n; setSel(n); };
  const scaleSel = (f: number) => { const i = sel; if (i < 0) return; mut(pg => ({ ...pg, objs: pg.objs.map((o, k) => { if (k !== i) return o; if (o.k === "text") return { ...o, w: Math.round(o.w * f) }; const a = o.p[0]; return { ...o, p: o.p.map(q => [a[0] + (q[0] - a[0]) * f, a[1] + (q[1] - a[1]) * f]) }; }) })); };
  const fmt = (key: "b" | "i") => { if (sel < 0 || page.objs[sel]?.k !== "text") return; mut(pg => ({ ...pg, objs: pg.objs.map((o, k) => k !== sel ? o : key === "b" ? { ...o, b: !o.b } : { ...o, i: !o.i }) })); };
  const addList = (num: boolean) => { const s = prompt("List items, separated by ;"); if (!s) return; s.split(";").map(x => x.trim()).filter(Boolean).forEach((t, i) => addText((num ? `${i + 1}. ` : "\u2022 ") + t)); };
  const alignSel = (a: "left" | "center" | "right") => { const o = page.objs[sel]; if (!o || o.k !== "text") return; const q = bbox(o), wd = q[2] - q[0]; const x = a === "left" ? 60 : a === "center" ? (1600 - wd) / 2 : 1540 - wd; mut(pg => ({ ...pg, objs: pg.objs.map((z, k) => k === sel ? { ...z, p: [[x, z.p[0][1]]] } : z) })); };
  const mvPage = (d: number) => { const j = cur + d; if (j < 0 || j >= pages.length) return; setPages(ps => { const n = [...ps]; [n[cur], n[j]] = [n[j], n[cur]]; return n; }); setCur(j); setSave("Unsaved"); };
  const editText = (e: React.MouseEvent) => { const r = cv.current!.getBoundingClientRect(); const x = ((e.clientX - r.left) / r.width) * 1600, y = ((e.clientY - r.top) / r.height) * 900; for (let i = page.objs.length - 1; i >= 0; i--) { const o = page.objs[i], q = bbox(o); if (o.k === "text" && x >= q[0] && x <= q[2] && y >= q[1] && y <= q[3]) { const s = prompt("Edit text", o.text); if (s !== null) mut(pg => ({ ...pg, objs: pg.objs.map((z, k) => k === i ? { ...z, text: s, t0: undefined } : z) })); return; } } };
  const addImg = async (f?: File) => {
    if (!f) return; if (!f.type.startsWith("image/") || f.size > 25e6) { setErr("Choose an image under 25 MB (PNG, JPG, WebP, GIF or SVG)."); return; }
    setBusy("Adding image…");
    try {
      const url = URL.createObjectURL(f); const im = new Image(); im.src = url; await im.decode(); if (!im.naturalWidth) throw 0;
      const sc = Math.min(1, 4096 / Math.max(im.naturalWidth, im.naturalHeight)); const c = document.createElement("canvas"); c.width = Math.round(im.naturalWidth * sc); c.height = Math.round(im.naturalHeight * sc);
      c.getContext("2d")!.drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      const src = c.toDataURL(f.type === "image/jpeg" ? "image/jpeg" : "image/png", 0.95);
      const k = Math.min(1100 / c.width, 650 / c.height, 1), w = c.width * k, h = c.height * k, x = (1600 - w) / 2, y = (900 - h) / 2;
      mut(pg => ({ ...pg, objs: [...pg.objs, { k: "img", c: "#000", w: 1, p: [[x, y], [x + w, y + h]], src }] }));
    } catch { setErr("Could not read that image."); } finally { setBusy(""); }
  };
  const importJson = async (f?: File) => { if (!f) return; try { const d = JSON.parse(await f.text()); if (!Array.isArray(d.pages) || !d.pages.length) throw 0; setPages(d.pages); setCur(0); setTranscript(d.transcript || ""); if (d.title) setTitle(d.title); setSave("Unsaved"); } catch { setErr("That file is not a VoxBoard JSON export."); } };
  const importPdf = async (f?: File) => {
    if (!f) return; if (f.size > 100e6) { setErr("PDF is larger than 100 MB."); return; }
    try {
      setBusy("Opening PDF…");
      const pdfjs = await import("pdfjs-dist"); pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      const doc = await pdfjs.getDocument({ data: await f.arrayBuffer() }).promise; const n = Math.min(doc.numPages, 150); const add: Page[] = [];
      for (let i = 1; i <= n; i++) {
        setBusy(`Importing page ${i} of ${n}…`);
        const pg = await doc.getPage(i); const v1 = pg.getViewport({ scale: 1 }); const vp = pg.getViewport({ scale: Math.min(1600 / v1.width, 900 / v1.height) * 2 });
        const c = document.createElement("canvas"); c.width = Math.round(vp.width); c.height = Math.round(vp.height); await pg.render({ canvasContext: c.getContext("2d")!, viewport: vp }).promise;
        const w = vp.width / 2, h = vp.height / 2;
        add.push({ ...np(i), name: `${f.name.slice(0, 14)} p${i}`, objs: [{ k: "img", c: "#000", w: 1, src: c.toDataURL("image/jpeg", 0.92), p: [[(1600 - w) / 2, (900 - h) / 2], [(1600 + w) / 2, (900 + h) / 2]] }] });
        c.width = c.height = 0;
      }
      const blank = pages.length === 1 && pages[0].objs.length === 0;
      setPages(ps => ps.length === 1 && ps[0].objs.length === 0 ? add : [...ps, ...add]); setCur(blank ? 0 : pages.length); setSave("Unsaved");
      if (doc.numPages > n) setErr(`Imported the first ${n} of ${doc.numPages} pages.`);
    } catch { setErr("Could not read that PDF."); } finally { setBusy(""); }
  };
  useEffect(() => { if (pending.pdf) { const f = pending.pdf; pending.pdf = undefined; importPdf(f); } }, []);
  useEffect(() => { if (!err) return; const t = setTimeout(() => setErr(""), 7000); return () => clearTimeout(t); }, [err]);
  // pairing
  const wsRef = useRef<WebSocket | null>(null); const remoteStroke = useRef<Obj | null>(null);
  const handleCmd = useRef((_m: any) => {}); 
  handleCmd.current = (m: any) => {
    if (m.cmd === "tool") setTool(m.v); else if (m.cmd === "color") setColor(m.v); else if (m.cmd === "undo") undo(); else if (m.cmd === "redo") redoF();
    else if (m.cmd === "next") setCur(c => Math.min(c + 1, st.current.pages.length - 1)); else if (m.cmd === "prev") setCur(c => Math.max(c - 1, 0));
    else if (m.cmd === "zoom") setZoom(z => Math.min(3, Math.max(0.4, z * m.v))); else if (m.cmd === "listen") toggleListen(); else if (m.cmd === "present") setPresent(p => !p);
    else if (m.cmd === "stroke") { const { color: c, width: w, tool: t } = st.current; const p = [m.x * 1600, m.y * 900];
      if (m.phase === "start") remoteStroke.current = { k: t === "eraser" ? "eraser" : "pen", c, w: t === "eraser" ? w * 4 : w, p: [p] };
      else if (m.phase === "move" && remoteStroke.current) { remoteStroke.current.p.push(p); draft.current = remoteStroke.current; redraw(); }
      else if (m.phase === "end" && remoteStroke.current) { const o = remoteStroke.current; remoteStroke.current = null; draft.current = null; mut(pg => ({ ...pg, objs: [...pg.objs, o] })); } }
  };
  const startPair = async () => {
    try {
      const s = await (await fetch("/api/sessions", { method: "POST" })).json();
      const w = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/${s.code}?role=host&token=${s.token}`);
      const url = `${location.origin}/#/remote?code=${s.code}`; const qr = await QRCode.toDataURL(url);
      w.onmessage = ev => { const m = JSON.parse(ev.data); if (m.type === "status") setPair(p => p && { ...p, n: m.remotes }); else if (m.type === "cmd") handleCmd.current(m); };
      w.onclose = () => setErr("Phone connection closed. Click Pair phone to reconnect."); wsRef.current = w; setPair({ code: s.code, qr, n: 0 });
    } catch { setErr("Could not create a pairing session. Is the backend running?"); }
  };

  const render2x = (pg: Page) => { const c = document.createElement("canvas"); c.width = 3200; c.height = 1800; const x = c.getContext("2d")!; x.scale(2, 2); draw(x, { ...pg, objs: pg.objs.map(o => ({ ...o, t0: undefined })) }, 1600, 900); return c; };
  const png = () => { const a = document.createElement("a"); a.href = render2x(page).toDataURL("image/png"); a.download = `${title}-${page.name}.png`; a.click(); };
  const pdf = async () => { try { const d = new jsPDF({ orientation: "landscape", unit: "px", format: [1600, 900] }); for (let i = 0; i < pages.length; i++) { setBusy(`Building PDF: page ${i + 1} of ${pages.length}…`); await new Promise(r => setTimeout(r, 0)); if (i) d.addPage([1600, 900], "landscape"); d.addImage(render2x(pages[i]).toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, 1600, 900); } d.save(title + ".pdf"); } catch { setErr("PDF export failed."); } finally { setBusy(""); } };
  const dl = (name: string, data: string, type: string) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([data], { type })); a.download = name; a.click(); };

  useEffect(() => { const f = (e: KeyboardEvent) => { if (["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement).tagName)) return; if (e.ctrlKey && e.key === "z") undo(); else if (e.ctrlKey && e.key === "y") redoF(); else if (e.key === "Delete") delSel(); else if (e.ctrlKey && e.key === "d") { e.preventDefault(); dup(); } else if (e.ctrlKey && e.key === "c") clip.current = page.objs[sel] || null; else if (e.ctrlKey && e.key === "v" && clip.current) { const c = clip.current; mut(pg => ({ ...pg, objs: [...pg.objs, { ...c, p: c.p.map(q => [q[0] + 30, q[1] + 30]), t0: undefined }] })); } else if (e.key === "Escape") { setPresent(false); setFocus(false); } else if (!e.ctrlKey && !e.metaKey && KEYS[e.key.toLowerCase()]) setTool(KEYS[e.key.toLowerCase()]); }; addEventListener("keydown", f); return () => removeEventListener("keydown", f); });

  const T = (k: typeof tool, l: string) => <button className={tool === k ? "on" : ""} onClick={() => setTool(k)}>{l}</button>;
  const enterFocus = () => { setFocus(true); document.documentElement.requestFullscreen?.().catch(() => {}); };
  const exitFocus = () => { setFocus(false); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); };
  useEffect(() => { const f = () => { if (!document.fullscreenElement) setFocus(false); }; document.addEventListener("fullscreenchange", f); return () => document.removeEventListener("fullscreenchange", f); }, []);
  const editGraph = async () => { const o = page.objs[sel]; if (!o?.graph) return; pending.editGraph = { def: o.graph, page: cur, idx: sel }; try { await fetch("/api/lessons/" + lessonId, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, data: { pages, transcript } }) }); } catch { /* continue */ } location.hash = "#/graph/" + lessonId; };
  const goGraph = async () => { try { await fetch("/api/lessons/" + lessonId, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, data: { pages, transcript } }) }); } catch { /* continue */ } location.hash = "#/graph/" + lessonId; };
  useEffect(() => { if (!pending.graph) return; const t = setInterval(() => { if (loaded.current) { clearInterval(t); const g = pending.graph; pending.graph = undefined; if (g) { const rp = g.replace; if (rp && st.current.pages[rp.page]?.objs[rp.idx]?.graph) { setPages(ps => ps.map((pg, i) => i === rp.page ? { ...pg, objs: pg.objs.map((o, k) => k === rp.idx ? { ...o, src: g.src, graph: g.def } : o) } : pg)); setCur(rp.page); setSave("Unsaved"); } else mut(pg => ({ ...pg, objs: [...pg.objs, { k: "img", c: "#000", w: 1, p: [[300, 169], [1300, 731]], src: g.src, graph: g.def }] })); } } }, 150); return () => clearInterval(t); }, []);
  const fs = () => { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => setErr("Fullscreen is not available.")); };
  const setProp = (k: "f" | "d" | "a", v: any) => { if (k === "f") setFill(v); else if (k === "d") setDash(v); else setAlpha(v); if (sel >= 0) mut(pg => ({ ...pg, objs: pg.objs.map((o, i) => i === sel ? { ...o, [k]: v } : o) })); };
  const layer = (d: 1 | -1) => { if (sel < 0) return; const o = page.objs[sel]; mut(pg => ({ ...pg, objs: d > 0 ? [...pg.objs.filter((_, i) => i !== sel), o] : [o, ...pg.objs.filter((_, i) => i !== sel)] })); const n = d > 0 ? page.objs.length - 1 : 0; selRef.current = n; setSel(n); };
  const shapeCur = SHAPES.find(x => x[0] === tool);
  useEffect(() => { const f = (e: ClipboardEvent) => { const im = Array.from(e.clipboardData?.files || []).find(x => x.type.startsWith("image/")); if (im) { e.preventDefault(); addImg(im); } }; addEventListener("paste", f); return () => removeEventListener("paste", f); });
  const fit = () => { const s = stage.current; if (s) setZoom(Math.max(0.3, Math.min(1, ((s.clientHeight - 32) * 16 / 9) / Math.max(1, s.clientWidth - 32)))); };
  useEffect(() => { const t = setTimeout(fit, 60); addEventListener("resize", fit); return () => { clearTimeout(t); removeEventListener("resize", fit); }; }, [present, dock, focus]);
  const Ib = (icon: React.ReactNode, label: string, on: boolean, fn: () => void) => <button key={label} className={"ib" + (on ? " on" : "")} data-tip={label} aria-label={label} aria-pressed={on || undefined} onClick={fn}>{icon}</button>;
  const tl = (k: typeof tool, I: LucideIcon, l: string) => Ib(<I size={18} />, l, tool === k, () => setTool(k));
  const so2 = sel >= 0 ? page.objs[sel] : undefined;
  const pickColor = (c: string) => { setColor(c); if (sel >= 0) mut(pg => ({ ...pg, objs: pg.objs.map((o, k) => k === sel ? { ...o, c } : o) })); };
  const vs = verr && !listening ? "error" : listening ? (interim ? "hearing" : "listening") : "idle";
  const vl: Record<string, string> = { idle: "Ready", listening: "Listening", hearing: "Hearing speech", error: "Needs attention" };
  return (
    <div className={"ws" + (present ? " present" : "")}>
      {!present && !focus && <header className="top">
        <a className="ib" href="#/" data-tip="Dashboard" aria-label="Dashboard"><ChevronLeft size={18} /></a>
        <input className="title" value={title} onChange={e => { setTitle(e.target.value); setSave("Unsaved"); }} aria-label="Lesson title" />
        <span className={"status " + save.replace(/\W/g, "")} role="status" aria-live="polite">{save}</span><span className="sp" />
        {Ib(<ArrowLeft size={18} />, "Previous page", false, () => setCur(c => Math.max(0, c - 1)))}<span className="status">{cur + 1} / {pages.length}</span>{Ib(<ArrowRight size={18} />, "Next page", false, () => setCur(c => Math.min(pages.length - 1, c + 1)))}{Ib(<Expand size={18} />, "Full screen board", false, enterFocus)}
        <button onClick={startPair}><Smartphone size={16} /> Pair phone</button>
        <button onClick={() => setPresent(true)}><Presentation size={16} /> Present</button>
        {Ib(<Mic size={18} />, "Voice panel", dock, () => setDock(d => !d))}
        <a className="ib" href="#/settings" data-tip="Settings" aria-label="Settings"><Settings size={18} /></a>
      </header>}
      {!present && !focus && <nav className="tools" aria-label="Tools">
        <div className="grp">{tl("select", MousePointer2, "Select")}{tl("pan", Hand, "Pan")}</div>
        <div className="grp">{tl("pen", Pencil, "Pen")}{tl("hl", Highlighter, "Highlighter")}{tl("eraser", Eraser, "Eraser")}</div>
        <div className="grp">{tl("text", Type, "Text")}
          <details className="menu"><summary className={"ib" + (shapeCur ? " on" : "")} data-tip="Shapes and lines" aria-label="Shapes and lines">{(() => { const I = shapeCur ? shapeCur[1] : Square; return <I size={18} />; })()}</summary><div className="pop shapes">{SHAPES.map(([k, I, l]) => <button key={k} className={"ib" + (tool === k ? " on" : "")} data-tip={l} aria-label={l} onClick={e => { setTool(k); e.currentTarget.closest("details")?.removeAttribute("open"); }}><I size={18} /></button>)}</div></details>
          {tl("laser", Crosshair, "Laser pointer")}{Ib(<Sigma size={18} />, "Graph Studio", false, goGraph)}</div>
        <div className="grp">{Ib(<Undo2 size={18} />, "Undo", false, undo)}{Ib(<Redo2 size={18} />, "Redo", false, redoF)}</div>
        <div className="grp">{Ib(<ZoomOut size={18} />, "Zoom out", false, () => setZoom(z => Math.max(0.4, z / 1.2)))}{Ib(<ZoomIn size={18} />, "Zoom in", false, () => setZoom(z => Math.min(3, z * 1.2)))}{Ib(<Maximize size={18} />, "Fit to screen", false, fit)}{Ib(<RotateCcw size={18} />, "Clear page", false, () => confirm("Clear everything on this page?") && mut(pg => ({ ...pg, objs: [] })))}</div>
        <div className="grp">
          <label className="ib" data-tip="Insert image"><ImagePlus size={18} /><input className="sr" type="file" accept="image/*" aria-label="Insert image" onChange={e => { addImg(e.target.files?.[0]); e.target.value = ""; }} /></label>
          <label className="ib" data-tip="Import PDF"><FileUp size={18} /><input className="sr" type="file" accept="application/pdf" aria-label="Import PDF" onChange={e => { importPdf(e.target.files?.[0]); e.target.value = ""; }} /></label>
          <label className="ib" data-tip="Import JSON"><FileJson size={18} /><input className="sr" type="file" accept="application/json" aria-label="Import JSON" onChange={e => { importJson(e.target.files?.[0]); e.target.value = ""; }} /></label>
        </div>
        <details className="menu"><summary className="btn sm"><Download size={15} /> Export</summary><div className="pop">
          <button onClick={png}>Page as PNG</button><button onClick={pdf}>All pages as PDF</button>
          <button onClick={() => dl(title + ".txt", transcript, "text/plain")}>Transcript (TXT)</button>
          <button onClick={() => dl(title + ".json", JSON.stringify({ title, pages, transcript }), "application/json")}>Lesson (JSON)</button></div></details>
      </nav>}
      {!present && !focus && <div className="props">
        {["#111111", "#d62828", "#1d4ed8", "#15803d", "#f59e0b", "#7c3aed"].map(c => <button key={c} className={"sw" + (color === c ? " on" : "")} style={{ background: c }} aria-label={"Colour " + c} onClick={() => pickColor(c)} />)}
        <input type="color" value={color} onChange={e => pickColor(e.target.value)} aria-label="Custom colour" />
        <label>Thickness {width}<input type="range" min={1} max={60} value={width} onChange={e => setWidth(+e.target.value)} /></label>
        <label>Opacity {Math.round(alpha * 100)}%<input type="range" min={10} max={100} value={Math.round(alpha * 100)} onChange={e => setProp("a", +e.target.value / 100)} /></label>
        {Ib(<PaintBucket size={18} />, "Fill shapes", fill, () => setProp("f", !fill))}{Ib(<MoreHorizontal size={18} />, "Dashed lines", dash, () => setProp("d", !dash))}
        <label>Background<select value={page.bg} onChange={e => mut(pg => ({ ...pg, bg: e.target.value }))}>{["white", "black", "grid", "ruled", "dots"].map(b => <option key={b}>{b}</option>)}</select></label>
        <label className="ib" data-tip="Custom background colour"><Palette size={18} /><input className="sr" type="color" aria-label="Custom background colour" onChange={e => mut(pg => ({ ...pg, bg: e.target.value }))} /></label>
        {so2 && <div className="grp" style={{ border: 0 }}>{Ib(<Copy size={18} />, "Duplicate", false, dup)}{so2.graph && Ib(<Sigma size={18} />, "Edit graph", false, editGraph)}{Ib(<Trash2 size={18} />, "Delete", false, delSel)}{Ib(<BringToFront size={18} />, "Bring to front", false, () => layer(1))}{Ib(<SendToBack size={18} />, "Send to back", false, () => layer(-1))}{Ib(<Plus size={18} />, "Bigger", false, () => scaleSel(1.2))}{Ib(<Minus size={18} />, "Smaller", false, () => scaleSel(1 / 1.2))}
          {so2.k === "text" && <>{Ib(<Bold size={18} />, "Bold", !!so2.b, () => fmt("b"))}{Ib(<Italic size={18} />, "Italic", !!so2.i, () => fmt("i"))}{Ib(<AlignLeft size={18} />, "Align left", false, () => alignSel("left"))}{Ib(<AlignCenter size={18} />, "Align centre", false, () => alignSel("center"))}{Ib(<AlignRight size={18} />, "Align right", false, () => alignSel("right"))}</>}</div>}
        {!so2 && <span>{Ib(<List size={18} />, "Bulleted list", false, () => addList(false))}{Ib(<ListOrdered size={18} />, "Numbered list", false, () => addList(true))}</span>}
      </div>}
      {err && <div className="err bar" onClick={() => setErr("")}>{err}</div>}
      {busy && <div className="toast" role="status">{busy}</div>}
      <div className="main"><div className="stage" ref={stage} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); for (const f of Array.from(e.dataTransfer.files as FileList)) { if (f.type.startsWith("image/")) addImg(f); else if (f.type === "application/pdf") importPdf(f); else if (f.name.endsWith(".json")) importJson(f); } }}><canvas ref={cv} onDoubleClick={editText} onPointerLeave={() => redraw()} style={{ width: `${zoom * 100}%`, touchAction: "none", cursor: tool === "laser" ? "crosshair" : "default" }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} /></div>
      {!present && !focus && dock && <aside className="dock" aria-label="Voice and transcript">
        <section className={"voice " + vs}>
          <div className="vhead"><button className={"mic" + (listening ? " live" : "")} onClick={toggleListen} aria-label={listening ? "Stop listening" : "Start listening"} aria-pressed={listening}>{listening ? <MicOff size={22} /> : <Mic size={22} />}</button>
            <div><strong>{vl[vs]}</strong><small>{speech.supported ? "Browser speech, needs internet" : "Not supported in this browser"}</small></div>
            <div className="wave" aria-hidden="true">{[0, 1, 2, 3, 4].map(i => <i key={i} style={{ animationDelay: `${i * 0.12}s` }} />)}</div></div>
          <p className="live-text" aria-live="polite">{interim || (listening ? "Listening…" : "Press the microphone to start.")}</p>
          {vs === "error" && <button onClick={toggleListen}>Retry</button>}
          <label className="row" style={{ justifyContent: "space-between" }}>Language<select value={lang} onChange={e => setLang(e.target.value)}><option value="en-US">English (US)</option><option value="en-IN">English (India)</option><option value="hi-IN">Hindi</option><option value="ta-IN">Tamil</option><option value="es-ES">Spanish</option></select></label>
          <label className="row" style={{ justifyContent: "space-between" }}>Typing animation<input type="checkbox" checked={anim} onChange={e => setAnim(e.target.checked)} /></label>
          <label>Typing speed: {speed} chars/s<input type="range" style={{ width: "100%" }} min={5} max={120} value={speed} onChange={e => setSpeed(+e.target.value)} /></label>
        </section>
        <section><h3>Type instead</h3><form className="row" onSubmit={e => { e.preventDefault(); if (typed.trim()) { addText(typed.trim()); setTyped(""); } }}><input style={{ flex: 1 }} value={typed} onChange={e => setTyped(e.target.value)} placeholder="Type a line for the board" aria-label="Type a line for the board" /><button className="primary">Add</button></form></section>
        <section><h3>Transcript</h3><textarea rows={8} value={transcript} onChange={e => { setTranscript(e.target.value); setSave("Unsaved"); }} aria-label="Transcript" placeholder="Recognized speech is kept here. Edit it for your records." />
          <button onClick={() => confirm("Clear the transcript? Board text is not affected.") && (setTranscript(""), setSave("Unsaved"))}>Clear transcript</button></section>
      </aside>}</div>
      {!present && !focus && <footer className="strip">
        {pages.map((p, i) => <Thumb key={p.id} pg={p} draw={draw} on={i === cur} label={`${i + 1}. ${p.name}`} click={() => setCur(i)} rename={() => { const n = prompt("Rename page", p.name); if (n) { setPages(ps => ps.map((q, j) => j === i ? { ...q, name: n } : q)); setSave("Unsaved"); } }} />)}
        <button onClick={() => mvPage(-1)}>Move left</button><button onClick={() => mvPage(1)}>Move right</button><button onClick={() => { setPages(ps => [...ps, np(ps.length + 1)]); setCur(pages.length); setSave("Unsaved"); }}>+ Page</button>
        <button onClick={() => { setPages(ps => { const c = JSON.parse(JSON.stringify(ps[cur])); c.id = Math.random().toString(36).slice(2); c.name += " copy"; const n = [...ps]; n.splice(cur + 1, 0, c); return n; }); setCur(cur + 1); setSave("Unsaved"); }}>Duplicate</button>
        <button onClick={() => { if (pages.length > 1 && confirm("Delete this page?")) { setPages(ps => ps.filter((_, i) => i !== cur)); setCur(Math.max(0, cur - 1)); setSave("Unsaved"); } }}>Delete page</button>
      </footer>}
      {focus && !present && <div className="fbar" role="toolbar" aria-label="Full screen tools">
        {tl("select", MousePointer2, "Select")}{tl("pen", Pencil, "Pen")}{tl("hl", Highlighter, "Highlighter")}{tl("eraser", Eraser, "Eraser")}{tl("text", Type, "Text")}{tl("laser", Crosshair, "Laser pointer")}
        <input type="color" value={color} onChange={e => pickColor(e.target.value)} aria-label="Colour" />
        {Ib(<Undo2 size={18} />, "Undo", false, undo)}{Ib(<Redo2 size={18} />, "Redo", false, redoF)}
        {Ib(<ArrowLeft size={18} />, "Previous page", false, () => setCur(c => Math.max(0, c - 1)))}<span className="status">{cur + 1} / {pages.length}</span>{Ib(<ArrowRight size={18} />, "Next page", false, () => setCur(c => Math.min(pages.length - 1, c + 1)))}
        <button onClick={exitFocus}><X size={15} /> Exit full screen</button></div>}
      {present && <div className="pnav"><button onClick={() => setCur(c => Math.max(0, c - 1))}>Prev</button><button onClick={() => setCur(c => Math.min(pages.length - 1, c + 1))}>Next</button><button onClick={() => setPresent(false)}>Exit</button></div>}
      {modal === "help" && <dialog open className="modal"><h3>Shortcuts</h3><p>Ctrl+Z undo, Ctrl+Y redo, Ctrl+C and Ctrl+V copy and paste, Ctrl+D duplicate, Delete removes the selected object, Esc exits presentation. Double-click text to edit it. Use Select to move objects, Hand to pan.</p><button onClick={() => setModal("")}>Close</button></dialog>}
      {modal === "settings" && <dialog open className="modal"><h3>Settings</h3><p><label>Theme <select value={theme} onChange={e => setTheme(e.target.value)}><option>auto</option><option>light</option><option>dark</option></select></label></p><p><label>New page background <select defaultValue={prefs().bg || "white"} onChange={e => localStorage.setItem("vb", JSON.stringify({ ...prefs(), bg: e.target.value }))}>{["white", "black", "grid", "ruled", "dots"].map(b => <option key={b}>{b}</option>)}</select></label></p><p>Pen colour, thickness, speech language and typing speed are remembered automatically. VoxBoard never records or stores audio; browser speech is processed by your browser vendor's service.</p><button onClick={() => setModal("")}>Close</button></dialog>}
      {pair && <dialog open className="modal"><h3>Pair your phone</h3><img src={pair.qr} alt="QR code" /><p>Code: <b>{pair.code}</b></p><p>{pair.n ? `${pair.n} phone(s) connected` : "Waiting for phone…"}</p><button onClick={() => { wsRef.current?.close(); setPair(null); }}>Close</button></dialog>}
    </div>
  );
}
