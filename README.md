# SEO Buddy — Total Rank System Dashboard

SEO Buddy is an automated **SEO + Answer‑Engine (AEO/GEO)** platform built for **Best Day Fitness** in St. Petersburg, Florida — and designed to roll out to a **franchise model**.

It scores how maximized your SEO/AEO is in a single number, tells a non‑technical owner exactly **what to do next**, and then does much of the work on autopilot: it finds Google Search Console content gaps, writes authoritative E‑E‑A‑T content with Google Gemini, publishes to GoHighLevel with structured data, requests instant Google indexing, **tracks your visibility across multiple AI answer engines** (Google now; ChatGPT & Perplexity when connected) with a competitor leaderboard and a **FactCheck** that flags what AI gets wrong about you, shows you **where to get listed** so AI recommends you, handles **local SEO** (NAP, reviews, Google Business Profile), **measures whether it's working** over time, and sharpens your **on‑site & technical SEO** — all in one dark, glassmorphic dashboard with a plain‑English owner view and a light/dark theme.

Two things keep the output from reading like generic AI text. Articles can be written **from a recording of the owner talking** — dictated live in the browser or uploaded and transcribed — so the specifics and stories come from a real person rather than the model's general knowledge. And a single editable **brand voice** drives every generated word, including a **never‑use list** that is checked against the finished copy, not just requested in the prompt.

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

The score is a **weighted average of only the pillars it can actually measure** (a "trust rule" — it never invents a number for a pillar you haven't connected yet). Formula v2 keeps full precision until the final display value, records one complete pillar snapshot per day, and uses a seven-day headline average so normal Search Console movement does not look like a sudden business change. The dashboard also shows the unsmoothed live score, data confidence, freshness, and a version-safe 28-day change. Under the score, **Your next moves** turns the current gaps into a short, ranked to-do list — many items are **one-tap** (e.g. turn on autopilot, post to GBP) right from Home.

---

## What's inside

The sidebar is deliberately short — **Today**, **Progress**, **Explore** — with Settings, setup, the Quick Guide and the theme toggle in a footer utility zone. Everything else lives inside Explore, grouped by what you're trying to do rather than by which subsystem it belongs to.

For the runtime map, end-to-end data flows, known scaling limits, and the
behavior-preserving refactoring sequence, see
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

### The three main screens

1. **Today** *(default landing)* — what needs you, and what SEO Buddy handled on its own. The **Optimization Score**, the five traffic‑light pillars, a ranked list of the highest‑impact fixes (many one‑tap), and an activity feed of what ran unattended.
2. **Progress** — *is it working?* Search performance this period vs the previous (impressions, clicks, average rank, top keyword movers), the two most trustworthy AI‑visibility metrics (**branded search**, real from GSC, and **AI‑referral traffic**), trend charts, new leads from GoHighLevel, and a plain‑English **Weekly Digest**. Downloadable as a PDF report.
3. **Explore** — every tool, in five groups.

### Explore → Get found

- **Searches you're missing** *(GSC content gaps)* — queries with impressions but **zero clicks** ("leaks") straight from Search Console. Generate a page for one in a click, or hit **❓ Questions** to reveal the **query fan‑out** — the sub‑questions a citable page must answer.
- **Where to get listed** *(citation outreach engine)* — a background scan finds the third‑party sources AI actually cites, then turns them into a worklist: a canonical **Listing Kit**, AI‑drafted **pitch emails** (sent via Gmail or opened pre‑filled), copy‑paste listing payloads with claim links, and a status tracker that survives redeploys.

### Explore → Your content

- **Create a post** — Gemini writes an **answer‑first, AEO‑optimized** article: a 40–60‑word direct answer up top, question‑style headers, self‑contained sections, a freshness date, step lists, a comparison table, CTA, internal‑link placeholders and an answer‑first FAQ.
  Optionally write it **in your own words**: hit **Dictate** and talk (the browser's own speech engine — free, nothing uploaded), or drop in a recording and Gemini transcribes it. The article is then built from your stories and specifics rather than the model's general knowledge, which is the one input a competitor can't copy. Every article comes back with a **fact‑check list** of the claims a human must verify, and any **off‑brand language** that slipped past the prompt.
- **Brand voice** — the single source of truth for everything the app writes. Tone, voice characteristics, writing‑style rules, the phrases that are yours, competitor positioning, local keywords, CTA — and a **never‑use list** that is *enforced*, not merely requested: the forbidden phrases go into every prompt **and** the finished copy is scanned for them afterwards, because models drop negative instructions. Editable in the app; no redeploy.
- **Publish & index** — publishes to the GoHighLevel Blogs module, injects **JSON‑LD schema** (LocalBusiness, FAQPage, Author), resolves internal links, submits the URL to Google's Indexing API, and hosts the **content autopilot** with its topic queue and cadence controls.
- **Site optimization** *(on‑site SEO)* — the **AEO Readiness Check** (paste any URL → scored against a 7‑point checklist with a *ready / quick‑win / needs‑rewrite* verdict and specific fixes), a grounded keyword & topic generator, a title & meta optimizer with live character counts, an internal‑link suggester, and an extended schema pack with a one‑click Google Rich Results validator.

### Explore → Your presence

- **Local presence** — a **NAP consistency auditor**, review response and request writers, a **Google Business Profile post generator** (one‑tap posting when GBP API access is approved), a scored local checklist, and the **Social Post Pack**: paste a transcript and get five angles, five hooks, a 30‑second script and a tappable seven‑platform checklist. A GBP post only reaches Google; this covers everywhere else.
- **AI visibility** *(the AEO command center)* — runs your tracked searches across **multiple engines** (Google now; ChatGPT and Perplexity when their keys are added) and scores how often you're recommended, with **Visibility Score / Share of Voice / Sentiment**, a trend over time, and a **competitor leaderboard**. Alongside it: **FactCheck** (what each engine gets wrong about you, with the correction), **AI crawler access** (does `robots.txt` actually let GPTBot/PerplexityBot/ClaudeBot in), and **Reddit visibility**.
- **Reviews site** — inventory of your published reviews by platform, average rating, month‑by‑month growth, and a structured‑data health check, with any problems listed alongside the specific fix.

### Explore → More detail

- **Full dashboard** — every metric in one place when you want numbers rather than a summary.
- **All to‑dos** — the complete prioritized action list, ranked by impact.

### Explore → Setup & help

**Setup & business info** (business identity + a readiness board), the **Quick Guide** tour, **Ask SEO Buddy** (the assistant), and **Settings** (API keys, admin password, usage budget, business‑value assumptions).

---

## Automation & autopilots

SEO Buddy is built to run itself between logins. Each autopilot keeps its own state, skips itself when disabled / already running / not yet due, catches up on a schedule, and surfaces a **"new since you last looked"** badge in the Reports activity feed.

- **Content autopilot** — finds a gap (or pulls the next topic from your **queue**) → writes → publishes → requests indexing, on a cadence you control. Indexing failures are non‑fatal (the publish is still recorded).
- **AI visibility auto‑weekly** — re‑runs the multi‑engine visibility check on a schedule so your score trend and competitor leaderboard fill in hands‑off (toggle in the AI Visibility Check tab).
- **Local SEO autopilot** — periodic NAP check + GBP post drafting.
- **On‑Site SEO autopilot** — periodic keyword/title‑meta refresh.
- **Weekly citation auto‑scan** — re‑discovers the sources AI cites and diffs in new domains.
- **Weekly performance digest** — writes a plain‑English recap (leading with your Optimization Score) and can **email it automatically** via Gmail.

> **Note on indexing ownership.** Google's Indexing API requires the service account to be an **Owner** in Search Console (not just "Full"). With only "Full", indexing calls fail with *"Permission denied — failed to verify URL ownership"*; the rest of the app (GSC reads, publishing) still works.

---

## Onboarding & guidance

- **Setup wizard** — a first‑run modal (Readiness board → Business info → Your numbers → Connect) that captures your business identity and value assumptions. Step 1 is a **readiness board**: seven checks covering everything this location needs to run hands‑off (Gemini key, persistent storage, Search Console, GoHighLevel, admin password, business profile, brand voice), each with a fix link that jumps straight to the right place. Re‑open anytime from **Setup & business info** in the sidebar footer.
- **Quick Guide** — a floating interactive **14‑step tour** that walks Today → Progress → Explore, then each tool in the order you'd actually use it, and finishes on the **SEO Buddy Assistant** — switching tabs and highlighting each area in plain English.
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

Local development boots in **Demo Mode** so you can explore every tab before connecting live services. Railway and explicit production environments fail closed: missing or failed integrations are shown as unavailable and never produce fabricated generation, publishing, indexing, or Search Console success.

Requires **Node.js 20 or newer**. Run the isolated route/security suite with:

```bash
npm run check
npm test
```

Every push to `main` and every pull request runs both commands in GitHub Actions.

---

## Configuration (environment variables)

Set these in your host's environment (e.g., Railway → Variables) or, for local use, in a `.env` file.

### Core
| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the server listens on. |
| `APP_MODE` | auto-detected | `production`, `development`, `test`, or `demo`. Railway is detected as production automatically. Production never permits mock integration success. |
| `ALLOW_MOCK_INTEGRATIONS` | `true` outside production | Set to `false` to make local development fail closed too. This cannot enable mocks in production. |
| `DATA_DIR` | app folder | **Where all history/audits/logs/snapshots/score/profile files are stored.** On a container host, point this at a persistent volume (e.g. `/data`) so data survives redeploys. |
| `ADMIN_PASSWORD` | *(unset)* | When set, locks the sensitive endpoints (see **Security**). Enter the same value in Settings → Admin Password. Leave unset only for trusted local dev. |
| `OPERATOR_PASSWORD` | *(unset)* | Optional lower-privilege password for running publishing, indexing, audits, and autopilots without permission to change integration secrets, business identity, brand voice, or budgets. |
| `AUDIT_SIGNING_KEY` | *(unset)* | Optional stable secret used to HMAC-sign the mutation audit chain. Keep it separate from passwords and do not rotate it unless you intentionally start a new verification chain. |
| `ALLOWED_ORIGIN` | *(same‑origin)* | Optional comma‑separated CORS allowlist. Leave blank for same‑origin only. |

### Generative AI (Gemini)
| Variable | Default | Description |
|---|---|---|
| `GEMINI_API_KEY` | *(unset)* | Key from [Google AI Studio](https://aistudio.google.com/). Powers the article writer, AI Visibility Check, citation scans, Local Presence generators, and Site Optimization tools. |
| `GEMINI_MODEL` | `gemini-3.6-flash` | Model used for all Gemini generation. |

> **Grounding note:** the AI Visibility Check, citation scans, NAP audit, and keyword‑idea tools use **Grounding with Google Search**, which Google bills per search (with a free monthly allowance on the **paid/Tier‑1** plan). A free‑tier Gemini key returns `429 RESOURCE_EXHAUSTED` on grounded calls — use a billing‑enabled key.

### Extra AI engines (optional — widen AI Visibility beyond Google)
The multi‑engine AI Visibility dashboard and FactCheck run on **Google alone** by default. Add either or both of these to also track **ChatGPT** and **Perplexity** — each engine lights up automatically once its key is present, and nothing breaks if they're absent.

| Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | *(unset)* | Enables the **ChatGPT** engine. From [platform.openai.com](https://platform.openai.com/) — a paid, pay‑per‑use API account (separate from a ChatGPT Plus subscription; there's no usable free tier). |
| `OPENAI_MODEL` | `gpt-4o` | Model used for the ChatGPT engine. |
| `PERPLEXITY_API_KEY` | *(unset)* | Enables the **Perplexity** engine. From the Perplexity API dashboard — paid, prepaid credits (no free tier). |
| `PERPLEXITY_MODEL` | `sonar` | Model used for the Perplexity engine. |

> **Cost note:** both are pay‑as‑you‑go (not subscriptions). At this app's scale (a handful of prompts, run weekly) each runs roughly cents per month. All answer‑analysis still uses Gemini, so a Gemini key is required regardless.

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

### Trustpilot (optional — adds a fourth platform to the Reviews tab)
Dormant unless **both** variables are set. Unconfigured, the Reviews tab looks exactly as it does today: no Trustpilot row, and no failing check for a service you don't use.

| Variable | Description |
|---|---|
| `TRUSTPILOT_API_KEY` | API key from Trustpilot Business → Integrations → **Developers → APIs**. Requires a paid Trustpilot plan; the free tier has no API module. |
| `TRUSTPILOT_DOMAIN` | The domain the Trustpilot profile is registered under, e.g. `bestdayfitness.com`. Protocol and `www.` are stripped for you. |

Once configured it reads TrustScore, stars and review count from the public Business Units API, shows them beside Google/Facebook/Yelp on the Reviews tab, and **compares the Trustpilot number printed on your reviews page against the live one**, so a hand-typed total that has drifted gets flagged instead of quietly ageing.

It also **monitors the profile over time**. One reading is recorded per day alongside the existing reviews snapshots, and the Reviews tab reports movement rather than level — because a score on its own tells you nothing you can act on. Three checks watch for the ways a review profile goes wrong:

| Check | Fires when |
|---|---|
| TrustScore is holding or rising | the score is lower than it was 30 days ago |
| No new one- or two-star reviews | the 1★+2★ count has grown |
| Still collecting new reviews | no new reviews in 30 days — Trustpilot weights recent reviews most, so a stalled profile slides on its own |

Before 30 days of history exists it compares against the oldest reading it holds and says so ("since 2026-08-14") rather than reporting nothing. A failed API call leaves a gap in the history instead of writing a false zero.

It deliberately does not fetch review *text*. That needs the Service Reviews API and OAuth: a larger integration on a higher plan tier.

---

## Connecting each integration

### 1. Gemini
Create a key in Google AI Studio, ensure the project has **billing enabled** (for grounded features), and set `GEMINI_API_KEY`. This is the one required AI key — it powers Google's engine plus all answer analysis.

### 1b. ChatGPT & Perplexity *(optional — extra AI‑visibility engines)*
To track ChatGPT, create a paid API account at [platform.openai.com](https://platform.openai.com/) (add a payment method) and set `OPENAI_API_KEY`. To track Perplexity, get an API key with prepaid credits from the Perplexity API dashboard and set `PERPLEXITY_API_KEY`. Add either, both, or neither — each engine appears in the dashboard the moment its key is set.

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
- `ADMIN_PASSWORD` is the **owner** role. An optional `OPERATOR_PASSWORD` can run day-to-day SEO workflows but receives `403` if it tries to change credentials, business identity, brand voice, or the usage budget. Existing owner-password behavior is unchanged.
- The dashboard sends the password as a Bearer token. It is kept only for the current browser-tab session, not in persistent browser storage.
- API keys entered in Settings are sent once to the server, cleared from the form after a successful save, and never retained in browser local storage. With `DATA_DIR` configured, the server stores its settings file and Google service-account file on that persistent volume with restricted file permissions.
- Every state-changing API request is recorded in `audit-log.jsonl` with its request ID, role, action, outcome, and a chained integrity hash. Headers, request bodies, credentials, and generated content are never written. Set `AUDIT_SIGNING_KEY` for HMAC verification.
- Browser responses enforce a Content Security Policy, same-origin isolation headers, HTTPS upgrades in production, frame blocking, and restricted browser permissions. All executable scripts are same-origin, content-hashed files; the page no longer needs an inline script block.
- If `ADMIN_PASSWORD` is unset, the server logs a startup warning and those endpoints are open — fine for local dev, not for public hosting.
- Restrict cross‑origin access with `ALLOWED_ORIGIN` if needed.

---

## Deploying (Railway)

The app auto‑deploys from the GitHub `main` branch.

1. Set the environment variables above in the service's **Variables**.
   Railway is automatically treated as `APP_MODE=production`; setting it explicitly is recommended for clarity.
2. **Attach a Volume** and set `DATA_DIR` to its mount path (e.g. `/data`). **Important:** container filesystems are wiped on every redeploy, so without a volume your Optimization Score history, audits, published‑content list, autopilot state, Performance snapshots, and settings entered through the UI reset each deploy. The structured `server.started` log records whether persistent storage is enabled.
3. Set `ADMIN_PASSWORD` and enter the same value in Settings → Admin Password.

`railway.json` makes Railway wait for `/health/ready` before switching traffic to a new deployment and restarts a crashed process on failure. After a deploy, run the same read-only smoke check used during release verification:

```bash
npm run smoke -- https://your-service.up.railway.app
```

Set `REQUIRE_LIVE_GSC=1` when the smoke run must also prove Search Console is live. The script never generates, publishes, indexes, or spends AI credits.

Deploying by hand (GitHub web upload): keep `server.js`, `lib/`, `public/`, and `scripts/` together. The server reads the browser sources at boot and injects content-hashed URLs into `index.html`; there is no separate frontend build artifact to upload.

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
| GET | `/api/performance` | — | Period‑over‑period trends, snapshots, AI‑visibility trend, **branded search** (real, from GSC) + **AI‑referral** state, leads. |
| GET | `/api/history` | — | Published‑content history. |
| GET | `/api/business-profile` | — | Saved business identity + configured flag. |
| POST | `/api/business-profile` | 🔒 | Save business identity (name/address/phone/socials). |
| POST | `/api/save-settings` | 🔒 | Persist configuration to the server. |

### Operations
| Method | Endpoint | Auth | Purpose |
|---|---|:---:|---|
| GET | `/health/live` | — | Cheap process liveness probe. Returns `503` while gracefully shutting down. |
| GET | `/health/ready` | — | Deployment readiness probe: traffic acceptance, writable storage, and runtime mode. |
| GET | `/api/diagnostics` | 🔒 | Bounded request totals, latency buckets, process uptime, runtime mode, and storage state. |
| GET | `/api/auth/status` | — | Whether owner/operator roles are configured (never returns credentials). |
| GET | `/api/audit-status` | 🔒 owner | Verify the audit hash/signature chain and return its entry count. |

### Content
| Method | Endpoint | Auth | Purpose |
|---|---|:---:|---|
| POST | `/api/generate-article` | 🔒 | Generate an **answer‑first, AEO‑optimized** article with Gemini. Accepts an optional `transcript` to write from the owner's own words; returns `claimsToCheck` and `brandViolations`. |
| POST | `/api/transcribe` | 🔒 | Transcribe an uploaded recording (audio or video, ≤18MB) via Gemini. |
| POST | `/api/social-pack` | 🔒 | Turn a transcript into 5 ideas → 5 hooks → a 30‑second script. |
| POST | `/api/publish-ghl` | 🔒 | Publish to GoHighLevel + inject schema. |
| POST | `/api/index-url` | 🔒 | Submit a URL to Google's Indexing API. |

### Brand voice
| Method | Endpoint | Auth | Purpose |
|---|---|:---:|---|
| GET | `/api/brand-profile` | — | The active brand profile plus the seeded defaults. |
| POST | `/api/brand-profile` | 🔒 | Save the profile. Partial saves merge, so a single field can never blank the rest. |
| POST | `/api/brand-profile/reset` | 🔒 | Restore the seeded profile. |

### Reviews site
| Method | Endpoint | Auth | Purpose |
|---|---|:---:|---|
| GET | `/api/reviews-stats` | — | Review inventory by platform, average rating, monthly growth, structured‑data health. |

### AI visibility — multi-engine (AEO command center)
| Method | Endpoint | Auth | Purpose |
|---|---|:---:|---|
| GET | `/api/ai-visibility` | — | Engine status, tracked prompts, latest snapshot, deltas, trend, schedule state. |
| POST | `/api/ai-visibility/run` | 🔒 | Run a fresh sweep across enabled engines; score Visibility/SoV/Sentiment + leaderboard. |
| POST | `/api/ai-visibility/toggle` | 🔒 | Enable/disable the weekly auto‑check. |
| POST | `/api/ai-visibility/prompts` | 🔒 | Set the tracked search prompts (≤25). |
| GET | `/api/ai-factcheck` | — | Latest FactCheck: what each engine gets right/wrong about you. |
| POST | `/api/ai-factcheck/run` | 🔒 | Ask each engine about the business and diff vs the real profile. |
| GET | `/api/ai-crawlers` | — | Latest AI‑crawler access audit (robots.txt). |
| POST | `/api/ai-crawlers/run` | 🔒 | Fetch the site's robots.txt and check GPTBot/PerplexityBot/etc. access. |
| GET | `/api/reddit-threads` | — | Latest Reddit‑visibility results. |
| POST | `/api/reddit-threads/run` | 🔒 | Grounded search for high‑intent Reddit threads to engage. |

### AI visibility — single-search spot-check
| Method | Endpoint | Auth | Purpose |
|---|---|:---:|---|
| POST | `/api/aio-audit` | 🔒 | Run a live, Google‑grounded audit for one query. |
| GET | `/api/aio-history` | — | Past spot‑check audits. |
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
| POST | `/api/onsite` | 🔒 | Tools: keyword ideas / title‑meta / internal links / **`aeoReadiness`** (score a page URL vs the 7‑point AEO checklist) / **`fanout`** (sub‑questions for a search gap). |
| GET | `/api/onsite-schema` | — | JSON‑LD: **FAQPage, Article, HowTo** (AEO‑priority) + Service, Review (template), Breadcrumb. |
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
| `health-score.json` | Daily, versioned Optimization Score snapshots with pillar inputs, confidence and freshness metadata. |
| `history.json` | Published‑content history. |
| `performance.json` | Daily traffic/rank snapshots. |
| `ai-visibility.json` | Multi‑engine visibility snapshots (score/SoV/sentiment/leaderboard over time), tracked prompts, auto‑weekly schedule. |
| `ai-factcheck.json` | Latest per‑engine brand‑accuracy results. |
| `ai-crawlers.json` | Latest AI‑crawler access (robots.txt) audit. |
| `reddit-threads.json` | Latest Reddit‑visibility results. |
| `aio-audits.json` | Single‑search spot‑check history + AI‑visibility trend source. |
| `citations.json` | Citation worklist, tracker statuses, cached listing kit. |
| `local-autopilot.json` · `onsite-autopilot.json` | Local / on‑site autopilot state. |
| `autopilot-config.json` · `autopilot-logs.json` | Content autopilot config (incl. topic queue) + run logs. |
| `performance-digest.json` | Saved weekly digests + settings. |
| `business-profile.json` | Business identity (name/address/phone/socials). |
| `brand-profile.json` | Brand voice: tone, style rules, signature phrases, never‑use list, positioning, keywords, CTA. |
| `audit-log.jsonl` | Hash-chained mutation audit records (metadata only; never request bodies or secrets). |
| `.env` | Integration settings saved through the UI (server-side only). |
| `google-creations.json` | Google service-account credentials saved through the UI (server-side only). |

Point `DATA_DIR` at a persistent volume in production so this data survives redeploys.

---

## Tech stack

Node.js · Express · `@google/genai` (Gemini) · `googleapis` (Search Console, Indexing, Gmail, Business Profile) · OpenAI & Perplexity REST APIs (optional AI‑visibility engines) · GoHighLevel API · vanilla‑JS single‑page front‑end.

The browser code is split by responsibility: `public/modules/core.js` owns authentication and safe rendering helpers, `assistant.js` owns the copilot, `reviews.js` owns review monitoring, and `public/app.js` coordinates the remaining dashboard features. `lib/browser-assets.js` gives every stylesheet and script a deterministic content hash with immutable caching, while HTML always revalidates and points to the current files.

---

*License: MIT.*
