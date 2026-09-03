# SEO Buddy performance and scale plan

## Current protections

The production path has compression, content-hashed immutable browser assets,
lazy report libraries, thirteen lazy feature modules, visible-panel initialization, short-lived Search Console
and performance caches, single-flight request coalescing, no-op daily snapshot
writes, provider concurrency/rate controls, provider deadlines, and a durable
job worker. A shared loader coalesces feature loads and allows failed loads to
retry. Carousel rerenders no longer accumulate window resize listeners. These
controls reduce transfer size, quota amplification, duplicate
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
process-local during each run. In PostgreSQL mode the durable queue already uses
transactional database rows, not the local cache; the remaining scale blocker
is shared feature-state mutation and the in-process worker.

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

1. Define transactional repositories for concurrently changing feature state:
   usage, score snapshots, performance, publications, and audits. The durable
   job table and transactional claiming already exist.
   The usage meter and current persistence adapter are now separate and covered
   by compatibility tests. Transactional updates and budget reservations are
   still future work; the current adapter intentionally keeps existing behavior.
   Score timeline orchestration and score/publication history adapters are also
   isolated now. Score reads remain non-persisting and daily recording remains
   single-flight within one process. Concurrent database updates, cross-process
   deduplication and indexed history tables have not been implemented by this
   extraction; do not increase replica count on that basis.
2. Make database writes authoritative behind repository interfaces; keep JSON
   only as a local-development adapter and rollback export.
3. Once feature mutations no longer depend on web-process objects, run the
   current queue handlers in a separate worker service.
4. Add route and provider latency histograms and alert thresholds using Railway
   or an external telemetry backend.
5. Reassess the remaining dashboard coordinator using measured loading costs;
   preserve lazy secondary dashboards and the shared feature loader.
6. Run concurrency and soak tests against a staging database and fake providers.
7. Only then add web replicas. Verify there is exactly one logical scheduled
   run and no lost updates before raising production replica count.

## Closeout browser budget

Compared with `c12a43b`, normalized production source for `public/app.js` fell
from 145,080 bytes to 110,560 bytes (23.8%). The four initial scripts together
fell from 162,724 to 131,673 bytes (19.1%), despite adding loading and keyboard
safety. These are uncompressed UTF-8 sizes with LF line endings, not claims
about real-user load time. Content is downloaded only when creation/publishing
is opened. CSS plus four scripts remain the five initial assets.

`npm run test:browser` records local navigation timing and decoded initial
script bytes, enforces four initial scripts and a 200,000-byte script budget,
and exercises desktop/phone views. Local synthetic timing does not establish
production LCP, INP, or vendor latency; collect field telemetry before setting
those service objectives.

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
