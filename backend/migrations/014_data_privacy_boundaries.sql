-- Aboy AI P1: RLS for derived/operational tables and deletion cascades.
-- Validate in staging before any production migration.

ALTER TABLE user_intelligence_profile
    DROP CONSTRAINT IF EXISTS user_intelligence_profile_user_id_fkey;
ALTER TABLE user_intelligence_profile
    ADD CONSTRAINT user_intelligence_profile_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE user_topic_stats
    DROP CONSTRAINT IF EXISTS user_topic_stats_user_id_fkey;
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

-- All mutation RPCs are backend-only. The service role bypasses table RLS;
-- direct anon/authenticated execution is revoked explicitly.
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
