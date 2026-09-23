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
-- 008: Personal learning intelligence
-- ============================================================

CREATE TABLE IF NOT EXISTS user_intelligence_profile (
    user_id UUID PRIMARY KEY,
    role TEXT,
    topics_frequent JSONB NOT NULL DEFAULT '[]'::jsonb,
    topics_mastered JSONB NOT NULL DEFAULT '[]'::jsonb,
    topics_struggling JSONB NOT NULL DEFAULT '[]'::jsonb,
    liked_topics JSONB NOT NULL DEFAULT '[]'::jsonb,
    disliked_topics JSONB NOT NULL DEFAULT '[]'::jsonb,
    study_pattern JSONB NOT NULL DEFAULT '{}'::jsonb,
    peak_active_hour INT,
    current_streak INT NOT NULL DEFAULT 0,
    longest_streak INT NOT NULL DEFAULT 0,
    last_active_at TIMESTAMPTZ,
    last_topic TEXT,
    last_topic_at TIMESTAMPTZ,
    strong_areas JSONB NOT NULL DEFAULT '[]'::jsonb,
    weak_areas JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_sessions INT NOT NULL DEFAULT 0,
    total_queries INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_topic_stats (
    user_id UUID NOT NULL,
    topic TEXT NOT NULL,
    query_count INT NOT NULL DEFAULT 0,
    followup_count INT NOT NULL DEFAULT 0,
    liked INT NOT NULL DEFAULT 0,
    disliked INT NOT NULL DEFAULT 0,
    last_studied_at TIMESTAMPTZ,
    PRIMARY KEY (user_id, topic)
);

CREATE OR REPLACE FUNCTION bump_topic_stat(
    p_user UUID, p_topic TEXT, p_is_followup BOOLEAN DEFAULT FALSE
) RETURNS user_topic_stats AS $$
    INSERT INTO user_topic_stats (user_id, topic, query_count, followup_count, last_studied_at)
    VALUES (p_user, p_topic, 1, CASE WHEN p_is_followup THEN 1 ELSE 0 END, NOW())
    ON CONFLICT (user_id, topic) DO UPDATE SET
        query_count = user_topic_stats.query_count + 1,
        followup_count = user_topic_stats.followup_count
            + CASE WHEN p_is_followup THEN 1 ELSE 0 END,
        last_studied_at = NOW()
    RETURNING *;
$$ LANGUAGE sql;

CREATE INDEX IF NOT EXISTS idx_topic_stats_user ON user_topic_stats(user_id);

CREATE OR REPLACE FUNCTION bump_topic_feedback(p_user UUID, p_topic TEXT, p_col TEXT)
RETURNS void AS $$
    INSERT INTO user_topic_stats (user_id, topic, liked, disliked)
    VALUES (
        p_user,
        p_topic,
        CASE WHEN p_col = 'liked' THEN 1 ELSE 0 END,
        CASE WHEN p_col = 'disliked' THEN 1 ELSE 0 END
    )
    ON CONFLICT (user_id, topic) DO UPDATE SET
        liked = user_topic_stats.liked + CASE WHEN p_col = 'liked' THEN 1 ELSE 0 END,
        disliked = user_topic_stats.disliked
            + CASE WHEN p_col = 'disliked' THEN 1 ELSE 0 END;
$$ LANGUAGE sql;

-- ============================================================
-- 009-011: Medical image registry and operational counters
-- ============================================================

CREATE TABLE IF NOT EXISTS medical_images (
    concept TEXT PRIMARY KEY,
    found BOOLEAN NOT NULL DEFAULT TRUE,
    url TEXT,
    title TEXT,
    source TEXT,
    page_url TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE medical_images
    ADD COLUMN IF NOT EXISTS asset_url TEXT,
    ADD COLUMN IF NOT EXISTS stored_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS stored_by TEXT,
    ADD COLUMN IF NOT EXISTS license TEXT,
    ADD COLUMN IF NOT EXISTS attribution TEXT,
    ADD COLUMN IF NOT EXISTS servable BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_medical_images_url ON medical_images(url);

CREATE TABLE IF NOT EXISTS image_request_stats (
    day DATE NOT NULL DEFAULT CURRENT_DATE,
    concept TEXT NOT NULL DEFAULT '',
    path TEXT NOT NULL,
    fallback_reason TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'success',
    count INT NOT NULL DEFAULT 0,
    PRIMARY KEY (day, concept, path, fallback_reason, status)
);

CREATE OR REPLACE FUNCTION bump_image_stat(
    p_concept TEXT, p_path TEXT, p_reason TEXT, p_status TEXT
) RETURNS void AS $$
    INSERT INTO image_request_stats (day, concept, path, fallback_reason, status, count)
    VALUES (
        CURRENT_DATE, COALESCE(p_concept, ''), p_path,
        COALESCE(p_reason, ''), COALESCE(p_status, 'success'), 1
    )
    ON CONFLICT (day, concept, path, fallback_reason, status)
    DO UPDATE SET count = image_request_stats.count + 1;
$$ LANGUAGE sql;

CREATE TABLE IF NOT EXISTS curate_failures (
    id BIGSERIAL PRIMARY KEY,
    concept TEXT,
    reason TEXT,
    detail TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS image_resolution_stats (
    day DATE NOT NULL DEFAULT CURRENT_DATE,
    concept TEXT NOT NULL,
    outcome TEXT NOT NULL,
    count INT NOT NULL DEFAULT 0,
    PRIMARY KEY (day, concept, outcome)
);

CREATE OR REPLACE FUNCTION bump_resolution_stat(p_concept TEXT, p_outcome TEXT)
RETURNS void AS $$
    INSERT INTO image_resolution_stats (day, concept, outcome, count)
    VALUES (CURRENT_DATE, COALESCE(p_concept, ''), p_outcome, 1)
    ON CONFLICT (day, concept, outcome)
    DO UPDATE SET count = image_resolution_stats.count + 1;
$$ LANGUAGE sql;

CREATE TABLE IF NOT EXISTS coverage_gaps (
    query_norm TEXT PRIMARY KEY,
    sample TEXT,
    count INT NOT NULL DEFAULT 0,
    last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION bump_coverage_gap(p_norm TEXT, p_sample TEXT)
RETURNS void AS $$
    INSERT INTO coverage_gaps (query_norm, sample, count, last_seen)
    VALUES (p_norm, p_sample, 1, NOW())
    ON CONFLICT (query_norm)
    DO UPDATE SET count = coverage_gaps.count + 1, last_seen = NOW();
$$ LANGUAGE sql;

-- ============================================================
-- 012: Feedback uniqueness and aggregate activation funnel
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_query_feedback_user_audit
    ON query_feedback (user_id, audit_log_id);

CREATE TABLE IF NOT EXISTS funnel_events (
    day DATE NOT NULL DEFAULT CURRENT_DATE,
    step TEXT NOT NULL,
    count INT NOT NULL DEFAULT 0,
    PRIMARY KEY (day, step)
);

CREATE OR REPLACE FUNCTION bump_funnel_event(p_step TEXT)
RETURNS void AS $$
    INSERT INTO funnel_events (day, step, count)
    VALUES (CURRENT_DATE, p_step, 1)
    ON CONFLICT (day, step) DO UPDATE SET count = funnel_events.count + 1;
$$ LANGUAGE sql;

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

-- ============================================================
-- 014: Derived-data RLS and account-deletion cascades
-- ============================================================

ALTER TABLE user_intelligence_profile
    DROP CONSTRAINT IF EXISTS user_intelligence_profile_user_id_fkey;
ALTER TABLE user_intelligence_profile
    ADD CONSTRAINT user_intelligence_profile_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE user_topic_stats DROP CONSTRAINT IF EXISTS user_topic_stats_user_id_fkey;
ALTER TABLE user_topic_stats
    ADD CONSTRAINT user_topic_stats_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE query_audit_log DROP CONSTRAINT IF EXISTS query_audit_log_user_id_fkey;
ALTER TABLE query_audit_log
    ADD CONSTRAINT query_audit_log_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE query_audit_log DROP CONSTRAINT IF EXISTS query_audit_log_session_id_fkey;
ALTER TABLE query_audit_log
    ADD CONSTRAINT query_audit_log_session_id_fkey
    FOREIGN KEY (session_id) REFERENCES query_sessions(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE query_feedback DROP CONSTRAINT IF EXISTS query_feedback_audit_log_id_fkey;
ALTER TABLE query_feedback
    ADD CONSTRAINT query_feedback_audit_log_id_fkey
    FOREIGN KEY (audit_log_id) REFERENCES query_audit_log(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE query_feedback DROP CONSTRAINT IF EXISTS query_feedback_user_id_fkey;
ALTER TABLE query_feedback
    ADD CONSTRAINT query_feedback_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE ai_live_sessions DROP CONSTRAINT IF EXISTS ai_live_sessions_user_id_fkey;
ALTER TABLE ai_live_sessions
    ADD CONSTRAINT ai_live_sessions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE role_change_requests DROP CONSTRAINT IF EXISTS role_change_requests_reviewed_by_fkey;
ALTER TABLE role_change_requests
    ADD CONSTRAINT role_change_requests_reviewed_by_fkey
    FOREIGN KEY (reviewed_by) REFERENCES user_profiles(id) ON DELETE SET NULL NOT VALID;

ALTER TABLE role_change_audit ALTER COLUMN actor_user_id DROP NOT NULL;
ALTER TABLE role_change_audit DROP CONSTRAINT IF EXISTS role_change_audit_actor_user_id_fkey;
ALTER TABLE role_change_audit
    ADD CONSTRAINT role_change_audit_actor_user_id_fkey
    FOREIGN KEY (actor_user_id) REFERENCES user_profiles(id) ON DELETE SET NULL NOT VALID;
ALTER TABLE role_change_audit DROP CONSTRAINT IF EXISTS role_change_audit_target_user_id_fkey;
ALTER TABLE role_change_audit
    ADD CONSTRAINT role_change_audit_target_user_id_fkey
    FOREIGN KEY (target_user_id) REFERENCES user_profiles(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE knowledge_sources DROP CONSTRAINT IF EXISTS knowledge_sources_added_by_fkey;
ALTER TABLE knowledge_sources
    ADD CONSTRAINT knowledge_sources_added_by_fkey
    FOREIGN KEY (added_by) REFERENCES user_profiles(id) ON DELETE SET NULL NOT VALID;

ALTER TABLE safety_flags DROP CONSTRAINT IF EXISTS safety_flags_audit_log_id_fkey;
ALTER TABLE safety_flags
    ADD CONSTRAINT safety_flags_audit_log_id_fkey
    FOREIGN KEY (audit_log_id) REFERENCES query_audit_log(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE safety_flags DROP CONSTRAINT IF EXISTS safety_flags_user_id_fkey;
ALTER TABLE safety_flags
    ADD CONSTRAINT safety_flags_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE safety_flags DROP CONSTRAINT IF EXISTS safety_flags_resolved_by_fkey;
ALTER TABLE safety_flags
    ADD CONSTRAINT safety_flags_resolved_by_fkey
    FOREIGN KEY (resolved_by) REFERENCES user_profiles(id) ON DELETE SET NULL NOT VALID;

ALTER TABLE user_intelligence_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_topic_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE image_request_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE curate_failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE image_resolution_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE coverage_gaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE funnel_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

-- Do not rely on provider-specific default privileges. These grants are the
-- minimum direct client surface supported by the policies below and by the
-- owner/admin policies created in the baseline. Anonymous callers receive no
-- public-table grant; authentication itself is handled by Supabase Auth.
GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT SELECT, UPDATE ON user_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON query_sessions TO authenticated;
GRANT SELECT ON query_audit_log TO authenticated;
GRANT SELECT, INSERT ON query_feedback TO authenticated;
GRANT SELECT ON ai_live_sessions TO authenticated;
GRANT SELECT ON role_change_requests, role_change_audit TO authenticated;
GRANT SELECT ON user_token_usage TO authenticated;
GRANT SELECT ON user_intelligence_profile, user_topic_stats TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON knowledge_sources, knowledge_chunks
    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON safety_flags TO authenticated;

-- The backend service role is the only direct writer for operational and
-- derived tables. RLS bypass alone does not imply SQL object privileges.
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

DROP POLICY IF EXISTS "Users read own intelligence profile" ON user_intelligence_profile;
CREATE POLICY "Users read own intelligence profile"
    ON user_intelligence_profile FOR SELECT TO authenticated
    USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users read own topic stats" ON user_topic_stats;
CREATE POLICY "Users read own topic stats"
    ON user_topic_stats FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users submit own feedback" ON query_feedback;
CREATE POLICY "Users submit own feedback"
    ON query_feedback FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM query_audit_log audit
            WHERE audit.id = audit_log_id AND audit.user_id = auth.uid()
        )
    );

REVOKE ALL ON FUNCTION public.bump_topic_stat(UUID, TEXT, BOOLEAN)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bump_topic_feedback(UUID, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bump_image_stat(TEXT, TEXT, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bump_resolution_stat(TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bump_coverage_gap(TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bump_funnel_event(TEXT)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.add_token_usage(UUID, INT, INT)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.bump_topic_stat(UUID, TEXT, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.bump_topic_feedback(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.bump_image_stat(TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.bump_resolution_stat(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.bump_coverage_gap(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.bump_funnel_event(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.add_token_usage(UUID, INT, INT) TO service_role;

ALTER FUNCTION public.handle_new_user() SET search_path = public, auth;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
