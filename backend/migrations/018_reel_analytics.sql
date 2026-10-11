CREATE TABLE IF NOT EXISTS social_reel_saves (
  reel_id uuid NOT NULL REFERENCES social_reels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (reel_id, user_id)
);

CREATE TABLE IF NOT EXISTS social_reel_analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id uuid NOT NULL REFERENCES social_reels(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('impression', 'watch', 'share')),
  watch_ms integer NOT NULL DEFAULT 0 CHECK (watch_ms BETWEEN 0 AND 30000),
  progress_pct smallint NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_reel_analytics_reel_created
  ON social_reel_analytics_events(reel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_reel_analytics_actor
  ON social_reel_analytics_events(reel_id, actor_id, event_type);
