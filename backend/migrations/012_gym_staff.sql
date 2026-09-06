CREATE TABLE IF NOT EXISTS gym_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_owner_id uuid NOT NULL REFERENCES gym_owners(id) ON DELETE CASCADE,
  name text NOT NULL,
  email citext NOT NULL,
  phone text NOT NULL,
  role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gym_owner_id, email),
  UNIQUE (gym_owner_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_gym_staff_owner_created
  ON gym_staff(gym_owner_id, created_at DESC);