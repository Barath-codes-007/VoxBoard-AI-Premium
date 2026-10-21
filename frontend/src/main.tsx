import { createRoot } from "react-dom/client";
import App from "./App";
import { API_BASE } from "./store";

// Send relative /api calls to the configured backend (needed when the frontend is a separate static site).
if (API_BASE) { const f = window.fetch.bind(window); window.fetch = (i: RequestInfo | URL, init?: RequestInit) => (typeof i === "string" && i.startsWith("/api") ? f(API_BASE + i, init) : f(i, init)); }
createRoot(document.getElementById("root")!).render(<App />);
