-- ============================================================
-- ABOY AI -- Complete Migration Script
-- Paste this entire file into Supabase SQL Editor and click RUN
-- Dashboard: https://supabase.com/dashboard/project/szsdvkziqskrfveuemsi/sql/new
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS "pg_cron";
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available on this plan -- skipping';
END $$;

-- User Profiles
CREATE TABLE IF NOT EXISTS user_profiles (
    id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email               TEXT NOT NULL,
    full_name           TEXT,
    role                TEXT NOT NULL DEFAULT 'student_med',
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
    push_token          TEXT,
    is_active           BOOLEAN DEFAULT TRUE,
    last_active_at      TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_role_check CHECK (role IN (
  'student_med','student_nurse','student_midwifery','student_community_health',
  'student_pharmacy','student_dental','student_physio','student_radiography',
  'student_med_lab','student_biomedical','student_optometry','student_nutrition',
  'student_ot','student_health_info','student_env_health','student_slt',
  'pro_junior','pro_senior','pro_nurse','pro_midwife','pro_community_health',
  'pro_pharmacist','pro_paramedic','pro_public_health','pro_dental','pro_physio',
  'pro_radiographer','pro_med_lab','pro_optometrist','pro_nutritionist',
  'pro_ot','pro_health_info','pro_env_health','pro_slt',
  'educator','admin'
));

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile"           ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile"         ON user_profiles;
DROP POLICY IF EXISTS "Admins can read all profiles"         ON user_profiles;
DROP POLICY IF EXISTS "Service role can insert profiles"     ON user_profiles;

CREATE POLICY "Service role can insert profiles"
    ON user_profiles FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "Users can read own profile"
    ON user_profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON user_profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can read all profiles"
    ON user_profiles FOR SELECT
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    INSERT INTO public.user_profiles (id, email, role, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_app_meta_data->>'role', 'student_med'),
        COALESCE(NEW.raw_user_meta_data->>'full_name', NULL)
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user error: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE INDEX IF NOT EXISTS idx_user_profiles_sub_role ON user_profiles(sub_role);

-- Knowledge Sources
CREATE TABLE IF NOT EXISTS knowledge_sources (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT NOT NULL,
    source_type         TEXT NOT NULL CHECK (source_type IN (
                            'pubmed','who','cdc','nice','cochrane',
                            'textbook','guideline','journal','custom','web')),
    url                 TEXT,
    evidence_grade      TEXT CHECK (evidence_grade IN ('A','B','C','D','expert_opinion')),
    specialty_tags      TEXT[],
    publication_date    DATE,
    ingestion_status    TEXT DEFAULT 'pending' CHECK (ingestion_status IN (
                            'pending','processing','completed','failed','outdated')),
    chunk_count         INT DEFAULT 0,
    is_active           BOOLEAN DEFAULT TRUE,
    added_by            UUID REFERENCES user_profiles(id),
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE knowledge_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage knowledge sources"             ON knowledge_sources;
DROP POLICY IF EXISTS "Authenticated users can read active sources" ON knowledge_sources;
CREATE POLICY "Admins manage knowledge sources"
    ON knowledge_sources FOR ALL
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "Authenticated users can read active sources"
    ON knowledge_sources FOR SELECT
    USING (is_active = TRUE AND auth.role() = 'authenticated');

-- Knowledge Chunks (pgvector 1024-dim)
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
DROP POLICY IF EXISTS "Admins manage chunks"                ON knowledge_chunks;
DROP POLICY IF EXISTS "Authenticated users can read chunks" ON knowledge_chunks;
CREATE POLICY "Admins manage chunks"
    ON knowledge_chunks FOR ALL
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "Authenticated users can read chunks"
    ON knowledge_chunks FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding
    ON knowledge_chunks USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

CREATE OR REPLACE FUNCTION match_knowledge_chunks(
    query_embedding VECTOR(1024),
    match_threshold FLOAT DEFAULT 0.65,
    match_count     INT DEFAULT 10
)
RETURNS TABLE (
    id UUID, content TEXT, metadata JSONB,
    source_id UUID, section_title TEXT, similarity FLOAT
)
LANGUAGE SQL STABLE AS $$
    SELECT kc.id, kc.content, kc.metadata, kc.source_id, kc.section_title,
           1 - (kc.embedding <=> query_embedding) AS similarity
    FROM knowledge_chunks kc
    JOIN knowledge_sources ks ON ks.id = kc.source_id
    WHERE 1 - (kc.embedding <=> query_embedding) > match_threshold
      AND ks.is_active = TRUE
    ORDER BY kc.embedding <=> query_embedding
    LIMIT match_count;
$$;

-- Query Sessions
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
DROP POLICY IF EXISTS "Users manage own sessions" ON query_sessions;
CREATE POLICY "Users manage own sessions"
    ON query_sessions FOR ALL USING (auth.uid() = user_id);

-- Audit Log (append-only -- no UPDATE/DELETE policies)
CREATE TABLE IF NOT EXISTS query_audit_log (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              UUID NOT NULL,
    user_role            TEXT NOT NULL,
    session_id           UUID REFERENCES query_sessions(id),
    query_raw            TEXT NOT NULL,
    query_enhanced       TEXT,
    query_classification TEXT,
    sources_retrieved    JSONB DEFAULT '[]',
    sources_cited        JSONB DEFAULT '[]',
    response_text        TEXT NOT NULL,
    model_used           TEXT NOT NULL,
    tokens_input         INT,
    tokens_output        INT,
    latency_ms           INT,
    safety_flags         TEXT[] DEFAULT '{}',
    emergency_triggered  BOOLEAN DEFAULT FALSE,
    flagged_for_review   BOOLEAN DEFAULT FALSE,
    ip_hash              TEXT,
    created_at           TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE query_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role inserts audit logs" ON query_audit_log;
DROP POLICY IF EXISTS "Admins read audit logs"          ON query_audit_log;
DROP POLICY IF EXISTS "Users read own audit logs"       ON query_audit_log;
CREATE POLICY "Service role inserts audit logs"
    ON query_audit_log FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "Admins read audit logs"
    ON query_audit_log FOR SELECT
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "Users read own audit logs"
    ON query_audit_log FOR SELECT USING (auth.uid() = user_id);

-- Safety Flags
CREATE TABLE IF NOT EXISTS safety_flags (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_log_id    UUID NOT NULL REFERENCES query_audit_log(id),
    user_id         UUID NOT NULL,
    flag_type       TEXT NOT NULL CHECK (flag_type IN (
                        'emergency_query','out_of_scope','potential_harm',
                        'hallucination_suspected','role_mismatch','quality_concern')),
    flag_source     TEXT NOT NULL CHECK (flag_source IN ('automatic','user_report','admin')),
    status          TEXT DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','escalated')),
    resolved_by     UUID REFERENCES user_profiles(id),
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE safety_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage safety flags" ON safety_flags;
CREATE POLICY "Admins manage safety flags"
    ON safety_flags FOR ALL
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Rate Limit Counters
CREATE TABLE IF NOT EXISTS rate_limit_counters (
    user_id     UUID PRIMARY KEY REFERENCES user_profiles(id) ON DELETE CASCADE,
    count_date  DATE NOT NULL DEFAULT CURRENT_DATE,
    query_count INT DEFAULT 0,
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE rate_limit_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role manages rate limits" ON rate_limit_counters;
CREATE POLICY "Service role manages rate limits"
    ON rate_limit_counters FOR ALL USING (TRUE);

DO $$ BEGIN
  PERFORM cron.schedule(
    'reset-rate-limits', '0 0 * * *',
    'DELETE FROM rate_limit_counters WHERE count_date < CURRENT_DATE'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron job skipped: %', SQLERRM;
END $$;

-- Feedback
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
DROP POLICY IF EXISTS "Users submit own feedback" ON query_feedback;
DROP POLICY IF EXISTS "Users read own feedback"   ON query_feedback;
DROP POLICY IF EXISTS "Admins read all feedback"  ON query_feedback;
CREATE POLICY "Users submit own feedback"
    ON query_feedback FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users read own feedback"
    ON query_feedback FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins read all feedback"
    ON query_feedback FOR SELECT
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Verify: show all created tables
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
-- ============================================================
-- ABOY AI — ai_live_sessions (Gemini Live transcripts)
-- Run in Supabase SQL editor, or it is appended to all_migrations.sql.
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_live_sessions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    session_summary  TEXT,
    transcript       JSONB,
    duration_seconds INT,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_live_sessions_user ON ai_live_sessions(user_id);

ALTER TABLE ai_live_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role inserts live sessions" ON ai_live_sessions;
DROP POLICY IF EXISTS "Users read own live sessions"       ON ai_live_sessions;
DROP POLICY IF EXISTS "Admins read all live sessions"      ON ai_live_sessions;

-- The Node proxy writes with the service-role key (bypasses RLS), but keep an
-- explicit INSERT policy so the table is also writable via service role checks.
CREATE POLICY "Service role inserts live sessions"
    ON ai_live_sessions FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "Users read own live sessions"
    ON ai_live_sessions FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins read all live sessions"
    ON ai_live_sessions FOR SELECT
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
-- ============================================================
-- ABOY AI — Role categories expansion + role change requests
-- ============================================================

-- Roles are now prefix-validated (student_/pro_/ops_/edu_/res_ + admin/educator)
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_role_check CHECK (
  role = 'admin' OR role = 'educator'
  OR role LIKE 'student\_%' OR role LIKE 'pro\_%' OR role LIKE 'ops\_%'
  OR role LIKE 'edu\_%' OR role LIKE 'res\_%'
);

-- Role changes go to admin for review (not instant)
CREATE TABLE IF NOT EXISTS role_change_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    from_role       TEXT NOT NULL,
    to_role         TEXT NOT NULL,
    to_sub_role     TEXT,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected')),
    reviewed_by     UUID REFERENCES user_profiles(id),
    reviewed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_role_change_user ON role_change_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_role_change_status ON role_change_requests(status);

ALTER TABLE role_change_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own role requests"   ON role_change_requests;
DROP POLICY IF EXISTS "Service role manages requests"  ON role_change_requests;
CREATE POLICY "Users read own role requests"
    ON role_change_requests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role manages requests"
    ON role_change_requests FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- 005: country as free text (collected at signup)
ALTER TABLE user_profiles ALTER COLUMN country_code TYPE TEXT;

-- 006: flexible role-specific signup details
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}';
-- ============================================================
-- ABOY AI — Daily token budget (beta) + platform settings flag
-- ============================================================

CREATE TABLE IF NOT EXISTS user_token_usage (
    user_id      UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    usage_date   DATE NOT NULL DEFAULT CURRENT_DATE,
    tokens_used  INT NOT NULL DEFAULT 0,
    daily_limit  INT NOT NULL DEFAULT 10000,
    PRIMARY KEY (user_id, usage_date)
);

ALTER TABLE user_token_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own token usage" ON user_token_usage;
DROP POLICY IF EXISTS "Service manages token usage" ON user_token_usage;
CREATE POLICY "Users read own token usage"
    ON user_token_usage FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service manages token usage"
    ON user_token_usage FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- Atomic increment (resets implicitly because usage_date = CURRENT_DATE, UTC).
CREATE OR REPLACE FUNCTION add_token_usage(p_user UUID, p_tokens INT, p_limit INT DEFAULT 10000)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE total INT;
BEGIN
    INSERT INTO user_token_usage (user_id, usage_date, tokens_used, daily_limit)
    VALUES (p_user, CURRENT_DATE, GREATEST(p_tokens, 0), p_limit)
    ON CONFLICT (user_id, usage_date)
    DO UPDATE SET tokens_used = user_token_usage.tokens_used + GREATEST(p_tokens, 0)
    RETURNING tokens_used INTO total;
    RETURN total;
END $$;

-- Feature flags. token_limit_mode = 'daily' | 'monthly' (switch when billing lands).
CREATE TABLE IF NOT EXISTS platform_settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO platform_settings (key, value) VALUES ('token_limit_mode', 'daily')
ON CONFLICT (key) DO NOTHING;
INSERT INTO platform_settings (key, value) VALUES ('daily_token_limit', '10000')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 013: Server-controlled roles and backend-only service access
-- ============================================================

DROP POLICY IF EXISTS "Service role can insert profiles" ON user_profiles;
DROP POLICY IF EXISTS "Service role inserts audit logs" ON query_audit_log;
DROP POLICY IF EXISTS "Service role manages rate limits" ON rate_limit_counters;
DROP POLICY IF EXISTS "Service role inserts live sessions" ON ai_live_sessions;
DROP POLICY IF EXISTS "Service role manages requests" ON role_change_requests;
DROP POLICY IF EXISTS "Service manages token usage" ON user_token_usage;

CREATE OR REPLACE FUNCTION public.guard_user_profile_privileges()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
        IF NEW.id IS DISTINCT FROM OLD.id
           OR NEW.email IS DISTINCT FROM OLD.email
           OR NEW.role IS DISTINCT FROM OLD.role
           OR NEW.sub_role IS DISTINCT FROM OLD.sub_role
           OR NEW.role_verified IS DISTINCT FROM OLD.role_verified
           OR NEW.verification_status IS DISTINCT FROM OLD.verification_status
           OR NEW.license_expiry IS DISTINCT FROM OLD.license_expiry
           OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN
            RAISE EXCEPTION 'server-controlled profile field';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_user_profile_privileges() FROM PUBLIC;

DROP TRIGGER IF EXISTS guard_user_profile_privileges ON user_profiles;
CREATE TRIGGER guard_user_profile_privileges
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION public.guard_user_profile_privileges();

CREATE TABLE IF NOT EXISTS role_change_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID REFERENCES role_change_requests(id) ON DELETE SET NULL,
    actor_user_id UUID NOT NULL REFERENCES user_profiles(id),
    target_user_id UUID NOT NULL REFERENCES user_profiles(id),
    from_role TEXT NOT NULL,
    to_role TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('approved','rejected','admin_updated')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE role_change_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read role change audit" ON role_change_audit;
CREATE POLICY "Admins read role change audit"
    ON role_change_audit FOR SELECT TO authenticated
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Service-role clients bypass RLS. Ordinary authenticated clients retain only
-- the explicit owner-read policies defined by earlier migrations.
