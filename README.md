# SEO Buddy — Total Rank System Dashboard

SEO Buddy is an automated **SEO + Answer‑Engine (AEO/GEO)** dashboard built for **Best Day Fitness** in St. Petersburg, Florida.

It finds Google Search Console content gaps, writes authoritative, E‑E‑A‑T‑rich content with Google Gemini, publishes it to GoHighLevel with structured data, requests instant Google indexing, and **audits your real visibility inside AI answer engines** using Gemini with live Google Search grounding. A plain‑English **Summary dashboard** turns all of it into an at‑a‑glance view — including estimated business value.

---

## What's inside (6 tabs)

1. **Summary** *(default landing)* — a plain‑English, real‑time snapshot for a non‑technical owner: AI visibility, search opportunities, content published, competitors ahead, plus two clearly‑labeled **estimated value** figures (opportunity value and current visibility value). Auto‑refreshes.
2. **GSC Content Gaps** — surfaces search queries with high impressions but **zero clicks** (SEO "leaks") straight from Search Console.
3. **AI Article Creator** — Gemini writes a structured HTML article (H1–H3 outline, step‑by‑step lists, a comparison table, a case‑study block, a CTA, internal‑link placeholders, and an FAQ).
4. **Publish & Index** — publishes to the GoHighLevel Blogs module, injects **JSON‑LD schema** (LocalBusiness, FAQPage, Author), resolves internal links, and submits the URL to Google's Indexing API.
5. **AI Search (AIO) Audit** — asks Gemini your query **with live Google Search grounding** and reads back whether Best Day Fitness is actually recommended/cited, the real source URLs, and the competitors named. This is real answer‑engine data, not a simulation.
6. **Settings** — API keys, dashboard password, and the business‑value assumptions that drive the Summary estimates.

---

## Features

- **Real GSC gap finder** — impressions‑but‑zero‑click queries, ranked by opportunity.
- **AI article writer** — Gemini‑generated structured HTML; model is configurable.
- **GoHighLevel publishing** — direct to the Blogs module, with real LocalBusiness / FAQPage / Author JSON‑LD.
- **Instant indexing** — submits published URLs to Google's Indexing API.
- **Real AEO/GEO audit** — Gemini + Google Search grounding shows genuine AI‑answer visibility with real citations.
- **Summary dashboard** — owner‑friendly KPIs and estimated business value.
- **Autopilot agent** *(optional)* — background loop that finds a gap → writes → publishes → indexes on a schedule.
- **Password‑protected actions** — sensitive endpoints are gated by an admin password; CORS is configurable.
- **Durable storage** — history/audits/logs can live on a persistent disk so they survive redeploys.
- **Obsidian dark, glassmorphic UI.**

---

## Quick Start (Mock Mode)

Runs immediately with sample data and **no keys required**.

```bash
npm install
npm start
# open http://localhost:3000
```

The dashboard boots in **Mock Mode**, preloaded with sample senior‑fitness search queries so you can explore every tab before connecting live services.

---

## Configuration (environment variables)

Set these in your host's environment (e.g., Railway → Variables) or, for local use, in a `.env` file.

### Core
| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the server listens on. |
| `DATA_DIR` | app folder | **Where history/audits/logs are stored.** On a container host, point this at a persistent volume (e.g. `/data`) so data survives redeploys. |
| `ADMIN_PASSWORD` | *(unset)* | When set, locks the sensitive endpoints (see **Security**). Enter the same value in Settings → Admin Password. Leave unset only for trusted local dev. |
| `ALLOWED_ORIGIN` | *(same‑origin)* | Optional comma‑separated CORS allowlist. Leave blank for same‑origin only. |

### Generative AI (Gemini)
| Variable | Default | Description |
|---|---|---|
| `GEMINI_API_KEY` | *(unset)* | Key from [Google AI Studio](https://aistudio.google.com/). Without it, generation runs in Mock Mode. |
| `GEMINI_MODEL` | `gemini-3.6-flash` | Model used for article writing and the AIO audit. |

> **Note on the AIO audit:** it uses **Grounding with Google Search**, which Google bills per search (with a monthly free allowance of grounded searches on the **paid/Tier‑1** plan). A free‑tier Gemini key will return `429 RESOURCE_EXHAUSTED` on grounded audits — use a billing‑enabled key.

### Google Search Console & Indexing
| Variable | Default | Description |
|---|---|---|
| `GOOGLE_APPLICATION_CREDENTIALS` | *(unset)* | Path to a service‑account JSON key **or** the full raw JSON string (handy for cloud hosts that can't commit a keyfile — the app auto‑detects a value starting with `{`). |
| `GSC_SITE_URL` | *(unset)* | Your verified property, matching its type **exactly**: `sc-domain:example.com` for a Domain property, or `https://example.com/` for a URL‑prefix property. |

### GoHighLevel publishing
| Variable | Description |
|---|---|
| `GHL_ACCESS_TOKEN` | Private Integration token with `blogs.readonly` + `blogs.write`. |
| `GHL_LOCATION_ID` | Your GHL Location ID (Settings → Business Profile). |
| `GHL_BLOG_ID` | Target blog folder ID. |
| `GHL_AUTHOR_ID` / `GHL_AUTHOR_NAME` / `GHL_AUTHOR_URL` | Optional author attribution + E‑E‑A‑T author schema. |
| `GHL_BLOG_PATH_PREFIX` | Blog path prefix for building URLs (default `/blog/posts`). |

---

## Connecting each integration

### 1. Gemini (AI writing + AIO audit)
Create a key in Google AI Studio and set `GEMINI_API_KEY`. For the **AIO audit** to work, that key's project must have **billing enabled** (grounded search is a paid feature with a generous free monthly allowance).

### 2. Google Search Console + Indexing API
1. In [Google Cloud Console](https://console.cloud.google.com/), enable **Google Search Console API** and **Web Search Indexing API**.
2. Create a **service account** and download a **JSON key**.
3. In Search Console → **Settings → Users and permissions**, add the service‑account email (its `client_email`) as a **Full** user on your property.
4. Set `GOOGLE_APPLICATION_CREDENTIALS` (the JSON, or a path to it) and `GSC_SITE_URL` (matching your property type exactly).

### 3. GoHighLevel
In GHL, grab your **Location ID**, create a **Private Integration** token with blog scopes, and note the target **Blog ID**. Set the `GHL_*` variables above.

---

## Security

- **Always set `ADMIN_PASSWORD` in production.** When set, these endpoints require it: `save-settings`, `generate-article`, `publish-ghl`, `index-url`, `autopilot-toggle`, `autopilot-run-now`, and `aio-audit`. Read‑only endpoints (the dashboard's data views) stay open so the Summary loads without a password.
- The dashboard sends the password as a Bearer token; enter it once in **Settings → Admin Password**.
- If `ADMIN_PASSWORD` is unset, the server logs a startup warning and those endpoints are open — fine for local dev, not for public hosting.
- Restrict cross‑origin access with `ALLOWED_ORIGIN` if you call the API from another origin.

---

## Deploying (Railway)

The app auto‑deploys from the GitHub `main` branch.

1. Set the environment variables above in the service's **Variables**.
2. **Attach a Volume** and set `DATA_DIR` to its mount path (e.g. `/data`). **This is important:** container filesystems are wiped on every redeploy, so without a volume your audit history, published‑content list, and autopilot logs reset each time you deploy. On startup the server logs `💾 Data dir: … (persistent)` when a volume is configured correctly.
3. Set `ADMIN_PASSWORD` and enter the same value in Settings → Admin Password.

---

## Business‑value estimates (Summary tab)

The Summary tab's **Opportunity Value** and **Current Visibility Value** are **estimates**, driven by three assumptions you control in **Settings → Business Value**:

- **Value of a new client ($)** — default `1395`
- **Visitor → client conversion (%)** — default `2`
- **Search capture (%)** — default `5`

Tune these to your real numbers so the dollar figures reflect your business. They are clearly labeled as estimates in the UI.

---

## The 5‑Step Total Rank System

1. **Find gaps** — query Search Console for impressions‑with‑zero‑clicks.
2. **Fill leaks** — generate a high‑quality, E‑E‑A‑T article for the gap.
3. **Multiply** *(roadmap)* — repurpose articles into video/podcast scripts.
4. **Index** — request an immediate Google crawl via the Indexing API.
5. **Rank** — capture listings on Google's SERP **and** inside AI answer engines, then track it on the AIO Audit + Summary tabs.

---

## API reference

| Method | Endpoint | Auth | Purpose |
|---|---|:---:|---|
| GET | `/api/gsc-data` | — | Search Console queries (live or mock). |
| POST | `/api/generate-article` | 🔒 | Generate an article with Gemini. |
| POST | `/api/publish-ghl` | 🔒 | Publish to GoHighLevel + inject schema. |
| POST | `/api/index-url` | 🔒 | Submit a URL to Google's Indexing API. |
| GET | `/api/history` | — | Published‑content history. |
| POST | `/api/aio-audit` | 🔒 | Run a live, Google‑grounded AI‑search audit. |
| GET | `/api/aio-history` | — | Past AIO audits. |
| GET | `/api/aio-schema` | — | JSON‑LD LocalBusiness + FAQ schema assets. |
| GET | `/api/autopilot-status` | — | Autopilot state + logs. |
| POST | `/api/autopilot-toggle` | 🔒 | Enable/disable the autopilot schedule. |
| POST | `/api/autopilot-run-now` | 🔒 | Trigger one autopilot cycle now. |
| POST | `/api/save-settings` | 🔒 | Persist configuration to the server. |

🔒 = requires `ADMIN_PASSWORD` when it is set.

---

## Data & persistence

State is stored as flat JSON in `DATA_DIR`: `history.json`, `autopilot-logs.json`, and `aio-audits.json`. Point `DATA_DIR` at a persistent volume in production so this data survives redeploys.

---

## Tech stack

Node.js · Express · `@google/genai` (Gemini) · `googleapis` (Search Console + Indexing) · GoHighLevel Blogs API · vanilla JS front‑end.

---

*License: MIT.*
