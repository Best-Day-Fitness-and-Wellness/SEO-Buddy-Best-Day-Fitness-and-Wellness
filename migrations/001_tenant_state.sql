CREATE TABLE tenant_state (
  tenant_id text NOT NULL CHECK (tenant_id ~ '^[a-z0-9][a-z0-9_-]{0,79}$'),
  state_key text NOT NULL CHECK (state_key ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'),
  payload jsonb NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, state_key)
);

CREATE INDEX tenant_state_updated_at_idx ON tenant_state (tenant_id, updated_at DESC);

CREATE TABLE audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id text NOT NULL,
  request_id text,
  actor_id text NOT NULL,
  role text NOT NULL,
  action text NOT NULL,
  outcome text NOT NULL,
  status_code integer NOT NULL,
  integrity_hash text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_events_tenant_time_idx ON audit_events (tenant_id, occurred_at DESC);
