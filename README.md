# SEO Buddy — Total Rank System Dashboard

SEO Buddy is an automated **SEO + Answer‑Engine (AEO/GEO)** platform built for **Best Day Fitness** in St. Petersburg, Florida.

It finds Google Search Console content gaps, writes authoritative E‑E‑A‑T content with Google Gemini, publishes to GoHighLevel with structured data, requests instant Google indexing, **audits your real visibility inside AI answer engines**, shows you **where to get listed** so AI recommends you, handles **local SEO** (NAP, reviews, Google Business Profile), **measures whether it's working** over time, and sharpens your **on‑site & technical SEO** — all in one dark, glassmorphic dashboard with a plain‑English owner view.

---

## What's inside (10 tabs)

1. **Summary** *(default landing)* — a plain‑English, real‑time snapshot for a non‑technical owner: AI visibility, search opportunities, content published, competitors ahead, plus two clearly‑labeled **estimated value** figures. Auto‑refreshes.
2. **Performance** — is it working? Search performance this period vs the previous (impressions, clicks, average rank + top keyword movers), an AI‑visibility trend over time, a daily traffic trend, and new leads from GoHighLevel.
3. **GSC Content Gaps** — search queries with high impressions but **zero clicks** (SEO "leaks") straight from Search Console.
4. **AI Article Creator** — Gemini writes a structured HTML article (H1–H3 outline, step‑by‑step lists, comparison table, case‑study block, CTA, internal‑link placeholders, FAQ).
5. **Publish & Index** — publishes to the GoHighLevel Blogs module, injects **JSON‑LD schema** (LocalBusiness, FAQPage, Author), resolves internal links, and submits the URL to Google's Indexing API.
6. **AI Search (AIO) Audit** — asks Gemini your query **with live Google Search grounding** and reads back whether you're actually recommended/cited, the real source URLs, and the competitors named. Real answer‑engine data, not a simulation.
7. **Citation Targets** — finds the real third‑party sources AI cites for your searches (directories, review sites, "best‑of" lists), flags whether you're already listed, and gives a prioritized **"get listed here"** worklist with a tailored action per source.
8. **Local SEO** — a **NAP consistency auditor** (Name/Address/Phone across the web, with mismatch flags), a **review response writer** and **review‑request** generator, a **Google Business Profile post generator**, and a scored **local SEO checklist**.
9. **On‑Site SEO** — a **keyword & topic idea generator** (grounded), a **title & meta optimizer** with live character counts, an **internal‑link suggester** from your published content, and an **extended schema pack** (Service, Review template, Breadcrumb).
10. **Settings** — API keys, dashboard password, and the business‑value assumptions that drive the Summary/Performance estimates.

---

## Features

- **Real GSC gap finder** and **period‑over‑period performance** tracking with durable daily snapshots.
- **AI article writer** — Gemini‑generated structured HTML; model is configurable.
- **GoHighLevel publishing** with real LocalBusiness / FAQPage / Author JSON‑LD, and **instant indexing** via Google's Indexing API.
- **Real AEO/GEO audit** — Gemini + Google Search grounding shows genuine AI‑answer visibility with real citations.
- **Citation Target Finder** — turns "AI cites other sites" into a ranked list of where to get listed.
- **Local SEO suite** — NAP auditor, review + GBP content generators, and a local checklist.
- **On‑site & technical tools** — keyword ideas, title/meta optimization, internal‑link suggestions, extended schema.
- **Owner dashboard & ROI** — plain‑English Summary + Performance with estimated business value and leads tie‑in.
- **Autopilot agent** *(optional)* — background loop that finds a gap → writes → publishes → indexes on a schedule.
- **Password‑protected actions**, configurable CORS, and **durable storage** so data survives redeploys.
- **Obsidian dark, glassmorphic UI** with a built‑in guided tour.

> **Honest scope notes.** Google Business Profile and Google reviews can't be *posted* through a simple API (that needs Google approval + OAuth), so the Local SEO tools **audit and generate** content for you to paste in. Competitor keyword‑gap data needs a paid tool (Semrush/Ahrefs), so the keyword generator produces **AI‑powered ideas**, not a rank export. Review schema ships with **placeholders** — never fabricate ratings. Performance trend charts **build over days** as snapshots accumulate.

---

## Quick Start (Mock Mode)

Runs immediately with sample data and **no keys required**.

```bash
npm install
npm start
# open http://localhost:3000
```

The dashboard boots in **Mock Mode** so you can explore every tab before connecting live services.

---

## Configuration (environment variables)

Set these in your host's environment (e.g., Railway → Variables) or, for local use, in a `.env` file.

### Core
| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the server listens on. |
| `DATA_DIR` | app folder | **Where history/audits/logs/snapshots are stored.** On a container host, point this at a persistent volume (e.g. `/data`) so data survives redeploys. |
| `ADMIN_PASSWORD` | *(unset)* | When set, locks the sensitive endpoints (see **Security**). Enter the same value in Settings → Admin Password. Leave unset only for trusted local dev. |
| `ALLOWED_ORIGIN` | *(same‑origin)* | Optional comma‑separated CORS allowlist. Leave blank for same‑origin only. |

### Generative AI (Gemini)
| Variable | Default | Description |
|---|---|---|
| `GEMINI_API_KEY` | *(unset)* | Key from [Google AI Studio](https://aistudio.google.com/). Powers the article writer, AIO audit, Citation Targets, Local SEO generators, and On‑Site tools. |
| `GEMINI_MODEL` | `gemini-3.6-flash` | Model used for all Gemini generation. |

> **Grounding note:** the AIO audit, Citation Targets, NAP audit, and keyword‑idea tools use **Grounding with Google Search**, which Google bills per search (with a free monthly allowance on the **paid/Tier‑1** plan). A free‑tier Gemini key returns `429 RESOURCE_EXHAUSTED` on grounded calls — use a billing‑enabled key.

### Google Search Console & Indexing
| Variable | Default | Description |
|---|---|---|
| `GOOGLE_APPLICATION_CREDENTIALS` | *(unset)* | Path to a service‑account JSON key **or** the full raw JSON string (the app auto‑detects a value starting with `{`). Powers GSC Content Gaps + Performance. |
| `GSC_SITE_URL` | *(unset)* | Your verified property, matching its type **exactly**: `sc-domain:example.com` (Domain) or `https://example.com/` (URL‑prefix). |

### GoHighLevel
| Variable | Description |
|---|---|
| `GHL_ACCESS_TOKEN` | Private Integration token. `blogs.*` scopes for publishing; **contacts** scope also enables the Performance tab's leads count. |
| `GHL_LOCATION_ID` | Your GHL Location ID. |
| `GHL_BLOG_ID` | Target blog folder ID. |
| `GHL_AUTHOR_ID` / `GHL_AUTHOR_NAME` / `GHL_AUTHOR_URL` | Optional author attribution + E‑E‑A‑T author schema. |
| `GHL_BLOG_PATH_PREFIX` | Blog path prefix for building URLs (default `/blog/posts`). |

---

## Connecting each integration

### 1. Gemini
Create a key in Google AI Studio, ensure the project has **billing enabled** (for grounded features), and set `GEMINI_API_KEY`.

### 2. Google Search Console + Indexing API
1. In [Google Cloud Console](https://console.cloud.google.com/), enable **Google Search Console API** and **Web Search Indexing API**.
2. Create a **service account** and download a **JSON key**.
3. In Search Console → **Settings → Users and permissions**, add the service‑account email (its `client_email`) as a **Full** user on your property.
4. Set `GOOGLE_APPLICATION_CREDENTIALS` and `GSC_SITE_URL` (matching your property type exactly).

### 3. GoHighLevel
Grab your **Location ID**, create a **Private Integration** token (blog scopes to publish; add contacts scope for the leads metric), and note your **Blog ID**.

---

## Security

- **Always set `ADMIN_PASSWORD` in production.** When set, the sensitive endpoints (any that write data, publish, or spend Gemini) require it; read‑only data views stay open so dashboards load without a password.
- The dashboard sends the password as a Bearer token; enter it once in **Settings → Admin Password**.
- If `ADMIN_PASSWORD` is unset, the server logs a startup warning and those endpoints are open — fine for local dev, not for public hosting.
- Restrict cross‑origin access with `ALLOWED_ORIGIN` if needed.

---

## Deploying (Railway)

The app auto‑deploys from the GitHub `main` branch.

1. Set the environment variables above in the service's **Variables**.
2. **Attach a Volume** and set `DATA_DIR` to its mount path (e.g. `/data`). **Important:** container filesystems are wiped on every redeploy, so without a volume your audit history, published‑content list, autopilot logs, and Performance snapshots reset each deploy. On startup the server logs `💾 Data dir: … (persistent)` when a volume is configured.
3. Set `ADMIN_PASSWORD` and enter the same value in Settings → Admin Password.

---

## Business‑value estimates

The Summary tab's **Opportunity Value** and **Current Visibility Value** are **estimates**, driven by three assumptions you control in **Settings → Business Value**:

- **Value of a new client ($)** — default `1395`
- **Visitor → client conversion (%)** — default `2`
- **Search capture (%)** — default `5`

Tune these to your real numbers. They're clearly labeled as estimates in the UI.

---

## API reference

| Method | Endpoint | Auth | Purpose |
|---|---|:---:|---|
| GET | `/api/gsc-data` | — | Search Console queries (live or mock). |
| GET | `/api/performance` | — | Period‑over‑period trends, snapshots, AI‑visibility trend, leads. |
| POST | `/api/generate-article` | 🔒 | Generate an article with Gemini. |
| POST | `/api/publish-ghl` | 🔒 | Publish to GoHighLevel + inject schema. |
| POST | `/api/index-url` | 🔒 | Submit a URL to Google's Indexing API. |
| GET | `/api/history` | — | Published‑content history. |
| POST | `/api/aio-audit` | 🔒 | Run a live, Google‑grounded AI‑search audit. |
| GET | `/api/aio-history` | — | Past AIO audits. |
| GET | `/api/aio-schema` | — | LocalBusiness + FAQ JSON‑LD. |
| POST | `/api/citation-targets` | 🔒 | Find + classify the third‑party sources AI cites. |
| POST | `/api/nap-audit` | 🔒 | Check NAP consistency across the web. |
| POST | `/api/local-generate` | 🔒 | Review responses/requests + GBP posts. |
| POST | `/api/onsite` | 🔒 | Keyword ideas / title‑meta / internal links. |
| GET | `/api/onsite-schema` | — | Service, Review (template), Breadcrumb JSON‑LD. |
| GET | `/api/autopilot-status` | — | Autopilot state + logs. |
| POST | `/api/autopilot-toggle` | 🔒 | Enable/disable the autopilot schedule. |
| POST | `/api/autopilot-run-now` | 🔒 | Trigger one autopilot cycle now. |
| POST | `/api/save-settings` | 🔒 | Persist configuration to the server. |

🔒 = requires `ADMIN_PASSWORD` when it is set.

---

## Data & persistence

State is stored as flat JSON in `DATA_DIR`: `history.json`, `autopilot-logs.json`, `aio-audits.json`, and `performance.json` (daily snapshots). Point `DATA_DIR` at a persistent volume in production so this data survives redeploys.

---

## Tech stack

Node.js · Express · `@google/genai` (Gemini) · `googleapis` (Search Console + Indexing) · GoHighLevel API · vanilla JS front‑end.

---

*License: MIT.*
