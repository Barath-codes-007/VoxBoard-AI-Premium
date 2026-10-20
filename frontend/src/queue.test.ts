import { expect, test } from "vitest";
import { makeQueue } from "./queue";
test("dedupes", () => { const q = makeQueue(); expect(q(" hi ")).toBe("hi"); expect(q("HI")).toBeNull(); expect(q("")).toBeNull(); expect(q("next")).toBe("next"); });
