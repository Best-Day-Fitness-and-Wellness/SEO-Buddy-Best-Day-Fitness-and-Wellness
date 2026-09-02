# SEO Buddy production operations

## Deploy

Production auto-deploys the GitHub `main` branch to Railway. Do not deploy an
untested working tree.

1. Run `npm run check`.
2. Run `npm test`.
3. Run `npm run test:browser` and `npm audit --omit=dev --audit-level=moderate`.
   Install the test browser once with `npx playwright install --with-deps chromium`.
4. Commit and push the exact tested revision to `main`.
5. Wait until Railway marks that commit Active. Do not treat a successful Git
   push as a successful deployment.
6. Run:

   ```bash
   REQUIRE_LIVE_GSC=1 npm run smoke -- https://your-service.up.railway.app
   ```

The smoke check is read-only. It verifies liveness, readiness, all deployment
checks, production/no-mock mode, score contract, persistent storage, security
headers, every initial and lazy content-hashed asset (including immutable cache
headers), and live Search Console when required. Compare the boot timestamp and
deployed asset hashes to the release; healthy old code is not release evidence.

GitHub Actions runs source/contract/security tests, a dependency advisory gate,
and an isolated Chromium acceptance job. Browser reports and screenshots are
retained as CI artifacts for 14 days. Locally, `BROWSER_EXECUTABLE` can point to
an installed Chrome executable. Acceptance uses a new temporary data directory,
fake credentials, and intercepted writes; it cannot publish/send/index to a
real provider. It does not use an existing personal browser session.

## Routine checks

Use the protected endpoints without copying credentials into tickets or logs:

| Endpoint | What healthy means |
| --- | --- |
| `/health/live` | `status: live` |
| `/health/ready` | `status: ready`; storage writable and persistent |
| `/api/deploy-readiness` | `ready` equals `total`; production mode; mocks disabled |
| `/api/diagnostics` | bounded request/latency values; process accepting traffic |
| `/api/integration-health` | configured providers healthy; circuits closed; budget available |
| `/api/job-queue` | worker running; no old pending jobs; terminal failures understood |
| `/api/audit-status` | mutation chain verifies |
| `/api/storage-backups` | latest backup exists and verifies |

Never include provider tokens, service-account JSON, admin credentials, request
bodies, or generated customer content in incident notes.

## Provider incident

1. Check `/api/integration-health` for configuration, last success or failure,
   latency, retries, and circuit state.
2. Confirm the monthly AI budget is not reached.
3. Check the provider's own status page before rotating a credential.
4. Rotate credentials in Railway Variables or owner-only Settings. Never commit
   a token to GitHub.
5. Redeploy only when configuration is read at boot or a clean restart is
   needed. Verify with the smoke suite.

Read operations may use an explicitly allowed recent cached value during a
transient provider failure. Publish, send, and indexing operations are not
automatically retried because doing so could duplicate external side effects.

## Job incident

Queue state is persisted before work starts. A deployment releases the active
lease so the replacement process can reclaim it.

- Pending with a future `runAt`: bounded retry backoff; observe unless old.
- Running with an active lease: normal work.
- Old running job: the next worker should reclaim an expired lease.
- Failed after one attempt: likely deterministic or explicitly non-retryable;
  inspect the reason before rerunning.
- Failed after maximum attempts: fix the provider, configuration, or root cause,
  then use the normal authenticated trigger to enqueue a new idempotent run.

In production, jobs live in PostgreSQL `durable_jobs`; `jobs.json` is a legacy
import/local-development artifact. Do not edit either queue by hand while the
worker is running. Shared scheduling stops before worker shutdown.

## Backup and restore

The daily backup job stores secret-free, tenant-scoped, checksummed snapshots.
An owner can create and verify backups through `/api/storage-backups`.

For an offline **filesystem-mode** restore:

1. Stop the application so no writer is active.
2. Verify the chosen backup.
3. Run `node scripts/restore-backup.mjs --backup <id> --confirm "RESTORE <id>"`
   with the correct `DATA_DIR` and `TENANT_ID`. Restore creates another safety
   backup first. This command does not itself stop a running application.
4. Start the application, check readiness, verify state, and run smoke.

Never restore from an unverified directory or across tenant IDs.

Production currently uses `STATE_BACKEND=postgres`. File snapshots do **not**
back up the transactional job table, configuration secrets, or pending outbox.
Do not treat a successful file restore as database recovery: prestart hydrates
from PostgreSQL and replays the volume outbox. Preserve the database and volume
as a coordinated recovery set. For a production database incident, stop all
writers, preserve the current database/volume, and rehearse the chosen database
restore and outbox reconciliation in an isolated environment before cutover.
Never replay stale pending writes blindly onto a restored database. Establish
an approved managed-database backup/PITR policy before the larger scale phase.
The automated closeout drill exercises only file restore, checksum refusal,
safety snapshots, and isolated outbox/queue recovery tests, not live PITR.

## Database migration

Migration files under `migrations/` are immutable after release. Run
`npm run db:migrate` with the production `DATABASE_URL` available. The migration
runner uses an advisory lock and rejects changed historical checksums.

In `STATE_BACKEND=filesystem`, PostgreSQL is an outbox-backed mirror and a
mirror failure is an operational warning. To cut over, verify the mirror and a
filesystem backup first, then set `STATE_BACKEND=postgres`; prestart replays the
outbox, hydrates the runtime cache, imports existing jobs, and then uses the
transactional PostgreSQL queue before readiness succeeds. Do not enable multiple
web replicas yet: feature mutations are still process-local during a run.

## Rollback

Prefer a new revert commit on `main`, then let Railway deploy it. A code rollback
must not delete the volume or replace tenant state. If the release introduced a
new additive state field, older code must ignore it. If durable state itself is
wrong, use the verified offline restore procedure separately from the code
rollback.

After rollback, wait for the exact revert commit to become Active and run the
same production smoke suite.
