-- ── Pre-fetched medical illustrations ───────────────────────────────────
-- Source of truth for the auto-attached images. Populated ahead of time (and
-- self-populates on a miss), so request-time lookups are an instant indexed
-- read instead of a flaky live call to Wikimedia/PubChem.
--
-- `concept` is the detector's stable key (e.g. 'human heart anatomy diagram'
-- or 'pubchem:metformin'). A row with found=false records a known miss so we
-- don't keep re-querying upstream for concepts that have no good image.

CREATE TABLE IF NOT EXISTS medical_images (
    concept     TEXT PRIMARY KEY,
    found       BOOLEAN NOT NULL DEFAULT TRUE,
    url         TEXT,
    title       TEXT,
    source      TEXT,
    page_url    TEXT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
