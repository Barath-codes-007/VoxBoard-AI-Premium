// Provider abstraction: swap BrowserSpeech for a cloud STT later.
export interface SpeechProvider { start(lang: string): void; stop(): void; supported: boolean }
export function browserSpeech(onInterim: (t: string) => void, onFinal: (t: string) => void, onError: (m: string) => void, onEnd: () => void): SpeechProvider {
  const W: any = window; const SR = W.SpeechRecognition || W.webkitSpeechRecognition; let rec: any;
  return {
    supported: !!SR,
    start(lang) {
      if (!SR) return onError("Speech recognition is not supported in this browser. Use Chrome or Edge, or type text manually.");
      rec = new SR(); rec.lang = lang; rec.continuous = true; rec.interimResults = true;
      rec.onresult = (e: any) => { let i = ""; for (let k = e.resultIndex; k < e.results.length; k++) { const r = e.results[k]; if (r.isFinal) onFinal(r[0].transcript); else i += r[0].transcript; } onInterim(i); };
      rec.onerror = (e: any) => onError(e.error === "not-allowed" ? "Microphone permission was denied. Allow it in the browser address bar." : "Speech error: " + e.error);
      rec.onend = onEnd; rec.start();
    },
    stop() { try { rec?.stop(); } catch {} },
  };
}
