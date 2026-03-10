"use client";
import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import type { AlertRuleCreate, AlertRuleUpdate, AlertRuleResponse, Condition, ConditionExpression, MetricType, Operator, LogicGroup } from "@/lib/api/alerts";

interface AlertRuleFormProps {
  mode: "create" | "edit";
  initialData?: AlertRuleResponse;
  onSubmit: (data: AlertRuleCreate | AlertRuleUpdate) => Promise<void>;
  onCancel?: () => void;
}

const METRICS: MetricType[] = ["price","rsi","macd","ema","bb_upper","bb_lower","exchange_netflow","whale_change_24h","fear_greed_index","mvrv","funding_rate"];
const OPS: Operator[] = ["gt","lt","gte","lte","cross_above","cross_below"];
const SC = "bg-white/[0.06] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-[#2A6DFF] min-w-[140px]";
const IC = "bg-white/[0.06] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-[#2A6DFF]";

function emptyCond(): Condition { return { metric: "price", operator: "gt", threshold: 0 }; }
function emptyExpr(): ConditionExpression { return { logic: "and", conditions: [emptyCond()], sub_groups: [] }; }

interface ConditionRowProps { condition: Condition; onChange: (c: Condition) => void; onRemove: () => void; canRemove: boolean; }
function ConditionRow({ condition, onChange, onRemove, canRemove }: ConditionRowProps) {
  const t = useTranslations('alerts');
  
  const METRIC_LABELS: Record<MetricType, string> = {
    price: t('metrics.price'), rsi: t('metrics.rsi'), macd: t('metrics.macd'), ema: t('metrics.ema'),
    bb_upper: t('metrics.bb_upper'), bb_lower: t('metrics.bb_lower'),
    exchange_netflow: t('metrics.exchange_netflow'), whale_change_24h: t('metrics.whale_change_24h'),
    fear_greed_index: t('metrics.fear_greed_index'), mvrv: t('metrics.mvrv'), funding_rate: t('metrics.funding_rate'),
  };
  
  const OPERATOR_LABELS: Record<Operator, string> = {
    gt: t('operators.gt'), lt: t('operators.lt'), gte: t('operators.gte'),
    lte: t('operators.lte'), cross_above: t('operators.cross_above'), cross_below: t('operators.cross_below'),
  };
  
  return (
    <motion.div layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex items-center gap-2 flex-wrap">
      <select value={condition.metric} onChange={(e) => onChange({ ...condition, metric: e.target.value as MetricType })} className={SC}>
        {METRICS.map((m) => <option key={m} value={m} className="bg-[#0A0F1B]">{METRIC_LABELS[m]}</option>)}
      </select>
      <select value={condition.operator} onChange={(e) => onChange({ ...condition, operator: e.target.value as Operator })} className={SC}>
        {OPS.map((op) => <option key={op} value={op} className="bg-[#0A0F1B]">{OPERATOR_LABELS[op]}</option>)}
      </select>
      <input type="number" step="any" value={condition.threshold} onChange={(e) => onChange({ ...condition, threshold: parseFloat(e.target.value) || 0 })} placeholder={t('validation.thresholdPlaceholder')} className={`${IC} w-[120px] font-mono`} />
      {canRemove && <button type="button" onClick={onRemove} className="text-gray-500 hover:text-[#FF3B6F] transition-colors p-1" aria-label={t('actions.removeCondition')}><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></button>}
    </motion.div>
  );
}

interface ConditionGroupProps { expression: ConditionExpression; onChange: (e: ConditionExpression) => void; depth: number; onRemoveGroup?: () => void; }
function ConditionGroup({ expression, onChange, depth, onRemoveGroup }: ConditionGroupProps) {
  const t = useTranslations('alerts');
  
  const updateCond = useCallback((i: number, c: Condition) => { const n = [...expression.conditions]; n[i] = c; onChange({ ...expression, conditions: n }); }, [expression, onChange]);
  const removeCond = useCallback((i: number) => { const n = expression.conditions.filter((_: Condition, x: number) => x !== i); onChange({ ...expression, conditions: n.length > 0 ? n : [emptyCond()] }); }, [expression, onChange]);
  const addCond = useCallback(() => { if (expression.conditions.length >= 10) return; onChange({ ...expression, conditions: [...expression.conditions, emptyCond()] }); }, [expression, onChange]);
  const toggleLogic = useCallback(() => { onChange({ ...expression, logic: (expression.logic === "and" ? "or" : "and") as LogicGroup }); }, [expression, onChange]);
  const addSub = useCallback(() => { if (depth >= 1 || expression.sub_groups.length >= 2) return; onChange({ ...expression, sub_groups: [...expression.sub_groups, emptyExpr()] }); }, [expression, depth, onChange]);
  const updateSub = useCallback((i: number, u: ConditionExpression) => { const n = [...expression.sub_groups]; n[i] = u; onChange({ ...expression, sub_groups: n }); }, [expression, onChange]);
  const removeSub = useCallback((i: number) => { onChange({ ...expression, sub_groups: expression.sub_groups.filter((_: ConditionExpression, x: number) => x !== i) }); }, [expression, onChange]);
  const lc = expression.logic === "and" ? "bg-[#2A6DFF]/20 text-[#2A6DFF] border border-[#2A6DFF]/30" : "bg-[#00F5A0]/20 text-[#00F5A0] border border-[#00F5A0]/30";
  
  return (
    <div className={`rounded-lg border border-white/[0.08] p-4 ${depth > 0 ? "bg-white/[0.02] ml-4 mt-3" : "bg-white/[0.03]"}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 uppercase tracking-wider">{depth > 0 ? t('form.subConditionGroup') : t('form.conditionGroup')}</span>
          <button type="button" onClick={toggleLogic} className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${lc}`}>{expression.logic === "and" ? t('logic.and') : t('logic.or')}</button>
        </div>
        {onRemoveGroup && <button type="button" onClick={onRemoveGroup} className="text-xs text-gray-500 hover:text-[#FF3B6F] transition-colors">{t('actions.removeSubGroup')}</button>}
      </div>
      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {expression.conditions.map((cond: Condition, i: number) => <ConditionRow key={`c-${depth}-${i}`} condition={cond} onChange={(u: Condition) => updateCond(i, u)} onRemove={() => removeCond(i)} canRemove={expression.conditions.length > 1} />)}
        </AnimatePresence>
      </div>
      <div className="flex items-center gap-3 mt-3">
        {expression.conditions.length < 10 && <button type="button" onClick={addCond} className="text-xs text-[#2A6DFF] hover:text-[#2A6DFF]/80 transition-colors">{t('actions.addCondition')}</button>}
        {depth < 1 && expression.sub_groups.length < 2 && <button type="button" onClick={addSub} className="text-xs text-gray-400 hover:text-gray-300 transition-colors">{t('actions.addSubGroup')}</button>}
      </div>
      {expression.sub_groups.map((sg: ConditionExpression, i: number) => <ConditionGroup key={`s-${i}`} expression={sg} onChange={(u: ConditionExpression) => updateSub(i, u)} depth={depth + 1} onRemoveGroup={() => removeSub(i)} />)}
    </div>
  );
}

export function AlertRuleForm({ mode, initialData, onSubmit, onCancel }: AlertRuleFormProps) {
  const t = useTranslations('alerts');
  const [name, setName] = useState(initialData?.name ?? "");
  const [symbol, setSymbol] = useState(initialData?.symbol ?? "BTCUSDT");
  const [expression, setExpression] = useState<ConditionExpression>(initialData?.expression ?? emptyExpr());
  const [channels, setChannels] = useState<string[]>(initialData?.notify_channels ?? ["websocket"]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const CHS: { value: string; label: string }[] = [
    { value: "websocket", label: t('channels.websocket') },
    { value: "telegram", label: t('channels.telegram') },
    { value: "email", label: t('channels.email') }
  ];
  
  const toggleCh = useCallback((ch: string) => { setChannels((p) => p.includes(ch) ? p.filter((c) => c !== ch) : [...p, ch]); }, []);
  const validate = useCallback((): string | null => {
    if (!name.trim()) return t('validation.nameRequired');
    if (!symbol.trim()) return t('validation.symbolRequired');
    if (expression.conditions.length === 0) return t('validation.conditionsRequired');
    if (channels.length === 0) return t('validation.channelsRequired');
    return null;
  }, [name, symbol, expression, channels, t]);
  
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
      setError(submitErr instanceof Error ? submitErr.message : t('error.submitFailed'));
    } finally {
      setSubmitting(false);
    }
  }, [mode, name, symbol, expression, channels, validate, onSubmit, t]);
  
  return (
    <motion.form initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} onSubmit={handleSubmit} className="backdrop-blur-md bg-white/[0.04] border border-white/[0.08] rounded-xl p-6 space-y-5">
      <h3 className="text-sm font-medium text-gray-300 tracking-wide">{mode === "create" ? t('form.createTitle') : t('form.editTitle')}</h3>
      <AnimatePresence>
        {error && (<motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="rounded-lg bg-[#FF3B6F]/10 border border-[#FF3B6F]/20 px-4 py-2 text-xs text-[#FF3B6F]">{error}</motion.div>)}
      </AnimatePresence>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">{t('form.ruleName')}</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('form.ruleNamePlaceholder')} maxLength={100} className={`${IC} w-full`} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">{t('form.symbol')}</label>
          <input type="text" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder={t('form.symbolPlaceholder')} maxLength={20} disabled={mode === "edit"} className={`${IC} w-full uppercase ${mode === "edit" ? "opacity-50 cursor-not-allowed" : ""}`} />
        </div>
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-2">{t('form.conditions')}</label>
        <ConditionGroup expression={expression} onChange={setExpression} depth={0} />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-2">{t('form.notifyChannels')}</label>
        <div className="flex items-center gap-3 flex-wrap">
          {CHS.map((ch) => { const a = channels.includes(ch.value); return (
            <button key={ch.value} type="button" onClick={() => toggleCh(ch.value)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${a ? "bg-[#2A6DFF]/20 text-[#2A6DFF] border-[#2A6DFF]/30" : "bg-white/[0.04] text-gray-500 border-white/[0.08] hover:text-gray-300"}`}>{ch.label}</button>
          ); })}
        </div>
      </div>
      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={submitting} className="px-5 py-2 rounded-lg bg-[#2A6DFF] text-white text-sm font-medium hover:bg-[#2A6DFF]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{submitting ? t('form.submitting') : mode === "create" ? t('form.submitCreate') : t('form.submitEdit')}</button>
        {onCancel && <button type="button" onClick={onCancel} className="px-5 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-200 transition-colors">{t('form.cancel')}</button>}
      </div>
    </motion.form>
  );
}
