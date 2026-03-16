"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { 
  Rocket, 
  Target, 
  Cpu, 
  Webhook, 
  MessageSquare, 
  CheckCircle2, 
  ArrowRight, 
  ArrowLeft,
  Server,
  Zap,
  Terminal,
  ActivitySquare,
  Trash2
} from "lucide-react";
import { SymbolSelector } from "@/components/layout/SymbolSelector";

const DEPLOY_LOGS = [
  "Initialize OmniMind runtime environment...",
  "Allocating dedicated vector DB partition [SUCCESS]",
  "Bootstrapping Agent Swarm (NSED Topology) [SUCCESS]",
  "Establishing secure outbound signal tunnels...",
  "Running pre-flight adversarial simulation [PASS]",
  "Autopilot system online. Yielding control to NSED Core."
];

export default function AutopilotsPage() {
  const t = useTranslations("autopilots");
  const locale = useLocale();
  const [currentStep, setCurrentStep] = useState(0);
  
  const STEPS = [
    { id: "target", title: t("steps.target"), icon: Target },
    { id: "engine", title: t("steps.engine"), icon: Cpu },
    { id: "delivery", title: t("steps.delivery"), icon: Webhook },
    { id: "review", title: t("steps.review"), icon: Rocket },
  ];

  // State for config
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [engine, setEngine] = useState("nsed_full");
  const [channels, setChannels] = useState<string[]>([]);
  const [webhookUrl, setWebhookUrl] = useState("");
  
  // Deployment state
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployLogs, setDeployLogs] = useState<string[]>([]);
  const [deployed, setDeployed] = useState(false);
  
  // Active autopilots state
  const [activePilots, setActivePilots] = useState<any[]>([]);
  const [loadingPilots, setLoadingPilots] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchPilots = async () => {
    try {
      setLoadingPilots(true);
      const res = await fetch("/api/autopilots", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` }
      });
      if (res.ok) {
        const data = await res.json();
        setActivePilots(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingPilots(false);
    }
  };

  useEffect(() => {
    fetchPilots();
  }, []);

  const nextStep = () => setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
  const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 0));

  const handleDeploy = async () => {
    setIsDeploying(true);
    setDeployLogs([]);
    
    let currentLog = 0;
    const interval = setInterval(() => {
      setDeployLogs(prev => [...prev, DEPLOY_LOGS[currentLog]]);
      currentLog++;
      if (currentLog >= DEPLOY_LOGS.length - 1) {
        clearInterval(interval);
      }
    }, 600);

    try {
      const res = await fetch("/api/autopilots/deploy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        },
        body: JSON.stringify({
          symbol,
          engine,
          channels,
          webhook_url: webhookUrl,
        }),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      clearInterval(interval);
      setDeployLogs(prev => [...prev, DEPLOY_LOGS[DEPLOY_LOGS.length - 1]]);
      setTimeout(() => {
        setDeployed(true);
        fetchPilots();
      }, 800);

    } catch (e: any) {
      clearInterval(interval);
      console.error(e);
      setDeployLogs(prev => [...prev, `[ERROR] Deployment failed: ${e.message || "Unknown Error"}`]);
      setIsDeploying(false);
    }
  };

  const handleDeletePilot = async (pilotId: string) => {
    if (!confirm(t("active.deleteConfirm"))) return;
    setDeletingId(pilotId);
    try {
      const res = await fetch(`/api/alerts/rules/${pilotId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` },
      });
      if (res.ok) {
        fetchPilots();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex-1 space-y-8 p-6 lg:p-10 max-w-5xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col items-start gap-4 border-b border-white/[0.08] pb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
            <Rocket className="text-indigo-400" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">{t("title")}</h1>
            <p className="text-sm text-zinc-400 mt-1">{t("subtitle")}</p>
          </div>
        </div>
      </div>

      {/* Stepper Header */}
      <div className="relative">
        <div className="absolute top-1/2 left-0 w-full h-[1px] bg-white/[0.08] -translate-y-1/2 z-0" />
        <div className="relative z-10 flex justify-between">
          {STEPS.map((step, idx) => {
            const isActive = idx === currentStep;
            const isCompleted = idx < currentStep;
            const Icon = step.icon;
            
            return (
              <div key={step.id} className="flex flex-col items-center gap-3 bg-[#09090b] px-4">
                <div 
                  className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors duration-500 ${
                    isActive 
                      ? "border-indigo-500 bg-indigo-500/10 text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.2)]" 
                      : isCompleted
                        ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                        : "border-white/[0.08] bg-white/[0.02] text-zinc-500"
                  }`}
                >
                  {isCompleted ? <CheckCircle2 size={20} /> : <Icon size={18} />}
                </div>
                <span className={`text-[11px] font-mono tracking-widest uppercase ${
                  isActive ? "text-indigo-400" : isCompleted ? "text-emerald-400" : "text-zinc-600"
                }`}>
                  {step.title}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Step Content Area */}
      <div className="card p-8 min-h-[400px] border border-white/[0.05] bg-[#09090b]/80 backdrop-blur-xl shadow-2xl relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('/img/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))] opacity-[0.03] z-0" />
        
        <div className="relative z-10 w-full h-full flex flex-col">
          <AnimatePresence mode="wait">
            {/* STEP 1: TARGET */}
            {currentStep === 0 && (
              <motion.div
                key="step0"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col gap-6"
              >
                <div>
                  <h3 className="text-lg font-semibold text-white">{t("step1.title")}</h3>
                  <p className="text-sm text-zinc-400 mt-1">{t("step1.desc")}</p>
                </div>
                <div className="w-full max-w-sm">
                   <SymbolSelector value={symbol} onChange={setSymbol} />
                </div>
                <div className="mt-8 p-4 rounded-lg bg-indigo-500/5 border border-indigo-500/10">
                  <p className="text-sm text-indigo-200">
                    <span className="font-semibold text-indigo-400">{t("step1.tipLabel")}</span> 
                    {t("step1.tip")}
                  </p>
                </div>
              </motion.div>
            )}

            {/* STEP 2: AGENT ENGINE */}
            {currentStep === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col gap-6"
              >
                <div>
                  <h3 className="text-lg font-semibold text-white">{t("step2.title")}</h3>
                  <p className="text-sm text-zinc-400 mt-1">{t("step2.desc")}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                  <div 
                    onClick={() => setEngine("nsed_full")}
                    className={`cursor-pointer border rounded-xl p-5 transition-all ${
                      engine === "nsed_full" 
                        ? "border-emerald-500/50 bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.1)]" 
                        : "border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04]"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className={`p-2 rounded-lg ${engine === "nsed_full" ? "bg-emerald-500/20 text-emerald-400" : "bg-white/5 text-zinc-400"}`}>
                        <Server size={20} />
                      </div>
                      <span className="text-[10px] uppercase font-mono tracking-widest text-zinc-500">{t("step2.nsed.pipeline")}</span>
                    </div>
                    <h4 className={`font-semibold ${engine === "nsed_full" ? "text-emerald-400" : "text-white"}`}>{t("step2.nsed.name")}</h4>
                    <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                      {t("step2.nsed.desc")}
                    </p>
                  </div>

                  <div 
                    onClick={() => setEngine("scalping_fast")}
                    className={`cursor-pointer border rounded-xl p-5 transition-all ${
                      engine === "scalping_fast" 
                        ? "border-amber-500/50 bg-amber-500/10 shadow-[0_0_20px_rgba(245,158,11,0.1)]" 
                        : "border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04]"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className={`p-2 rounded-lg ${engine === "scalping_fast" ? "bg-amber-500/20 text-amber-400" : "bg-white/5 text-zinc-400"}`}>
                        <Zap size={20} />
                      </div>
                      <span className="text-[10px] uppercase font-mono tracking-widest text-zinc-500">{t("step2.scalping.pipeline")}</span>
                    </div>
                    <h4 className={`font-semibold ${engine === "scalping_fast" ? "text-amber-400" : "text-white"}`}>{t("step2.scalping.name")}</h4>
                    <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                      {t("step2.scalping.desc")}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* STEP 3: DELIVERY */}
            {currentStep === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col gap-6"
              >
                <div>
                  <h3 className="text-lg font-semibold text-white">{t("step3.title")}</h3>
                  <p className="text-sm text-zinc-400 mt-1">{t("step3.desc")}</p>
                </div>

                <div className="space-y-4">
                  {/* Discord/Slack */}
                  <div className="flex items-center gap-4 border border-white/[0.08] bg-white/[0.02] p-4 rounded-xl">
                     <div className="p-2 bg-[#5865F2]/20 rounded-lg text-[#5865F2]"><MessageSquare size={20} /></div>
                     <div className="flex-1">
                       <h4 className="text-sm font-semibold text-white">{t("step3.discord.name")}</h4>
                       <p className="text-xs text-zinc-500">{t("step3.discord.desc")}</p>
                     </div>
                     <button 
                       onClick={() => setChannels(c => c.includes("discord") ? c.filter(x => x !== "discord") : [...c, "discord"])}
                       className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                         channels.includes("discord") ? "bg-[#5865F2] text-white" : "bg-white/10 text-zinc-400 hover:bg-white/20"
                       }`}
                     >
                       {channels.includes("discord") ? t("step3.selected") : t("step3.select")}
                     </button>
                  </div>

                  {/* Webhook */}
                  <div className="flex flex-col gap-3 border border-white/[0.08] bg-white/[0.02] p-4 rounded-xl transition-all">
                     <div className="flex items-center gap-4">
                       <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400"><Webhook size={20} /></div>
                       <div className="flex-1">
                         <h4 className="text-sm font-semibold text-white">{t("step3.webhook.name")}</h4>
                         <p className="text-xs text-zinc-500">{t("step3.webhook.desc")}</p>
                       </div>
                       <button 
                         onClick={() => setChannels(c => c.includes("webhook") ? c.filter(x => x !== "webhook") : [...c, "webhook"])}
                         className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                           channels.includes("webhook") ? "bg-emerald-500 text-black" : "bg-white/10 text-zinc-400 hover:bg-white/20"
                         }`}
                       >
                         {channels.includes("webhook") ? t("step3.selected") : t("step3.select")}
                       </button>
                     </div>
                     
                     <AnimatePresence>
                       {channels.includes("webhook") && (
                         <motion.div
                           initial={{ height: 0, opacity: 0 }}
                           animate={{ height: "auto", opacity: 1 }}
                           exit={{ height: 0, opacity: 0 }}
                           className="overflow-hidden pt-3 border-t border-white/[0.08] mt-1"
                         >
                           <input 
                             type="url" 
                             placeholder={t("step3.webhook.placeholder")}
                             value={webhookUrl}
                             onChange={(e) => setWebhookUrl(e.target.value)}
                             className="w-full bg-[#09090b] border border-white/[0.1] rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                           />
                         </motion.div>
                       )}
                     </AnimatePresence>
                  </div>
                </div>

              </motion.div>
            )}

            {/* STEP 4: REVIEW */}
            {currentStep === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col gap-6"
              >
                <div className="text-center py-6">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 mb-4">
                    <Rocket size={32} className="text-emerald-400" />
                  </div>
                  <h3 className="text-xl font-bold text-white tracking-tight">{t("step4.title")}</h3>
                  <p className="text-sm text-zinc-400 mt-2 max-w-sm mx-auto">
                    {t("step4.desc")}
                  </p>
                </div>

                <div className="bg-black/40 rounded-xl p-5 border border-white/[0.04] space-y-4">
                  <div className="flex justify-between items-center pb-4 border-b border-white/[0.04]">
                    <span className="text-zinc-500 text-sm">{t("step4.labelTarget")}</span>
                    <span className="text-white font-mono">{symbol}</span>
                  </div>
                  <div className="flex justify-between items-center pb-4 border-b border-white/[0.04]">
                    <span className="text-zinc-500 text-sm">{t("step4.labelArch")}</span>
                    <span className="text-emerald-400 font-semibold">{engine === "nsed_full" ? t("step2.nsed.name") : t("step2.scalping.name")}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500 text-sm">{t("step4.labelChannels")}</span>
                    <span className="text-white text-sm">
                      {channels.length === 0 ? t("step4.dashboardOnly") : channels.join(", ").toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Deployment Terminal Animation */}
                <AnimatePresence>
                  {isDeploying && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      className="mt-4 border border-indigo-500/20 bg-black/60 rounded-xl p-4 overflow-hidden relative"
                    >
                      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-50"></div>
                      <div className="flex items-center gap-2 mb-3">
                        <Terminal size={14} className="text-indigo-400" />
                        <span className="text-[10px] text-indigo-400 font-mono tracking-wider uppercase">{t("terminal.title")}</span>
                      </div>
                      <div className="space-y-2 font-mono text-xs">
                        {deployLogs.map((log, idx) => (
                          <motion.div
                            key={idx}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className={`${log.includes("SUCCESS") || log.includes("PASS") || log.includes("online") ? "text-emerald-400" : "text-zinc-400"}`}
                          >
                            <span className="text-zinc-600 mr-2">{'>'}</span>{log}
                          </motion.div>
                        ))}
                        {!deployed && deployLogs.length < DEPLOY_LOGS.length && (
                          <motion.div
                            animate={{ opacity: [1, 0, 1] }}
                            transition={{ repeat: Infinity, duration: 1 }}
                            className="w-2 h-3 bg-indigo-500 mt-1"
                          />
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {deployed && (
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="flex justify-center mt-4"
                  >
                    <Link href={`/${locale}/adversarial`} className="px-6 py-2 bg-emerald-500 text-black text-sm font-bold rounded-lg hover:bg-emerald-400 transition-colors">
                      {t("step4.goCommand")}
                    </Link>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Stepper Footer / Controls */}
          <div className="mt-auto pt-8 flex items-center justify-between border-t border-white/[0.04]">
            <button
              onClick={prevStep}
              disabled={currentStep === 0 || isDeploying}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                currentStep === 0 || isDeploying
                  ? "text-zinc-700 cursor-not-allowed" 
                  : "text-zinc-300 hover:text-white hover:bg-white/10"
              }`}
            >
              <ArrowLeft size={16} />
              {t("controls.back")}
            </button>
            
            {currentStep < STEPS.length - 1 ? (
              <button
                onClick={nextStep}
                className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-white text-black text-sm font-bold hover:bg-zinc-200 transition-colors shadow-[0_0_20px_rgba(255,255,255,0.2)]"
              >
              {t("controls.continue")}
              <ArrowRight size={16} />
              </button>
            ) : (
              <button
                onClick={handleDeploy}
                disabled={isDeploying || deployed}
                className={`flex items-center gap-2 px-8 py-2.5 rounded-lg text-sm font-bold transition-all shadow-[0_0_20px_rgba(79,70,229,0.4)] ${
                  deployed ? "bg-emerald-500 text-black shadow-[0_0_20px_rgba(16,185,129,0.4)] cursor-not-allowed" : 
                  isDeploying ? "bg-indigo-600/50 text-white/50 cursor-wait" : 
                  "bg-indigo-600 text-white hover:bg-indigo-500"
                }`}
              >
                {deployed ? <CheckCircle2 size={16} /> : <Zap size={16} />}
                {deployed ? t("controls.deployed") : isDeploying ? t("controls.deploying") : t("controls.deploy")}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Active Operations Section */}
      <div className="pt-8 border-t border-white/[0.08] mt-8">
        <div className="flex items-center gap-3 mb-6">
          <ActivitySquare className="text-emerald-400" size={20} />
          <h2 className="text-xl font-bold text-white tracking-tight">{t("active.title")}</h2>
        </div>
        
        {loadingPilots ? (
          <div className="flex items-center justify-center h-32 border border-white/[0.05] bg-[#09090b]/80 rounded-xl">
            <span className="text-zinc-500 text-sm animate-pulse">{t("active.scanning")}</span>
          </div>
        ) : activePilots.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 border border-white/[0.05] bg-[#09090b]/80 rounded-xl text-center px-4">
            <Server className="text-zinc-600 mb-2" size={24} />
            <p className="text-sm text-zinc-400">{t("active.empty")}</p>
            <p className="text-xs text-zinc-600 mt-1">{t("active.emptyHint")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activePilots.map((pilot) => (
              <div key={pilot.id} className="relative overflow-hidden flex flex-col p-5 border border-white/[0.08] bg-[#09090b]/80 rounded-xl hover:bg-white/[0.02] transition-colors group">
                <div className="absolute top-0 left-0 w-[2px] h-full bg-emerald-500/50" />
                
                <div className="flex justify-between items-start mb-4 pl-2">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-emerald-400 font-mono tracking-widest uppercase mb-1 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      {t("active.online")}
                    </span>
                    <h4 className="text-base font-bold text-white tracking-tight">{pilot.name.replace("Autopilot: ", "")}</h4>
                  </div>
                  <div className="text-xs font-mono text-zinc-500 bg-white/5 px-2 py-1 rounded">
                    {pilot.symbol}
                  </div>
                </div>

                <div className="flex flex-col gap-2 pl-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-500">{t("active.channels")}</span>
                    <span className="text-zinc-300">{pilot.notify_channels?.join(", ") || "—"}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-500">{t("active.uptime")}</span>
                    <span className="text-zinc-300">{new Date(pilot.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                
                <div className="mt-5 pt-3 border-t border-white/[0.04] pl-2 flex justify-between items-center">
                   <span className="text-[10px] text-zinc-500">ID: {pilot.id.substring(0,8)}...</span>
                   <button
                     onClick={() => handleDeletePilot(pilot.id)}
                     disabled={deletingId === pilot.id}
                     className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-40"
                   >
                     <Trash2 size={12} />
                     {t("active.delete")}
                   </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
