# Gym-owner marketing API

The marketing API is a FastAPI service sharing PostgreSQL with Movora's existing Express API. Deploy `fastapi.Dockerfile` as a separate service rooted at `backend/`; set `DATABASE_URL` and the same `JWT_ACCESS_SECRET` used by the Express API. The existing Express service must apply its numbered migrations first so `gym_owners` exists. The FastAPI container runs the Alembic campaign migration at startup.

Configure these environment variables on the FastAPI service:

- `META_APP_ID`, `META_APP_SECRET`, `META_AD_ACCOUNT_ID`, `META_PAGE_ID`, `META_ACCESS_TOKEN`
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`
- `JWT_ACCESS_SECRET`, `DATABASE_URL`

Set frontend `VITE_MARKETING_API_URL` to the FastAPI service origin (no trailing slash or path); it is required when marketing is deployed separately from the Express API. The API checks the signed gym-owner token and binds all campaign access to its owner UUID. Campaigns remain drafts until Razorpay confirms a captured payment; Meta delivery is activated only after that server-side confirmation.

Campaign creative uploads accept JPEG, PNG, WebP, MP4, and MOV files up to 500 MiB. Configure the frontend host, reverse proxy, and FastAPI deployment to allow request bodies slightly larger than 500 MiB to account for multipart form overhead. Files are streamed to R2 with multipart upload rather than buffered fully in application memory.

For a local FastAPI service, run `uvicorn main:app --reload` from `backend/` after setting its environment. Apply migrations with `alembic upgrade head`.
