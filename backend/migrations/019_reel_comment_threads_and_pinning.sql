ALTER TABLE social_reel_comments
  ADD COLUMN IF NOT EXISTS parent_comment_id uuid REFERENCES social_reel_comments(id) ON DELETE CASCADE;

ALTER TABLE social_reel_comments
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_social_reel_comments_parent
  ON social_reel_comments(reel_id, parent_comment_id, created_at ASC);