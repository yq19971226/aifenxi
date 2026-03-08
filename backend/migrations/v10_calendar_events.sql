-- 创建日历事件表
CREATE TABLE IF NOT EXISTS calendar_events (
    event_id VARCHAR(50) PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    event_date TIMESTAMPTZ NOT NULL,
    categories TEXT,  -- 逗号分隔的分类列表
    proof_link TEXT,
    source TEXT,
    vote_count INTEGER DEFAULT 0,
    positive_vote_count INTEGER DEFAULT 0,
    percentage INTEGER DEFAULT 0,
    can_occur_before BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_calendar_events_symbol ON calendar_events(symbol);
CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events(event_date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_symbol_date ON calendar_events(symbol, event_date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_vote_count ON calendar_events(vote_count DESC);

-- 创建更新时间触发器
CREATE OR REPLACE FUNCTION update_calendar_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_calendar_events_updated_at
    BEFORE UPDATE ON calendar_events
    FOR EACH ROW
    EXECUTE FUNCTION update_calendar_events_updated_at();

-- 添加注释
COMMENT ON TABLE calendar_events IS '币圈日历事件表（来源：CoinMarketCal）';
COMMENT ON COLUMN calendar_events.event_id IS 'CoinMarketCal 事件 ID';
COMMENT ON COLUMN calendar_events.symbol IS '币种符号';
COMMENT ON COLUMN calendar_events.title IS '事件标题';
COMMENT ON COLUMN calendar_events.description IS '事件描述';
COMMENT ON COLUMN calendar_events.event_date IS '事件日期';
COMMENT ON COLUMN calendar_events.categories IS '事件分类（逗号分隔）';
COMMENT ON COLUMN calendar_events.proof_link IS '证据链接';
COMMENT ON COLUMN calendar_events.source IS '来源链接';
COMMENT ON COLUMN calendar_events.vote_count IS '总投票数';
COMMENT ON COLUMN calendar_events.positive_vote_count IS '正面投票数';
COMMENT ON COLUMN calendar_events.percentage IS '正面投票百分比';
COMMENT ON COLUMN calendar_events.can_occur_before IS '是否可能提前发生';
