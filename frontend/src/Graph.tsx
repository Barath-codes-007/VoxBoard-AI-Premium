import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Eye, EyeOff, Maximize, Download, LayoutTemplate, Undo2, Redo2, Hand, Pencil, MapPin, Minus, Type, RotateCcw, Play, Pause, X, Upload, Wand2, Eraser, Activity, Pin } from "lucide-react";
import { compile, PARAMS } from "./mathparse";
import { openLast, pending } from "./store";

type Eq = { id: number; src: string; color: string; show: boolean };
type Ann = { k: "free" | "pt" | "line" | "label"; pts: number[][]; text?: string; c: string };
type Row = { x: string; y: string };
const COLORS = ["#1d4ed8", "#d62828", "#15803d", "#7c3aed", "#ea580c", "#0891b2", "#111111", "#db2777"];
const num = (s: string) => (s.trim() !== "" && isFinite(+s) ? +s : NaN);
const nice = (span: number) => { const raw = span / 8, m = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / m; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * m; };
const lab = (n: number) => String(+n.toPrecision(6) || 0);
const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
// Canvas-compatible recorder that produces SVG, so SVG export uses exactly the same drawing code.
export class SvgCtx {
  fillStyle = "#000"; strokeStyle = "#000"; lineWidth = 1; font = "12px sans-serif"; textAlign = "left"; globalAlpha = 1; lineJoin = "miter"; lineCap = "butt";
  out: string[] = []; d: string[] = []; dash = "";
  constructor(public W: number, public H: number) {}
  setLineDash(a: number[]) { this.dash = a.length ? a.join(" ") : ""; }
  beginPath() { this.d = []; } closePath() { this.d.push("Z"); }
  moveTo(x: number, y: number) { this.d.push(`M${x.toFixed(1)} ${y.toFixed(1)}`); } lineTo(x: number, y: number) { this.d.push(`L${x.toFixed(1)} ${y.toFixed(1)}`); }
  arc(x: number, y: number, r: number) { this.d.push(`M${(x + r).toFixed(1)} ${y.toFixed(1)}A${r} ${r} 0 1 0 ${(x - r).toFixed(1)} ${y.toFixed(1)}A${r} ${r} 0 1 0 ${(x + r).toFixed(1)} ${y.toFixed(1)}`); }
  stroke() { if (this.d.length) this.out.push(`<path d="${this.d.join("")}" fill="none" stroke="${this.strokeStyle}" stroke-width="${this.lineWidth}" stroke-linejoin="round"${this.dash ? ` stroke-dasharray="${this.dash}"` : ""} opacity="${this.globalAlpha}"/>`); }
  fill() { if (this.d.length) this.out.push(`<path d="${this.d.join("")}" fill="${this.fillStyle}" opacity="${this.globalAlpha}"/>`); }
  fillRect(x: number, y: number, w: number, h: number) { this.out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${this.fillStyle}" opacity="${this.globalAlpha}"/>`); }
  fillText(t: string, x: number, y: number) { const m = /(\d+(?:\.\d+)?)px/.exec(this.font); const a = this.textAlign === "center" ? "middle" : this.textAlign === "right" ? "end" : "start"; this.out.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${m ? m[1] : 12}" font-family="Inter, Arial, sans-serif"${/600|bold/.test(this.font) ? ' font-weight="600"' : ""} text-anchor="${a}" fill="${this.fillStyle}">${esc(t)}</text>`); }
  toString() { return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.W}" height="${this.H}" viewBox="0 0 ${this.W} ${this.H}">${this.out.join("")}</svg>`; }
}
// Least-squares fitting for "Smart draw": turns a rough stroke into a clean line, polynomial or circle equation.
function solve(A: number[][], b: number[]) { const n = b.length, M = A.map((r, i) => [...r, b[i]]); for (let i = 0; i < n; i++) { let p = i; for (let k = i + 1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[p][i])) p = k; [M[i], M[p]] = [M[p], M[i]]; if (Math.abs(M[i][i]) < 1e-12) return null; for (let k = 0; k < n; k++) if (k !== i) { const f = M[k][i] / M[i][i]; for (let c = i; c <= n; c++) M[k][c] -= f * M[i][c]; } } return M.map((r, i) => r[n] / r[i]); }
const polyFit = (pts: number[][], d: number) => solve(Array.from({ length: d + 1 }, (_, i) => Array.from({ length: d + 1 }, (_, j) => pts.reduce((s, p) => s + Math.pow(p[0], i + j), 0))), Array.from({ length: d + 1 }, (_, i) => pts.reduce((s, p) => s + p[1] * Math.pow(p[0], i), 0)));
const r2 = (n: number) => Math.round(n * 100) / 100; const sgn = (n: number) => (n < 0 ? "+ " + r2(-n) : "- " + r2(n));
export function fitStroke(raw: number[][]): { src: string; desc: string } | null {
  if (raw.length < 8) return null;
  const xs = raw.map(p => p[0]), ys = raw.map(p => p[1]), mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys); if (w < 1e-9 && h < 1e-9) return null;
  const closed = Math.hypot(raw[0][0] - raw[raw.length - 1][0], raw[0][1] - raw[raw.length - 1][1]) < 0.18 * Math.hypot(w, h);
  if (closed) { const cx = mean(xs), cy = mean(ys), rs = raw.map(p => Math.hypot(p[0] - cx, p[1] - cy)), rr = mean(rs), sd = Math.sqrt(mean(rs.map(v => (v - rr) ** 2))); return rr > 0 && sd / rr < 0.12 && Math.abs(w - h) / Math.max(w, h) < 0.25 ? { src: `(x ${sgn(cx)})^2 + (y ${sgn(cy)})^2 = ${r2(rr * rr)}`, desc: "circle" } : null; }
  if (w < 0.04 * h) return { src: `x = ${r2(mean(xs))}`, desc: "vertical line" };
  if (h < 0.03 * w) return { src: `y = ${r2(mean(ys))}`, desc: "horizontal line" };
  const pts = [...raw].sort((a, b) => a[0] - b[0]);
  for (let d = 1; d <= 3; d++) { const c = polyFit(pts, d); if (!c) continue; const rms = Math.sqrt(mean(pts.map(p => (p[1] - c.reduce((s, v, i) => s + v * Math.pow(p[0], i), 0)) ** 2)));
    if (rms <= 0.035 * h || d === 3) { if (rms > 0.06 * h) return null; const t = c.map((v, i) => [r2(v), i] as [number, number]).filter(([v]) => v !== 0).reverse(); if (!t.length) return null;
      let s = ""; t.forEach(([v, i], k) => { const a = Math.abs(v), body = i === 0 ? `${a}` : (a === 1 ? "" : `${a}`) + "x" + (i > 1 ? `^${i}` : ""); s += k === 0 ? (v < 0 ? "-" : "") + body : (v < 0 ? " - " : " + ") + body; }); return { src: "y = " + s, desc: ["", "line", "quadratic curve", "cubic curve"][d] }; } }
  return null;
}
const near = (a: Ann, x: number, y: number, tx: number, ty: number) => { const P = a.pts.map(p => [(p[0] - x) / tx, (p[1] - y) / ty]); if (P.length === 1) return Math.hypot(P[0][0], P[0][1]) < 1.5; for (let i = 0; i < P.length - 1; i++) { const [ax, ay] = P[i], [bx, by] = P[i + 1], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, (-ax * dx - ay * dy) / L)); if (Math.hypot(ax + t * dx, ay + t * dy) < 1) return true; } return false; };
type Pre = [string, string, Record<string, number[]>];
const PRESETS: Pre[] = [["Linear", "y = mx + c", { m: [1, -5, 5], c: [0, -10, 10] }], ["Quadratic", "y = ax^2 + bx + c", { a: [1, -5, 5], b: [0, -10, 10], c: [0, -10, 10] }], ["Cubic", "y = ax^3 + bx^2 + cx + d", { a: [1, -3, 3], b: [0, -5, 5], c: [0, -10, 10], d: [0, -10, 10] }],
  ["Polynomial (deg 4)", "y = ax^4 + bx^3 + cx^2 + dx + k", { a: [0.1, -1, 1], b: [0, -2, 2], c: [0, -5, 5], d: [0, -5, 5], k: [0, -10, 10] }], ["Absolute value", "y = a|x| + b", { a: [1, -5, 5], b: [0, -10, 10] }], ["Square root", "y = a*sqrt(x) + b", { a: [1, -5, 5], b: [0, -10, 10] }],
  ["Reciprocal", "y = a/x + b", { a: [1, -5, 5], b: [0, -10, 10] }], ["Exponential", "y = a*e^(bx)", { a: [1, -5, 5], b: [0.5, -2, 2] }], ["Logarithm", "y = a*ln(x) + b", { a: [1, -5, 5], b: [0, -10, 10] }],
  ["Sine", "y = a*sin(bx + c)", { a: [1, -5, 5], b: [1, 0.1, 5], c: [0, -6.3, 6.3] }], ["Cosine", "y = a*cos(bx + c)", { a: [1, -5, 5], b: [1, 0.1, 5], c: [0, -6.3, 6.3] }], ["Tangent", "y = a*tan(bx)", { a: [1, -5, 5], b: [1, 0.1, 5] }],
  ["Circle", "x^2 + y^2 = a^2", { a: [5, 1, 10] }], ["Ellipse", "x^2/a^2 + y^2/b^2 = 1", { a: [5, 1, 10], b: [3, 1, 10] }], ["Hyperbola", "x^2/a^2 - y^2/b^2 = 1", { a: [3, 1, 10], b: [2, 1, 10] }], ["Sideways parabola", "x = ay^2 + by + c", { a: [0.5, -2, 2], b: [0, -5, 5], c: [0, -5, 5] }]];

export function viewOf(s: any, W: number, H: number) { let [x0, x1, y0, y1] = s.rng as number[]; if (s.equal) { const cy = (y0 + y1) / 2, sp = ((x1 - x0) * H) / W; y0 = cy - sp / 2; y1 = cy + sp / 2; } return { x0, x1, y0, y1 }; }

export function drawGraph(c: CanvasRenderingContext2D, W: number, H: number, s: any) {
  const v = viewOf(s, W, H), u = Math.max(1, W / 900);
  const X = (x: number) => ((x - v.x0) / (v.x1 - v.x0)) * W, Y = (y: number) => H - ((y - v.y0) / (v.y1 - v.y0)) * H;
  c.setLineDash([]); c.globalAlpha = 1; c.fillStyle = "#fff"; c.fillRect(0, 0, W, H);
  const sx = nice(v.x1 - v.x0), sy = nice(v.y1 - v.y0); c.font = `${12 * u}px Inter, sans-serif`;
  if (s.grid) { c.strokeStyle = "#e2e8f0"; c.lineWidth = u; c.beginPath(); for (let x = Math.ceil(v.x0 / sx) * sx; x <= v.x1; x += sx) { c.moveTo(X(x), 0); c.lineTo(X(x), H); } for (let y = Math.ceil(v.y0 / sy) * sy; y <= v.y1; y += sy) { c.moveTo(0, Y(y)); c.lineTo(W, Y(y)); } c.stroke(); }
  if (s.axes) {
    const ax = Math.min(Math.max(X(0), 0), W), ay = Math.min(Math.max(Y(0), 0), H); c.strokeStyle = "#334155"; c.lineWidth = 1.6 * u; c.beginPath(); c.moveTo(0, ay); c.lineTo(W, ay); c.moveTo(ax, 0); c.lineTo(ax, H); c.stroke();
    if (s.nums) { c.fillStyle = "#334155"; c.textAlign = "center"; for (let x = Math.ceil(v.x0 / sx) * sx; x <= v.x1; x += sx) if (Math.abs(x) > sx / 1e3) c.fillText(lab(x), X(x), Math.min(ay + 16 * u, H - 4)); c.textAlign = "right"; for (let y = Math.ceil(v.y0 / sy) * sy; y <= v.y1; y += sy) if (Math.abs(y) > sy / 1e3) c.fillText(lab(y), Math.max(ax - 6 * u, 28 * u), Y(y) + 4 * u); }
    if (X(0) >= 0 && X(0) <= W && Y(0) >= 0 && Y(0) <= H) { c.fillStyle = "#334155"; c.beginPath(); c.arc(X(0), Y(0), 3.5 * u, 0, 7); c.fill(); if (s.nums) { c.textAlign = "right"; c.fillText("O", X(0) - 6 * u, Y(0) + 15 * u); } }
  }
  s.eqs.forEach((e: Eq, i: number) => {
    const k = s.comp[i]; if (!e.show || !k?.c) return; const f = k.c.fn; c.strokeStyle = e.color; c.lineWidth = 2.6 * u; c.lineJoin = "round"; c.beginPath();
    if (k.c.kind === "explicit") { let pen = false, py = 0; const n = Math.min(Math.round(W), 1800); for (let j = 0; j <= n; j++) { const x = v.x0 + (j / n) * (v.x1 - v.x0), y = f(x, 0, s.env); if (!isFinite(y) || Math.abs(y) > 1e9) { pen = false; continue; } const q = Y(y); if (pen && Math.abs(q - py) > H * 0.9) pen = false; if (!pen) c.moveTo(X(x), q); else c.lineTo(X(x), q); pen = true; py = q; } }
    else { const cs = Math.max(4, Math.round(5 * u)), nx = Math.ceil(W / cs) + 1, ny = Math.ceil(H / cs) + 1, val = new Float64Array(nx * ny);
      for (let j = 0; j < ny; j++) for (let a = 0; a < nx; a++) val[j * nx + a] = f(v.x0 + ((a * cs) / W) * (v.x1 - v.x0), v.y1 - ((j * cs) / H) * (v.y1 - v.y0), s.env);
      for (let j = 0; j < ny - 1; j++) for (let a = 0; a < nx - 1; a++) { const va = val[j * nx + a], vb = val[j * nx + a + 1], vd = val[(j + 1) * nx + a], vc = val[(j + 1) * nx + a + 1]; if (!isFinite(va + vb + vc + vd)) continue;
        const x = a * cs, y = j * cs, pt: number[][] = []; const ed = (p: number, q: number, x1: number, y1: number, x2: number, y2: number) => { if (p < 0 !== q < 0) { const t = p / (p - q); pt.push([x1 + t * (x2 - x1), y1 + t * (y2 - y1)]); } };
        ed(va, vb, x, y, x + cs, y); ed(vb, vc, x + cs, y, x + cs, y + cs); ed(vd, vc, x, y + cs, x + cs, y + cs); ed(va, vd, x, y, x, y + cs);
        if (pt.length >= 2) { c.moveTo(pt[0][0], pt[0][1]); c.lineTo(pt[1][0], pt[1][1]); if (pt.length === 4) { c.moveTo(pt[2][0], pt[2][1]); c.lineTo(pt[3][0], pt[3][1]); } } } }
    c.stroke();
  });
  if (s.pts.length && s.bar) { c.fillStyle = "#0f172a"; const xs = s.pts.map((p: number[]) => p[0]).sort((a: number, b: number) => a - b); let gap = Infinity; for (let i = 1; i < xs.length; i++) if (xs[i] > xs[i - 1]) gap = Math.min(gap, xs[i] - xs[i - 1]); if (!isFinite(gap)) gap = (v.x1 - v.x0) / 10; const bw = Math.abs(X(gap) - X(0)) * 0.6; c.globalAlpha = 0.75; s.pts.forEach((p: number[]) => { const a = Y(0), b = Y(p[1]); c.fillRect(X(p[0]) - bw / 2, Math.min(a, b), bw, Math.abs(b - a)); }); c.globalAlpha = 1; }
  else if (s.pts.length) { c.fillStyle = c.strokeStyle = "#0f172a"; c.lineWidth = 2 * u; if (s.connect) { c.beginPath(); s.pts.forEach((p: number[], i: number) => (i ? c.lineTo(X(p[0]), Y(p[1])) : c.moveTo(X(p[0]), Y(p[1])))); c.stroke(); } s.pts.forEach((p: number[]) => { c.beginPath(); c.arc(X(p[0]), Y(p[1]), 4 * u, 0, 7); c.fill(); }); }
  for (const a of s.ann as Ann[]) {
    c.strokeStyle = c.fillStyle = a.c; c.lineWidth = 2.4 * u; c.textAlign = "left"; c.font = `${14 * u}px Inter, sans-serif`;
    if (a.k === "free" || a.k === "line") { c.beginPath(); a.pts.forEach((p, i) => (i ? c.lineTo(X(p[0]), Y(p[1])) : c.moveTo(X(p[0]), Y(p[1])))); c.stroke(); }
    if (a.k === "pt" || a.k === "line") for (const p of a.k === "pt" ? a.pts : [a.pts[0], a.pts[a.pts.length - 1]]) { c.beginPath(); c.arc(X(p[0]), Y(p[1]), 4.5 * u, 0, 7); c.fill(); if (a.k === "pt") c.fillText(`(${lab(p[0])}, ${lab(p[1])})`, X(p[0]) + 8 * u, Y(p[1]) - 8 * u); }
    if (a.k === "label" && a.text) c.fillText(a.text, X(a.pts[0][0]), Y(a.pts[0][1]));
  }
  if (s.trace) { const k = s.comp[s.trace.eq]; if (k?.c) { const ty = k.c.fn(s.trace.x, 0, s.env); if (isFinite(ty)) { c.fillStyle = "#fff"; c.strokeStyle = s.eqs[s.trace.eq].color; c.lineWidth = 3 * u; c.beginPath(); c.arc(X(s.trace.x), Y(ty), 7 * u, 0, 7); c.fill(); c.stroke(); c.fillStyle = "#0f172a"; c.font = `${14 * u}px Inter, sans-serif`; c.textAlign = "left"; c.fillText(`(${lab(s.trace.x)}, ${lab(ty)})`, X(s.trace.x) + 12 * u, Y(ty) - 12 * u); } } }
  c.textAlign = "center"; c.fillStyle = "#0f172a"; if (s.title) { c.font = `600 ${18 * u}px Inter, sans-serif`; c.fillText(s.title, W / 2, 26 * u); }
  if (s.legend) { c.font = `${13 * u}px Inter, sans-serif`; c.textAlign = "left"; let ly = 20 * u; s.eqs.forEach((e: Eq) => { if (!e.show || !e.src.trim()) return; c.fillStyle = e.color; c.fillRect(W - 230 * u, ly - 9 * u, 18 * u, 4 * u); c.fillStyle = "#0f172a"; c.fillText(e.src.slice(0, 26), W - 205 * u, ly - 3 * u); ly += 20 * u; }); }
  return v;
}

export function sceneOf(d: any) {
  const eqs: Eq[] = d.eqs || []; const comp = eqs.map(e => { try { return { c: compile(e.src) } as any; } catch { return {} as any; } });
  const names = new Set<string>(); comp.forEach((k: any, i: number) => eqs[i].show && k.c?.vars.forEach((v: string) => v !== "x" && v !== "y" && names.add(v)));
  const env = Object.fromEntries([...names].map(k => [k, d.pr?.[k]?.v ?? 1]));
  const pts = ((d.rows || []) as Row[]).map(q => [num(q.x), num(q.y)]).filter(p => !isNaN(p[0]) && !isNaN(p[1]));
  return { rng: d.rng || [-10, 10, -7, 7], equal: d.equal ?? true, eqs, comp, env, grid: d.grid ?? true, axes: d.axes ?? true, nums: d.nums ?? true, legend: d.legend ?? true, title: d.title || "", ann: d.ann || [], pts, connect: d.connect ?? true, bar: !!d.bar, trace: null };
}

export default function Graph({ lessonId }: { lessonId?: string }) {
  const [eqs, setEqs] = useState<Eq[]>([{ id: 1, src: "y = ax^2 + bx + c", color: COLORS[0], show: true }]);
  const [pr, setPr] = useState<Record<string, { v: number; min: number; max: number }>>({ a: { v: 1, min: -5, max: 5 }, b: { v: 0, min: -5, max: 5 }, c: { v: 0, min: -5, max: 5 } });
  const [rng, setRng] = useState<number[]>([-10, 10, -7, 7]); const [equal, setEqual] = useState(true); const [grid, setGrid] = useState(true), [axes, setAxes] = useState(true), [nums, setNums] = useState(true), [legend, setLegend] = useState(true);
  const [title, setTitle] = useState(""); const [mode, setMode] = useState("pan"); const [lock, setLock] = useState(false); const [snap, setSnap] = useState(false);
  const [ann, setAnn] = useState<Ann[]>([]); const [redo, setRedo] = useState<Ann[]>([]); const [col, setCol] = useState("#d62828");
  const [rows, setRows] = useState<Row[]>([{ x: "", y: "" }]); const [connect, setConnect] = useState(true); const [bar, setBar] = useState(false);
  const [trace, setTrace] = useState<{ x: number; eq: number } | null>(null); const [target, setTarget] = useState<{ page: number; idx: number } | null>(null); const [note, setNote] = useState(""); const first = useRef(true);
  const [inp, setInp] = useState(""); const [err, setErr] = useState(""); const [play, setPlay] = useState(false); const [ap, setAp] = useState("a"); const [speed, setSpeed] = useState(1);
  const cv = useRef<HTMLCanvasElement>(null), wrap = useRef<HTMLDivElement>(null), ro = useRef<HTMLDivElement>(null), drag = useRef<any>(null), nid = useRef(2);

  const comp = useMemo(() => eqs.map(e => { try { return { c: compile(e.src) } as any; } catch (er: any) { return { err: er.message } as any; } }), [eqs]);
  const params = useMemo(() => { const s = new Set<string>(); eqs.forEach((e, i) => e.show && comp[i]?.c?.vars.forEach((v: string) => v !== "x" && v !== "y" && s.add(v))); return [...s].sort(); }, [eqs, comp]);
  const P = (k: string) => pr[k] ?? { v: 1, min: -5, max: 5 };
  const env = Object.fromEntries(params.map(k => [k, P(k).v]));
  const pts = rows.map(r => [num(r.x), num(r.y)]).filter(p => !isNaN(p[0]) && !isNaN(p[1]));
  const S: any = { rng, equal, eqs, comp, env, grid, axes, nums, legend, title, ann, pts, connect, bar, trace };
  const annRef = useRef<Ann[]>([]); annRef.current = ann; const hist = useRef<Ann[][]>([]), fut = useRef<Ann[][]>([]);
  const defOf = () => ({ eqs, pr, rng, equal, grid, axes, nums, legend, title, ann, rows, connect, bar });
  const defKey = JSON.stringify(defOf());
  useEffect(() => { const c = cv.current!, b = c.getBoundingClientRect(), d = devicePixelRatio || 1; c.width = Math.round(b.width * d); c.height = Math.round(b.height * d); drawGraph(c.getContext("2d")!, c.width, c.height, S); });
  useEffect(() => { const o = new ResizeObserver(() => setRng(r => [...r])); o.observe(cv.current!); return () => o.disconnect(); }, []);
  useEffect(() => { if (!play || !params.includes(ap)) return; let raf = 0, last = performance.now(), dir = 1; const f = (t: number) => { const dt = (t - last) / 1000; last = t; setPr(p => { const q = p[ap] ?? { v: 1, min: -5, max: 5 }; let v = q.v + dir * speed * dt * ((q.max - q.min) / 4); if (v > q.max) { v = q.max; dir = -1; } if (v < q.min) { v = q.min; dir = 1; } return { ...p, [ap]: { ...q, v } }; }); raf = requestAnimationFrame(f); }; raf = requestAnimationFrame(f); return () => cancelAnimationFrame(raf); }, [play, ap, speed, params.join()]);
  useEffect(() => { const c = cv.current!; const w = (e: WheelEvent) => { e.preventDefault(); if (lock) return; const b = c.getBoundingClientRect(), v = viewOf(S, b.width, b.height), k = e.deltaY > 0 ? 1.12 : 1 / 1.12, mx = v.x0 + ((e.clientX - b.left) / b.width) * (v.x1 - v.x0), my = v.y1 - ((e.clientY - b.top) / b.height) * (v.y1 - v.y0); setRng([mx + (v.x0 - mx) * k, mx + (v.x1 - mx) * k, my + (v.y0 - my) * k, my + (v.y1 - my) * k]); }; c.addEventListener("wheel", w, { passive: false }); return () => c.removeEventListener("wheel", w); });

  const pos = (e: React.PointerEvent) => { const b = cv.current!.getBoundingClientRect(), v = viewOf(S, b.width, b.height); let x = v.x0 + ((e.clientX - b.left) / b.width) * (v.x1 - v.x0), y = v.y1 - ((e.clientY - b.top) / b.height) * (v.y1 - v.y0); if (snap) { const sx = nice(v.x1 - v.x0), sy = nice(v.y1 - v.y0); x = Math.round(x / sx) * sx; y = Math.round(y / sy) * sy; } return { x, y, b, v }; };
  const traceIdx = eqs.findIndex((e, i) => e.show && comp[i]?.c?.kind === "explicit");
  const setTraceAt = (x: number) => { if (traceIdx < 0) { setErr("Move-a-point needs a visible y = f(x) equation."); return; } setTrace({ x, eq: traceIdx }); };
  const eraseAt = (x: number, y: number, b: DOMRect, v: any) => { const tx = (12 / b.width) * (v.x1 - v.x0), ty = (12 / b.height) * (v.y1 - v.y0); setAnn(a => { const n = a.filter(q => !near(q, x, y, tx, ty)); return n.length === a.length ? a : n; }); };
  const down = (e: React.PointerEvent) => { const { x, y, b, v } = pos(e); (e.target as Element).setPointerCapture(e.pointerId);
    if (mode === "pan") { if (!lock) drag.current = { px: e.clientX, py: e.clientY, v }; return; }
    if (mode === "trace") { setTraceAt(x); return; }
    hist.current.push(annRef.current); if (hist.current.length > 100) hist.current.shift(); fut.current = [];
    if (mode === "erase") { eraseAt(x, y, b, v); return; }
    if (mode === "free" || mode === "smart") setAnn(a => [...a, { k: "free", pts: [[x, y]], c: col }]);
    else if (mode === "line") setAnn(a => [...a, { k: "line", pts: [[x, y], [x, y]], c: col }]);
    else if (mode === "pt") setAnn(a => [...a, { k: "pt", pts: [[x, y]], c: col }]);
    else if (mode === "label") { const t = prompt("Label text")?.trim(); if (t) setAnn(a => [...a, { k: "label", pts: [[x, y]], text: t, c: col }]); } };
  const move = (e: React.PointerEvent) => { const { x, y, b, v } = pos(e); if (ro.current) ro.current.textContent = `x = ${lab(x)}, y = ${lab(y)}`;
    if (drag.current?.v) { const d = drag.current, dx = ((e.clientX - d.px) / b.width) * (d.v.x1 - d.v.x0), dy = ((e.clientY - d.py) / b.height) * (d.v.y1 - d.v.y0); setRng([d.v.x0 - dx, d.v.x1 - dx, d.v.y0 + dy, d.v.y1 + dy]); return; }
    if (!e.buttons) return;
    if (mode === "trace") setTraceAt(x); else if (mode === "erase") eraseAt(x, y, b, v);
    else if (mode === "free" || mode === "smart") setAnn(a => { const l = a[a.length - 1]; return l?.k === "free" ? [...a.slice(0, -1), { ...l, pts: [...l.pts, [x, y]] }] : a; });
    else if (mode === "line") setAnn(a => { const l = a[a.length - 1]; return l?.k === "line" ? [...a.slice(0, -1), { ...l, pts: [l.pts[0], [x, y]] }] : a; }); };
  const up = () => { drag.current = null; if (mode !== "smart") return; const l = annRef.current[annRef.current.length - 1]; if (l?.k !== "free") return; const f = fitStroke(l.pts);
    if (f) { setAnn(a => a.slice(0, -1)); addEq(f.src); setNote(`Fitted a ${f.desc}: ${f.src}. This is an approximation of your drawing, not an exact answer.`); } else setNote("Could not fit a line, curve or circle, so the drawing was kept as freehand."); };
  const fit = () => setRng([-10, 10, -7, 7]);
  const addEq = (src: string) => { if (eqs.length >= 8) return setErr("At most 8 equations at once."); try { compile(src); } catch (e: any) { return setErr(e.message); } setErr(""); setEqs(q => [...q, { id: nid.current++, src, color: COLORS[q.length % COLORS.length], show: true }]); setInp(""); };
  const upd = (id: number, p: Partial<Eq>) => setEqs(q => q.map(e => (e.id === id ? { ...e, ...p } : e)));
  const render = () => { const c = document.createElement("canvas"); c.width = 1600; c.height = 900; drawGraph(c.getContext("2d")!, 1600, 900, S); return c; };
  const exportPng = () => { const a = document.createElement("a"); a.href = render().toDataURL("image/png"); a.download = (title || "graph") + ".png"; a.click(); };
  const insert = async () => { if (!eqs.some((e, i) => e.show && comp[i]?.c) && !pts.length && !ann.length) return setErr("Nothing to insert yet."); pending.graph = { src: render().toDataURL("image/png"), def: defOf(), replace: target || undefined }; try { location.hash = "#/board/" + (lessonId || (await openLast())); } catch { setErr("Could not open a board."); } };
  const importCsv = async (f?: File) => { if (!f) return; if (f.size > 2e6) return setErr("CSV is larger than 2 MB."); const lines = (await f.text()).split(/\r?\n/).map(l => l.split(/[,\t;]/).map(s => s.trim())).filter(l => l.length >= 2 && l[0] !== ""); const data = isNaN(num(lines[0]?.[0] ?? "")) ? lines.slice(1) : lines; if (!data.length) return setErr("No x,y rows found in that file."); setRows(data.slice(0, 5000).map(l => ({ x: l[0], y: l[1] }))); setErr(""); };
  const set = (k: string, v: Partial<{ v: number; min: number; max: number }>) => setPr(p => ({ ...p, [k]: { ...P(k), ...v } }));
  const lastLog = useRef(0), prevSig = useRef<any>(null);
  const logEv = (kind: string, text: string, def?: any) => { const put = (a: any[]) => localStorage.setItem("vb-gev", JSON.stringify(a)); try { let a = JSON.parse(localStorage.getItem("vb-gev") || "[]"); a.push({ at: Date.now(), kind, text: text.slice(0, 200), def }); a = a.slice(-120); try { put(a); } catch { put(a.slice(-40)); } } catch { /* storage unavailable */ } };
  const loadDef = (d: any) => { if (!d) return; if (Array.isArray(d.eqs)) { setEqs(d.eqs); nid.current = Math.max(1, ...d.eqs.map((q: Eq) => q.id)) + 1; } if (d.pr) setPr(d.pr); if (Array.isArray(d.rng) && d.rng.length === 4) setRng(d.rng); setEqual(d.equal ?? true); setGrid(d.grid ?? true); setAxes(d.axes ?? true); setNums(d.nums ?? true); setLegend(d.legend ?? true); setTitle(d.title || ""); setAnn(Array.isArray(d.ann) ? d.ann : []); setRows(Array.isArray(d.rows) && d.rows.length ? d.rows : [{ x: "", y: "" }]); setConnect(d.connect ?? true); setBar(!!d.bar); };
  useEffect(() => { const e = pending.editGraph; if (e) { pending.editGraph = undefined; loadDef(e.def); if (e.page >= 0) setTarget({ page: e.page, idx: e.idx }); return; } try { const g = JSON.parse(localStorage.getItem("vb-graph-last") || "null"); if (g?.def) loadDef(g.def); } catch { /* nothing saved */ } }, []);
  useEffect(() => { if (first.current) { first.current = false; return; } const t = setTimeout(() => { try { const c = document.createElement("canvas"); c.width = 640; c.height = 360; drawGraph(c.getContext("2d")!, 640, 360, S); localStorage.setItem("vb-graph-last", JSON.stringify({ at: Date.now(), src: c.toDataURL("image/jpeg", 0.7), def: defOf() })); } catch { /* storage full */ } }, 800); return () => clearTimeout(t); }, [defKey]);
  const eqSig = JSON.stringify(eqs.map(e => [e.src, e.show, e.color])), pSig = JSON.stringify(env), rSig = JSON.stringify(rng), aSig = JSON.stringify(ann);
  useEffect(() => {
    if (!prevSig.current) { prevSig.current = { e: eqSig, p: pSig, r: rSig, a: aSig }; return; }
    const fire = () => { const p = prevSig.current; prevSig.current = { e: eqSig, p: pSig, r: rSig, a: aSig }; lastLog.current = Date.now();
      const kind = p.e !== eqSig ? "Equations" : p.p !== pSig ? "Parameters" : p.r !== rSig ? "View" : p.a !== aSig ? "Annotation" : "Graph";
      const text = kind === "Equations" ? eqs.filter(e => e.show && e.src.trim()).map(e => e.src).join("  ;  ") : kind === "Parameters" ? params.map(k => `${k} = ${lab(P(k).v)}`).join(", ") : kind === "View" ? `x from ${lab(rng[0])} to ${lab(rng[1])}` : kind === "Annotation" ? "Annotations changed" : "Settings changed";
      let d: any = defOf(); if (JSON.stringify(d).length > 40000) d = { ...d, ann: [], rows: [], trimmed: true }; logEv(kind, text, d); };
    if (Date.now() - lastLog.current >= 600) { fire(); return; }
    const t = setTimeout(fire, 400); return () => clearTimeout(t);
  }, [defKey]);
  
  const preset = (p: Pre) => { if (eqs.length >= 8) return setErr("At most 8 equations at once."); setPr(q => { const n = { ...q }; Object.entries(p[2]).forEach(([k, a]) => { n[k] = { v: a[0], min: a[1], max: a[2] }; }); return n; }); addEq(p[1]); };
  const exportSvg = () => { try { const c = new SvgCtx(1600, 900); drawGraph(c as any, 1600, 900, S); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([c.toString()], { type: "image/svg+xml" })); a.download = (title || "graph") + ".svg"; a.click(); } catch { setErr("SVG export failed."); } };
  const pin = () => { if (!trace) return; const k = comp[trace.eq]; const y = k?.c?.fn(trace.x, 0, env); if (!isFinite(y)) return setErr("That point is outside the curve's domain."); hist.current.push(ann); fut.current = []; setAnn(a => [...a, { k: "pt", pts: [[trace.x, y]], c: col }]); };
  const tools: [string, any, string][] = [["pan", Hand, "Pan and zoom"], ["smart", Wand2, "Smart draw: fits a line, curve or circle to your stroke"], ["free", Pencil, "Freehand (not an exact equation)"], ["pt", MapPin, "Plot point"], ["line", Minus, "Line segment"], ["label", Type, "Label"], ["trace", Activity, "Move a point along a curve"], ["erase", Eraser, "Eraser for annotations"]];
  return (
    <div className="gs" ref={wrap}>
      <div className="gtop"><h1>Graph Studio</h1>
        <form className="geq" onSubmit={e => { e.preventDefault(); addEq(inp); }}><input className="grow" value={inp} onChange={e => setInp(e.target.value)} placeholder="Type an equation, e.g. y = sin(x) or x^2 + y^2 = 25" aria-label="Equation" /><button className="primary">Plot Graph</button></form>
        <button onClick={() => confirm("Remove all equations, points and annotations?") && (setEqs([]), setAnn([]), setRows([{ x: "", y: "" }]))}><Trash2 size={15} /> Clear</button>
        <button onClick={exportPng}><Download size={15} /> PNG</button><button onClick={exportSvg}><Download size={15} /> SVG</button><button onClick={() => wrap.current?.requestFullscreen?.().catch(() => setErr("Fullscreen is not available."))}><Maximize size={15} /> Full screen</button>
        <button className="primary" onClick={insert}><LayoutTemplate size={15} /> {target ? "Update graph on Smartboard" : "Insert into Smartboard"}</button></div>
      {err && <div className="note err" role="alert" onClick={() => setErr("")}>{err}</div>}
      {note && <div className="note" role="status" onClick={() => setNote("")}>{note}</div>}
      <small className="mut">Examples: y = 2x + 3, y = x^2, y = sin(x), y = e^x, y = log(x), x^2 + y^2 = 25, y = |x|, y = 1/x, y = ax^2 + bx + c. Use brackets for functions: sin(x). This plots equations; it does not solve or prove anything.</small>
      <div className="chips" role="group" aria-label="Graph types">{PRESETS.map(p => <button key={p[0]} className="sm" onClick={() => preset(p)}>{p[0]}</button>)}</div>
      <div className="gmain">
        <aside className="card gl"><h3>Equations</h3>
          {eqs.length === 0 && <p className="mut">No equations yet. Type one above and press Plot Graph.</p>}
          {eqs.map((e, i) => <div key={e.id} className="geqrow"><div className="row"><button className="ib" aria-label={e.show ? "Hide equation" : "Show equation"} onClick={() => upd(e.id, { show: !e.show })}>{e.show ? <Eye size={16} /> : <EyeOff size={16} />}</button>
            <input type="color" value={e.color} onChange={ev => upd(e.id, { color: ev.target.value })} aria-label="Equation colour" /><input className="grow" value={e.src} onChange={ev => upd(e.id, { src: ev.target.value })} aria-label="Equation" /><button className="ib" aria-label="Remove equation" onClick={() => setEqs(q => q.filter(z => z.id !== e.id))}><X size={15} /></button></div>
            {comp[i]?.err && <small className="err">{comp[i].err}</small>}</div>)}
          <button className="sm" onClick={() => addEq("y = x")}><Plus size={14} /> Add another equation</button>
          <h3>View</h3><label className="row">Title<input className="grow" value={title} onChange={e => setTitle(e.target.value)} /></label>
          {[["Grid", grid, setGrid], ["Axes", axes, setAxes], ["Axis numbers", nums, setNums], ["Legend", legend, setLegend], ["Equal axis scale", equal, setEqual], ["Lock view (static graph)", lock, setLock]].map(([l, v, f]: any) => <label key={l} className="row" style={{ justifyContent: "space-between" }}>{l}<input type="checkbox" checked={v} onChange={e => f(e.target.checked)} /></label>)}
          <div className="row">{["X min", "X max", "Y min", "Y max"].map((l, i) => <label key={l} style={{ width: "46%" }}><small>{l}</small><input type="number" step="any" disabled={lock || (equal && i > 1)} value={rng[i]} onChange={e => { const n = [...rng]; n[i] = +e.target.value; if (n[1] > n[0] && n[3] > n[2]) setRng(n); }} /></label>)}</div>
          <button className="sm" onClick={fit}><RotateCcw size={14} /> Fit to view</button></aside>
        <div className="gcv"><canvas ref={cv} className={"gcanvas m-" + mode} onPointerDown={down} onPointerMove={move} onPointerUp={up} aria-label="Graph canvas" />
          <div className="gbar">{tools.map(([k, I, l]) => <button key={k} className={"ib" + (mode === k ? " on" : "")} data-tip={l} aria-label={l} onClick={() => setMode(k)}><I size={17} /></button>)}
            <input type="color" value={col} onChange={e => setCol(e.target.value)} aria-label="Annotation colour" /><label className="row"><input type="checkbox" checked={snap} onChange={e => setSnap(e.target.checked)} /> Snap</label>
            <button className="ib" aria-label="Undo" onClick={() => { const h = hist.current.pop(); if (h) { fut.current.push(ann); setAnn(h); } }}><Undo2 size={17} /></button>
            <button className="ib" aria-label="Redo" onClick={() => { const h = fut.current.pop(); if (h) { hist.current.push(ann); setAnn(h); } }}><Redo2 size={17} /></button>
            <button className="sm" disabled={!ann.length} onClick={() => confirm("Clear all annotations?") && setAnn([])}>Clear annotations</button>{trace && <button className="sm" onClick={pin}><Pin size={14} /> Pin point</button>}{trace && <button className="sm" onClick={() => setTrace(null)}>Hide point</button>}<span className="sp" /><span ref={ro} className="mut gread" aria-live="off">x = 0, y = 0</span></div></div>
        <aside className="card gr"><h3>Parameters</h3>
          {params.length === 0 && <p className="mut">No parameters. Use letters a b c d k m n p q in an equation, e.g. y = a*sin(bx), to get sliders.</p>}
          {params.map(k => { const q = P(k); return <div key={k} className="geqrow"><div className="row" style={{ justifyContent: "space-between" }}><b>{k} = {lab(q.v)}</b><button className="sm" onClick={() => set(k, { v: k === "a" || !"bc".includes(k) ? 1 : 0 })}>Reset</button></div>
            <input type="range" style={{ width: "100%" }} min={q.min} max={q.max} step={0.1} value={q.v} onChange={e => set(k, { v: +e.target.value })} aria-label={"Parameter " + k} />
            <div className="row"><input type="number" style={{ width: 70 }} value={q.min} onChange={e => +e.target.value < q.max && set(k, { min: +e.target.value })} aria-label="Minimum" /><input type="number" style={{ width: 70 }} value={q.max} onChange={e => +e.target.value > q.min && set(k, { max: +e.target.value })} aria-label="Maximum" /></div></div>; })}
          {params.length > 0 && <div className="row"><select value={params.includes(ap) ? ap : params[0]} onChange={e => setAp(e.target.value)} aria-label="Parameter to animate">{params.map(k => <option key={k}>{k}</option>)}</select>
            <button onClick={() => { setAp(params.includes(ap) ? ap : params[0]); setPlay(p => !p); }}>{play ? <Pause size={15} /> : <Play size={15} />} {play ? "Pause" : "Animate"}</button>
            <label>Speed<input type="range" min={0.2} max={3} step={0.1} value={speed} onChange={e => setSpeed(+e.target.value)} /></label></div>}
          <small className="mut">Freeze a state by pausing, then Insert into Smartboard.</small></aside>
      </div>
      <details className="card gdata" open><summary><b>Data table</b> <small className="mut">{pts.length} valid point{pts.length === 1 ? "" : "s"}</small></summary>
        <div className="row" style={{ margin: "10px 0" }}><label className="btn sm"><Upload size={14} /> Import CSV<input className="sr" type="file" accept=".csv,.txt,text/csv" onChange={e => { importCsv(e.target.files?.[0]); e.target.value = ""; }} /></label>
          <label className="row"><input type="checkbox" checked={connect} onChange={e => setConnect(e.target.checked)} /> Connect points</label><label className="row"><input type="checkbox" checked={bar} onChange={e => setBar(e.target.checked)} /> Bar chart</label><button className="sm" onClick={() => setRows(r => [...r, { x: "", y: "" }])}><Plus size={14} /> Row</button><button className="sm" onClick={() => setRows([{ x: "", y: "" }])}>Clear data</button></div>
        <div className="grows">{rows.slice(0, 200).map((r, i) => <div key={i} className="row">{(["x", "y"] as const).map(k => <input key={k} placeholder={k} className={r[k] !== "" && isNaN(num(r[k])) ? "bad" : ""} value={r[k]} aria-label={`${k} row ${i + 1}`} onChange={e => setRows(q => q.map((z, j) => (j === i ? { ...z, [k]: e.target.value } : z)))} />)}<button className="ib" aria-label="Remove row" onClick={() => setRows(q => (q.length > 1 ? q.filter((_, j) => j !== i) : [{ x: "", y: "" }]))}><X size={14} /></button></div>)}</div>
        {rows.length > 200 && <small className="mut">Showing the first 200 of {rows.length} rows; all valid rows are plotted.</small>}</details>
    </div>
  );
}
