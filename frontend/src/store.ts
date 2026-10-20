export const pending: { pdf?: File; graph?: { src: string; def: any; replace?: { page: number; idx: number } }; editGraph?: { def: any; page: number; idx: number } } = {};
export const prefs = (): any => { try { return JSON.parse(localStorage.getItem("vb") || "{}"); } catch { return {}; } };
export async function newLesson(): Promise<string> {
  const r = await fetch("/api/lessons", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  if (!r.ok) throw new Error("Backend unavailable"); return (await r.json()).id;
}
export async function openLast(): Promise<string> {
  const r = await fetch("/api/lessons"); const l = r.ok ? await r.json() : []; return l[0]?.id ?? newLesson();
}
