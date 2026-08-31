CREATE TABLE durable_jobs (
  tenant_id text NOT NULL CHECK (tenant_id ~ '^[a-z0-9][a-z0-9_-]{0,79}$'),
  job_id uuid NOT NULL,
  job_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL CHECK (status IN ('pending', 'running', 'succeeded', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  run_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  worker_id text,
  idempotency_key text NOT NULL,
  last_error text,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  PRIMARY KEY (tenant_id, job_id),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX durable_jobs_claim_idx ON durable_jobs (tenant_id, status, run_at)
  WHERE status = 'pending';

CREATE INDEX durable_jobs_lease_idx ON durable_jobs (tenant_id, lease_until)
  WHERE status = 'running';
