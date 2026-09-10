# Calm dashboard pattern

SEO Buddy uses one owner-facing page system across Today, Approvals, Results,
Tools, Business, Settings, and every detail tool.

## Page anatomy

1. Product header: one page title, one plain-language subtitle, and live-data state.
2. Orientation row: Back, breadcrumb, optional advanced label, and Help.
3. Trust strip on detail pages: what is checked, when it was checked, what was
   found, and what the owner should do next.
4. One dominant section: the first primary card or task area gets the strongest
   accent. Supporting sections use borders and whitespace instead of shadows.
5. Evidence beside results: dates, unavailable states, and “Where did this
   number come from?” disclosures stay next to the metric they explain.

## Visual rules

- Content uses the shared `--page-width`; do not add page-specific max widths.
- Use the shared spacing and control-height tokens before adding one-off values.
- Cards use a border and no shadow. Reserve elevated shadows for overlays.
- Brand sun colors are accents. Large working surfaces stay neutral.
- Use the existing heading scale and button classes.
- Illustrations belong only in introductions, empty states, and milestones.
- Charts use navy for Google/search data and teal for AI/visibility data, with a
  visible legend and a plain-language measurement label.

## Status language

- Scheduled: enabled or planned, not completed.
- Running: actively executing, with current evidence.
- Completed: a recorded finished action.
- Needs approval: prepared work waiting for the owner.
- Unavailable or not verified: the system could not confirm the state; never
  render this as zero, disconnected, or complete.

Advanced pages must carry the `Advanced · optional` label. New tool pages must
also add an entry to `PAGE_META` and `PAGE_TRUST` in `public/modules/workspace.js`.
