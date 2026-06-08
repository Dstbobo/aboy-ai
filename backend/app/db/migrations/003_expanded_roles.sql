-- Migration 003: Expand role constraint + add sub_role column
-- Run after 001_initial_schema.sql

-- 1. Add sub_role column if not present
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS sub_role TEXT;

-- 2. Drop the existing role CHECK constraint (name may vary; drop by constraint name or recreate)
ALTER TABLE user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_role_check;

-- 3. Add updated CHECK constraint covering all 34 role IDs + system roles
ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_role_check CHECK (role IN (
    -- Students (16)
    'student_med',
    'student_nurse',
    'student_midwifery',
    'student_community_health',
    'student_pharmacy',
    'student_dental',
    'student_physio',
    'student_radiography',
    'student_med_lab',
    'student_biomedical',
    'student_optometry',
    'student_nutrition',
    'student_ot',
    'student_health_info',
    'student_env_health',
    'student_slt',
    -- Professionals (18)
    'pro_junior',
    'pro_senior',
    'pro_nurse',
    'pro_midwife',
    'pro_community_health',
    'pro_pharmacist',
    'pro_paramedic',
    'pro_public_health',
    'pro_dental',
    'pro_physio',
    'pro_radiographer',
    'pro_med_lab',
    'pro_optometrist',
    'pro_nutritionist',
    'pro_ot',
    'pro_health_info',
    'pro_env_health',
    'pro_slt',
    -- System roles
    'educator',
    'admin'
  ));

-- 4. Add index on sub_role for analytics queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_sub_role ON user_profiles(sub_role);

-- 5. Update RLS — sub_role follows same pattern as existing columns (users own their row)
-- Existing policies already cover all columns via the UPDATE policy on user_profiles.
-- No new policy needed.
