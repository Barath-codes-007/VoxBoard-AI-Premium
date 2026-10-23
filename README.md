# VoxBoard AI — Speak. Teach. Write. Inspire.

**Lecture Studio edition.** New: Lecture Studio (real microphone recording with pause/resume, live level meter, crash recovery from IndexedDB, live transcript where the browser supports it, optional saved-audio transcription through a backend provider), audio player with speed control and click-to-seek transcript, editable transcript with restore-original, bookmarks (Important, Exam Point, Doubt, Homework, Example, Custom) with a timeline, and a Transcript Library.

**Transcription setup.** Live transcription uses the browser's speech service (Chrome/Edge, needs internet, sends audio to the browser vendor). Saved-audio transcription needs a backend provider. In the backend terminal, before `uvicorn`, set (PowerShell): `$env:STT_PROVIDER="openai"; $env:STT_API_KEY="your-key"` (Linux/macOS: `export STT_PROVIDER=openai STT_API_KEY=...`). Any OpenAI-compatible `/audio/transcriptions` API works via `STT_BASE_URL`. Long recordings are split into 20-minute pieces automatically when ffmpeg is installed on the backend (the provider accepts about 25 MB per request). The backend does not read `.env` automatically. Costs depend on your provider. Audio stays in the browser unless you press Transcribe.

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

## Known gaps
The AI assistant panel and provider adapter, per-session remote pen settings, remote laser. Undo/redo (Ctrl+Z / Ctrl+Y, 100 steps) covers every change, including moves, resizes, deletes, edits and page changes. Text alignment places the selected text box at the left, centre or right of the page. Imported PDF pages are stored as images inside the lesson (sharper for shorter PDFs, lighter for very long ones) and pictures are kept at up to 6000 px. Very large lessons save and open slowly because each save sends the whole lesson. Pairing codes expire after 6 hours.


## Deploying on Render (two services)
Backend (Web Service): Root Directory `backend`, Build `pip install -r requirements.txt`, Start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, env `PYTHON_VERSION=3.11.9`. Optional: `CORS_ORIGINS=https://your-frontend.onrender.com`, `STT_*`, `TRANSLATE_URL`.
Frontend (Static Site): Root Directory `frontend`, Build `npm install && npm run build`, Publish Directory `dist`, env `VITE_API_URL=https://your-backend.onrender.com` (no trailing slash). Vite reads it at build time, so after changing it use "Clear build cache & deploy".
Notes: on the free plan the backend sleeps when idle (the first request can take about a minute) and its disk is erased on every redeploy or restart, so lessons and recordings' transcripts stored in SQLite are lost. Use a paid persistent disk and set `VOXBOARD_DB` to a path on it. Audio recordings stay in each user's browser. HTTPS (which Render provides) is required for the microphone.


## Graph Studio update: parsing, shading, Smart View, animation, grid units
- **Equation input:** `x^2` and `x²` are the same; superscripts ⁰–⁹ ⁺ ⁻ ⁽ ⁾ (for example `x⁻²`, `(x + 2)²`, `x¹⁰`), `√x`, `π`, `×`, `÷`, `≤`, `≥` are normalised before parsing (the text you typed is kept). Two relations in one line, such as `y = x² + y² = 25`, are rejected with the correct form `x² + y² = 25`.
- **Inequalities:** `y > f(x)`, `>=`, `<`, `<=`, `≤`, `≥`, `x > a`, and linear inequalities in x and y. Strict boundaries are dashed, inclusive solid. Several regions can be shown as Layers (overlap darker), Intersection only, or Union, each with its own colour and opacity.
- **Area:** between two y = f(x) curves, or a curve and the x-axis, with limits you set. Intersection finder lists crossing points and you confirm the interval. Reported as a numerical approximation (Simpson's rule), both signed and geometric; breaks or unbounded values give "cannot be calculated reliably". Bounded regions: tick any curves plus the x-axis and/or y-axis, press Pick, click inside; the enclosed region is shaded and its area is found numerically (about 0.5% accuracy). This also covers a curve against the y-axis. Regions not enclosed inside the view are refused.
- **Analysis (numerical, visible x range):** roots, y-intercept, turning points, intersections, tangent slope at the traced point. Analysis also estimates vertical, horizontal and slant asymptotes, domain and range numerically for y = f(x) curves (estimates, not proofs; exotic functions can fool them). Also supported: parametric curves `(2cos(t), 2sin(t))` or `x = ..., y = ..., t in [a, b]` (default t from 0 to 2π), polar `r = 1 + cos(θ)` (θ or t), and piecewise `y = {x < 0: -x; 0 <= x < 2: x^2; else: 4}` (up to 8 pieces; line breaks at piece boundaries, open/closed end circles are not drawn).
- **Smart View:** compact button below the graph; slides in from the right on desktop, up as a bottom sheet on phones, wider on large displays. Tabs: Equations, Shade, Area, Analysis, Grid, Animate, Present, Export. Esc or the scrim closes it; background scrolling is locked on phones. It uses the same canvas and state as the main view.
- **Quick Access and Fullscreen** buttons sit below the canvas; Quick Access slides up with equation, grid, animation, shading toggles, inspector and export. Fullscreen uses the browser API with a CSS fallback.
- **Animate:** parameter sweep, curve drawing, point with tangent, and area accumulation, with play/pause, stop and reset, progress slider, speed, loop; one loop at a time, cancelled on pause or leaving the page; reduced-motion users get stepped updates.
- **Grid units:** default 2 for X and Y, editable (0.5, 1, 2, 5 or custom, at least 0.001), reset button, saved with the graph; changing it never changes equations or coordinates. If the spacing is too fine for the zoom, a practical spacing is used.
- **Whiteboard:** Send to Whiteboard inserts the rendered graph (optionally transparent) with its full definition (equations, shading, area, grid units, annotations); Edit graph reopens it. Print opens a clean print view of just the graph with its title, equation list and grid units.
- **Board full screen:** a Full screen button in the board's bottom strip enters a distraction-free workspace with a Quick Access panel that slides up from the bottom (tools, colour, size, undo/redo, Graph Studio, edit graph, export).
- **Tests actually run in this environment:** the equation parser, inequalities, numerical helpers and translation masking (69 + 63 checks, including parametric/polar/piecewise parsing, asymptotes, domain and range, and bounded-region areas) and graph rendering to SVG (56 checks, including parametric, polar, piecewise and region fills: shading sides, dashed vs solid boundaries, intersection/union/layers, area polygon, grid units, transparency, Smart draw fits). Browser interaction (touch, pinch, Smart View animation, fullscreen) and the React build were not run here.


## Smartboard text, lists, images (latest)
- **Text box:** with the Text tool click the board and a dotted box appears where you type directly (Enter for a new line, Esc, Ctrl+Enter or clicking away to finish). Double-click any text to edit it in place. Drag a corner handle to change the box width. Bullets and Numbers work inside the box like a word processor (Enter continues the list, Enter on an empty item ends it) and wrap with a hanging indent.
- **Text size and colour:** in the options strip, the voice panel, the Quick Access panel and Settings; they apply to the transcript, new text boxes and the selected text.
- **Transcript on the board:** speech and typed lines wrap at the board edge, flow down the page, and continue on a new page automatically when a page is full.
- **Images and PDF pages:** select one, then drag the corners to zoom, drag the round handle to rotate (snaps at 90 degrees), use Rotate, Zoom, Fit, Angle, and Crop (drag the crop corners, then Apply crop; Reset crop restores it). The mouse wheel zooms a selected image.
- **Quick Access (board full screen):** now includes all shapes, text size and colour, and list buttons. The full screen view no longer shows a black bar; the area around the board takes the board's colour.
