import { expect, test } from "vitest";
import { protect, restore } from "./protect";
test("masks numbers, units, formulas and equations, then restores them", () => {
  const src = "Solve 2x + 3 = 7 at 25 °C for H2O with 5 kg of NaCl.";
  const { masked, toks } = protect(src);
  expect(masked).not.toMatch(/25|H2O|NaCl|2x/); expect(toks.length).toBeGreaterThan(3);
  const r = restore(masked, toks); expect(r.text).toBe(src); expect(r.ok).toBe(true);
});
test("plain words are left for translation", () => { expect(protect("The teacher explains the lesson").masked).toBe("The teacher explains the lesson"); });
test("detects lost placeholders", () => { const { masked, toks } = protect("Boil at 100 °C"); expect(restore(masked.replace(/XQ\d+X/g, ""), toks).ok).toBe(false); });
