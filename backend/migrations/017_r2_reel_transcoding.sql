ALTER TABLE social_reels ADD COLUMN IF NOT EXISTS raw_object_key text;
ALTER TABLE social_reels ADD COLUMN IF NOT EXISTS video_hls_url text;
ALTER TABLE social_reels ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ready';
ALTER TABLE social_reels ADD COLUMN IF NOT EXISTS processing_error text;

CREATE INDEX IF NOT EXISTS idx_social_reels_status_created
  ON social_reels(status, created_at DESC);