<p align="center">
  <img src="https://img.shields.io/badge/NexEval-v0.3.0-6366f1?style=for-the-badge&logo=zap&logoColor=white" />
  <img src="https://img.shields.io/badge/React_18-TypeScript-3178c6?style=for-the-badge&logo=react" />
  <img src="https://img.shields.io/badge/FastAPI-Python-009688?style=for-the-badge&logo=fastapi" />
  <img src="https://img.shields.io/badge/DeepEval-6_Metrics-ef4444?style=for-the-badge" />
  <img src="https://img.shields.io/badge/PostgreSQL-Database-336791?style=for-the-badge&logo=postgresql" />
</p>

# NexEval — RAG Evaluation Platform

**NexEval** is a full-stack evaluation and debugging platform for RAG (Retrieval-Augmented Generation) systems. It provides automated quality assessment, root cause analysis, regression testing, and analytics — everything you need to systematically improve your RAG pipeline.

When a user reports a production bug against your chatbot, NexEval automates the entire investigation: evaluates the response quality using 6 industry-standard metrics via **DeepEval**, identifies what went wrong (bad retrieval? hallucination? irrelevant answer?), suggests actionable fixes, and tracks improvements over time.

---

## Why NexEval?

| Problem | NexEval Solution |
|---------|-----------------|
| "Is this a valid bug or user error?" | Automated 6-metric evaluation with pass/fail verdicts |
| "What went wrong — retrieval or generation?" | AI-powered root cause classification |
| "How do I fix it?" | Actionable fix suggestions per root cause |
| "Did my pipeline change actually help?" | Evaluation diff with green/red deltas per metric |
| "Did I break anything else?" | Regression test suites with before/after comparison |
| "Which documents cause the most issues?" | Analytics dashboard with problematic INS ID tracking |
| "The user's question is poorly worded" | AI question rephraser generates better alternatives |

---

## Features

### Bug Management
- **Bug Intake Form** — Submit bug reports with user question, expected/actual answers, retrieved chunks (accepts any format: strict JSON, partial JSON, raw text, escaped strings), expected INS IDs, module name, and priority level
- **Lenient Chunk Parser** — Automatically handles malformed JSON, escaped quotes, wrapped API responses, and raw text — extracts INS IDs and builds structured chunk objects from whatever you paste
- **Inline Editing** — Edit any user-input field directly from the bug detail view without leaving the page
- **Copy as JSON** — One-click copy of bug data as JSON for use with batch evaluation or external tools
- **Duplicate Bug** — Clone an existing bug into a new report with all fields pre-filled for quick variations
- **Status Management** — Track bugs as Open → Resolved → Invalid with full history

### Evaluation Engine
- **6 DeepEval Metrics** — Faithfulness, Answer Relevancy, Contextual Relevancy, Contextual Precision, Contextual Recall, Hallucination — all powered by an LLM judge (GPT-4o / gpt-5.4-mini)
- **Async Evaluation** — Evaluations run in background threads; a floating progress tracker follows you across pages with real-time countdown and status
- **Auto-Evaluate on Submit** — Optional toggle to automatically trigger evaluation right after creating a bug (configurable globally in `config.json` and per-submission)
- **Evaluation History** — Every evaluation run is stored permanently; browse, compare, and analyze any historical run
- **Evaluation Diff** — Pick any two runs for the same bug and see a side-by-side comparison with green/red delta percentages and pass/fail status changes

### Root Cause Analysis
- **Automatic Classification** — Each evaluation is classified into one of 6 root causes:
  - `RETRIEVAL_FAILURE` — Relevant documents not retrieved
  - `RANKING_ISSUE` — Right docs retrieved but ranked poorly
  - `GENERATION_FAILURE` — Good context but bad response generation
  - `HALLUCINATION` — Response contains claims not in the context
  - `IRRELEVANT_ANSWER` — Response doesn't address the question
  - `ACCEPTABLE` — All metrics pass
- **Fix Suggestions** — Tailored, actionable recommendations based on the specific root cause
- **Configurable Thresholds** — All classification thresholds tunable in `config.json`

### Retrieved Chunks Viewer
- **Document Viewer** — See the actual content of every retrieved chunk, grouped by INS ID
- **Expected Highlighting** — Chunks from expected INS IDs are highlighted green with an "EXPECTED" badge; missing expected documents show a red warning
- **Formatted JSON Display** — Chunk content rendered as collapsible JSON trees with syntax highlighting (colored keys, strings, numbers) or structured passages with metadata
- **Filter Controls** — Toggle between All, Expected, and Other chunks
- **Re-parse Button** — Force re-parsing of raw chunk data to extract structure from malformed inputs

### Question Rephraser
- **AI-Powered Rephrasings** — Generates multiple alternative phrasings of the user question that are clearer, more specific, and more likely to trigger good retrieval
- **Persistent Storage** — Generated rephrasings are cached in the database; no redundant LLM calls on revisits
- **Copy to Clipboard** — One-click copy for each rephrased question to test against your chatbot
- **Regenerate** — Replace cached rephrasings with fresh alternatives on demand

### Batch Evaluation
- **Bulk Processing** — Submit multiple bugs at once via JSON array for mass evaluation
- **Combined Results** — See all evaluations in a single response with per-bug pass/fail status

### Analytics Dashboard
- **Overview Cards** — Total bugs, open/resolved counts, average faithfulness score
- **Bug Trends** — Line chart of bugs over time
- **Root Cause Distribution** — Donut chart showing the breakdown of root causes across all evaluations
- **Average Evaluation Scores** — Bar chart of metric averages
- **Faithfulness Trend** — Time-series line chart tracking faithfulness scores over the last N evaluations
- **Problematic Documents** — Horizontal bar chart of top 10 INS IDs appearing in the most bugs
- **Scores by Module** — Grouped bar chart comparing average metric scores across different modules

### Regression Test Suites
- **Create Suites** — Group related bugs into named test suites (e.g., "Regulatory Q&A," "Drug Pricing")
- **One-Click Re-evaluation** — Re-evaluate every bug in a suite after pipeline changes; runs asynchronously with live progress tracking
- **Before/After Comparison** — For each bug in the run, see old vs new scores with color-coded deltas and root cause changes
- **Improvement Tracking** — Automatic counts of improved, regressed, and unchanged bugs per run
- **Run History** — Full history of all runs per suite with timestamps, progress, and detailed results

### Platform Features
- **PostgreSQL Persistence** — All bugs, evaluations, metrics, rephrasings, suites, and runs stored in PostgreSQL with a professional schema
- **Centralized Configuration** — Single `config.json` for database, evaluation thresholds, rephraser prompts, and feature flags
- **Environment Override** — JWT and similar server secrets can be set via `.env` (see `backend/.env.example`). **OpenAI keys are per-user** (Account page), not from `.env`
- **Auto Schema Migration** — New columns and tables created automatically on startup

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS + Recharts |
| Backend | FastAPI + Python 3.11+ + Pydantic |
| Database | PostgreSQL + SQLAlchemy ORM |
| Evaluation | DeepEval (6 metrics) |
| LLM Judge | OpenAI (GPT-4o / gpt-5.4-mini configurable) |
| Async | Python threading for background evaluations |

---

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL 14+
- (Optional) Per-user OpenAI keys are added in the app after sign-up

### 1. Database Setup

```bash
# Create the database
createdb rag_eval_db

# Or via psql
psql -U postgres -c "CREATE DATABASE rag_eval_db;"
```

### 2. Backend

```bash
cd backend
pip install -r requirements.txt

# One-time: copy config template (backend/config.json is gitignored — do not commit secrets)
cp config.example.json config.json
# Edit config.json for local database credentials and tuning.

# OpenAI: each user adds their API key in Account (BYOK)

# Start the server (tables auto-created on startup)
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## Configuration

**Local:** copy [`backend/config.example.json`](backend/config.example.json) to `backend/config.json` and edit (that file stays out of git). Defaults include `"app": { "env": "development", ... }`.

**Production:** set environment variables on the API host (they override JSON defaults):

| Variable | Purpose |
|----------|---------|
| `NEXEVAL_ENV` | `development` or `production` |
| `DATABASE_URL` or `POSTGRES_URL` | Full Postgres URL (e.g. Neon). When set, DB fields in `config.json` are ignored for the connection. |
| `CORS_ORIGINS` | Comma-separated browser origins allowed to call the API (e.g. `https://your-app.pages.dev`) |
| `JWT_SECRET` | Strong secret for signing tokens (required in production) |
| `NEXEVAL_CREDENTIALS_KEY` | Optional credential encryption key — see [`backend/.env.example`](backend/.env.example) |

Optional tuning: `DB_POOL_SIZE`, `DB_MAX_OVERFLOW`, and other fields from `config.json` can still be overridden via env where Pydantic settings allow (e.g. `DB_HOST`).

```jsonc
{
  "app": { "title": "NexEval", "version": "0.3.0", "env": "development", "cors_origins": ["*"] },
  "database": { "host": "localhost", "port": 5432, "name": "rag_eval_db", "user": "postgres", "password": "..." },
  "openai": { "api_key": "", "model": "gpt-4o-mini" },
  "deepeval": { "model": "gpt-4o-mini" },
  "evaluation_thresholds": { "faithfulness": 0.5, "answer_relevancy": 0.5, ... },
  "root_cause_thresholds": { "retrieval_failure_ctx_relevancy": 0.5, ... },
  "evaluation": { "auto_evaluate": false }
}
```

**Do not rely on `.env` / `config.json` for OpenAI keys** — users add keys in **Account** after logging in.

---

## Deployment (free-tier friendly)

Typical split: **managed Postgres** (e.g. [Neon](https://neon.tech)) + **API** (e.g. [Render](https://render.com) free web service) + **static frontend** (e.g. Cloudflare Pages, Netlify, GitHub Pages).

### API (example: Render)

1. Create a Postgres database (Neon or Render PostgreSQL) and copy the connection string.
2. New **Web Service** from this repo:
   - **Docker:** set root directory to `backend`, use [`backend/Dockerfile`](backend/Dockerfile), or use the optional [`render.yaml`](render.yaml) blueprint.
   - **Native Python:** root directory `backend`, build `pip install -r requirements.txt`, start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
3. Add a **`config.json`** on the host **or** rely entirely on env: at minimum set `DATABASE_URL`, `NEXEVAL_ENV=production`, `JWT_SECRET`, and `CORS_ORIGINS` (your static site origin(s)).
4. Health check path: `/health`.

If you do not mount `config.json`, copy `config.example.json` to `config.json` in the build step, or extend the image/start script to create it — the app still reads thresholds from JSON when present.

### Frontend (static host)

1. Build: `cd frontend && npm ci && npm run build` (publish `frontend/dist`).
2. Set **`VITE_API_BASE`** at build time to your public API base **including `/api`**, e.g. `https://nexeval-api.onrender.com/api`. Leave unset for local `npm run dev` (Vite proxies `/api` to port 8000).
3. Ensure `CORS_ORIGINS` on the API includes your static site origin (scheme + host, no trailing path).

Free tiers may sleep or cap CPU; OpenAI usage remains billed per your users’ keys (BYOK).

---

## API Endpoints

### Bugs
| Method | Endpoint | Description |
|--------|---------|-------------|
| POST | `/api/bugs` | Create a bug report |
| GET | `/api/bugs` | List all bugs (optional `?status=` filter) |
| GET | `/api/bugs/{id}` | Get bug detail |
| PUT | `/api/bugs/{id}` | Update bug fields |
| PUT | `/api/bugs/{id}/status` | Update bug status |
| DELETE | `/api/bugs/{id}` | Delete a bug |

### Evaluation
| Method | Endpoint | Description |
|--------|---------|-------------|
| POST | `/api/evaluate/{bug_id}` | Start async evaluation |
| GET | `/api/evaluate/{bug_id}/status` | Poll evaluation progress |
| GET | `/api/evaluate/{bug_id}` | Get latest evaluation result |
| GET | `/api/evaluate/{bug_id}/history` | Get all evaluation runs |
| GET | `/api/evaluate/running` | List currently running evaluations |
| POST | `/api/evaluate/batch` | Batch evaluate multiple bugs |

### Chunks & Rephrase
| Method | Endpoint | Description |
|--------|---------|-------------|
| POST | `/api/chunks/analyze` | Analyze chunk relevancy |
| POST | `/api/rephrase` | Rephrase a question |
| GET | `/api/rephrase/{bug_id}` | Get cached rephrasings |
| POST | `/api/rephrase/{bug_id}` | Generate/regenerate rephrasings |

### Analytics
| Method | Endpoint | Description |
|--------|---------|-------------|
| GET | `/api/stats/overview` | Dashboard statistics |
| GET | `/api/stats/root-causes` | Root cause distribution |
| GET | `/api/stats/trends` | Bug trends over time |
| GET | `/api/stats/faithfulness-trend` | Faithfulness score timeline |
| GET | `/api/stats/top-ins-ids` | Most common INS IDs across bugs |
| GET | `/api/stats/scores-by-module` | Average scores grouped by module |

### Test Suites
| Method | Endpoint | Description |
|--------|---------|-------------|
| POST | `/api/test-suites` | Create a test suite |
| GET | `/api/test-suites` | List all suites |
| GET | `/api/test-suites/{id}` | Get suite detail |
| DELETE | `/api/test-suites/{id}` | Delete a suite |
| POST | `/api/test-suites/{id}/bugs` | Add bugs to a suite |
| POST | `/api/test-suites/{id}/run` | Trigger re-evaluation run |
| GET | `/api/test-suites/{id}/runs` | List all runs for a suite |
| GET | `/api/test-suites/{id}/runs/{run_id}` | Get run detail with before/after results |

### Settings
| Method | Endpoint | Description |
|--------|---------|-------------|
| GET | `/api/settings` | Get application settings (auto_evaluate flag) |

---

## Evaluation Metrics

| Metric | What It Measures | Good Score |
|--------|-----------------|-----------|
| Faithfulness | Is the answer grounded in the retrieved context? | > 70% |
| Answer Relevancy | Does the answer actually address the question asked? | > 70% |
| Contextual Relevancy | Are the retrieved chunks relevant to the query? | > 60% |
| Contextual Precision | Are the most relevant chunks ranked at the top? | > 60% |
| Contextual Recall | Does the context cover all the information needed? | > 70% |
| Hallucination | Does the response contain claims not present in context? | < 30% |

---

## Database Schema

```
bugs                    evaluations              metric_scores
├── id (UUID)           ├── id (UUID)            ├── id (UUID)
├── user_question       ├── bug_id (FK)          ├── evaluation_id (FK)
├── expected_answer     ├── run_number           ├── name
├── actual_answer       ├── root_cause           ├── score
├── ins_ids (JSON)      ├── root_cause_explanation├── threshold
├── expected_ins_ids    ├── fix_suggestions (JSON)├── passed
├── module_name         └── evaluated_at         └── reason
├── priority
├── status              test_suites              test_suite_runs
├── retrieved_chunks    ├── id (UUID)            ├── id (UUID)
├── retrieved_chunks_raw├── name                 ├── suite_id (FK)
├── evaluation_count    ├── description          ├── status
└── created_at          └── created_at           ├── total/completed/failed
                                                 ├── improved/regressed
                        test_suite_items         ├── results (JSON)
                        ├── suite_id (FK)        └── started_at/finished_at
                        └── bug_id (FK)
```

---

## License

MIT
