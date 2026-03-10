"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { motion, useInView } from "framer-motion";
import {
  ArrowRight,
  ArrowRightLeft,
  BarChart3,
  Brain,
  ChevronDown,
  Activity,
  Globe,
  HelpCircle,
  LineChart,
  TrendingUp,
  Zap,
  Shield,
  ShieldAlert,
  Database,
  Link2,
  Newspaper,
  Gauge,
} from "lucide-react";
import { LogoMark } from "@/components/ui/Logo";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";

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

function SectionHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="text-center max-w-2xl mx-auto mb-16">
      <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-100">
        {title}
      </h2>
      <p className="mt-4 text-base text-zinc-500 leading-relaxed">{subtitle}</p>
    </div>
  );
}

function LandingNav() {
  const t = useTranslations("landing.nav");

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.04] bg-black/60 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 group">
          <LogoMark size={22} className="transition-transform group-hover:scale-105" />
          <span className="text-sm font-semibold text-zinc-100 select-none">
            <span className="tracking-[0.18em]">AXIOM</span>
            <span className="text-zinc-500 font-normal ml-1">洞察</span>
          </span>
        </Link>

        <nav className="hidden sm:flex items-center gap-6 text-sm text-zinc-500">
          <a href="#capabilities" className="hover:text-zinc-300 transition-colors">
            {t("features")}
          </a>
          <a href="#modes" className="hover:text-zinc-300 transition-colors">
            {t("modes")}
          </a>
          <a href="#data" className="hover:text-zinc-300 transition-colors">
            {t("data")}
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <Link
            href="/login"
            className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            {t("login")}
          </Link>
          <Link
            href="/login?tab=register"
            className="hidden sm:inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-sm font-medium text-white transition-all hover:bg-blue-500"
          >
            {t("register")}
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/*  Hero                                                               */
/* ------------------------------------------------------------------ */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

function usePublicOnlineCount() {
  const [count, setCount] = useState(0);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/stats/online`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setEnabled(data.enabled ?? false);
          setCount(data.count ?? 0);
        }
      } catch {}
    };
    poll();
    const id = setInterval(poll, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return { count, enabled };
}

function LiveDashboardMockup() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2400);
    return () => clearInterval(id);
  }, []);

  const price = 67_432 + Math.sin(tick * 0.7) * 180;
  const confidence = 72 + Math.sin(tick * 0.5) * 8;
  const models = [
    { name: "DeepSeek R1", signal: tick % 5 < 3 ? "bullish" : "neutral", conf: 78 + Math.sin(tick * 0.3) * 6 },
    { name: "Claude", signal: tick % 7 < 5 ? "bullish" : "bearish", conf: 71 + Math.cos(tick * 0.4) * 9 },
    { name: "Grok-4", signal: tick % 4 < 2 ? "neutral" : "bullish", conf: 65 + Math.sin(tick * 0.6) * 7 },
  ];
  const signalColor = { bullish: "text-emerald-400", bearish: "text-red-400", neutral: "text-zinc-500" };
  const dotColor = { bullish: "bg-emerald-400", bearish: "bg-red-400", neutral: "bg-zinc-500" };

  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#0c0e13]/80 backdrop-blur-md p-5 shadow-2xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-xs font-mono text-zinc-500">BTCUSDT</span>
        </div>
        <span className="text-xs text-zinc-600 font-mono">LIVE</span>
      </div>

      <div className="mb-5">
        <span className="text-2xl font-bold font-mono text-zinc-100 tabular-nums">
          ${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        <span className="ml-2 text-xs text-emerald-400 font-mono">+2.4%</span>
      </div>

      <div className="space-y-2.5 mb-5">
        {models.map((m) => (
          <div key={m.name} className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotColor[m.signal as keyof typeof dotColor]}`} />
              <span className="text-xs text-zinc-400 truncate">{m.name}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs font-medium ${signalColor[m.signal as keyof typeof signalColor]}`}>
                {m.signal === "bullish" ? "LONG" : m.signal === "bearish" ? "SHORT" : "HOLD"}
              </span>
              <span className="text-xs font-mono text-zinc-500 w-8 text-right">{m.conf.toFixed(0)}%</span>
            </div>
          </div>
        ))}
      </div>

      <div className="pt-3 border-t border-white/[0.06]">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-zinc-500">Consensus</span>
          <span className="text-xs font-mono text-blue-400">{confidence.toFixed(0)}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-blue-500"
            animate={{ width: `${confidence}%` }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
          />
        </div>
      </div>
    </div>
  );
}

function HeroSection() {
  const t = useTranslations("landing.hero");
  const { count: onlineCount, enabled: onlineEnabled } = usePublicOnlineCount();

  return (
    <section className="relative min-h-[90vh] flex items-center overflow-hidden pt-14">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/3 left-0 h-[600px] w-[600px] rounded-full bg-blue-600/[0.06] blur-[160px]" />
        <div className="absolute bottom-0 right-1/4 h-[400px] w-[400px] rounded-full bg-indigo-600/[0.03] blur-[120px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl w-full px-4 sm:px-6">
        <div className="grid lg:grid-cols-[1fr,420px] gap-12 lg:gap-16 items-center">
          <div>
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              <p className="mb-5 text-sm font-medium tracking-widest text-blue-400/70 uppercase">
                {t("tagline")}
              </p>
              <h1 className="text-4xl sm:text-5xl font-semibold leading-[1.1] tracking-tight">
                <span className="text-zinc-100">
                  {t("title1")}
                </span>
                <br />
                <span className="text-blue-400">
                  {t("title2")}
                </span>
              </h1>
            </motion.div>

            <motion.p
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.25 }}
              className="mt-6 max-w-lg text-base text-zinc-500 leading-relaxed"
            >
              {t("subtitle")}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="mt-8 flex flex-col sm:flex-row items-start gap-4"
            >
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white transition-all hover:bg-blue-500 hover:shadow-[0_0_24px_rgba(37,99,235,0.3)] active:scale-[0.98]"
              >
                {t("cta")}
                <ArrowRight size={15} />
              </Link>
              <a
                href="#capabilities"
                className="inline-flex items-center gap-1.5 px-2 py-3 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {t("learnMore")}
                <ChevronDown size={14} />
              </a>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.6 }}
              className="mt-12 flex items-center gap-8"
            >
              {[
                { value: "15+", label: t("statsAgents") },
                { value: "6", label: t("statsSources") },
                { value: "3", label: t("statsModes") },
                ...(onlineEnabled && onlineCount > 0
                  ? [{ value: String(onlineCount), label: t("statsOnline") }]
                  : []),
              ].map((stat, i) => (
                <div key={i} className="flex flex-col">
                  <span className="text-xl font-bold font-mono text-zinc-200">{stat.value}</span>
                  <span className="mt-0.5 text-xs text-zinc-600">{stat.label}</span>
                </div>
              ))}
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="hidden lg:block"
          >
            <LiveDashboardMockup />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

const painIcons = [
  <HelpCircle key="p1" size={20} className="text-blue-400" />,
  <ArrowRightLeft key="p2" size={20} className="text-amber-400" />,
  <ShieldAlert key="p3" size={20} className="text-red-400" />,
];

function PainPointsSection() {
  const t = useTranslations("landing.painPoints");
  const items = t.raw("items") as Array<{ problem: string; solution: string }>;

  return (
    <section className="py-20 sm:py-24 border-t border-white/[0.04]">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <FadeIn>
          <h2 className="text-center text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-100 mb-12">
            {t("title")}
          </h2>
        </FadeIn>

        <div className="grid gap-4 sm:grid-cols-3">
          {items.map((item, i) => (
            <FadeIn key={i} delay={i * 0.1}>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 text-center transition-colors hover:border-white/[0.1]">
                <div className="flex h-10 w-10 mx-auto items-center justify-center rounded-full bg-white/[0.04] mb-4">
                  {painIcons[i]}
                </div>
                <p className="text-sm font-medium text-zinc-300 mb-3">
                  {item.problem}
                </p>
                <div className="h-px w-8 mx-auto bg-white/[0.08] mb-3" />
                <p className="text-sm text-zinc-500 leading-relaxed">
                  {item.solution}
                </p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

const capabilityIcons = [
  <BarChart3 key="a" size={20} className="text-blue-400" />,
  <Brain key="b" size={20} className="text-emerald-400" />,
  <Shield key="c" size={20} className="text-amber-400" />,
];

function CapabilitiesSection() {
  const t = useTranslations("landing.capabilities");
  const items = ["analysis", "consensus", "practice"] as const;

  return (
    <section id="capabilities" className="py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <FadeIn>
          <SectionHeading title={t("title")} subtitle={t("subtitle")} />
        </FadeIn>

        <div className="grid gap-6 sm:grid-cols-3">
          {items.map((key, i) => (
            <FadeIn key={key} delay={i * 0.12}>
              <div className="group rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 sm:p-8 transition-colors hover:border-white/[0.1] hover:bg-white/[0.03]">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/[0.04] mb-5">
                  {capabilityIcons[i]}
                </div>
                <h3 className="text-lg font-medium text-zinc-200 mb-3">
                  {t(`${key}.title`)}
                </h3>
                <p className="text-sm text-zinc-500 leading-relaxed">
                  {t(`${key}.desc`)}
                </p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

const modeIcons = [
  <Zap key="s" size={18} className="text-yellow-400" />,
  <Activity key="i" size={18} className="text-blue-400" />,
  <TrendingUp key="t" size={18} className="text-emerald-400" />,
];

function ModesSection() {
  const t = useTranslations("landing.modes");
  const modes = ["scalping", "intraday", "trend"] as const;

  return (
    <section id="modes" className="py-24 sm:py-32 border-t border-white/[0.04]">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <FadeIn>
          <SectionHeading title={t("title")} subtitle={t("subtitle")} />
        </FadeIn>

        <div className="grid gap-6 sm:grid-cols-3">
          {modes.map((mode, i) => (
            <FadeIn key={mode} delay={i * 0.12}>
              <div className="relative rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 sm:p-8 transition-colors hover:border-white/[0.1]">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.04]">
                    {modeIcons[i]}
                  </div>
                  <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-xs text-zinc-500 font-mono">
                    {t(`${mode}.tag`)}
                  </span>
                </div>
                <h3 className="text-lg font-medium text-zinc-200 mb-3">
                  {t(`${mode}.name`)}
                </h3>
                <p className="text-sm text-zinc-500 leading-relaxed">
                  {t(`${mode}.desc`)}
                </p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

const productIcons = [
  <LineChart key="d" size={20} className="text-blue-400" />,
  <Brain key="c" size={20} className="text-emerald-400" />,
  <Activity key="p" size={20} className="text-purple-400" />,
];

function ProductSection() {
  const t = useTranslations("landing.product");
  const items = ["dashboard", "consensus", "playbook"] as const;

  return (
    <section className="py-24 sm:py-32 border-t border-white/[0.04]">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <FadeIn>
          <SectionHeading title={t("title")} subtitle={t("subtitle")} />
        </FadeIn>

        <div className="space-y-5">
          {items.map((key, i) => (
            <FadeIn key={key} delay={i * 0.1}>
              <div className="group flex flex-col sm:flex-row gap-5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 sm:p-8 transition-colors hover:border-white/[0.1] hover:bg-white/[0.03]">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white/[0.04]">
                  {productIcons[i]}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-medium text-zinc-200">
                    {t(`${key}.title`)}
                  </h3>
                  <p className="mt-2 text-sm text-zinc-500 leading-relaxed">
                    {t(`${key}.desc`)}
                  </p>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {(t.raw(`${key}.highlights`) as string[]).map((h: string, j: number) => (
                      <li
                        key={j}
                        className="rounded-full bg-white/[0.04] px-3 py-1 text-xs text-zinc-500"
                      >
                        {h}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

const dataIcons = [
  { icon: <BarChart3 size={16} />, key: "exchange" },
  { icon: <Link2 size={16} />, key: "onchain" },
  { icon: <Gauge size={16} />, key: "derivatives" },
  { icon: <Globe size={16} />, key: "macro" },
  { icon: <Activity size={16} />, key: "sentiment" },
  { icon: <Newspaper size={16} />, key: "news" },
];

function DataSection() {
  const t = useTranslations("landing.data");

  return (
    <section id="data" className="py-24 sm:py-32 border-t border-white/[0.04]">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center">
        <FadeIn>
          <Database size={28} className="mx-auto text-zinc-600 mb-6" />
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-100">
            {t("title")}
          </h2>
          <p className="mt-4 text-base text-zinc-500 leading-relaxed">
            {t("desc")}
          </p>
        </FadeIn>

        <FadeIn delay={0.15}>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
            {dataIcons.map(({ icon, key }) => (
              <div
                key={key}
                className="flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.02] px-4 py-2 text-sm text-zinc-500"
              >
                <span className="text-zinc-600">{icon}</span>
                {t(key)}
              </div>
            ))}
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

function CTASection() {
  const t = useTranslations("landing.cta");

  return (
    <section className="py-24 sm:py-32 border-t border-white/[0.04]">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 text-center">
        <FadeIn>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-100">
            {t("title")}
          </h2>
          <p className="mt-4 text-base text-zinc-500 leading-relaxed">
            {t("subtitle")}
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white transition-all hover:bg-blue-500 hover:shadow-[0_0_24px_rgba(37,99,235,0.3)] active:scale-[0.98]"
            >
              {t("button")}
              <ArrowRight size={15} />
            </Link>
            <span className="flex items-center gap-3 text-sm">
              <Link
                href="/login"
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {t("login")}
              </Link>
              <span className="text-zinc-800">|</span>
              <Link
                href="/guide"
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {t("guide")}
              </Link>
            </span>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

function LandingFooter() {
  const t = useTranslations("landing.footer");
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-white/[0.04] bg-black/40">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16">
        <div className="grid gap-8 sm:grid-cols-4">
          {/* Brand */}
          <div className="sm:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <LogoMark size={20} />
              <span className="text-sm font-semibold text-zinc-400 select-none">
                <span className="tracking-[0.18em]">AXIOM</span>
                <span className="text-zinc-600 font-normal ml-1">洞察</span>
              </span>
            </div>
            <p className="text-xs text-zinc-700 leading-relaxed max-w-[200px]">
              {t("slogan")}
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-4">
              {t("product")}
            </h4>
            <ul className="space-y-2.5">
              <li>
                <Link href="/login" className="text-sm text-zinc-600 hover:text-zinc-400 transition-colors">
                  {t("login")}
                </Link>
              </li>
              <li>
                <Link href="/login?tab=register" className="text-sm text-zinc-600 hover:text-zinc-400 transition-colors">
                  {t("register")}
                </Link>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-4">
              {t("resources")}
            </h4>
            <ul className="space-y-2.5">
              <li>
                <Link href="/guide" className="text-sm text-zinc-600 hover:text-zinc-400 transition-colors">
                  {t("guide")}
                </Link>
              </li>
              <li>
                <a href="#data" className="text-sm text-zinc-600 hover:text-zinc-400 transition-colors">
                  {t("docs")}
                </a>
              </li>
              <li>
                <Link href="/guide#faq" className="text-sm text-zinc-600 hover:text-zinc-400 transition-colors">
                  {t("faq")}
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-4">
              {t("legal")}
            </h4>
            <ul className="space-y-2.5">
              <li>
                <span className="text-sm text-zinc-700">{t("terms")}</span>
              </li>
              <li>
                <span className="text-sm text-zinc-700">{t("privacy")}</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Risk disclaimer */}
        <div className="mt-12 pt-6 border-t border-white/[0.04]">
          <p className="text-xs text-zinc-700 leading-relaxed max-w-3xl">
            <span className="text-zinc-600 font-medium">{t("risk")}：</span>
            {t("riskText")}
          </p>
          <p className="mt-4 text-xs text-zinc-800">
            {t("copyright", { year: String(year) })}
          </p>
        </div>
      </div>
    </footer>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100">
      <LandingNav />
      <main>
        <HeroSection />
        <PainPointsSection />
        <CapabilitiesSection />
        <ModesSection />
        <ProductSection />
        <DataSection />
        <CTASection />
      </main>
      <LandingFooter />
    </div>
  );
}
