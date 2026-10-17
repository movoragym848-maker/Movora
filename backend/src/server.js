import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { routes } from "./routes/index.js";
import { cleanupExpiredOTPs } from "./services/otpService.js";
import { query } from "./db/pool.js";
import { resumePendingReelTranscodes } from "./services/reelTranscoder.js";

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
  await query(`CREATE TABLE IF NOT EXISTS social_accounts (
    id uuid PRIMARY KEY,
    account_type text NOT NULL CHECK (account_type IN ('member', 'gym_owner')),
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await query(`INSERT INTO social_accounts (id, account_type)
    SELECT id, 'member' FROM users
    ON CONFLICT (id) DO UPDATE SET account_type = EXCLUDED.account_type`);
  await query(`INSERT INTO social_accounts (id, account_type)
    SELECT id, 'gym_owner' FROM gym_owners
    ON CONFLICT (id) DO UPDATE SET account_type = EXCLUDED.account_type`);
  await query(`CREATE TABLE IF NOT EXISTS social_profiles (
    user_id uuid PRIMARY KEY REFERENCES social_accounts(id) ON DELETE CASCADE,
    username citext UNIQUE NOT NULL CHECK (username::text ~ '^[a-z0-9._]{3,30}$'),
    display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 60),
    bio text NOT NULL DEFAULT '' CHECK (char_length(bio) <= 160),
    avatar_url text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS social_follows (
    follower_id uuid NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
    following_id uuid NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (follower_id, following_id), CHECK (follower_id <> following_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS social_reels (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator_id uuid NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
    video_url text NOT NULL, thumbnail_url text, caption text NOT NULL DEFAULT '' CHECK (char_length(caption) <= 220), created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS social_conversations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), participant_a uuid NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
    participant_b uuid NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (participant_a, participant_b), CHECK (participant_a < participant_b)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS social_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid NOT NULL REFERENCES social_conversations(id) ON DELETE CASCADE,
    sender_id uuid NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE, body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
    created_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz
  )`);
  await query(`ALTER TABLE social_messages
    ADD COLUMN IF NOT EXISTS media_data bytea,
    ADD COLUMN IF NOT EXISTS media_type text,
    ADD COLUMN IF NOT EXISTS media_name text`);
  await query("ALTER TABLE social_messages ALTER COLUMN body SET DEFAULT ''");
  await query("ALTER TABLE social_messages DROP CONSTRAINT IF EXISTS social_messages_body_check");
  await query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
      WHERE conname = 'social_messages_content_check' AND conrelid = 'social_messages'::regclass) THEN
      ALTER TABLE social_messages ADD CONSTRAINT social_messages_content_check
        CHECK (char_length(body) <= 2000 AND (char_length(body) > 0 OR media_data IS NOT NULL));
    END IF;
  END $$`);
  await query(`CREATE TABLE IF NOT EXISTS social_call_signals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id uuid NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
    recipient_id uuid NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
    signal_type text NOT NULL CHECK (signal_type IN ('offer', 'answer', 'candidate', 'hangup')),
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await query("CREATE INDEX IF NOT EXISTS idx_social_reels_created ON social_reels(created_at DESC, id DESC)");
  await query(`CREATE TABLE IF NOT EXISTS social_friend_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id uuid NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
    recipient_id uuid NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at timestamptz NOT NULL DEFAULT now(),
    responded_at timestamptz,
    UNIQUE (requester_id, recipient_id),
    CHECK (requester_id <> recipient_id)
  )`);
  await query("CREATE INDEX IF NOT EXISTS idx_social_messages_conversation ON social_messages(conversation_id, created_at DESC)");
  await query("CREATE INDEX IF NOT EXISTS idx_social_call_signals_recipient ON social_call_signals(recipient_id, created_at ASC)");
  await query("CREATE INDEX IF NOT EXISTS idx_social_friend_requests_recipient ON social_friend_requests(recipient_id, status, created_at DESC)");
  await query("CREATE INDEX IF NOT EXISTS idx_social_friend_requests_requester ON social_friend_requests(requester_id, status, created_at DESC)");
  await query(`CREATE TABLE IF NOT EXISTS social_notes (
    user_id uuid PRIMARY KEY REFERENCES social_accounts(id) ON DELETE CASCADE,
    text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 80),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await query("ALTER TABLE social_reels ALTER COLUMN video_url DROP NOT NULL");
  await query("ALTER TABLE social_reels ADD COLUMN IF NOT EXISTS media_data bytea");
  await query("ALTER TABLE social_reels ADD COLUMN IF NOT EXISTS media_type text");
  await query("ALTER TABLE social_reels ADD COLUMN IF NOT EXISTS workout_tag text NOT NULL DEFAULT ''");
  await query("ALTER TABLE social_reels ADD COLUMN IF NOT EXISTS location text NOT NULL DEFAULT ''");
  await query("ALTER TABLE social_reels ADD COLUMN IF NOT EXISTS privacy text NOT NULL DEFAULT 'public'");
  await query("ALTER TABLE social_reels ADD COLUMN IF NOT EXISTS raw_object_key text");
  await query("ALTER TABLE social_reels ADD COLUMN IF NOT EXISTS video_hls_url text");
  await query("ALTER TABLE social_reels ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ready'");
  await query("ALTER TABLE social_reels ADD COLUMN IF NOT EXISTS processing_error text");
  await query("ALTER TABLE social_reels ADD COLUMN IF NOT EXISTS seed_like_count integer NOT NULL DEFAULT 0");
  await query("ALTER TABLE social_reels ADD COLUMN IF NOT EXISTS seed_comment_count integer NOT NULL DEFAULT 0");
  await query("CREATE INDEX IF NOT EXISTS idx_social_reels_status_created ON social_reels(status, created_at DESC)");
  await query(`CREATE TABLE IF NOT EXISTS social_reel_likes (
    reel_id uuid NOT NULL REFERENCES social_reels(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (reel_id, user_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS social_reel_comments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reel_id uuid NOT NULL REFERENCES social_reels(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
    body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
    parent_comment_id uuid REFERENCES social_reel_comments(id) ON DELETE CASCADE,
    is_pinned boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await query("ALTER TABLE social_reel_comments ADD COLUMN IF NOT EXISTS parent_comment_id uuid REFERENCES social_reel_comments(id) ON DELETE CASCADE");
  await query("ALTER TABLE social_reel_comments ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false");
  await query("CREATE INDEX IF NOT EXISTS idx_social_reel_comments_created ON social_reel_comments(reel_id, created_at ASC)");
  await query(`CREATE TABLE IF NOT EXISTS social_reel_saves (
    reel_id uuid NOT NULL REFERENCES social_reels(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (reel_id, user_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS social_reel_analytics_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reel_id uuid NOT NULL REFERENCES social_reels(id) ON DELETE CASCADE,
    actor_id uuid NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
    event_type text NOT NULL CHECK (event_type IN ('impression', 'watch', 'share')),
    watch_ms integer NOT NULL DEFAULT 0 CHECK (watch_ms BETWEEN 0 AND 30000),
    progress_pct smallint NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await query("CREATE INDEX IF NOT EXISTS idx_social_reel_analytics_reel_created ON social_reel_analytics_events(reel_id, created_at DESC)");
  await query("CREATE INDEX IF NOT EXISTS idx_social_reel_analytics_actor ON social_reel_analytics_events(reel_id, actor_id, event_type)");
  await query(`CREATE TABLE IF NOT EXISTS social_typing_status (
    conversation_id uuid NOT NULL REFERENCES social_conversations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (conversation_id, user_id)
  )`);
  await query(`DO $$
    DECLARE
      existing_fk record;
      identity_column record;
      constraint_name text;
    BEGIN
      FOR existing_fk IN
        SELECT c.conrelid::regclass AS table_name, c.conname
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        WHERE c.contype = 'f'
          AND c.confrelid = 'users'::regclass
          AND t.relname LIKE 'social\\_%' ESCAPE '\\'
      LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', existing_fk.table_name, existing_fk.conname);
      END LOOP;

      FOR identity_column IN
        SELECT * FROM (VALUES
          ('social_profiles', 'user_id'),
          ('social_follows', 'follower_id'),
          ('social_follows', 'following_id'),
          ('social_reels', 'creator_id'),
          ('social_conversations', 'participant_a'),
          ('social_conversations', 'participant_b'),
          ('social_messages', 'sender_id'),
          ('social_call_signals', 'sender_id'),
          ('social_call_signals', 'recipient_id'),
          ('social_friend_requests', 'requester_id'),
          ('social_friend_requests', 'recipient_id'),
          ('social_notes', 'user_id'),
          ('social_reel_likes', 'user_id'),
          ('social_reel_comments', 'user_id'),
          ('social_reel_saves', 'user_id'),
          ('social_reel_analytics_events', 'actor_id'),
          ('social_typing_status', 'user_id')
        ) AS identity_columns(table_name, column_name)
      LOOP
        constraint_name := format('social_%s_%s_account_fkey', identity_column.table_name, identity_column.column_name);
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = constraint_name
            AND conrelid = to_regclass(identity_column.table_name)
        ) THEN
          EXECUTE format(
            'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES social_accounts(id) ON DELETE CASCADE',
            identity_column.table_name,
            constraint_name,
            identity_column.column_name
          );
        END IF;
      END LOOP;
    END $$`);
  await query(`CREATE OR REPLACE FUNCTION remove_social_account() RETURNS trigger AS $$
    BEGIN
      DELETE FROM social_accounts WHERE id = OLD.id;
      RETURN OLD;
    END;
    $$ LANGUAGE plpgsql`);
  await query(`DROP TRIGGER IF EXISTS users_remove_social_account ON users;
    CREATE TRIGGER users_remove_social_account AFTER DELETE ON users
    FOR EACH ROW EXECUTE FUNCTION remove_social_account();
    DROP TRIGGER IF EXISTS gym_owners_remove_social_account ON gym_owners;
    CREATE TRIGGER gym_owners_remove_social_account AFTER DELETE ON gym_owners
    FOR EACH ROW EXECUTE FUNCTION remove_social_account()`);
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

app.use((err, req, res, _next) => {
  console.error(err);
  if (err.type === "entity.too.large") {
    const isMessageImage = req.path.endsWith("/messages/image");
    const isMessageAudio = req.path.endsWith("/messages/audio");
    const message = isMessageImage
      ? "Message images are limited to 50 MB."
      : isMessageAudio
        ? "Voice notes are limited to 5 MB."
      : "Media upload exceeds the server's configured size limit.";
    return res.status(413).json({ message });
  }
  if (err.name === "ZodError") return res.status(400).json({ message: "Invalid request", issues: err.issues });
  res.status(500).json({ message: "Internal server error" });
});

try {
  await ensureGymStaffTable();
  console.log("Gym staff table ready");
  await ensureSocialTables();
  console.log("Social tables ready");
} catch (err) {
  console.error("Failed to prepare database tables:", err);
  process.exit(1);
}

app.listen(env.port, "0.0.0.0", () => {
  console.log(`Movora API running on http://localhost:${env.port}`);

  resumePendingReelTranscodes()
    .then(resumedReels => {
      if (resumedReels) console.log(`Resuming ${resumedReels} reel transcode job(s)`);
    })
    .catch(err => console.error("Failed to resume reel transcodes:", err));

  // Clean up expired OTPs on startup
  cleanupExpiredOTPs().catch(err => console.error("Failed to cleanup OTPs:", err));
  
  // Schedule periodic cleanup every hour
  setInterval(() => {
    cleanupExpiredOTPs().catch(err => console.error("Failed to cleanup OTPs:", err));
  }, 60 * 60 * 1000); // Run every hour
});
