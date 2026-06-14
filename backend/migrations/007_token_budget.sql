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
