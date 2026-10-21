import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Eye, EyeOff, Maximize, Download, LayoutTemplate, Undo2, Redo2, Hand, Pencil, MapPin, Minus, Type, RotateCcw, Play, Pause, X, Upload, Wand2, Eraser, Activity, Pin, Copy, ChevronUp, PanelRight, ArrowUpRight, Highlighter, MousePointerClick, Printer } from "lucide-react";
import { compile } from "./mathparse";
import { roots, intersections, extrema, areaBetween, asymptotes, domainRange } from "./graphmath";
import { regionMask, regionArea } from "./region";
import { openLast, pending } from "./store";

type Eq = { id: number; src: string; color: string; show: boolean; w?: number; dash?: boolean; op?: number };
type Ann = { k: "free" | "pt" | "line" | "label"; pts: number[][]; text?: string; c: string; hl?: boolean; arrow?: boolean };
type Row = { x: string; y: string };
const COLORS = ["#1d4ed8", "#d62828", "#15803d", "#7c3aed", "#ea580c", "#0891b2", "#111111", "#db2777"];
const num = (s: string) => (s.trim() !== "" && isFinite(+s) ? +s : NaN);
const nice = (span: number) => { const raw = span / 8, m = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / m; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * m; };
const lab = (n: number) => String(+n.toPrecision(6) || 0);
export const gridStep = (g: number, span: number) => (g > 0 && isFinite(g) && span / g <= 200 ? g : nice(span));
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

export function regionBounds(s: any): ((x: number, y: number) => number)[] {
  const R = s.region; if (!R) return []; const out: ((x: number, y: number) => number)[] = [];
  (R.ids as number[]).forEach(id => { const i = s.eqs.findIndex((e: Eq) => e.id === id), k = s.comp[i]?.c; if (!k) return; const f = k.fn;
    if (k.kind === "explicit") out.push((x, y) => { const v = f(x, 0, s.env); return isFinite(v) ? y - v : NaN; }); else if (k.kind === "implicit") out.push((x, y) => f(x, y, s.env)); });
  if (R.ax) out.push((_x, y) => y); if (R.ay) out.push(x => x); return out.slice(0, 12);
}
export function drawGraph(c: CanvasRenderingContext2D, W: number, H: number, s: any) {
  const v = viewOf(s, W, H), u = Math.max(1, W / 900);
  const X = (x: number) => ((x - v.x0) / (v.x1 - v.x0)) * W, Y = (y: number) => H - ((y - v.y0) / (v.y1 - v.y0)) * H;
  c.setLineDash([]); c.globalAlpha = 1; if (!s.transparent) { c.fillStyle = "#fff"; c.fillRect(0, 0, W, H); }
  const sx = gridStep(s.gx ?? 0, v.x1 - v.x0), sy = gridStep(s.gy ?? 0, v.y1 - v.y0); c.font = `${12 * u}px Inter, sans-serif`;
  if (s.grid) { c.strokeStyle = "#e2e8f0"; c.lineWidth = u; c.beginPath(); for (let x = Math.ceil(v.x0 / sx) * sx; x <= v.x1; x += sx) { c.moveTo(X(x), 0); c.lineTo(X(x), H); } for (let y = Math.ceil(v.y0 / sy) * sy; y <= v.y1; y += sy) { c.moveTo(0, Y(y)); c.lineTo(W, Y(y)); } c.stroke(); }
  if (s.axes) {
    const ax = Math.min(Math.max(X(0), 0), W), ay = Math.min(Math.max(Y(0), 0), H); c.strokeStyle = "#334155"; c.lineWidth = 1.6 * u; c.beginPath(); c.moveTo(0, ay); c.lineTo(W, ay); c.moveTo(ax, 0); c.lineTo(ax, H); c.stroke();
    if (s.nums) { c.fillStyle = "#334155"; c.textAlign = "center"; for (let x = Math.ceil(v.x0 / sx) * sx; x <= v.x1; x += sx) if (Math.abs(x) > sx / 1e3) c.fillText(lab(x), X(x), Math.min(ay + 16 * u, H - 4)); c.textAlign = "right"; for (let y = Math.ceil(v.y0 / sy) * sy; y <= v.y1; y += sy) if (Math.abs(y) > sy / 1e3) c.fillText(lab(y), Math.max(ax - 6 * u, 28 * u), Y(y) + 4 * u); }
    if (X(0) >= 0 && X(0) <= W && Y(0) >= 0 && Y(0) <= H) { c.fillStyle = "#334155"; c.beginPath(); c.arc(X(0), Y(0), 3.5 * u, 0, 7); c.fill(); if (s.nums) { c.textAlign = "right"; c.fillText("O", X(0) - 6 * u, Y(0) + 15 * u); } }
  }
  if (s.axes) { const ax2 = Math.min(Math.max(X(0), 0), W), ay2 = Math.min(Math.max(Y(0), 0), H); c.fillStyle = "#334155"; c.font = `italic 600 ${15 * u}px Inter, sans-serif`; c.textAlign = "right"; c.fillText("x", W - 8 * u, ay2 - 8 * u); c.textAlign = "left"; c.fillText("y", ax2 + 8 * u, 18 * u); c.font = `${12 * u}px Inter, sans-serif`; }
  const ineqs = s.shadeOn === false ? [] : (s.eqs.map((e: Eq, i: number) => [e, s.comp[i]]).filter(([e, k]: any) => e.show && k?.c?.kind === "ineq") as [Eq, any][]);
  if (ineqs.length) {
    const cs = Math.max(3, Math.round(4 * u)), nxc = Math.ceil(W / cs), mode = s.shadeMode || "layers", rowsH: boolean[][] = ineqs.map(() => new Array(nxc).fill(false));
    const runs = (m: boolean[], y: number, col: string, op: number) => { c.fillStyle = col; c.globalAlpha = op; let a = -1; for (let i = 0; i <= nxc; i++) { if (i < nxc && m[i]) { if (a < 0) a = i; } else if (a >= 0) { c.fillRect(a * cs, y, (i - a) * cs, cs); a = -1; } } };
    for (let y = 0; y < H; y += cs) { const my = v.y1 - ((y + cs / 2) / H) * (v.y1 - v.y0); ineqs.forEach(([, k], j) => { for (let i = 0; i < nxc; i++) rowsH[j][i] = k.c.holds(v.x0 + ((i * cs + cs / 2) / W) * (v.x1 - v.x0), my, s.env); });
      if (mode === "layers") ineqs.forEach(([e], j) => runs(rowsH[j], y, e.color, e.op ?? 0.3)); else { const m = rowsH[0].map((_, i) => (mode === "union" ? rowsH.some(r => r[i]) : rowsH.every(r => r[i]))); runs(m, y, "#0d9488", ineqs.reduce((a, [e]) => a + (e.op ?? 0.3), 0) / ineqs.length); } }
    c.globalAlpha = 1;
  }
  const A = s.area;
  if (A && A.on) { const ia = s.eqs.findIndex((e: Eq) => e.id === A.a), ib = s.eqs.findIndex((e: Eq) => e.id === A.b), fa = s.comp[ia]?.c, fb = ib >= 0 ? s.comp[ib]?.c : null, hi = A.hiAnim ?? A.hi;
    if (fa?.kind === "explicit" && (A.b === -1 || fb?.kind === "explicit") && isFinite(A.lo + hi) && hi > A.lo) { const n = 400, top: number[][] = [], bot: number[][] = []; let ok = true;
      for (let j = 0; j <= n; j++) { const x = A.lo + (j / n) * (hi - A.lo), y1 = fa.fn(x, 0, s.env), y2 = fb ? fb.fn(x, 0, s.env) : 0; if (!isFinite(y1) || !isFinite(y2)) { ok = false; break; } top.push([X(x), Y(y1)]); bot.push([X(x), Y(y2)]); }
      if (ok) { c.beginPath(); top.forEach((p, j) => (j ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); for (let j = bot.length - 1; j >= 0; j--) c.lineTo(bot[j][0], bot[j][1]); c.closePath(); c.fillStyle = A.color; c.globalAlpha = A.op; c.fill(); c.globalAlpha = 1;
        c.strokeStyle = A.color; c.lineWidth = 1.5 * u; c.setLineDash([6 * u, 5 * u]); c.beginPath(); c.moveTo(top[0][0], top[0][1]); c.lineTo(bot[0][0], bot[0][1]); c.moveTo(top[n][0], top[n][1]); c.lineTo(bot[n][0], bot[n][1]); c.stroke(); c.setLineDash([]); } } }
  const RG = s.region;
  if (RG && RG.on && RG.seed) { const bs = regionBounds(s); if (bs.length) { const cs = Math.max(3, Math.round(4 * u)), m = regionMask(bs, v, W, H, cs, RG.seed);
    if (m && !m.touches) { c.fillStyle = RG.color; c.globalAlpha = RG.op; for (let j = 0; j < m.ny; j++) { let a = -1; for (let i = 0; i <= m.nx; i++) { if (i < m.nx && m.mask[j * m.nx + i]) { if (a < 0) a = i; } else if (a >= 0) { c.fillRect(a * cs, j * cs, (i - a) * cs, cs); a = -1; } } } c.globalAlpha = 1; }
    c.fillStyle = RG.color; c.beginPath(); c.arc(X(RG.seed[0]), Y(RG.seed[1]), 4 * u, 0, 7); c.fill(); } }
  s.eqs.forEach((e: Eq, i: number) => {
    const k = s.comp[i]; if (!e.show || !k?.c) return; const f = k.c.fn; c.strokeStyle = e.color; c.lineWidth = (e.w ?? 2.6) * u; c.lineJoin = "round"; c.setLineDash(k.c.kind === "ineq" ? (k.c.strict ? [10 * u, 8 * u] : []) : e.dash ? [10 * u, 8 * u] : []); c.beginPath();
    if (k.c.kind === "param" || k.c.kind === "polar") { const c0 = k.c, n = 2400; let pen = false, px = 0, py = 0;
      for (let j = 0; j <= Math.floor(n * (s.reveal ?? 1)); j++) { const t = c0.t0 + (j / n) * (c0.t1 - c0.t0); let x: number, y: number;
        if (c0.kind === "param") { x = c0.fx(t, 0, s.env); y = c0.fy(t, 0, s.env); } else { const rr = c0.fn(t, 0, s.env); x = rr * Math.cos(t); y = rr * Math.sin(t); }
        if (!isFinite(x) || !isFinite(y) || Math.abs(x) > 1e9 || Math.abs(y) > 1e9) { pen = false; continue; } const X1 = X(x), Y1 = Y(y);
        if (pen && Math.hypot(X1 - px, Y1 - py) > Math.max(W, H)) pen = false; if (!pen) c.moveTo(X1, Y1); else c.lineTo(X1, Y1); pen = true; px = X1; py = Y1; } }
    else if (k.c.kind === "explicit") { let pen = false, py = 0, lastPid = 0; const n = Math.min(Math.round(W), 1800); for (let j = 0; j <= Math.floor(n * (s.reveal ?? 1)); j++) { const x = v.x0 + (j / n) * (v.x1 - v.x0), y = f(x, 0, s.env); if (!isFinite(y) || Math.abs(y) > 1e9) { pen = false; continue; } const q = Y(y); if (pen && Math.abs(q - py) > H * 0.9) pen = false; const pid = k.c.piece ? k.c.piece(x, s.env) : 0; if (pen && pid !== lastPid) pen = false; lastPid = pid; if (!pen) c.moveTo(X(x), q); else c.lineTo(X(x), q); pen = true; py = q; } }
    else { const cs = Math.max(4, Math.round(5 * u)), nx = Math.ceil(W / cs) + 1, ny = Math.ceil(H / cs) + 1, val = new Float64Array(nx * ny);
      for (let j = 0; j < ny; j++) for (let a = 0; a < nx; a++) val[j * nx + a] = f(v.x0 + ((a * cs) / W) * (v.x1 - v.x0), v.y1 - ((j * cs) / H) * (v.y1 - v.y0), s.env);
      for (let j = 0; j < ny - 1; j++) for (let a = 0; a < nx - 1; a++) { const va = val[j * nx + a], vb = val[j * nx + a + 1], vd = val[(j + 1) * nx + a], vc = val[(j + 1) * nx + a + 1]; if (!isFinite(va + vb + vc + vd)) continue;
        const x = a * cs, y = j * cs, pt: number[][] = []; const ed = (p: number, q: number, x1: number, y1: number, x2: number, y2: number) => { if (p < 0 !== q < 0) { const t = p / (p - q); pt.push([x1 + t * (x2 - x1), y1 + t * (y2 - y1)]); } };
        ed(va, vb, x, y, x + cs, y); ed(vb, vc, x + cs, y, x + cs, y + cs); ed(vd, vc, x, y + cs, x + cs, y + cs); ed(va, vd, x, y, x, y + cs);
        if (pt.length >= 2) { c.moveTo(pt[0][0], pt[0][1]); c.lineTo(pt[1][0], pt[1][1]); if (pt.length === 4) { c.moveTo(pt[2][0], pt[2][1]); c.lineTo(pt[3][0], pt[3][1]); } } } }
    c.stroke();
  });
  c.setLineDash([]);
  if (s.pts.length && s.bar) { c.fillStyle = "#0f172a"; const xs = s.pts.map((p: number[]) => p[0]).sort((a: number, b: number) => a - b); let gap = Infinity; for (let i = 1; i < xs.length; i++) if (xs[i] > xs[i - 1]) gap = Math.min(gap, xs[i] - xs[i - 1]); if (!isFinite(gap)) gap = (v.x1 - v.x0) / 10; const bw = Math.abs(X(gap) - X(0)) * 0.6; c.globalAlpha = 0.75; s.pts.forEach((p: number[]) => { const a = Y(0), b = Y(p[1]); c.fillRect(X(p[0]) - bw / 2, Math.min(a, b), bw, Math.abs(b - a)); }); c.globalAlpha = 1; }
  else if (s.pts.length) { c.fillStyle = c.strokeStyle = "#0f172a"; c.lineWidth = 2 * u; if (s.connect) { c.beginPath(); s.pts.forEach((p: number[], i: number) => (i ? c.lineTo(X(p[0]), Y(p[1])) : c.moveTo(X(p[0]), Y(p[1])))); c.stroke(); } s.pts.forEach((p: number[]) => { c.beginPath(); c.arc(X(p[0]), Y(p[1]), 4 * u, 0, 7); c.fill(); }); }
  for (const a of s.ann as Ann[]) {
    c.strokeStyle = c.fillStyle = a.c; c.lineWidth = (a.hl ? 12 : 2.4) * u; c.globalAlpha = a.hl ? 0.35 : 1; c.textAlign = "left"; c.font = `${14 * u}px Inter, sans-serif`;
    if (a.k === "free" || a.k === "line") { c.beginPath(); a.pts.forEach((p, i) => (i ? c.lineTo(X(p[0]), Y(p[1])) : c.moveTo(X(p[0]), Y(p[1])))); c.stroke(); if (a.arrow && a.pts.length > 1) { const p0 = a.pts[0], p1 = a.pts[a.pts.length - 1], g = Math.atan2(Y(p1[1]) - Y(p0[1]), X(p1[0]) - X(p0[0])), L = 16 * u; c.beginPath(); for (const sg of [-0.5, 0.5]) { c.moveTo(X(p1[0]), Y(p1[1])); c.lineTo(X(p1[0]) - L * Math.cos(g + sg), Y(p1[1]) - L * Math.sin(g + sg)); } c.stroke(); } }
    if (a.k === "pt" || a.k === "line") for (const p of a.k === "pt" ? a.pts : [a.pts[0], a.pts[a.pts.length - 1]]) { c.beginPath(); c.arc(X(p[0]), Y(p[1]), 4.5 * u, 0, 7); c.fill(); if (a.k === "pt") c.fillText(`(${lab(p[0])}, ${lab(p[1])})`, X(p[0]) + 8 * u, Y(p[1]) - 8 * u); }
    if (a.k === "label" && a.text) c.fillText(a.text, X(a.pts[0][0]), Y(a.pts[0][1]));
    c.globalAlpha = 1;
  }
  if (s.trace) { const k = s.comp[s.trace.eq]; if (k?.c) { const ty = k.c.fn(s.trace.x, 0, s.env); if (isFinite(ty)) { if (s.tangent) { const hh = (v.x1 - v.x0) * 1e-4, m = (k.c.fn(s.trace.x + hh, 0, s.env) - k.c.fn(s.trace.x - hh, 0, s.env)) / (2 * hh); if (isFinite(m)) { c.strokeStyle = "#475569"; c.lineWidth = 2 * u; c.setLineDash([8 * u, 6 * u]); c.beginPath(); c.moveTo(X(v.x0), Y(ty + m * (v.x0 - s.trace.x))); c.lineTo(X(v.x1), Y(ty + m * (v.x1 - s.trace.x))); c.stroke(); c.setLineDash([]); } } c.fillStyle = "#fff"; c.strokeStyle = s.eqs[s.trace.eq].color; c.lineWidth = 3 * u; c.beginPath(); c.arc(X(s.trace.x), Y(ty), 7 * u, 0, 7); c.fill(); c.stroke(); c.fillStyle = "#0f172a"; c.font = `${14 * u}px Inter, sans-serif`; c.textAlign = "left"; c.fillText(`(${lab(s.trace.x)}, ${lab(ty)})`, X(s.trace.x) + 12 * u, Y(ty) - 12 * u); } } }
  c.textAlign = "center"; c.fillStyle = "#0f172a"; if (s.title) { c.font = `600 ${18 * u}px Inter, sans-serif`; c.fillText(s.title, W / 2, 26 * u); }
  if (s.legend) { c.font = `${13 * u}px Inter, sans-serif`; c.textAlign = "left"; let ly = 20 * u; s.eqs.forEach((e: Eq) => { if (!e.show || !e.src.trim()) return; c.fillStyle = e.color; c.fillRect(W - 230 * u, ly - 9 * u, 18 * u, 4 * u); c.fillStyle = "#0f172a"; c.fillText(e.src.slice(0, 26), W - 205 * u, ly - 3 * u); ly += 20 * u; }); }
  return v;
}

export function sceneOf(d: any) {
  const eqs: Eq[] = d.eqs || []; const comp = eqs.map(e => { try { return { c: compile(e.src) } as any; } catch { return {} as any; } });
  const names = new Set<string>(); comp.forEach((k: any, i: number) => eqs[i].show && k.c?.vars.forEach((v: string) => v !== "x" && v !== "y" && v !== "t" && names.add(v)));
  const env = Object.fromEntries([...names].map(k => [k, d.pr?.[k]?.v ?? 1]));
  const pts = ((d.rows || []) as Row[]).map(q => [num(q.x), num(q.y)]).filter(p => !isNaN(p[0]) && !isNaN(p[1]));
  return { rng: d.rng || [-10, 10, -7, 7], equal: d.equal ?? true, eqs, comp, env, gx: d.gx ?? 2, gy: d.gy ?? 2, shadeMode: d.shadeMode || "layers", shadeOn: d.fillOn !== false, area: d.area || null, region: d.reg || null, tangent: false, transparent: false, reveal: 1, grid: d.grid ?? true, axes: d.axes ?? true, nums: d.nums ?? true, legend: d.legend ?? true, title: d.title || "", ann: d.ann || [], pts, connect: d.connect ?? true, bar: !!d.bar, trace: null };
}

const okNum = (s: string) => { const n = +s; return s.trim() !== "" && isFinite(n) && n >= 0.001 ? n : NaN; };
type Reg = { on: boolean; ids: number[]; ax: boolean; ay: boolean; seed: number[] | null; color: string; op: number };
type Area = { on: boolean; a: number; b: number; lo: number; hi: number; color: string; op: number };
const ANIM: [string, string][] = [["param", "Parameter sweep"], ["draw", "Draw curve"], ["point", "Point and tangent"], ["area", "Area accumulation"]];
const TABS: [string, string][] = [["eq", "Equations"], ["sh", "Shade"], ["ar", "Area"], ["an", "Analysis"], ["gr", "Grid"], ["am", "Animate"], ["pr", "Present"], ["ex", "Export"]];

export default function Graph({ lessonId }: { lessonId?: string }) {
  const [eqs, setEqs] = useState<Eq[]>([{ id: 1, src: "y = ax^2 + bx + c", color: COLORS[0], show: true }]);
  const [pr, setPr] = useState<Record<string, { v: number; min: number; max: number }>>({ a: { v: 1, min: -5, max: 5 }, b: { v: 0, min: -5, max: 5 }, c: { v: 0, min: -5, max: 5 } });
  const [rng, setRng] = useState<number[]>([-10, 10, -7, 7]); const [equal, setEqual] = useState(true);
  const [grid, setGrid] = useState(true), [axes, setAxes] = useState(true), [nums, setNums] = useState(true), [legend, setLegend] = useState(true), [transparent, setTransparent] = useState(false);
  const [title, setTitle] = useState(""); const [mode, setMode] = useState("pan"); const [lock, setLock] = useState(false); const [snap, setSnap] = useState(false);
  const [ann, setAnn] = useState<Ann[]>([]); const [col, setCol] = useState("#d62828");
  const [rows, setRows] = useState<Row[]>([{ x: "", y: "" }]); const [connect, setConnect] = useState(true); const [bar, setBar] = useState(false);
  const [inp, setInp] = useState(""); const [err, setErr] = useState(""); const [note, setNote] = useState("");
  const [gxt, setGxt] = useState("2"), [gyt, setGyt] = useState("2");
  const [shadeMode, setShadeMode] = useState("layers"); const [fillOn, setFillOn] = useState(true);
  const [area, setArea] = useState<Area>({ on: false, a: 0, b: -1, lo: 0, hi: 1, color: "#0d9488", op: 0.35 }); const [inter, setInter] = useState<number[]>([]); const [reg, setReg] = useState<Reg>({ on: false, ids: [], ax: false, ay: false, seed: null, color: "#7c3aed", op: 0.3 });
  const [trace, setTrace] = useState<{ x: number; eq: number } | null>(null); const [tangent, setTangent] = useState(false);
  const [an, setAn] = useState({ mode: "param", playing: false, prog: 0, speed: 1, loop: true }); const [ap, setAp] = useState("a");
  const [sv, setSv] = useState(false); const [svTab, setSvTab] = useState("eq"); const [qa, setQa] = useState(false); const [gfull, setGfull] = useState(false); const [pres, setPres] = useState<number | null>(null);
  const [target, setTarget] = useState<{ page: number; idx: number } | null>(null); const [selId, setSelId] = useState(0);
  const cv = useRef<HTMLCanvasElement>(null), wrap = useRef<HTMLDivElement>(null), ro = useRef<HTMLSpanElement>(null), drag = useRef<any>(null), nid = useRef(2), ptrs = useRef(new Map<number, { x: number; y: number }>()), pinch = useRef<any>(null);
  const first = useRef(true), lastLog = useRef(0), prevSig = useRef<any>(null), inserting = useRef(false), animBase = useRef<number | null>(null), hist = useRef<Ann[][]>([]), fut = useRef<Ann[][]>([]), ST = useRef<any>({});
  const reduced = useMemo(() => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches, []);

  const gxv = okNum(gxt), gyv = okNum(gyt), gx = isNaN(gxv) ? 2 : gxv, gy = isNaN(gyv) ? 2 : gyv, gerr = isNaN(gxv) || isNaN(gyv);
  const effEqs = pres === null ? eqs : eqs.map((e, i) => ({ ...e, show: e.show && i < pres }));
  const comp = useMemo(() => eqs.map(e => { try { return { c: compile(e.src) } as any; } catch (er: any) { return { err: er.message } as any; } }), [eqs]);
  const params = useMemo(() => { const s = new Set<string>(); eqs.forEach((e, i) => e.show && comp[i]?.c?.vars.forEach((v: string) => v !== "x" && v !== "y" && v !== "t" && s.add(v))); return [...s].sort(); }, [eqs, comp]);
  const P = (k: string) => pr[k] ?? { v: 1, min: -5, max: 5 };
  const env = Object.fromEntries(params.map(k => [k, P(k).v]));
  const pts = rows.map(r => [num(r.x), num(r.y)]).filter(p => !isNaN(p[0]) && !isNaN(p[1]));
  const explicit = eqs.map((e, i) => i).filter(i => comp[i]?.c?.kind === "explicit"), ineqIdx = eqs.map((e, i) => i).filter(i => comp[i]?.c?.kind === "ineq");
  const traceIdx = eqs.findIndex((e, i) => e.show && comp[i]?.c?.kind === "explicit");
  const fOf = (i: number) => (x: number) => comp[i].c.fn(x, 0, env);
  const areaHi = an.mode === "area" && an.prog > 0 ? area.lo + an.prog * (area.hi - area.lo) : undefined;
  const steps = eqs.length + (area.on ? 1 : 0);
  const S: any = { rng, equal, eqs: effEqs, comp, env, grid, axes, nums, legend, title, ann, pts, connect, bar, trace, gx, gy, shadeMode, shadeOn: fillOn, tangent: tangent && !!trace, transparent: false,
    area: { ...area, on: area.on && (pres === null || pres > eqs.length), hiAnim: areaHi }, region: reg, reveal: an.mode === "draw" && (an.playing || an.prog > 0) ? an.prog : 1 };
  const annRef = useRef<Ann[]>([]); annRef.current = ann;
  const defOf = () => ({ eqs, pr, rng, equal, grid, axes, nums, legend, title, ann, rows, connect, bar, gx, gy, gxt, gyt, shadeMode, fillOn, area, reg });
  const defKey = JSON.stringify(defOf());
  ST.current = { params, ap, pr, area, rng, an, traceIdx };

  useEffect(() => { const c = cv.current!, b = c.getBoundingClientRect(), d = devicePixelRatio || 1; c.width = Math.round(b.width * d); c.height = Math.round(b.height * d); drawGraph(c.getContext("2d")!, c.width, c.height, S); });
  useEffect(() => { const o = new ResizeObserver(() => setRng(r => [...r])); o.observe(cv.current!); return () => o.disconnect(); }, []);
  useEffect(() => { const c = cv.current!; const w = (e: WheelEvent) => { e.preventDefault(); if (lock) return; const b = c.getBoundingClientRect(), v = viewOf(S, b.width, b.height), k = e.deltaY > 0 ? 1.12 : 1 / 1.12, mx = v.x0 + ((e.clientX - b.left) / b.width) * (v.x1 - v.x0), my = v.y1 - ((e.clientY - b.top) / b.height) * (v.y1 - v.y0); setRng([mx + (v.x0 - mx) * k, mx + (v.x1 - mx) * k, my + (v.y0 - my) * k, my + (v.y1 - my) * k]); }; c.addEventListener("wheel", w, { passive: false }); return () => c.removeEventListener("wheel", w); });

  // ---- animation: one loop at a time, cancelled on pause, stop, unmount ----
  const applyProg = (p: number) => { const s = ST.current;
    if (s.an.mode === "param") { if (!s.params.includes(s.ap)) return; const q = s.pr[s.ap] ?? { v: 1, min: -5, max: 5 }; if (animBase.current === null) animBase.current = q.v; setPr(o => ({ ...o, [s.ap]: { ...q, v: q.min + (q.max - q.min) * p } })); }
    else if (s.an.mode === "point") { if (s.traceIdx < 0) return; const [a, b] = s.area.on ? [s.area.lo, s.area.hi] : [s.rng[0], s.rng[1]]; setTrace({ x: a + (b - a) * p, eq: s.traceIdx }); } };
  const setProg = (p: number) => { setAn(a => ({ ...a, prog: p })); applyProg(p); };
  const enableArea = () => setArea(a => ({ ...a, on: true, a: eqs.some(e => e.id === a.a && comp[eqs.indexOf(e)]?.c?.kind === "explicit") ? a.a : (explicit.length ? eqs[explicit[0]].id : 0) }));
  const play = () => {
    if (an.playing) { setAn(a => ({ ...a, playing: false })); return; }
    if (an.mode === "param" && !params.includes(ap)) { setErr("Add a parameter (a, b, c, d, k, m, n, p or q) to an equation first."); return; }
    if (an.mode === "point") { if (traceIdx < 0) { setErr("Point animation needs a visible y = f(x) equation."); return; } setTangent(true); }
    if (an.mode === "area") { if (!explicit.length) { setErr("Area animation needs a y = f(x) equation."); return; } enableArea(); }
    setAn(a => ({ ...a, playing: true, prog: a.prog >= 1 ? 0 : a.prog }));
  };
  const stop = () => { setAn(a => ({ ...a, playing: false, prog: 0 })); if (an.mode === "param" && animBase.current !== null && params.includes(ap)) { const q = P(ap), v = animBase.current; setPr(o => ({ ...o, [ap]: { ...q, v } })); } animBase.current = null; if (an.mode === "point") setTrace(null); };
  useEffect(() => {
    if (!an.playing) return;
    const tickp = (dp: number) => { let p = ST.current.an.prog + dp; if (p >= 1) { if (ST.current.an.loop) p -= 1; else { p = 1; setAn(a => ({ ...a, playing: false })); } } setProg(p); };
    if (reduced) { const t = setInterval(() => tickp(0.1 * ST.current.an.speed), 700); return () => clearInterval(t); }
    let raf = 0, last = performance.now(); const f = (t: number) => { tickp(((t - last) / 1000) * 0.25 * ST.current.an.speed); last = t; raf = requestAnimationFrame(f); }; raf = requestAnimationFrame(f); return () => cancelAnimationFrame(raf);
  }, [an.playing, reduced]);

  // ---- pointer interaction: navigate (pan, pinch, trace) is separate from draw tools ----
  const pos = (e: React.PointerEvent) => { const b = cv.current!.getBoundingClientRect(), v = viewOf(S, b.width, b.height); let x = v.x0 + ((e.clientX - b.left) / b.width) * (v.x1 - v.x0), y = v.y1 - ((e.clientY - b.top) / b.height) * (v.y1 - v.y0); if (snap) { const sx = gridStep(gx, v.x1 - v.x0), sy = gridStep(gy, v.y1 - v.y0); x = Math.round(x / sx) * sx; y = Math.round(y / sy) * sy; } return { x, y, b, v }; };
  const setTraceAt = (x: number) => { if (traceIdx < 0) { setErr("Move-a-point needs a visible y = f(x) equation."); return; } setTrace({ x, eq: traceIdx }); };
  const eraseAt = (x: number, y: number, b: DOMRect, v: any) => { const tx = (12 / b.width) * (v.x1 - v.x0), ty = (12 / b.height) * (v.y1 - v.y0); setAnn(a => { const n = a.filter(q => !near(q, x, y, tx, ty)); return n.length === a.length ? a : n; }); };
  const down = (e: React.PointerEvent) => { const { x, y, b, v } = pos(e); (e.target as Element).setPointerCapture(e.pointerId); ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size === 2) { const [p, q] = [...ptrs.current.values()]; pinch.current = { d: Math.hypot(p.x - q.x, p.y - q.y) || 1, v }; drag.current = null; return; }
    if (mode === "pan") { if (!lock) drag.current = { px: e.clientX, py: e.clientY, v }; return; }
    if (mode === "trace") { setTraceAt(x); return; }
    if (mode === "region") { setReg(g => ({ ...g, seed: [x, y], on: true })); return; }
    hist.current.push(annRef.current); if (hist.current.length > 100) hist.current.shift(); fut.current = [];
    if (mode === "erase") { eraseAt(x, y, b, v); return; }
    if (mode === "free" || mode === "smart" || mode === "hl") setAnn(a => [...a, { k: "free", pts: [[x, y]], c: col, hl: mode === "hl" || undefined }]);
    else if (mode === "line" || mode === "arrow") setAnn(a => [...a, { k: "line", pts: [[x, y], [x, y]], c: col, arrow: mode === "arrow" || undefined }]);
    else if (mode === "pt") setAnn(a => [...a, { k: "pt", pts: [[x, y]], c: col }]);
    else if (mode === "label") { const t = prompt("Label text")?.trim(); if (t) setAnn(a => [...a, { k: "label", pts: [[x, y]], text: t, c: col }]); } };
  const move = (e: React.PointerEvent) => { if (ptrs.current.has(e.pointerId)) ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); const { x, y, b, v } = pos(e); if (ro.current) ro.current.textContent = `x = ${lab(x)}, y = ${lab(y)}`;
    if (pinch.current && ptrs.current.size === 2) { if (lock) return; const [p, q] = [...ptrs.current.values()], k = pinch.current.d / (Math.hypot(p.x - q.x, p.y - q.y) || 1), w = pinch.current.v, mx = ((p.x + q.x) / 2 - b.left) / b.width, my = ((p.y + q.y) / 2 - b.top) / b.height, cx = w.x0 + mx * (w.x1 - w.x0), cy = w.y1 - my * (w.y1 - w.y0); setRng([cx + (w.x0 - cx) * k, cx + (w.x1 - cx) * k, cy + (w.y0 - cy) * k, cy + (w.y1 - cy) * k]); return; }
    if (drag.current?.v) { const d = drag.current, dx = ((e.clientX - d.px) / b.width) * (d.v.x1 - d.v.x0), dy = ((e.clientY - d.py) / b.height) * (d.v.y1 - d.v.y0); setRng([d.v.x0 - dx, d.v.x1 - dx, d.v.y0 + dy, d.v.y1 + dy]); return; }
    if (!e.buttons) return; void v;
    if (mode === "trace") setTraceAt(x); else if (mode === "erase") eraseAt(x, y, b, v);
    else if (mode === "free" || mode === "smart" || mode === "hl") setAnn(a => { const l = a[a.length - 1]; return l?.k === "free" ? [...a.slice(0, -1), { ...l, pts: [...l.pts, [x, y]] }] : a; });
    else if (mode === "line" || mode === "arrow") setAnn(a => { const l = a[a.length - 1]; return l?.k === "line" ? [...a.slice(0, -1), { ...l, pts: [l.pts[0], [x, y]] }] : a; }); };
  const up = (e: React.PointerEvent) => { ptrs.current.delete(e.pointerId); if (ptrs.current.size < 2) pinch.current = null; drag.current = null; if (mode !== "smart") return; const l = annRef.current[annRef.current.length - 1]; if (l?.k !== "free") return; const f = fitStroke(l.pts);
    if (f) { setAnn(a => a.slice(0, -1)); addEq(f.src); setNote(`Fitted a ${f.desc}: ${f.src}. This is an approximation of your drawing, not an exact answer.`); } else setNote("Could not fit a line, curve or circle, so the drawing was kept as freehand."); };
  const fit = () => setRng([-10, 10, -7, 7]);
  const addEq = (src: string) => { if (eqs.length >= 8) return setErr("At most 8 equations at once."); try { compile(src); } catch (e: any) { return setErr(e.message); } setErr(""); setEqs(q => [...q, { id: nid.current++, src, color: COLORS[q.length % COLORS.length], show: true }]); setInp(""); };
  const upd = (id: number, p: Partial<Eq>) => setEqs(q => q.map(e => (e.id === id ? { ...e, ...p } : e)));
  const dupEq = (e: Eq) => { if (eqs.length >= 8) return setErr("At most 8 equations at once."); setEqs(q => [...q, { ...e, id: nid.current++, color: COLORS[q.length % COLORS.length] }]); };
  const set = (k: string, v: Partial<{ v: number; min: number; max: number }>) => setPr(p => ({ ...p, [k]: { ...P(k), ...v } }));
  const preset = (p: Pre) => { if (eqs.length >= 8) return setErr("At most 8 equations at once."); setPr(q => { const n = { ...q }; Object.entries(p[2]).forEach(([k, a]) => { n[k] = { v: a[0], min: a[1], max: a[2] }; }); return n; }); addEq(p[1]); };

  // ---- export, send to whiteboard, save/restore ----
  const render = (tr = false) => { const c = document.createElement("canvas"); c.width = 1600; c.height = 900; drawGraph(c.getContext("2d")!, 1600, 900, { ...S, transparent: tr }); return c; };
  const dl = (name: string, href: string) => { const a = document.createElement("a"); a.href = href; a.download = name; a.click(); };
  const exportPng = () => { try { dl((title || "graph") + ".png", render(transparent).toDataURL("image/png")); } catch { setErr("PNG export failed."); } };
  const exportSvg = () => { try { const c = new SvgCtx(1600, 900); drawGraph(c as any, 1600, 900, { ...S, transparent }); dl((title || "graph") + ".svg", URL.createObjectURL(new Blob([c.toString()], { type: "image/svg+xml" }))); } catch { setErr("SVG export failed."); } };
  const exportJson = () => dl((title || "graph") + ".json", URL.createObjectURL(new Blob([JSON.stringify({ voxboardGraph: 1, ...defOf() }, null, 1)], { type: "application/json" })));
  const importJson = async (f?: File) => { if (!f) return; try { const d = JSON.parse(await f.text()); if (!Array.isArray(d.eqs)) throw 0; loadDef(d); setNote("Graph settings imported."); } catch { setErr("That file is not a VoxBoard graph JSON export."); } };
  const hasContent = effEqs.some((e, i) => e.show && comp[i]?.c) || pts.length > 0 || ann.length > 0;
  const insert = async () => { if (inserting.current) return; if (!hasContent) return setErr("Nothing to send yet."); inserting.current = true; pending.graph = { src: render(transparent).toDataURL("image/png"), def: defOf(), replace: target || undefined }; try { location.hash = "#/board/" + (lessonId || (await openLast())); } catch { setErr("Could not open a board."); } setTimeout(() => (inserting.current = false), 1500); };
  const importCsv = async (f?: File) => { if (!f) return; if (f.size > 2e6) return setErr("CSV is larger than 2 MB."); const lines = (await f.text()).split(/\r?\n/).map(l => l.split(/[,\t;]/).map(s => s.trim())).filter(l => l.length >= 2 && l[0] !== ""); const data = isNaN(num(lines[0]?.[0] ?? "")) ? lines.slice(1) : lines; if (!data.length) return setErr("No x,y rows found in that file."); setRows(data.slice(0, 5000).map(l => ({ x: l[0], y: l[1] }))); setErr(""); };
  const lastLogEv = (kind: string, text: string, def?: any) => { const put = (a: any[]) => localStorage.setItem("vb-gev", JSON.stringify(a)); try { let a = JSON.parse(localStorage.getItem("vb-gev") || "[]"); a.push({ at: Date.now(), kind, text: text.slice(0, 200), def }); a = a.slice(-120); try { put(a); } catch { put(a.slice(-40)); } } catch { /* storage unavailable */ } };
  const loadDef = (d: any) => { if (!d) return; if (Array.isArray(d.eqs)) { setEqs(d.eqs); nid.current = Math.max(1, ...d.eqs.map((q: Eq) => q.id)) + 1; } if (d.pr) setPr(d.pr); if (Array.isArray(d.rng) && d.rng.length === 4) setRng(d.rng); setEqual(d.equal ?? true); setGrid(d.grid ?? true); setAxes(d.axes ?? true); setNums(d.nums ?? true); setLegend(d.legend ?? true); setTitle(d.title || ""); setAnn(Array.isArray(d.ann) ? d.ann : []); setRows(Array.isArray(d.rows) && d.rows.length ? d.rows : [{ x: "", y: "" }]); setConnect(d.connect ?? true); setBar(!!d.bar);
    setGxt(String(d.gxt ?? d.gx ?? 2)); setGyt(String(d.gyt ?? d.gy ?? 2)); setShadeMode(d.shadeMode || "layers"); setFillOn(d.fillOn !== false); if (d.area) setArea(d.area); if (d.reg) setReg(d.reg); };
  useEffect(() => { const e = pending.editGraph; if (e) { pending.editGraph = undefined; loadDef(e.def); if (e.page >= 0) setTarget({ page: e.page, idx: e.idx }); return; } try { const g = JSON.parse(localStorage.getItem("vb-graph-last") || "null"); if (g?.def) loadDef(g.def); } catch { /* nothing saved */ } }, []);
  useEffect(() => { if (first.current) { first.current = false; return; } const t = setTimeout(() => { try { const c = document.createElement("canvas"); c.width = 640; c.height = 360; drawGraph(c.getContext("2d")!, 640, 360, S); localStorage.setItem("vb-graph-last", JSON.stringify({ at: Date.now(), src: c.toDataURL("image/jpeg", 0.7), def: defOf() })); } catch { /* storage full */ } }, 800); return () => clearTimeout(t); }, [defKey]);
  const eqSig = JSON.stringify(eqs.map(e => [e.src, e.show, e.color])), pSig = JSON.stringify(env), rSig = JSON.stringify(rng), aSig = JSON.stringify(ann);
  useEffect(() => {
    if (!prevSig.current) { prevSig.current = { e: eqSig, p: pSig, r: rSig, a: aSig }; return; }
    const fire = () => { const p = prevSig.current; prevSig.current = { e: eqSig, p: pSig, r: rSig, a: aSig }; lastLog.current = Date.now();
      const kind = p.e !== eqSig ? "Equations" : p.p !== pSig ? "Parameters" : p.r !== rSig ? "View" : p.a !== aSig ? "Annotation" : "Graph";
      const text = kind === "Equations" ? eqs.filter(e => e.show && e.src.trim()).map(e => e.src).join("  ;  ") : kind === "Parameters" ? params.map(k => `${k} = ${lab(P(k).v)}`).join(", ") : kind === "View" ? `x from ${lab(rng[0])} to ${lab(rng[1])}` : kind === "Annotation" ? "Annotations changed" : "Settings changed";
      let d: any = defOf(); if (JSON.stringify(d).length > 40000) d = { ...d, ann: [], rows: [], trimmed: true }; lastLogEv(kind, text, d); };
    if (Date.now() - lastLog.current >= 600) { fire(); return; }
    const t = setTimeout(fire, 400); return () => clearTimeout(t);
  }, [defKey]);

  // ---- panels, fullscreen, keyboard ----
  const toggleFull = () => { if (document.fullscreenElement || gfull) { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); setGfull(false); setPres(null); return; } const w = wrap.current; if (w?.requestFullscreen) w.requestFullscreen().then(() => setGfull(true)).catch(() => setGfull(true)); else setGfull(true); };
  useEffect(() => { const f = () => { if (!document.fullscreenElement) { setGfull(false); setPres(null); } }; document.addEventListener("fullscreenchange", f); return () => document.removeEventListener("fullscreenchange", f); }, []);
  useEffect(() => { const f = (e: KeyboardEvent) => { const tg = (e.target as HTMLElement).tagName; if (e.key === "Escape") { if (sv) setSv(false); else if (qa) setQa(false); else if (gfull && !document.fullscreenElement) { setGfull(false); setPres(null); } return; } if (pres !== null && !["INPUT", "TEXTAREA", "SELECT"].includes(tg)) { if (e.key === "ArrowRight") setPres(p => Math.min((p ?? 0) + 1, steps)); if (e.key === "ArrowLeft") setPres(p => Math.max((p ?? 0) - 1, 0)); } }; addEventListener("keydown", f); return () => removeEventListener("keydown", f); });
  useEffect(() => { if (!sv || innerWidth >= 800) return; const o = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = o; }; }, [sv]);

  // ---- analysis (numerical, over the visible x range) ----
  const selIdx = explicit.includes(selId) ? selId : explicit[0] ?? -1;
  const analysis = useMemo(() => { if (!sv || svTab !== "an" || selIdx < 0) return null; const f = fOf(selIdx), [x0, x1] = [rng[0], rng[1]];
    return { src: eqs[selIdx].src, y0: f(0), rt: roots(f, x0, x1), ex: extrema(f, x0, x1), asy: asymptotes(f, x0, x1), dr: domainRange(f, x0, x1), others: explicit.filter(i => i !== selIdx && eqs[i].show).flatMap(i => intersections(f, fOf(i), x0, x1).map(x => ({ x, y: f(x), w: eqs[i].src }))) }; }, [sv, svTab, eqSig, pSig, rSig, selIdx]);
  const ia = eqs.findIndex(e => e.id === area.a), ib = eqs.findIndex(e => e.id === area.b);
  const areaRes = useMemo(() => { if (!area.on || ia < 0 || comp[ia]?.c?.kind !== "explicit" || (area.b !== -1 && comp[ib]?.c?.kind !== "explicit")) return null; const hi = areaHi ?? area.hi; if (!(hi > area.lo)) return null; return areaBetween(fOf(ia), area.b === -1 ? () => 0 : fOf(ib), area.lo, hi); }, [area, areaHi, eqSig, pSig]);
  const traceInfo = (() => { if (!trace || !comp[trace.eq]?.c) return null; const f = fOf(trace.eq), h = (rng[1] - rng[0]) * 1e-4, y = f(trace.x), m = (f(trace.x + h) - f(trace.x - h)) / (2 * h); return isFinite(y) ? { x: trace.x, y, m } : null; })();
  const findInter = () => { if (ia < 0) return setErr("Choose a y = f(x) curve first."); setInter(intersections(fOf(ia), area.b === -1 ? () => 0 : fOf(ib), rng[0], rng[1])); };

  const regBounds = regionBounds(S);
  const regRes = useMemo(() => { if (!sv || svTab !== "ar" || !reg.on || !reg.seed || !regBounds.length) return null; const b = cv.current?.getBoundingClientRect(), W = Math.max(300, b?.width ?? 800), H = Math.max(200, b?.height ?? 500); return regionArea(regBounds, viewOf(S, W, H), W, H, reg.seed); }, [sv, svTab, reg, eqSig, pSig, rSig]);
  const RegionUI = <div className="geqrow"><b>Region bounded by several curves</b>
    <label className="row"><input type="checkbox" checked={reg.on} onChange={e => setReg(g => ({ ...g, on: e.target.checked }))} /> Shade a bounded region</label>
    <small className="mut">Tick the boundaries (curves, the x-axis, the y-axis), press Pick, then click inside the region you want. Only that enclosed region is shaded.</small>
    <div className="row">{eqs.map((e, i) => comp[i]?.c && (comp[i].c.kind === "explicit" || comp[i].c.kind === "implicit") ? <label key={e.id} className="row"><input type="checkbox" checked={reg.ids.includes(e.id)} onChange={ev => setReg(g => ({ ...g, ids: ev.target.checked ? [...g.ids, e.id] : g.ids.filter(z => z !== e.id) }))} /> {e.src}</label> : null)}
      <label className="row"><input type="checkbox" checked={reg.ax} onChange={e => setReg(g => ({ ...g, ax: e.target.checked }))} /> x-axis</label><label className="row"><input type="checkbox" checked={reg.ay} onChange={e => setReg(g => ({ ...g, ay: e.target.checked }))} /> y-axis</label></div>
    <div className="row"><button className={"sm" + (mode === "region" ? " primary" : "")} onClick={() => setMode("region")}><MousePointerClick size={14} /> Pick a point inside the region</button><input type="color" value={reg.color} onChange={e => setReg(g => ({ ...g, color: e.target.value }))} aria-label="Region colour" /><label>Opacity<input type="range" min={5} max={90} value={Math.round(reg.op * 100)} onChange={e => setReg(g => ({ ...g, op: +e.target.value / 100 }))} /></label><button className="sm" onClick={() => setReg(g => ({ ...g, seed: null, on: false }))}>Clear</button></div>
    {reg.on && <div className="note" role="status"><span>{!regBounds.length ? "Tick at least one boundary." : !reg.seed ? "Press Pick, then click inside the region." : !regRes ? "Calculating…" : regRes.status === "ok" ? <>Area ≈ <b>{lab(regRes.area)}</b> <small className="mut">(numerical, grid-based, typically within about 0.5%; the region is the enclosed area around the picked point)</small></> : regRes.status === "unbounded" ? "This region is not enclosed inside the current view. Zoom out, or tick more boundaries." : "The picked point is outside the view. Pick another point."}</span></div>}</div>;
  const printGraph = () => { try { const url = render(false).toDataURL("image/png"), f = document.createElement("iframe"); f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0"; document.body.appendChild(f); const d = f.contentDocument!;
      const list = effEqs.filter((e, i) => e.show && comp[i]?.c).map(e => `<li>${esc(e.src)}</li>`).join(""); d.open();
      d.write(`<!doctype html><html><head><title>${esc(title || "Graph")}</title><style>@page{size:landscape;margin:12mm}body{font:14px Inter,Arial,sans-serif;margin:0;color:#000}h1{font-size:18px;margin:0 0 8px}img{width:100%;height:auto;display:block}ul{margin:8px 0 0;padding-left:20px;font-size:13px}p{font-size:12px;color:#444}</style></head><body><h1>${esc(title || "Graph")}</h1><img id="g" src="${url}" alt="Graph"><ul>${list}</ul><p>Grid unit: x ${gx}, y ${gy}. Plotted with VoxBoard Graph Studio.</p></body></html>`); d.close();
      const go = () => { f.contentWindow!.focus(); f.contentWindow!.print(); setTimeout(() => f.remove(), 2000); }; const im = d.getElementById("g") as HTMLImageElement; if (im.complete) go(); else im.onload = go; } catch { setErr("Could not prepare the print view."); } };
  const tools: [string, any, string][] = [["pan", Hand, "Navigate: pan, zoom and pinch"], ["trace", Activity, "Move a point along a curve"], ["smart", Wand2, "Smart draw: fits a line, curve or circle to your stroke"], ["free", Pencil, "Pen (freehand, not an exact equation)"], ["hl", Highlighter, "Highlighter"], ["line", Minus, "Line segment"], ["arrow", ArrowUpRight, "Arrow"], ["pt", MapPin, "Plot point"], ["label", Type, "Label"], ["erase", Eraser, "Eraser for annotations"], ["region", MousePointerClick, "Pick a point inside a bounded region"]];
  const EqList = (full: boolean) => <>
    {eqs.length === 0 && <p className="mut">No equations yet. Type one above and press Plot Graph.</p>}
    {eqs.map((e, i) => <div key={e.id} className="geqrow"><div className="row"><button className="ib" aria-label={e.show ? "Hide equation" : "Show equation"} onClick={() => upd(e.id, { show: !e.show })}>{e.show ? <Eye size={16} /> : <EyeOff size={16} />}</button>
      <input type="color" value={e.color} onChange={ev => upd(e.id, { color: ev.target.value })} aria-label="Colour" /><input className="grow" value={e.src} onChange={ev => upd(e.id, { src: ev.target.value })} aria-label="Equation" />
      <button className="ib" aria-label="Duplicate equation" onClick={() => dupEq(e)}><Copy size={15} /></button><button className="ib" aria-label="Remove equation" onClick={() => setEqs(q => q.filter(z => z.id !== e.id))}><X size={15} /></button></div>
      {full && <div className="row"><label className="row">Width<select value={e.w ?? 2.6} onChange={ev => upd(e.id, { w: +ev.target.value })}><option value={1.5}>Thin</option><option value={2.6}>Medium</option><option value={4.5}>Thick</option></select></label><label className="row"><input type="checkbox" checked={!!e.dash} onChange={ev => upd(e.id, { dash: ev.target.checked })} /> Dashed</label></div>}
      {comp[i]?.err && <small className="err">{comp[i].err}</small>}</div>)}
    <button className="sm" onClick={() => addEq("y = x")}><Plus size={14} /> Add another equation</button></>;
  const GridUI = <div className="geqrow"><b>Grid units</b><div className="row"><label>X<input type="number" min="0.001" step="any" value={gxt} onChange={e => setGxt(e.target.value)} style={{ width: 84 }} aria-label="Horizontal grid unit" /></label><label>Y<input type="number" min="0.001" step="any" value={gyt} onChange={e => setGyt(e.target.value)} style={{ width: 84 }} aria-label="Vertical grid unit" /></label><button className="sm" onClick={() => { setGxt("2"); setGyt("2"); }}>Reset to default (2)</button></div>
    {gerr && <small className="err">Units must be numbers of at least 0.001. Using 2 until fixed.</small>}<small className="mut">Grid units only change grid lines, axis numbers and snapping. Equations and coordinates are unchanged. If the spacing is too fine for the zoom, a practical spacing is used.</small></div>;
  const AnimUI = <div className="geqrow"><div className="row"><select value={an.mode} onChange={e => { stop(); setAn(a => ({ ...a, mode: e.target.value })); }} aria-label="Animation type">{ANIM.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
    {an.mode === "param" && params.length > 0 && <select value={params.includes(ap) ? ap : params[0]} onChange={e => setAp(e.target.value)} aria-label="Parameter to animate">{params.map(k => <option key={k}>{k}</option>)}</select>}</div>
    <div className="row"><button className="sm primary" onClick={play}>{an.playing ? <Pause size={15} /> : <Play size={15} />} {an.playing ? "Pause" : "Animate"}</button><button className="sm" onClick={stop}><RotateCcw size={14} /> Stop and reset</button><label className="row"><input type="checkbox" checked={an.loop} onChange={e => setAn(a => ({ ...a, loop: e.target.checked }))} /> Loop</label></div>
    <input type="range" min={0} max={1} step={0.001} value={an.prog} onChange={e => setProg(+e.target.value)} aria-label="Animation progress" style={{ width: "100%" }} />
    <label>Speed {an.speed}x<input type="range" min={0.25} max={4} step={0.25} value={an.speed} onChange={e => setAn(a => ({ ...a, speed: +e.target.value }))} /></label>
    <small className="mut">{an.mode === "param" ? "Sweeps the chosen parameter between its slider range; the equation itself is not rewritten." : an.mode === "draw" ? "Draws y = f(x) curves left to right across the view." : an.mode === "point" ? "Moves a point along the first visible y = f(x) curve with its tangent, across the area limits or the view." : "Grows the shaded area from its lower limit to its upper limit; the area value updates."}</small></div>;
  const ExportUI = <div className="geqrow"><div className="row"><button className="sm" onClick={exportPng}><Download size={14} /> PNG</button><button className="sm" onClick={exportSvg}><Download size={14} /> SVG</button><button className="sm" onClick={exportJson}><Download size={14} /> JSON</button><button className="sm" onClick={printGraph}><Printer size={14} /> Print</button><label className="btn sm"><Upload size={14} /> Import JSON<input className="sr" type="file" accept=".json,application/json" onChange={e => { importJson(e.target.files?.[0]); e.target.value = ""; }} /></label></div>
    <label className="row"><input type="checkbox" checked={transparent} onChange={e => setTransparent(e.target.checked)} /> Transparent background (PNG, SVG, whiteboard)</label><button className="sm primary" onClick={insert}><LayoutTemplate size={14} /> {target ? "Update graph on Whiteboard" : "Send to Whiteboard"}</button></div>;
  const ShadeUI = <div className="geqrow"><div className="row">{["y > x^2", "y <= 2x + 1", "x > 1", "y >= -x + 3"].map(q => <button key={q} className="sm" onClick={() => addEq(q)}>{q}</button>)}</div>
    <label className="row">Overlap<select value={shadeMode} onChange={e => setShadeMode(e.target.value)}><option value="layers">Layers (each region, overlap darker)</option><option value="intersect">Intersection only</option><option value="union">Union</option></select></label>
    <label className="row"><input type="checkbox" checked={fillOn} onChange={e => setFillOn(e.target.checked)} /> Show fill</label>
    {ineqIdx.length === 0 && <small className="mut">Type an inequality such as y &gt; x² to shade its solution region. Strict (&lt; &gt;) boundaries are dashed, inclusive (≤ ≥) are solid.</small>}
    {ineqIdx.map(i => <div key={eqs[i].id} className="geqrow"><div className="row"><input type="color" value={eqs[i].color} onChange={e => upd(eqs[i].id, { color: e.target.value })} aria-label="Fill colour" /><b>{eqs[i].src}</b></div><label>Opacity {Math.round((eqs[i].op ?? 0.3) * 100)}%<input type="range" min={5} max={90} value={Math.round((eqs[i].op ?? 0.3) * 100)} onChange={e => upd(eqs[i].id, { op: +e.target.value / 100 })} style={{ width: "100%" }} /></label></div>)}
    <button className="sm" onClick={() => confirm("Remove all inequalities and the area shading? Other equations stay.") && (setEqs(q => q.filter((_, i) => !ineqIdx.includes(i))), setArea(a => ({ ...a, on: false })))}>Clear shading</button></div>;
  const AreaUI = <div className="geqrow"><label className="row"><input type="checkbox" checked={area.on} onChange={e => (e.target.checked ? enableArea() : setArea(a => ({ ...a, on: false })))} /> Shade area between curves</label>
    {explicit.length === 0 ? <small className="mut">Add a y = f(x) equation first.</small> : <>
      <label className="row">Curve A<select value={area.a} onChange={e => setArea(a => ({ ...a, a: +e.target.value }))}>{explicit.map(i => <option key={eqs[i].id} value={eqs[i].id}>{eqs[i].src}</option>)}</select></label>
      <label className="row">and<select value={area.b} onChange={e => setArea(a => ({ ...a, b: +e.target.value }))}><option value={-1}>the x-axis (y = 0)</option>{explicit.filter(i => eqs[i].id !== area.a).map(i => <option key={eqs[i].id} value={eqs[i].id}>{eqs[i].src}</option>)}</select></label>
      <div className="row"><label>From x<input type="number" step="any" value={area.lo} onChange={e => setArea(a => ({ ...a, lo: +e.target.value }))} style={{ width: 90 }} /></label><label>to x<input type="number" step="any" value={area.hi} onChange={e => setArea(a => ({ ...a, hi: +e.target.value }))} style={{ width: 90 }} /></label></div>
      <div className="row"><button className="sm" onClick={findInter}>Find intersections</button><input type="color" value={area.color} onChange={e => setArea(a => ({ ...a, color: e.target.value }))} aria-label="Area colour" /><label>Opacity<input type="range" min={5} max={90} value={Math.round(area.op * 100)} onChange={e => setArea(a => ({ ...a, op: +e.target.value / 100 }))} /></label></div>
      {inter.length > 0 && <div className="geqrow"><small className="mut">Crossing points in view: {inter.map(lab).join(", ")}. Choose the interval to shade:</small><div className="row">{inter.slice(0, -1).map((x, i) => <button key={i} className="sm" onClick={() => setArea(a => ({ ...a, lo: x, hi: inter[i + 1], on: true }))}>{lab(x)} to {lab(inter[i + 1])}</button>)}</div></div>}
      {area.on && <div className="note" role="status"><span>{areaRes ? (areaRes.reliable ? <>Area = ∫ from {lab(area.lo)} to {lab(areaHi ?? area.hi)} of |A − B| dx ≈ <b>{lab(areaRes.geometric)}</b><br />Signed area (below counts negative) ≈ {lab(areaRes.signed)}<br /><small className="mut">Numerical approximation (Simpson's rule, 2000 intervals), not an exact symbolic result. The shaded region is the geometric area.</small></> : "Cannot be calculated reliably: the curves have a break, or the values are unbounded, in this interval.") : "Enter limits with the upper limit greater than the lower limit."}</span></div>}</>}</div>;
  const AnalysisUI = <div className="geqrow">{explicit.length === 0 ? <small className="mut">Analysis needs a y = f(x) equation.</small> : <><label className="row">Equation<select value={selIdx} onChange={e => setSelId(+e.target.value)}>{explicit.map(i => <option key={eqs[i].id} value={i}>{eqs[i].src}</option>)}</select></label>
    <small className="mut">Numerical approximations over the visible x range ({lab(rng[0])} to {lab(rng[1])}); these are not exact or symbolic results.</small>
    {analysis && <><div>y-intercept: {isFinite(analysis.y0) ? <b>{lab(analysis.y0)}</b> : "undefined"}</div><div>Roots (x-intercepts): {analysis.rt.length ? analysis.rt.map(r => lab(r)).join(", ") : "none found"}</div>
      <div>Vertical asymptotes: {analysis.asy.vertical.length ? analysis.asy.vertical.map(x => "x = " + lab(x)).join(", ") : "none found"}</div>
      <div>Horizontal and slant asymptotes: {[["left", analysis.asy.left], ["right", analysis.asy.right]].map(([w, a]: any) => a.h !== undefined ? `y = ${lab(a.h)} (${w})` : a.m !== undefined ? `y = ${lab(a.m)}x + ${lab(a.c)} (${w})` : "").filter(Boolean).join(", ") || "none found"}</div>
      <div>Domain: {analysis.dr.intervals.length ? analysis.dr.intervals.map((q, i) => `${i === 0 && analysis.dr.leftTail ? "(-∞" : "[" + lab(q[0])}, ${i === analysis.dr.intervals.length - 1 && analysis.dr.rightTail ? "∞)" : lab(q[1]) + "]"}`).join(" ∪ ") : "undefined over this range"}<small className="mut"> (estimated from the visible x range and far-away values; gaps at asymptotes are not shown)</small></div>
      <div>Range: {isFinite(analysis.dr.min) ? `${analysis.dr.unboundedBelow ? "(-∞" : "[" + lab(analysis.dr.min)}, ${analysis.dr.unboundedAbove ? "∞)" : lab(analysis.dr.max) + "]"}` : "undefined"}<small className="mut"> (estimated numerically; may differ from the true range)</small></div>
      <div>Turning points: {analysis.ex.length ? analysis.ex.map((e, i) => <div key={i}>{e.kind} at ({lab(e.x)}, {lab(e.y)})</div>) : "none found"}</div>
      {analysis.others.length > 0 && <div>Intersections: {analysis.others.map((o, i) => <div key={i}>({lab(o.x)}, {lab(o.y)}) with {o.w}</div>)}</div>}</>}
    <div className="row"><label className="row"><input type="checkbox" checked={tangent} onChange={e => setTangent(e.target.checked)} /> Show tangent at the traced point</label></div>
    {traceInfo ? <div>Traced point: ({lab(traceInfo.x)}, {lab(traceInfo.y)}), slope ≈ {lab(traceInfo.m)}</div> : <small className="mut">Use the Move a point tool, then drag along the curve.</small>}</>}</div>;
  const PresUI = <div className="geqrow">{pres === null ? <button className="sm primary" onClick={() => { setPres(0); setSv(false); if (!gfull) toggleFull(); }}><Play size={14} /> Start presentation</button> : <div className="row"><button className="sm" onClick={() => setPres(p => Math.max((p ?? 0) - 1, 0))}>Previous</button><b>Step {pres} of {steps}</b><button className="sm primary" onClick={() => setPres(p => Math.min((p ?? 0) + 1, steps))}>Next</button><button className="sm" onClick={() => { setPres(null); }}>End</button></div>}
    <small className="mut">Reveals each equation in turn, then the area shading. Use the left and right arrow keys on a keyboard. Exit full screen with Esc.</small></div>;
  const GridCard = (<><h3>View</h3><label className="row">Title<input className="grow" value={title} onChange={e => setTitle(e.target.value)} /></label>
    {[["Grid", grid, setGrid], ["Axes", axes, setAxes], ["Axis numbers", nums, setNums], ["Legend", legend, setLegend], ["Equal axis scale", equal, setEqual], ["Lock view (static graph)", lock, setLock], ["Snap to grid", snap, setSnap]].map(([l, v, f]: any) => <label key={l} className="row" style={{ justifyContent: "space-between" }}>{l}<input type="checkbox" checked={v} onChange={e => f(e.target.checked)} /></label>)}
    <div className="row">{["X min", "X max", "Y min", "Y max"].map((l, i) => <label key={l} style={{ width: "46%" }}><small>{l}</small><input type="number" step="any" disabled={lock || (equal && i > 1)} value={rng[i]} onChange={e => { const n = [...rng]; n[i] = +e.target.value; if (n[1] > n[0] && n[3] > n[2]) setRng(n); }} /></label>)}</div>
    <button className="sm" onClick={fit}><RotateCcw size={14} /> Reset view</button></>);

  return (
    <div className={"gs" + (gfull ? " gfull" : "") + (sv ? " sv-open" : "")} ref={wrap}>
      <div className="gtop"><h1>Graph Studio</h1>
        <form className="geq" onSubmit={e => { e.preventDefault(); addEq(inp); }}><input className="grow" value={inp} onChange={e => setInp(e.target.value)} placeholder="Equation or inequality, e.g. y = x² , y > x^2 , x² + y² = 25" aria-label="Equation" /><button className="primary">Plot Graph</button></form>
        <button onClick={() => confirm("Remove all equations, points and annotations?") && (setEqs([]), setAnn([]), setRows([{ x: "", y: "" }]), setArea(a => ({ ...a, on: false })))}><Trash2 size={15} /> Clear</button>
        <button className="primary" onClick={insert}><LayoutTemplate size={15} /> {target ? "Update graph on Whiteboard" : "Send to Whiteboard"}</button></div>
      {err && <div className="note err" role="alert" onClick={() => setErr("")}>{err}</div>}{note && <div className="note" role="status" onClick={() => setNote("")}>{note}</div>}
      <small className="mut">Powers: x^2 or x². Examples: y = 2x + 3, y = √x, y = x⁻², y = sin(x)^2, y = |x|, y = 1/x, x² + y² = 25, y &gt; x², y ≤ 2x + 1, y = ax² + bx + c. Use brackets for functions: sin(x). This plots; it does not solve or prove.</small>
      <div className="chips" role="group" aria-label="Graph types">{PRESETS.map(p => <button key={p[0]} className="sm" onClick={() => preset(p)}>{p[0]}</button>)}</div>
      <div className="chips" role="group" aria-label="Curve forms">{[["Parametric circle", "(2cos(t), 2sin(t))"], ["Lissajous", "(3sin(2t), 2cos(3t))"], ["Cardioid", "r = 1 + cos(θ)"], ["Rose", "r = 3cos(2θ)"], ["Spiral", "r = 0.5t, t in [0, 6π]"], ["Piecewise", "y = {x < 0: -x; x >= 0: x^2}"], ["Step function", "y = {x < 1: 0; 1 <= x < 3: 2; else: 4}"]].map(([n, q]) => <button key={n} className="sm" title={q} onClick={() => addEq(q)}>{n}</button>)}</div>
      <div className="gmain">
        <aside className="card gl"><h3>Equations</h3>{EqList(false)}{GridCard}{GridUI}</aside>
        <div className="gcv"><canvas ref={cv} className={"gcanvas m-" + mode} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label="Graph canvas" />
          <div className="gbtns"><button className="sm" onClick={() => setSv(true)} aria-expanded={sv}><PanelRight size={15} /> Smart View</button><button className="sm" onClick={() => setQa(q => !q)} aria-expanded={qa}><ChevronUp size={15} style={{ transform: qa ? "rotate(180deg)" : "none", transition: "transform .2s" }} /> Quick Access</button><button className="sm" onClick={toggleFull}><Maximize size={15} /> {gfull ? "Exit full screen" : "Fullscreen"}</button></div>
          <div className={"gqa" + (qa ? " open" : "")} aria-hidden={!qa}><div className="gqa-in"><div className="gqa-grid">
            <div className="geqrow"><b>Equation</b><form className="row" onSubmit={e => { e.preventDefault(); addEq(inp); }}><input className="grow" value={inp} onChange={e => setInp(e.target.value)} placeholder="Add an equation" aria-label="Quick equation" /><button className="sm primary">Plot</button></form><div className="row">{eqs.slice(0, 8).map(e => <button key={e.id} className={"sm" + (e.show ? "" : " ghost")} style={{ borderColor: e.color }} onClick={() => upd(e.id, { show: !e.show })} aria-pressed={e.show}>{e.src.length > 14 ? e.src.slice(0, 13) + "…" : e.src}</button>)}</div></div>
            {GridUI}{AnimUI}
            <div className="geqrow"><b>Shade and inspect</b><label className="row"><input type="checkbox" checked={fillOn} onChange={e => setFillOn(e.target.checked)} /> Show shading</label><label className="row"><input type="checkbox" checked={tangent} onChange={e => setTangent(e.target.checked)} /> Tangent at traced point</label><button className="sm" onClick={() => { setSvTab("ar"); setSv(true); }}>Area tools</button><span className="mut gread">{traceInfo ? `(${lab(traceInfo.x)}, ${lab(traceInfo.y)}) slope ${lab(traceInfo.m)}` : "Use the point tool to inspect"}</span></div>
            {ExportUI}</div></div></div>
          <div className="gbar"><span className="mut" style={{ fontSize: 12 }}>{mode === "pan" || mode === "trace" ? "Navigate" : "Draw"}:</span>{tools.map(([k, I, l]) => <button key={k} className={"ib" + (mode === k ? " on" : "")} data-tip={l} aria-label={l} aria-pressed={mode === k} onClick={() => setMode(k)}><I size={17} /></button>)}
            <input type="color" value={col} onChange={e => setCol(e.target.value)} aria-label="Annotation colour" />
            <button className="ib" aria-label="Undo" onClick={() => { const h = hist.current.pop(); if (h) { fut.current.push(ann); setAnn(h); } }}><Undo2 size={17} /></button><button className="ib" aria-label="Redo" onClick={() => { const h = fut.current.pop(); if (h) { hist.current.push(ann); setAnn(h); } }}><Redo2 size={17} /></button>
            <button className="sm" disabled={!ann.length} onClick={() => confirm("Clear all annotations? Equations and shading stay.") && (hist.current.push(ann), setAnn([]))}>Clear annotations</button>
            {trace && <button className="sm" onClick={() => { const y = traceInfo?.y; if (y === undefined) return; hist.current.push(ann); setAnn(a => [...a, { k: "pt", pts: [[trace.x, y]], c: col }]); }}><Pin size={14} /> Pin point</button>}{trace && <button className="sm" onClick={() => setTrace(null)}>Hide point</button>}<span className="sp" /><span ref={ro} className="mut gread" aria-live="off">x = 0, y = 0</span></div></div>
        <aside className="card gr"><h3>Parameters</h3>
          {params.length === 0 && <p className="mut">No parameters. Use letters a b c d k m n p q in an equation, e.g. y = a*sin(bx), to get sliders.</p>}
          {params.map(k => { const q = P(k); return <div key={k} className="geqrow"><div className="row" style={{ justifyContent: "space-between" }}><b>{k} = {lab(q.v)}</b><button className="sm" onClick={() => set(k, { v: k === "a" || !"bc".includes(k) ? 1 : 0 })}>Reset</button></div>
            <input type="range" style={{ width: "100%" }} min={q.min} max={q.max} step={0.1} value={q.v} onChange={e => set(k, { v: +e.target.value })} aria-label={"Parameter " + k} />
            <div className="row"><input type="number" style={{ width: 70 }} value={q.min} onChange={e => +e.target.value < q.max && set(k, { min: +e.target.value })} aria-label="Minimum" /><input type="number" style={{ width: 70 }} value={q.max} onChange={e => +e.target.value > q.min && set(k, { max: +e.target.value })} aria-label="Maximum" /></div></div>; })}
          <h3>Animate</h3>{AnimUI}</aside>
      </div>
      <details className="card gdata" open><summary><b>Data table</b> <small className="mut">{pts.length} valid point{pts.length === 1 ? "" : "s"}</small></summary>
        <div className="row" style={{ margin: "10px 0" }}><label className="btn sm"><Upload size={14} /> Import CSV<input className="sr" type="file" accept=".csv,.txt,text/csv" onChange={e => { importCsv(e.target.files?.[0]); e.target.value = ""; }} /></label>
          <label className="row"><input type="checkbox" checked={connect} onChange={e => setConnect(e.target.checked)} /> Connect points</label><label className="row"><input type="checkbox" checked={bar} onChange={e => setBar(e.target.checked)} /> Bar chart</label><button className="sm" onClick={() => setRows(r => [...r, { x: "", y: "" }])}><Plus size={14} /> Row</button><button className="sm" onClick={() => setRows([{ x: "", y: "" }])}>Clear data</button></div>
        <div className="grows">{rows.slice(0, 200).map((r, i) => <div key={i} className="row">{(["x", "y"] as const).map(k => <input key={k} placeholder={k} className={r[k] !== "" && isNaN(num(r[k])) ? "bad" : ""} value={r[k]} aria-label={`${k} row ${i + 1}`} onChange={e => setRows(q => q.map((z, j) => (j === i ? { ...z, [k]: e.target.value } : z)))} />)}<button className="ib" aria-label="Remove row" onClick={() => setRows(q => (q.length > 1 ? q.filter((_, j) => j !== i) : [{ x: "", y: "" }]))}><X size={14} /></button></div>)}</div>
        {rows.length > 200 && <small className="mut">Showing the first 200 of {rows.length} rows; all valid rows are plotted.</small>}</details>
      <div className={"sv-scrim" + (sv ? " open" : "")} onClick={() => setSv(false)} />
      <aside className={"sv" + (sv ? " open" : "")} role="dialog" aria-label="Smart View" aria-hidden={!sv}>
        <div className="sv-head"><b>Smart View</b><span className="sp" /><button className="ib" aria-label="Close Smart View" onClick={() => setSv(false)}><X size={18} /></button></div>
        <div className="sv-tabs" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={svTab === k} className={"sm" + (svTab === k ? " primary" : "")} onClick={() => setSvTab(k)}>{l}</button>)}</div>
        <div className="sv-body">{svTab === "eq" && <>{EqList(true)}</>}{svTab === "sh" && ShadeUI}{svTab === "ar" && <>{AreaUI}{RegionUI}</>}{svTab === "an" && AnalysisUI}{svTab === "gr" && <>{GridUI}<div className="geqrow">{GridCard}</div></>}{svTab === "am" && AnimUI}{svTab === "pr" && PresUI}{svTab === "ex" && ExportUI}</div>
      </aside>
    </div>
  );
}
