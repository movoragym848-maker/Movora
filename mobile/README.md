# Expo Reels Feed

`ReelsFeed.tsx` is a standalone Expo component for the FastAPI endpoint in `backend/main.py`. This repository's existing Android app is Capacitor/Vite, not Expo; this component is ready to integrate into an Expo host and does not replace the current client.

Install the native video module in the Expo app:

```powershell
npx expo install expo-video
```

Pass the API origin (without `/api/reels`) to the component:

```tsx
<ReelsFeed apiBaseUrl={process.env.EXPO_PUBLIC_API_URL ?? ""} />
```

For a protected deployment, pass the current access token with `accessToken`. The API and feed use five-item pages by default.

## Run the Python API

From the repository root, install the backend dependencies and start FastAPI:

```powershell
py -m pip install -r backend/requirements-seed.txt
py -m uvicorn main:app --app-dir backend --host 0.0.0.0 --port 8000
```

Configure `DATABASE_URL` before starting. Run `npm --prefix backend run migrate` before launching either backend; FastAPI reads the same `social_reels` and `social_profiles` tables as the Express feed and does not create a parallel reels table.

## Batch process and seed reels

Set the R2 variables from `backend/REELS_R2_SETUP.md`, `DATABASE_URL`, and `REEL_CREATOR_ID` to the UUID of an existing social profile. Ensure `ffmpeg` is installed or set `FFMPEG_PATH`. Run from the repository root:

```powershell
py backend/scripts/process_and_upload_reels.py --manifest backend/scripts/reels_manifest.json
py backend/scripts/seed_reels.py backend/scripts/reels_manifest.json --creator-id <social-profile-uuid>
```

The seed records appear through both `GET /api/reels` and the Express social feed because both query `social_reels`. FastAPI returns only public, ready reels, with HLS and profile metadata in the feed response.
