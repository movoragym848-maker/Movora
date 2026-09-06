import { z } from "zod";
import { query } from "../db/pool.js";

const checkInSchema = z.object({
  gym_id: z.string().uuid(),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});

function haversineDistanceMeters(latitudeA, longitudeA, latitudeB, longitudeB) {
  const earthRadiusMeters = 6371000;
  const toRadians = degrees => degrees * Math.PI / 180;
  const latitudeDelta = toRadians(latitudeB - latitudeA);
  const longitudeDelta = toRadians(longitudeB - longitudeA);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(latitudeA)) * Math.cos(toRadians(latitudeB))
    * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function checkIn(req, res, next) {
  try {
    const input = checkInSchema.parse(req.body);
    const userId = req.user?.sub;

    if (!userId) return res.status(401).json({ message: "Invalid authenticated user" });

    const { rows: gymRows } = await query(
      `SELECT gym_id, gym_owner_id, name, latitude, longitude, geofence_radius_meters
       FROM registered_gyms
       WHERE gym_id = $1`,
      [input.gym_id]
    );
    if (gymRows.length === 0) return res.status(404).json({ message: "Gym not found" });

    const gym = gymRows[0];
    if (gym.latitude === null || gym.longitude === null) {
      return res.status(400).json({ message: "This gym has not configured its location yet" });
    }

    const { rows: staffRows } = await query(
      `SELECT s.id
       FROM gym_staff s
       JOIN users u ON u.id = $1
        AND (LOWER(s.email::text) = LOWER(u.email) OR s.phone = u.phone)
       WHERE s.gym_owner_id = $2
       LIMIT 1`,
      [userId, gym.gym_owner_id]
    );
    const isStaff = staffRows.length > 0;

    const { rows: memberships } = await query(
      `SELECT 1
       FROM memberships
       WHERE user_id = $1
         AND gym_name = $2
         AND status = 'active'
         AND start_date <= CURRENT_DATE
         AND expiry_date >= CURRENT_DATE
       LIMIT 1`,
      [userId, gym.name]
    );
    if (!isStaff && memberships.length === 0) {
      return res.status(403).json({ message: "An active membership is required to check in" });
    }

    const distanceMeters = haversineDistanceMeters(
      input.latitude,
      input.longitude,
      Number(gym.latitude),
      Number(gym.longitude)
    );
    if (distanceMeters > gym.geofence_radius_meters) {
      return res.status(400).json({ message: "You must be physically present at the gym to check in" });
    }

    const { rows: attendanceRows } = await query(
      `INSERT INTO attendance (user_id, gym_id, status, user_latitude, user_longitude)
       VALUES ($1, $2, 'present', $3, $4)
       ON CONFLICT (user_id, gym_id, ((timestamp AT TIME ZONE 'UTC')::date))
       DO UPDATE SET user_latitude = EXCLUDED.user_latitude,
                     user_longitude = EXCLUDED.user_longitude
       RETURNING timestamp`,
      [userId, gym.gym_id, input.latitude, input.longitude]
    );

    res.json({ status: "success", timestamp: attendanceRows[0].timestamp.toISOString() });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ message: "gym_id, latitude, and longitude are required" });
    next(err);
  }
}
