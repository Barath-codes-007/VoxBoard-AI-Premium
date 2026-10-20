// Common provider interface: online and offline engines are interchangeable behind it.
export type Mode = "online" | "offline" | "auto";
export type Seg = { start: number; end: number; text: string };
export interface Transcriber { id: "online" | "offline"; label: string; flow: string; ready(info: any, off: any, lang: string): string; run(blob: Blob, lang: string): Promise<Seg[]>; }
const post = async (url: string, blob: Blob, lang: string) => {
  const f = new FormData(); f.append("file", blob, "lecture." + (blob.type.includes("mp4") ? "m4a" : "webm")); f.append("language", lang.split("-")[0]);
  const r = await fetch(url, { method: "POST", body: f }); const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.detail || r.statusText); if (!d.segments?.length) throw new Error("The engine returned no text."); return d.segments as Seg[];
};
export const online: Transcriber = { id: "online", label: "Online provider", flow: "The audio will be uploaded to the transcription service configured on the backend.",
  ready: info => (!navigator.onLine ? "You are offline." : info?.configured ? "" : "No online provider is configured on the backend."), run: (b, l) => post("/api/transcribe", b, l) };
export const offline: Transcriber = { id: "offline", label: "Offline engine", flow: "The audio is processed on the computer running the VoxBoard backend and is not sent to any online service.",
  ready: (_i, o, lang) => (!o?.installed ? "No offline engine (Vosk) is installed on the backend." : !o.ffmpeg ? "ffmpeg is required to convert audio and was not found." : !o.models?.some((m: any) => m.langs.includes(lang.split("-")[0])) ? "No installed model matches this language." : ""), run: (b, l) => post("/api/offline/transcribe", b, l) };
export const choose = (mode: Mode, info: any, off: any, lang: string): { t: Transcriber | null; why: string } => {
  if (mode === "online") { const w = online.ready(info, off, lang); return { t: w ? null : online, why: w }; }
  if (mode === "offline") { const w = offline.ready(info, off, lang); return { t: w ? null : offline, why: w }; }
  const a = online.ready(info, off, lang); if (!a) return { t: online, why: "" };
  const b = offline.ready(info, off, lang); return { t: b ? null : offline, why: b ? `Online: ${a} Offline: ${b}` : "" };
};
