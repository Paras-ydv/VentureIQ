# VentureIQ

An agentic-AI and RAG-powered startup investment intelligence platform. B.E.
dissertation project (Computer Science and Business Systems), BMS College of
Engineering / VTU, 2025–2026.

Existing platforms each solve one slice of startup investing — AngelList does
fundraising, Crunchbase does data, PitchBook does market intelligence, Carta does
cap tables — but none of them **verify** what founders self-report, and none give
an investor an explainable score before they commit money. VentureIQ does both.

The full design rationale is in `VentureIQ_report (2).pdf`; `docs/BUILD_PLAN.md`
is the honest engineering translation of it, including what deliberately isn't built.

---

## Quick start

Two terminals. Everything runs locally with no external services.

```bash
# ── Terminal 1: backend ────────────────────────────────────────────
cd backend
uv venv && uv pip install -r <(uv pip compile pyproject.toml)   # first run only
.venv/bin/python scripts/bootstrap.py    # loads data, trains models, scores 9,287 startups (~80s)
.venv/bin/uvicorn app.main:app --reload --port 8000

# ── Terminal 2: frontend ───────────────────────────────────────────
cd frontend
npm install          # first run only
npm run dev          # http://localhost:5173
```

The bootstrap is idempotent — it drops and rebuilds the SQLite database each
time, so re-run it freely. Add `--skip-train` to reuse the existing models, or
`--fast` to load only the India subset of the Y Combinator corpus.

API docs are served at http://localhost:8000/docs.

### Optional: keys and the India company registry

Copy `backend/.env.example` to `backend/.env` and fill in what you have:

- `VIQ_GITHUB_TOKEN` — fine-grained token with *Public repositories (read-only)*;
  raises GitHub's limit from 60 to 5,000 requests/hour.
- `VIQ_DATA_GOV_IN_KEY` — free key from data.gov.in, needed to import the MCA
  company registry (36.7 lakh companies):

```bash
cd backend
.venv/bin/python scripts/import_mca_registry.py            # resumable; Ctrl-C and re-run anytime
.venv/bin/python scripts/import_mca_registry.py --status   # progress
```

The registry lives in `backend/registry.db`, which `bootstrap.py` never touches.

## Deploying

The frontend is a static bundle and deploys to Vercel as-is. The API is a
long-running server and needs a host that keeps a process alive — Render,
Railway, Fly.io or any VM. Serverless will not do: the registration agent keeps
a session in memory while it streams its trace, and the SQLite databases and
trained models live on disk.

**Frontend (Vercel)**

1. New Project → import this repo → set **Root Directory** to `frontend`.
   `frontend/vercel.json` supplies the build and SPA routing.
2. Add an environment variable `VITE_API_BASE` = `https://<your-api-host>/api`.
   It is read at build time, so redeploy after changing it.

**API (Render)**

`render.yaml` in the repo root is a blueprint: Render → New → Blueprint → pick
this repo, and it creates the service with the right build and start commands.
Then set `VIQ_CORS_ORIGINS` to `["https://<your-app>.vercel.app"]` in the Render
dashboard (preview URLs on `*.vercel.app` are already allowed), plus the
optional keys from `backend/.env.example`.

The build runs `scripts/bootstrap.py`, because the database and trained models
are deliberately not in git. Two consequences on Render's free instance:

- The disk is ephemeral. Anything written at runtime — new registrations,
  behavioural events — is lost when the instance restarts or redeploys. Add a
  persistent disk, or point `VIQ_DATABASE_URL` at Postgres (you will need to add
  a driver such as `psycopg[binary]` to `requirements.txt`), to keep them.
- Free instances sleep after 15 minutes idle, so the first request afterwards
  waits ~1 minute for a cold start.

The API needs roughly 400 MB of RAM once the models and the retrieval index are
loaded, which is close to the 512 MB free limit. If it gets OOM-killed, either
build with `python scripts/bootstrap.py --fast` (India-only corpus) or move to a
paid instance.

`backend/registry.db` (the MCA company registry) is not deployed: it is
gitignored and too large. Without it, CIN lookups still work live against
data.gov.in, but fuzzy name search over the registry is unavailable until you
import it on a host with a persistent disk.

Without a reachable API the deployed site still renders, but every panel shows
its "couldn't load" state — nothing is hard-coded.

---

## What actually runs

| Layer | Status | Notes |
|---|---|---|
| Startup registration | **Real** | Agentic: four fields in, the agent researches the rest live (company website, RDAP, DNS, GitHub, corpus, sector classifier, CIN/GSTIN decoding) and every field gets a verified / auto-filled / conflict status. The classic stage-conditional form remains at `/submit` |
| Growth-potential model | **Real** | Gradient boosting on 1,896 labelled YC companies, **AUROC 0.741** held out |
| Risk / founder scoring | **Real** | Additive models over runway, burn efficiency, competitive density, founder track record |
| Fraud detection | **Real** | Isolation Forest + PCA reconstruction error, fitted on 8,511 financial profiles |
| Explainability | **Real** | Per-model feature attributions + generated plain-English rationale for every score |
| RAG benchmarking | **Real** | TF-IDF vector index over the 9,287-startup corpus, stage- and sector-filtered peer retrieval |
| Investor matching | **Real** | Blends stated mandate, behavioural events, co-investment network position, and company quality |
| GitHub / WHOIS enrichment | **Real** | Live public GitHub REST API per founder and org; domain age via RDAP |
| India company registry | **Real** | MCA Company Master Data (36.7 lakh companies, data.gov.in open data): searchable in Discover, claimable, and used to verify CIN, registered name and incorporation date at registration |
| GSTN / LinkedIn enrichment, MCA21 on the profile "Run agent" button | **Mocked** | Deterministic fixtures behind the same interface — these sources are fee-gated, consent-gated, or ToS-blocked. See `data/raw/README.md` |
| Marketplace escrow / settlement | **Simulated** | Regulated activity requiring SEBI/RBI licences. See `docs/BUILD_PLAN.md` Problem 1 |

Provenance is visible in the UI: every enrichment row carries a dot marking
whether it came from a live integration or a mocked stand-in. Nothing mocked is
ever presented as verified.

---

## Data

`data/raw/` holds real, downloaded datasets (never fabricated):

- **~7,000 Indian startup funding records** (2015–2021) from public GitHub
  mirrors of the Kaggle "Indian Startup Funding" dataset
- **6,151 Y Combinator companies** from the `yc-oss/api` project, carrying real
  outcome labels (Active / Inactive / Acquired / Public) — the only ground truth
  available anywhere in the seed data, and therefore what the growth model trains on

Financial profiles (revenue, burn, runway) are **derived from** real funding
totals and real headcount rather than reported, because no public dataset
contains startup P&L. This is marked in the loader and explained in
`data/raw/README.md` — it is the one place synthetic values enter the system.

---

## Project layout

```
backend/
  app/
    core/          config, database
    models/        SQLAlchemy entities (docs/DATA_SCHEMA.md made concrete)
    schemas/       Pydantic request/response contracts
    api/routes/    startups · investors · analytics · marketplace
    ml/            features · train · scoring · rag · matching
    enrichment/    adapters (GitHub real, rest mocked) + the agentic planner
    seed/          ETL from data/raw
  scripts/bootstrap.py
frontend/
  src/
    components/    design primitives, custom SVG charts, app shell
    pages/         Overview · Discover · StartupDetail · Feed · Alerts · Model · Submit · Onboarding
    lib/           API client, formatters, investor context
docs/
  DATA_SCHEMA.md   field-level schema for every entity
  BUILD_PLAN.md    phased build order + the 7 problems that will bite
```

---

## Design notes

The four scores are computed **independently** and only combined at the end.
This is deliberate — the report cites an ablation showing early fusion of
heterogeneous financial and qualitative signals measurably underperforms. Don't
refactor them into one model without reading that first.

The colour system reserves the entire warm spectrum (amber, orange, red) for
risk and fraud status, and uses a cool accent for brand and interaction. In a
product whose core claim is "we flag what others miss", an alert colour must
never be confusable with a brand colour. The categorical chart palette was
validated for colour-blind separation and contrast against the app's actual dark
surface.

## Known limitations

Read `docs/BUILD_PLAN.md` before promising anything in a review. The short
version: outcome labels resolve over years so nothing here validates a live
prediction; fraud detection is anomaly detection, not a trained fraud
classifier; the growth model is trained on global YC data and applying it to
Indian startups is a domain transfer that should be reported as such.
