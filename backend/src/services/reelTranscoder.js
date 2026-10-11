import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { env } from "../config/env.js";
import { query } from "../db/pool.js";
import { getR2Object, putR2Object } from "./r2Storage.js";

const jobs = [];
const queuedReels = new Set();
let processing = false;

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const process = spawn(env.ffmpegPath, args, { stdio:["ignore", "ignore", "pipe"] });
    let stderr = "";
    process.stderr.setEncoding("utf8");
    process.stderr.on("data", chunk => { stderr = `${stderr}${chunk}`.slice(-8000); });
    process.once("error", error => reject(new Error(`Unable to start FFmpeg (${env.ffmpegPath}): ${error.message}`)));
    process.once("close", code => code === 0
      ? resolve()
      : reject(new Error(`FFmpeg exited with code ${code}: ${stderr.trim() || "No diagnostic output."}`)));
  });
}

async function collectFiles(localDir, objectPrefix, files = []) {
  const entries = await readdir(localDir, { withFileTypes:true });
  for (const entry of entries) {
    const localPath = path.join(localDir, entry.name);
    const objectKey = `${objectPrefix}/${entry.name}`;
    if (entry.isDirectory()) await collectFiles(localPath, objectKey, files);
    else files.push({ localPath, objectKey });
  }
  return files;
}

async function uploadFiles(files) {
  let nextIndex = 0;
  const workers = Array.from({ length:Math.min(6, files.length) }, async () => {
    while (nextIndex < files.length) {
      const file = files[nextIndex++];
      const extension = path.extname(file.localPath).toLowerCase();
      const contentType = extension === ".m3u8"
        ? "application/vnd.apple.mpegurl"
        : extension === ".ts" ? "video/mp2t" : extension === ".webp" ? "image/webp" : "application/octet-stream";
      const fileStat = await stat(file.localPath);
      await putR2Object(file.objectKey, createReadStream(file.localPath), contentType, fileStat.size);
    }
  });
  await Promise.all(workers);
}

async function uploadDirectory(localDir, objectPrefix) {
  await uploadFiles(await collectFiles(localDir, objectPrefix));
}

async function writeMasterPlaylist(masterPath, include1080) {
  const variants = include1080
    ? "#EXT-X-STREAM-INF:BANDWIDTH=3000000\n720p/index.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=6000000\n1080p/index.m3u8\n"
    : "#EXT-X-STREAM-INF:BANDWIDTH=3000000\n720p/index.m3u8\n";
  await writeFile(masterPath, `#EXTM3U\n#EXT-X-VERSION:3\n${variants}`);
}

async function transcodeVariant(inputPath, outputDir, height, maxRate) {
  await mkdir(outputDir, { recursive:true });
  const playlistPath = path.join(outputDir, "index.m3u8");
  const segmentPattern = path.join(outputDir, "segment_%05d.ts");
  await runFfmpeg([
    "-hide_banner", "-loglevel", "error", "-y", "-i", inputPath,
    "-map", "0:v:0", "-map", "0:a:0?", "-vf", `scale=-2:${height}:force_original_aspect_ratio=decrease`,
    "-c:v", "libx264", "-preset", "veryfast", "-profile:v", "main", "-pix_fmt", "yuv420p",
    "-maxrate", maxRate, "-bufsize", height === 720 ? "3600k" : "7500k",
    "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-sn", "-dn",
    "-f", "hls", "-hls_time", "4", "-hls_playlist_type", "vod",
    "-hls_flags", "independent_segments", "-hls_segment_filename", segmentPattern, playlistPath,
  ]);
}

async function transcodeReel({ reelId, rawObjectKey }) {
  const workDir = await mkdir(path.join(os.tmpdir(), `movora-reel-${reelId}`), { recursive:true }).then(() => path.join(os.tmpdir(), `movora-reel-${reelId}`));
  const inputPath = path.join(workDir, "source-video");
  const outputDir = path.join(workDir, "hls");
  const prefix = `reels/${reelId}/hls`;
  let previewReady = false;
  try {
    const rawObject = await getR2Object(rawObjectKey);
    if (!rawObject.Body) throw new Error("Raw reel object was empty.");
    await pipeline(rawObject.Body, createWriteStream(inputPath));

    const variant720Dir = path.join(outputDir, "720p");
    const variant1080Dir = path.join(outputDir, "1080p");
    const masterPath = path.join(outputDir, "master.m3u8");
    const playlistUrl = `/api/reels/${reelId}/hls/master.m3u8`;
    const thumbnailUrl = `/api/reels/${reelId}/hls/thumbnail.webp`;

    await Promise.all([
      transcodeVariant(inputPath, variant720Dir, 720, "2800k"),
      runFfmpeg([
        "-hide_banner", "-loglevel", "error", "-y", "-i", inputPath,
        "-frames:v", "1", "-vf", "scale=-2:480:force_original_aspect_ratio=decrease",
        "-c:v", "libwebp", "-quality", "82", path.join(outputDir, "thumbnail.webp"),
      ]),
    ]);
    await Promise.all([
      uploadDirectory(variant720Dir, `${prefix}/720p`),
      uploadFiles(await collectFiles(outputDir, prefix).then(files => files.filter(file => file.localPath.endsWith("thumbnail.webp")))),
    ]);
    await writeMasterPlaylist(masterPath, false);
    await uploadFiles([{ localPath:masterPath, objectKey:`${prefix}/master.m3u8` }]);
    await query(`UPDATE social_reels SET video_hls_url = $2, thumbnail_url = $3,
      status = 'ready', processing_error = NULL WHERE id = $1`, [reelId, playlistUrl, thumbnailUrl]);
    previewReady = true;

    await transcodeVariant(inputPath, variant1080Dir, 1080, "5500k");
    await uploadDirectory(variant1080Dir, `${prefix}/1080p`);
    await writeMasterPlaylist(masterPath, true);
    await uploadFiles([{ localPath:masterPath, objectKey:`${prefix}/master.m3u8` }]);
  } catch (error) {
    if (!previewReady) {
      await query("UPDATE social_reels SET status = 'failed', processing_error = $2 WHERE id = $1", [reelId, String(error.message || error).slice(0, 1000)]);
    }
    throw error;
  } finally {
    await rm(workDir, { recursive:true, force:true });
  }
}

function pumpQueue() {
  if (processing || jobs.length === 0) return;
  processing = true;
  const job = jobs.shift();
  setImmediate(async () => {
    try { await transcodeReel(job); }
    catch (error) { console.error(`Reel ${job.reelId} transcoding failed:`, error.message); }
    finally {
      queuedReels.delete(job.reelId);
      processing = false;
      pumpQueue();
    }
  });
}

export function queueReelTranscode(reelId, rawObjectKey) {
  if (queuedReels.has(reelId)) return;
  queuedReels.add(reelId);
  jobs.push({ reelId, rawObjectKey });
  pumpQueue();
}

export async function resumePendingReelTranscodes() {
  const { rows } = await query("SELECT id, raw_object_key FROM social_reels WHERE status = 'processing' AND raw_object_key IS NOT NULL ORDER BY created_at ASC");
  rows.forEach(row => queueReelTranscode(row.id, row.raw_object_key));
  return rows.length;
}
