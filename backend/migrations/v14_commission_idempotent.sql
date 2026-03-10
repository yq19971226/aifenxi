-- v14: 佣金幂等保护 — 防止同一笔支付重复发放佣金
CREATE UNIQUE INDEX IF NOT EXISTS idx_commissions_payment_partner
    ON commissions(payment_id, partner_id);
