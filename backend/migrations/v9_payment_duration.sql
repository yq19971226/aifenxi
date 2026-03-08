-- v9: 支付表新增 duration_months 列（月付/季付/年付）
ALTER TABLE payments ADD COLUMN IF NOT EXISTS duration_months INTEGER DEFAULT 1;
COMMENT ON COLUMN payments.duration_months IS '订阅时长（月）: 1=月付, 3=季付, 12=年付';
