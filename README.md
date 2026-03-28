# Acadomi

AI-powered personalized learning platform (Final Year Project). Monorepo layout for GitHub and deployment.

## Repository layout

| Path | Role |
|------|------|
| `frontend/` | Next.js (App Router, Tailwind v4) — UI |
| `backend/` | Express + MongoDB + **Google Gemini** (uploads & auth) |
| `python/services/podcast/` | Flask microservice: Gemini dialogue script + gTTS audio (port 5001) |

## Prerequisites

- **Node.js** 20+ (see `.nvmrc`)
- **MongoDB Atlas** (or local Mongo via Docker Compose)
- **Google AI Studio** API key for Gemini (`GEMINI_API_KEY` in `backend/.env`)

## Environment (backend)

Copy `backend/.env.example` to `backend/.env` and set:

| Variable | Purpose |
|----------|---------|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Long random string for signing login tokens |
| `GEMINI_API_KEY` | Gemini API key (server-only) |
| `FRONTEND_URL` | Next.js origin for CORS (e.g. `http://localhost:3000`) |
| `GEMINI_MODEL` | Optional; defaults to `gemini-2.5-flash` |
| `PODCAST_SERVICE_URL` | Base URL of the Python podcast API (default `http://127.0.0.1:5001`) |

Never commit `.env`.

## Environment (frontend)

Copy `frontend/.env.example` to `frontend/.env.local` if your API is not on `http://localhost:4000`:

```
NEXT_PUBLIC_API_URL=http://localhost:4000
```

## Install

From the repository root:

```bash
npm install
```

## Run (development)

**Backend** (http://localhost:4000):

```bash
npm run dev:backend
```

**Frontend** (http://localhost:3000):

```bash
npm run dev
```

Health check: [http://localhost:4000/health](http://localhost:4000/health) — should show `database: connected` and `gemini: configured` when env is set.

### Podcast service (optional)

Podcast generation calls a small Python app (separate process). The **Express API forwards** `GEMINI_API_KEY` (and optional `GEMINI_MODEL`) from `backend/.env`, so you usually do **not** need a second key in `python/services/podcast/.env`. Install **ffmpeg** so `pydub` can merge audio. If your interpreter is **Python 3.13+**, `requirements.txt` installs **`audioop-lts`** (stdlib `audioop` was removed; without it pydub errors on `audioop` / `pyaudioop`).

```bash
cd python/services/podcast
py -3.12 -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

From the repo root (after the venv exists): `npm run dev:podcast`. The Node API must reach it (`PODCAST_SERVICE_URL` in `backend/.env`).

## Current features (this milestone)

- **Auth:** Register, login (JWT in `localStorage`), profile & password on **Settings**.
- **Uploads (max 7 per user):** PDF (text via `pdf-parse`), images & audio via **Gemini**; optional prompt; stored extracted text + Gemini “processed notes” in MongoDB.
- **Podcast mode:** Pick a **completed** upload; backend calls the Python service (Gemini script + gTTS), stores **MP3 in MongoDB GridFS**, lists **Your podcasts** with replay and delete.
- **Navigation:** Dashboard, Uploads, Podcast mode, Settings, and platform roadmap links.

## Production build

```bash
npm run build:frontend
npm run build:backend
```

## Local MongoDB (optional)

```bash
docker compose up -d
```

## Troubleshooting

- **Backend exits on startup with `ENOENT` … `05-versions-space.pdf`:** the `pdf-parse` package root `index.js` runs a debug block under ESM. This project imports `pdf-parse/lib/pdf-parse.js` instead (see `backend/src/services/pdfText.ts`).
- **Browser console `chrome-extension://invalid`:** comes from a browser extension, not Acadomi — safe to ignore.
- **`ERR_CONNECTION_REFUSED` to port 4000:** the API is not running; start the backend with `npm run dev:backend`.
- **`JWT_SECRET not set` or auth returns 500:** add `JWT_SECRET=...` to `backend/.env`. The API reads it **on each request** (not at import time) so it stays in sync after `dotenv` loads. Check `/health` — `jwt` should be `"configured"`.
- **Podcast service `WinError 2` / ffprobe not found:** install a full **FFmpeg** build (includes **ffprobe**), add its `bin` folder to PATH, and restart the terminal. Or set **`ACADOMI_FFMPEG`** in `python/services/podcast/.env` to the full path of `ffmpeg.exe` (see `python/services/podcast/README.md`).

## Security

- Rotate credentials if they were ever exposed.
- Do not commit secrets; use `.env` locally and platform env vars in deployment.

## License

Private / academic use — adjust as required by your institution.
