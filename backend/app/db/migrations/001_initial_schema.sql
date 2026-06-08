-- ============================================================
-- Aboy AI — Initial Schema
-- Migration: 001_initial_schema.sql
-- Run via: psql $DATABASE_URL -f 001_initial_schema.sql
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── User Profiles ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_profiles (
    id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email               TEXT NOT NULL,
    full_name           TEXT,
    role                TEXT NOT NULL DEFAULT 'student_med'
                        CHECK (role IN (
                            'admin', 'educator',
                            'pro_senior', 'pro_junior', 'pro_nurse',
                            'student_med', 'student_nurse', 'student_allied',
                            'receptionist', 'cashier', 'pharmacist',
                            'lab_technician', 'ward_nurse_manager', 'patient'
                        )),
    role_verified       BOOLEAN DEFAULT FALSE,
    verification_status TEXT DEFAULT 'pending'
                        CHECK (verification_status IN ('pending', 'approved', 'rejected', 'expired')),
    specialty           TEXT,
    sub_role            TEXT,
    institution         TEXT,
    country_code        CHAR(2),
    graduation_year     INT,
    license_expiry      DATE,
    preferred_language  TEXT DEFAULT 'en',
    is_active           BOOLEAN DEFAULT TRUE,
    last_active_at      TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
    ON user_profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON user_profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can read all profiles"
    ON user_profiles FOR SELECT
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    );

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO user_profiles (id, email, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_app_meta_data->>'role', 'student_med')
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── Knowledge Sources ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS knowledge_sources (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT NOT NULL,
    source_type         TEXT NOT NULL CHECK (source_type IN (
                            'pubmed','who','cdc','nice','cochrane',
                            'textbook','guideline','journal','custom','web'
                        )),
    url                 TEXT,
    evidence_grade      TEXT CHECK (evidence_grade IN ('A','B','C','D','expert_opinion')),
    specialty_tags      TEXT[],
    publication_date    DATE,
    ingestion_status    TEXT DEFAULT 'pending' CHECK (ingestion_status IN (
                            'pending','processing','completed','failed','outdated'
                        )),
    chunk_count         INT DEFAULT 0,
    is_active           BOOLEAN DEFAULT TRUE,
    added_by            UUID REFERENCES user_profiles(id),
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE knowledge_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage knowledge sources"
    ON knowledge_sources FOR ALL
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Authenticated users can read active sources"
    ON knowledge_sources FOR SELECT
    USING (is_active = TRUE AND auth.role() = 'authenticated');

-- ─── Knowledge Chunks ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id       UUID NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
    content         TEXT NOT NULL,
    content_hash    TEXT GENERATED ALWAYS AS (encode(digest(content, 'sha256'), 'hex')) STORED,
    embedding       VECTOR(1024) NOT NULL,
    chunk_index     INT NOT NULL,
    section_title   TEXT,
    metadata        JSONB DEFAULT '{}',
    specialty_tags  TEXT[],
    retrieval_count INT DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage chunks"
    ON knowledge_chunks FOR ALL
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Authenticated users can read chunks"
    ON knowledge_chunks FOR SELECT
    USING (auth.role() = 'authenticated');

-- HNSW index for fast ANN search
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding
    ON knowledge_chunks
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Similarity search function
CREATE OR REPLACE FUNCTION match_knowledge_chunks(
    query_embedding VECTOR(1024),
    match_threshold FLOAT DEFAULT 0.65,
    match_count     INT DEFAULT 10
)
RETURNS TABLE (
    id            UUID,
    content       TEXT,
    metadata      JSONB,
    source_id     UUID,
    section_title TEXT,
    similarity    FLOAT
)
LANGUAGE SQL STABLE AS $$
    SELECT
        kc.id,
        kc.content,
        kc.metadata,
        kc.source_id,
        kc.section_title,
        1 - (kc.embedding <=> query_embedding) AS similarity
    FROM knowledge_chunks kc
    JOIN knowledge_sources ks ON ks.id = kc.source_id
    WHERE 1 - (kc.embedding <=> query_embedding) > match_threshold
      AND ks.is_active = TRUE
    ORDER BY kc.embedding <=> query_embedding
    LIMIT match_count;
$$;

-- ─── Query Sessions ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS query_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    title           TEXT,
    query_count     INT DEFAULT 0,
    is_active       BOOLEAN DEFAULT TRUE,
    last_query_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE query_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own sessions"
    ON query_sessions FOR ALL
    USING (auth.uid() = user_id);

-- ─── Audit Log (append-only, NEVER update or delete) ─────────
CREATE TABLE IF NOT EXISTS query_audit_log (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL,
    user_role           TEXT NOT NULL,
    session_id          UUID REFERENCES query_sessions(id),
    query_raw           TEXT NOT NULL,
    query_enhanced      TEXT,
    query_classification TEXT,
    sources_retrieved   JSONB DEFAULT '[]',
    sources_cited       JSONB DEFAULT '[]',
    response_text       TEXT NOT NULL,
    model_used          TEXT NOT NULL,
    tokens_input        INT,
    tokens_output       INT,
    latency_ms          INT,
    safety_flags        TEXT[] DEFAULT '{}',
    emergency_triggered BOOLEAN DEFAULT FALSE,
    flagged_for_review  BOOLEAN DEFAULT FALSE,
    ip_hash             TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE query_audit_log ENABLE ROW LEVEL SECURITY;

-- Insert only — NO update or delete policies ever
CREATE POLICY "Service role inserts audit logs"
    ON query_audit_log FOR INSERT
    WITH CHECK (TRUE);

CREATE POLICY "Admins read audit logs"
    ON query_audit_log FOR SELECT
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Users read own audit logs"
    ON query_audit_log FOR SELECT
    USING (auth.uid() = user_id);

-- ─── Safety Flags ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS safety_flags (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_log_id    UUID NOT NULL REFERENCES query_audit_log(id),
    user_id         UUID NOT NULL,
    flag_type       TEXT NOT NULL CHECK (flag_type IN (
                        'emergency_query','out_of_scope','potential_harm',
                        'hallucination_suspected','role_mismatch','quality_concern'
                    )),
    flag_source     TEXT NOT NULL CHECK (flag_source IN ('automatic','user_report','admin')),
    status          TEXT DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','escalated')),
    resolved_by     UUID REFERENCES user_profiles(id),
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE safety_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage safety flags"
    ON safety_flags FOR ALL
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ─── Rate Limits ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_limit_counters (
    user_id     UUID PRIMARY KEY REFERENCES user_profiles(id) ON DELETE CASCADE,
    count_date  DATE NOT NULL DEFAULT CURRENT_DATE,
    query_count INT DEFAULT 0,
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE rate_limit_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages rate limits"
    ON rate_limit_counters FOR ALL
    USING (TRUE);

-- Reset daily at midnight UTC
SELECT cron.schedule(
    'reset-rate-limits',
    '0 0 * * *',
    'DELETE FROM rate_limit_counters WHERE count_date < CURRENT_DATE'
);

-- ─── Feedback ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS query_feedback (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_log_id    UUID NOT NULL REFERENCES query_audit_log(id),
    user_id         UUID NOT NULL REFERENCES user_profiles(id),
    rating          SMALLINT CHECK (rating BETWEEN 1 AND 5),
    accuracy_rating SMALLINT CHECK (accuracy_rating BETWEEN 1 AND 5),
    feedback_text   TEXT,
    feedback_tags   TEXT[],
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE query_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users submit own feedback"
    ON query_feedback FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users read own feedback"
    ON query_feedback FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Admins read all feedback"
    ON query_feedback FOR SELECT
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
