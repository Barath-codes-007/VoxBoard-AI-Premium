# VoxBoard AI — Speak. Teach. Write. Inspire.

**Lecture Studio edition.** New: Lecture Studio (real microphone recording up to 60 minutes with pause/resume, live level meter, crash recovery from IndexedDB, live transcript where the browser supports it, optional saved-audio transcription through a backend provider), audio player with speed control and click-to-seek transcript, editable transcript with restore-original, bookmarks (Important, Exam Point, Doubt, Homework, Example, Custom) with a timeline, and a Transcript Library.

**Transcription setup.** Live transcription uses the browser's speech service (Chrome/Edge, needs internet, sends audio to the browser vendor). Saved-audio transcription needs a backend provider. In the backend terminal, before `uvicorn`, set (PowerShell): `$env:STT_PROVIDER="openai"; $env:STT_API_KEY="your-key"` (Linux/macOS: `export STT_PROVIDER=openai STT_API_KEY=...`). Any OpenAI-compatible `/audio/transcriptions` API works via `STT_BASE_URL`. Uploads are limited to 25 MB (about 1 hour at the default 32 kbps). The backend does not read `.env` automatically. Costs depend on your provider. Audio stays in the browser unless you press Transcribe.

**Offline transcription (optional).** The backend can use the Vosk engine: `pip install vosk` in the backend venv, install `ffmpeg`, download a model for your language from the Vosk model list, and unzip the folder into `backend/models` (for example `vosk-model-small-en-us-0.15`). Lecture Studio then shows the engine and models and lets you remove a model; in-app model download is not built. Only languages with an installed model work offline, and Vosk does not cover every language. Modes: Online, Offline, Automatic (online when connected and configured, otherwise offline). Recording always works and saves first; transcription is a separate step. Offline transcription is unverified: it was not run here.

**Dual-language notes (optional).** Run a LibreTranslate-compatible server (a copy on this computer works without internet if its language packs are installed) and set `TRANSLATE_URL` (and `TRANSLATE_API_KEY` if needed) before starting the backend. The original transcript is never overwritten; translations are stored separately, flagged outdated when the original changes, and can be edited. Numbers, units, chemical formulas and simple equations are masked with placeholders before translation and restored after; segments where a placeholder is lost are flagged. This is heuristic and not a guarantee.

**Graph Studio.** Equations are parsed by a built-in safe parser (no eval). Supports y = f(x), implicit equations such as x^2 + y^2 = 25, parameters a b c d k m n p q with sliders and animation, several equations, data table and CSV, freehand/point/line/label annotations (hand-drawn curves are not treated as equations), PNG export, and Insert into Smartboard (the rendered image is placed on the page and the graph definition is stored with it; re-opening it for editing is not built). Also: SVG export (same drawing code as PNG), an annotation eraser, Smart draw (a rough stroke is least-squares fitted to a line, quadratic, cubic or circle equation and added as an equation; it is an approximation), a graph-type bar (linear, quadratic, cubic, quartic, absolute value, square root, reciprocal, exponential, logarithm, sine, cosine, tangent, circle, ellipse, hyperbola, sideways parabola) with parameter sliders, a bar-chart option for data, and a move-a-point-along-a-curve tool with Pin point. Inserted graphs keep their definition: select one on the board and press Edit graph, then Update graph on Smartboard. Lecture Studio stays alive in the background once opened, so you can record and move to the board or Graph Studio in the same tab; a small recording bar (pause, resume, bookmark, graph snapshot, stop and save) follows you. While recording, every graph change (equations, parameters, view, annotations) is stored as a state frame; in the recording review, Graph replay redraws the graph from those frames in sync with the audio (frames are sampled about every half second, and very large annotation sets are dropped from a frame). Times are accurate to about a second. Closing the browser tab still ends recording (recovery is offered next time). Not built: replaying individual freehand strokes as they were drawn.

**Board full screen.** The full-screen button in the board header hides the toolbars and shows a small floating toolbar (tools, colour, undo/redo, page arrows, exit). Esc also exits.

**Studio limitations.** Not built: Lesson Time Machine, Lesson Pack export, board snapshots and page links on transcript segments, recording controls on the phone remote. Timestamps are segment level and approximate. Seeking in MediaRecorder audio can be imprecise in some browsers. Recovery is best effort. Audio is not synced between browsers or devices.

**Premium UI edition.** Dark application shell with sidebar navigation, dashboard (search, sort, rename, duplicate, delete), a redesigned smartboard with icon toolbar, voice panel and page thumbnails, plus Import PDF, AI, Mobile Controller, Settings and Help screens. Icons: lucide-react. The AI Assistant screen is informational only; no AI provider is implemented.

Smartboard web app: voice-to-text writing with typing animation, whiteboard tools, multi-page lessons with autosave (SQLite), phone remote (QR + code), PNG/PDF/TXT/JSON export.

**Requires:** Python 3.10+, Node.js 18+, Chrome or Edge (for speech). Windows, macOS, Linux.

## Run (two terminals)
Terminal 1 — backend (PowerShell, inside the extracted `VoxBoard-AI` folder):
```
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --port 8000
```
(Linux/macOS: `source .venv/bin/activate` instead of the Activate line.)

Terminal 2 — frontend:
```
cd frontend
npm install
npm run dev
```
Open http://localhost:5173. Production build: `npm run build` (output in `frontend/dist`).

## Voice
Uses the browser Web Speech API. In Chrome/Edge this sends audio to the browser vendor's cloud service, so it needs internet and is not offline. Microphone works on `localhost` or HTTPS only. No audio is recorded or stored by VoxBoard.

## Pair an Android phone
Click **Pair phone** on the board, then scan the QR code (or open `/#/remote` and type the 6-digit code). The phone must reach the computer: same Wi-Fi, run `npm run dev` (it listens on the network), and allow port 5173 in the firewall. Browsers block the microphone and some features on plain `http://` LAN addresses; for real classroom use put both behind HTTPS (e.g. a reverse proxy or tunnel).

## Optional AI
Copy `.env.example` to `.env`. The `/api/ai` endpoint currently returns a clear "not configured" error; no provider adapter is implemented yet.

## Tests
Backend: `cd backend && pytest tests` — Frontend: `cd frontend && npm test`.

[![Live Demo](https://img.shields.io/badge/Demo-Live%20Preview-brightgreen?style=for-the-badge)](https://voxboard-ai-premium-frontend.onrender.com)

## Known gaps
The AI assistant panel and provider adapter, per-session remote pen settings, remote laser. Undo/redo (Ctrl+Z / Ctrl+Y, 100 steps) covers every change, including moves, resizes, deletes, edits and page changes. Text alignment places the selected text box at the left, centre or right of the page. Imported PDFs are stored as 2x-resolution images inside the lesson (max 150 pages, 100 MB); pictures up to 25 MB are kept at up to 4096 px. The lesson limit is 250 MB, and very large lessons autosave slowly because each save sends the whole lesson. Pairing codes expire after 6 hours.
