ALTER TABLE social_reels
  ADD COLUMN IF NOT EXISTS seed_like_count integer NOT NULL DEFAULT 0 CHECK (seed_like_count >= 0);

ALTER TABLE social_reels
  ADD COLUMN IF NOT EXISTS seed_comment_count integer NOT NULL DEFAULT 0 CHECK (seed_comment_count >= 0);

DO $migration$
BEGIN
  IF to_regclass('public.reels') IS NOT NULL THEN
    ALTER TABLE public.reels RENAME TO legacy_reels;
  END IF;
END;
$migration$;

CREATE VIEW reels AS
SELECT r.id,
  COALESCE(r.video_hls_url, r.video_url) AS video_url,
  r.thumbnail_url,
  r.caption,
  p.display_name AS creator_name,
  r.seed_like_count + (SELECT count(*)::integer FROM social_reel_likes l WHERE l.reel_id = r.id) AS like_count,
  r.seed_comment_count + (SELECT count(*)::integer FROM social_reel_comments c WHERE c.reel_id = r.id) AS comment_count,
  r.created_at
FROM social_reels r
JOIN social_profiles p ON p.user_id = r.creator_id
WHERE r.privacy = 'public' AND r.status = 'ready'
  AND (r.video_hls_url IS NOT NULL OR r.video_url IS NOT NULL);