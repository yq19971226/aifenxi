import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  BarChart3,
  BookOpen,
  Bot,
  Brain,
  Clock,
  Database,
  Eye,
  Link,
  Newspaper,
  Shield,
  Swords,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";

// ── Field label mapping ──────────────────────────────────────

export const FIELD_LABELS: Record<string, string> = {
  // ── 通用 ──
  signal: "信号方向",
  confidence: "置信度",
  reasoning: "分析逻辑",
  key_findings: "关键发现",
  raw_data: "详细数据",
  trend: "趋势",
  symbol: "交易对",
  direction: "方向",
  phase: "阶段",
  evidence: "证据",
  warning: "警告",
  warnings: "警告列表",
  description: "描述",
  title: "标题",
  summary: "摘要",
  name: "名称",
  type: "类型",
  status: "状态",
  value: "数值",
  count: "数量",
  score: "评分",
  level: "等级",
  source: "数据源",
  date: "日期",
  time: "时间",
  result: "结果",
  detail: "详情",
  details: "详细信息",
  note: "备注",
  notes: "备注列表",
  message: "消息",
  error: "错误",
  // ── 支撑/阻力 ──
  support_levels: "支撑位",
  resistance_levels: "阻力位",
  // ── K线形态 ──
  patterns: "形态列表",
  pattern_name: "形态名",
  display_name: "名称",
  strength: "强度",
  candle_index: "K线索引",
  // ── FVG 区域 ──
  fvg_list: "FVG 列表",
  gap_high: "缺口上沿",
  gap_low: "缺口下沿",
  gap_size: "缺口大小",
  interval: "周期",
  mitigated: "已回补",
  mitigation_type: "回补类型",
  mitigation_time: "回补时间",
  distance_pct: "距离占比",
  filter_mode: "过滤模式",
  atr_fallback: "ATR回退",
  // ── 订单块 ──
  order_blocks: "订单块",
  ob_type: "订单块类型",
  trigger: "触发条件",
  ob_high: "上沿价格",
  ob_low: "下沿价格",
  phase_context: "阶段背景",
  phase_confidence: "阶段置信度",
  whale_confirmed: "巨鲸确认",
  // ── 操盘阶段 ──
  current_phase: "当前阶段",
  transition: "阶段转换",
  // ── 策略 ──
  strategy: "策略",
  entry_low: "入场低点",
  entry_high: "入场高点",
  stop_loss: "止损",
  targets: "目标位",
  valid_until: "有效期至",
  snapped_fields: "校准字段",
  is_fallback: "降级模式",
  validation_applied: "已校验",
  discarded_levels: "废弃价位",
  next_likely_move: "预期走势",
  risk_level: "风险等级",
  recommendations: "建议",
  key_risks: "关键风险",
  alerts_count: "预警数",
  alerts: "预警列表",
  published_stream_id: "推送ID",
  published_stream_ids: "推送ID",
  // ── 预警字段 ──
  alert_type: "预警类型",
  // ── 合约数据 ──
  funding_rate: "资金费率",
  predicted_funding_rate: "预测资金费率",
  long_short_ratio: "多空比",
  top_long_short_ratio: "大户多空比",
  liquidation_1h_usd: "1小时爆仓(USD)",
  liquidation_1h_long_pct: "多头爆仓占比",
  long_short_account_ratio: "多空账户比",
  long_short_position_ratio: "多空持仓比",
  top_long_short_account_ratio: "大户多空账户比",
  top_long_short_position_ratio: "大户多空持仓比",
  // ── 试盘检测 ──
  is_trial: "试盘判定",
  probability: "概率",
  trial_type: "试盘类型",
  signals: "信号列表",
  signal_type: "信号类型",
  advice: "建议",
  cooldown_minutes: "冷却时间(分钟)",
  // ── 主力成本区 ──
  vpoc: "主力成本价(VPOC)",
  vah: "价值区上沿(VAH)",
  val: "价值区下沿(VAL)",
  hvn_levels: "高成交量节点",
  lvn_levels: "低成交量节点",
  total_volume: "总成交量",
  bin_count: "分箱数",
  price_range: "价格范围",
  short_term: "短期",
  long_term: "长期",
  // ── 宏观事件 ──
  category: "事件类别",
  impact_score: "影响评分",
  urgency: "紧急程度",
  events: "事件列表",
  total_impact: "总影响",
  total_impact_score: "总影响评分",
  net_direction: "总体方向",
  confidence_modifier: "置信度修正",
  // ── 消息验证 ──
  is_validated: "已验证",
  validation_type: "验证类型",
  // ── 对抗推演 ──
  dealer_intent: "庄家意图",
  predicted_moves: "预测操作",
  danger_zones: "危险区域",
  safe_zones: "安全区域",
  defense_plan: "防御计划",
  action: "操作",
  timeframe: "时间窗口",
  target_price: "目标价位",
  trap_type: "陷阱类型",
  // ── 合谋/舆情 ──
  manipulation_detected: "操纵检测",
  manipulation_type: "操纵类型",
  sentiment_summary: "情绪摘要",
  // ── 链上数据 ──
  exchange_netflow: "交易所净流入",
  whale_change_24h: "巨鲸24h变化",
  fear_greed_index: "恐慌贪婪指数",
  large_tx_count: "大额转账笔数",
  // ── CoinGlass ──
  oi_snapshots: "OI快照",
  cvd_snapshots: "CVD快照",
  netflow_snapshots: "净流入快照",
  large_orders: "大单挂单",
  funding_rate_history: "资金费率历史",
  option_max_pain: "期权Max Pain",
  option_info: "期权概览",
  liquidation: "爆仓数据",
  // ── 订单簿 ──
  manipulation_side: "操纵方向",
  depth_summary: "深度摘要",
  metrics: "指标数据",
  bid_depth_usd: "买盘深度(USD)",
  ask_depth_usd: "卖盘深度(USD)",
  imbalance_ratio: "失衡比",
  largest_order_pct: "最大单笔占比",
  spread_pct: "买卖价差",
  cancel_rate: "撤单率",
  bid_levels: "买盘档位数",
  ask_levels: "卖盘档位数",
  // ── 舆情子字段 ──
  overall_sentiment: "整体情绪",
  mention_volume_change: "提及量变化",
  kol_activity_level: "KOL活跃度",
  // ── 其他 ──
  max_pain_price: "最大痛点价",
  call_oi: "看涨OI",
  put_oi: "看跌OI",
  pc_ratio: "看跌/看涨比",
  timestamp: "时间戳",
  adversarial_analysis: "对抗分析",

  // ══════════════════════════════════════════════════════════
  // ── 新闻分析（NewsAnalystAgent）──
  // ══════════════════════════════════════════════════════════
  news_analysis: "新闻分析",
  total_news_count: "新闻总数",
  news_count: "新闻数量",
  sentiment_distribution: "情绪分布",
  positive: "积极",
  negative: "消极",
  neutral: "中性",
  top_events: "重要事件",
  time_effect: "时间效应",
  credibility: "可信度",
  regulatory_risk: "监管风险",
  market_narrative: "市场叙事",
  // ── 新闻事件类别 ──
  regulatory: "监管政策",
  partnership: "合作公告",
  technical_update: "技术升级",
  exchange_listing: "交易所上线",
  hack_exploit: "黑客攻击",
  macro_economic: "宏观经济",
  whale_movement: "巨鲸动向",
  legal_action: "法律诉讼",
  adoption: "主流采纳",
  other: "其他",
  // ── 时间效应值 ──
  immediate: "即时",

  // ══════════════════════════════════════════════════════════
  // ── 日历事件（CalendarAgent）──
  // ══════════════════════════════════════════════════════════
  upcoming_events: "即将到来的事件",
  events_count: "事件数量",
  days_to_event: "距事件天数",
  vote_count: "投票数",
  high_impact_count: "高影响力事件数",
  event_date: "事件日期",
  proof_link: "证据链接",
  can_occur_before: "可能提前发生",
  positive_vote_count: "正面投票数",
  percentage: "支持比例",
  categories: "分类",

  // ══════════════════════════════════════════════════════════
  // ── 链上深度数据 ──
  // ══════════════════════════════════════════════════════════
  mvrv_z_score: "MVRV Z值",
  mvrv: "MVRV比率",
  nupl: "净未实现盈亏(NUPL)",
  sopr: "花费产出利润率(SOPR)",
  asopr: "调整后SOPR",
  puell_multiple: "Puell倍数",
  reserve_risk: "储备风险",
  accumulation_score: "积累评分",
  active_addresses: "活跃地址数",
  new_addresses: "新增地址数",
  addresses_in_profit_pct: "盈利地址占比",
  exchange_reserve: "交易所储备",
  exchange_balance: "交易所余额",
  stablecoin_flow: "稳定币流入",
  hash_rate: "算力",
  realized_cap: "已实现市值",
  net_unrealized_profit_loss: "净未实现盈亏",

  // ══════════════════════════════════════════════════════════
  // ── 舆情分析（SentimentAgent）──
  // ══════════════════════════════════════════════════════════
  social_dominance: "社交热度占比",
  social_volume: "社交提及量",
  kol_activity: "KOL活跃度",
  fud_fomo_index: "FUD/FOMO指数",
  weighted_sentiment: "加权情绪",
  community_growth: "社区增长",

  // ══════════════════════════════════════════════════════════
  // ── 剧本推演（PlaybookAgent）──
  // ══════════════════════════════════════════════════════════
  dealer_credibility: "庄家可信度",
  defense_feasibility: "防御可行性",
  final_recommendation: "最终建议",
  next_move: "下一步操作",
  risk_alerts: "风险提醒",
  plain_summary: "通俗总结",
  confidence_level: "置信等级",

  // ══════════════════════════════════════════════════════════
  // ── 合谋检测子字段 ──
  // ══════════════════════════════════════════════════════════
  wash_trading_indicators: "对倒交易指标",
  pump_dump_indicators: "拉盘砸盘指标",
  coordination_signals: "协作信号",
  risk_score: "风险评分",
  detection_count: "检测数量",
  severity: "严重程度",

  // ══════════════════════════════════════════════════════════
  // ── AI操盘检测（AiManipulationAgent）──
  // ══════════════════════════════════════════════════════════
  ai_probability: "AI操盘概率",
  operation_mode: "操盘模式",
  detail_scores: "细项评分",
  price_precision: "价格精度",
  time_pattern: "时间模式",
  stop_hunt_efficiency: "猎杀止损效率",
  grind_pattern: "磨盘模式",
  order_behavior: "下单行为",
  cross_sync: "跨品种同步",
  grind_active: "磨盘激活",

  // ── 对倒交易 / 巨鲸联动 ──
  volume_price_divergence: "量价背离",
  symmetric_orders: "对称挂单",
  obv_divergence: "OBV背离",
  sync_detection: "同步运动检测",
  net_flow_direction: "净动态方向",
  entities_involved: "涉及实体",
};

export const HIDDEN_FIELDS = new Set([
  "is_fallback",
  "validation_applied",
  "snapped_fields",
  "discarded_levels",
  "published_stream_id",
  "published_stream_ids",
  "filter_mode",
  "atr_fallback",
]);

export const COLLAPSED_FIELDS = new Set(["raw_data"]);

// ── Section icon mapping ─────────────────────────────────────

export const SECTION_ICONS: Record<string, { icon: LucideIcon; color: string }> = {
  // ── Agent sections (intraday titles) ──
  "技术分析": { icon: BarChart3, color: "text-indigo-400" },
  "链上数据": { icon: Link, color: "text-purple-400" },
  "订单流": { icon: Activity, color: "text-cyan-400" },
  "风险评估": { icon: Shield, color: "text-orange-400" },
  "新闻分析": { icon: Newspaper, color: "text-sky-400" },
  "日历事件": { icon: Clock, color: "text-teal-400" },
  // ── Agent sections (trend titles) ──
  "链上深度解读": { icon: Link, color: "text-purple-400" },
  "订单簿微观结构": { icon: Activity, color: "text-cyan-400" },
  "舆情分析": { icon: Eye, color: "text-amber-400" },
  "剧本推演": { icon: BookOpen, color: "text-violet-400" },
  "对抗推演": { icon: Swords, color: "text-orange-400" },
  "合谋检测": { icon: Brain, color: "text-pink-400" },
  // ── Scalping sections ──
  "技术指标摘要": { icon: BarChart3, color: "text-indigo-400" },
  "K线形态信号": { icon: BarChart3, color: "text-indigo-300" },
  // ── Structure sections ──
  "合约数据": { icon: Database, color: "text-blue-400" },
  "操盘阶段": { icon: Target, color: "text-amber-400" },
  "K线形态": { icon: BarChart3, color: "text-indigo-300" },
  "FVG区域": { icon: Zap, color: "text-yellow-400" },
  "订单块": { icon: Target, color: "text-violet-400" },
  "策略建议": { icon: Target, color: "text-emerald-400" },
  "SMC检测": { icon: Zap, color: "text-yellow-400" },
  // ── New detection sections ──
  "资金费率预警": { icon: AlertTriangle, color: "text-red-400" },
  "试盘检测": { icon: AlertTriangle, color: "text-yellow-400" },
  "主力成本区": { icon: BarChart3, color: "text-blue-300" },
  "消息验证": { icon: ArrowRightLeft, color: "text-sky-300" },
  "宏观事件": { icon: TrendingUp, color: "text-emerald-300" },
  "共识报告": { icon: Brain, color: "text-indigo-300" },
  // ── Legacy (backward compat) ──
  "技术面分析": { icon: BarChart3, color: "text-indigo-400" },
  "链上数据分析": { icon: Link, color: "text-purple-400" },
  "订单簿分析": { icon: Activity, color: "text-cyan-400" },
  "市场情绪分析": { icon: Eye, color: "text-amber-400" },
  "剧本匹配": { icon: BookOpen, color: "text-violet-400" },
  "AI操盘检测": { icon: Bot, color: "text-rose-400" },
};

// ── Section grouping ─────────────────────────────────────────

export const SECTION_GROUPS: { label: string; titles: Set<string> }[] = [
  {
    label: "核心分析",
    titles: new Set([
      "技术分析", "技术指标摘要", "链上数据", "链上深度解读", "订单流", "订单簿微观结构",
      "风险评估", "新闻分析", "日历事件", "舆情分析", "剧本推演",
      "消息验证", "宏观事件", "共识报告",
      "技术面分析", "链上数据分析", "订单簿分析", "市场情绪分析", "剧本匹配",
    ]),
  },
  {
    label: "市场结构",
    titles: new Set(["合约数据", "操盘阶段", "K线形态", "K线形态信号", "FVG区域", "订单块", "SMC检测", "资金费率预警", "试盘检测", "主力成本区"]),
  },
  {
    label: "AI 对抗",
    titles: new Set(["AI操盘检测", "对抗推演", "合谋检测"]),
  },
];

// ── Blocked reason labels ─────────────────────────────────────

export const BLOCKED_REASON_LABELS: Record<string, string> = {
  data_incomplete: "数据不完整",
  capability_missing: "关键能力不可用",
  consensus_divergence_high: "共识分歧过大",
  weekly_bias_conflict: "周线偏差冲突",
  defense_risk_high: "防御风险过高",
  risk_guardrail_triggered: "风控护栏触发",
  timeout: "分析超时",
};

