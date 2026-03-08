"use client";
import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AlertRuleCreate, AlertRuleUpdate, AlertRuleResponse, Condition, ConditionExpression, MetricType, Operator, LogicGroup } from "@/lib/api/alerts";

interface AlertRuleFormProps {
  mode: "create" | "edit";
  initialData?: AlertRuleResponse;
  onSubmit: (data: AlertRuleCreate | AlertRuleUpdate) => Promise<void>;
  onCancel?: () => void;
}

const METRIC_LABELS: Record<MetricType, string> = {
  price: "价格", rsi: "RSI", macd: "MACD", ema: "EMA",
  bb_upper: "布林带上轨", bb_lower: "布林带下轨",
  exchange_netflow: "交易所净流入", whale_change_24h: "巨鲸持仓变化",
  fear_greed_index: "恐慌贪婪指数", mvrv: "MVRV", funding_rate: "资金费率",
};
const OPERATOR_LABELS: Record<Operator, string> = {
  gt: "大于 (>)", lt: "小于 (<)", gte: "大于等于 ()",
  lte: "小于等于 (≤)", cross_above: "穿越上方 (↑)", cross_below: "穿越下方 (↓)",
};
const METRICS: MetricType[] = ["price","rsi","macd","ema","bb_upper","bb_lower","exchange_netflow","whale_change_24h","fear_greed_index","mvrv","funding_rate"];
const OPS: Operator[] = ["gt","lt","gte","lte","cross_above","cross_below"];
const CHS: { value: string; label: string }[] = [{ value: "websocket", label: "WebSocket 推送" },{ value: "telegram", label: "Telegram" },{ value: "email", label: "邮件" }];
function emptyCond(): Condition { return { metric: "price", operator: "gt", threshold: 0 }; }
function emptyExpr(): ConditionExpression { return { logic: "and", conditions: [emptyCond()], sub_groups: [] }; }
const SC = "bg-white/[0.06] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-accent min-w-[140px]";
const IC = "bg-white/[0.06] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-accent";

interface ConditionRowProps { condition: Condition; onChange: (c: Condition) => void; onRemove: () => void; canRemove: boolean; }
function ConditionRow({ condition, onChange, onRemove, canRemove }: ConditionRowProps) {
  return (
    <motion.div layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex items-center gap-2 flex-wrap">
      <select value={condition.metric} onChange={(e) => onChange({ ...condition, metric: e.target.value as MetricType })} className={SC}>
        {METRICS.map((m) => <option key={m} value={m} className="bg-bg-primary">{METRIC_LABELS[m]}</option>)}
      </select>
      <select value={condition.operator} onChange={(e) => onChange({ ...condition, operator: e.target.value as Operator })} className={SC}>
        {OPS.map((op) => <option key={op} value={op} className="bg-bg-primary">{OPERATOR_LABELS[op]}</option>)}
      </select>
      <input type="number" step="any" value={condition.threshold} onChange={(e) => onChange({ ...condition, threshold: parseFloat(e.target.value) || 0 })} placeholder="阈值" className={`${IC} w-[120px] font-mono`} />
      {canRemove && <button type="button" onClick={onRemove} className="text-zinc-500 hover:text-bear transition-colors p-1" aria-label="删除条件"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></button>}
    </motion.div>
  );
}

interface ConditionGroupProps { expression: ConditionExpression; onChange: (e: ConditionExpression) => void; depth: number; onRemoveGroup?: () => void; }
function ConditionGroup({ expression, onChange, depth, onRemoveGroup }: ConditionGroupProps) {
  const updateCond = useCallback((i: number, c: Condition) => { const n = [...expression.conditions]; n[i] = c; onChange({ ...expression, conditions: n }); }, [expression, onChange]);
  const removeCond = useCallback((i: number) => { const n = expression.conditions.filter((_: Condition, x: number) => x !== i); onChange({ ...expression, conditions: n.length > 0 ? n : [emptyCond()] }); }, [expression, onChange]);
  const addCond = useCallback(() => { if (expression.conditions.length >= 10) return; onChange({ ...expression, conditions: [...expression.conditions, emptyCond()] }); }, [expression, onChange]);
  const toggleLogic = useCallback(() => { onChange({ ...expression, logic: (expression.logic === "and" ? "or" : "and") as LogicGroup }); }, [expression, onChange]);
  const addSub = useCallback(() => { if (depth >= 1 || expression.sub_groups.length >= 2) return; onChange({ ...expression, sub_groups: [...expression.sub_groups, emptyExpr()] }); }, [expression, depth, onChange]);
  const updateSub = useCallback((i: number, u: ConditionExpression) => { const n = [...expression.sub_groups]; n[i] = u; onChange({ ...expression, sub_groups: n }); }, [expression, onChange]);
  const removeSub = useCallback((i: number) => { onChange({ ...expression, sub_groups: expression.sub_groups.filter((_: ConditionExpression, x: number) => x !== i) }); }, [expression, onChange]);
  const lc = expression.logic === "and" ? "bg-[var(--color-accent)]/20 text-accent border border-accent/30" : "bg-[var(--color-bull)]/20 text-bull border border-[var(--color-bull)]/30";
  return (
    <div className={`rounded-lg border border-white/[0.08] p-4 ${depth > 0 ? "bg-white/[0.02] ml-4 mt-3" : "bg-white/[0.03]"}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">{depth > 0 ? "子条件组" : "条件组"}</span>
          <button type="button" onClick={toggleLogic} className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${lc}`}>{expression.logic === "and" ? "AND（全部满足）" : "OR（任一满足）"}</button>
        </div>
        {onRemoveGroup && <button type="button" onClick={onRemoveGroup} className="text-xs text-zinc-500 hover:text-bear transition-colors">移除子组</button>}
      </div>
      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {expression.conditions.map((cond: Condition, i: number) => <ConditionRow key={`c-${depth}-${i}`} condition={cond} onChange={(u: Condition) => updateCond(i, u)} onRemove={() => removeCond(i)} canRemove={expression.conditions.length > 1} />)}
        </AnimatePresence>
      </div>
      <div className="flex items-center gap-3 mt-3">
        {expression.conditions.length < 10 && <button type="button" onClick={addCond} className="text-xs text-accent hover:text-accent/80 transition-colors">+ 添加条件</button>}
        {depth < 1 && expression.sub_groups.length < 2 && <button type="button" onClick={addSub} className="text-xs text-zinc-400 hover:text-zinc-300 transition-colors">+ 添加子条件组</button>}
      </div>
      {expression.sub_groups.map((sg: ConditionExpression, i: number) => <ConditionGroup key={`s-${i}`} expression={sg} onChange={(u: ConditionExpression) => updateSub(i, u)} depth={depth + 1} onRemoveGroup={() => removeSub(i)} />)}
    </div>
  );
}

export function AlertRuleForm({ mode, initialData, onSubmit, onCancel }: AlertRuleFormProps) {
  const [name, setName] = useState(initialData?.name ?? "");
  const [symbol, setSymbol] = useState(initialData?.symbol ?? "BTCUSDT");
  const [expression, setExpression] = useState<ConditionExpression>(initialData?.expression ?? emptyExpr());
  const [channels, setChannels] = useState<string[]>(initialData?.notify_channels ?? ["websocket"]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggleCh = useCallback((ch: string) => { setChannels((p) => p.includes(ch) ? p.filter((c) => c !== ch) : [...p, ch]); }, []);
  const validate = useCallback((): string | null => {
    if (!name.trim()) return "请输入规则名称";
    if (!symbol.trim()) return "请输入交易对";
    if (expression.conditions.length === 0) return "至少需要一个条件";
    if (channels.length === 0) return "至少选择一个通知渠道";
    return null;
  }, [name, symbol, expression, channels]);
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "create") {
        await onSubmit({ name: name.trim(), symbol: symbol.trim().toUpperCase(), expression, notify_channels: channels } as AlertRuleCreate);
      } else {
        await onSubmit({ name: name.trim(), expression, notify_channels: channels } as AlertRuleUpdate);
      }
    } catch (submitErr) {
      setError(submitErr instanceof Error ? submitErr.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  }, [mode, name, symbol, expression, channels, validate, onSubmit]);
  return (
    <motion.form initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} onSubmit={handleSubmit} className="card-surface rounded-xl p-6 space-y-5">
      <h3 className="text-sm font-medium text-zinc-300 tracking-wide">{mode === "create" ? "创建预警规则" : "编辑预警规则"}</h3>
      <AnimatePresence>
        {error && (<motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="rounded-lg bg-[var(--color-bear)]/10 border border-[var(--color-bear)]/20 px-4 py-2 text-xs text-bear">{error}</motion.div>)}
      </AnimatePresence>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-zinc-500 mb-1">规则名称</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="例：BTC 跌破 60000" maxLength={100} className={`${IC} w-full`} />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">交易对</label>
          <input type="text" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="BTCUSDT" maxLength={20} disabled={mode === "edit"} className={`${IC} w-full uppercase ${mode === "edit" ? "opacity-50 cursor-not-allowed" : ""}`} />
        </div>
      </div>
      <div>
        <label className="block text-xs text-zinc-500 mb-2">预警条件</label>
        <ConditionGroup expression={expression} onChange={setExpression} depth={0} />
      </div>
      <div>
        <label className="block text-xs text-zinc-500 mb-2">通知渠道</label>
        <div className="flex items-center gap-3 flex-wrap">
          {CHS.map((ch) => { const a = channels.includes(ch.value); return (
            <button key={ch.value} type="button" onClick={() => toggleCh(ch.value)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${a ? "bg-[var(--color-accent)]/20 text-accent border-accent/30" : "bg-white/[0.04] text-zinc-500 border-white/[0.08] hover:text-zinc-300"}`}>{ch.label}</button>
          ); })}
        </div>
      </div>
      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={submitting} className="px-5 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent)]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{submitting ? "提交中..." : mode === "create" ? "创建规则" : "保存修改"}</button>
        {onCancel && <button type="button" onClick={onCancel} className="px-5 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 transition-colors">取消</button>}
      </div>
    </motion.form>
  );
}
