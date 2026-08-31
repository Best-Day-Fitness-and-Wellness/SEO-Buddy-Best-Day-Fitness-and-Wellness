ALTER TABLE durable_jobs
  ADD COLUMN started_at timestamptz;

CREATE INDEX durable_jobs_recent_idx ON durable_jobs (tenant_id, updated_at DESC);
