# SEO Buddy performance and scale plan

## Current protections

The production path has compression, content-hashed immutable browser assets,
lazy report libraries, a lazy Reviews feature, visible-panel initialization, short-lived Search Console
and performance caches, single-flight request coalescing, no-op daily snapshot
writes, provider concurrency/rate controls, provider deadlines, and a durable
job worker. These controls reduce transfer size, quota amplification, duplicate
work, and long unbounded upstream waits without changing workflows.

Provider status and counters are available through protected
`GET /api/integration-health`. Bounded request totals and latency buckets are in
`GET /api/diagnostics`. Queue counts and recent jobs are in
`GET /api/job-queue`.

## Current production topology

One Railway replica and one attached persistent volume are the supported
topology. Atomic JSON replacement and queue locks protect the current process
from partial writes and overlapping local work. They do not provide
transactional multi-replica writes. PostgreSQL can be the startup recovery
authority with `STATE_BACKEND=postgres`, but feature objects still remain
process-local during each run and the durable queue still uses the local cache.

## Remaining bottlenecks

- `server.js` owns HTTP traffic and the worker, so slow vendor work and web
  traffic still share a process.
- Feature state is loaded in memory and whole JSON documents are replaced.
  Growth increases serialization cost even though histories have bounded
  retention in several areas.
- `public/app.js` is still the largest browser parse and maintenance unit.
- Process-local caches are deliberately small and disappear on deployment.
- One health or report request can aggregate several vendor sources; the
  provider boundary limits damage but cannot remove vendor latency.

## Safe scale-out sequence

1. Define PostgreSQL tables for state that changes concurrently, including
   jobs, usage, score snapshots, performance, publications, and audits.
2. Make database writes authoritative behind repository interfaces; keep JSON
   only as a local-development adapter and rollback export.
3. Move job claiming and idempotency to transactional rows, then run the current
   handlers in a separate worker service.
4. Add route and provider latency histograms and alert thresholds using Railway
   or an external telemetry backend.
5. Extract browser feature modules and dynamically load secondary dashboards.
6. Run concurrency and soak tests against a staging database and fake providers.
7. Only then add web replicas. Verify there is exactly one logical scheduled
   run and no lost updates before raising production replica count.

## Signals and release gates

Watch:

- request p50/p95/p99, error rate, event-loop delay, memory, and restarts;
- provider latency, failures, retries, open circuits, cache hits, and spend;
- queue depth, oldest pending age, job duration, retries, and terminal failures;
- tenant state size, backup validity, PostgreSQL mirror freshness, and migration
  checksum failures;
- browser asset transfer, cache hit ratio, LCP, INP, and long tasks.

A release is acceptable only when local syntax checks and all tests pass,
Railway activates the intended commit, `/health/ready` is ready, deployment
readiness is complete, mock integrations are disabled, and the read-only smoke
suite passes. For this installation, release verification also requires live
Search Console.
