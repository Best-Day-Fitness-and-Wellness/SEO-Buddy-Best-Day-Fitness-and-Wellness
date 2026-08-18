# Clean architecture implementation

This document is the source-of-truth map for the refactored code. The public
HTTP routes, response bodies, authentication rules, persistence files, static
URLs, and scheduled behavior remain compatible with the pre-refactor runtime.

## Dependency rule

Dependencies point toward stable business rules:

```text
HTTP / browser entry points
        |
        v
application use cases
        |
        v
pure domain policy

infrastructure adapters --------^ (injected through composition modules)
```

- Domain modules contain deterministic parsing and policy. They do not import
  Express, the filesystem, environment variables, or vendor SDKs.
- Application modules orchestrate a use case through injected ports. They own
  sequencing, but not HTTP status codes or storage details.
- Infrastructure modules implement outbound HTTP and JSON persistence.
- HTTP modules translate requests and results while preserving the existing API
  contract.
- Composition modules (`index.js` files) are the only place concrete adapters
  are wired to use cases.

## Implemented folder structure

```text
src/
  config/
    runtime-config.js
  features/
    reviews/
      application/
        get-reviews-stats.js
      domain/
        review-page-parser.js
      infrastructure/
        reviews-page-client.js
        reviews-snapshot-repository.js
      http/
        register-reviews-routes.js
      index.js
  http/
    middleware/
      admin-auth.js
      security-headers.js
    configure-middleware.js
  shared/
    content-safety.js

public/
  core/
    api-client.js
    content-safety.js
  app.js
  index.html

lib/
  daily-snapshot.js
  dotenv-store.js
  json-file-store.js
  single-flight.js
  ttl-cache.js

test/
  architecture-helpers.test.mjs
  clean-architecture.test.mjs
  integration.test.mjs
```

`server.js` remains the compatibility shell while features are migrated one
vertical slice at a time. This is deliberate: a big-bang rewrite of more than
seventy production endpoints would make it impossible to distinguish an
architectural move from a behavioral regression.

## Responsibilities now separated

### Runtime configuration

`src/config/runtime-config.js` is the process configuration boundary. It loads
the durable `.env`, preserves host-variable precedence, creates the existing
data directory, normalizes the reviews URL, and returns an immutable snapshot
for startup-level settings. Feature modules no longer need to discover these
values independently.

Settings intentionally still updates selected `process.env` values at runtime.
That legacy behavior is part of the product contract and will only move behind
a configuration port when a versioned migration is available.

### HTTP middleware and authentication

`src/http/configure-middleware.js` owns middleware ordering, static caching,
compression, CORS, and parser limits. `admin-auth.js` owns constant-time token
comparison and client-scoped throttling. Its clock and policy are injectable,
so lockout behavior can be tested without a running server or real timers.

### Content safety

Server-side article sanitization and URL/HTML encoding live in
`src/shared/content-safety.js`. The browser equivalents live in
`public/core/content-safety.js`, while authenticated transport lives in
`public/core/api-client.js`. These are loaded before the legacy dashboard
controller, preserving its globals and visible behavior while removing security
and transport policy from the UI monolith.

### Reviews vertical slice

Reviews is the first fully migrated backend feature:

1. `review-page-parser.js` parses cards, metadata, JSON-LD, platform totals, and
   growth as pure domain functions.
2. `get-reviews-stats.js` performs the application use case and depends only on
   a page-client port and a snapshot-repository port.
3. The infrastructure adapters implement bounded HTTP calls and the existing
   atomic JSON snapshot persistence.
4. The HTTP adapter preserves `GET /api/reviews-stats`, its success/error body,
   five-minute cache, and request coalescing.
5. `features/reviews/index.js` is the composition root for this feature.

This slice can now be tested with fake pages and repositories, moved to a worker,
or switched to database persistence without importing Express into its domain.

## Compatibility invariants

- Existing endpoint methods, paths, response keys, status codes, and auth rules
  remain unchanged.
- The browser still uses the same static entry point and DOM contract.
- `DATA_DIR` filenames and JSON shapes are unchanged.
- AI and integration fallbacks remain available when credentials are absent.
- Article publishing remains sanitized before external writes.
- Reviews snapshots retain 365 daily entries and responses expose the latest 90.
- Middleware ordering and cache headers remain unchanged.

## Scaling path

Future migrations should repeat the Reviews pattern by feature, with contract
tests added before each move:

1. Extract brand and business-profile repositories and use cases.
2. Move content generation/publishing/indexing behind integration ports.
3. Separate performance and health calculations into pure domain services.
4. Replace process timers with durable jobs that use leases and idempotency
   keys; keep the existing schedule and status payloads at the boundary.
5. Add a transactional repository adapter, then migrate JSON state with
   additive versioned migrations.
6. Split `public/app.js` into feature controllers loaded on demand after browser
   response-contract tests cover the current screens.

The rule for every step is the same: characterize, extract, verify, then remove
the legacy implementation. Folder movement alone is not considered a migration.
