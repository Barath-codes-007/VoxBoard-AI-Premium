// Pure layout helpers for the board: text wrapping, automatic page flow, list formatting and rotated-image geometry.
export const LH = 1.3, ASC = 0.95;
export type Line = { text: string; indent: number };
const MARK = /^(•|\d+\.)\s/;

export function wrapLines(text: string, maxW: number, measure: (s: string) => number): Line[] {
  const out: Line[] = [];
  for (const para of text.split("\n")) {
    const mk = MARK.exec(para), hang = mk ? measure(mk[0]) : 0; let cur = "", first = true;
    const push = () => { out.push({ text: cur, indent: first ? 0 : hang }); first = false; cur = ""; };
    const room = () => maxW - (first ? 0 : hang);
    for (const word of para.split(" ")) {
      const test = cur ? cur + " " + word : word;
      if (cur === "" || measure(test) <= room()) { cur = test; if (measure(cur) > room() && cur.length > 1) { // one very long word: break it by characters
        let piece = ""; for (const ch of cur) { if (piece && measure(piece + ch) > room()) { const keep = cur; cur = piece; push(); piece = ch; cur = keep; } else piece += ch; } cur = piece; } }
      else { push(); cur = word; }
    }
    push();
  }
  return out;
}

export function applyList(text: string, s0: number, s1: number, kind: "b" | "n") {
  const a = text.lastIndexOf("\n", s0 - 1) + 1; let b = text.indexOf("\n", s1); if (b < 0) b = text.length;
  const lines = text.slice(a, b).split("\n"), re = kind === "b" ? /^•\s/ : /^\d+\.\s/;
  const on = lines.every(l => re.test(l)), strip = (l: string) => l.replace(MARK, "");
  const block = lines.map((l, i) => (on ? strip(l) : (kind === "b" ? "• " : `${i + 1}. `) + strip(l))).join("\n");
  return { text: text.slice(0, a) + block + text.slice(b), s0: a, s1: a + block.length };
}

type FlowPage = { objs: any[] };
export function flowText<P extends FlowPage>(pages: P[], cur: number, text: string, o: { size: number; color: string; measure: (s: string, size: number) => number; newPage: (n: number) => P; W: number; H: number; margin: number; t0?: number }) {
  const lh = Math.round(o.size * LH), bw = o.W - 2 * o.margin, ps = [...pages]; let ci = cur;
  let rest = wrapLines(text, bw, s => o.measure(s, o.size)).map(l => l.text), first = true;
  while (rest.length) {
    const pg = ps[ci], trs = pg.objs.filter(x => x.k === "text" && x.tr);
    let top = o.margin; for (const t of trs) top = Math.max(top, t.p[0][1] - t.w * ASC + (t.fh ?? lh) + Math.round(lh * 0.25));
    let avail = Math.floor((o.H - o.margin - top) / lh); if (avail < 1 && !trs.length) avail = 1;
    if (avail < 1) { ps.splice(ci + 1, 0, o.newPage(ps.length + 1)); ci++; continue; }
    const take = rest.slice(0, avail); rest = rest.slice(avail);
    ps[ci] = { ...pg, objs: [...pg.objs, { k: "text", c: o.color, w: o.size, p: [[o.margin, top + o.size * ASC]], text: take.join(" "), bw, tr: true, fh: take.length * lh, t0: first ? o.t0 : undefined }] }; first = false;
    if (rest.length) { ps.splice(ci + 1, 0, o.newPage(ps.length + 1)); ci++; }
  }
  return { pages: ps, cur: ci };
}

// ---- rotated image geometry (object p = [top-left, bottom-right] before rotation, rot in radians about the centre) ----
type ImgO = { p: number[][]; rot?: number; crop?: number[] };
export const center = (o: ImgO) => [(o.p[0][0] + o.p[1][0]) / 2, (o.p[0][1] + o.p[1][1]) / 2];
export const rotPt = (x: number, y: number, cx: number, cy: number, a: number) => { const c = Math.cos(a), s = Math.sin(a), dx = x - cx, dy = y - cy; return [cx + dx * c - dy * s, cy + dx * s + dy * c]; };
const half = (o: ImgO) => [Math.abs(o.p[1][0] - o.p[0][0]) / 2, Math.abs(o.p[1][1] - o.p[0][1]) / 2];
export function imgCorners(o: ImgO): number[][] { const [cx, cy] = center(o), [hw, hh] = half(o), a = o.rot || 0; return [[-hw, -hh], [hw, -hh], [-hw, hh], [hw, hh]].map(q => rotPt(cx + q[0], cy + q[1], cx, cy, a)); }
export const rotHandle = (o: ImgO) => { const [cx, cy] = center(o), [, hh] = half(o); return rotPt(cx, cy - hh - 40, cx, cy, o.rot || 0); };
export function imgHit(o: ImgO, x: number, y: number) { const [cx, cy] = center(o), [hw, hh] = half(o), u = rotPt(x, y, cx, cy, -(o.rot || 0)); return Math.abs(u[0] - cx) <= hw && Math.abs(u[1] - cy) <= hh; }
// Drag a corner handle (0 TL, 1 TR, 2 BL, 3 BR): opposite corner stays fixed, aspect ratio is kept, so it behaves as a zoom.
export function imgResize(o: ImgO, h: number, pt: number[]): number[][] {
  const [cx, cy] = center(o), [hw, hh] = half(o), a = o.rot || 0, ax = h % 2 === 0 ? hw : -hw, ay = h < 2 ? hh : -hh, dx = h % 2 === 0 ? -1 : 1, dy = h < 2 ? -1 : 1;
  const u = rotPt(pt[0], pt[1], cx, cy, -a), lx = u[0] - cx, ly = u[1] - cy;
  const s = Math.max(20 / (2 * hw || 1), Math.max(Math.abs(lx - ax) / (2 * hw || 1), Math.abs(ly - ay) / (2 * hh || 1))), w = 2 * hw * s, hgt = 2 * hh * s;
  const [nx, ny] = rotPt(cx + ax + (dx * w) / 2, cy + ay + (dy * hgt) / 2, cx, cy, a);
  return [[nx - w / 2, ny - hgt / 2], [nx + w / 2, ny + hgt / 2]];
}
// Crop to a local rectangle r = [x0, y0, x1, y1] (relative to the image centre, in board units).
export function cropApply(o: ImgO, r: number[]) {
  const [cx, cy] = center(o), [hw, hh] = half(o), cr = o.crop || [0, 0, 1, 1];
  const x0 = Math.max(-hw, Math.min(r[0], r[2])), x1 = Math.min(hw, Math.max(r[0], r[2])), y0 = Math.max(-hh, Math.min(r[1], r[3])), y1 = Math.min(hh, Math.max(r[1], r[3]));
  const crop = [cr[0] + ((x0 + hw) / (2 * hw)) * cr[2], cr[1] + ((y0 + hh) / (2 * hh)) * cr[3], ((x1 - x0) / (2 * hw)) * cr[2], ((y1 - y0) / (2 * hh)) * cr[3]];
  const [gx, gy] = rotPt(cx + (x0 + x1) / 2, cy + (y0 + y1) / 2, cx, cy, o.rot || 0), w = x1 - x0, h = y1 - y0;
  return { p: [[gx - w / 2, gy - h / 2], [gx + w / 2, gy + h / 2]], crop };
}
export function cropReset(o: ImgO, nw: number, nh: number) {
  const [cx, cy] = center(o), [hw] = half(o), cr = o.crop || [0, 0, 1, 1], k = (2 * hw) / (cr[2] * nw), w = nw * k, h = nh * k;
  return { p: [[cx - w / 2, cy - h / 2], [cx + w / 2, cy + h / 2]] };
}
