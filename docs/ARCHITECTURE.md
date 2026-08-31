# SEO Buddy architecture

This document is the engineering map for the production system. It describes
the code that runs today, its complete data flow, the boundaries introduced by
the production-hardening work, and the remaining scale limits. The HTTP API and
user workflows are compatibility boundaries: refactoring must not change them
without an explicit product decision.

## System context

SEO Buddy is a Node.js 20 and Express application. One Railway service serves a
vanilla-JavaScript dashboard, exposes 89 HTTP routes, executes integration
workflows, and runs a durable local job worker.

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
       atomic JSON on DATA_DIR volume
                   |
                   +-> checksummed backups
                   +-> optional PostgreSQL mirror/migrations
```

## Boot flow

1. The process selects `DATA_DIR` and loads server-side saved configuration.
   Host environment values remain the deployment authority.
2. `lib/state-repository.js` resolves `TENANT_ID`, creates the tenant boundary,
   and safely copies legacy root state on the first tenant-aware boot.
3. Browser assets are hashed from their content and injected into the cached
   HTML template. HTML revalidates; hashed assets are immutable.
4. Express installs same-origin security policy, lifecycle probes, correlation
   IDs, bounded metrics, compression, route-specific upload limits, global JSON
   limits, access control, and mutation auditing.
5. Feature state is loaded from the tenant repository. Missing files receive
   explicit defaults; writes use atomic file replacement.
6. Job handlers and the leased job worker start. Timers enqueue idempotent jobs
   instead of running expensive workflows directly.
7. Optional PostgreSQL migrations run under an advisory lock, then tenant state
   is mirrored periodically. A PostgreSQL failure is visible but does not make
   the current filesystem-backed service unavailable.
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
review monitoring, and `theme.js` owns theme behavior. `public/app.js` remains
the main feature coordinator.

The browser loads only the visible dashboard work initially. Feature loaders
use same-origin APIs and render escaped values. Report libraries and the Reviews
feature module load on demand.
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
  -> persist jobs.json atomically
  -> claim lease
  -> heartbeat during work
  -> provider/domain workflow
  -> succeed, retry with bounded backoff, or fail terminally
```

On deployment shutdown, active work is released for the replacement process.
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

The production source of truth is atomic JSON under
`DATA_DIR/tenants/<TENANT_ID>/`. The repository prevents path escape and leaves
legacy files intact after checksum-verified migration. Daily backups exclude
secrets and contain a manifest checksum for every file. Restore verifies the
manifest and creates a safety backup; it is intentionally available only while
the application is stopped.

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
| `lib/state-repository.js` | Tenant containment and legacy state migration |
| `lib/json-file-store.js` | Atomic document replacement |
| `lib/backup-service.js` | Secret-free checksummed backup and restore |
| `lib/postgres-store.js` | Advisory-locked migrations and staged state mirror |
| `lib/access-control.js` / `audit-log.js` | Roles, authorization, tamper-evident mutation trail |
| `lib/health-score.js` | Pure, versioned scoring and stabilization |
| `lib/attribution.js` | Deterministic contact source classification |
| `lib/content-quality.js` | Deterministic article quality and automatic-publish gate |
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

1. **`server.js` is still the main monolith.** Extract one route family at a
   time into routes, services, integrations, and repository interfaces. Keep
   contract tests around the existing HTTP boundary before every extraction.
2. **Feature state is still process-local during a run.** PostgreSQL mode makes
   the database the startup recovery authority, but one production replica is
   still the supported topology. Move mutations to transactional repository
   calls before adding replicas; use unique idempotency keys and indexed
   time-series tables.
3. **The worker shares the web process.** Durable state prevents lost work, but
   provider latency still consumes web-process memory and event-loop capacity.
   The database queue is ready for the PostgreSQL cutover; move the same handlers
   to a separate worker service after that cutover is verified.
4. **`public/app.js` is still large.** Reviews, assistant, theme, and core are
   separate modules; Reviews is lazy loaded. Continue feature-by-feature extraction
   and dynamic import while preserving DOM IDs and response contracts.
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
