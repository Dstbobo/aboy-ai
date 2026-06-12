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
