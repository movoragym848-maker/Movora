# Gym-owner marketing API

The marketing API is a FastAPI service sharing PostgreSQL with Movora's existing Express API. Deploy `fastapi.Dockerfile` as a separate service rooted at `backend/`; set `DATABASE_URL` and the same `JWT_ACCESS_SECRET` used by the Express API. The existing Express service must apply its numbered migrations first so `gym_owners` exists. The FastAPI container runs the Alembic campaign migration at startup.

## Railway deployment

Keep the existing Express service on its Node/Nixpacks configuration (`backend/nixpacks.toml`); do not replace its start command with `python`, `python3`, or `uvicorn`. That service is built as Node and does not install the Python runtime or the FastAPI requirements.

Create a **separate Railway service** for the marketing API and configure it to:

1. Use `backend` as its root directory.
2. Build with the Dockerfile `fastapi.Dockerfile`.
3. Leave the custom start command unset. The Dockerfile installs `requirements.txt`, applies Alembic migrations, and starts Uvicorn on Railway's `$PORT`.

Set the environment variables below on this FastAPI service. The frontend defaults to Movora's marketing service origin (`https://movora-marketing-production.up.railway.app`). If deploying the marketing API at a different origin, set `VITE_MARKETING_API_URL` on the frontend build to that public origin (without `/api`) and rebuild/redeploy the frontend; Vite embeds overrides at build time.

Configure these environment variables on the FastAPI service:

- `META_APP_ID`, `META_APP_SECRET`, `META_AD_ACCOUNT_ID`, `META_PAGE_ID`, `META_ACCESS_TOKEN`
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`
- `JWT_ACCESS_SECRET`, `DATABASE_URL`

The API checks the signed gym-owner token and binds all campaign access to its owner UUID. In normal operation, campaigns remain drafts until Razorpay confirms a captured payment; Meta delivery is activated only after that server-side confirmation.

### Optional sandbox payment mode

The marketing screen can offer a no-charge demo option only when the marketing service has `MARKETING_DEMO_PAYMENT_ENABLED=true` and `META_SANDBOX_AD_ACCOUNT_ID` set to the exact Meta **test ad account** configured in `META_AD_ACCOUNT_ID` (the comparison accepts an optional `act_` prefix). The demo creates and activates Meta campaign objects and records their payment status as `TEST`; it does not claim a Razorpay payment was made. The UI labels these campaigns as sandbox tests.

Only enable this in a controlled test deployment after independently verifying the ad account is a Meta test/sandbox account. The service compares the configured IDs; it cannot determine from the ID alone whether Meta will deliver ads or charge the account. Never set these variables to a live ad account. Keep demo mode disabled for production/live campaigns. The `025_campaign_test_payment` migration is applied by the Docker startup command.

The campaign screen queries `/api/v1/marketing/campaigns/payment-options`. It reports missing Razorpay variable names and specific sandbox blockers (missing opt-in, missing account IDs, account mismatch, or missing Meta variable names) without returning any credential values. Add `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` to enable real checkout; they are not required to run the gated sandbox test.

Campaign creative uploads accept JPEG, PNG, WebP, MP4, and MOV files up to 500 MiB. Configure the frontend host, reverse proxy, and FastAPI deployment to allow request bodies slightly larger than 500 MiB to account for multipart form overhead. Files are streamed to R2 with multipart upload rather than buffered fully in application memory.

For a local FastAPI service, run `uvicorn main:app --reload` from `backend/` after setting its environment. Apply migrations with `alembic upgrade head`.
