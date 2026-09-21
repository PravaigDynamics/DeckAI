# Decks Branded AI

Uploads a rough PPTX, DOCX, or text file and returns it restructured to
Pravaig's brand guidelines, in the same format. A brand reviewer can accept
the result or correct it in plain language; corrections are folded into a
living Markdown brand reference so the same fix applies automatically next
time. See `PRD_Decks_Branded_AI.docx` for the full product spec.

The system is two parts that run together but stay independent in code:

- **`backend/`** — a normal long-running Node.js/Express server. Does file
  ingestion, calls the model to decide branding changes, applies those
  decisions to generate the output file, and owns the living brand
  reference. PPTX/DOCX processing needs real server resources, so this is
  not built as a serverless function.
- **`frontend/`** — a React app for uploading a file, viewing/downloading
  the branded output, and submitting reviewer corrections. Talks to the
  backend only over HTTP, and is built to be embeddable in another site.

**Model integration is provider-agnostic by design.** The model (Google
Gemini via Google AI Studio, by default) only *decides* branding changes —
wording, tone, structure, hierarchy, layout intent. It never touches file
bytes. The code in `backend/src/fileProcessing/` applies those decisions to
produce the actual DOCX/PPTX/text file. Swapping providers is a config
change (`MODEL_PROVIDER` in `.env`) plus one new file implementing the
`ModelProvider` interface in `backend/src/modelProvider/` — no changes to
file processing or the brand reference logic. See
`backend/src/modelProvider/types.ts` for the interface.

---

## 1. Run it locally (start here)

### Prerequisites

- Node.js 18+ and npm
- A Google AI Studio API key: https://aistudio.google.com/apikey (free tier
  is enough to try this out)

### Backend

```bash
cd backend
npm install
cp .env.example .env
```

Open `backend/.env` and set `GEMINI_API_KEY` to your key. Everything else
has a sensible default (see comments in `.env.example` for what each
variable does — ports, CORS origins, storage paths, model choice, reviewer
list).

Build the initial brand reference from the sample brand documents already
seeded in `backend/brand-source/` (two company-profile PDFs and one
induction PPTX):

```bash
npm run build:reference
```

This reads every file in `backend/brand-source/`, asks the model to
summarize brand-relevant patterns from each, and appends the result to
`backend/data/brand-reference.md` (created on first run). It's safe to run
again later — only new or changed files in `brand-source/` are processed,
so it never re-does work or overwrites what's already there. Add more
brand material to that folder any time and re-run this command to fold it
in (see "Where this extends" below for automating that).

Start the server:

```bash
npm run dev
```

It listens on `http://localhost:4000` by default. Check
`http://localhost:4000/api/health` to confirm it's up.

### Frontend

In a second terminal:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:5173`. Upload a `.docx`, `.pptx`, or `.txt` file,
wait for the branded draft, and download it. Then try submitting a
correction (any reviewer name from `REVIEWERS` in `backend/.env`, default
`Monika` or `Ram`) — it's appended to `backend/data/brand-reference.md`
immediately, and you can re-upload the same file to see the correction
applied.

### Troubleshooting

- **"Model provider is not configured"** — `GEMINI_API_KEY` is missing or
  empty in `backend/.env`.
- **"Unsupported file type"** — only `.docx`, `.pptx`, and `.txt` are
  accepted in this build.
- **CORS errors in the browser console** — make sure `CORS_ORIGINS` in
  `backend/.env` includes the origin the frontend is actually served from.

---

## 2. Deploy to DigitalOcean

This is a second step, after you've confirmed the app works locally.

### Backend — DigitalOcean App Platform (or a Droplet)

1. Push this repo to a Git provider DigitalOcean can read (GitHub/GitLab).
2. In DigitalOcean App Platform, create a new app from the repo, pointing
   the component at the `backend/` directory.
   - Build command: `npm install && npm run build`
   - Run command: `npm start`
   - HTTP port: value of `PORT` (default `4000`)
3. Set environment variables in the App Platform dashboard to match
   `backend/.env.example` — at minimum `GEMINI_API_KEY` and `CORS_ORIGINS`
   (set this to your deployed frontend's URL, and the URL of any site
   embedding the widget).
4. Storage: `DATA_DIR`, `BRAND_SOURCE_DIR`, etc. default to paths under the
   backend working directory. App Platform's filesystem is ephemeral across
   deploys — for the brand reference and generated files to survive
   restarts/redeploys, attach a DigitalOcean Volume (Droplet) or migrate
   `brandReference/store.ts` to a managed store (e.g. DO Spaces or a small
   database) before relying on this in production. This is flagged rather
   than solved here since it's a real architectural decision, not a config
   toggle.
5. If you'd rather run on a plain Droplet: install Node, clone the repo,
   `npm install && npm run build` in `backend/`, run with `npm start` behind
   a process manager (pm2/systemd) and a reverse proxy (nginx) for TLS.

### Frontend — DigitalOcean App Platform (Static Site) or any static host

1. Set `VITE_API_BASE_URL` (build-time env var) to your deployed backend's
   URL.
2. Build command: `npm install && npm run build`, output directory: `dist`.
3. Deploy `frontend/dist` as a static site component/app.

---

## 3. Embedding the frontend in another site

The frontend is a normal Vite/React SPA, so the simplest embed is an
`<iframe>` pointed at the deployed frontend URL:

```html
<iframe
  src="https://decks-branded-ai.yourcompany.com"
  style="width:100%; height:800px; border:0;"
  title="Decks Branded AI"
></iframe>
```

This works today with no extra build step, and keeps the widget fully
isolated (styles, JS) from the host page — appropriate for "anyone in the
company can use it" per the PRD. If a tighter, non-iframe embed (a single
`<script>` tag mounting into a host page div) is needed later, that means
building `frontend` in library mode (a Vite `build.lib` config exporting a
`mount(el)` function) instead of the current SPA `index.html` entry — noted
as an extension point, not built here to keep this first pass focused on
the core upload/brand/download/review loop.

---

## What's built vs. stubbed

Built (P0 from the PRD):

- Upload DOCX/PPTX/text, apply the brand reference via the model, return
  the same format, download it.
- Real visual branding on output, not just reworded text: accent color,
  typeface, and confidentiality footer pulled from
  `backend/src/brandReference/brandStyle.ts` (values extracted directly
  from the sample brand PDFs — see that file's comments).
- DOCX and PPTX tables and inline images are extracted and carried through
  to the branded output (tables get header-row shading in the brand accent
  color); previously these were silently dropped and only headings/
  paragraphs/bullets/slide text survived. See
  `backend/src/fileProcessing/docx.ts` and `pptx.ts`.
- Living Markdown brand reference (`backend/data/brand-reference.md`),
  built from `backend/brand-source/` and appended to — never overwritten —
  as that folder grows (`npm run build:reference`, or `POST
  /api/brand-reference/rebuild`).
- Reviewer correction loop: a plain-language correction is turned into a
  Markdown rule and appended to the reference, so it's applied automatically
  on the next document.
- In-app README viewer (`View README` button in the frontend header,
  served from `GET /api/docs/readme`).

Stubbed, with the extension point noted in code:

- **Reference versioning/rollback (P1)** — every append snapshots the prior
  version to `backend/data/brand-reference-versions/`, but there's no
  rollback endpoint/UI yet. See `backend/src/brandReference/store.ts`.
- **Reviewer access control (P1)** — requests are checked against the
  `REVIEWERS` list in config, which is a name match, not real
  authentication. Wiring real auth (SSO/company login) replaces the check
  in `backend/src/routes/review.ts`.
- **Document-type-aware rules (P2)** — the model plans branding per
  document today without distinguishing supplier vs. investor decks, etc.
  `ExtractedDocument`/`BrandingPlan` in `backend/src/modelProvider/types.ts`
  have room to carry a document-type field once this is prioritized.
- **OneDrive/NAS sync** — the PRD describes brand source material living on
  OneDrive, mirrored to a NAS. This build only reads whatever is already in
  `backend/brand-source/` locally; wiring a sync job to populate that folder
  automatically is a separate piece of infrastructure, not implemented
  here.
- **PPTX layout fidelity** — PPTX output is rebuilt fresh per slide (title +
  bullets + tables/images stacked below, with brand-colored
  backgrounds/accents) rather than preserving the original deck's exact
  shape positions and theme. Images and tables ARE now extracted and
  carried through (fixed alongside the same DOCX gap — see
  `backend/src/fileProcessing/pptx.ts`), just re-laid-out generically
  rather than kept at their original coordinates. The model's `layout`
  field (e.g. `chartWidthPercent`, `headingPosition`) is already threaded
  through `BrandingInstruction` for exact placement to build on next.

## Project structure

```
backend/
  src/
    config.ts               # env-driven config, single source of truth
    server.ts                # Express app entry point
    modelProvider/            # provider-agnostic model interface + Gemini impl
    fileProcessing/           # docx/pptx/text extract + generate, format-agnostic apply logic
    brandReference/           # living reference store, builder (from brand-source/), corrections
    routes/                   # HTTP endpoints
    storage/                  # in-memory/on-disk job tracking
    scripts/buildReference.ts # CLI: npm run build:reference
  brand-source/                # drop brand documents here to fold into the reference
  data/                         # brand-reference.md, versions, uploads, generated files (gitignored)
frontend/
  src/
    App.tsx, components/       # upload, download, correction UI
    api.ts                     # backend API client
```
