-- Revert: remove 'approved' from allowed gym_owners.status values
-- Convert any existing 'approved' rows to 'active', then recreate constraint

-- Convert any 'approved' status rows to 'active' so the constraint can be reapplied
UPDATE gym_owners SET status = 'active' WHERE status = 'approved';

ALTER TABLE gym_owners DROP CONSTRAINT IF EXISTS gym_owners_status_check;

ALTER TABLE gym_owners
  ADD CONSTRAINT gym_owners_status_check CHECK (status IN ('pending', 'active', 'paused', 'disabled'));

ALTER TABLE gym_owners
  ALTER COLUMN status SET DEFAULT 'pending';
