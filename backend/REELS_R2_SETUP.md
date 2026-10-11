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

Keep the bucket private. In the R2 bucket settings, add a CORS policy that permits direct uploads from the app origins. Replace the example production origin with the actual frontend origin:

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

## Upload flow

1. The client requests `GET /api/reels/upload-url?contentType=video%2Fmp4&fileSize=...`.
2. The backend returns a short-lived, size- and content-type-bound presigned PUT URL and an account-scoped object key.
3. The client uploads directly to R2 and submits `POST /api/reels` with `object_key` and post metadata.
4. The backend stores the reel as `processing` and queues FFmpeg. FFmpeg generates 720p and 1080p HLS renditions plus a WebP thumbnail.
5. Once every output is in R2, the reel changes to `ready`; the client polls status and switches to adaptive HLS playback.

Original videos are retained in R2 for the download/share action, in addition to the transcoded HLS renditions.
