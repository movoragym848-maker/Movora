CREATE TABLE IF NOT EXISTS social_typing_status (
  conversation_id uuid NOT NULL REFERENCES social_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);