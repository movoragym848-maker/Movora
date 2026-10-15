ALTER TABLE social_messages
  ADD COLUMN IF NOT EXISTS media_data bytea,
  ADD COLUMN IF NOT EXISTS media_type text,
  ADD COLUMN IF NOT EXISTS media_name text;

ALTER TABLE social_messages ALTER COLUMN body SET DEFAULT '';
ALTER TABLE social_messages DROP CONSTRAINT IF EXISTS social_messages_body_check;
ALTER TABLE social_messages DROP CONSTRAINT IF EXISTS social_messages_content_check;
ALTER TABLE social_messages ADD CONSTRAINT social_messages_content_check
  CHECK (char_length(body) <= 2000 AND (char_length(body) > 0 OR media_data IS NOT NULL));
