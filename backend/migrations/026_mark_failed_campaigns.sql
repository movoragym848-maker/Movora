ALTER TABLE gym_campaigns ADD COLUMN IF NOT EXISTS failure_reason varchar(2000);

ALTER TABLE gym_campaigns DROP CONSTRAINT IF EXISTS ck_gym_campaign_status;
ALTER TABLE gym_campaigns
  ADD CONSTRAINT ck_gym_campaign_status
  CHECK (status IN ('DRAFT', 'PENDING_PAYMENT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'FAILED'));

UPDATE gym_campaigns
SET status = 'FAILED',
    failure_reason = 'This earlier unpaid campaign never completed a successful launch.'
WHERE status = 'DRAFT'
  AND payment_order_id IS NULL
  AND payment_status = 'CREATED';
