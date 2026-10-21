import { expect, test } from "vitest";
import { compile } from "./mathparse";
import { asymptotes, domainRange } from "./graphmath";
import { regionArea } from "./region";
const ex = (f: (x: number) => number) => (x: number, y: number) => { const q = f(x); return isFinite(q) ? y - q : NaN; };
const v = { x0: -5, x1: 5, y0: -5, y1: 5 };
test("parametric, polar and piecewise parse", () => {
  const c = compile("(2cos(t), 2sin(t))"); expect(c.kind).toBe("param"); expect(c.fx!(0, 0, {})).toBeCloseTo(2); expect(c.fy!(Math.PI / 2, 0, {})).toBeCloseTo(2);
  expect(compile("x = t^2, y = t - 1, t in [-2, 2]").t0).toBe(-2); expect(compile("r = 1 + cos(θ)").fn(0, 0, {})).toBe(2);
  const p = compile("y = {x < 0: -x; x >= 0: x^2}"); expect(p.fn(-3, 0, {})).toBe(3); expect(p.fn(3, 0, {})).toBe(9); expect(compile("{x < 0: 1}").fn(2, 0, {})).toBeNaN();
  for (const bad of ["y = t + x", "(x, t)", "y = {x < 0}", "r = x", "(cos(t), sin(t)), t in [5, 1]"]) expect(() => compile(bad)).toThrow();
});
test("asymptotes, domain and range", () => {
  expect(asymptotes(x => 1 / x, -10, 10).vertical).toEqual([0]); expect(asymptotes(x => (x * x + 1) / (x - 1), -10, 10).right.m).toBeCloseTo(1, 3);
  expect(asymptotes(Math.tan, -3, 3).vertical.length).toBe(2); expect(asymptotes(x => x * x, -10, 10).vertical).toEqual([]);
  const d = domainRange(x => x * x, -5, 5); expect(d.min).toBeCloseTo(0, 6); expect(d.unboundedAbove).toBe(true); expect(d.unboundedBelow).toBe(false);
});
test("bounded regions", () => {
  expect(regionArea([ex(x => x * x), ex(x => x)], v, 800, 800, [0.5, 0.4]).area).toBeCloseTo(1 / 6, 2);
  expect(regionArea([x => x, ex(x => x * x), ex(() => 4)], v, 800, 800, [0.5, 2]).area).toBeCloseTo(16 / 3, 1);
  expect(regionArea([ex(x => x * x)], v, 800, 800, [0, 3]).status).toBe("unbounded");
});
