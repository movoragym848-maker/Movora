ALTER TABLE registered_gyms
  ADD COLUMN IF NOT EXISTS gym_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS latitude numeric(9,6),
  ADD COLUMN IF NOT EXISTS longitude numeric(9,6),
  ADD COLUMN IF NOT EXISTS geofence_radius_meters integer NOT NULL DEFAULT 50;

UPDATE registered_gyms
SET gym_id = id
WHERE gym_id IS NULL OR gym_id <> id;

ALTER TABLE registered_gyms
  ADD CONSTRAINT registered_gyms_gym_id_unique UNIQUE (gym_id),
  ADD CONSTRAINT registered_gyms_coordinates_check CHECK (
    latitude IS NULL OR latitude BETWEEN -90 AND 90
  ),
  ADD CONSTRAINT registered_gyms_longitude_check CHECK (
    longitude IS NULL OR longitude BETWEEN -180 AND 180
  ),
  ADD CONSTRAINT registered_gyms_geofence_radius_check CHECK (geofence_radius_meters > 0);

CREATE TABLE IF NOT EXISTS attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gym_id uuid NOT NULL REFERENCES registered_gyms(gym_id) ON DELETE CASCADE,
  timestamp timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'valid')),
  user_latitude numeric(9,6) NOT NULL CHECK (user_latitude BETWEEN -90 AND 90),
  user_longitude numeric(9,6) NOT NULL CHECK (user_longitude BETWEEN -180 AND 180)
);

CREATE INDEX IF NOT EXISTS idx_attendance_user_timestamp ON attendance(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_gym_timestamp ON attendance(gym_id, timestamp DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_one_checkin_per_day
  ON attendance(user_id, gym_id, ((timestamp AT TIME ZONE 'UTC')::date));
