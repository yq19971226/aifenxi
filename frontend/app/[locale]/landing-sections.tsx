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
    <section className="relative min-h-screen flex items-center pt-24 pb-32 overflow-hidden bg-black selection:bg-indigo-500/30">
      {/* 极客深渊背景网络 */}
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_0%,#000_20%,transparent_100%)] pointer-events-none" />
      
      {/* 巨大的缓慢旋转的模糊光晕 Spotlight */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 150, repeat: Infinity, ease: "linear" }}
        className="absolute w-[150vw] h-[150vw] -left-[25vw] -top-[50vw] opacity-30 pointer-events-none"
      >
        <div className="absolute top-1/4 left-1/4 w-1/2 h-1/2 bg-indigo-500/20 rounded-full blur-[150px] mix-blend-screen" />
        <div className="absolute bottom-1/4 right-1/4 w-1/2 h-1/2 bg-emerald-500/10 rounded-full blur-[150px] mix-blend-screen" />
      </motion.div>
      
      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-[1.1fr_0.9fr] gap-12 items-center">
        {/* Left: Copy */}
        <div className="max-w-2xl">
          <FadeIn delay={0.1}>
            <div className="inline-flex items-center gap-3 px-3 py-1.5 border-l-2 border-indigo-500 bg-indigo-500/10 text-[10px] font-mono text-indigo-400 mb-8 shadow-[0_0_20px_rgba(99,102,241,0.1)] uppercase tracking-[0.2em] backdrop-blur-md">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex h-1.5 w-1.5 bg-indigo-500"></span>
              </span>
              {t("hero.badge")}
            </div>
          </FadeIn>
          
          <FadeIn delay={0.2}>
            <h1 className="text-5xl sm:text-7xl font-black tracking-tighter text-white mb-6 leading-[1.05] uppercase">
              {t("hero.titleLine1")} <br />
              <span className="relative inline-block text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-white to-emerald-400 drop-shadow-[0_0_15px_rgba(99,102,241,0.5)]">
                {t("hero.titleLine2")}
              </span>
            </h1>
          </FadeIn>

          <FadeIn delay={0.3}>
            <p className="text-sm md:text-base text-zinc-500 mb-10 max-w-lg leading-relaxed font-mono tracking-wide uppercase border-l border-white/10 pl-4 py-1">
              {t("hero.subtitleLine1")}
              <br />
              {t("hero.subtitleLine2")}
            </p>
          </FadeIn>

          <FadeIn delay={0.4}>
            <div className="flex flex-wrap gap-4">
              <Link
                href={`/${locale}/login`}
                className="relative group h-14 px-8 bg-indigo-500/10 border border-indigo-500/40 text-indigo-400 font-mono text-[11px] uppercase tracking-[0.2em] flex items-center gap-3 transition-all hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] overflow-hidden"
              >
                <div className="absolute inset-0 bg-indigo-500/20 w-0 group-hover:w-full transition-all duration-500 ease-out z-0" />
                <span className="relative z-10 flex items-center gap-2">
                  {t("hero.ctaPrimary")} <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                </span>
                <span className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-indigo-400 pointer-events-none" />
              </Link>
              <Link
                href={`/${locale}/guide`}
                className="h-14 px-8 border border-white/[0.1] bg-white/[0.02] backdrop-blur-md text-zinc-400 font-mono text-[11px] tracking-[0.2em] uppercase flex items-center hover:bg-white/[0.06] hover:text-white hover:border-white/[0.3] transition-colors relative"
              >
                {t("hero.ctaSecondary")}
                <span className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-zinc-500 pointer-events-none" />
              </Link>
            </div>
          </FadeIn>
        </div>

        {/* Right: Terminal */}
        <FadeIn delay={0.5} className="hidden lg:block relative">
          <TerminalBlock />
        </FadeIn>
      </div>
    </section>
  );
}

const _TERMINAL_LOG = [
  "> 正在授权访问令牌...",
  "> 同步全球预言节点... [OK]",
  "> 部署 AI 智能体 (数量: 4)... [已激活]",
  "> 智能体[技术]: 检测到 $BTC 波动率飙升",
  "> 智能体[风险]: 对冲比率已调整 -> 0.45",
  "> 启动蜂群辩论协议...",
  "> 第1轮: 看多倾向 (65% 置信度)",
  "> 第2轮: 交叉验证链上数据...",
  "> 共识达成: 强力买入 (82%)",
  "> 执行网格策略生成...",
];

function TerminalBlock() {
  const [visibleCount, setVisibleCount] = useState(0);
  const [ts, setTs] = useState("00:00:00.000");

  useEffect(() => {
    // 客户端才更新时间戳，避免 SSR/客户端水合不一致
    setTs(new Date().toISOString().split("T")[1].slice(0, 12));
  }, []);

  useEffect(() => {
    if (visibleCount >= _TERMINAL_LOG.length) return;
    const timer = setTimeout(() => {
      setVisibleCount((c) => c + 1);
      setTs(new Date().toISOString().split("T")[1].slice(0, 12));
    }, Math.random() * 400 + 400);
    return () => clearTimeout(timer);
  }, [visibleCount]);

  const lines = _TERMINAL_LOG.slice(0, visibleCount);

  return (
    <div className="relative border border-white/[0.05] bg-black/60 backdrop-blur-2xl p-1 font-mono text-[10px] shadow-[0_0_80px_rgba(0,0,0,0.8)] overflow-hidden">
      {/* HUD Corners */}
      <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-white/20" />
      <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-white/20" />
      <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-white/20" />
      <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-white/20" />

      <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.05] bg-white/[0.01]">
        <div className="text-[9px] font-bold text-indigo-400 uppercase tracking-[0.3em] flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)] animate-pulse" />
           AXIOM 终端 V5
        </div>
        <div className="flex gap-4 text-[8px] text-zinc-600 tracking-widest">
           <span>端口: 5092</span>
           <span>网络: 主网</span>
        </div>
      </div>

      <div className="p-5 h-[360px] flex flex-col justify-end text-xs relative">
        {/* Subtle grid in terminal */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none" />
        
        <div className="relative z-10 w-full flex flex-col gap-1.5">
          {lines.map((line, i) => {
            const isHighlight = line?.includes("共识") ?? false;
            return (
              <div key={i} className={`${isHighlight ? 'text-indigo-400 font-bold drop-shadow-[0_0_8px_rgba(99,102,241,0.6)]' : 'text-emerald-400/70'} tracking-wider`}>
                <span className="text-zinc-600 mr-3 hidden sm:inline-block">[{ts}]</span>
                {line}
              </div>
            );
          })}
          <div className="animate-pulse text-emerald-400 font-black text-sm ml-1 mt-1 block w-2 h-4 bg-emerald-400/80 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
        </div>
      </div>
    </div>
  );
}

// ── Pain Points ─────────────────────────────────────────────

function PainPointsSection() {
  const t = useTranslations("landing.painPoints");
  const items = t.raw("items") as { problem: string; solution: string }[];
  return (
    <section className="py-24 border-t border-white/[0.05] bg-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn>
          <h2 className="text-4xl md:text-5xl font-black mb-16 tracking-tighter text-white uppercase">{t("title")}</h2>
        </FadeIn>
        <div className="grid md:grid-cols-3 gap-6">
          {(items || []).map((item, i) => (
            <FadeIn key={i} delay={i * 0.1}>
              <div className="relative p-8 border border-white/[0.05] bg-white/[0.01] hover:bg-white/[0.03] transition-colors h-full group overflow-hidden">
                <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-white/20 opacity-50 group-hover:opacity-100 group-hover:border-indigo-500 transition-colors" />
                <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-white/20 opacity-50 group-hover:opacity-100 group-hover:border-indigo-500 transition-colors" />
                
                <p className="text-zinc-500 font-mono mb-4 text-[11px] tracking-widest uppercase">{item.problem}</p>
                <div className="w-12 h-px bg-white/[0.1] mb-6 group-hover:bg-indigo-500/50 group-hover:w-full transition-all duration-500" />
                <p className="text-white font-bold text-lg tracking-wide">{item.solution}</p>
                
                <div className="absolute -inset-px bg-gradient-to-r from-transparent via-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity blur-md" />
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
    <section className="py-24 border-t border-white/[0.05] bg-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn>
          <h2 className="text-4xl md:text-5xl font-black mb-6 tracking-tighter text-white uppercase">{t("title")}</h2>
          <p className="text-sm text-zinc-500 max-w-2xl mb-16 leading-relaxed font-mono uppercase tracking-[0.1em]">{t("subtitle")}</p>
        </FadeIn>
        <div className="grid md:grid-cols-3 gap-6">
          <FadeIn delay={0.1}>
            <div className="relative p-8 border border-white/[0.05] bg-white/[0.01] hover:bg-white/[0.03] transition-all duration-300 h-full group hover:-translate-y-1">
              <div className="absolute top-0 right-0 p-2 opacity-20 font-mono text-[8px] group-hover:opacity-100 group-hover:text-indigo-400">#001</div>
              <h3 className="text-xl font-bold mb-4 text-white uppercase tracking-wider">{t("analysis.title")}</h3>
              <p className="text-[11px] text-zinc-500 leading-relaxed font-mono tracking-wide">{t("analysis.desc")}</p>
            </div>
          </FadeIn>
          <FadeIn delay={0.2}>
            <div className="relative p-8 border border-white/[0.05] bg-white/[0.01] hover:bg-white/[0.03] transition-all duration-300 h-full group hover:-translate-y-1">
              <div className="absolute top-0 right-0 p-2 opacity-20 font-mono text-[8px] group-hover:opacity-100 group-hover:text-indigo-400">#002</div>
              <h3 className="text-xl font-bold mb-4 text-white uppercase tracking-wider">{t("consensus.title")}</h3>
              <p className="text-[11px] text-zinc-500 leading-relaxed font-mono tracking-wide">{t("consensus.desc")}</p>
            </div>
          </FadeIn>
          <FadeIn delay={0.3}>
            <div className="relative p-8 border border-white/[0.05] bg-white/[0.01] hover:bg-white/[0.03] transition-all duration-300 h-full group hover:-translate-y-1">
              <div className="absolute top-0 right-0 p-2 opacity-20 font-mono text-[8px] group-hover:opacity-100 group-hover:text-indigo-400">#003</div>
              <h3 className="text-xl font-bold mb-4 text-white uppercase tracking-wider">{t("practice.title")}</h3>
              <p className="text-[11px] text-zinc-500 leading-relaxed font-mono tracking-wide">{t("practice.desc")}</p>
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
    <section className="py-32 border-t border-white/[0.05] bg-black relative overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_10%,transparent_100%)] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vw] md:w-[600px] md:h-[600px] rounded-full bg-indigo-500/10 blur-[150px] pointer-events-none" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <FadeIn>
          <h2 className="text-4xl md:text-5xl font-black mb-6 tracking-tighter text-white uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">{t("title")}</h2>
          <p className="text-sm text-zinc-500 max-w-2xl mb-20 leading-relaxed font-mono uppercase tracking-[0.1em]">{t("subtitle")}</p>
        </FadeIn>
        <div className="grid md:grid-cols-3 gap-8">
          <FadeIn delay={0.1}>
            <div className="relative p-10 border border-white/[0.05] bg-black/80 backdrop-blur-xl hover:border-indigo-500/30 transition-all duration-500 group overflow-hidden">
              <div className="absolute -inset-px bg-gradient-to-b from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-700 -translate-x-full group-hover:translate-x-0" />
              <div className="relative z-10">
                <span className="inline-block text-[10px] font-black font-mono text-indigo-400 border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 uppercase tracking-[0.3em] shadow-[0_0_15px_rgba(99,102,241,0.2)]">
                  {t("scalping.tag")}
                </span>
                <h3 className="text-2xl font-black mt-8 mb-4 text-white uppercase tracking-widest">{t("scalping.name")}</h3>
                <p className="text-[11px] text-zinc-400 leading-relaxed font-mono tracking-widest uppercase">{t("scalping.desc")}</p>
              </div>
            </div>
          </FadeIn>
          <FadeIn delay={0.2}>
            <div className="relative p-10 border border-white/[0.05] bg-black/80 backdrop-blur-xl hover:border-emerald-500/30 transition-all duration-500 group overflow-hidden">
              <div className="absolute -inset-px bg-gradient-to-b from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-700 -translate-x-full group-hover:translate-x-0" />
              <div className="relative z-10">
                <span className="inline-block text-[10px] font-black font-mono text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 uppercase tracking-[0.3em] shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                  {t("intraday.tag")}
                </span>
                <h3 className="text-2xl font-black mt-8 mb-4 text-white uppercase tracking-widest">{t("intraday.name")}</h3>
                <p className="text-[11px] text-zinc-400 leading-relaxed font-mono tracking-widest uppercase">{t("intraday.desc")}</p>
              </div>
            </div>
          </FadeIn>
          <FadeIn delay={0.3}>
            <div className="relative p-10 border border-white/[0.05] bg-black/80 backdrop-blur-xl hover:border-amber-500/30 transition-all duration-500 group overflow-hidden">
              <div className="absolute -inset-px bg-gradient-to-b from-amber-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-amber-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-700 -translate-x-full group-hover:translate-x-0" />
              <div className="relative z-10">
                <span className="inline-block text-[10px] font-black font-mono text-amber-400 border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 uppercase tracking-[0.3em] shadow-[0_0_15px_rgba(245,158,11,0.2)]">
                  {t("trend.tag")}
                </span>
                <h3 className="text-2xl font-black mt-8 mb-4 text-white uppercase tracking-widest">{t("trend.name")}</h3>
                <p className="text-[11px] text-zinc-400 leading-relaxed font-mono tracking-widest uppercase">{t("trend.desc")}</p>
              </div>
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
    <section className="py-24 border-t border-white/[0.05] bg-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn>
          <h2 className="text-4xl md:text-5xl font-black mb-6 tracking-tighter text-white uppercase">{t("title")}</h2>
          <p className="text-sm text-zinc-500 max-w-2xl mb-16 leading-relaxed font-mono tracking-[0.1em] uppercase">{t("subtitle")}</p>
        </FadeIn>
        <div className="grid md:grid-cols-3 gap-8">
          <FadeIn delay={0.1}>
            <div className="relative p-8 border border-white/[0.05] bg-white/[0.01] hover:bg-white/[0.03] transition-all h-full flex flex-col group overflow-hidden">
              <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-white/20 group-hover:border-indigo-500 transition-colors" />
              <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-white/20 group-hover:border-indigo-500 transition-colors" />
              <h3 className="text-xl font-bold mb-4 text-white uppercase tracking-widest">{t("dashboard.title")}</h3>
              <p className="text-[11px] text-zinc-500 leading-relaxed mb-6 flex-1 font-mono tracking-widest uppercase">{t("dashboard.desc")}</p>
              <ul className="text-[10px] text-zinc-400 space-y-3 font-mono tracking-[0.1em] uppercase">
                {(dashboardHighlights || []).map((h, i) => <li key={i} className="flex gap-2 items-start"><span className="text-indigo-500 font-black pt-0.5">/</span> {h}</li>)}
              </ul>
            </div>
          </FadeIn>
          <FadeIn delay={0.2}>
            <div className="relative p-8 border border-white/[0.05] bg-white/[0.01] hover:bg-white/[0.03] transition-all h-full flex flex-col group overflow-hidden">
              <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-white/20 group-hover:border-emerald-500 transition-colors" />
              <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-white/20 group-hover:border-emerald-500 transition-colors" />
              <h3 className="text-xl font-bold mb-4 text-white uppercase tracking-widest">{t("consensus.title")}</h3>
              <p className="text-[11px] text-zinc-500 leading-relaxed mb-6 flex-1 font-mono tracking-widest uppercase">{t("consensus.desc")}</p>
              <ul className="text-[10px] text-zinc-400 space-y-3 font-mono tracking-[0.1em] uppercase">
                {(consensusHighlights || []).map((h, i) => <li key={i} className="flex gap-2 items-start"><span className="text-emerald-500 font-black pt-0.5">/</span> {h}</li>)}
              </ul>
            </div>
          </FadeIn>
          <FadeIn delay={0.3}>
            <div className="relative p-8 border border-white/[0.05] bg-white/[0.01] hover:bg-white/[0.03] transition-all h-full flex flex-col group overflow-hidden">
              <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-white/20 group-hover:border-amber-500 transition-colors" />
              <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-white/20 group-hover:border-amber-500 transition-colors" />
              <h3 className="text-xl font-bold mb-4 text-white uppercase tracking-widest">{t("playbook.title")}</h3>
              <p className="text-[11px] text-zinc-500 leading-relaxed mb-6 flex-1 font-mono tracking-widest uppercase">{t("playbook.desc")}</p>
              <ul className="text-[10px] text-zinc-400 space-y-3 font-mono tracking-[0.1em] uppercase">
                {(playbookHighlights || []).map((h, i) => <li key={i} className="flex gap-2 items-start"><span className="text-amber-500 font-black pt-0.5">/</span> {h}</li>)}
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
    <section className="py-24 border-t border-white/[0.05] bg-black relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <FadeIn>
          <h2 className="text-4xl md:text-5xl font-black mb-6 tracking-tighter text-white uppercase">{t("title")}</h2>
          <p className="text-sm text-zinc-500 max-w-2xl mb-12 leading-relaxed font-mono uppercase tracking-[0.1em]">{t("desc")}</p>
        </FadeIn>
        <FadeIn delay={0.1}>
          <div className="flex flex-wrap gap-3">
            {tags.map((key) => (
              <span key={key} className="px-5 py-2.5 border border-white/[0.08] bg-white/[0.02] text-[10px] font-bold font-mono text-zinc-500 uppercase tracking-[0.2em] hover:border-indigo-500/50 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors shadow-[0_0_15px_rgba(0,0,0,0.5)]">
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
    <section className="py-32 border-t border-white/[0.05] bg-black relative overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-indigo-500/10 blur-[150px] pointer-events-none" />
      
      <div className="max-w-3xl mx-auto px-4 text-center relative z-10">
        <FadeIn>
          <h2 className="text-5xl md:text-6xl font-black mb-6 tracking-tighter text-white drop-shadow-lg uppercase">{t("title")}</h2>
          <p className="text-sm text-zinc-500 mb-12 font-mono uppercase tracking-[0.1em]">{t("subtitle")}</p>
        </FadeIn>
        <FadeIn delay={0.1} className="flex flex-wrap items-center justify-center gap-4">
          <Link
            href={`/${locale}/register`}
            className="relative group h-14 px-8 bg-indigo-500/10 border border-indigo-500/40 text-indigo-400 font-mono text-[11px] uppercase tracking-[0.2em] flex items-center justify-center transition-all hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] min-w-[200px]"
          >
            <div className="absolute inset-0 bg-indigo-500/20 w-0 group-hover:w-full transition-all duration-500 ease-out z-0" />
            <span className="relative z-10">{t("button")}</span>
            <span className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-indigo-400 pointer-events-none" />
          </Link>
          <Link
            href={`/${locale}/login`}
            className="relative group h-14 px-8 border border-white/[0.1] bg-white/[0.02] text-zinc-400 font-mono text-[11px] uppercase tracking-[0.2em] flex items-center justify-center transition-all hover:border-white/[0.3] hover:text-white min-w-[200px]"
          >
            <span className="relative z-10">{t("login")}</span>
            <span className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-zinc-500 pointer-events-none" />
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
    <section id="features" className="py-32 border-t border-white/[0.05] bg-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-20">
          <h2 className="text-4xl md:text-5xl font-black mb-6 tracking-tighter text-white uppercase">{t("sectionTitle")}</h2>
          <p className="text-sm text-zinc-500 max-w-2xl font-mono tracking-[0.1em] uppercase">
            {t("sectionDesc")}
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {(items || []).map((f, i) => {
            const Icon = FEATURE_ICONS[i] ?? Cpu;
            return (
              <FadeIn key={i} delay={i * 0.1}>
                <div className="relative p-8 border border-white/[0.05] bg-white/[0.01] hover:bg-white/[0.03] transition-all h-full group overflow-hidden">
                  <div className="absolute top-0 right-0 font-mono text-[8px] p-2 opacity-20 group-hover:opacity-100 group-hover:text-indigo-400 transition-colors">M_0{i+1}</div>
                  <div className="w-10 h-10 border border-white/[0.1] bg-white/[0.02] flex items-center justify-center mb-6 group-hover:bg-indigo-500/20 group-hover:border-indigo-500/50 group-hover:text-indigo-400 transition-colors">
                    <Icon className="w-5 h-5 text-zinc-500 group-hover:text-indigo-400" strokeWidth={1.5} />
                  </div>
                  <h3 className="text-xl font-bold mb-3 text-white tracking-widest uppercase">{f.title}</h3>
                  <p className="text-[11px] text-zinc-500 leading-relaxed font-mono tracking-widest uppercase">
                    {f.desc}
                  </p>
                  <div className="absolute bottom-0 left-0 w-0 h-0.5 bg-indigo-500/50 group-hover:w-full transition-all duration-500 ease-out" />
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
    <div className="border-y border-white/[0.06] bg-black overflow-hidden py-4">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between font-mono text-[10px] font-bold text-zinc-600 uppercase tracking-[0.3em] overflow-x-auto whitespace-nowrap gap-12 scrollbar-none">
        <span className="flex items-center gap-3">{t("status")}<span className="text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse">{t("statusValue")}</span></span>
        <span className="flex items-center gap-3">{t("analyzed")}<span className="text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]">{t("analyzedValue")}</span></span>
        <span className="flex items-center gap-3">{t("signals")}<span className="text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]">{t("signalsValue")}</span></span>
        <span className="flex items-center gap-3">{t("accuracy")}<span className="text-indigo-400 drop-shadow-[0_0_8px_rgba(99,102,241,0.8)]">{t("accuracyValue")}</span></span>
        <span className="flex items-center gap-3">{t("nodes")}<span className="text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]">{t("nodesValue")}</span></span>
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
    <div className="min-h-screen bg-black text-white font-sans selection:bg-indigo-500/30">
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.04] bg-black/60 backdrop-blur-2xl">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LogoMark className="h-6 w-6 text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]" />
            <span className="font-black tracking-widest text-white uppercase text-xl">AXIOM</span>
          </div>
          <div className="flex items-center gap-6 text-[10px] font-mono tracking-[0.2em] uppercase">
            <LanguageSwitcher />
            {user ? (
              <Link href={`/${locale}/dashboard`} className="text-zinc-500 font-bold hover:text-indigo-400 transition-colors">
                {t("nav.enterApp")}
              </Link>
            ) : (
              <>
                <Link href={`/${locale}/insights`} className="text-zinc-500 font-bold hover:text-white transition-colors hidden sm:block">
                  {t("nav.insights")}
                </Link>
                <Link href={`/${locale}/login`} className="text-zinc-400 hover:text-white border px-4 py-1.5 border-white/10 hover:border-white/30 hover:bg-white/5 transition-colors">
                  {t("nav.login")}
                </Link>
              </>
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

      <footer className="py-12 border-t border-white/[0.04] bg-black text-center text-[10px] text-zinc-600 font-mono tracking-widest uppercase">
        <div className="flex flex-wrap items-center justify-center gap-8 mb-6 font-bold">
          <Link href={`/${locale}/guide`} className="hover:text-indigo-400 transition-colors">{t("footer.guide")}</Link>
          <Link href={`/${locale}/insights`} className="hover:text-indigo-400 transition-colors">{t("footer.insights")}</Link>
          <Link href={`/${locale}/guide#faq`} className="hover:text-indigo-400 transition-colors">{t("footer.faq")}</Link>
        </div>
        <p className="max-w-2xl mx-auto px-4 mb-6 text-[9px] leading-relaxed normal-case tracking-normal text-zinc-500/80 font-sans">
          {t("footer.riskText")}
        </p>
        <p className="opacity-50">{t("footerOperational", { year: new Date().getFullYear() })}</p>
      </footer>
    </div>
  );
}
