ALTER TABLE social_reels ALTER COLUMN video_url DROP NOT NULL;
ALTER TABLE social_reels ADD COLUMN IF NOT EXISTS media_data bytea;
ALTER TABLE social_reels ADD COLUMN IF NOT EXISTS media_type text;
ALTER TABLE social_reels ADD COLUMN IF NOT EXISTS workout_tag text NOT NULL DEFAULT '';
ALTER TABLE social_reels ADD COLUMN IF NOT EXISTS location text NOT NULL DEFAULT '';
ALTER TABLE social_reels ADD COLUMN IF NOT EXISTS privacy text NOT NULL DEFAULT 'public';

CREATE TABLE IF NOT EXISTS social_reel_likes (
  reel_id uuid NOT NULL REFERENCES social_reels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (reel_id, user_id)
);

CREATE TABLE IF NOT EXISTS social_reel_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id uuid NOT NULL REFERENCES social_reels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_reel_comments_created
  ON social_reel_comments(reel_id, created_at ASC);