"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Key, 
  Cpu, 
  ToggleRight, 
  CheckCircle2, 
  ChevronRight, 
  ChevronLeft, 
  Loader2, 
  Activity, 
  ShieldCheck, 
  Globe,
  Database,
  RefreshCw,
  Info
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchConfigs, updateConfig, createConfig, type SystemConfig } from "@/lib/api/configs";
import { authFetch } from "@/lib/api/auth";

interface WizardStepProps {
  onNext: () => void;
  onPrev: () => void;
  data: any;
  setData: (data: any) => void;
}

// ── Step 1: API Keys ──────────────────────────────────────────

function StepApiKeys({ onNext, onPrev, data, setData }: WizardStepProps) {
  const t = useTranslations("admin.wizard");
  const tSetup = useTranslations("admin.setup.wizard");
  const [verifying, setVerifying] = useState<string | null>(null);
  const [verifyStatus, setVerifyStatus] = useState<Record<string, 'success' | 'failed' | null>>({});

  const API_KEYS = [
    { key: "binance_api_key", label: "Binance API Key", secret: true, category: "exchanges" },
    { key: "binance_api_secret", label: "Binance API Secret", secret: true, category: "exchanges" },
    { key: "coinglass_api_key", label: "CoinGlass API Key", secret: true, category: "datasources" },
    { key: "dmx_api_key", label: "DMXAPI Key", secret: true, category: "ai" },
  ];

  const handleVerify = async (key: string) => {
    setVerifying(key);
    // TODO: Implement actual verification logic via backend
    await new Promise(r => setTimeout(r, 1500));
    setVerifyStatus(prev => ({ ...prev, [key]: 'success' }));
    setVerifying(null);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {API_KEYS.map((item) => (
          <div key={item.key} className="space-y-2">
            <label className="text-sm font-medium text-zinc-400">{item.label}</label>
            <div className="relative group">
              <input
                type={item.secret ? "password" : "text"}
                value={data[item.key] || ""}
                onChange={(e) => setData({ ...data, [item.key]: e.target.value })}
                className="w-full bg-zinc-900/50 border border-zinc-800 focus:border-emerald-500/50 rounded-lg px-4 py-2.5 outline-none transition-all pr-12"
                placeholder={t('enterKey', { label: item.label })}
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {verifyStatus[item.key] === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                <button
                  onClick={() => handleVerify(item.key)}
                  disabled={!data[item.key] || verifying === item.key}
                  className="p-1.5 hover:bg-zinc-800 rounded-md transition-colors disabled:opacity-30"
                >
                  {verifying === item.key ? (
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                  ) : (
                    <RefreshCw className="w-4 h-4 text-zinc-500" />
                  )}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-xl flex gap-3">
        <Info className="w-5 h-5 text-emerald-500 shrink-0" />
        <p className="text-xs text-zinc-400 leading-relaxed">
          {tSetup('step1Desc')} {t('encryptionNote')}
        </p>
      </div>
    </div>
  );
}

// ── Step 2: Model Routing ─────────────────────────────────────

function StepModels({ onNext, onPrev, data, setData }: WizardStepProps) {
  const t = useTranslations("admin.wizard");
  
  const { data: availableModelsData } = useQuery({
    queryKey: ["admin-available-models"],
    queryFn: async () => {
      const res = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/models/available`);
      return res.json();
    }
  });

  const tW = useTranslations("admin.wizard");
  const CORE_AGENTS = [
    { id: "technical" as const },
    { id: "onchain" as const },
    { id: "sentiment" as const },
    { id: "adversarial" as const },
  ];

  const models = availableModelsData?.models || [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {CORE_AGENTS.map((agent) => (
          <div key={agent.id} className="space-y-2">
            <label className="text-sm font-medium text-zinc-400">{tW(`agents.${agent.id}`)}</label>
            <select
              value={data[`model_route:${agent.id}`] || ""}
              onChange={(e) => setData({ ...data, [`model_route:${agent.id}`]: e.target.value })}
              className="w-full bg-zinc-900/50 border border-zinc-800 focus:border-emerald-500/50 rounded-lg px-4 py-2.5 outline-none transition-all appearance-none"
            >
              <option value="">{tW('selectModel')}</option>
              {models.map((m: any) => (
                <option key={m.model_key} value={m.model_key}>
                  {m.display_name} ({m.model_name})
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Step 3: Feature Flags ─────────────────────────────────────

function StepFeatures({ onNext, onPrev, data, setData }: WizardStepProps) {
  const t = useTranslations("admin.wizard");
  
  const FEATURES = [
    { key: "adversarial" as const, configKey: "adversarial_feature_enabled" },
    { key: "leaderboard" as const, configKey: "leaderboard_feature_enabled" },
    { key: "task" as const, configKey: "task_feature_enabled" },
    { key: "partner" as const, configKey: "partner_feature_enabled" },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {FEATURES.map((f) => (
        <div 
          key={f.key}
          onClick={() => setData({ ...data, [f.configKey]: data[f.configKey] === "active" ? "hidden" : "active" })}
          className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
            data[f.configKey] === "active" 
              ? "bg-emerald-500/10 border-emerald-500/30 ring-1 ring-emerald-500/20" 
              : "bg-zinc-900/50 border-zinc-800 hover:border-zinc-700"
          }`}
        >
          <div className="flex items-center gap-3">
            <ToggleRight className={`w-5 h-5 ${data[f.configKey] === "active" ? "text-emerald-500" : "text-zinc-500"}`} />
            <span className={`font-medium ${data[f.configKey] === "active" ? "text-emerald-400" : "text-zinc-400"}`}>
              {t(`featureLabels.${f.key}`)}
            </span>
          </div>
          <div className={`w-2 h-2 rounded-full ${data[f.configKey] === "active" ? "bg-emerald-500" : "bg-zinc-700"}`} />
        </div>
      ))}
    </div>
  );
}

// ── Main Wizard Component ─────────────────────────────────────

export default function SetupWizard({ onFinish }: { onFinish?: () => void }) {
  const t = useTranslations("admin.wizard");
  const [step, setStep] = useState(0);
  const [data, setData] = useState<any>({
    adversarial_feature_enabled: "active",
    leaderboard_feature_enabled: "active",
    task_feature_enabled: "active",
    partner_feature_enabled: "active",
  });
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  const steps = [
    { title: t('welcome'), desc: t('welcomeDesc'), icon: Globe, component: null },
    { title: t('step1'), desc: t('step1Desc'), icon: Key, component: StepApiKeys },
    { title: t('step2'), desc: t('step2Desc'), icon: Cpu, component: StepModels },
    { title: t('step3'), desc: t('step3Desc'), icon: ToggleRight, component: StepFeatures },
  ];

  const handleNext = () => setStep(s => Math.min(s + 1, steps.length - 1));
  const handlePrev = () => setStep(s => Math.max(s - 1, 0));

  const handleFinish = async () => {
    setSaving(true);
    try {
      // 遍历所有数据并保存
      const entries = Object.entries(data);
      for (const [key, value] of entries) {
        if (!value) continue;
        
        // 我们需要知道 category
        let category = "general";
        if (key.includes("api_key") || key.includes("secret")) category = "secrets";
        if (key.startsWith("model_route:")) category = "ai_models";
        if (key.endsWith("_feature_enabled")) category = "feature_flags";

        try {
          // 尝试更新，如果 404 则创建
          await updateConfig(key, { value: value as string, is_secret: category === "secrets" });
        } catch (e) {
          await createConfig({ config_key: key, value: value as string, category, is_secret: category === "secrets" });
        }
      }
      
      queryClient.invalidateQueries({ queryKey: ["system-configs"] });
      queryClient.invalidateQueries({ queryKey: ["feature-flags"] });
      
      if (onFinish) onFinish();
    } catch (error) {
      console.error("Wizard Save Error:", error);
    } finally {
      setSaving(false);
    }
  };

  const ActiveStep = steps[step].component;
  const StepIcon = steps[step].icon;

  return (
    <div className="bg-zinc-950/80 backdrop-blur-xl border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl max-w-2xl w-full mx-auto">
      {/* 顶部进度条 */}
      <div className="h-1 bg-zinc-900 overflow-hidden flex">
        {steps.map((_, i) => (
          <div 
            key={i} 
            className={`flex-1 transition-all duration-500 ${i <= step ? "bg-emerald-500" : ""}`} 
          />
        ))}
      </div>

      <div className="p-8 md:p-10 space-y-8">
        {/* Step Header */}
        <div className="flex items-start gap-5">
          <div className="p-3.5 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 ring-4 ring-emerald-500/5">
            <StepIcon className="w-6 h-6 text-emerald-500" />
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl font-bold text-zinc-100 tracking-tight">{steps[step].title}</h2>
            <p className="text-sm text-zinc-400">{steps[step].desc}</p>
          </div>
        </div>

        {/* Step Content */}
        <div className="min-h-[280px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
            >
              {ActiveStep ? (
                <ActiveStep 
                  onNext={handleNext} 
                  onPrev={handlePrev} 
                  data={data} 
                  setData={setData} 
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center space-y-6">
                  <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center ring-8 ring-emerald-500/5">
                    <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                  </div>
                  <div className="space-y-2 max-w-sm">
                    <p className="text-zinc-300 leading-relaxed font-medium">
                      {t('welcomeReady')}
                    </p>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer Actions */}
        <div className="pt-8 border-t border-zinc-900 flex items-center justify-between gap-4">
          <button
            onClick={handlePrev}
            disabled={step === 0 || saving}
            className="px-6 py-2.5 rounded-xl text-sm font-medium text-zinc-400 hover:text-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center gap-2 border border-zinc-800 hover:bg-zinc-900"
          >
            <ChevronLeft className="w-4 h-4" />
            {t('prev')}
          </button>

          <div className="flex items-center gap-3">
             {step < steps.length - 1 ? (
               <button
                 onClick={handleNext}
                 disabled={saving}
                 className="px-8 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-emerald-900/20 transition-all flex items-center gap-2"
               >
                 {t('next')}
                 <ChevronRight className="w-4 h-4" />
               </button>
             ) : (
               <button
                 onClick={handleFinish}
                 disabled={saving}
                 className="px-8 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-900/30 transition-all flex items-center gap-2"
               >
                 {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                 {t('finish')}
               </button>
             )}
          </div>
        </div>
      </div>
    </div>
  );
}
