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

async function ensureSocialTables() {
  await query(`CREATE TABLE IF NOT EXISTS social_profiles (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    username citext UNIQUE NOT NULL CHECK (username::text ~ '^[a-z0-9._]{3,30}$'),
    display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 60),
    bio text NOT NULL DEFAULT '' CHECK (char_length(bio) <= 160),
    avatar_url text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS social_follows (
    follower_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (follower_id, following_id), CHECK (follower_id <> following_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS social_reels (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    video_url text NOT NULL, thumbnail_url text, caption text NOT NULL DEFAULT '' CHECK (char_length(caption) <= 220), created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS social_conversations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), participant_a uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    participant_b uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (participant_a, participant_b), CHECK (participant_a < participant_b)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS social_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid NOT NULL REFERENCES social_conversations(id) ON DELETE CASCADE,
    sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
    created_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz
  )`);
  await query("CREATE INDEX IF NOT EXISTS idx_social_reels_created ON social_reels(created_at DESC, id DESC)");
  await query(`CREATE TABLE IF NOT EXISTS social_friend_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at timestamptz NOT NULL DEFAULT now(),
    responded_at timestamptz,
    UNIQUE (requester_id, recipient_id),
    CHECK (requester_id <> recipient_id)
  )`);
  await query("CREATE INDEX IF NOT EXISTS idx_social_messages_conversation ON social_messages(conversation_id, created_at DESC)");
  await query("CREATE INDEX IF NOT EXISTS idx_social_friend_requests_recipient ON social_friend_requests(recipient_id, status, created_at DESC)");
  await query("CREATE INDEX IF NOT EXISTS idx_social_friend_requests_requester ON social_friend_requests(requester_id, status, created_at DESC)");
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
    await ensureSocialTables();
    console.log("Social tables ready");
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
