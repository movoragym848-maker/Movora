#!/usr/bin/env python3
"""Transcode local MP4 files to HLS, upload them to R2, and emit a seed manifest."""

import argparse
import json
import mimetypes
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import quote, urlparse

import boto3
from botocore.config import Config


ROOT = Path(__file__).resolve().parents[2]
VIDEO_DIR = ROOT / "videos"


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} must be configured")
    return value


def build_r2_client():
    account_id = os.environ.get("R2_ACCOUNT_ID", "").strip()
    endpoint = os.environ.get("R2_ENDPOINT_URL", "").strip()
    if not endpoint:
        if not account_id:
            raise RuntimeError("R2_ACCOUNT_ID or R2_ENDPOINT_URL must be configured")
        endpoint = f"https://{account_id}.r2.cloudflarestorage.com"
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        region_name="auto",
        aws_access_key_id=required_env("R2_ACCESS_KEY_ID"),
        aws_secret_access_key=required_env("R2_SECRET_ACCESS_KEY"),
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


def public_object_url(base_url: str, object_key: str) -> str:
    parsed = urlparse(base_url)
    if parsed.scheme != "https" or not parsed.netloc:
        raise RuntimeError("R2_PUBLIC_URL must be an HTTPS public bucket URL")
    return f"{base_url.rstrip('/')}/{quote(object_key, safe='/')}"


def run_ffmpeg(args: list[str]) -> None:
    try:
        subprocess.run(
            [os.environ.get("FFMPEG_PATH", "ffmpeg"), "-hide_banner", "-loglevel", "error", "-y", *args],
            check=True,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError as error:
        raise RuntimeError("FFmpeg was not found; install it or set FFMPEG_PATH") from error
    except subprocess.CalledProcessError as error:
        raise RuntimeError(error.stderr.strip() or "FFmpeg failed to process the video") from error


def transcode_video(source: Path, output_dir: Path) -> None:
    hls_dir = output_dir / "hls"
    thumbnail_path = output_dir / "thumbnail.webp"
    variants = ((720, "2800k", "3600k"), (1080, "5500k", "7500k"))

    for height, max_rate, buffer_size in variants:
        variant_dir = hls_dir / f"{height}p"
        variant_dir.mkdir(parents=True, exist_ok=True)
        run_ffmpeg([
            "-i", str(source), "-map", "0:v:0", "-map", "0:a:0?",
            "-vf", f"scale=-2:{height}:force_original_aspect_ratio=decrease",
            "-c:v", "libx264", "-preset", "veryfast", "-profile:v", "main", "-pix_fmt", "yuv420p",
            "-maxrate", max_rate, "-bufsize", buffer_size, "-force_key_frames", "expr:gte(t,n_forced*4)",
            "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-sn", "-dn",
            "-f", "hls", "-hls_time", "4", "-hls_playlist_type", "vod",
            "-hls_flags", "independent_segments", "-hls_segment_filename",
            str(variant_dir / "segment_%05d.ts"), str(variant_dir / "index.m3u8"),
        ])

    hls_dir.mkdir(parents=True, exist_ok=True)
    (hls_dir / "master.m3u8").write_text(
        "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-INDEPENDENT-SEGMENTS\n"
        "#EXT-X-STREAM-INF:BANDWIDTH=3000000\n720p/index.m3u8\n"
        "#EXT-X-STREAM-INF:BANDWIDTH=6000000\n1080p/index.m3u8\n",
        encoding="utf-8",
    )
    run_ffmpeg([
        "-ss", "1", "-i", str(source), "-frames:v", "1",
        "-vf", "scale=-2:480:force_original_aspect_ratio=decrease",
        "-c:v", "libwebp", "-quality", "82", str(thumbnail_path),
    ])


def object_content_type(path: Path) -> str:
    if path.suffix == ".m3u8":
        return "application/vnd.apple.mpegurl"
    if path.suffix == ".ts":
        return "video/mp2t"
    return mimetypes.guess_type(path.name)[0] or "application/octet-stream"


def upload_directory(client, bucket: str, directory: Path, prefix: str) -> list[str]:
    uploaded_keys = []
    try:
        for path in sorted(directory.rglob("*")):
            if not path.is_file():
                continue
            object_key = f"{prefix}/{path.relative_to(directory).as_posix()}"
            client.upload_file(
                str(path),
                bucket,
                object_key,
                ExtraArgs={
                    "ContentType": object_content_type(path),
                    "CacheControl": "public, max-age=31536000, immutable",
                },
            )
            uploaded_keys.append(object_key)
    except Exception:
        for object_key in uploaded_keys:
            try:
                client.delete_object(Bucket=bucket, Key=object_key)
            except Exception:
                pass
        raise
    return uploaded_keys


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--videos", type=Path, default=VIDEO_DIR, help="Folder to scan recursively for MP4 files")
    parser.add_argument("--manifest", type=Path, help="Optionally write the JSON seed manifest to this path")
    args = parser.parse_args()

    sources = sorted(path for path in args.videos.rglob("*") if path.is_file() and path.suffix.lower() == ".mp4")
    if not sources:
        parser.error(f"No MP4 files found under {args.videos}")

    names = [re.sub(r"[^A-Za-z0-9._-]+", "-", source.stem).strip("-.") or "reel" for source in sources]
    if len(names) != len(set(names)):
        parser.error("Video filenames collide after conversion to safe R2 folder names")

    bucket = required_env("R2_BUCKET_NAME")
    public_base = required_env("R2_PUBLIC_URL")
    client = build_r2_client()
    manifest = []

    for source, name in zip(sources, names):
        prefix = f"reels/{name}"
        uploaded_keys = []
        try:
            with tempfile.TemporaryDirectory(prefix="movora-hls-") as temporary_dir:
                output_dir = Path(temporary_dir) / "output"
                output_dir.mkdir()
                transcode_video(source, output_dir)
                uploaded_keys = upload_directory(client, bucket, output_dir, prefix)
            video_url = public_object_url(public_base, f"{prefix}/hls/master.m3u8")
            thumbnail_url = public_object_url(public_base, f"{prefix}/thumbnail.webp")
            manifest.append({
                "source_file": source.name,
                "video_url": video_url,
                "thumbnail_url": thumbnail_url,
            })
            print(f"{source.name}: {video_url} | {thumbnail_url}", file=sys.stderr)
        except Exception:
            for object_key in uploaded_keys:
                try:
                    client.delete_object(Bucket=bucket, Key=object_key)
                except Exception:
                    pass
            raise

    encoded_manifest = json.dumps(manifest, indent=2)
    if args.manifest:
        args.manifest.parent.mkdir(parents=True, exist_ok=True)
        args.manifest.write_text(encoded_manifest + "\n", encoding="utf-8")
    print(encoded_manifest)


if __name__ == "__main__":
    main()