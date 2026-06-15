-- ── Phase 2: lightweight image observability ─────────────────────────────
-- Two compact, upsert-only tables (no per-request rows):
--   image_resolution_stats — for every visual query, did we have an image?
--   coverage_gaps          — visual-intent queries we had NO concept for, so
--                            curation can add what users actually want.
-- Reversible: rollback = drop the tables + functions.

CREATE TABLE IF NOT EXISTS image_resolution_stats (
    day     DATE NOT NULL DEFAULT CURRENT_DATE,
    concept TEXT NOT NULL,
    outcome TEXT NOT NULL,             -- 'served' | 'no_image'
    count   INT  NOT NULL DEFAULT 0,
    PRIMARY KEY (day, concept, outcome)
);

CREATE OR REPLACE FUNCTION bump_resolution_stat(p_concept TEXT, p_outcome TEXT)
RETURNS void AS $$
    INSERT INTO image_resolution_stats (day, concept, outcome, count)
    VALUES (CURRENT_DATE, COALESCE(p_concept, ''), p_outcome, 1)
    ON CONFLICT (day, concept, outcome)
    DO UPDATE SET count = image_resolution_stats.count + 1;
$$ LANGUAGE sql;

-- Visual-intent queries with no matching concept → curation backlog.
CREATE TABLE IF NOT EXISTS coverage_gaps (
    query_norm TEXT PRIMARY KEY,
    sample     TEXT,
    count      INT NOT NULL DEFAULT 0,
    last_seen  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION bump_coverage_gap(p_norm TEXT, p_sample TEXT)
RETURNS void AS $$
    INSERT INTO coverage_gaps (query_norm, sample, count, last_seen)
    VALUES (p_norm, p_sample, 1, now())
    ON CONFLICT (query_norm)
    DO UPDATE SET count = coverage_gaps.count + 1, last_seen = now();
$$ LANGUAGE sql;
