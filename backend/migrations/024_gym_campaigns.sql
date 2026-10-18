CREATE TABLE IF NOT EXISTS gym_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gym_owners(id) ON DELETE CASCADE,
  meta_campaign_id text,
  meta_adset_id text,
  meta_ad_id text,
  campaign_name varchar(120) NOT NULL,
  objective varchar(32) NOT NULL,
  daily_budget_inr double precision NOT NULL,
  duration_days integer NOT NULL,
  target_radius_km integer NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  image_url varchar(2048) NOT NULL,
  primary_text text NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'DRAFT',
  payment_order_id text,
  payment_id text,
  payment_status varchar(20) NOT NULL DEFAULT 'CREATED',
  total_amount_paise integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_gym_campaign_objective CHECK (objective IN ('GET_MEMBERS', 'DIRECT_MESSAGES')),
  CONSTRAINT ck_gym_campaign_status
    CHECK (status IN ('DRAFT', 'PENDING_PAYMENT', 'ACTIVE', 'PAUSED', 'COMPLETED')),
  CONSTRAINT ck_gym_campaign_budget CHECK (daily_budget_inr > 0),
  CONSTRAINT ck_gym_campaign_duration CHECK (duration_days IN (3, 7, 14)),
  CONSTRAINT ck_gym_campaign_radius CHECK (target_radius_km BETWEEN 3 AND 15),
  CONSTRAINT ck_gym_campaign_latitude CHECK (latitude BETWEEN -90 AND 90),
  CONSTRAINT ck_gym_campaign_longitude CHECK (longitude BETWEEN -180 AND 180),
  CONSTRAINT ck_gym_campaign_amount CHECK (total_amount_paise > 0),
  CONSTRAINT ck_gym_campaign_payment_status CHECK (payment_status IN ('CREATED', 'PAID'))
);

CREATE INDEX IF NOT EXISTS ix_gym_campaigns_gym_id_created_at
  ON gym_campaigns (gym_id, created_at DESC);
