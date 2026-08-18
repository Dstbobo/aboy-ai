BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path TO public, extensions;
SELECT no_plan();

-- Required Supabase identities and functions exist in the isolated stack.
SELECT ok(to_regnamespace('auth') IS NOT NULL, 'auth schema exists');
SELECT ok(to_regrole('anon') IS NOT NULL, 'anon role exists');
SELECT ok(to_regrole('authenticated') IS NOT NULL, 'authenticated role exists');
SELECT ok(to_regrole('service_role') IS NOT NULL, 'service_role exists');
SELECT ok(to_regprocedure('auth.uid()') IS NOT NULL, 'auth.uid() exists');
SELECT ok(to_regprocedure('auth.jwt()') IS NOT NULL, 'auth.jwt() exists');
SELECT ok(
    to_regprocedure('public.guard_user_profile_privileges()') IS NOT NULL,
    'migration 013 privilege guard exists'
);
SELECT ok(
    to_regprocedure('public.bump_topic_stat(uuid,text,boolean)') IS NOT NULL,
    'dependent mutation function exists'
);
SELECT is(
    (SELECT count(*) FROM pg_constraint
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
     ) AND convalidated),
    10::bigint,
    'all migration 014 foreign keys are validated'
);
SELECT is(
    (SELECT count(*) FROM pg_class
     WHERE relname IN (
        'user_profiles', 'query_sessions', 'query_audit_log', 'query_feedback',
        'role_change_requests', 'role_change_audit', 'user_intelligence_profile',
        'user_topic_stats', 'medical_images', 'image_request_stats',
        'curate_failures', 'image_resolution_stats', 'coverage_gaps', 'funnel_events'
     ) AND relrowsecurity),
    14::bigint,
    'RLS is enabled on identity, ownership, and derived-data tables'
);
SELECT is(
    has_function_privilege('anon', 'public.bump_topic_stat(uuid,text,boolean)', 'EXECUTE'),
    false,
    'anon cannot execute backend mutation functions'
);
SELECT is(
    has_function_privilege('authenticated', 'public.bump_topic_stat(uuid,text,boolean)', 'EXECUTE'),
    false,
    'authenticated users cannot execute backend mutation functions'
);
SELECT is(
    has_function_privilege('service_role', 'public.bump_topic_stat(uuid,text,boolean)', 'EXECUTE'),
    true,
    'service role can execute backend mutation functions'
);
SELECT is(
    has_table_privilege('anon', 'public.user_profiles', 'SELECT'),
    false,
    'anonymous role has no private profile table grant'
);
SELECT is(
    has_table_privilege('authenticated', 'public.user_profiles', 'SELECT'),
    true,
    'authenticated role has the profile privilege required for RLS evaluation'
);
SELECT is(
    has_table_privilege('service_role', 'public.user_profiles', 'UPDATE'),
    true,
    'service role has explicit backend table privileges'
);

-- Synthetic Auth users cause the production trigger to create profiles.
INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
(
    '11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated',
    'ordinary-a@example.invalid', '', now(),
    '{"provider":"email","providers":["email"],"role":"student_med"}', '{}', now(), now()
),
(
    '22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated',
    'ordinary-b@example.invalid', '', now(),
    '{"provider":"email","providers":["email"],"role":"pro_nurse"}', '{}', now(), now()
),
(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'authenticated', 'authenticated',
    'admin@example.invalid', '', now(),
    '{"provider":"email","providers":["email"],"role":"admin"}', '{}', now(), now()
);

SELECT is((SELECT count(*) FROM user_profiles), 3::bigint, 'profile trigger created three profiles');

INSERT INTO query_sessions (id, user_id, title) VALUES
('11111111-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'A session'),
('22222222-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'B session');

INSERT INTO query_audit_log (
    id, user_id, user_role, session_id, query_raw, response_text,
    model_used, tokens_input, tokens_output, latency_ms
) VALUES
(
    '11111111-0000-4000-8000-000000000011',
    '11111111-1111-4111-8111-111111111111', 'student_med',
    '11111111-0000-4000-8000-000000000001', 'synthetic A query',
    'synthetic A response', 'test-model', 1, 1, 1
),
(
    '22222222-0000-4000-8000-000000000022',
    '22222222-2222-4222-8222-222222222222', 'pro_nurse',
    '22222222-0000-4000-8000-000000000002', 'synthetic B query',
    'synthetic B response', 'test-model', 1, 1, 1
);

INSERT INTO role_change_requests (
    id, user_id, from_role, to_role, status, reviewed_by, reviewed_at
) VALUES (
    '22222222-0000-4000-8000-000000000033',
    '22222222-2222-4222-8222-222222222222',
    'pro_nurse', 'pro_senior', 'approved',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now()
);
INSERT INTO role_change_audit (
    id, request_id, actor_user_id, target_user_id, from_role, to_role, outcome
) VALUES (
    '22222222-0000-4000-8000-000000000044',
    '22222222-0000-4000-8000-000000000033',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '22222222-2222-4222-8222-222222222222',
    'pro_nurse', 'pro_senior', 'approved'
);

-- Anonymous callers see no private records and cannot create ownership data.
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', 'anon', true);
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;
SELECT is(auth.uid(), NULL::uuid, 'auth.uid() is null for anonymous access');
SELECT is(auth.jwt() ->> 'role', 'anon', 'auth.jwt() exposes the anonymous role');
SELECT throws_ok(
    $$SELECT count(*) FROM user_profiles$$,
    '42501', NULL, 'anonymous profile access fails closed at the privilege boundary'
);
SELECT throws_ok(
    $$SELECT count(*) FROM query_sessions$$,
    '42501', NULL, 'anonymous conversation access fails closed at the privilege boundary'
);
SELECT throws_ok(
    $$INSERT INTO query_sessions (user_id, title) VALUES
      ('11111111-1111-4111-8111-111111111111', 'forbidden anonymous session')$$,
    '42501', NULL, 'anonymous conversation creation is denied'
);
RESET ROLE;

-- Ordinary authenticated user A can access only A-owned rows.
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config(
    'request.jwt.claims',
    '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","app_metadata":{"role":"student_med"}}',
    true
);
SET LOCAL ROLE authenticated;
SELECT is(
    auth.uid(),
    '11111111-1111-4111-8111-111111111111'::uuid,
    'auth.uid() binds the ordinary user identity'
);
SELECT is(
    auth.jwt() -> 'app_metadata' ->> 'role',
    'student_med',
    'auth.jwt() exposes signed app metadata'
);
SELECT is((SELECT count(*) FROM user_profiles), 1::bigint, 'ordinary user sees only own profile');
SELECT is((SELECT count(*) FROM query_sessions), 1::bigint, 'ordinary user sees only own conversation');
SELECT is((SELECT count(*) FROM query_audit_log), 1::bigint, 'ordinary user sees only own audit history');
SELECT lives_ok(
    $$UPDATE user_profiles SET full_name = 'Synthetic User A'
      WHERE id = '11111111-1111-4111-8111-111111111111'$$,
    'ordinary user can update non-privileged profile fields'
);
SELECT throws_ok(
    $$UPDATE user_profiles SET role = 'admin'
      WHERE id = '11111111-1111-4111-8111-111111111111'$$,
    'P0001', 'server-controlled profile field',
    'ordinary user role escalation is rejected by migration 013'
);
SELECT throws_ok(
    $$INSERT INTO query_sessions (user_id, title) VALUES
      ('22222222-2222-4222-8222-222222222222', 'cross-user session')$$,
    '42501', NULL, 'ordinary user cannot create another user conversation'
);
SELECT lives_ok(
    $$INSERT INTO query_feedback (audit_log_id, user_id, rating, feedback_text)
      VALUES (
        '11111111-0000-4000-8000-000000000011',
        '11111111-1111-4111-8111-111111111111', 5, 'synthetic own feedback'
      )$$,
    'ordinary user can submit feedback for own audit record'
);
SELECT throws_ok(
    $$INSERT INTO query_feedback (audit_log_id, user_id, rating, feedback_text)
      VALUES (
        '22222222-0000-4000-8000-000000000022',
        '11111111-1111-4111-8111-111111111111', 1, 'forbidden cross-user feedback'
      )$$,
    '42501', NULL, 'cross-user feedback ownership is rejected'
);
SELECT throws_ok(
    $$INSERT INTO role_change_requests (user_id, from_role, to_role)
      VALUES ('11111111-1111-4111-8111-111111111111', 'student_med', 'admin')$$,
    '42501', NULL, 'client-side privileged role requests cannot bypass backend review'
);
SELECT throws_ok(
    $$SELECT public.bump_topic_stat(
      '11111111-1111-4111-8111-111111111111', 'forbidden-rpc', false)$$,
    '42501', NULL, 'ordinary users cannot execute service-only mutation RPCs'
);
RESET ROLE;

-- Admin JWTs can review protected data but cannot directly mutate another role.
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config(
    'request.jwt.claims',
    '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated","app_metadata":{"role":"admin"}}',
    true
);
SET LOCAL ROLE authenticated;
SELECT is(auth.jwt() -> 'app_metadata' ->> 'role', 'admin', 'admin workflow uses app_metadata role');
SELECT is((SELECT count(*) FROM user_profiles), 3::bigint, 'admin can review all profiles');
SELECT is((SELECT count(*) FROM query_audit_log), 2::bigint, 'admin can review all audit records');
SELECT is((SELECT count(*) FROM role_change_audit), 1::bigint, 'admin can review role-change audit');
SELECT lives_ok(
    $$UPDATE user_profiles SET role = 'admin'
      WHERE id = '22222222-2222-4222-8222-222222222222'$$,
    'admin client role-update attempt is evaluated by RLS'
);
SELECT is(
    (SELECT role FROM user_profiles
     WHERE id = '22222222-2222-4222-8222-222222222222'),
    'pro_nurse',
    'admin client cannot directly rewrite another profile role'
);
RESET ROLE;

-- The backend service role can perform the reviewed, server-controlled writes.
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL ROLE service_role;
SELECT is(auth.jwt() ->> 'role', 'service_role', 'service-role claim reaches the privilege guard');
SELECT is((SELECT count(*) FROM user_profiles), 3::bigint, 'service role can read all profiles');
SELECT lives_ok(
    $$UPDATE user_profiles SET role = 'pro_senior', role_verified = true
      WHERE id = '22222222-2222-4222-8222-222222222222'$$,
    'service role can apply an approved role change'
);
SELECT lives_ok(
    $$SELECT public.bump_topic_stat(
      '11111111-1111-4111-8111-111111111111', 'synthetic-topic', false)$$,
    'service role can execute backend mutation RPCs'
);
SELECT lives_ok(
    $$INSERT INTO ai_live_sessions (user_id, session_summary, transcript)
      VALUES (
        '11111111-1111-4111-8111-111111111111',
        'synthetic live session', '[{"speaker":"user","text":"synthetic"}]'
      )$$,
    'service role can write backend-owned Live records'
);
RESET ROLE;

-- Seed remaining owned data, then prove account deletion behavior.
INSERT INTO user_intelligence_profile (user_id, total_sessions)
VALUES ('11111111-1111-4111-8111-111111111111', 1);
INSERT INTO user_token_usage (user_id, tokens_used)
VALUES ('11111111-1111-4111-8111-111111111111', 10);
INSERT INTO rate_limit_counters (user_id, query_count)
VALUES ('11111111-1111-4111-8111-111111111111', 1);

SELECT lives_ok(
    $$DELETE FROM auth.users
      WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
    'deleting an admin identity preserves reviewed records safely'
);
SELECT is(
    (SELECT reviewed_by FROM role_change_requests
     WHERE id = '22222222-0000-4000-8000-000000000033'),
    NULL::uuid,
    'deleted reviewer is set null'
);
SELECT is(
    (SELECT actor_user_id FROM role_change_audit
     WHERE id = '22222222-0000-4000-8000-000000000044'),
    NULL::uuid,
    'deleted audit actor is set null'
);

SELECT lives_ok(
    $$DELETE FROM auth.users
      WHERE id = '11111111-1111-4111-8111-111111111111'$$,
    'deleting an ordinary identity cascades through owned records'
);
SELECT is((SELECT count(*) FROM user_profiles WHERE id = '11111111-1111-4111-8111-111111111111'), 0::bigint, 'profile cascaded');
SELECT is((SELECT count(*) FROM query_sessions WHERE user_id = '11111111-1111-4111-8111-111111111111'), 0::bigint, 'conversations cascaded');
SELECT is((SELECT count(*) FROM query_audit_log WHERE user_id = '11111111-1111-4111-8111-111111111111'), 0::bigint, 'audit records cascaded');
SELECT is((SELECT count(*) FROM query_feedback WHERE user_id = '11111111-1111-4111-8111-111111111111'), 0::bigint, 'feedback cascaded');
SELECT is((SELECT count(*) FROM user_intelligence_profile WHERE user_id = '11111111-1111-4111-8111-111111111111'), 0::bigint, 'intelligence profile cascaded');
SELECT is((SELECT count(*) FROM user_topic_stats WHERE user_id = '11111111-1111-4111-8111-111111111111'), 0::bigint, 'topic statistics cascaded');
SELECT is((SELECT count(*) FROM ai_live_sessions WHERE user_id = '11111111-1111-4111-8111-111111111111'), 0::bigint, 'Live records cascaded');
SELECT is((SELECT count(*) FROM user_token_usage WHERE user_id = '11111111-1111-4111-8111-111111111111'), 0::bigint, 'token usage cascaded');
SELECT is((SELECT count(*) FROM rate_limit_counters WHERE user_id = '11111111-1111-4111-8111-111111111111'), 0::bigint, 'rate limits cascaded');
SELECT throws_ok(
    $$INSERT INTO user_topic_stats (user_id, topic)
      VALUES ('99999999-9999-4999-8999-999999999999', 'orphan')$$,
    '23503', NULL, 'validated constraints reject new orphaned records'
);

SELECT * FROM finish();
ROLLBACK;
