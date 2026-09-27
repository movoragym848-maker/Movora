-- Add 'approved' to allowed gym_owners.status values
-- Drops existing constraint and recreates it including 'approved'

ALTER TABLE gym_owners DROP CONSTRAINT IF EXISTS gym_owners_status_check;

ALTER TABLE gym_owners
  ADD CONSTRAINT gym_owners_status_check CHECK (status IN ('pending', 'approved', 'active', 'paused', 'disabled'));

-- Ensure default remains 'pending'
ALTER TABLE gym_owners
  ALTER COLUMN status SET DEFAULT 'pending';
