"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { motion, useInView } from "framer-motion";
import {
  ArrowRight,
  Shield,
  Activity,
  Cpu,
  Search,
  Zap,
  Globe,
} from "lucide-react";
import { LogoMark } from "@/components/ui/Logo";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { useAuth } from "@/lib/auth-context";

// ── Shared Components ──────────────────────────────────────

function FadeIn({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ── Hero Section ───────────────────────────────────────────

function HeroSection() {
  const t = useTranslations("landing");
  const locale = useLocale();

  return (
    <section className="relative min-h-[90vh] flex items-center pt-24 pb-32 overflow-hidden bg-[#09090b]">
      {/* Grid Background */}
      <div className="absolute inset-0 bg-[#09090b]">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
        <div className="absolute top-0 right-0 w-[50vw] h-[50vw] rounded-full bg-indigo-500/10 blur-[120px] -mr-[10vw] -mt-[10vw] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[40vw] h-[40vw] rounded-full bg-emerald-500/5 blur-[120px] -ml-[10vw] -mb-[10vw] pointer-events-none" />
      </div>
      
      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-16 items-center">
        {/* Left: Copy */}
        <div className="max-w-2xl">
          <FadeIn delay={0.1}>
            <div className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/10 text-xs font-bold text-indigo-400 mb-8 shadow-[0_0_20px_rgba(99,102,241,0.1)] uppercase tracking-[0.15em] backdrop-blur-md">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
              </span>
              {t("hero.badge")}
            </div>
          </FadeIn>
          
          <FadeIn delay={0.2}>
            <h1 className="text-5xl sm:text-7xl font-black tracking-tighter text-white mb-6 leading-[1.1]">
              {t("hero.titleLine1")} <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-emerald-400 drop-shadow-[0_0_15px_rgba(99,102,241,0.3)]">
                {t("hero.titleLine2")}
              </span>
            </h1>
          </FadeIn>

          <FadeIn delay={0.3}>
            <p className="text-lg md:text-xl text-zinc-400 mb-10 max-w-lg leading-relaxed font-mono">
              {t("hero.subtitleLine1")}
              <br />
              {t("hero.subtitleLine2")}
            </p>
          </FadeIn>

          <FadeIn delay={0.4}>
            <div className="flex flex-wrap gap-4">
              <Link
                href={`/${locale}/login`}
                className="h-14 px-8 rounded-xl bg-indigo-500 text-white font-black text-sm uppercase tracking-widest flex items-center gap-3 hover:bg-indigo-400 transition-all shadow-[0_0_20px_rgba(99,102,241,0.3)] border border-indigo-400/50 hover:shadow-[0_0_30px_rgba(99,102,241,0.5)]"
              >
                {t("hero.ctaPrimary")} <ArrowRight size={18} />
              </Link>
              <Link
                href={`/${locale}/guide`}
                className="h-14 px-8 rounded-xl border border-white/[0.1] bg-white/[0.02] backdrop-blur-md text-white font-bold text-sm tracking-widest flex items-center hover:bg-white/[0.06] hover:border-white/[0.2] transition-colors"
              >
                {t("cta.guide")}
              </Link>
            </div>
          </FadeIn>
        </div>

        {/* Right: Terminal */}
        <FadeIn delay={0.5} className="hidden lg:block relative">
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-emerald-500/10 rounded-2xl blur-3xl" />
          <TerminalBlock />
        </FadeIn>
      </div>
    </section>
  );
}

function TerminalBlock() {
  const fullLog = [
    "> INITIATING NSED ENGINE...",
    "> CONNECTING TO BINANCE STREAM [WSS]... OK",
    "> CONNECTING TO ONCHAIN NODES... OK",
    "> AGENT[TECHNICAL] ANALYZING BTC/USDT...",
    "> AGENT[ONCHAIN] DETECTED WHALE MOVE (2000 BTC)...",
    "> AGENT[RISK] CALCULATING VOLATILITY...",
    "> ROUND 1 DEBATE: BULLISH (CONFIDENCE 65%)",
    "> ROUND 2 DEBATE: CROSS-EXAMINATION...",
    "> CONSENSUS REACHED: BULLISH (CONFIDENCE 82%)",
    "> GENERATING REPORT #8X29A..."
  ];

  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    if (visibleCount >= fullLog.length) return;
    const timer = setTimeout(() => {
      setVisibleCount((c) => c + 1);
    }, 800);
    return () => clearTimeout(timer);
  }, [visibleCount, fullLog.length]);

  const lines = fullLog.slice(0, visibleCount);

  return (
    <div className="relative rounded-2xl border border-white/[0.1] bg-[#000]/80 backdrop-blur-2xl p-1 font-mono text-sm shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.06] bg-white/[0.02]">
        <div className="flex gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500/80 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
          <div className="w-3 h-3 rounded-full bg-amber-500/80 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
          <div className="w-3 h-3 rounded-full bg-emerald-500/80 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
        </div>
        <div className="ml-2 text-xs font-bold text-zinc-500 uppercase tracking-widest">axiom_core.exe</div>
      </div>
      <div className="p-6 h-[400px] overflow-hidden flex flex-col justify-end text-xs md:text-sm">
        {lines.map((line, i) => {
          const isHighlight = typeof line === "string" && line.includes("CONSENSUS");
          return (
            <div key={i} className={`mb-2.5 ${isHighlight ? 'text-indigo-400 font-bold drop-shadow-[0_0_5px_rgba(99,102,241,0.5)]' : 'text-emerald-400/80'}`}>
              <span className="text-zinc-600 mr-3">{new Date().toLocaleTimeString()}</span>
              {line}
            </div>
          );
        })}
        <div className="animate-pulse text-emerald-400 font-black text-lg ml-16 mt-1">_</div>
      </div>
    </div>
  );
}

// ── Pain Points ─────────────────────────────────────────────

function PainPointsSection() {
  const t = useTranslations("landing.painPoints");
  const items = t.raw("items") as { problem: string; solution: string }[];
  return (
    <section className="py-24 border-t border-white/[0.05] bg-[#09090b]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn>
          <h2 className="text-4xl md:text-5xl font-black mb-16 tracking-tight text-white">{t("title")}</h2>
        </FadeIn>
        <div className="grid md:grid-cols-3 gap-6">
          {(items || []).map((item, i) => (
            <FadeIn key={i} delay={i * 0.1}>
              <div className="p-8 rounded-2xl border border-white/[0.05] bg-white/[0.01] hover:bg-white/[0.03] transition-colors h-full group">
                <p className="text-zinc-500 font-medium mb-4 text-sm tracking-wide">{item.problem}</p>
                <div className="w-12 h-px bg-white/[0.1] mb-4 group-hover:bg-indigo-500/50 transition-colors" />
                <p className="text-white font-bold text-lg">{item.solution}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Capabilities ────────────────────────────────────────────

function CapabilitiesSection() {
  const t = useTranslations("landing.capabilities");
  return (
    <section className="py-24 border-t border-white/[0.05] bg-[#09090b]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn>
          <h2 className="text-4xl md:text-5xl font-black mb-6 tracking-tight text-white">{t("title")}</h2>
          <p className="text-lg text-zinc-400 max-w-2xl mb-16 leading-relaxed font-mono">{t("subtitle")}</p>
        </FadeIn>
        <div className="grid md:grid-cols-3 gap-6">
          <FadeIn delay={0.1}>
            <div className="p-8 rounded-2xl border border-white/[0.05] bg-white/[0.01] hover:bg-white/[0.03] transition-colors h-full">
              <h3 className="text-xl font-bold mb-4 text-white">{t("analysis.title")}</h3>
              <p className="text-sm text-zinc-500 leading-relaxed font-mono">{t("analysis.desc")}</p>
            </div>
          </FadeIn>
          <FadeIn delay={0.2}>
            <div className="p-8 rounded-2xl border border-white/[0.05] bg-white/[0.01] hover:bg-white/[0.03] transition-colors h-full">
              <h3 className="text-xl font-bold mb-4 text-white">{t("consensus.title")}</h3>
              <p className="text-sm text-zinc-500 leading-relaxed font-mono">{t("consensus.desc")}</p>
            </div>
          </FadeIn>
          <FadeIn delay={0.3}>
            <div className="p-8 rounded-2xl border border-white/[0.05] bg-white/[0.01] hover:bg-white/[0.03] transition-colors h-full">
              <h3 className="text-xl font-bold mb-4 text-white">{t("practice.title")}</h3>
              <p className="text-sm text-zinc-500 leading-relaxed font-mono">{t("practice.desc")}</p>
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}

// ── Modes ───────────────────────────────────────────────────

function ModesSection() {
  const t = useTranslations("landing.modes");
  return (
    <section className="py-24 border-t border-white/[0.05] bg-[#09090b] relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-indigo-500/5 blur-[120px] pointer-events-none" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <FadeIn>
          <h2 className="text-4xl md:text-5xl font-black mb-6 tracking-tight text-white">{t("title")}</h2>
          <p className="text-lg text-zinc-400 max-w-2xl mb-16 leading-relaxed font-mono">{t("subtitle")}</p>
        </FadeIn>
        <div className="grid md:grid-cols-3 gap-6">
          <FadeIn delay={0.1}>
            <div className="p-8 rounded-2xl border border-white/[0.05] bg-black/40 backdrop-blur-sm hover:border-indigo-500/30 transition-colors">
              <span className="inline-block text-[10px] font-black font-mono text-indigo-400/80 border border-indigo-500/30 bg-indigo-500/10 px-2 py-1 rounded uppercase tracking-[0.2em] shadow-[0_0_10px_rgba(99,102,241,0.1)]">{t("scalping.tag")}</span>
              <h3 className="text-xl font-bold mt-5 mb-3 text-white">{t("scalping.name")}</h3>
              <p className="text-sm text-zinc-500 leading-relaxed font-mono">{t("scalping.desc")}</p>
            </div>
          </FadeIn>
          <FadeIn delay={0.2}>
            <div className="p-8 rounded-2xl border border-white/[0.05] bg-black/40 backdrop-blur-sm hover:border-emerald-500/30 transition-colors">
              <span className="inline-block text-[10px] font-black font-mono text-emerald-400/80 border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 rounded uppercase tracking-[0.2em] shadow-[0_0_10px_rgba(16,185,129,0.1)]">{t("intraday.tag")}</span>
              <h3 className="text-xl font-bold mt-5 mb-3 text-white">{t("intraday.name")}</h3>
              <p className="text-sm text-zinc-500 leading-relaxed font-mono">{t("intraday.desc")}</p>
            </div>
          </FadeIn>
          <FadeIn delay={0.3}>
            <div className="p-8 rounded-2xl border border-white/[0.05] bg-black/40 backdrop-blur-sm hover:border-amber-500/30 transition-colors">
              <span className="inline-block text-[10px] font-black font-mono text-amber-400/80 border border-amber-500/30 bg-amber-500/10 px-2 py-1 rounded uppercase tracking-[0.2em] shadow-[0_0_10px_rgba(245,158,11,0.1)]">{t("trend.tag")}</span>
              <h3 className="text-xl font-bold mt-5 mb-3 text-white">{t("trend.name")}</h3>
              <p className="text-sm text-zinc-500 leading-relaxed font-mono">{t("trend.desc")}</p>
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}

// ── Product ──────────────────────────────────────────────────

function ProductSection() {
  const t = useTranslations("landing.product");
  const dashboardHighlights = t.raw("dashboard.highlights") as string[];
  const consensusHighlights = t.raw("consensus.highlights") as string[];
  const playbookHighlights = t.raw("playbook.highlights") as string[];
  return (
    <section className="py-24 border-t border-white/[0.05] bg-[#09090b]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn>
          <h2 className="text-4xl md:text-5xl font-black mb-6 tracking-tight text-white">{t("title")}</h2>
          <p className="text-lg text-zinc-400 max-w-2xl mb-16 leading-relaxed font-mono">{t("subtitle")}</p>
        </FadeIn>
        <div className="grid md:grid-cols-3 gap-8">
          <FadeIn delay={0.1}>
            <div className="p-8 rounded-2xl border border-white/[0.05] bg-white/[0.01] hover:bg-white/[0.03] transition-colors h-full flex flex-col group">
              <h3 className="text-xl font-bold mb-4 text-white">{t("dashboard.title")}</h3>
              <p className="text-sm text-zinc-500 leading-relaxed mb-6 flex-1 font-mono">{t("dashboard.desc")}</p>
              <ul className="text-xs text-zinc-400 space-y-2 font-mono">
                {(dashboardHighlights || []).map((h, i) => <li key={i}>· {h}</li>)}
              </ul>
            </div>
          </FadeIn>
          <FadeIn delay={0.2}>
            <div className="p-8 rounded-2xl border border-white/[0.05] bg-white/[0.01] hover:bg-white/[0.03] transition-colors h-full flex flex-col group">
              <h3 className="text-xl font-bold mb-4 text-white">{t("consensus.title")}</h3>
              <p className="text-sm text-zinc-500 leading-relaxed mb-6 flex-1 font-mono">{t("consensus.desc")}</p>
              <ul className="text-xs text-zinc-400 space-y-2 font-mono">
                {(consensusHighlights || []).map((h, i) => <li key={i}>· {h}</li>)}
              </ul>
            </div>
          </FadeIn>
          <FadeIn delay={0.3}>
            <div className="p-8 rounded-2xl border border-white/[0.05] bg-white/[0.01] hover:bg-white/[0.03] transition-colors h-full flex flex-col group">
              <h3 className="text-xl font-bold mb-4 text-white">{t("playbook.title")}</h3>
              <p className="text-sm text-zinc-500 leading-relaxed mb-6 flex-1 font-mono">{t("playbook.desc")}</p>
              <ul className="text-xs text-zinc-400 space-y-2 font-mono">
                {(playbookHighlights || []).map((h, i) => <li key={i}>· {h}</li>)}
              </ul>
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}

// ── Data Sources ─────────────────────────────────────────────

function DataSection() {
  const t = useTranslations("landing.data");
  const tags = ["exchange", "onchain", "derivatives", "macro", "sentiment", "news"] as const;
  return (
    <section className="py-24 border-t border-white/[0.05] bg-[#09090b] relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <FadeIn>
          <h2 className="text-4xl md:text-5xl font-black mb-6 tracking-tight text-white">{t("title")}</h2>
          <p className="text-lg text-zinc-400 max-w-2xl mb-12 leading-relaxed font-mono">{t("desc")}</p>
        </FadeIn>
        <FadeIn delay={0.1}>
          <div className="flex flex-wrap gap-3">
            {tags.map((key) => (
              <span key={key} className="px-5 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] text-xs font-bold font-mono text-zinc-400 uppercase tracking-widest hover:border-indigo-500/50 hover:text-white transition-colors">
                {t(key)}
              </span>
            ))}
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

// ── CTA ──────────────────────────────────────────────────────

function CTASection() {
  const t = useTranslations("landing.cta");
  const locale = useLocale();
  return (
    <section className="py-32 border-t border-white/[0.05] bg-[#09090b] relative overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none" />
      
      <div className="max-w-3xl mx-auto px-4 text-center relative z-10">
        <FadeIn>
          <h2 className="text-5xl md:text-6xl font-black mb-6 tracking-tighter text-white drop-shadow-lg">{t("title")}</h2>
          <p className="text-lg text-zinc-400 mb-12 font-mono leading-relaxed">{t("subtitle")}</p>
        </FadeIn>
        <FadeIn delay={0.1} className="flex flex-wrap items-center justify-center gap-4">
          <Link href={`/${locale}/register`} className="h-14 px-8 rounded-xl bg-indigo-500 text-white font-black text-sm uppercase tracking-widest hover:bg-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.3)] border border-indigo-400/50 hover:shadow-[0_0_30px_rgba(99,102,241,0.5)] transition-all flex items-center justify-center">
            {t("button")}
          </Link>
          <Link href={`/${locale}/login`} className="h-14 px-8 rounded-xl border border-white/[0.1] bg-white/[0.02] backdrop-blur-md text-white font-bold text-sm tracking-widest hover:bg-white/[0.06] hover:border-white/[0.2] transition-colors flex items-center justify-center">
            {t("login")}
          </Link>
        </FadeIn>
      </div>
    </section>
  );
}

// ── Features Grid ──────────────────────────────────────────

const FEATURE_ICONS = [Cpu, Shield, Activity, Search, Zap, Globe];


function FeaturesSection() {
  const t = useTranslations("landing.features");
  const items = t.raw("items") as { title: string; desc: string }[];

  return (
    <section id="features" className="py-32 border-t border-white/[0.05] bg-[#09090b]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-20">
          <h2 className="text-4xl md:text-5xl font-black mb-6 tracking-tight text-white">{t("sectionTitle")}</h2>
          <p className="text-lg text-zinc-400 max-w-2xl font-mono leading-relaxed">
            {t("sectionDesc")}
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {(items || []).map((f, i) => {
            const Icon = FEATURE_ICONS[i] ?? Cpu;
            return (
              <FadeIn key={i} delay={i * 0.1}>
                <div className="p-8 rounded-2xl border border-white/[0.05] bg-white/[0.01] hover:bg-white/[0.03] hover:border-white/[0.1] transition-all h-full group">
                  <div className="w-12 h-12 rounded-xl bg-white/[0.05] flex items-center justify-center mb-6 group-hover:bg-indigo-500/20 group-hover:text-indigo-400 transition-colors">
                    <Icon className="w-6 h-6 text-zinc-400 group-hover:text-indigo-400" strokeWidth={2} />
                  </div>
                  <h3 className="text-xl font-bold mb-3 text-white tracking-tight">{f.title}</h3>
                  <p className="text-sm text-zinc-500 leading-relaxed font-mono">
                    {f.desc}
                  </p>
                </div>
              </FadeIn>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── Trust Section ──────────────────────────────────────────

function TrustSection() {
  const t = useTranslations("landing.trust");
  return (
    <div className="border-y border-white/[0.06] bg-[#09090b] overflow-hidden py-4">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between font-mono text-[11px] font-bold text-zinc-500 uppercase tracking-widest overflow-x-auto whitespace-nowrap gap-12 scrollbar-none">
        <span className="flex items-center gap-2">{t("status")}<span className="text-emerald-400 drop-shadow-[0_0_5px_rgba(52,211,153,0.5)]">{t("statusValue")}</span></span>
        <span className="flex items-center gap-2">{t("analyzed")}<span className="text-white">{t("analyzedValue")}</span></span>
        <span className="flex items-center gap-2">{t("signals")}<span className="text-white">{t("signalsValue")}</span></span>
        <span className="flex items-center gap-2">{t("accuracy")}<span className="text-indigo-400 drop-shadow-[0_0_5px_rgba(99,102,241,0.5)]">{t("accuracyValue")}</span></span>
        <span className="flex items-center gap-2">{t("nodes")}<span className="text-white">{t("nodesValue")}</span></span>
      </div>
    </div>
  );
}

// ── Landing Page Export ────────────────────────────────────

export function LandingPage() {
  const locale = useLocale();
  const t = useTranslations("landing");
  const { user } = useAuth();
  return (
    <div className="min-h-screen bg-bg-primary text-foreground font-sans selection:bg-foreground selection:text-bg-primary">
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.06] bg-[#09090b]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LogoMark className="h-6 w-6 text-white" />
            <span className="font-black tracking-widest text-white uppercase text-lg">AXIOM</span>
          </div>
          <div className="flex items-center gap-6">
            <LanguageSwitcher />
            {user ? (
              <Link href={`/${locale}/dashboard`} className="text-[11px] font-bold uppercase tracking-widest text-zinc-400 hover:text-white transition-colors">
                {t("nav.enterApp")}
              </Link>
            ) : (
              <Link href={`/${locale}/login`} className="text-[11px] font-bold uppercase tracking-widest text-white bg-white/10 hover:bg-white/20 px-4 py-2 rounded border border-white/10 transition-colors">
                {t("nav.login")}
              </Link>
            )}
          </div>
        </div>
      </header>

      <main>
        <HeroSection />
        <TrustSection />
        <PainPointsSection />
        <CapabilitiesSection />
        <ModesSection />
        <ProductSection />
        <DataSection />
        <FeaturesSection />
        <CTASection />
      </main>

      <footer className="py-12 border-t border-white/[0.06] bg-[#09090b] text-center text-xs text-zinc-600 font-mono">
        <div className="flex flex-wrap items-center justify-center gap-8 mb-6 uppercase tracking-widest font-bold text-[10px]">
          <Link href={`/${locale}/guide`} className="hover:text-white transition-colors">{t("footer.guide")}</Link>
          <Link href={`/${locale}/guide`} className="hover:text-white transition-colors">{t("footer.docs")}</Link>
          <Link href={`/${locale}/guide#faq`} className="hover:text-white transition-colors">{t("footer.faq")}</Link>
        </div>
        <p className="tracking-widest uppercase">{t("footerOperational", { year: new Date().getFullYear() })}</p>
      </footer>
    </div>
  );
}
