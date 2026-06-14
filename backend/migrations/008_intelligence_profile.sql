-- ── Personal learning intelligence profile ──────────────────────────────
-- One row per user. Updated automatically (background) after every query.
-- No manual input from the user, ever.

CREATE TABLE IF NOT EXISTS user_intelligence_profile (
    user_id          UUID PRIMARY KEY,
    role             TEXT,
    topics_frequent  JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{topic,count}]
    topics_mastered  JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [topic,...]
    topics_struggling JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{topic,count}]
    liked_topics     JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [topic,...]
    disliked_topics  JSONB NOT NULL DEFAULT '[]'::jsonb,
    study_pattern    JSONB NOT NULL DEFAULT '{}'::jsonb,   -- {hour_histogram, avg_session_min}
    peak_active_hour INT,
    current_streak   INT NOT NULL DEFAULT 0,
    longest_streak   INT NOT NULL DEFAULT 0,
    last_active_at   TIMESTAMPTZ,
    last_topic       TEXT,
    last_topic_at    TIMESTAMPTZ,
    strong_areas     JSONB NOT NULL DEFAULT '[]'::jsonb,
    weak_areas       JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_sessions   INT NOT NULL DEFAULT 0,
    total_queries    INT NOT NULL DEFAULT 0,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-topic running tally so we can compute frequent/struggling/mastered
-- without scanning the whole audit log each time.
CREATE TABLE IF NOT EXISTS user_topic_stats (
    user_id        UUID NOT NULL,
    topic          TEXT NOT NULL,
    query_count    INT NOT NULL DEFAULT 0,
    followup_count INT NOT NULL DEFAULT 0,   -- repeats/clarifications → struggling
    liked          INT NOT NULL DEFAULT 0,
    disliked       INT NOT NULL DEFAULT 0,
    last_studied_at TIMESTAMPTZ,
    PRIMARY KEY (user_id, topic)
);

-- Atomic upsert of a topic tally; returns the new running totals.
CREATE OR REPLACE FUNCTION bump_topic_stat(
    p_user UUID,
    p_topic TEXT,
    p_is_followup BOOLEAN DEFAULT FALSE
) RETURNS user_topic_stats AS $$
    INSERT INTO user_topic_stats (user_id, topic, query_count, followup_count, last_studied_at)
    VALUES (p_user, p_topic, 1, CASE WHEN p_is_followup THEN 1 ELSE 0 END, now())
    ON CONFLICT (user_id, topic) DO UPDATE SET
        query_count = user_topic_stats.query_count + 1,
        followup_count = user_topic_stats.followup_count + CASE WHEN p_is_followup THEN 1 ELSE 0 END,
        last_studied_at = now()
    RETURNING *;
$$ LANGUAGE sql;

CREATE INDEX IF NOT EXISTS idx_topic_stats_user ON user_topic_stats(user_id);

-- Like/dislike feedback → topic tallies.
CREATE OR REPLACE FUNCTION bump_topic_feedback(p_user UUID, p_topic TEXT, p_col TEXT)
RETURNS void AS $$
    INSERT INTO user_topic_stats (user_id, topic, liked, disliked)
    VALUES (p_user, p_topic,
            CASE WHEN p_col = 'liked' THEN 1 ELSE 0 END,
            CASE WHEN p_col = 'disliked' THEN 1 ELSE 0 END)
    ON CONFLICT (user_id, topic) DO UPDATE SET
        liked    = user_topic_stats.liked    + CASE WHEN p_col = 'liked'    THEN 1 ELSE 0 END,
        disliked = user_topic_stats.disliked + CASE WHEN p_col = 'disliked' THEN 1 ELSE 0 END;
$$ LANGUAGE sql;
