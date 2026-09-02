# Single-business closeout — 2026-09-02

This release closes the four agreed cleanup milestones. It does not begin
multi-business onboarding, concurrent feature-state repositories, or separate
worker deployment. Existing endpoint contracts, score formula v2, publication
rules, and job schedules are preserved.

## Completed implementation

1. **Content workspace:** creation, editor state, claims/brand warnings,
   publishing, indexing, history, and content-autopilot controls now live in one
   lazy module. A search-to-article handoff loads it once; navigation preserves
   the draft. A failed replacement request keeps the previous draft visible.
   Recording remains a separate lazy capability.
2. **Shared coordination:** thirteen features use one bounded, retryable,
   same-origin loader. Job enqueue, recurring/daily scheduling, and timer
   shutdown share a tested dispatcher. Common time labels and keyboard/dialog
   behavior are centralized. Carousel rerenders no longer retain global resize
   listeners. Unsaved Settings edits survive navigation.
3. **Acceptance and hardening:** automated desktop/phone journeys, all main
   screens, owner views, setup steps, assistant, confirmation dialog, and
   representative dark views are audited. Fixes include form labels, keyboard
   shortcuts, focus trapping/restoration, status contrast, and non-overlapping
   mobile carousel tap targets. The query-parser security patch is pinned and
   has a regression test.
4. **Release handoff:** architecture, performance, operations, CI, and read-only
   deployment smoke checks are updated. CI now includes the browser acceptance
   suite and dependency advisory gate. Production verification must satisfy the
   release gates below after deployment.

## Local evidence

| Check | Result |
| --- | --- |
| Automatic syntax discovery | 76 source files checked |
| Unit, provider, HTTP, security, and recovery tests | 98 passed |
| Browser journeys at 1440×1000 and 390×844 | 18 passed |
| Layout/accessibility snapshots | 58 checked; no detected WCAG 2 A/AA violations or page overflow |
| Browser runtime exceptions | 0 |
| Dependency audit after patched `qs` 6.16.0 | 0 known vulnerabilities reported |
| Initial script source, normalized LF | 162,724 → 131,673 bytes (19.1% reduction) |

The parser fix addresses the [upstream advisory](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g).
An override is required while Express/body-parser constrain their transitive
dependency to the earlier minor line. Remove the override only after upstream
ranges allow a patched version and regression tests still pass.

Browser journeys cover startup secret cleanup, failed-module retry,
search → generate → sanitize → edit → publish → index, autopilot queue/schedule/
manual trigger, generation failure, authentication rejection, Settings draft
preservation/secret clearing, carousel navigation, keyboard confirmation, and
setup. Generated screenshots and JSON reports are in ignored `test-results/`
and are retained by CI for 14 days.

The offline file-recovery drill verifies refusal without confirmation,
restoration, a recoverable safety snapshot, and checksum refusal before writes.
Existing queue/outbox tests cover lease reclamation and replay. No live database
restore or real vendor publication, email, or indexing submission is part of
these tests. Automated accessibility checks and representative visual review
are not a screen-reader certification or proof that every device is covered.

## Production release gates

- Push the exact tested revision to GitHub `main`; confirm CI succeeds.
- Confirm a new Railway boot and asset hashes matching the committed source.
- Require liveness/readiness, 7/7 deployment checks, persistent PostgreSQL,
  production mode with mocks disabled, score contract v2, and live Search Console.
- Fetch all 18 hashed assets (5 initial, 13 lazy) with immutable cache headers.
- Use the read-only smoke suite; do not manufacture publication/indexing work
  or change the scoring formula to make acceptance appear successful.

## Boundary before the larger phase

The supported topology is still one business and one application replica.
Transactional feature-state repositories, a separate worker, multi-business
authorization/isolation, coordinated database/volume recovery and managed
secret rotation require their own design and staging gates. Real vendor
sandbox tests, broader device/screen-reader testing, and production field
performance measurement are also explicit follow-up work. None is silently
included in this closeout or represented as already proven.
