CREATE TABLE IF NOT EXISTS social_friend_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE (requester_id, recipient_id),
  CHECK (requester_id <> recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_social_friend_requests_recipient
  ON social_friend_requests(recipient_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_friend_requests_requester
  ON social_friend_requests(requester_id, status, created_at DESC);
