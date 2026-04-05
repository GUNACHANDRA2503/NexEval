# NexEval — Step-by-step deployment guide (GitHub → free hosting)

This guide assumes you **only use GitHub** today (no Neon, Render, or static host accounts yet). Follow the sections in order. Hosting can stay on **$0 tiers**; **OpenAI API usage is still paid** per your users’ keys (BYOK in the app).

---

## What you will have at the end

| Piece | Role | Typical free service |
|--------|------|----------------------|
| **Git repo** | Source code | GitHub |
| **PostgreSQL** | App data | [Neon](https://neon.tech) (or Supabase Postgres) |
| **Backend API** | FastAPI + uvicorn | [Render](https://render.com) Web Service (free tier) |
| **Frontend** | Built React app (`dist/`) | [Cloudflare Pages](https://pages.cloudflare.com) or [Netlify](https://netlify.com) |

Your browser will load the **frontend URL**; the app will call the **backend URL** using `VITE_API_BASE` (set when you build the frontend).

---

## Part 1 — Prepare the project on your computer

### 1.1 One-time local config (secrets stay off Git)

The repo **ignores** `backend/config.json` so passwords are not committed.

1. Open a terminal in the project folder `NexEval` (repo root).
2. Run:

   ```bash
   copy backend\config.example.json backend\config.json
   ```

   (On macOS/Linux: `cp backend/config.example.json backend/config.json`.)

3. Edit `backend/config.json` with your **local** Postgres user, password, and database name so `npm run dev` + `uvicorn` still work on your machine.

### 1.2 Confirm the app runs locally (optional but recommended)

```bash
# Terminal A — backend (from backend folder)
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

```bash
# Terminal B — frontend (from frontend folder)
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`, register, create a bug. If that works, you are ready to deploy.

---

## Part 2 — Create the GitHub repository

### 2.1 Create an empty repo on GitHub

1. Log in to [github.com](https://github.com).
2. Click **+** → **New repository**.
3. Choose a name (e.g. `NexEval`).
4. Leave **empty**: do **not** add README, `.gitignore`, or license (you already have these locally).
5. Click **Create repository**.

GitHub will show you commands like `git remote add origin ...`. Keep that page open.

### 2.2 Initialize Git locally and push (first time)

In the **project root** (`NexEval` folder, where `.gitignore` lives):

```bash
git init
git add .
git commit -m "Initial commit: NexEval"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

Replace `YOUR_USERNAME` and `YOUR_REPO` with yours.

**If Git complains that `backend/config.json` is ignored:** that is intentional. Only `backend/config.example.json` is on GitHub. Production uses **environment variables** for the database URL (see Part 4).

---

## Part 3 — Create a free PostgreSQL database (Neon)

### 3.1 Sign up and create a project

1. Go to [neon.tech](https://neon.tech) and sign up (GitHub login is fine).
2. **Create a project** (any region close to you).
3. Create a **database** (default is fine).

### 3.2 Copy the connection string

1. In Neon, open your project → **Connection details** (or **Dashboard**).
2. Copy the **connection string**. It usually looks like:

   `postgresql://USER:PASSWORD@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require`

3. Save it in a password manager or temporary note — you will paste it as `DATABASE_URL` on Render (Part 4). **Never commit this string to GitHub.**

---

## Part 4 — Deploy the backend API on Render

### 4.1 Sign up

1. Go to [render.com](https://render.com) and sign up (GitHub is easiest).

### 4.2 Create a Web Service

1. **Dashboard** → **New +** → **Web Service**.
2. **Connect** your GitHub account if asked, then **select the `NexEval` repository**.
3. Configure:

   | Setting | Value |
   |---------|--------|
   | **Name** | e.g. `nexeval-api` |
   | **Region** | Choose closest to you |
   | **Branch** | `main` |
   | **Root Directory** | `backend` |
   | **Runtime** | **Docker** *or* **Python 3** |

#### Option A — Docker (matches repo `backend/Dockerfile`)

- **Environment**: Docker
- **Dockerfile path**: `Dockerfile` (relative to root directory `backend`, so Render uses `backend/Dockerfile`)

#### Option B — Native Python (no Docker)

- **Runtime**: Python 3
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

4. Choose the **Free** instance type (may sleep after idle; first request can be slow).

### 4.3 Environment variables (required)

In the service → **Environment**, add:

| Key | Value | Notes |
|-----|--------|--------|
| `DATABASE_URL` | Your Neon connection string | Full URL from Part 3 |
| `NEXEVAL_ENV` | `production` | |
| `JWT_SECRET` | Long random string | e.g. 32+ characters; use a generator |
| `CORS_ORIGINS` | Your **frontend** URL(s), comma-separated, **no path** | Example: `https://nexeval.pages.dev` |

**Important:** After you deploy the frontend (Part 5), you will know the exact `https://...` URL. You can:

- Deploy backend first with a **placeholder** `CORS_ORIGINS`, then **update** it after the frontend URL exists, **or**
- Deploy frontend on a **fixed** Pages/Netlify subdomain first, then set `CORS_ORIGINS` to that URL before testing.

### 4.4 Health check (optional but useful)

If Render asks for a health check path, use: `/health`

### 4.5 Deploy and copy your API base URL

1. Click **Create Web Service** and wait for the build to finish.
2. Open the service URL Render gives you, e.g. `https://nexeval-api.onrender.com`.
3. Test in the browser: `https://nexeval-api.onrender.com/health` → should return JSON like `{"status":"ok"}`.

Your **API prefix for the frontend** will be:

```text
https://YOUR-SERVICE.onrender.com/api
```

(no trailing slash). You will use this as `VITE_API_BASE` in Part 5.

---

## Part 5 — Deploy the frontend (static hosting)

The frontend must be **built** with `VITE_API_BASE` pointing at the backend **before** upload, because Vite bakes that value into the JavaScript at build time.

### 5.1 Cloudflare Pages (example)

1. Sign up at [cloudflare.com](https://www.cloudflare.com) → **Pages**.
2. **Create a project** → **Connect to Git** → select your repo.
3. Configure the build:

   | Setting | Value |
   |---------|--------|
   | **Framework preset** | None (or Vite if offered) |
   | **Root directory** | `frontend` |
   | **Build command** | `npm ci && npm run build` |
   | **Build output directory** | `dist` |

4. **Environment variables** (in Pages project → **Settings** → **Environment variables**):

   | Variable name | Value (example) |
   |---------------|-----------------|
   | `VITE_API_BASE` | `https://nexeval-api.onrender.com/api` |

   Use your real Render URL + `/api`.

5. Save and **deploy**. Note the site URL, e.g. `https://nexeval.pages.dev`.

### 5.2 Point CORS at the frontend

1. Go back to **Render** → your Web Service → **Environment**.
2. Set `CORS_ORIGINS` to exactly your Pages URL (scheme + host, no trailing slash):

   `https://nexeval.pages.dev`

3. **Save** and let Render redeploy (or clear cache / restart if needed).

### 5.3 Test end-to-end

1. Open your **frontend** URL in the browser.
2. Open **Developer tools** → **Network**.
3. Register / log in. Requests should go to `https://YOUR-RENDER-HOST/api/...` and return **200**, not CORS errors.
4. Create a bug and confirm it appears on the dashboard.

---

## Part 6 — What you changed vs what stays in Git

| Item | Action |
|------|--------|
| `backend/config.json` | Local only (gitignored). Not on GitHub. |
| `backend/config.example.json` | Committed template — safe defaults, no real secrets. |
| `backend/.env` | Local secrets (gitignored). Optional on Render (prefer Render’s **Environment** UI). |
| Production DB | Set only via **`DATABASE_URL`** on Render. |
| Production CORS | **`CORS_ORIGINS`** on Render. |
| Production API URL for browser | **`VITE_API_BASE`** on your static host **at build time**. |

You do **not** need to edit Python or TypeScript source files for a standard deploy if the repo already includes:

- `/api/stats/...` routes (not `/api/analytics/...`) — avoids ad-blockers blocking the word “analytics”.
- `VITE_API_BASE` support in `frontend/src/lib/api.ts`.

---

## Part 7 — Troubleshooting

| Symptom | Likely cause | What to do |
|---------|----------------|------------|
| Dashboard shows 0 bugs; Network shows **blocked** requests | Browser extension (ad blocker) blocking URLs | Disable blocker for your site or use `/api/stats/...` (already in current code). |
| **CORS error** in console | Backend does not allow your frontend origin | Set `CORS_ORIGINS` on Render to the exact frontend URL (https, no path). |
| API returns **401** / redirect to login | Normal if not logged in; ensure same backend URL as `VITE_API_BASE`. |
| First API call very slow | Free Render instance **asleep** | Wait ~30–60s and retry. |
| **502** from Render | Crash on startup | Check Render **Logs**; often wrong `DATABASE_URL` or missing `config` — Docker image copies `config.example.json` to `config.json` if needed. |
| OpenAI features fail | User must add API key in **Account**; server does not use a global OpenAI key for evaluations. |

---

## Part 8 — Checklist (copy and tick)

- [ ] `config.example.json` copied to local `config.json`; local dev works.
- [ ] GitHub repo created; code pushed from repo root.
- [ ] Neon project created; `DATABASE_URL` saved securely.
- [ ] Render Web Service: root `backend`, build/start or Docker OK.
- [ ] Render env: `DATABASE_URL`, `NEXEVAL_ENV=production`, `JWT_SECRET`, `CORS_ORIGINS`.
- [ ] `/health` works on Render URL.
- [ ] Cloudflare Pages (or Netlify): root `frontend`, build command, output `dist`.
- [ ] Pages env: `VITE_API_BASE=https://YOUR-API.onrender.com/api`.
- [ ] `CORS_ORIGINS` updated to match final frontend URL.
- [ ] Login + create bug works on production URLs.

---

## Optional: Netlify instead of Cloudflare Pages

- **Base directory**: `frontend`
- **Build command**: `npm ci && npm run build`
- **Publish directory**: `frontend/dist` (or `dist` if base dir is `frontend`, depending on Netlify UI)
- Add **`VITE_API_BASE`** in **Site settings → Environment variables** (same value as above).

---

## Optional: `render.yaml` in the repo

Your repo may include [`render.yaml`](render.yaml) as a **Blueprint** starting point. You can still create the service manually using the tables above; if you use Blueprints, review Render’s docs for how env secrets are supplied (usually not committed to YAML).

---

*Last aligned with NexEval layout: backend under `backend/`, frontend under `frontend/`, API routes under `/api`, stats under `/api/stats/...`.*
