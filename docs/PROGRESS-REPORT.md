# Visibility & Growth Report

The existing download button in Results > Detailed results and the assistant's
PDF action both call `SeoBuddyPdfReport.generate`. Report v2 uses the supplied
SEO Buddy mark and a five-section layout. Normal production data renders to
five A4 pages; longer data can continue with repeated headers and safe margins.

## Content and evidence

1. Overview: current app score, Google clicks, recorded publications within
   28 UTC calendar dates, three recommended actions, and evidence warnings.
2. Score: unchanged server score v2, current-input versus smoothed score,
   pillar weights and source dates, confidence, and the separate latest AI test.
3. Search: exact server query windows, comparisons including CTR, `posChange`
   movers, and up to five zero-click opportunities.
4. Work: all workflow states from `/api/automation-status` and four recent
   saved content records, with drafts and indexing requests labeled separately.
5. Business: contacts, explicit attribution, branded-search metrics, reviews
   parser inventory, current navigation, and reporting limitations.

The export is a view of existing evidence, not a new scoring method. It does
not publish, run AI audits, change schedules, mark posts as posted, or mutate
settings. Existing GET endpoints can still refresh their normal cached data.
No additional AI generation is performed or charged for the export.

- Unavailable reads and `success:false` are not zero results or a disconnect.
- A null score delta means no compatible baseline, not no change.
- The displayed score averages up to seven daily records, which need not be
  consecutive dates. Version-incompatible history is not used for comparison.
- Historical drafts, demos, and unverified/undated records do not count as
  published. Publication means the saved status, not a fresh page inspection.
- An indexing request does not prove indexing, ranking, or traffic.
- Search totals are limited to 250 query rows per window. Opportunities use a
  different 30-day lookback and 100-row query; counts need not match the score.
- `/api/performance.periods` and `/api/gsc-data.period` are additive metadata,
  derived from the existing query windows; query behavior is unchanged.
- All-channel contacts are not SEO conversions. The 100-contact response cap
  is disclosed when reached. No measured revenue is inferred.
- Reviews are detected cards on the reviews website, not platform totals. A
  zero scan is flagged for verification, not described as vanished reviews.
- The latest AI visibility sample and the scored AI audit set can differ.
- Saved weekly prose is not reprinted: it may contain demo data, older scores,
  or different reporting periods. The overview is composed from current checks.

## Implementation and verification

`public/modules/pdf-report.js` owns evidence normalization, rendering, and lazy
print libraries. It reuses the shared checked JSON reader. Print-library failures
remove failed scripts and permit retry, with bounded load timeouts. An unavailable
logo falls back to the product name. All core reporting reads failing prevents
an empty report download; partial failures retain verified sections and warnings.

`test/pdf-report.test.mjs` covers normalization and evidence states.
`scripts/browser-report.cjs` is part of the desktop/mobile acceptance suite,
covering a failed-library retry, real PDF download, no mutations, partial data,
a missing logo fallback, and complete data failure. Synthetic examples live in
`test/fixtures/report.cjs`.

For visual QA, run `node scripts/preview-report.cjs`, optionally supplying a
local JSON snapshot keyed by endpoint suffix. This uses an isolated loopback
server and blocks requests outside it. The output is ignored under `test-results`.
Render all pages with Poppler before approving layout changes; verify text bounds,
page breaks, repeated headers, and footers. Never commit private report snapshots
or generated customer PDFs. Local deliverables under `output/pdf` are ignored.
