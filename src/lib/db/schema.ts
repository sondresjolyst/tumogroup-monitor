// The schema lives in a string so it survives bundling into the job image.
// The role tumogroup_monitor_page must exist before this runs.
export const schemaSql = `
CREATE TABLE IF NOT EXISTS current_state (
    id boolean PRIMARY KEY DEFAULT true CHECK (id),
    model jsonb,
    report_run_id bigint,
    last_success_at timestamptz,
    last_error text,
    last_error_at timestamptz
);

INSERT INTO current_state (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS runs (
    id bigint PRIMARY KEY,
    event text NOT NULL,
    started_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    conclusion text
);

CREATE INDEX IF NOT EXISTS runs_started_at_idx ON runs (started_at DESC);

GRANT SELECT ON current_state, runs TO tumogroup_monitor_page;
`;
