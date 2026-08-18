# SEO Buddy architecture and refactoring guide

This document describes the runtime that exists today, the complete data flow,
the risks that constrain scale, and a behavior-preserving path toward a cleaner
architecture. It is based on the executable code, not only the README.

## System at a glance

SEO Buddy is a single-process Node.js application serving a vanilla-JavaScript
single-page dashboard and 78 JSON endpoints.

```text
Browser
  public/index.html + public/app.js + public/style.css
      |
      | same-origin HTTP /api/*
      v
Express process (server.js)
  middleware -> auth -> route handlers -> domain workflows
      |                                  |
      |                                  +-> Gemini / OpenAI / Perplexity
      |                                  +-> Google Search Console / Indexing
      |                                  +-> Gmail / Google Business Profile
      |                                  +-> GoHighLevel
      |                                  +-> reviews website / robots.txt
      v
in-memory state <-> JSON files under DATA_DIR
                         |
                         +-> persistent Railway volume in production
```

There is no database, worker process, queue, cache server, build step, or client
framework. The HTTP process owns API traffic, schedules, integration calls, and
persistence.

## Boot and configuration flow

1. `DATA_DIR` is selected before configuration is loaded. The process reads
   `DATA_DIR/.env`, then host environment variables and UI-saved settings become
   the integration configuration (`server.js`, startup block).
2. Express installs security headers, optional CORS, a 34 MB parser only for
   transcription, the default JSON parser for every other API, and static-file
   serving from `public/`.
3. Each feature loads its JSON file synchronously into a module-level object or
   array. Missing files receive defaults; malformed files usually fall back to
   an empty/default state.
4. Scheduler timers are registered in the web process for content, AI
   visibility, citation, local, on-site, and performance-digest automation.
5. The HTTP listener starts and the browser downloads the static dashboard.

Host-provided environment variables are the deployment configuration. The
Settings API can also write a server-side `.env` and Google service-account
file under `DATA_DIR`; values saved there take effect in the running process.

## Browser data flow

`public/app.js` is one `DOMContentLoaded` closure containing application state,
DOM lookups, rendering, navigation, authentication, and all API orchestration.

Read flow:

1. A tab loader calls one or more `GET /api/*` endpoints.
2. The server builds a response from in-memory JSON state and, for several
   endpoints, live third-party APIs.
3. The browser converts the JSON into escaped HTML strings and inserts them
   into the relevant panel.

Mutation flow:

1. The browser reads the admin password from session storage and adds it as a
   bearer token through `authFetch`.
2. `requireAuth` performs a timing-safe comparison and tracks failed attempts
   per client address in memory.
3. The route validates the request, calls a feature workflow, mutates in-memory
   state, persists the corresponding JSON file, and returns JSON.
4. The browser refreshes the affected panel or polls a read endpoint until a
   long-running workflow clears its `running` flag.

The server marks all API responses `no-store`. HTML from AI and integrations is
treated as untrusted: server-side content sanitization protects publishing, and
browser rendering uses escaping/sanitization helpers.

## Major backend workflows

### Search performance and health

`GET /api/performance` obtains two 28-day Search Console ranges, derives movers,
branded search, and daily snapshots, then optionally loads recent GoHighLevel
contacts. `GET /api/health-score` combines that performance result with local
listing, AI-audit, citation, and content state.

The Results screen requests performance and health together. Health also needs
performance, so overlapping calls are now coalesced in `lib/single-flight.js`.
Only active work is shared; the next request always computes fresh data.

### Content generation, publishing, and indexing

1. A keyword, optional case study, CTA, and transcript reach
   `POST /api/generate-article`.
2. The article workflow builds a brand-grounded prompt and calls Gemini, or
   uses the documented fallback when AI is unavailable.
3. Generated HTML is sanitized and returned to the browser editor.
4. `POST /api/publish-ghl` sanitizes again, adds schema, publishes or simulates
   the GoHighLevel result, records history, and can request indexing.
5. `POST /api/index-url` validates that the URL belongs to the configured site
   before invoking Google's Indexing API.

The content autopilot runs the same generation/publish/index helpers on a timer,
choosing queued topics, Search Console gaps, or rotating target keywords.

### AI visibility and discovery

Google Gemini, OpenAI, and Perplexity are normalized behind provider functions.
Visibility sweeps ask configured engines the tracked prompts, then use Gemini to
score recommendation, sentiment, competitors, and citations. Fact checking,
Reddit discovery, citation discovery, and NAP discovery use grounded Gemini
searches and persist their latest results.

Both citation endpoints now use one `discoverCitationTargets` implementation.
The public response contract remains different where intended: the finder
returns discovery results, while the worklist scan also merges saved statuses.

### Local, on-site, and scheduled automation

Local automation saves NAP checks, Google Business Profile drafts/history, and
review replies. On-site automation saves keyword ideas, internal links, and
title/meta suggestions. Performance digest automation combines performance,
health, and trend data and can send through Gmail.

Each feature has a process-local `running` boolean plus startup and 12-hour
timers. This prevents overlap inside one Node process only.

### Reviews-site monitoring

`GET /api/reviews-stats` fetches the configured reviews site, parses its known
markup, evaluates inventory and structured-data consistency, and stores at most
365 daily snapshots. Network calls have a timeout and parsing fails soft so one
markup miss becomes a reported check rather than a server crash.

## Persistence model

The application keeps feature state in memory and rewrites JSON documents under
`DATA_DIR`. Examples include article history, usage, visibility snapshots,
citations, health, reviews, and each autopilot's state.

All ordinary JSON state writes now go through `lib/json-file-store.js`. It writes
the complete new document beside the destination and atomically renames it into
place. This prevents a killed process or failed partial write from replacing a
valid store with truncated JSON. Credential and `.env` writes retain their
separate restrictive file-mode handling.

Atomic replacement improves single-process durability; it does **not** make the
files safe for multiple writers. Two replicas can still load the same old value
and replace each other's updates.

## Critical problem areas

### 1. Backend and frontend monoliths

`server.js` is roughly 4,700 lines and contains 78 routes, persistence,
integration clients, scheduling, validation, prompts, and domain calculations.
`public/app.js` is roughly 5,200 lines inside one closure. Changes have a large
blast radius, feature ownership is unclear, and isolated tests require starting
the complete application.

### 2. Flat-file state is a single-instance architecture

Module-level objects plus whole-document JSON replacement create lost-update
races across processes. In-memory locks, rate limits, and `running` flags are
also replica-local. Horizontal scaling would duplicate scheduled AI spend while
allowing replicas to overwrite state. Some collections are bounded, but article
history, visibility snapshots, usage months, and several histories can grow
indefinitely and make every write progressively more expensive.

### 3. Schedulers run inside the web process

Every replica registers the same timers. Restarts reset timer cadence, long API
work competes with interactive requests, and there is no durable lease, retry
policy, dead-letter record, or cross-process idempotency key. A transient crash
can lose a run; multiple replicas can execute the same costly run.

### 4. Third-party work is inconsistently bounded

Citation discovery fans out up to eight grounded searches and then up to twelve
classification calls at once. Other workflows are sequential. Several network
calls have explicit timeouts, while others depend on SDK defaults. The result is
a mix of quota bursts and long-tail request latency without a common retry,
timeout, concurrency, or circuit-breaker policy.

### 5. Runtime configuration and durable data are coupled

The application mutates `.env`, credential files, and `process.env` from an HTTP
route. That is convenient for one installation but difficult to audit, rotate,
or synchronize across replicas. A persistent application volume becomes both a
data store and a secret/configuration store.

### 6. Test coverage is broad but shallow

The integration suite proves that read routes respond, protected routes require
authentication, settings resist line injection, content is sanitized, and URL
tools reject unsafe destinations. It does not exercise successful external
integration paths, scheduler idempotency, JSON migration, concurrent writes,
browser rendering, or response-schema compatibility per endpoint.

### 7. Client code repeats orchestration and rendering concerns

Many tab loaders independently fetch, parse, catch, poll, and render. Domain
state, transport state, and DOM state are interleaved. Repeated requests for the
same dashboard resources and string-based rendering make performance tuning and
safe UI evolution difficult.

### 8. Large unbundled client payload

Static responses are compressed, report-only PDF libraries load on demand, and
hidden dashboard panels no longer initialize on first paint. The remaining
`public/index.html` and `public/app.js` monoliths are still downloaded and parsed
as one unit. Feature-level dynamic imports and content-hashed assets are the next
safe client-scale step.

## Target clean architecture

The system can be separated incrementally without changing endpoint behavior:

```text
src/
  app.js                     Express construction and middleware only
  config/                    validated immutable runtime configuration
  routes/                    HTTP validation, status codes, response mapping
    content.js
    visibility.js
    citations.js
    local.js
    performance.js
  services/                  use cases and orchestration
    content-service.js
    performance-service.js
    citation-service.js
  domain/                    pure scoring, parsing, prompts, schemas, policies
  integrations/              Gemini, OpenAI, Google, GHL, reviews clients
  repositories/              persistence interfaces
    json/                    current single-instance adapter
    database/                future transactional adapter
  jobs/                      durable scheduled job definitions
  shared/                    timeout, single-flight, errors, validation
public/
  core/                      API client, auth, escaping, navigation
  features/                  one module per dashboard area
test/
  unit/                      domain and shared helpers
  contract/                  endpoint request/response compatibility
  integration/               adapters with recorded/fake providers
```

Dependency direction should be inward: routes and jobs call services; services
call domain functions and repository/integration interfaces; pure domain code
does not import Express, the filesystem, or vendor SDKs.

## Behavior-preserving refactoring strategy

1. **Characterize first.** Add response-contract and pure-function tests around
   a feature before moving it. Keep all existing endpoint paths, status codes,
   payload keys, default values, and side-effect order.
2. **Extract infrastructure seams.** Continue moving generic persistence,
   single-flight, timeout, and error-policy helpers into small tested modules.
3. **Split one vertical slice at a time.** Move a route family into a router,
   then its orchestration into a service while keeping the original route as a
   compatibility boundary.
4. **Introduce repository interfaces.** Keep the JSON implementation first.
   Add schema versions and bounded retention. Later switch production to a
   transactional database without changing services or HTTP contracts.
5. **Move schedules to durable jobs.** Use one scheduler/queue with leases,
   idempotency keys, bounded concurrency, retries with jitter, and persisted run
   status. Web processes should enqueue or read status, not own recurring work.
6. **Standardize integrations.** Every outbound client should share deadlines,
   retry classification, concurrency limits, structured errors, and metering.
7. **Split browser features.** Preserve the existing DOM and visual behavior
   while extracting the API client and one feature controller at a time.
8. **Introduce an asset pipeline.** Split feature code, emit content-hashed
   filenames, and give immutable assets long-lived CDN caching while HTML keeps
   revalidating on every deployment.

## Non-negotiable compatibility invariants

- No endpoint path, method, auth requirement, payload shape, or user-visible
  workflow changes during architectural extraction.
- Publishing remains sanitized before external writes.
- URL fetching and indexing retain SSRF/domain validation.
- Missing integrations keep their current graceful unavailable/mock responses.
- Usage metering happens at the same workflow boundary as today.
- Persistent migrations are additive, versioned, restart-safe, and reversible.
- Scheduler work is idempotent before it is moved out of process.
