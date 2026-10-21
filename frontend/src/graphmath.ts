// Numerical helpers. Everything here is an approximation and is reported as such in the UI.
type F1 = (x: number) => number;
const bisect = (f: F1, a: number, b: number) => { let fa = f(a); for (let i = 0; i < 70; i++) { const m = (a + b) / 2, fm = f(m); if (!isFinite(fm)) return NaN; if (fa < 0 === fm < 0) { a = m; fa = fm; } else b = m; } return (a + b) / 2; };
const dedupe = (a: number[]) => a.sort((p, q) => p - q).filter((x, i, r) => i === 0 || Math.abs(x - r[i - 1]) > 1e-7);
export function roots(f: F1, x0: number, x1: number, n = 2000): number[] {
  const out: number[] = []; let px = x0, py = f(x0);
  for (let i = 1; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n, y = f(x);
    if (isFinite(py) && isFinite(y)) { if (py === 0) out.push(px); else if (py * y < 0) { const r = bisect(f, px, x); if (isFinite(r) && Math.abs(f(r)) < 1e-6 * Math.max(1, Math.abs(py), Math.abs(y))) out.push(r); } }
    px = x; py = y; }
  if (isFinite(py) && py === 0) out.push(px); return dedupe(out);
}
export const intersections = (f: F1, g: F1, x0: number, x1: number) => roots(x => f(x) - g(x), x0, x1);
export function extrema(f: F1, x0: number, x1: number) {
  const h = (x1 - x0) * 1e-5, d = (x: number) => (f(x + h) - f(x - h)) / (2 * h);
  return roots(d, x0 + 2 * h, x1 - 2 * h).map(x => { const dd = f(x + 10 * h) + f(x - 10 * h) - 2 * f(x); return { x, y: f(x), kind: dd > 0 ? "minimum" : dd < 0 ? "maximum" : "stationary point" }; }).filter(e => isFinite(e.y));
}
export function areaBetween(f: F1, g: F1, lo: number, hi: number, n = 2000) {
  if (!(hi > lo) || !isFinite(lo + hi)) return { signed: NaN, geometric: NaN, reliable: false };
  const h = (hi - lo) / n, v: number[] = []; let maxAbs = 0, jump = 0, ok = true;
  for (let i = 0; i <= n; i++) { const d = f(lo + i * h) - g(lo + i * h); if (!isFinite(d)) { ok = false; break; } v.push(d); maxAbs = Math.max(maxAbs, Math.abs(d)); if (i) jump = Math.max(jump, Math.abs(d - v[i - 1])); }
  if (!ok || maxAbs > 1e6 || (jump > 0.5 * maxAbs && maxAbs > 50)) return { signed: NaN, geometric: NaN, reliable: false };
  const simpson = (fn: (d: number) => number) => { let s = fn(v[0]) + fn(v[n]); for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * fn(v[i]); return (s * h) / 3; };
  return { signed: simpson(d => d), geometric: simpson(Math.abs), reliable: true };
}

const r8 = (x: number) => +x.toPrecision(8);
export function asymptotes(f: F1, x0: number, x1: number) {
  const n = 4000, span = x1 - x0, xs: number[] = [], ys: number[] = [];
  for (let i = 0; i <= n; i++) { const x = x0 + (span * i) / n; xs.push(x); ys.push(f(x)); }
  const grows = (x: number, dir: number) => { const d1 = span * 2e-3, v = [d1, d1 / 100, d1 / 1e4].map(d => { const y = f(x + dir * d); return isFinite(y) ? Math.abs(y) : NaN; }); return v.every(isFinite) && v[2] > 10 && v[1] > 1.4 * v[0] && v[2] > 1.4 * v[1]; };
  const found: number[] = [];
  for (let i = 1; i < n; i++) {
    const a = ys[i - 1], b = ys[i], c = ys[i + 1];
    if (isFinite(b) && (!isFinite(a) || !isFinite(c))) { // domain edge: bisect to the last finite point
      const other = !isFinite(a) ? xs[i - 1] : xs[i + 1]; let g = xs[i], bad = other; for (let k = 0; k < 60; k++) { const m = (g + bad) / 2; if (isFinite(f(m))) g = m; else bad = m; }
      if (grows(g, other < xs[i] ? 1 : -1)) found.push(Math.abs(g) < 1e-9 * span ? 0 : r8(g));
    } else if (isFinite(a) && isFinite(b) && isFinite(c) && Math.abs(b) > 20 && Math.abs(b) >= Math.abs(a) && Math.abs(b) >= Math.abs(c)) { // local peak of |f|: refine
      let lo = xs[i - 1], hi = xs[i + 1]; const g = (x: number) => { const y = Math.abs(f(x)); return isFinite(y) ? y : 0; };
      for (let k = 0; k < 90; k++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (g(m1) < g(m2)) lo = m1; else hi = m2; }
      const p = (lo + hi) / 2; if (grows(p, 1) || grows(p, -1)) found.push(Math.abs(p) < 1e-9 * span ? 0 : r8(p));
    }
  }
  const vertical = found.sort((p, q) => p - q).filter((x, i, r) => i === 0 || Math.abs(x - r[i - 1]) > 1e-6 * span);
  const side = (sg: number) => {
    const [a, b, c] = [1e3, 1e5, 1e7].map(m => f(sg * m));
    if ([a, b, c].every(isFinite) && Math.abs(c - b) < 1e-4 * (1 + Math.abs(c)) && Math.abs(b - a) < 1e-2 * (1 + Math.abs(b))) return { h: r8(c) };
    const m = (f(sg * 2e6) - f(sg * 1e6)) / (sg * 1e6), c0 = f(sg * 1e6) - m * sg * 1e6;
    if (isFinite(m) && isFinite(c0) && Math.abs(m) > 1e-6 && Math.abs(f(sg * 1e7) - (m * sg * 1e7 + c0)) < 1e-3 * (1 + Math.abs(f(sg * 1e7)))) return { m: r8(m), c: r8(c0) };
    return {};
  };
  return { vertical, left: side(-1), right: side(1) };
}
export function domainRange(f: F1, x0: number, x1: number) {
  const n = 4000, intervals: [number, number][] = []; let start: number | null = null, prev = x0, mn = Infinity, mx = -Infinity;
  for (let i = 0; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n, y = f(x);
    if (isFinite(y)) { if (start === null) start = x; mn = Math.min(mn, y); mx = Math.max(mx, y); } else if (start !== null) { intervals.push([start, prev]); start = null; }
    prev = x; }
  if (start !== null) intervals.push([start, prev]);
  for (const e of extrema(f, x0, x1)) { mn = Math.min(mn, e.y); mx = Math.max(mx, e.y); }
  const rightTail = isFinite(f(1e6)), leftTail = isFinite(f(-1e6)); let below = false, above = false;
  for (const t of [1e6, -1e6]) { const y = f(t); if (isFinite(y)) { if (y > 1e5) above = true; if (y < -1e5) below = true; mn = Math.min(mn, y); mx = Math.max(mx, y); } }
  for (const p of asymptotes(f, x0, x1).vertical) for (const d of [1e-7, -1e-7]) { const y = f(p + d); if (isFinite(y)) { if (y > 1e5) above = true; if (y < -1e5) below = true; } }
  return { intervals, leftTail, rightTail, min: isFinite(mn) ? mn : NaN, max: isFinite(mx) ? mx : NaN, unboundedBelow: below, unboundedAbove: above };
}
