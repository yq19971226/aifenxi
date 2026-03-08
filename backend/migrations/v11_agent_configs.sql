-- 创建智能体配置表
CREATE TABLE IF NOT EXISTS agent_configs (
    agent_id VARCHAR(50) PRIMARY KEY,
    agent_name VARCHAR(100) NOT NULL,
    description TEXT,
    category VARCHAR(50),
    priority INTEGER DEFAULT 0,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_agent_configs_enabled ON agent_configs(enabled);
CREATE INDEX IF NOT EXISTS idx_agent_configs_category ON agent_configs(category);
CREATE INDEX IF NOT EXISTS idx_agent_configs_priority ON agent_configs(priority DESC);

-- 创建更新时间触发器
CREATE OR REPLACE FUNCTION update_agent_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_agent_configs_updated_at
    BEFORE UPDATE ON agent_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_agent_configs_updated_at();

-- 插入默认智能体配置
INSERT INTO agent_configs (agent_id, agent_name, description, category, priority, enabled)
VALUES
    ('technical', '技术分析智能体', '分析技术指标、趋势、支撑阻力位', 'technical', 10, TRUE),
    ('onchain', '链上数据智能体', '分析链上数据、巨鲸动向、交易所流动', 'onchain', 9, TRUE),
    ('playbook', '剧本推演智能体', '识别庄家操盘手法，推演剧本阶段', 'market', 8, TRUE),
    ('risk', '风险预警智能体', '监控风险指标，触发预警', 'risk', 7, TRUE),
    ('orderbook', '订单簿分析智能体', '分析订单簿微观结构，识别操纵行为', 'market', 6, TRUE),
    ('sentiment', '舆情分析智能体', '监控社交媒体情绪，识别 FUD/FOMO', 'market', 5, FALSE),
    ('news_analyst', '新闻分析智能体', '分析新闻事件，评估市场影响', 'market', 4, TRUE),
    ('calendar', '日历事件智能体', '分析即将到来的事件，评估价格影响', 'market', 3, TRUE),
    ('adversarial', '对抗推演智能体', '从对手角度推演，发现盲点', 'risk', 2, FALSE),
    ('collusion_detector', '合谋检测智能体', '检测多方合谋操纵行为', 'risk', 1, FALSE)
ON CONFLICT (agent_id) DO NOTHING;

-- 添加注释
COMMENT ON TABLE agent_configs IS '智能体配置表';
COMMENT ON COLUMN agent_configs.agent_id IS '智能体 ID';
COMMENT ON COLUMN agent_configs.agent_name IS '智能体名称';
COMMENT ON COLUMN agent_configs.description IS '智能体描述';
COMMENT ON COLUMN agent_configs.category IS '智能体分类（technical/onchain/market/risk）';
COMMENT ON COLUMN agent_configs.priority IS '优先级（数字越大优先级越高）';
COMMENT ON COLUMN agent_configs.enabled IS '是否启用';
