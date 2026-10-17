import { z } from "zod";
import { query } from "../db/pool.js";

const profileSchema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._]{3,30}$/, "Username must be 3-30 characters using lowercase letters, numbers, dots, or underscores."),
  displayName: z.string().trim().min(2).max(60),
  bio: z.string().max(160).optional().default(""),
  avatarUrl: z.string().url().max(2000).nullable().optional(),
});
const messageSchema = z.object({ body: z.string().trim().min(1).max(2000) });
const optionalMessageSchema = z.object({ body: z.string().trim().max(2000).optional().default("") });
const reelSchema = z.object({ videoUrl: z.string().url().max(2000), thumbnailUrl: z.string().url().max(2000).nullable().optional(), caption: z.string().max(220).optional().default(""), workoutTag:z.string().max(40).optional().default(""), location:z.string().max(100).optional().default(""), privacy:z.enum(["public", "friends", "private"]).optional().default("public") });
const callSignalSchema = z.object({ type: z.enum(["offer", "answer", "candidate", "hangup"]), payload: z.record(z.any()).default({}) });
const noteSchema = z.object({ text: z.string().trim().min(1).max(80) });
const reelCommentSchema = z.object({
  body:z.string().trim().min(1).max(500),
  parentCommentId:z.string().uuid().optional(),
});
const reelMediaTypes = new Set(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm", "video/quicktime", "video/3gpp"]);
const configuredReelMediaBytes = Number(process.env.REEL_UPLOAD_MAX_BYTES);
export const maxReelMediaBytes = Number.isSafeInteger(configuredReelMediaBytes) && configuredReelMediaBytes > 0
  ? configuredReelMediaBytes
  : 150 * 1024 * 1024;

function authUser(req) { return req.user?.sub; }

export function getSocialReelUploadLimits(req, res) {
  if (!authUser(req)) return res.status(403).json({ message:"Social features are available for member accounts." });
  res.json({ maxVideoBytes:maxReelMediaBytes });
}

export async function getSocialNotes(req, res, next) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message: "Social features are available for member accounts." });
    const { rows } = await query(`
      SELECT n.user_id, n.text, n.created_at, p.username, p.display_name, p.avatar_url, a.account_type
      FROM social_notes n JOIN social_profiles p ON p.user_id = n.user_id
      JOIN social_accounts a ON a.id = p.user_id
      WHERE n.updated_at > now() - interval '25 hours'
        AND (n.user_id = $1 OR EXISTS (
          SELECT 1 FROM social_friend_requests r
          WHERE r.status = 'accepted' AND ((r.requester_id = $1 AND r.recipient_id = n.user_id)
            OR (r.requester_id = n.user_id AND r.recipient_id = $1))
        ))
      ORDER BY n.updated_at DESC`, [userId]);
    res.json(rows);
  } catch (err) { next(err); }
}

export async function saveSocialNote(req, res, next) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message: "Social features are available for member accounts." });
    const input = noteSchema.parse(req.body);
    const { rows } = await query(`
      INSERT INTO social_notes (user_id, text) VALUES ($1, $2)
      ON CONFLICT (user_id) DO UPDATE SET text = EXCLUDED.text, updated_at = now()
      RETURNING user_id, text, created_at, updated_at`, [userId, input.text]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ message: "Note must contain 1-80 characters." });
    next(err);
  }
}

export async function getSocialProfile(req, res, next) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message: "Social features are available for member accounts." });
    const { rows } = await query(`
      SELECT p.user_id, p.username, p.display_name, p.bio, p.avatar_url, p.created_at, a.account_type,
        (SELECT count(*)::int FROM social_follows WHERE following_id = p.user_id) AS followers,
        (SELECT count(*)::int FROM social_follows WHERE follower_id = p.user_id) AS following,
        (SELECT count(*)::int FROM social_reels WHERE creator_id = p.user_id) AS posts
      FROM social_profiles p JOIN social_accounts a ON a.id = p.user_id WHERE p.user_id = $1`, [userId]);
    res.json(rows[0] || null);
  } catch (err) { next(err); }
}

export async function saveSocialProfile(req, res, next) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message: "Social features are available for member accounts." });
    const input = profileSchema.parse(req.body);
    await query(`
      INSERT INTO social_profiles (user_id, username, display_name, bio, avatar_url)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id) DO UPDATE SET username = EXCLUDED.username, display_name = EXCLUDED.display_name,
        bio = EXCLUDED.bio, avatar_url = EXCLUDED.avatar_url, updated_at = now()
      RETURNING user_id`,
      [userId, input.username, input.displayName, input.bio, input.avatarUrl || null]);
    const { rows } = await query(`
      SELECT p.user_id, p.username, p.display_name, p.bio, p.avatar_url, p.created_at, a.account_type,
        (SELECT count(*)::int FROM social_follows WHERE following_id = p.user_id) AS followers,
        (SELECT count(*)::int FROM social_follows WHERE follower_id = p.user_id) AS following,
        (SELECT count(*)::int FROM social_reels WHERE creator_id = p.user_id) AS posts
      FROM social_profiles p JOIN social_accounts a ON a.id = p.user_id WHERE p.user_id = $1`, [userId]);
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
      SELECT p.user_id, p.username, p.display_name, p.bio, p.avatar_url, a.account_type,
        EXISTS (SELECT 1 FROM social_follows f WHERE f.follower_id = $1 AND f.following_id = p.user_id) AS following,
        CASE
          WHEN EXISTS (SELECT 1 FROM social_friend_requests r WHERE r.requester_id = $1 AND r.recipient_id = p.user_id AND r.status = 'accepted')
            OR EXISTS (SELECT 1 FROM social_friend_requests r WHERE r.requester_id = p.user_id AND r.recipient_id = $1 AND r.status = 'accepted') THEN 'accepted'
          WHEN EXISTS (SELECT 1 FROM social_friend_requests r WHERE r.requester_id = $1 AND r.recipient_id = p.user_id AND r.status = 'pending') THEN 'outgoing_pending'
          WHEN EXISTS (SELECT 1 FROM social_friend_requests r WHERE r.requester_id = p.user_id AND r.recipient_id = $1 AND r.status = 'pending') THEN 'incoming_pending'
          ELSE NULL
        END AS request_status,
        (SELECT count(*)::int FROM social_follows WHERE following_id = p.user_id) AS followers,
        (SELECT count(*)::int FROM social_follows WHERE follower_id = p.user_id) AS following_count
      FROM social_profiles p JOIN social_accounts a ON a.id = p.user_id
      WHERE p.user_id <> $1 AND (p.username::text ILIKE $2 OR p.display_name ILIKE $2)
      ORDER BY p.username LIMIT 20`, [userId, `%${q}%`]);
    res.json(rows);
  } catch (err) { next(err); }
}

export async function listFriendRequests(req, res, next) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message: "Social features are available for member accounts." });
    const [incoming, outgoing] = await Promise.all([
      query(`SELECT r.id, r.status, r.created_at, p.user_id, p.username, p.display_name, p.avatar_url, a.account_type,
        EXISTS (SELECT 1 FROM social_follows f WHERE f.follower_id = $1 AND f.following_id = p.user_id) AS following
        FROM social_friend_requests r JOIN social_profiles p ON p.user_id = r.requester_id
        JOIN social_accounts a ON a.id = p.user_id
        WHERE r.recipient_id = $1 AND r.status IN ('pending', 'accepted') ORDER BY r.created_at DESC`, [userId]),
      query(`SELECT r.id, r.status, r.created_at, p.user_id, p.username, p.display_name, p.avatar_url, a.account_type,
        EXISTS (SELECT 1 FROM social_follows f WHERE f.follower_id = $1 AND f.following_id = p.user_id) AS following
        FROM social_friend_requests r JOIN social_profiles p ON p.user_id = r.recipient_id
        JOIN social_accounts a ON a.id = p.user_id
        WHERE r.requester_id = $1 AND r.status IN ('pending', 'accepted') ORDER BY r.created_at DESC`, [userId]),
    ]);
    res.json({ incoming: incoming.rows, outgoing: outgoing.rows });
  } catch (err) { next(err); }
}

export async function sendFriendRequest(req, res, next) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message: "Social features are available for member accounts." });
    const targetId = req.params.userId;
    if (targetId === userId) return res.status(400).json({ message: "You cannot send a request to yourself." });
    const target = await query("SELECT 1 FROM social_profiles WHERE user_id = $1", [targetId]);
    if (!target.rowCount) return res.status(404).json({ message: "User not found." });
    const existing = await query("SELECT status FROM social_friend_requests WHERE requester_id = $1 AND recipient_id = $2", [userId, targetId]);
    if (existing.rows[0]?.status === "accepted") return res.json({ status: "accepted", following: true });
    await query("INSERT INTO social_follows (follower_id, following_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [userId, targetId]);
    await query(`INSERT INTO social_friend_requests (requester_id, recipient_id, status, responded_at)
      VALUES ($1, $2, 'pending', NULL)
      ON CONFLICT (requester_id, recipient_id) DO UPDATE SET status = 'pending', created_at = now(), responded_at = NULL`, [userId, targetId]);
    res.status(201).json({ status: "pending", following: true });
  } catch (err) { next(err); }
}

export async function respondToFriendRequest(req, res, next) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message: "Social features are available for member accounts." });
    const status = req.body?.status;
    if (status !== "accepted") return res.status(400).json({ message: "Friend requests can only be accepted." });
    const request = await query("SELECT requester_id FROM social_friend_requests WHERE id = $1 AND recipient_id = $2 AND status = 'pending'", [req.params.requestId, userId]);
    if (!request.rowCount) return res.status(404).json({ message: "Friend request not found." });
    await query("UPDATE social_friend_requests SET status = $1, responded_at = now() WHERE id = $2", [status, req.params.requestId]);
    await query("INSERT INTO social_follows (follower_id, following_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [userId, request.rows[0].requester_id]);
    res.json({ status, following: true });
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

function encodeReelCursor(reel) {
  return Buffer.from(JSON.stringify({ createdAt:reel.created_at, id:reel.id })).toString("base64url");
}

function decodeReelCursor(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), "base64url").toString("utf8"));
    if (parsed.id && parsed.createdAt && !Number.isNaN(new Date(parsed.createdAt).getTime())) return parsed;
  } catch {}
  const legacyDate = new Date(value);
  return Number.isNaN(legacyDate.getTime()) ? null : { createdAt:legacyDate.toISOString() };
}

export async function listReels(req, res, next) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message: "Social features are available for member accounts." });
    const limit = Math.min(Math.max(Number(req.query.limit) || 5, 1), 20);
    const cursor = decodeReelCursor(req.query.cursor);
    const params = [userId];
    let cursorFilter = "";
    if (cursor?.id) {
      params.push(cursor.createdAt, cursor.id);
      cursorFilter = `AND (r.created_at, r.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`;
    } else if (cursor?.createdAt) {
      cursorFilter = `AND r.created_at < $${params.push(cursor.createdAt)}::timestamptz`;
    }
    params.push(limit);
    const limitParam = `$${params.length}`;
    const visibilityFilter = `(r.privacy = 'public' OR r.creator_id = $1 OR (r.privacy = 'friends' AND EXISTS (
        SELECT 1 FROM social_friend_requests f WHERE f.status = 'accepted' AND
          ((f.requester_id = $1 AND f.recipient_id = r.creator_id) OR (f.requester_id = r.creator_id AND f.recipient_id = $1))
      )))`;
    const selectReels = `
      SELECT r.id, r.video_url, r.video_hls_url, r.status, r.thumbnail_url, r.caption, r.created_at,
        r.media_type, r.workout_tag, r.location, r.privacy,
        r.seed_like_count + (SELECT count(*)::int FROM social_reel_likes l WHERE l.reel_id = r.id) AS like_count,
        EXISTS (SELECT 1 FROM social_reel_likes l WHERE l.reel_id = r.id AND l.user_id = $1) AS liked,
        r.seed_comment_count + (SELECT count(*)::int FROM social_reel_comments c WHERE c.reel_id = r.id) AS comment_count,
        p.user_id, p.username, p.display_name, p.avatar_url, a.account_type
      FROM social_reels r JOIN social_profiles p ON p.user_id = r.creator_id
      JOIN social_accounts a ON a.id = p.user_id
      WHERE ${visibilityFilter}`;
    const { rows } = await query(`${selectReels} ${cursorFilter} ORDER BY r.created_at DESC, r.id DESC LIMIT ${limitParam}`, params);

    // On reaching the end, wrap to the newest visible items to keep the feed continuous.
    if (rows.length < limit) {
      const missing = limit - rows.length;
      const seenIds = rows.map(reel => reel.id);
      const { rows:wrappedRows } = await query(`${selectReels}
        AND NOT (r.id = ANY($2::uuid[]))
        ORDER BY r.created_at DESC, r.id DESC LIMIT $3`, [userId, seenIds, missing]);
      rows.push(...wrappedRows);
      if (rows.length < limit) {
        const { rows:availableRows } = await query(`${selectReels} ORDER BY r.created_at DESC, r.id DESC LIMIT $2`, [userId, limit]);
        for (let index = 0; rows.length < limit && availableRows.length; index += 1) {
          rows.push(availableRows[index % availableRows.length]);
        }
      }
    }

    const lastReel = rows[rows.length - 1];
    res.json({ items:rows, nextCursor:lastReel ? encodeReelCursor(lastReel) : null, has_more:Boolean(lastReel) });
  } catch (err) { next(err); }
}

export async function createReel(req, res, next) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message: "Social features are available for member accounts." });
    const profile = await query("SELECT 1 FROM social_profiles WHERE user_id = $1", [userId]);
    if (!profile.rowCount) return res.status(403).json({ message: "Create your social account first." });
    const input = reelSchema.parse(req.body);
    const { rows } = await query(`INSERT INTO social_reels (creator_id, video_url, thumbnail_url, caption, workout_tag, location, privacy) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`, [userId, input.videoUrl, input.thumbnailUrl || null, input.caption, input.workoutTag, input.location, input.privacy]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ message: err.issues[0]?.message || "Invalid reel." });
    next(err);
  }
}

export async function findVisibleReel(reelId, userId) {
  const { rows } = await query(`SELECT r.id, r.privacy, r.creator_id FROM social_reels r WHERE r.id = $1 AND
    (r.privacy = 'public' OR r.creator_id = $2 OR (r.privacy = 'friends' AND EXISTS (
      SELECT 1 FROM social_friend_requests f WHERE f.status = 'accepted' AND
        ((f.requester_id = $2 AND f.recipient_id = r.creator_id) OR (f.requester_id = r.creator_id AND f.recipient_id = $2))
    )))`, [reelId, userId]);
  return rows[0] || null;
}

export async function getSocialReel(req, res, next) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message: "Social features are available for member accounts." });
    const { rows:accessRows } = await query(`SELECT r.id,
        (r.privacy = 'public' OR r.creator_id = $2 OR (r.privacy = 'friends' AND EXISTS (
          SELECT 1 FROM social_friend_requests f WHERE f.status = 'accepted' AND
            ((f.requester_id = $2 AND f.recipient_id = r.creator_id) OR (f.requester_id = r.creator_id AND f.recipient_id = $2))
        ))) AS can_view
      FROM social_reels r WHERE r.id = $1`, [req.params.reelId, userId]);
    if (!accessRows.length) return res.status(404).json({ message:"Shared Reel was not found. Check that the link is correct." });
    if (!accessRows[0].can_view) return res.status(403).json({ message:"This Reel is limited by its privacy setting. Ask the creator to share it with your account." });
    const { rows } = await query(`SELECT r.id, r.video_url, r.video_hls_url, r.status, r.thumbnail_url, r.caption, r.created_at,
      r.media_type, r.workout_tag, r.location, r.privacy,
        r.seed_like_count + (SELECT count(*)::int FROM social_reel_likes l WHERE l.reel_id = r.id) AS like_count,
        EXISTS (SELECT 1 FROM social_reel_likes l WHERE l.reel_id = r.id AND l.user_id = $2) AS liked,
        r.seed_comment_count + (SELECT count(*)::int FROM social_reel_comments c WHERE c.reel_id = r.id) AS comment_count,
        p.user_id, p.username, p.display_name, p.avatar_url, a.account_type
      FROM social_reels r JOIN social_profiles p ON p.user_id = r.creator_id
      JOIN social_accounts a ON a.id = p.user_id WHERE r.id = $1`, [req.params.reelId, userId]);
    res.json(rows[0]);
  } catch (err) { next(err); }
}

export async function createUploadedReel(req, res, next) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message: "Social features are available for member accounts." });
    const profile = await query("SELECT 1 FROM social_profiles WHERE user_id = $1", [userId]);
    if (!profile.rowCount) return res.status(403).json({ message: "Create your social account first." });
    const mediaType = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    if (!reelMediaTypes.has(mediaType)) return res.status(415).json({ message: "Use a JPEG, PNG, WebP, MP4, WebM, MOV, or 3GP file." });
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ message: "Post media is required." });
    if (req.body.length > maxReelMediaBytes) return res.status(413).json({ message: `Media uploads are limited to ${Math.floor(maxReelMediaBytes / 1024 / 1024)} MB.` });
    const input = z.object({
      caption:z.string().max(220).optional().default(""),
      workoutTag:z.string().max(40).optional().default(""),
      location:z.string().max(100).optional().default(""),
      privacy:z.enum(["public", "friends", "private"]).optional().default("public"),
    }).parse({
      caption:decodeURIComponent(req.headers["x-reel-caption"] || ""),
      workoutTag:decodeURIComponent(req.headers["x-reel-workout-tag"] || ""),
      location:decodeURIComponent(req.headers["x-reel-location"] || ""),
      privacy:req.headers["x-reel-privacy"] || "public",
    });
    const { rows } = await query(`INSERT INTO social_reels
      (creator_id, video_url, caption, media_data, media_type, workout_tag, location, privacy)
      VALUES ($1, NULL, $2, $3, $4, $5, $6, $7) RETURNING id, created_at`,
    [userId, input.caption, req.body, mediaType, input.workoutTag, input.location, input.privacy]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError || err instanceof URIError) return res.status(400).json({ message: err.issues?.[0]?.message || "Invalid post details." });
    next(err);
  }
}

export async function getSocialReelMedia(req, res, next) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message: "Social features are available for member accounts." });
    if (!await findVisibleReel(req.params.reelId, userId)) return res.status(404).json({ message: "Post not found." });
    const { rows } = await query("SELECT media_data, media_type FROM social_reels WHERE id = $1", [req.params.reelId]);
    if (!rows[0]?.media_data) return res.status(404).json({ message: "Post media not found." });
    res.set("Content-Type", rows[0].media_type);
    res.set("Content-Length", String(rows[0].media_data.length));
    res.set("Cache-Control", "private, max-age=3600");
    res.send(rows[0].media_data);
  } catch (err) { next(err); }
}

export async function toggleReelLike(req, res, next) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message: "Social features are available for member accounts." });
    if (!await findVisibleReel(req.params.reelId, userId)) return res.status(404).json({ message: "Post not found." });
    const removed = await query("DELETE FROM social_reel_likes WHERE reel_id = $1 AND user_id = $2 RETURNING reel_id", [req.params.reelId, userId]);
    const liked = !removed.rowCount;
    if (liked) await query("INSERT INTO social_reel_likes (reel_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [req.params.reelId, userId]);
    const { rows } = await query(`SELECT r.seed_like_count +
      (SELECT count(*)::int FROM social_reel_likes WHERE reel_id = r.id) AS like_count
      FROM social_reels r WHERE r.id = $1`, [req.params.reelId]);
    res.json({ liked, like_count:rows[0].like_count });
  } catch (err) { next(err); }
}

export async function getSocialReelComments(req, res, next) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message: "Social features are available for member accounts." });
    if (!await findVisibleReel(req.params.reelId, userId)) return res.status(404).json({ message: "Post not found." });
    const { rows } = await query(`SELECT c.id, c.body, c.parent_comment_id, c.is_pinned, c.created_at,
        p.user_id, p.display_name, p.username, p.avatar_url, a.account_type, (r.creator_id = $2) AS can_manage
      FROM social_reel_comments c
      JOIN social_reels r ON r.id = c.reel_id
      LEFT JOIN social_profiles p ON p.user_id = c.user_id
      LEFT JOIN social_accounts a ON a.id = p.user_id
      WHERE c.reel_id = $1
      ORDER BY c.is_pinned DESC, c.created_at ASC
      LIMIT 500`, [req.params.reelId, userId]);
    res.json(rows);
  } catch (err) { next(err); }
}

export async function addSocialReelComment(req, res, next) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message: "Social features are available for member accounts." });
    if (!await findVisibleReel(req.params.reelId, userId)) return res.status(404).json({ message: "Post not found." });
    const input = reelCommentSchema.parse(req.body);
    if (input.parentCommentId) {
      const parent = await query("SELECT id FROM social_reel_comments WHERE id = $1 AND reel_id = $2", [input.parentCommentId, req.params.reelId]);
      if (!parent.rowCount) return res.status(404).json({ message:"Comment not found on this post." });
    }
    const { rows } = await query(`INSERT INTO social_reel_comments (reel_id, user_id, body, parent_comment_id)
      VALUES ($1, $2, $3, $4)
      RETURNING id, body, parent_comment_id, is_pinned, created_at`, [req.params.reelId, userId, input.body, input.parentCommentId || null]);
    const { rows:profileRows } = await query(`SELECT p.user_id, p.display_name, p.username, p.avatar_url, a.account_type,
        (r.creator_id = p.user_id) AS can_manage
      FROM social_profiles p JOIN social_accounts a ON a.id = p.user_id
      JOIN social_reels r ON r.id = $2
      WHERE p.user_id = $1`, [userId, req.params.reelId]);
    res.status(201).json({ ...rows[0], ...profileRows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ message: "Comments must contain 1-500 characters." });
    next(err);
  }
}

export async function pinSocialReelComment(req, res, next) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message:"Social features are available for member accounts." });
    const owner = await query("SELECT 1 FROM social_reels WHERE id = $1 AND creator_id = $2", [req.params.reelId, userId]);
    if (!owner.rowCount) return res.status(404).json({ message:"Post not found." });
    const comment = await query("SELECT 1 FROM social_reel_comments WHERE id = $1 AND reel_id = $2", [req.params.commentId, req.params.reelId]);
    if (!comment.rowCount) return res.status(404).json({ message:"Comment not found on this post." });
    const pinned = req.body?.pinned !== false;
    await query(`UPDATE social_reel_comments
      SET is_pinned = ($2 IS NOT NULL AND id = $2)
      WHERE reel_id = $1`, [req.params.reelId, pinned ? req.params.commentId : null]);
    res.json({ commentId:req.params.commentId, pinned });
  } catch (err) { next(err); }
}

async function getConversation(userId, otherId) {
  const friendship = await query(`SELECT 1 FROM social_friend_requests
    WHERE status = 'accepted' AND ((requester_id = $1 AND recipient_id = $2) OR (requester_id = $2 AND recipient_id = $1))`, [userId, otherId]);
  if (!friendship.rowCount) return null;
  const [a, b] = [userId, otherId].sort();
  const { rows } = await query(`INSERT INTO social_conversations (participant_a, participant_b) VALUES ($1, $2) ON CONFLICT (participant_a, participant_b) DO UPDATE SET participant_a = EXCLUDED.participant_a RETURNING id`, [a, b]);
  return rows[0].id;
}

export async function listConversations(req, res, next) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message: "Social features are available for member accounts." });
    await query(`
      INSERT INTO social_conversations (participant_a, participant_b)
      SELECT LEAST(r.requester_id, r.recipient_id), GREATEST(r.requester_id, r.recipient_id)
      FROM social_friend_requests r
      WHERE r.status = 'accepted' AND (r.requester_id = $1 OR r.recipient_id = $1)
      ON CONFLICT (participant_a, participant_b) DO NOTHING`, [userId]);
    const { rows } = await query(`
      SELECT c.id, p.user_id, p.username, p.display_name, p.avatar_url, a.account_type,
        m.body AS last_message, m.created_at AS last_message_at
      FROM social_conversations c
      JOIN social_profiles p ON p.user_id = CASE WHEN c.participant_a = $1 THEN c.participant_b ELSE c.participant_a END
      JOIN social_accounts a ON a.id = p.user_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(NULLIF(body, ''), CASE WHEN media_type LIKE 'audio/%' THEN 'Voice note' WHEN media_type LIKE 'image/%' THEN 'Photo' END) AS body, created_at
        FROM social_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1
      ) m ON true
      WHERE (c.participant_a = $1 OR c.participant_b = $1)
        AND EXISTS (SELECT 1 FROM social_friend_requests r WHERE r.status = 'accepted'
          AND ((r.requester_id = $1 AND r.recipient_id = CASE WHEN c.participant_a = $1 THEN c.participant_b ELSE c.participant_a END)
            OR (r.requester_id = CASE WHEN c.participant_a = $1 THEN c.participant_b ELSE c.participant_a END AND r.recipient_id = $1)))
      ORDER BY m.created_at DESC NULLS LAST`, [userId]);
    res.json(rows);
  } catch (err) { next(err); }
}

export async function listMessages(req, res, next) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message: "Social features are available for member accounts." });
    const conversation = await query(`SELECT c.id FROM social_conversations c
      WHERE c.id = $1 AND (c.participant_a = $2 OR c.participant_b = $2)
      AND EXISTS (SELECT 1 FROM social_friend_requests r WHERE r.status = 'accepted'
        AND ((r.requester_id = $2 AND r.recipient_id = CASE WHEN c.participant_a = $2 THEN c.participant_b ELSE c.participant_a END)
          OR (r.requester_id = CASE WHEN c.participant_a = $2 THEN c.participant_b ELSE c.participant_a END AND r.recipient_id = $2)))`, [req.params.conversationId, userId]);
    if (!conversation.rowCount) return res.status(404).json({ message: "Conversation not found." });
    const { rows } = await query("SELECT id, sender_id, body, media_type, media_name, created_at, read_at FROM social_messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT 100", [req.params.conversationId]);
    res.json(rows);
  } catch (err) { next(err); }
}

export const maxMessageImageBytes = 50 * 1024 * 1024;
const messageImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
export const maxMessageAudioBytes = 5 * 1024 * 1024;
const messageAudioTypes = new Set(["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg"]);

function hasValidImageSignature(buffer, contentType) {
  if (contentType === "image/jpeg") return buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  if (contentType === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (contentType === "image/webp") return buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
  if (contentType === "image/gif") return ["GIF87a", "GIF89a"].includes(buffer.toString("ascii", 0, 6));
  return false;
}

function decodeHeader(value) {
  try { return decodeURIComponent(value || ""); }
  catch { return ""; }
}

export async function sendImageMessage(req, res, next) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message:"Social features are available for member accounts." });
    const mediaType = String(req.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
    if (!messageImageTypes.has(mediaType)) return res.status(415).json({ message:"Choose a JPEG, PNG, WebP, or GIF image." });
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ message:"Choose an image to send." });
    if (req.body.length > maxMessageImageBytes) return res.status(413).json({ message:"Message images are limited to 50 MB." });
    if (!hasValidImageSignature(req.body, mediaType)) return res.status(415).json({ message:"The selected file is not a valid supported image." });

    const input = optionalMessageSchema.parse({ body:decodeHeader(req.get("X-Message-Body")) });
    const conversationId = await getConversation(userId, req.params.userId);
    if (!conversationId) return res.status(403).json({ message:"You can message this person after they accept your friend request." });
    const rawName = decodeHeader(req.get("X-File-Name")) || "photo";
    const mediaName = rawName.replace(/[\\/\\x00-\\x1f\\x7f]/g, "_").slice(-160) || "photo";
    const { rows } = await query(`INSERT INTO social_messages
      (conversation_id, sender_id, body, media_data, media_type, media_name)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, sender_id, body, media_type, media_name, created_at, read_at`,
    [conversationId, userId, input.body, req.body, mediaType, mediaName]);
    res.status(201).json({ conversationId, message:rows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ message:"Message text must be 2000 characters or fewer." });
    next(err);
  }
}

function hasValidAudioSignature(buffer, contentType) {
  if (contentType === "audio/webm") return buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (contentType === "audio/ogg") return buffer.toString("ascii", 0, 4) === "OggS";
  if (contentType === "audio/mp4") return buffer.toString("ascii", 4, 8) === "ftyp";
  if (contentType === "audio/mpeg") return buffer.subarray(0, 3).equals(Buffer.from("ID3"))
    || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
  return false;
}

export async function sendAudioMessage(req, res, next) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message:"Social features are available for member accounts." });
    const mediaType = String(req.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
    if (!messageAudioTypes.has(mediaType)) return res.status(415).json({ message:"Record a supported voice note in WebM, Ogg, MP4, or MPEG format." });
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ message:"Record a voice note before sending." });
    if (req.body.length > maxMessageAudioBytes) return res.status(413).json({ message:"Voice notes are limited to 5 MB." });
    if (!hasValidAudioSignature(req.body, mediaType)) return res.status(415).json({ message:"The recording is not a valid supported audio file." });

    const input = optionalMessageSchema.parse({ body:decodeHeader(req.get("X-Message-Body")) });
    const conversationId = await getConversation(userId, req.params.userId);
    if (!conversationId) return res.status(403).json({ message:"You can message this person after they accept your friend request." });
    const rawName = decodeHeader(req.get("X-File-Name")) || "voice-note";
    const mediaName = rawName.replace(/[\\/\\x00-\\x1f\\x7f]/g, "_").slice(-160) || "voice-note";
    const { rows } = await query(`INSERT INTO social_messages
      (conversation_id, sender_id, body, media_data, media_type, media_name)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, sender_id, body, media_type, media_name, created_at, read_at`,
    [conversationId, userId, input.body, req.body, mediaType, mediaName]);
    res.status(201).json({ conversationId, message:rows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ message:"Message text must be 2000 characters or fewer." });
    next(err);
  }
}

async function getMessageMedia(req, res, next, expectedType, mediaLabel) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message:"Social features are available for member accounts." });
    const { rows } = await query(`SELECT m.media_data, m.media_type
      FROM social_messages m
      JOIN social_conversations c ON c.id = m.conversation_id
      WHERE m.id = $1 AND c.id = $2 AND (c.participant_a = $3 OR c.participant_b = $3)
        AND EXISTS (SELECT 1 FROM social_friend_requests f WHERE f.status = 'accepted'
          AND ((f.requester_id = $3 AND f.recipient_id = CASE WHEN c.participant_a = $3 THEN c.participant_b ELSE c.participant_a END)
            OR (f.requester_id = CASE WHEN c.participant_a = $3 THEN c.participant_b ELSE c.participant_a END AND f.recipient_id = $3)))`,
    [req.params.messageId, req.params.conversationId, userId]);
    if (!rows[0]?.media_data || !rows[0].media_type?.startsWith(expectedType)) return res.status(404).json({ message:`Message ${mediaLabel} not found.` });
    res.set("Content-Type", rows[0].media_type);
    res.set("Content-Length", String(rows[0].media_data.length));
    res.set("Content-Disposition", "inline");
    res.set("Cache-Control", "private, no-store");
    res.set("X-Content-Type-Options", "nosniff");
    res.send(rows[0].media_data);
  } catch (err) { next(err); }
}

export const getMessageImage = (req, res, next) => getMessageMedia(req, res, next, "image/", "image");
export const getMessageAudio = (req, res, next) => getMessageMedia(req, res, next, "audio/", "audio");

export async function getTypingStatus(req, res, next) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message: "Social features are available for member accounts." });
    const friendship = await query(`SELECT 1 FROM social_conversations c
      WHERE c.id = $1 AND (c.participant_a = $2 OR c.participant_b = $2)
      AND EXISTS (SELECT 1 FROM social_friend_requests r WHERE r.status = 'accepted'
        AND ((r.requester_id = $2 AND r.recipient_id = CASE WHEN c.participant_a = $2 THEN c.participant_b ELSE c.participant_a END)
          OR (r.requester_id = CASE WHEN c.participant_a = $2 THEN c.participant_b ELSE c.participant_a END AND r.recipient_id = $2)))`, [req.params.conversationId, userId]);
    if (!friendship.rowCount) return res.status(404).json({ message: "Conversation not found." });
    const { rows } = await query(`SELECT EXISTS (
      SELECT 1 FROM social_typing_status
      WHERE conversation_id = $1 AND user_id <> $2 AND updated_at > now() - interval '4 seconds'
    ) AS typing`, [req.params.conversationId, userId]);
    res.json({ typing: rows[0].typing });
  } catch (err) { next(err); }
}

export async function setTypingStatus(req, res, next) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message: "Social features are available for member accounts." });
    const conversationId = await getConversation(userId, req.params.userId);
    if (!conversationId) return res.status(403).json({ message: "You can message this person after they accept your friend request." });
    if (req.body?.typing === true) {
      await query(`INSERT INTO social_typing_status (conversation_id, user_id, updated_at)
        VALUES ($1, $2, now()) ON CONFLICT (conversation_id, user_id) DO UPDATE SET updated_at = now()`, [conversationId, userId]);
    } else {
      await query("DELETE FROM social_typing_status WHERE conversation_id = $1 AND user_id = $2", [conversationId, userId]);
    }
    res.json({ conversationId });
  } catch (err) { next(err); }
}

export async function sendMessage(req, res, next) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message: "Social features are available for member accounts." });
    const input = messageSchema.parse(req.body);
    const conversationId = await getConversation(userId, req.params.userId);
    if (!conversationId) return res.status(403).json({ message: "You can message this person after they accept your friend request." });
    const { rows } = await query("INSERT INTO social_messages (conversation_id, sender_id, body) VALUES ($1, $2, $3) RETURNING id, sender_id, body, created_at, read_at", [conversationId, userId, input.body]);
    res.status(201).json({ conversationId, message: rows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ message: "Message must contain 1-2000 characters." });
    next(err);
  }
}

export async function sendCallSignal(req, res, next) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message: "Social features are available for member accounts." });
    const targetId = req.params.userId;
    if (targetId === userId) return res.status(400).json({ message: "You cannot call yourself." });
    const friendship = await query(`SELECT 1 FROM social_friend_requests
      WHERE status = 'accepted' AND ((requester_id = $1 AND recipient_id = $2) OR (requester_id = $2 AND recipient_id = $1))`, [userId, targetId]);
    if (!friendship.rowCount) return res.status(403).json({ message: "You can call this person after they accept your friend request." });
    const input = callSignalSchema.parse(req.body);
    const { rows } = await query(`INSERT INTO social_call_signals (sender_id, recipient_id, signal_type, payload)
      VALUES ($1, $2, $3, $4) RETURNING id, sender_id, recipient_id, signal_type, payload, created_at`, [userId, targetId, input.type, input.payload]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid call signal." });
    next(err);
  }
}

export async function listCallSignals(req, res, next) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message: "Social features are available for member accounts." });
    const since = req.query.since ? new Date(req.query.since) : new Date(0);
    const { rows } = await query(`SELECT s.id, s.sender_id, s.recipient_id, s.signal_type, s.payload, s.created_at,
        p.username AS sender_username, p.display_name AS sender_display_name, p.avatar_url AS sender_avatar_url, a.account_type AS sender_account_type
      FROM social_call_signals s
      LEFT JOIN social_profiles p ON p.user_id = s.sender_id
      LEFT JOIN social_accounts a ON a.id = p.user_id
      WHERE s.recipient_id = $1 AND s.created_at > GREATEST($2, now() - interval '30 seconds')
      ORDER BY s.created_at ASC LIMIT 100`, [userId, since]);
    res.json(rows);
  } catch (err) { next(err); }
}
