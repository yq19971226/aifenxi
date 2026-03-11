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
  const t = useTranslations("landing.hero");
  const locale = useLocale();

  return (
    <section className="relative min-h-[90vh] flex items-center pt-20 pb-32 overflow-hidden bg-bg-primary">
      {/* Grid Background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#333_1px,transparent_1px),linear-gradient(to_bottom,#333_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-[0.15]" />
      
      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-16 items-center">
        {/* Left: Copy */}
        <div className="max-w-2xl">
          <FadeIn delay={0.1}>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-bg-surface/50 text-xs font-mono text-muted-foreground mb-8">
              <span className="w-2 h-2 rounded-full bg-bull animate-pulse" />
              {t("badge")}
            </div>
          </FadeIn>
          
          <FadeIn delay={0.2}>
            <h1 className="text-5xl sm:text-7xl font-bold tracking-tight text-foreground mb-6 font-mono">
              {t("titleLine1")} <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-foreground to-muted-foreground">
                {t("titleLine2")}
              </span>
            </h1>
          </FadeIn>

          <FadeIn delay={0.3}>
            <p className="text-xl text-muted-foreground mb-10 max-w-lg leading-relaxed">
              {t("subtitleLine1")}
              <br />
              {t("subtitleLine2")}
            </p>
          </FadeIn>

          <FadeIn delay={0.4}>
            <div className="flex flex-wrap gap-4">
              <Link
                href={`/${locale}/login`}
                className="h-12 px-8 rounded bg-foreground text-bg-primary font-bold flex items-center gap-2 hover:bg-muted-foreground transition-colors"
              >
                {t("ctaPrimary")} <ArrowRight size={18} />
              </Link>
              <Link
                href="#features"
                className="h-12 px-8 rounded border border-border text-foreground font-medium flex items-center hover:bg-bg-surface transition-colors"
              >
                {t("ctaSecondary")}
              </Link>
            </div>
          </FadeIn>
        </div>

        {/* Right: Terminal */}
        <FadeIn delay={0.5} className="hidden lg:block">
          <TerminalBlock />
        </FadeIn>
      </div>
    </section>
  );
}

function TerminalBlock() {
  const [lines, setLines] = useState<string[]>([]);
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

  useEffect(() => {
    let currentIndex = 0;
    const interval = setInterval(() => {
      if (currentIndex < fullLog.length) {
        setLines(prev => [...prev, fullLog[currentIndex]]);
        currentIndex++;
      } else {
        clearInterval(interval);
      }
    }, 800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="rounded-lg border border-border bg-bg-card backdrop-blur-sm p-1 font-mono text-sm shadow-2xl">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-bg-surface/50 rounded-t">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-bear" />
          <div className="w-3 h-3 rounded-full bg-warn" />
          <div className="w-3 h-3 rounded-full bg-bull" />
        </div>
        <div className="ml-4 text-xs text-muted-foreground">axiom_core.exe</div>
      </div>
      <div className="p-6 h-[400px] overflow-hidden flex flex-col justify-end">
        {lines.map((line, i) => (
          <div key={i} className="mb-2 text-bull/90">
            <span className="text-muted-foreground mr-2">{new Date().toLocaleTimeString()}</span>
            {line}
          </div>
        ))}
        <div className="animate-pulse text-bull">_</div>
      </div>
    </div>
  );
}

// ── Features Grid ──────────────────────────────────────────

const FEATURE_ICONS = [Cpu, Shield, Activity, Search, Zap, Globe];

function FeaturesSection() {
  const t = useTranslations("landing.features");
  const items = t.raw("items") as { title: string; desc: string }[];

  return (
    <section id="features" className="py-32 border-t border-border bg-bg-surface">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-20">
          <h2 className="text-3xl font-bold mb-6">{t("sectionTitle")}</h2>
          <p className="text-muted-foreground max-w-2xl">
            {t("sectionDesc")}
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-border">
          {(items || []).map((f, i) => {
            const Icon = FEATURE_ICONS[i] ?? Cpu;
            return (
              <FadeIn key={i} delay={i * 0.1}>
                <div className="bg-bg-primary p-10 h-full hover:bg-bg-elevated transition-colors group">
                  <Icon className="w-8 h-8 text-muted-foreground mb-6 group-hover:text-foreground transition-colors" strokeWidth={1.5} />
                  <h3 className="text-lg font-bold mb-3 font-mono">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
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
    <div className="border-y border-border bg-bg-primary overflow-hidden py-4">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between font-mono text-xs text-muted-foreground uppercase tracking-widest overflow-x-auto whitespace-nowrap gap-8 scrollbar-none">
        <span>{t("status")}<span className="text-bull">{t("statusValue")}</span></span>
        <span>{t("analyzed")}<span className="text-foreground">{t("analyzedValue")}</span></span>
        <span>{t("signals")}<span className="text-foreground">{t("signalsValue")}</span></span>
        <span>{t("accuracy")}<span className="text-bull">{t("accuracyValue")}</span></span>
        <span>{t("nodes")}<span className="text-foreground">{t("nodesValue")}</span></span>
      </div>
    </div>
  );
}

// ── Landing Page Export ────────────────────────────────────

export function LandingPage() {
  const locale = useLocale();
  const t = useTranslations("landing");
  return (
    <div className="min-h-screen bg-bg-primary text-foreground font-sans selection:bg-foreground selection:text-bg-primary">
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-bg-primary/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LogoMark className="h-6 w-6 text-foreground" />
            <span className="font-bold tracking-tight">AXIOM</span>
          </div>
          <div className="flex items-center gap-6">
            <LanguageSwitcher />
            <Link href={`/${locale}/login`} className="text-sm font-medium hover:text-muted-foreground transition-colors">
              {t("nav.login")}
            </Link>
          </div>
        </div>
      </header>

      <main>
        <HeroSection />
        <TrustSection />
        <FeaturesSection />
      </main>

      <footer className="py-12 border-t border-border bg-bg-primary text-center text-xs text-muted-foreground">
        <p>{t("footerOperational", { year: new Date().getFullYear() })}</p>
      </footer>
    </div>
  );
}
