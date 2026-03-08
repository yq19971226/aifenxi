-- v9: 补充 5 个主流币种到 symbol_registry
INSERT INTO symbol_registry (symbol, display_name, has_onchain, has_derivatives) VALUES
('ADAUSDT',   'ADA/USDT',   false, true),
('DOGEUSDT',  'DOGE/USDT',  false, true),
('AVAXUSDT',  'AVAX/USDT',  false, true),
('DOTUSDT',   'DOT/USDT',   false, true),
('MATICUSDT', 'MATIC/USDT', false, true)
ON CONFLICT (symbol) DO NOTHING;
