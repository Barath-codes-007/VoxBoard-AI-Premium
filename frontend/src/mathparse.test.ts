import { expect, test } from "vitest";
import { compile } from "./mathparse";
const y = (s: string, x: number, p = {}) => compile(s).fn(x, 0, p);
test("linear", () => expect(y("y = 2x + 3", 2)).toBe(7));
test("quadratic", () => expect(y("x^2", -3)).toBe(9));
test("abs", () => expect(y("y=|x|", -4)).toBe(4));
test("unary minus binds after power", () => expect(y("-x^2", 3)).toBe(-9));
test("e^x", () => expect(y("y = e^x", 0)).toBe(1));
test("division by zero", () => expect(y("1/x", 0)).toBe(Infinity));
test("parameters", () => { const c = compile("y = ax^2 + bx + c"); expect([...c.vars].sort()).toEqual(["a", "b", "c", "x"]); expect(c.fn(2, 0, { a: 1, b: 2, c: 3 })).toBe(11); });
test("circle is implicit", () => { const c = compile("x^2 + y^2 = 25"); expect(c.kind).toBe("implicit"); expect(c.fn(3, 4, {})).toBe(0); });
test("invalid input throws", () => { for (const s of ["2+*", "alert(1)", "y = (x", "sinx", "", "x==1", "constructor"]) expect(() => compile(s)).toThrow(); });

const at = (s: string, x: number, p = {}) => compile(s).fn(x, 0, p);
test("x^2 and x² are the same graph", () => { for (const x of [-3, -0.5, 0, 2, 7]) expect(at("y = x²", x)).toBe(at("y = x^2", x)); });
test("superscripts", () => {
  expect(at("y = x³", 2)).toBe(8); expect(at("y = 2x² + 3x - 4", 2)).toBe(10); expect(at("y = (x + 2)²", 1)).toBe(9);
  expect(at("y = x⁻²", 2)).toBe(0.25); expect(at("y = x^(1/2)", 9)).toBe(3); expect(at("y = √x", 16)).toBe(4);
  expect(at("y = sin(x)^2", Math.PI / 2)).toBeCloseTo(1); expect(at("y = 2x² + 3x²", 2)).toBe(20); expect(at("y = x¹⁰", 2)).toBe(1024); expect(at("y = x⁽⁻¹⁾", 4)).toBe(0.25);
});
test("two relations are rejected with a helpful message", () => { expect(() => compile("y = x² + y² = 25")).toThrow(/circle/); expect(compile("x² + y² = 25").kind).toBe("implicit"); });
test("bad superscripts fail cleanly", () => { expect(() => compile("y = x⁻")).toThrow(); expect(() => compile("y = x⁽²")).toThrow(); });
test("inequalities pick the correct side", () => {
  const h = (s: string, x: number, y: number) => compile(s).holds!(x, y, {});
  expect(h("y > x^2", 0, 1)).toBe(true); expect(h("y > x^2", 0, -1)).toBe(false); expect(h("y > x^2", 1, 1)).toBe(false); expect(h("y >= x^2", 1, 1)).toBe(true);
  expect(h("y < 2x + 1", 0, 0)).toBe(true); expect(h("y ≤ x", 1, 1)).toBe(true); expect(h("y ≥ x²", 0, 0)).toBe(true); expect(h("x > 2", 3, 0)).toBe(true); expect(h("x <= 2", 3, 0)).toBe(false);
  expect(compile("y > x").strict).toBe(true); expect(compile("y >= x").strict).toBe(false);
});
