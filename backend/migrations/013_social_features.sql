CREATE TABLE IF NOT EXISTS social_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  username citext UNIQUE NOT NULL CHECK (username::text ~ '^[a-z0-9._]{3,30}$'),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 60),
  bio text NOT NULL DEFAULT '' CHECK (char_length(bio) <= 160),
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS social_follows (
  follower_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);

CREATE TABLE IF NOT EXISTS social_reels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_url text NOT NULL,
  thumbnail_url text,
  caption text NOT NULL DEFAULT '' CHECK (char_length(caption) <= 220),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS social_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_a uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  participant_b uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (participant_a, participant_b),
  CHECK (participant_a < participant_b)
);

CREATE TABLE IF NOT EXISTS social_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES social_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_social_profiles_username ON social_profiles(username);
CREATE INDEX IF NOT EXISTS idx_social_follows_following ON social_follows(following_id);
CREATE INDEX IF NOT EXISTS idx_social_reels_created ON social_reels(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_social_messages_conversation ON social_messages(conversation_id, created_at DESC);
