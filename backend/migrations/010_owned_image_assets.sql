-- ── Phase 1: own the image bytes ─────────────────────────────────────────
-- Self-host validated medical images in Supabase Storage. The registry keeps
-- the upstream `url` as the permanent fallback source; `asset_url` points at
-- our owned copy once curated. License/attribution are captured for the gate
-- and the on-image caption. `servable=false` hides license-incompatible images
-- from BOTH paths (no storage, no proxy).
--
-- Reversible: rollback = drop the added columns + the two new tables/funcs;
-- request-time reads fall back to `url` exactly as before.

ALTER TABLE medical_images
    ADD COLUMN IF NOT EXISTS asset_url   TEXT,
    ADD COLUMN IF NOT EXISTS stored_at   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS stored_by   TEXT,
    ADD COLUMN IF NOT EXISTS license     TEXT,
    ADD COLUMN IF NOT EXISTS attribution TEXT,
    ADD COLUMN IF NOT EXISTS servable    BOOLEAN NOT NULL DEFAULT TRUE;

-- Fast lookup of a registry row by its upstream source url (resolution path).
CREATE INDEX IF NOT EXISTS idx_medical_images_url ON medical_images(url);

-- ── Lightweight resolution counters (no per-request rows) ──
CREATE TABLE IF NOT EXISTS image_request_stats (
    day             DATE NOT NULL DEFAULT CURRENT_DATE,
    concept         TEXT NOT NULL DEFAULT '',
    path            TEXT NOT NULL,                 -- 'primary' | 'fallback'
    fallback_reason TEXT NOT NULL DEFAULT '',      -- ''|unmigrated|storage_error|upstream_error
    status          TEXT NOT NULL DEFAULT 'success',
    count           INT  NOT NULL DEFAULT 0,
    PRIMARY KEY (day, concept, path, fallback_reason, status)
);

CREATE OR REPLACE FUNCTION bump_image_stat(
    p_concept TEXT, p_path TEXT, p_reason TEXT, p_status TEXT
) RETURNS void AS $$
    INSERT INTO image_request_stats (day, concept, path, fallback_reason, status, count)
    VALUES (CURRENT_DATE, COALESCE(p_concept, ''), p_path,
            COALESCE(p_reason, ''), COALESCE(p_status, 'success'), 1)
    ON CONFLICT (day, concept, path, fallback_reason, status)
    DO UPDATE SET count = image_request_stats.count + 1;
$$ LANGUAGE sql;

-- ── Curate failures (e.g. license-incompatible) ──
CREATE TABLE IF NOT EXISTS curate_failures (
    id         BIGSERIAL PRIMARY KEY,
    concept    TEXT,
    reason     TEXT,
    detail     TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
