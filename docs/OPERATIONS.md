# SEO Buddy production operations

## Deploy

Production auto-deploys the GitHub `main` branch to Railway. Do not deploy an
untested working tree.

1. Run `npm run check`.
2. Run `npm test`.
3. Commit and push the exact tested revision to `main`.
4. Wait until Railway marks that commit Active. Do not treat a successful Git
   push as a successful deployment.
5. Run:

   ```bash
   REQUIRE_LIVE_GSC=1 npm run smoke -- https://your-service.up.railway.app
   ```

The smoke check is read-only. It verifies liveness, readiness, all deployment
checks, production/no-mock mode, score contract, persistent storage, security
headers, content-hashed assets, and live Search Console when required.

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

Do not edit `jobs.json` by hand while the server is running.

## Backup and restore

The daily backup job stores secret-free, tenant-scoped, checksummed snapshots.
An owner can create and verify backups through `/api/storage-backups`.

For an offline restore:

1. Stop the application so no writer is active.
2. Verify the chosen backup.
3. Run the restore command with the exact confirmation string shown by the
   tool. Restore creates another safety backup first.
4. Start the application, check readiness, verify state, and run smoke.

Never restore from an unverified directory or across tenant IDs.

## Database migration

Migration files under `migrations/` are immutable after release. Run
`npm run db:migrate` with the production `DATABASE_URL` available. The migration
runner uses an advisory lock and rejects changed historical checksums.

In `STATE_BACKEND=filesystem`, PostgreSQL is an outbox-backed mirror and a
mirror failure is an operational warning. To cut over, verify the mirror and a
filesystem backup first, then set `STATE_BACKEND=postgres`; prestart replays the
outbox and hydrates the runtime cache before readiness succeeds. Do not enable
multiple replicas: feature mutations and the queue are not yet transactional
database operations during a running process.

## Rollback

Prefer a new revert commit on `main`, then let Railway deploy it. A code rollback
must not delete the volume or replace tenant state. If the release introduced a
new additive state field, older code must ignore it. If durable state itself is
wrong, use the verified offline restore procedure separately from the code
rollback.

After rollback, wait for the exact revert commit to become Active and run the
same production smoke suite.
