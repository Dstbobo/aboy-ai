-- ── Feedback loop completion + activation funnel ─────────────────────────
-- Reversible: rollback = drop the index, the table, and the function.

-- One vote per (user, answer): upsert target for thumbs up/down.
CREATE UNIQUE INDEX IF NOT EXISTS uq_query_feedback_user_audit
    ON query_feedback (user_id, audit_log_id);

-- Activation funnel — compact per-day step counters (no per-event rows).
CREATE TABLE IF NOT EXISTS funnel_events (
    day   DATE NOT NULL DEFAULT CURRENT_DATE,
    step  TEXT NOT NULL,        -- e.g. onboarding_complete | welcome_shown | first_question
    count INT  NOT NULL DEFAULT 0,
    PRIMARY KEY (day, step)
);

CREATE OR REPLACE FUNCTION bump_funnel_event(p_step TEXT)
RETURNS void AS $$
    INSERT INTO funnel_events (day, step, count)
    VALUES (CURRENT_DATE, p_step, 1)
    ON CONFLICT (day, step) DO UPDATE SET count = funnel_events.count + 1;
$$ LANGUAGE sql;
