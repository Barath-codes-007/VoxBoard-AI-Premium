export const pending: { pdf?: File; graph?: { src: string; def: any; replace?: { page: number; idx: number } }; editGraph?: { def: any; page: number; idx: number } } = {};
export const prefs = (): any => { try { return JSON.parse(localStorage.getItem("vb") || "{}"); } catch { return {}; } };
export async function newLesson(): Promise<string> {
  const r = await fetch("/api/lessons", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  if (!r.ok) throw new Error("Backend unavailable"); return (await r.json()).id;
}
export async function openLast(): Promise<string> {
  const r = await fetch("/api/lessons"); const l = r.ok ? await r.json() : []; return l[0]?.id ?? newLesson();
}

// Backend location. Empty in development (Vite proxies /api and /ws). On Render, set VITE_API_URL to the web service URL at build time.
export const API_BASE: string = ((import.meta as any).env?.VITE_API_URL || "").replace(/\/$/, "");
export const wsUrl = (path: string) => (API_BASE ? API_BASE.replace(/^http/, "ws") + path : `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${path}`);
