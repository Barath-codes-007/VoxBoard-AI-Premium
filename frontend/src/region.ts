// Bounded-region finder: the region is the connected set of grid cells that share the clicked cell's side of every selected boundary.
export type Bound = (x: number, y: number) => number;
export type View = { x0: number; x1: number; y0: number; y1: number };
export function regionMask(bounds: Bound[], v: View, W: number, H: number, cs: number, seed: number[]) {
  const nx = Math.ceil(W / cs), ny = Math.ceil(H / cs), code = new Int32Array(nx * ny), bs = bounds.slice(0, 12);
  for (let j = 0; j < ny; j++) { const y = v.y1 - (((j + 0.5) * cs) / H) * (v.y1 - v.y0); for (let i = 0; i < nx; i++) { const x = v.x0 + (((i + 0.5) * cs) / W) * (v.x1 - v.x0); let c = 0; for (const b of bs) { const f = b(x, y); c = c * 3 + (isNaN(f) ? 2 : f > 0 ? 1 : 0); } code[j * nx + i] = c; } }
  const si = Math.floor(((seed[0] - v.x0) / (v.x1 - v.x0)) * (W / cs)), sj = Math.floor(((v.y1 - seed[1]) / (v.y1 - v.y0)) * (H / cs));
  if (si < 0 || sj < 0 || si >= nx || sj >= ny) return null;
  const want = code[sj * nx + si], mask = new Uint8Array(nx * ny), stack = [sj * nx + si]; mask[sj * nx + si] = 1;
  let count = 0, touches = false, i0 = si, i1 = si, j0 = sj, j1 = sj;
  while (stack.length) { const p = stack.pop()!, i = p % nx, j = (p - i) / nx; count++; if (i === 0 || j === 0 || i === nx - 1 || j === ny - 1) touches = true; i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j);
    for (const q of [i > 0 ? p - 1 : -1, i < nx - 1 ? p + 1 : -1, j > 0 ? p - nx : -1, j < ny - 1 ? p + nx : -1]) if (q >= 0 && !mask[q] && code[q] === want) { mask[q] = 1; stack.push(q); } }
  return { mask, nx, ny, count, touches, bbox: [i0, j0, i1, j1] };
}
export function regionArea(bounds: Bound[], v: View, W: number, H: number, seed: number[]) {
  const cs = 3, m = regionMask(bounds, v, W, H, cs, seed);
  if (!m) return { status: "empty" as const };
  if (m.touches) return { status: "unbounded" as const };
  const dx = ((v.x1 - v.x0) / W) * cs, dy = ((v.y1 - v.y0) / H) * cs, [i0, j0, i1, j1] = m.bbox, pad = 2;
  const fv = { x0: v.x0 + (i0 - pad) * dx, x1: v.x0 + (i1 + 1 + pad) * dx, y1: v.y1 - (j0 - pad) * dy, y0: v.y1 - (j1 + 1 + pad) * dy }, N = 500;
  const f = regionMask(bounds, fv, N, N, 1, seed); if (!f || f.touches) return { status: "unbounded" as const };
  return { status: "ok" as const, area: f.count * ((fv.x1 - fv.x0) / N) * ((fv.y1 - fv.y0) / N) };
}
