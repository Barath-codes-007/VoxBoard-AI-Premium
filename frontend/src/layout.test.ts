import { expect, test } from "vitest";
import { wrapLines, applyList, flowText, imgCorners, imgResize, cropApply, rotPt, imgHit } from "./layout";
const m = (s: string) => s.length * 10;
test("wraps at the board edge and never exceeds the width", () => {
  const L = wrapLines("the quick brown fox jumps over the lazy dog", 100, m); expect(L.length).toBeGreaterThan(3); for (const l of L) expect(m(l.text) + l.indent).toBeLessThanOrEqual(100);
  expect(L.map(l => l.text).join(" ")).toBe("the quick brown fox jumps over the lazy dog");
  const long = wrapLines("supercalifragilisticexpialidocious", 100, m); expect(long.length).toBeGreaterThan(2); for (const l of long) expect(m(l.text)).toBeLessThanOrEqual(100);
});
test("list items wrap with a hanging indent and lists toggle", () => {
  const L = wrapLines("• alpha beta gamma delta", 100, m); expect(L[1].indent).toBe(m("• ")); expect(wrapLines("a\nb", 100, m).length).toBe(2);
  expect(applyList("one\ntwo", 0, 7, "b").text).toBe("• one\n• two"); expect(applyList("• one\n• two", 0, 11, "b").text).toBe("one\ntwo");
  expect(applyList("one\ntwo", 0, 7, "n").text).toBe("1. one\n2. two"); expect(applyList("• one", 0, 5, "n").text).toBe("1. one"); expect(applyList("", 0, 0, "b").text).toBe("• ");
});
test("transcript flows down the page and adds pages instead of overflowing", () => {
  let pages: any[] = [{ objs: [] }], cur = 0;
  for (let i = 0; i < 60; i++) { const r = flowText(pages, cur, "this is phrase number " + i + " spoken by the teacher during the lecture", { size: 36, color: "#000", measure: (s, z) => s.length * z * 0.5, newPage: () => ({ objs: [] }), W: 1600, H: 900, margin: 60 }); pages = r.pages; cur = r.cur; }
  expect(pages.length).toBeGreaterThan(2); expect(cur).toBe(pages.length - 1);
  for (const p of pages) for (const o of p.objs) { expect(o.p[0][1] - o.w * 0.95 + o.fh).toBeLessThanOrEqual(900 - 60 + 1); expect(o.p[0][0] + o.bw).toBeLessThanOrEqual(1600); }
  const all = pages.flatMap(p => p.objs.map((o: any) => o.text)).join(" "); for (let i = 0; i < 60; i++) expect(all).toContain("number " + i + " ");
});
test("one phrase longer than a page continues on the next page", () => {
  const r = flowText([{ objs: [] }], 0, ("word ").repeat(2000), { size: 60, color: "#000", measure: (s, z) => s.length * z * 0.5, newPage: () => ({ objs: [] }), W: 1600, H: 900, margin: 60 }); expect(r.pages.length).toBeGreaterThan(2);
});
test("rotated image: resizing keeps the opposite corner fixed and the aspect ratio", () => {
  const o = { p: [[100, 100], [300, 200]], rot: Math.PI / 2 }, c0 = imgCorners(o), p2 = imgResize(o, 3, [c0[3][0] + 60, c0[3][1] + 60]);
  const o2 = { ...o, p: p2 }, c1 = imgCorners(o2); expect(c1[0][0]).toBeCloseTo(c0[0][0], 6); expect(c1[0][1]).toBeCloseTo(c0[0][1], 6);
  expect((p2[1][0] - p2[0][0]) / (p2[1][1] - p2[0][1])).toBeCloseTo(2, 6); expect(p2[1][0] - p2[0][0]).toBeGreaterThan(200);
});
test("hit testing follows the rotation", () => { const o = { p: [[0, 0], [200, 20]], rot: Math.PI / 2 }; expect(imgHit(o, 100, 100)).toBe(true); expect(imgHit(o, 100, 109)).toBe(true); expect(imgHit(o, 100, 115)).toBe(false); expect(imgHit(o, 10, 10)).toBe(false); });
test("crop keeps the visible pixels where they were", () => {
  const o = { p: [[0, 0], [400, 200]], rot: 0 }, r = cropApply(o, [-200, -100, 0, 100]); expect(r.crop).toEqual([0, 0, 0.5, 1]); expect(r.p[1][0] - r.p[0][0]).toBe(200); expect(r.p[0][0]).toBe(0);
  const o2 = { p: r.p, crop: r.crop, rot: 0 }, r2 = cropApply(o2, [-50, -100, 100, 100]); expect(r2.crop[0]).toBeCloseTo(0.125, 9); expect(r2.crop[2]).toBeCloseTo(0.375, 9);
  const rr = { p: [[0, 0], [400, 200]], rot: Math.PI / 2 }, c = cropApply(rr, [-200, -100, 0, 100]); const [cx, cy] = [200, 100], g = rotPt(cx + -100, cy, cx, cy, Math.PI / 2); expect((c.p[0][0] + c.p[1][0]) / 2).toBeCloseTo(g[0], 6); expect((c.p[0][1] + c.p[1][1]) / 2).toBeCloseTo(g[1], 6);
});
