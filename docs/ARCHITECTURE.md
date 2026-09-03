# SEO Buddy architecture

This document is the engineering map for the production system. It describes
the code that runs today, its complete data flow, the boundaries introduced by
the production-hardening work, and the remaining scale limits. The HTTP API and
user workflows are compatibility boundaries: refactoring must not change them
without an explicit product decision.

## System context

SEO Buddy is a Node.js 20 and Express application. One Railway service serves a
vanilla-JavaScript dashboard, exposes 89 HTTP routes, executes integration
workflows, and runs an in-process worker backed by a durable queue. Production
uses PostgreSQL recovery and transactional job claiming; local development can
use the filesystem adapter. One application replica remains supported.

```text
Browser
  index.html + content-hashed CSS/JavaScript
        |
        | same-origin HTTP
        v
Express middleware
  security headers -> request ID/metrics -> size limits -> auth/audit
        |
        +-------------------- read routes ----------------------+
        |                                                       |
        v                                                       v
Domain workflows                                         Operations APIs
  scoring, content, attribution, reports                 health, readiness,
        |                                                queue, providers,
        |                                                backups, audit
        +----------+-------------------+-----------------------+
                   |                   |
                   v                   v
            Provider runtime      Durable job queue
            limits/timeouts/      idempotency/leases/
            retries/circuits      heartbeat/backoff
                   |                   |
        +----------+----------+        |
        |          |          |        |
     Google     GoHighLevel  AI APIs   |
        |          |          |        |
        +----------+----------+--------+
                   |
                   v
       Tenant state repository
       local atomic cache + durable outbox on DATA_DIR
                   |
                   +-> checksummed backups
                   +-> PostgreSQL recovery authority + transactional jobs
```

## Boot flow

1. `npm start` runs `scripts/prepare-state.mjs` first. In PostgreSQL mode it
   migrates under an advisory lock, replays pending outbox writes, hydrates the
   tenant cache, and imports legacy jobs before the HTTP process starts. Do not
   bypass prestart for production startup.
2. `lib/state-repository.js` resolves `TENANT_ID`, creates the tenant boundary,
   and safely copies legacy root state on the first tenant-aware boot.
3. Browser assets are hashed from their content and injected into the cached
   HTML template. HTML revalidates; hashed assets are immutable.
4. Express installs same-origin security policy, lifecycle probes, correlation
   IDs, bounded metrics, compression, route-specific upload limits, global JSON
   limits, access control, and mutation auditing.
5. Saved configuration is read from `DATA_DIR`; host variables take precedence
   at boot. Feature state is loaded from the hydrated tenant repository. Missing
   files receive explicit defaults; writes use atomic file replacement and a
   durable outbox sends document changes to PostgreSQL.
6. Job handlers and the leased job worker start. Timers enqueue idempotent jobs
   instead of running expensive workflows directly.
7. PostgreSQL mode initializes the transactional queue before starting its
   worker. Filesystem mode can optionally mirror state to PostgreSQL; this
   optional mirror is not the same as the production PostgreSQL recovery mode.
8. Railway sends traffic only after `/health/ready` confirms traffic acceptance
   and writable persistent storage.

## Request and authorization flow

Public GET routes supply dashboard state. State-changing and credit-spending
routes require an owner or operator bearer credential. Settings, credentials,
backup creation, and audit verification are owner-only. Comparisons are timing
safe and failed attempts are rate limited.

Every request receives an `X-Request-Id`. Mutation audit records contain only
request metadata, role, outcome, and a chained integrity hash; request bodies,
headers, generated copy, and credentials are excluded. Set `AUDIT_SIGNING_KEY`
to authenticate the audit chain with HMAC.

API and health responses are `no-store`. Browser responses deny framing,
restrict permissions and origins, isolate the opener, and apply a same-origin
Content Security Policy. The transcription route has a separate upload limit;
all other JSON routes keep the small global limit.

## Browser flow

`public/index.html` is the shell. `public/modules/core.js` owns authentication
and safe rendering utilities, `assistant.js` owns the copilot, `reviews.js` owns
review monitoring, `recorded-content.js` owns transcription, dictation, and
social-pack interactions, `citations.js` owns the citation worklist and outreach
controls, `local-presence.js` owns local autopilot, NAP, review-response, Google-post,
and checklist interactions, `performance.js` owns Progress rendering, charts, and
weekly-digest controls, `site-optimization.js` owns on-site autopilot, keyword,
AEO, title/meta, internal-link, and schema interactions, `ai-visibility.js` owns
grounded audits, multi-engine visibility, FactCheck, crawler, Reddit, and schema
interactions, `brand-profile.js` owns the Brand Voice editor and readiness event,
`owner-mode.js` owns the owner Today, Results, Business, and action views,
`search-opportunities.js` owns Search Console gaps, filters, statistics, and
question fan-out,
`settings.js` owns connection fields, secure settings submission, and Search
Console diagnostics,
`content-workspace.js` owns the shared draft/editor, publishing, indexing,
history, and content-autopilot interactions,
`pdf-report.js` owns report assembly and PDF-library loading,
and `theme.js` owns theme behavior. `public/app.js` remains the main feature coordinator.

The browser loads only the visible dashboard work initially. Feature loaders
use same-origin APIs and render escaped values. PDF reporting, Reviews, recorded
content, Citations, Local Presence, Progress, Site Optimization, AI Visibility,
Brand Voice, and Owner mode load on demand; the PDF vendor libraries remain
behind the report module's second-stage loader. Search opportunities also load
only when opened, while their content-creation handoff stays in the coordinator.
Settings form wiring and diagnostics load only when Settings is opened; unsaved
form edits survive navigation and legacy browser-secret cleanup still runs at
startup. Content creation and publishing share one lazy module so switching
between them cannot create a second draft state or duplicate event handlers.
All secondary feature loads use `SeoBuddyCore.loadFeature`: same-origin hashed
asset validation, one in-flight promise per asset, API readiness verification,
a bounded timeout, and retry after failure. Core also owns common keyboard
actions, dialog focus handling, and relative-time labels.
Content-hashed assets prevent a deployment from combining new HTML with stale
JavaScript.

## Core data flows

### Search data to Optimization Score

1. Search Console is queried through the provider runtime.
2. Short-lived caching and single-flight coalescing prevent navigation bursts
   from multiplying identical provider calls.
3. Performance derives query gaps, ranking movement, branded search, and daily
   snapshots. GoHighLevel contacts are counted separately from contacts with
   explicit organic-search or AI-referral evidence.
4. `lib/health-score.js` combines measured Search, Local, AI Visibility,
   Citation, and Fresh Content pillars using versioned formula v2.
5. The response includes the unchanged score, confidence/freshness, each
   pillar's weighted contribution and headroom, missing sources, and the largest
   measurable opportunity.
6. A durable daily job records one compatible score snapshot. The displayed
   stable score averages up to seven same-version daily samples.

### Article generation to publication

1. An authenticated request supplies a topic, CTA, and optional transcript.
2. The brand profile and business facts become the Gemini prompt.
3. The provider boundary enforces the monthly budget, concurrency, deadline,
   and metrics. A successful call is metered centrally.
4. Generated HTML is sanitized, checked for blocked brand language, and scored
   by `lib/content-quality.js`.
5. A human can review or manually publish while seeing the quality warning.
   Automatic publishing stops on deterministic structural or brand-safety
   blockers and that queue job is not retried.
6. GoHighLevel publication and Google indexing use non-idempotent, no-retry
   provider policies. Indexing failure does not erase a successful publication.
7. Publication history stores the content-quality version and score.

### Scheduled automation

Content, AI visibility, citation scanning, local SEO, on-site SEO, performance
digest, score snapshots, and backups follow one path:

```text
timer or authenticated trigger
  -> enqueue with stable idempotency key
  -> persist transactional durable_jobs rows (or jobs.json in filesystem mode)
  -> claim lease
  -> heartbeat during work
  -> provider/domain workflow
  -> succeed, retry with bounded backoff, or fail terminally
```

`lib/job-dispatcher.js` centralizes scheduling and enqueue policy without
changing schedule windows, job identifiers, or retry counts. On deployment
shutdown, scheduled timers stop and active work is released for the replacement process.
The protected queue endpoint reports bounded status and never returns payloads.

### Provider calls

`lib/provider-runtime.js` is the policy boundary for Gemini, OpenAI,
Perplexity, Search Console, Indexing, GoHighLevel, Gmail, Business Profile,
Trustpilot, reviews, and remote audits. It provides per-provider concurrency and
rolling call limits, deadlines, safe read retries, circuit breakers, bounded
caching, stale reads where explicitly allowed, spend enforcement, and a
non-secret health snapshot. POST/publish/send operations are not automatically
retried.

### Persistence and backup

Runtime feature objects are cached in atomic JSON under
`DATA_DIR/tenants/<TENANT_ID>/`. The repository prevents path escape and leaves
legacy files intact after checksum-verified migration. Production uses
PostgreSQL as startup recovery authority plus the durable volume outbox for
pending writes. This is not transactional multi-replica feature state.
Daily file snapshots exclude configuration secrets and contain checksums.
The offline file-restore CLI verifies the manifest and creates a safety backup;
it is not a PostgreSQL database or transactional job-queue restore. See
OPERATIONS.md before any recovery operation.

`DATABASE_URL` enables immutable SQL migrations and an immediate, durable
outbox-backed PostgreSQL mirror with periodic reconciliation. With
`STATE_BACKEND=postgres`, the prestart step replays any pending outbox writes and
hydrates the local runtime cache from PostgreSQL before traffic is accepted. It
also imports existing file jobs once and switches claiming, leases,
idempotency, retries, and job history to the transactional `durable_jobs` table.
The current in-process feature model still uses that local cache during a run,
so one production replica remains the supported topology.

## Module boundaries

| Boundary | Responsibility |
| --- | --- |
| `server.js` | Composition root, HTTP compatibility layer, remaining feature orchestration |
| `lib/provider-runtime.js` | All outbound reliability, concurrency, caching, and spend policy |
| `lib/durable-job-queue.js` | Durable job state, leases, idempotency, retries, bounded history |
| `lib/job-worker.js` | Queue-agnostic claiming, heartbeats, handler execution, and shutdown |
| `lib/job-dispatcher.js` | Shared idempotent enqueue, recurring/daily timers, and scheduling shutdown |
| `lib/postgres-job-queue.js` | Transactional claims, leases, idempotency, and durable job history |
| `lib/state-repository.js` | Tenant containment and legacy state migration |
| `lib/json-file-store.js` | Atomic document replacement |
| `lib/backup-service.js` | Secret-free checksummed backup and restore |
| `lib/postgres-store.js` | Advisory-locked migrations and staged state mirror |
| `lib/access-control.js` / `audit-log.js` | Roles, authorization, tamper-evident mutation trail |
| `lib/configuration-routes.js` | Owner-only settings validation, secret persistence, activation, and storage status |
| `lib/health-score.js` | Pure, versioned scoring and stabilization |
| `lib/attribution.js` | Deterministic contact source classification |
| `lib/content-quality.js` | Deterministic article quality and automatic-publish gate |
| `lib/profile-routes.js` | Brand and business profile HTTP contracts |
| `lib/usage-routes.js` | AI usage reporting and owner budget HTTP contracts |
| `lib/gsc-routes.js` | Search Console queries, caching, page opportunities, and safe diagnostics |
| `lib/autopilot-routes.js` | Content autopilot schedule, queue, target, and manual-run HTTP contracts |
| `lib/content-routes.js` | Manual article generation, publishing, indexing, and history HTTP contracts |
| `lib/ai-visibility-routes.js` | AI Visibility status, tracked prompts, schedule, and manual-run HTTP contracts |
| `lib/ai-audit-routes.js` | Shared FactCheck, crawler-access, and Reddit status/run HTTP orchestration |
| `lib/aio-core-routes.js` | Grounded AIO audit, bounded audit history, and schema HTTP contracts |
| `lib/assistant-routes.js` | Grounded assistant prompt, bounded conversation, and confirmation-only action proposal contracts |
| `lib/recorded-content-routes.js` | Recording validation, Gemini transcription, and bounded social-pack generation contracts |
| `lib/dashboard-routes.js` | Score delivery, prioritized next moves, automation digest, and deployment-readiness projections |
| `lib/reviews-routes.js` | Reviews-site auditing, Trustpilot integration, snapshots, caching, and HTTP contracts |
| `lib/scheduled-feature-routes.js` | Shared state, toggle, run, and seen controls for scheduled dashboard features |
| `lib/google-delivery.js` | Gmail and Google Business Profile OAuth and provider adapters |
| `lib/delivery-routes.js` | Pitch, GBP post, and performance-digest delivery HTTP contracts |
| `lib/citation-routes.js` | Citation discovery, Listing Kit, scanning, tracking, and outreach HTTP contracts |
| `lib/local-seo-routes.js` | NAP auditing, local-copy generation, and review-reply HTTP contracts |
| `lib/performance-routes.js` | Search performance, branded-search trends, snapshots, and lead-attribution contracts |
| `lib/onsite-routes.js` | On-site generation, SSRF-safe AEO page auditing, and schema HTTP contracts |
| `public/modules/*` | Browser cross-cutting feature modules |
| `scripts/*` | Smoke verification, backup, restore, database migration |

## Problems corrected

- Mock fallbacks can no longer masquerade as live production success.
- Duplicate provider construction and policy logic now use one boundary.
- Overlapping Search Console/performance reads are cached and coalesced.
- Scheduled work survives deployments and has idempotency, leases, retries, and
  terminal failure handling.
- JSON writes are atomic, tenant-contained, backed up, and migration-aware.
- Owner/operator permissions, mutation audits, CSP, payload limits, and SSRF
  controls protect public hosting.
- The score is versioned, stable, and explainable rather than silently changing
  when data is missing.
- All GoHighLevel contacts are no longer described as SEO leads without source
  evidence.
- Automatic article publishing has a deterministic quality gate.
- Browser assets are modularized at cross-cutting seams and content hashed.
- Unit, integration, HTTP contract, security, and deployed smoke checks are run
  by CI and the release process.

## Remaining constraints and next refactors

1. **`server.js` is still the main composition monolith.** Operations, configuration, profile, usage,
   Search Console, content autopilot, manual article lifecycle, AI Visibility,
   AI audits, core AIO auditing, AI Assistant, recorded content, dashboard projections, reviews analytics, scheduled feature controls, Google delivery, Citation,
   Local SEO, Performance, and On-Site SEO are extracted; continue one route family at a time into services, integrations,
   and repository interfaces. Keep contract tests around the existing HTTP boundary
   before every extraction.
2. **Feature state is still process-local during a run.** PostgreSQL mode makes
   the database the startup recovery authority, but one production replica is
   still the supported topology. Move mutations to transactional repository
   calls before adding replicas; use unique idempotency keys and indexed
   time-series tables.

   Usage accounting now has a focused `lib/usage-meter.js` service (existing
   estimates, counter mappings, UTC month/account selection, budget checks) and
   `lib/usage-repository.js` adapter (the same `usage.json` tenant cache, atomic
   writer and PostgreSQL outbox observer). HTTP routes and provider call sites
   retain their contracts. Tests cover compatibility, restart recovery and
   failure behavior. This separates accounting from persistence; it does not
   make budget checks atomic reservations or feature state replica-safe.
3. **The worker shares the web process.** Durable state prevents lost work, but
   provider latency still consumes web-process memory and event-loop capacity.
   The transactional database queue is deployed. Moving handlers to a separate
   worker still requires removing process-local feature-state assumptions.
4. **`public/app.js` still coordinates the shell.** Fourteen secondary feature
   modules now load on demand; the coordinator retains Today, Explore, the
   detailed dashboard, setup, and navigation. These shared projections are an
  explicit boundary, not evidence that multi-tenant browser state is ready.

   The default `public/modules/workspace.js` owns workspace route/history state,
   the four-destination owner navigation, approvals, tool search and progressive
   disclosure. Existing feature modules still own their workflows and data.
   `lib/automation-status.js` is a read-only, secret-free status projection,
   not a second scheduler. `?workspace=classic` retains the previous navigation.
   See `docs/OWNER-WORKSPACE-PREVIEW.md` for the owner-authorized rollout,
   owner-reported usability acceptance and precise evidence limits.
5. **Configuration still supports UI-saved secrets.** A managed secret store is
   preferable for multi-instance deployment and independent rotation. Until
   then, restrict Settings to owners and keep the volume private and backed up.
6. **External success paths depend on vendor sandboxes.** Local tests exercise
   provider policy with fake HTTP servers. Add opt-in staging contract tests for
   each vendor; never run publish/send/index writes in normal CI.

## Refactoring rules

- Preserve endpoint method, path, role, status, payload keys, and side-effect
  order unless a product change explicitly authorizes otherwise.
- Write characterization and response-contract tests before moving a feature.
- Routes map HTTP; services orchestrate; domain modules stay pure; adapters own
  vendor and persistence details.
- No vendor SDK, Express object, filesystem path, or secret belongs in a pure
  domain module.
- Every external call goes through the provider runtime.
- Every scheduled or restart-sensitive workflow goes through the durable queue.
- Persistent schema changes are additive, immutable, restart-safe, and tested.
- Publishing is always sanitized and automatic publishing is always gated.
- A higher displayed score must come from measured business improvement, not a
  formula or missing-data change.
