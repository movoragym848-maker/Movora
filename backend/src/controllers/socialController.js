import { z } from "zod";
import { query } from "../db/pool.js";

const profileSchema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._]{3,30}$/, "Username must be 3-30 characters using lowercase letters, numbers, dots, or underscores."),
  displayName: z.string().trim().min(2).max(60),
  bio: z.string().max(160).optional().default(""),
  avatarUrl: z.string().url().max(2000).nullable().optional(),
});
const messageSchema = z.object({ body: z.string().trim().min(1).max(2000) });
const reelSchema = z.object({ videoUrl: z.string().url().max(2000), thumbnailUrl: z.string().url().max(2000).nullable().optional(), caption: z.string().max(220).optional().default("") });

function authUser(req) { return req.user?.role === "gym_owner" ? null : req.user?.sub; }

export async function getSocialProfile(req, res, next) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message: "Social features are available for member accounts." });
    const { rows } = await query(`
      SELECT p.user_id, p.username, p.display_name, p.bio, p.avatar_url, p.created_at,
        (SELECT count(*)::int FROM social_follows WHERE following_id = p.user_id) AS followers,
        (SELECT count(*)::int FROM social_follows WHERE follower_id = p.user_id) AS following
      FROM social_profiles p WHERE p.user_id = $1`, [userId]);
    res.json(rows[0] || null);
  } catch (err) { next(err); }
}

export async function saveSocialProfile(req, res, next) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message: "Social features are available for member accounts." });
    const input = profileSchema.parse(req.body);
    const { rows } = await query(`
      INSERT INTO social_profiles (user_id, username, display_name, bio, avatar_url)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id) DO UPDATE SET username = EXCLUDED.username, display_name = EXCLUDED.display_name,
        bio = EXCLUDED.bio, avatar_url = EXCLUDED.avatar_url, updated_at = now()
      RETURNING user_id, username, display_name, bio, avatar_url, created_at`,
      [userId, input.username, input.displayName, input.bio, input.avatarUrl || null]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ message: "That username is already taken." });
    if (err instanceof z.ZodError) return res.status(400).json({ message: err.issues[0]?.message || "Invalid social profile." });
    next(err);
  }
}

export async function searchSocialProfiles(req, res, next) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message: "Social features are available for member accounts." });
    const q = String(req.query.q || "").trim().toLowerCase();
    if (q.length < 2) return res.json([]);
    const { rows } = await query(`
      SELECT p.user_id, p.username, p.display_name, p.bio, p.avatar_url,
        EXISTS (SELECT 1 FROM social_follows f WHERE f.follower_id = $1 AND f.following_id = p.user_id) AS following
      FROM social_profiles p
      WHERE p.user_id <> $1 AND (p.username::text ILIKE $2 OR p.display_name ILIKE $2)
      ORDER BY p.username LIMIT 20`, [userId, `%${q}%`]);
    res.json(rows);
  } catch (err) { next(err); }
}

export async function toggleFollow(req, res, next) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message: "Social features are available for member accounts." });
    const targetId = req.params.userId;
    if (targetId === userId) return res.status(400).json({ message: "You cannot follow yourself." });
    const existing = await query("SELECT 1 FROM social_follows WHERE follower_id = $1 AND following_id = $2", [userId, targetId]);
    if (existing.rowCount) {
      await query("DELETE FROM social_follows WHERE follower_id = $1 AND following_id = $2", [userId, targetId]);
      return res.json({ following: false });
    }
    await query("INSERT INTO social_follows (follower_id, following_id) VALUES ($1, $2)", [userId, targetId]);
    res.json({ following: true });
  } catch (err) { next(err); }
}

export async function listReels(req, res, next) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message: "Social features are available for member accounts." });
    const limit = Math.min(Math.max(Number(req.query.limit) || 8, 1), 20);
    const cursor = req.query.cursor ? new Date(req.query.cursor) : null;
    const params = cursor && !Number.isNaN(cursor.getTime()) ? [cursor.toISOString(), limit] : [limit];
    const where = params.length === 2 ? "WHERE r.created_at < $1" : "";
    const limitParam = params.length === 2 ? "$2" : "$1";
    const { rows } = await query(`
      SELECT r.id, r.video_url, r.thumbnail_url, r.caption, r.created_at,
        p.user_id, p.username, p.display_name, p.avatar_url
      FROM social_reels r JOIN social_profiles p ON p.user_id = r.creator_id
      ${where} ORDER BY r.created_at DESC, r.id DESC LIMIT ${limitParam}`, params);
    res.json({ items: rows, nextCursor: rows.length === limit ? rows[rows.length - 1].created_at : null });
  } catch (err) { next(err); }
}

export async function createReel(req, res, next) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message: "Social features are available for member accounts." });
    const profile = await query("SELECT 1 FROM social_profiles WHERE user_id = $1", [userId]);
    if (!profile.rowCount) return res.status(403).json({ message: "Create your social account first." });
    const input = reelSchema.parse(req.body);
    const { rows } = await query(`INSERT INTO social_reels (creator_id, video_url, thumbnail_url, caption) VALUES ($1, $2, $3, $4) RETURNING *`, [userId, input.videoUrl, input.thumbnailUrl || null, input.caption]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ message: err.issues[0]?.message || "Invalid reel." });
    next(err);
  }
}

async function getConversation(userId, otherId) {
  const [a, b] = [userId, otherId].sort();
  const { rows } = await query(`INSERT INTO social_conversations (participant_a, participant_b) VALUES ($1, $2) ON CONFLICT (participant_a, participant_b) DO UPDATE SET participant_a = EXCLUDED.participant_a RETURNING id`, [a, b]);
  return rows[0].id;
}

export async function listConversations(req, res, next) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message: "Social features are available for member accounts." });
    const { rows } = await query(`
      SELECT c.id, p.user_id, p.username, p.display_name, p.avatar_url,
        m.body AS last_message, m.created_at AS last_message_at
      FROM social_conversations c
      JOIN social_profiles p ON p.user_id = CASE WHEN c.participant_a = $1 THEN c.participant_b ELSE c.participant_a END
      LEFT JOIN LATERAL (SELECT body, created_at FROM social_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) m ON true
      WHERE c.participant_a = $1 OR c.participant_b = $1 ORDER BY m.created_at DESC NULLS LAST`, [userId]);
    res.json(rows);
  } catch (err) { next(err); }
}

export async function listMessages(req, res, next) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message: "Social features are available for member accounts." });
    const conversation = await query("SELECT id FROM social_conversations WHERE id = $1 AND (participant_a = $2 OR participant_b = $2)", [req.params.conversationId, userId]);
    if (!conversation.rowCount) return res.status(404).json({ message: "Conversation not found." });
    const { rows } = await query("SELECT id, sender_id, body, created_at, read_at FROM social_messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT 100", [req.params.conversationId]);
    res.json(rows);
  } catch (err) { next(err); }
}

export async function sendMessage(req, res, next) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message: "Social features are available for member accounts." });
    const input = messageSchema.parse(req.body);
    const conversationId = await getConversation(userId, req.params.userId);
    const { rows } = await query("INSERT INTO social_messages (conversation_id, sender_id, body) VALUES ($1, $2, $3) RETURNING id, sender_id, body, created_at, read_at", [conversationId, userId, input.body]);
    res.status(201).json({ conversationId, message: rows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ message: "Message must contain 1-2000 characters." });
    next(err);
  }
}
