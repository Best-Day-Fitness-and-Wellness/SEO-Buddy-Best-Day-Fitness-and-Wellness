# Owner workspace

## Release boundary

The normal deployment URL now opens the redesigned workspace. This is a
navigation release, not a second application or a separate data store.
**Previous interface** opens `/?workspace=classic`; **Use redesigned workspace**
returns to the default. The saved Owner mode preference is preserved and used
only in the classic interface. Existing `/?workspace=preview` bookmarks still
work. Entering either interface never enables an automation, changes a
connection, or publishes content. The classic recovery link is part of the
initial shell and remains available if the workspace module fails to load.

The workspace uses live data and the existing authenticated write routes.
It is **not a sandbox**. Browser acceptance tests use a separate local server,
fake responses for every mutation, and an external-request firewall.

## Navigation and workflow

| Destination | Owner question | Detail stays available |
| --- | --- | --- |
| Today | What needs me, and what happens next? | Six automation status summaries and expandable evidence |
| Approvals | What decision or prepared work needs review? | Review links; publishing permission requires confirmation |
| Results | Are search outcomes improving? | Detailed performance, attributable leads, advanced dashboard |
| Tools | Where can I do a specific job? | Searchable catalog; advanced reports collapsed initially |
| Business (secondary) | Are our facts and voice right? | Existing business setup and brand editor |
| Settings (secondary) | Do access, assumptions or connections need attention? | Credentials and diagnostics inside a disclosure |

The same four primary destinations are a sidebar on desktop and a bottom bar
on mobile. Tool routes retain their parent destination, title, breadcrumb,
Back button, browser Back/Forward and `#/…` direct link. No mode switch is
required to use a detailed tool.

The visual refinement keeps the approved Direction A paper/ink/teal/coral
artwork in the daily briefing, with one primary action. Automation status is
a single compact list of keyboard-expandable rows, not six separate cards.
The score is a secondary panel; the ring encodes the existing score only and
does not imply improvement. Tool groups use a two-column desktop directory
and a single-column phone layout. The browser suite checks a 320px phone
width, row height, primary-action visibility, and keyboard disclosure controls
in addition to the regular desktop/mobile and dark-mode coverage.

The content journey links search opportunities → draft and review → publish
and verify → results. One existing content state is retained across in-tab
navigation. Reloading or closing the tab still discards an unsaved article;
the workspace states that limitation explicitly. Editing after publication
marks the edited copy as needing review again; it does not undo the prior
publication. An indexing request is not proof that Google indexed a page.

## Status evidence and limits

`GET /api/automation-status` combines configuration and feature timestamps
with the latest 100 queue records and worker availability. It does not run a
provider test, execute jobs, or expose job payloads, errors or credentials.

- Needs setup: required configuration is absent.
- Scheduled: enabled for checks, not proof of new output or valid credentials.
- Running: an in-process operation or a job with an unexpired lease is active.
- Needs approval: a prepared, unpublished Google post exists.
- Failed: recorded failure after the latest feature activity, or a post error.
- Completed: prior feature activity exists and automatic checks are paused;
  this does not mean a suggestion was applied or an article was published.
- Paused: automatic checks are disabled with no recorded activity.
- Unable to check: the worker or status read could not be verified.

These are bounded observations, not a full audit of every historical vendor
operation. A completed no-op queue check cannot erase a recorded failure.
Estimated next eligible checks are labelled separately from explicit times.
Use **Refresh checks** to obtain a new observation. A blank inbox is never
treated as evidence that all automation is healthy.

## Real-owner usability feedback — pending

The project owner explicitly approved making the redesign the default before
first-time-user testing, with feedback to follow. That approval is a rollout
decision, not evidence that usability testing has passed.

Ask 2–3 owners who have not used SEO Buddy to try the workspace individually.
Include phone and desktop users. Do not coach them or name the destination
they should click. Record time, wrong turns, requests for help, and their own
description of what happened. Test the interface, not the participant.

Use these five read-only tasks on production. Do not save credentials, enable
automations, generate paid content, confirm publication, send, or index.

1. Explain whether anything needs your attention today and what is expected
   to happen next. Show the evidence for one automation status.
2. Find a decision that needs you and explain what accepting it would do.
   Stop before confirming or changing anything. An accurately recognized
   empty inbox is a valid outcome when production has no decisions.
3. Find whether visits from Google improved and explain whether the displayed
   dollar figure is measured revenue or an estimate. Recognizing unavailable
   data correctly is also a valid outcome.
4. Find the tool for checking reviews, then return to where you started using
   Back. Do not launch an audit or another paid action.
5. Find where business facts and connection settings can be inspected. Open
   the technical details without changing or saving any value.

Afterward ask: “What was hardest to find?” and “What did you think SEO Buddy
had already done for you?” No leading questions or suggested answers.

| Participant / device | Task | Completed without help? | Time | Wrong turns / misunderstanding |
| --- | --- | --- | --- | --- |
| Pending | 1–5 | Not tested | — | — |

Suggested post-release target: each participant completes at least 4 of 5 tasks
without help, with no mistaken belief that a draft, schedule or estimate is
a completed publication or measured revenue. Fix repeated navigation failures
and retest. This small study is directional evidence, not statistical proof.

Automated acceptance covers browser behavior, accessibility, safe failures
and in-tab draft continuity. It **cannot** replace real-owner testing.
Collect and review the findings after rollout; repeated failures still need
fixes and retesting. No participant results have been recorded yet.

## Verification and rollback

Run `npm run check`, `npm test`, and `npm run test:browser` before release.
The browser runner covers the classic interface and every default workspace route in
desktop/mobile, with core destinations also checked in dark mode. CI retains
the screenshots and machine-readable report for 14 days. It also verifies bare
URL entry, classic return links, saved-mode preservation, old preview bookmarks,
and recovery when the workspace module cannot load.

After deployment, run the strict production smoke suite. It checks the six
automation summaries and the content-hashed workspace asset as well as the
existing readiness, storage and live-search contracts. Verify the exact
deployed commit; a successful local test is not deployment evidence.

For an individual user, use **Previous interface** or `/?workspace=classic`.
For a code rollback, revert the release commit without touching business
state, job history, configuration, or the production volume.
