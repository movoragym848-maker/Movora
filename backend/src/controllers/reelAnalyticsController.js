import { z } from "zod";
import { query } from "../db/pool.js";
import { findVisibleReel } from "./socialController.js";

const visibilitySchema = z.object({ privacy:z.enum(["public", "friends", "private"]) });
const eventSchema = z.object({
  eventType:z.enum(["impression", "watch", "share"]),
  watchMs:z.coerce.number().int().min(0).max(30000).optional().default(0),
  progressPct:z.coerce.number().int().min(0).max(100).optional().default(0),
});

function authUser(req) {
  return req.user?.role === "gym_owner" ? null : req.user?.sub;
}

export async function listMyReels(req, res, next) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message:"Social features are available for member accounts." });
    const { rows } = await query(`
      SELECT r.id, r.video_url, r.video_hls_url, r.thumbnail_url, r.caption, r.created_at,
        r.media_type, r.workout_tag, r.location, r.privacy, r.status,
        p.username, p.display_name,
        (SELECT count(*)::int FROM social_reel_analytics_events e WHERE e.reel_id = r.id AND e.event_type = 'impression' AND e.actor_id <> r.creator_id) AS view_count,
        (SELECT count(*)::int FROM social_reel_likes l WHERE l.reel_id = r.id) AS like_count,
        (SELECT count(*)::int FROM social_reel_comments c WHERE c.reel_id = r.id) AS comment_count,
        (SELECT count(*)::int FROM social_reel_saves s WHERE s.reel_id = r.id) AS save_count
      FROM social_reels r
      LEFT JOIN social_profiles p ON p.user_id = r.creator_id
      WHERE r.creator_id = $1
      ORDER BY r.created_at DESC, r.id DESC`, [userId]);
    res.json(rows);
  } catch (err) { next(err); }
}

export async function getMyReelAnalytics(req, res, next) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message:"Social features are available for member accounts." });
    const { rows } = await query(`
      SELECT r.id, r.video_url, r.video_hls_url, r.thumbnail_url, r.caption, r.created_at,
        r.media_type, r.workout_tag, r.location, r.privacy, r.status,
        p.username, p.display_name, p.avatar_url,
        (SELECT count(*)::int FROM social_reel_analytics_events e WHERE e.reel_id = r.id AND e.event_type = 'impression' AND e.actor_id <> r.creator_id) AS impressions,
        (SELECT count(DISTINCT e.actor_id)::int FROM social_reel_analytics_events e WHERE e.reel_id = r.id AND e.event_type = 'impression' AND e.actor_id <> r.creator_id) AS reach,
        (SELECT count(*)::int FROM social_reel_likes l WHERE l.reel_id = r.id) AS likes,
        (SELECT count(*)::int FROM social_reel_saves s WHERE s.reel_id = r.id) AS saves,
        (SELECT count(*)::int FROM social_reel_comments c WHERE c.reel_id = r.id) AS comments,
        (SELECT count(*)::int FROM social_reel_analytics_events e WHERE e.reel_id = r.id AND e.event_type = 'share') AS shares,
        COALESCE((SELECT round(avg(e.watch_ms))::int FROM social_reel_analytics_events e WHERE e.reel_id = r.id AND e.event_type = 'watch' AND e.actor_id <> r.creator_id), 0) AS average_watch_ms
      FROM social_reels r
      LEFT JOIN social_profiles p ON p.user_id = r.creator_id
      WHERE r.id = $1 AND r.creator_id = $2`, [req.params.reelId, userId]);
    if (!rows.length) return res.status(404).json({ message:"Post not found." });

    const [impressions, retention, audience, commentVelocity, postComments] = await Promise.all([
      query(`WITH days AS (
        SELECT generate_series(
          (SELECT created_at::date FROM social_reels WHERE id = $1),
          current_date,
          interval '1 day'
        )::date AS day
      )
      SELECT days.day::text AS day,
        count(e.id) FILTER (WHERE e.event_type = 'impression')::int AS impressions,
        count(DISTINCT e.actor_id) FILTER (WHERE e.event_type = 'impression')::int AS reach
      FROM days LEFT JOIN social_reel_analytics_events e ON e.reel_id = $1 AND e.actor_id <> $2 AND e.created_at::date = days.day
      GROUP BY days.day ORDER BY days.day`, [req.params.reelId, userId]),
      query(`WITH viewer_progress AS (
        SELECT actor_id, max(progress_pct)::int AS max_progress
        FROM social_reel_analytics_events
        WHERE reel_id = $1 AND event_type = 'watch' AND actor_id <> $2
        GROUP BY actor_id
      ), buckets AS (SELECT generate_series(0, 100, 10)::int AS progress_pct)
      SELECT buckets.progress_pct,
        count(viewer_progress.actor_id) FILTER (WHERE viewer_progress.max_progress >= buckets.progress_pct)::int AS viewers,
        CASE WHEN count(viewer_progress.actor_id) = 0 THEN 0
          ELSE round(100.0 * count(viewer_progress.actor_id) FILTER (WHERE viewer_progress.max_progress >= buckets.progress_pct) / count(viewer_progress.actor_id))::int
        END AS retention_rate
      FROM buckets LEFT JOIN viewer_progress ON true
      GROUP BY buckets.progress_pct ORDER BY buckets.progress_pct`, [req.params.reelId, userId]),
      query(`SELECT CASE WHEN f.follower_id IS NULL THEN 'nonFollowers' ELSE 'followers' END AS audience,
        count(DISTINCT e.actor_id)::int AS viewers
      FROM social_reel_analytics_events e
      JOIN social_reels r ON r.id = e.reel_id
      LEFT JOIN social_follows f ON f.follower_id = e.actor_id AND f.following_id = r.creator_id
      WHERE e.reel_id = $1 AND e.event_type = 'impression' AND e.actor_id <> r.creator_id
      GROUP BY audience`, [req.params.reelId]),
      query(`WITH reel_span AS (
        SELECT created_at::date AS started,
          CASE WHEN current_date - created_at::date <= 60 THEN 'day'
            WHEN current_date - created_at::date <= 730 THEN 'week'
            ELSE 'month' END AS unit
        FROM social_reels WHERE id = $1
      ), periods AS (
        SELECT generate_series(
          CASE unit WHEN 'day' THEN started::timestamp
            WHEN 'week' THEN date_trunc('week', started::timestamp)
            ELSE date_trunc('month', started::timestamp) END,
          current_date::timestamp,
          CASE unit WHEN 'day' THEN interval '1 day'
            WHEN 'week' THEN interval '1 week'
            ELSE interval '1 month' END
        ) AS period_start,
        CASE unit WHEN 'day' THEN interval '1 day'
          WHEN 'week' THEN interval '1 week'
          ELSE interval '1 month' END AS period_length
        FROM reel_span
      )
      SELECT to_char(period_start::date, 'YYYY-MM-DD') AS day, periods.unit,
        count(c.id)::int AS comments
      FROM periods LEFT JOIN social_reel_comments c
        ON c.reel_id = $1 AND c.created_at >= periods.period_start AND c.created_at < periods.period_start + periods.period_length
      GROUP BY period_start ORDER BY period_start`, [req.params.reelId]),
      query(`SELECT c.id, c.body, c.parent_comment_id, c.is_pinned, c.created_at, c.user_id,
          COALESCE(p.display_name, 'Movora member') AS display_name, p.username, p.avatar_url
        FROM social_reel_comments c
        LEFT JOIN social_profiles p ON p.user_id = c.user_id
        WHERE c.reel_id = $1
        ORDER BY c.created_at DESC
        LIMIT 100`, [req.params.reelId]),
    ]);

    const audienceCounts = { followers:0, nonFollowers:0 };
    audience.rows.forEach(row => { audienceCounts[row.audience] = row.viewers; });
    res.json({
      reel:rows[0],
      impressions:impressions.rows,
      retention:retention.rows,
      audience:audienceCounts,
      commentVelocity:commentVelocity.rows,
      commentVelocityUnit:commentVelocity.rows[0]?.unit || "day",
      comments:postComments.rows,
    });
  } catch (err) { next(err); }
}

export async function updateMyReelPrivacy(req, res, next) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message:"Social features are available for member accounts." });
    const input = visibilitySchema.parse(req.body);
    const { rows } = await query(`UPDATE social_reels SET privacy = $3
      WHERE id = $1 AND creator_id = $2 RETURNING id, privacy`, [req.params.reelId, userId, input.privacy]);
    if (!rows.length) return res.status(404).json({ message:"Post not found." });
    res.json(rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ message:"Choose a valid post visibility." });
    next(err);
  }
}

export async function deleteMyReel(req, res, next) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message:"Social features are available for member accounts." });
    const result = await query("DELETE FROM social_reels WHERE id = $1 AND creator_id = $2 RETURNING id", [req.params.reelId, userId]);
    if (!result.rowCount) return res.status(404).json({ message:"Post not found." });
    res.status(204).end();
  } catch (err) { next(err); }
}

export async function recordMyReelEvent(req, res, next) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message:"Social features are available for member accounts." });
    const reel = await findVisibleReel(req.params.reelId, userId);
    if (!reel) return res.status(404).json({ message:"Post not found." });
    const input = eventSchema.parse(req.body);
    if (reel.creator_id === userId && input.eventType !== "share") return res.status(204).end();
    await query(`INSERT INTO social_reel_analytics_events (reel_id, actor_id, event_type, watch_ms, progress_pct)
      VALUES ($1, $2, $3, $4, $5)`, [req.params.reelId, userId, input.eventType,
      input.eventType === "watch" ? input.watchMs : 0,
      input.eventType === "watch" ? input.progressPct : 0]);
    res.status(204).end();
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ message:"Invalid analytics event." });
    next(err);
  }
}

export async function toggleMyReelSave(req, res, next) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message:"Social features are available for member accounts." });
    if (!await findVisibleReel(req.params.reelId, userId)) return res.status(404).json({ message:"Post not found." });
    const removed = await query("DELETE FROM social_reel_saves WHERE reel_id = $1 AND user_id = $2 RETURNING reel_id", [req.params.reelId, userId]);
    const saved = !removed.rowCount;
    if (saved) await query("INSERT INTO social_reel_saves (reel_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [req.params.reelId, userId]);
    res.json({ saved });
  } catch (err) { next(err); }
}
