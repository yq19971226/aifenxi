-- v7: 准确率增强 — 扩展链上快照表字段
-- 新增活跃地址、新增地址、交易所余额、大额转账、矿工储备变化

ALTER TABLE onchain_snapshots ADD COLUMN IF NOT EXISTS active_addresses INTEGER;
ALTER TABLE onchain_snapshots ADD COLUMN IF NOT EXISTS new_addresses INTEGER;
ALTER TABLE onchain_snapshots ADD COLUMN IF NOT EXISTS exchange_balance DOUBLE PRECISION;
ALTER TABLE onchain_snapshots ADD COLUMN IF NOT EXISTS large_tx_count INTEGER;
ALTER TABLE onchain_snapshots ADD COLUMN IF NOT EXISTS large_tx_volume DOUBLE PRECISION;
ALTER TABLE onchain_snapshots ADD COLUMN IF NOT EXISTS miner_reserve_change DOUBLE PRECISION;
