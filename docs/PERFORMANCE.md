# SEO Buddy performance and scale plan

## Measured production-path improvements

Measured locally on Node.js 20-compatible runtime on 2026-08-18, using the
unmodified `main` branch as the behavioral baseline.

| Area | Baseline | Optimized behavior |
| --- | --- | --- |
| Initial local JavaScript/CSS/HTML payload | PDF libraries loaded on every page view; about 1.04 MB uncompressed across the initial local assets | PDF libraries load only when a report is requested; about 590 KB uncompressed |
| Initial compressed local transfer | About 291 KB including the PDF libraries | About 147 KB; PDF code is outside the critical path |
| Default Today-screen API work | Hidden Search Console, publish, full-dashboard, and Today loaders all ran at startup, including duplicate health/readiness calls | Only the visible Today data set runs; other panels initialize when opened |
| Live performance computation | Concurrent calls were coalesced, but the very next request repeated Search Console and GoHighLevel work | Successful results have a 60-second TTL and a 5-minute stale-if-error window |
| Search Console dashboard query | Every panel render could issue a fresh Google API request | Calls share a 60-second process-local result |
| Daily snapshot persistence | Health, performance, and reviews could atomically flush the same daily value repeatedly | Identical date-keyed snapshots skip the durable write |
| Static delivery | Full-size responses with immediate revalidation | Gzip/Brotli negotiation through compression middleware; non-HTML assets cache for 5 minutes with background revalidation |
| Repository/build context | Two byte-identical root copies of the served PDF libraries | Only the served `public/` copies remain |

The optimized local server handled 100 concurrent cached health requests in
177 ms during the verification run, and `health-score.json` retained the same
modification timestamp throughout the burst. This is a regression probe, not a
capacity promise; Railway instance size, external API latency, and production
data volume still determine real throughput.

## Bottleneck breakdown

### Addressed in this change

- **Critical rendering path:** two report-only libraries added roughly 453 KB
  uncompressed JavaScript plus parse/compile work to every visit.
- **Hidden work:** startup initialized panels the user could not see, creating
  avoidable network, DOM, and third-party API work.
- **Quota amplification:** Search Console and performance results had no settled
  TTL, so navigation bursts repeated slow and quota-limited upstream calls.
- **Event-loop blocking:** unchanged daily state still went through synchronous
  serialization, fsync, and rename on read endpoints.
- **Transfer size:** static and JSON responses were not compressed by the app.

### Remaining scale limits

- The process still owns 78 routes, recurring schedulers, integration calls,
  and mutable state. CPU-heavy or slow upstream work can compete with normal
  HTTP requests.
- Flat JSON stores and process-local locks make horizontal replicas unsafe:
  replicas can overwrite each other and run the same scheduled AI work.
- Several histories can grow without a durable archival/pagination policy,
  increasing memory and whole-document serialization cost over time.
- `public/index.html` and `public/app.js` remain monoliths. Hidden panels avoid
  layout, but their DOM and controller code are still downloaded and parsed.
- Outbound providers do not yet share one timeout, retry-with-jitter,
  concurrency-limit, and circuit-breaker policy.

## Scale-out sequence

1. **Put static assets behind Railway's edge/CDN or a dedicated CDN.** Add
   content-hashed filenames so JS/CSS can use one-year immutable caching.
2. **Move mutable JSON state to PostgreSQL.** Use transactions, unique
   idempotency keys, indexes for time-range reads, cursor pagination, and a
   retention/archive policy. Keep the current JSON adapter for local mode.
3. **Move schedules and expensive integrations to a worker queue.** A web
   process should enqueue jobs and read job status; workers should use durable
   leases, bounded concurrency, retries with jitter, and dead-letter records.
4. **Split the browser by feature.** Keep the shell and Today view in the entry
   chunk; dynamically import Search Console, reports/PDF, AI visibility, and
   admin tools on first navigation.
5. **Add shared provider controls.** Give every outbound call a deadline,
   retry classification, concurrency budget, circuit breaker, and metrics for
   latency, error rate, quota use, and cache hit ratio.
6. **Then add web replicas.** Only after state, locks, rate limits, and schedules
   are externalized should Railway run multiple HTTP replicas behind a load
   balancer.

## Production signals to watch

- p50/p95/p99 request latency by route and upstream provider
- event-loop delay, RSS/heap, garbage-collection pauses, and process restarts
- cache hit/miss/stale-served counts for Search Console and performance
- queue depth, job duration, retry count, duplicate/idempotency rejection count
- JSON/PostgreSQL write latency and state growth by collection
- static transfer bytes, cache-hit ratio, LCP, INP, and long JavaScript tasks
