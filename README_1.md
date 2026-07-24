# SEO Buddy — Total Rank System Dashboard

SEO Buddy is an automated **SEO + Answer‑Engine (AEO/GEO)** platform built for **Best Day Fitness** in St. Petersburg, Florida — and designed to roll out to a **franchise model**.

It scores how maximized your SEO/AEO is in a single number, tells a non‑technical owner exactly **what to do next**, and then does much of the work on autopilot: it finds Google Search Console content gaps, writes authoritative E‑E‑A‑T content with Google Gemini, publishes to GoHighLevel with structured data, requests instant Google indexing, **audits your real visibility inside AI answer engines**, shows you **where to get listed** so AI recommends you, handles **local SEO** (NAP, reviews, Google Business Profile), **measures whether it's working** over time, and sharpens your **on‑site & technical SEO** — all in one dark, glassmorphic dashboard with a plain‑English owner view and a light/dark theme.

---

## The big idea: one score, then next moves

Everything in the app rolls up into a single **Optimization Score (0–100)** on the Home page, backed by **five health pillars**:

| Pillar | What it measures |
|---|---|
| **Found on Google** | Search Console leaks (impressions with no clicks) and average rank. |
| **Local listings** | Name/Address/Phone consistency and Google Business Profile activity. |
| **AI recommends you** | How often AI answer engines actually cite/recommend you. |
| **Get listed** | How many of the third‑party sources AI trusts you're listed on. |
| **Fresh content** | How recently you've published, plus whether content autopilot is on. |

The score is a **weighted average of only the pillars it can actually measure** (a "trust rule" — it never invents a number for a pillar you haven't connected yet), snapshots weekly, and reports a 28‑day change. Under the score, **Your next moves** turns the current gaps into a short, ranked to‑do list — many items are **one‑tap** (e.g. turn on autopilot, post to GBP) right from Home.

---

## What's inside

The sidebar is split into **Main** (the everyday flow) and a collapsible **Advanced Tools** group (the deep controls, which auto‑expands when you open one).

### Main

1. **Home** *(default landing)* — your one‑glance snapshot: the Optimization Score, the five traffic‑light pillars, **Your next moves**, and two clearly‑labeled **estimated value** figures (Opportunity Value + Current Visibility Value).
2. **Grow** — your full, prioritized **to‑do list** (everything worth doing, ranked by impact) plus shortcuts straight into any tool.
3. **Reports** — *is it working?* Search performance this period vs the previous (impressions, clicks, average rank + top keyword movers), an AI‑visibility trend, a daily traffic trend, new leads from GoHighLevel, a **"What we handled for you this week"** activity feed, and a plain‑English **Weekly Digest**. The detailed KPI cards, stats, and published‑content list live here too.
4. **Settings** — API keys, admin password, business identity, and the business‑value assumptions that drive the estimates.

### Advanced Tools

5. **Searches You're Missing** *(GSC content gaps)* — queries with high impressions but **zero clicks** ("leaks") straight from Search Console; generate a page for one in a click.
6. **Create a Post** *(AI article creator)* — Gemini writes a structured HTML article (H1–H3 outline, step lists, comparison table, case‑study block, CTA, internal‑link placeholders, FAQ).
7. **Publish** *(publish & index + content autopilot)* — publishes to the GoHighLevel Blogs module, injects **JSON‑LD schema** (LocalBusiness, FAQPage, Author), resolves internal links, submits the URL to Google's Indexing API, and hosts the **content autopilot** (with a topic queue and cadence controls).
8. **AI Visibility Check** *(AIO/GEO audit)* — asks Gemini your query **with live Google Search grounding** and reads back whether you're actually recommended/cited, the real source URLs, and the competitors named. Real answer‑engine data, not a simulation.
9. **Where to Get Listed** *(citation outreach engine)* — a background scan finds the real third‑party sources AI cites (directories, review sites, "best‑of" lists) and turns them into an **action worklist**: a canonical **Listing Kit**, one‑click **AI‑drafted pitch emails** (send directly via Gmail or open pre‑filled), **copy‑paste listing payloads + claim links**, and a **status tracker** (To‑do → Submitted/Pitched → Live) that survives redeploys.
10. **Local Presence** *(local SEO)* — a **NAP consistency auditor**, a **review response/request** writer, a **Google Business Profile post generator** (and one‑tap posting when GBP API access is approved), and a scored local checklist.
11. **Site Optimization** *(on‑site SEO)* — a grounded **keyword & topic idea generator**, a **title & meta optimizer** with live character counts, an **internal‑link suggester**, and an **extended schema pack** (Service, Review template, Breadcrumb).

---

## Automation & autopilots

SEO Buddy is built to run itself between logins. Each autopilot keeps its own state, skips itself when disabled / already running / not yet due, catches up on a schedule, and surfaces a **"new since you last looked"** badge in the Reports activity feed.

- **Content autopilot** — finds a gap (or pulls the next topic from your **queue**) → writes → publishes → requests indexing, on a cadence you control. Indexing failures are non‑fatal (the publish is still recorded).
- **Local SEO autopilot** — periodic NAP check + GBP post drafting.
- **On‑Site SEO autopilot** — periodic keyword/title‑meta refresh.
- **Weekly citation auto‑scan** — re‑discovers the sources AI cites and diffs in new domains.
- **Weekly performance digest** — writes a plain‑English recap (leading with your Optimization Score) and can **email it automatically** via Gmail.

> **Note on indexing ownership.** Google's Indexing API requires the service account to be an **Owner** in Search Console (not just "Full"). With only "Full", indexing calls fail with *"Permission denied — failed to verify URL ownership"*; the rest of the app (GSC reads, publishing) still works.

---

## Onboarding & guidance

- **Setup wizard** — a first‑run modal (Welcome → Business info → Your numbers → Connect) that captures your business identity and value assumptions. Re‑open anytime from **🚀 Setup & business info** in the sidebar footer.
- **Quick Guide** — a floating interactive tour that walks Home → Grow → Reports → the six Advanced Tools, switching tabs and highlighting each area in plain English.
- **Light / Dark theme** — toggle in the sidebar footer; preference is remembered.

---

## Honest scope notes

- **Google Business Profile posting** now works **one‑tap** *once you have approved Business Profile API access + OAuth* (`GBP_*` env vars). Until then, the Local Presence tools **generate** the post content for you to paste in.
- **Gmail send** is direct/one‑click once `GMAIL_*` OAuth is configured; otherwise pitches open pre‑filled in a compose window.
- **Competitor keyword‑gap data** needs a paid tool (Semrush/Ahrefs), so the keyword generator produces **AI‑powered ideas**, not a rank export.
- **Review schema** ships with **placeholders** — never fabricate ratings.
- **Performance trend charts build over days** as snapshots accumulate.

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
| `DATA_DIR` | app folder | **Where all history/audits/logs/snapshots/score/profile files are stored.** On a container host, point this at a persistent volume (e.g. `/data`) so data survives redeploys. |
| `ADMIN_PASSWORD` | *(unset)* | When set, locks the sensitive endpoints (see **Security**). Enter the same value in Settings → Admin Password. Leave unset only for trusted local dev. |
| `ALLOWED_ORIGIN` | *(same‑origin)* | Optional comma‑separated CORS allowlist. Leave blank for same‑origin only. |

### Generative AI (Gemini)
| Variable | Default | Description |
|---|---|---|
| `GEMINI_API_KEY` | *(unset)* | Key from [Google AI Studio](https://aistudio.google.com/). Powers the article writer, AI Visibility Check, citation scans, Local Presence generators, and Site Optimization tools. |
| `GEMINI_MODEL` | `gemini-3.6-flash` | Model used for all Gemini generation. |

> **Grounding note:** the AI Visibility Check, citation scans, NAP audit, and keyword‑idea tools use **Grounding with Google Search**, which Google bills per search (with a free monthly allowance on the **paid/Tier‑1** plan). A free‑tier Gemini key returns `429 RESOURCE_EXHAUSTED` on grounded calls — use a billing‑enabled key.

### Google Search Console & Indexing
| Variable | Default | Description |
|---|---|---|
| `GOOGLE_APPLICATION_CREDENTIALS` | *(unset)* | Path to a service‑account JSON key **or** the full raw JSON string (auto‑detects a value starting with `{`). Powers Search Console reads + the Indexing API. |
| `GSC_SITE_URL` | *(unset)* | Your verified property, matching its type **exactly**: `sc-domain:example.com` (Domain) or `https://example.com/` (URL‑prefix). |

### GoHighLevel
| Variable | Description |
|---|---|
| `GHL_ACCESS_TOKEN` | Private Integration token. `blogs.*` scopes for publishing; **contacts** scope also enables the Reports leads count. |
| `GHL_LOCATION_ID` | Your GHL Location ID. |
| `GHL_BLOG_ID` | Target blog folder ID. |
| `GHL_AUTHOR_ID` / `GHL_AUTHOR_NAME` / `GHL_AUTHOR_URL` | Optional author attribution + E‑E‑A‑T author schema. |
| `GHL_BLOG_PATH_PREFIX` | Blog path prefix for building URLs (default `/blog/posts`). |

### Gmail send (optional — enables one‑click pitches + digest email)
| Variable | Description |
|---|---|
| `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` | OAuth client credentials for a Gmail‑send app. |
| `GMAIL_REFRESH_TOKEN` | OAuth refresh token authorizing send‑as. |
| `GMAIL_SENDER` | The "from" address shown on sent mail. |
| `DIGEST_EMAIL` | Default recipient for the automatic Weekly Digest email. |

### Google Business Profile posting (optional — needs approved API access)
| Variable | Description |
|---|---|
| `GBP_CLIENT_ID` / `GBP_CLIENT_SECRET` | OAuth client credentials (falls back to the `GMAIL_*` client if unset). |
| `GBP_REFRESH_TOKEN` | OAuth refresh token for the Business Profile scope. |
| `GBP_ACCOUNT_ID` / `GBP_LOCATION_ID` | The account + location the posts publish to. |

---

## Connecting each integration

### 1. Gemini
Create a key in Google AI Studio, ensure the project has **billing enabled** (for grounded features), and set `GEMINI_API_KEY`.

### 2. Google Search Console + Indexing API
1. In [Google Cloud Console](https://console.cloud.google.com/), enable **Google Search Console API** and **Web Search Indexing API**.
2. Create a **service account** and download a **JSON key**.
3. In Search Console → **Settings → Users and permissions**, add the service‑account email (its `client_email`). Use **Full** for reads; the Indexing API additionally requires **Owner**.
4. Set `GOOGLE_APPLICATION_CREDENTIALS` and `GSC_SITE_URL` (matching your property type exactly).

### 3. GoHighLevel
Grab your **Location ID**, create a **Private Integration** token (blog scopes to publish; add contacts scope for the leads metric), and note your **Blog ID**.

### 4. Gmail send *(optional)*
Create an OAuth client (Desktop or Web), authorize the Gmail send scope, and set `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_SENDER` (and `DIGEST_EMAIL` for the auto‑digest recipient).

### 5. Google Business Profile *(optional)*
Requires **approved Business Profile API access** from Google. Once granted, authorize the Business Profile scope and set `GBP_REFRESH_TOKEN`, `GBP_ACCOUNT_ID`, `GBP_LOCATION_ID` (client id/secret reuse the `GMAIL_*` pair unless you set `GBP_CLIENT_ID`/`GBP_CLIENT_SECRET`).

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
2. **Attach a Volume** and set `DATA_DIR` to its mount path (e.g. `/data`). **Important:** container filesystems are wiped on every redeploy, so without a volume your Optimization Score history, audits, published‑content list, autopilot state, and Performance snapshots reset each deploy. On startup the server logs `💾 Data dir: … (persistent)` when a volume is configured.
3. Set `ADMIN_PASSWORD` and enter the same value in Settings → Admin Password.

Deploying by hand (GitHub web upload): the whole app is one bundle — `server.js` at the repo **root**, and `app.js` / `index.html` / `style.css` under **`public/`**.

---

## Business identity & value estimates

- **Business identity** (name, address, phone, socials) is editable in‑app via the setup wizard / Settings and is saved to `business-profile.json`; it seeds a location id for the eventual franchise/multi‑location model.
- Home's **Opportunity Value** and **Current Visibility Value** are **estimates**, driven by three assumptions you control in **Settings → Business Value**: value of a new client (default `1395`), visitor → client conversion % (default `2`), and search capture % (default `5`). They're clearly labeled as estimates in the UI.

---

## API reference

🔒 = requires `ADMIN_PASSWORD` when it is set.

### Score, snapshot & guidance
| Method | Endpoint | Auth | Purpose |
|---|---|:---:|---|
| GET | `/api/health-score` | — | Optimization Score: five pillars, weighted avg of measured pillars, weekly snapshot + 28‑day delta. |
| GET | `/api/next-moves` | — | Ranked next‑best actions for Home / Grow. |
| GET | `/api/gsc-data` | — | Search Console queries (live or mock). |
| GET | `/api/performance` | — | Period‑over‑period trends, snapshots, AI‑visibility trend, leads. |
| GET | `/api/history` | — | Published‑content history. |
| GET | `/api/business-profile` | — | Saved business identity + configured flag. |
| POST | `/api/business-profile` | 🔒 | Save business identity (name/address/phone/socials). |
| POST | `/api/save-settings` | 🔒 | Persist configuration to the server. |

### Content
| Method | Endpoint | Auth | Purpose |
|---|---|:---:|---|
| POST | `/api/generate-article` | 🔒 | Generate an article with Gemini. |
| POST | `/api/publish-ghl` | 🔒 | Publish to GoHighLevel + inject schema. |
| POST | `/api/index-url` | 🔒 | Submit a URL to Google's Indexing API. |

### AI visibility (AIO/GEO)
| Method | Endpoint | Auth | Purpose |
|---|---|:---:|---|
| POST | `/api/aio-audit` | 🔒 | Run a live, Google‑grounded AI‑search audit. |
| GET | `/api/aio-history` | — | Past audits. |
| GET | `/api/aio-schema` | — | LocalBusiness + FAQ JSON‑LD. |

### Where to get listed (citations)
| Method | Endpoint | Auth | Purpose |
|---|---|:---:|---|
| POST | `/api/citation-targets` | 🔒 | Find + classify the third‑party sources AI cites (one‑shot). |
| GET | `/api/citation-worklist` | — | Cached worklist: targets + tracker statuses + listing kit. |
| POST | `/api/citation-scan` | 🔒 | Re‑run the grounded scan and refresh the cached worklist. |
| POST | `/api/citation-status` | 🔒 | Update one target's tracker status (todo/submitted/pitched/live). |
| POST | `/api/citation-outreach` | 🔒 | Draft a pitch email, or build a listing payload + claim link. |
| GET | `/api/listing-kit` | — | Canonical listing kit (NAP, categories, descriptions, photo checklist). |
| POST | `/api/listing-kit` | 🔒 | Regenerate the kit's descriptions with Gemini. |
| POST | `/api/citation-autopilot/toggle` | 🔒 | Enable/disable the weekly citation auto‑scan. |
| POST | `/api/citation-autopilot/seen` | 🔒 | Clear the "new" badge. |

### Local presence
| Method | Endpoint | Auth | Purpose |
|---|---|:---:|---|
| POST | `/api/nap-audit` | 🔒 | Check NAP consistency across the web. |
| POST | `/api/local-generate` | 🔒 | Review responses/requests + GBP posts. |
| POST | `/api/local-reply` | 🔒 | Draft a reply to a specific review. |
| GET | `/api/local-autopilot` | — | Local autopilot state + last run. |
| POST | `/api/local-autopilot/toggle` · `/run` · `/seen` | 🔒 | Enable/disable, run now, clear badge. |

### Site optimization
| Method | Endpoint | Auth | Purpose |
|---|---|:---:|---|
| POST | `/api/onsite` | 🔒 | Keyword ideas / title‑meta / internal links. |
| GET | `/api/onsite-schema` | — | Service, Review (template), Breadcrumb JSON‑LD. |
| GET | `/api/onsite-autopilot` | — | On‑site autopilot state + last run. |
| POST | `/api/onsite-autopilot/toggle` · `/run` · `/seen` | 🔒 | Enable/disable, run now, clear badge. |

### Content autopilot & activity
| Method | Endpoint | Auth | Purpose |
|---|---|:---:|---|
| GET | `/api/autopilot-status` | — | Content autopilot state + logs. |
| POST | `/api/autopilot-toggle` | 🔒 | Enable/disable the schedule. |
| POST | `/api/autopilot-run-now` | 🔒 | Trigger one cycle now. |
| POST | `/api/autopilot-queue/add` · `/remove` | 🔒 | Manage the topic queue. |
| GET | `/api/autopilot-digest` | — | Aggregated "what we handled this week" feed. |

### Weekly performance digest
| Method | Endpoint | Auth | Purpose |
|---|---|:---:|---|
| GET | `/api/performance-digest` | — | Latest saved digest. |
| POST | `/api/performance-digest/run` · `/send` · `/toggle` · `/seen` | 🔒 | Generate, email, enable weekly, clear badge. |

### Outreach delivery (OAuth)
| Method | Endpoint | Auth | Purpose |
|---|---|:---:|---|
| GET | `/api/gmail-status` | — | Whether Gmail direct‑send is configured. |
| POST | `/api/send-pitch` | 🔒 | Send a citation pitch via Gmail (falls back to compose). |
| GET | `/api/gbp-status` | — | Whether Google Business Profile posting is configured. |
| POST | `/api/gbp-post` | 🔒 | Publish a pre‑built local post to Google Business Profile. |

---

## Data & persistence

State is stored as flat JSON in `DATA_DIR`:

| File | Contents |
|---|---|
| `health-score.json` | Weekly Optimization Score snapshots (for the 28‑day delta). |
| `history.json` | Published‑content history. |
| `performance.json` | Daily traffic/rank snapshots. |
| `aio-audits.json` | AI Visibility Check history. |
| `citations.json` | Citation worklist, tracker statuses, cached listing kit. |
| `local-autopilot.json` · `onsite-autopilot.json` | Local / on‑site autopilot state. |
| `autopilot-config.json` · `autopilot-logs.json` | Content autopilot config (incl. topic queue) + run logs. |
| `performance-digest.json` | Saved weekly digests + settings. |
| `business-profile.json` | Business identity (name/address/phone/socials). |

Point `DATA_DIR` at a persistent volume in production so this data survives redeploys. *(The GSC service‑account key saved from Settings is written separately as `google-creations.json` in the app folder.)*

---

## Tech stack

Node.js · Express · `@google/genai` (Gemini) · `googleapis` (Search Console, Indexing, Gmail, Business Profile) · GoHighLevel API · vanilla‑JS single‑page front‑end.

---

*License: MIT.*
