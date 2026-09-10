CREATE TABLE worker_heartbeats (
  tenant_id text NOT NULL CHECK (tenant_id ~ '^[a-z0-9][a-z0-9_-]{0,79}$'),
  worker_id text NOT NULL,
  process_role text NOT NULL CHECK (process_role IN ('all', 'worker')),
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, worker_id)
);

CREATE INDEX worker_heartbeats_active_idx ON worker_heartbeats (tenant_id, last_seen_at DESC);
