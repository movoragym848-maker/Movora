# Reel R2 and HLS Setup

## Railway variables

Add these to the backend service. Keep the R2 secret key private and do not commit it.

- `R2_ACCOUNT_ID`: Cloudflare account ID.
- `R2_ACCESS_KEY_ID`: R2 S3 API token access key.
- `R2_SECRET_ACCESS_KEY`: R2 S3 API token secret.
- `R2_BUCKET_NAME`: private bucket used for raw videos and HLS output.
- `R2_ENDPOINT_URL`: optional; defaults to `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`.
- `REEL_UPLOAD_MAX_BYTES`: optional upload ceiling in bytes; defaults to 157286400 (150 MiB).
- `FFMPEG_PATH`: optional; defaults to `ffmpeg`.

The backend service should use `backend` as its Railway root directory so `backend/nixpacks.toml` installs FFmpeg. Local development requires FFmpeg to be installed and available on `PATH`, or set `FFMPEG_PATH` to its executable path.

## Bucket CORS

Keep the authenticated-upload bucket private. In its R2 settings, add a CORS policy that permits direct uploads from the app origins. Replace the example production origin with the actual frontend origin:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:5173",
      "https://localhost",
      "capacitor://localhost",
      "https://your-movora-frontend.example"
    ],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

HLS playlists, segments, and thumbnails are streamed through authenticated backend routes, so R2 does not need public access or GET CORS permissions. The feed uses HLS.js and authenticated requests for playback.

For batch imports, use a separate public bucket/domain (or explicitly choose to expose the configured bucket) and add `GET`/`HEAD` CORS permission for the frontend origin. The public playlist's relative segment URLs resolve under that domain.

## Upload flow

1. The client requests `GET /api/reels/upload-url?contentType=video%2Fmp4&fileSize=...`.
2. The backend returns a short-lived, size- and content-type-bound presigned PUT URL and an account-scoped object key.
3. The client uploads directly to R2 and submits `POST /api/reels` with `object_key` and post metadata.
4. The backend stores the reel as `processing` and queues FFmpeg. FFmpeg generates 720p and 1080p HLS renditions plus a WebP thumbnail.
5. Once every output is in R2, the reel changes to `ready`; the client polls status and switches to adaptive HLS playback.

Original videos are retained in R2 for the download/share action, in addition to the transcoded HLS renditions.

## Batch import for the shared Reels feed

`social_reels` is the canonical table for both the Express app feed and the FastAPI feed endpoint. Migration `021_unify_reels.sql` archives the former standalone `reels` table as `legacy_reels` and creates a read-only `reels` view over public, ready social reels. The seeder transfers legacy rows into `social_reels` on its next run.

Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, and `R2_PUBLIC_URL` for the batch command. Point `R2_BUCKET_NAME` at the public batch bucket (or intentionally expose the selected bucket) and `R2_PUBLIC_URL` at its HTTPS public/custom domain. Configure that domain's CORS policy to allow `GET` and `HEAD` from the frontend origin; HLS requests to the public domain do not send the app bearer token. The running Express upload service can keep its separate private-bucket configuration.

From the repository root, transcode every MP4 under `videos/` and write the generated playlist and thumbnail URLs to a manifest:

```powershell
py backend/scripts/process_and_upload_reels.py --manifest backend/scripts/reels_manifest.json
```

Apply the database migrations, then bulk-seed the manifest. `DATABASE_URL` must point to the PostgreSQL database used by both services. `--creator-id` must be an existing `social_profiles.user_id` UUID; it can also be set as `REEL_CREATOR_ID`:

```powershell
npm --prefix backend run migrate
py backend/scripts/seed_reels.py backend/scripts/reels_manifest.json --creator-id "00000000-0000-0000-0000-000000000000"
```

Each source is uploaded under `reels/{filename}/`, with a 720p/1080p master playlist, four-second HLS segments, and a WebP thumbnail. New rows are public and ready immediately. The seeder skips playlist URLs already in `social_reels`, preserves starter engagement counts, and transfers any rows archived in `legacy_reels`. The manifest is generated locally and should not be committed.
