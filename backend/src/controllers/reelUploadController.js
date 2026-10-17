import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import { env } from "../config/env.js";
import { query } from "../db/pool.js";
import { findVisibleReel } from "./socialController.js";
import { createReelPutUrl, getR2Object, headR2Object, requireR2Configured } from "../services/r2Storage.js";
import { queueReelTranscode } from "../services/reelTranscoder.js";

const videoTypes = new Map([
  ["video/mp4", "mp4"],
  ["video/webm", "webm"],
  ["video/quicktime", "mov"],
  ["video/3gpp", "3gp"],
]);

const uploadUrlSchema = z.object({
  contentType:z.string().min(1).max(100),
  fileSize:z.coerce.number().int().positive().max(env.reelUploadMaxBytes),
});

const reelSchema = z.object({
  object_key:z.string().min(1).max(512),
  caption:z.string().max(220).optional().default(""),
  workoutTag:z.string().max(40).optional().default(""),
  location:z.string().max(100).optional().default(""),
  privacy:z.enum(["public", "friends", "private"]).optional().default("public"),
});

function authUser(req) {
  return req.user?.sub;
}

function handleR2Error(error, res, next) {
  if (error.name === "CredentialsProviderError" || error.message?.includes("R2 credentials")) {
    return res.status(503).json({ message:error.message || "R2 is not configured." });
  }
  return next(error);
}

export async function createReelUploadUrl(req, res, next) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message:"Social features are available for member accounts." });
    requireR2Configured();
    const { rows:profile } = await query("SELECT 1 FROM social_profiles WHERE user_id = $1", [userId]);
    if (!profile.length) return res.status(403).json({ message:"Create your social account first." });
    const input = uploadUrlSchema.parse(req.query);
    const contentType = input.contentType.split(";")[0].trim().toLowerCase();
    const extension = videoTypes.get(contentType);
    if (!extension) return res.status(415).json({ message:"Use an MP4, WebM, MOV, or 3GP video." });
    const objectKey = `reels/uploads/${userId}/${randomUUID()}.${extension}`;
    const upload_url = await createReelPutUrl(objectKey, contentType, input.fileSize);
    res.json({ upload_url, object_key:objectKey, required_headers:{ "Content-Type":contentType } });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ message:error.issues[0]?.message || "Invalid upload request." });
    return handleR2Error(error, res, next);
  }
}

export async function createR2Reel(req, res, next) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message:"Social features are available for member accounts." });
    requireR2Configured();
    const { rows:profile } = await query("SELECT 1 FROM social_profiles WHERE user_id = $1", [userId]);
    if (!profile.length) return res.status(403).json({ message:"Create your social account first." });
    const input = reelSchema.parse(req.body);
    const expectedPrefix = `reels/uploads/${userId}/`;
    if (!input.object_key.startsWith(expectedPrefix) || input.object_key.includes("..")) {
      return res.status(400).json({ message:"Upload key does not belong to this account." });
    }
    const object = await headR2Object(input.object_key);
    if (!object.ContentLength) return res.status(400).json({ message:"Uploaded video is empty." });
    if (object.ContentLength > env.reelUploadMaxBytes) return res.status(413).json({ message:`Video uploads are limited to ${Math.floor(env.reelUploadMaxBytes / 1024 / 1024)} MB.` });
    const mediaType = String(object.ContentType || "").split(";")[0].trim().toLowerCase();
    if (!videoTypes.has(mediaType)) return res.status(415).json({ message:"Uploaded object is not a supported video." });
    if (!input.object_key.endsWith(`.${videoTypes.get(mediaType)}`)) return res.status(400).json({ message:"Uploaded file type does not match its object key." });
    const { rows } = await query(`INSERT INTO social_reels
      (creator_id, video_url, caption, media_type, workout_tag, location, privacy, raw_object_key, status)
      VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, 'processing')
      RETURNING id, created_at, status`,
    [userId, input.caption, mediaType, input.workoutTag, input.location, input.privacy, input.object_key]);
    queueReelTranscode(rows[0].id, input.object_key);
    res.status(202).json(rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ message:error.issues[0]?.message || "Invalid post details." });
    if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) return res.status(400).json({ message:"Upload the video to R2 before creating the post." });
    return handleR2Error(error, res, next);
  }
}

export async function downloadOriginalReel(req, res, next) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message:"Social features are available for member accounts." });
    const { rows } = await query("SELECT raw_object_key, media_type FROM social_reels WHERE id = $1 AND creator_id = $2", [req.params.reelId, userId]);
    if (!rows[0]?.raw_object_key) return res.status(404).json({ message:"Original video is no longer available." });
    const objectMetadata = await headR2Object(rows[0].raw_object_key);
    res.set("Content-Type", rows[0].media_type || objectMetadata.ContentType || "application/octet-stream");
    res.set("Content-Length", String(objectMetadata.ContentLength));
    const extension = videoTypes.get(rows[0].media_type) || "mp4";
    res.set("Content-Disposition", `attachment; filename="movora-reel-${req.params.reelId}.${extension}"`);
    const object = await getR2Object(rows[0].raw_object_key);
    await pipeline(object.Body, res);
  } catch (error) { return handleR2Error(error, res, next); }
}

export async function serveReelHlsAsset(req, res, next) {
  try {
    const userId = authUser(req);
    if (!userId) return res.status(403).json({ message:"Social features are available for member accounts." });
    if (!await findVisibleReel(req.params.reelId, userId)) return res.status(404).json({ message:"Post not found." });
    const variant = req.params.variant || "";
    const file = req.params.file || "";
    if ((variant && !["720p", "1080p"].includes(variant)) || !/^[a-zA-Z0-9_.-]+\.(m3u8|ts|webp)$/.test(file)) {
      return res.status(404).json({ message:"HLS asset not found." });
    }
    const objectKey = `reels/${req.params.reelId}/hls/${variant ? `${variant}/` : ""}${file}`;
    const object = await getR2Object(objectKey);
    const contentType = file.endsWith(".m3u8")
      ? "application/vnd.apple.mpegurl"
      : file.endsWith(".ts") ? "video/mp2t" : "image/webp";
    res.set("Content-Type", contentType);
    res.set("Cache-Control", "private, no-store");
    res.set("X-Content-Type-Options", "nosniff");
    if (file.endsWith(".m3u8")) {
      const playlist = await object.Body.transformToString();
      const baseUrl = `/api/reels/${req.params.reelId}/hls${variant ? `/${variant}` : ""}`;
      const rewritten = playlist.split(/\r?\n/).map(line => {
        if (!line || line.startsWith("#")) return line;
        return `${baseUrl}/${line.split("/").map(encodeURIComponent).join("/")}`;
      }).join("\n");
      return res.send(rewritten);
    }
    if (object.ContentLength) res.set("Content-Length", String(object.ContentLength));
    await pipeline(object.Body, res);
  } catch (error) { return handleR2Error(error, res, next); }
}
