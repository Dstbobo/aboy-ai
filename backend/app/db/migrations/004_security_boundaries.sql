-- Mirror of backend/migrations/013_security_boundaries.sql for the legacy
-- app.db.migrate runner. Both paths are retained until migration consolidation.

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
