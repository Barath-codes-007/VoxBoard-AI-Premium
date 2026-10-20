// Tiny store so a recording started in Lecture Studio can be controlled from any page.
import { useSyncExternalStore } from "react";
type S = { st: string; el: number };
let s: S = { st: "READY", el: 0 }; const subs = new Set<() => void>();
export const recStatus = {
  set(n: S) { if (n.st === s.st && Math.floor(n.el) === Math.floor(s.el)) return; s = n; subs.forEach(f => f()); },
  use: () => useSyncExternalStore(cb => { subs.add(cb); return () => { subs.delete(cb); }; }, () => s),
};
export const recCtl: { cur: null | { pause(): void; resume(): void; stop(): void; snap(): void; bm(t: string): void } } = { cur: null };
