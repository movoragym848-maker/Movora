import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { routes } from "./routes/index.js";
import { cleanupExpiredOTPs } from "./services/otpService.js";
import { query } from "./db/pool.js";

async function ensureGymStaffTable() {
  await query(`
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
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_gym_staff_owner_created
    ON gym_staff(gym_owner_id, created_at DESC)
  `);
}

const app = express();
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://www.youtube.com", "https://www.youtube-nocookie.com"],
      frameSrc: ["'self'", "https://www.youtube.com", "https://www.youtube-nocookie.com", "https://www.youtube.com"],
      connectSrc: ["'self'", "https://www.youtube.com", "https://www.youtube-nocookie.com"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      mediaSrc: ["'self'", "https://www.youtube.com", "https://www.youtube-nocookie.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      fontSrc: ["'self'", "data:"],
    },
  },
}));
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json({ limit: "1mb" }));

app.use("/api", routes);

app.use((err, _req, res, _next) => {
  console.error(err);
  if (err.name === "ZodError") return res.status(400).json({ message: "Invalid request", issues: err.issues });
  res.status(500).json({ message: "Internal server error" });
});

app.listen(env.port, async () => {
  console.log(`Movora API running on http://localhost:${env.port}`);

  try {
    await ensureGymStaffTable();
    console.log("Gym staff table ready");
  } catch (err) {
    console.error("Failed to prepare gym staff table:", err);
  }
  
  // Clean up expired OTPs on startup
  cleanupExpiredOTPs().catch(err => console.error("Failed to cleanup OTPs:", err));
  
  // Schedule periodic cleanup every hour
  setInterval(() => {
    cleanupExpiredOTPs().catch(err => console.error("Failed to cleanup OTPs:", err));
  }, 60 * 60 * 1000); // Run every hour
});
