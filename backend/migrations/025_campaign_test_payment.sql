ALTER TABLE gym_campaigns DROP CONSTRAINT IF EXISTS ck_gym_campaign_payment_status;
ALTER TABLE gym_campaigns
  ADD CONSTRAINT ck_gym_campaign_payment_status
  CHECK (payment_status IN ('CREATED', 'PAID', 'TEST'));
