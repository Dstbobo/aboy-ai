\set ON_ERROR_STOP on

-- Migration 014 intentionally adds foreign keys as NOT VALID so legacy rows
-- do not make the migration itself fail. CI plants exactly one synthetic orphan
-- before 014 and proves that validation detects it before cleanup.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.user_intelligence_profile
        WHERE user_id = '00000000-0000-4000-8000-000000000014'::uuid
    ) THEN
        RAISE EXCEPTION 'expected synthetic legacy orphan is missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'user_intelligence_profile_user_id_fkey'
          AND NOT convalidated
    ) THEN
        RAISE EXCEPTION 'migration 014 did not create the expected NOT VALID constraint';
    END IF;

    BEGIN
        EXECUTE 'ALTER TABLE public.user_intelligence_profile '
            'VALIDATE CONSTRAINT user_intelligence_profile_user_id_fkey';
        RAISE EXCEPTION 'orphaned legacy data unexpectedly passed foreign-key validation';
    EXCEPTION
        WHEN foreign_key_violation THEN NULL;
    END;
END
$$;

DELETE FROM public.user_intelligence_profile
WHERE user_id = '00000000-0000-4000-8000-000000000014'::uuid;

ALTER TABLE public.user_intelligence_profile
    VALIDATE CONSTRAINT user_intelligence_profile_user_id_fkey;
ALTER TABLE public.user_topic_stats
    VALIDATE CONSTRAINT user_topic_stats_user_id_fkey;
ALTER TABLE public.query_audit_log
    VALIDATE CONSTRAINT query_audit_log_user_id_fkey;
ALTER TABLE public.query_audit_log
    VALIDATE CONSTRAINT query_audit_log_session_id_fkey;
ALTER TABLE public.query_feedback
    VALIDATE CONSTRAINT query_feedback_audit_log_id_fkey;
ALTER TABLE public.query_feedback
    VALIDATE CONSTRAINT query_feedback_user_id_fkey;
ALTER TABLE public.ai_live_sessions
    VALIDATE CONSTRAINT ai_live_sessions_user_id_fkey;
ALTER TABLE public.role_change_requests
    VALIDATE CONSTRAINT role_change_requests_reviewed_by_fkey;
ALTER TABLE public.role_change_audit
    VALIDATE CONSTRAINT role_change_audit_actor_user_id_fkey;
ALTER TABLE public.role_change_audit
    VALIDATE CONSTRAINT role_change_audit_target_user_id_fkey;

DO $$
DECLARE
    unvalidated_count integer;
BEGIN
    SELECT count(*)
    INTO unvalidated_count
    FROM pg_constraint
    WHERE conname IN (
        'user_intelligence_profile_user_id_fkey',
        'user_topic_stats_user_id_fkey',
        'query_audit_log_user_id_fkey',
        'query_audit_log_session_id_fkey',
        'query_feedback_audit_log_id_fkey',
        'query_feedback_user_id_fkey',
        'ai_live_sessions_user_id_fkey',
        'role_change_requests_reviewed_by_fkey',
        'role_change_audit_actor_user_id_fkey',
        'role_change_audit_target_user_id_fkey'
    ) AND NOT convalidated;

    IF unvalidated_count <> 0 THEN
        RAISE EXCEPTION '% deferred foreign-key constraints remain unvalidated', unvalidated_count;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.user_intelligence_profile intelligence
        LEFT JOIN public.user_profiles profile ON profile.id = intelligence.user_id
        WHERE profile.id IS NULL
    ) THEN
        RAISE EXCEPTION 'orphaned intelligence records remain after controlled cleanup';
    END IF;
END
$$;
