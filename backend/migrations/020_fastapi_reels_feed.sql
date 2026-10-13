CREATE TABLE IF NOT EXISTS reels (
  id serial PRIMARY KEY,
  video_url varchar(2048) NOT NULL,
  thumbnail_url varchar(2048),
  caption text NOT NULL DEFAULT '',
  creator_name varchar(120) NOT NULL,
  like_count integer NOT NULL DEFAULT 0 CHECK (like_count >= 0),
  comment_count integer NOT NULL DEFAULT 0 CHECK (comment_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reels ADD COLUMN IF NOT EXISTS like_count integer NOT NULL DEFAULT 0;
ALTER TABLE reels ADD COLUMN IF NOT EXISTS comment_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS ix_reels_created_id ON reels (created_at DESC, id DESC);