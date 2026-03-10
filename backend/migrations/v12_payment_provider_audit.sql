-- v12: 支付闭环补充 provider 审计字段与支付地址缓存
ALTER TABLE payments ADD COLUMN IF NOT EXISTS pay_address TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS pay_amount NUMERIC(24, 8);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS pay_currency VARCHAR(30);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_status VARCHAR(40);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS status_reason VARCHAR(40);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_payload_json TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_observed_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_observation_source VARCHAR(20);

UPDATE payments
SET provider_status = COALESCE(provider_status, status),
    provider_observed_at = COALESCE(provider_observed_at, updated_at),
    provider_observation_source = COALESCE(provider_observation_source, 'legacy')
WHERE provider_status IS NULL
   OR provider_observed_at IS NULL
   OR provider_observation_source IS NULL;
