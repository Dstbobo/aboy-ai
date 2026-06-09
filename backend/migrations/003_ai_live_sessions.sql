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
