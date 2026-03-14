"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import {
  ArrowLeft,
  Lightbulb,
  ChevronRight,
  Construction,
  MessageCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { LogoMark } from "@/components/ui/Logo";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";

/* ------------------------------------------------------------------ */
/*  Shared UI                                                          */
/* ------------------------------------------------------------------ */

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-10 flex gap-3 relative border border-indigo-500/20 bg-indigo-500/10 px-6 py-4 pb-5 shadow-[0_0_20px_rgba(99,102,241,0.05)]">
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" />
      <span className="flex h-1.5 w-1.5 mt-2 shrink-0">
        <span className="animate-ping absolute inline-flex h-1.5 w-1.5 bg-indigo-400 opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 bg-indigo-500 shadow-[0_0_5px_rgba(99,102,241,0.8)]" />
      </span>
      <p className="text-[11px] text-indigo-300/90 leading-relaxed font-mono uppercase tracking-[0.2em]">{children}</p>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-3 inline-block border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[9px] font-black font-mono text-amber-500 tracking-[0.3em] transform -translate-y-1 shadow-[0_0_10px_rgba(245,158,11,0.2)]">
      {children}
    </span>
  );
}

function StepList({ steps }: { steps: string[] }) {
  return (
    <ol className="mt-8 space-y-6">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-5 group">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center bg-white/[0.02] border border-white/[0.1] text-[10px] font-black font-mono text-zinc-500 group-hover:bg-white/[0.05] group-hover:text-white group-hover:border-white/[0.3] transition-colors">
            0{i + 1}
          </span>
          <span className="text-xs text-zinc-400 leading-loose font-mono tracking-[0.15em] uppercase pt-0.5 group-hover:text-zinc-300 transition-colors">{step}</span>
        </li>
      ))}
    </ol>
  );
}

function SubSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-14">
      <h3 className="text-xs font-black text-white mb-6 tracking-[0.3em] uppercase flex items-center gap-3">
        <span className="w-2 h-2 bg-indigo-500/50 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
        {title}
      </h3>
      {children}
    </div>
  );
}

function Paragraph({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <p className="text-[11px] text-zinc-500 leading-[2.2] font-mono tracking-widest uppercase mb-6 hover:text-zinc-400 transition-colors">
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <span key={i} className="font-bold text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]">
            {part.slice(2, -2)}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/*  FAQ Accordion                                                      */
/* ------------------------------------------------------------------ */

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-white/[0.05]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="group flex w-full items-center justify-between py-6 text-left transition-colors hover:bg-white/[0.02] px-4"
      >
        <span className="text-[11px] font-bold font-mono tracking-widest uppercase text-zinc-400 group-hover:text-white transition-colors duration-300">
          <span className="text-indigo-500 mr-3">Q_</span>{q}
        </span>
        {open ? (
          <ChevronUp size={16} className="shrink-0 text-white" />
        ) : (
          <ChevronDown size={16} className="shrink-0 text-zinc-600 group-hover:text-indigo-400 transition-colors" />
        )}
      </button>
      {open && (
        <div className="pb-8 px-4">
          <p className="text-[11px] text-zinc-500 leading-loose font-mono tracking-widest uppercase border-l border-white/[0.05] pl-5 ml-[22px] relative">
            <span className="absolute -left-[5px] top-2 w-2 h-2 bg-emerald-500/20 rounded-full" />
            <span className="text-emerald-500 mr-3 font-bold opacity-80 shadow-[0_0_10px_rgba(16,185,129,0.3)]">A_</span>
            {a}
          </p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Table of Contents                                                  */
/* ------------------------------------------------------------------ */

const TOC_KEYS = [
  "quickStart",
  "dashboard",
  "consensus",
  "playbook",
  "leaderboard",
  "performance",
  "alerts",
  "push",
  "membership",
  "faq",
] as const;

function TableOfContents({
  activeSection,
  onSelect,
}: {
  activeSection: string;
  onSelect?: () => void;
}) {
  const t = useTranslations("guide.toc");

  return (
    <nav className="space-y-1.5 pr-6 border-r border-white/[0.05] relative">
      <div className="absolute top-0 right-0 w-[1px] h-full bg-gradient-to-b from-transparent via-indigo-500/20 to-transparent" />
      {TOC_KEYS.map((key) => {
        const isActive = activeSection === key;
        return (
          <a
            key={key}
            href={`#${key}`}
            onClick={onSelect}
            className={`group relative flex items-center justify-between py-2 text-[10px] uppercase font-bold font-mono tracking-[0.2em] transition-all duration-300 ${
              isActive
                ? "text-indigo-400 bg-white/[0.02]"
                : "text-zinc-600 hover:text-white"
            } px-3`}
          >
            {isActive && <div className="absolute -right-[1px] top-1/2 -translate-y-1/2 w-0.5 h-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,1)]" />}
            <span className="flex items-center gap-4">
              <span className={`w-1.5 h-1.5 ${isActive ? 'bg-indigo-500' : 'bg-white/10 group-hover:bg-white/30'} transition-colors`} />
              {t(key)}
            </span>
          </a>
        );
      })}
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/*  Sections                                                           */
/* ------------------------------------------------------------------ */

function QuickStartSection() {
  const t = useTranslations("guide.quickStart");
  return (
    <section id="quickStart">
      <h2 className="text-3xl lg:text-4xl font-black text-white mb-8 tracking-tighter uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.15)] opacity-90">{t("title")}</h2>
      <p className="text-xs text-zinc-500 leading-loose font-mono uppercase tracking-widest mb-10 pl-4 border-l border-white/10">{t("intro")}</p>

      {(["step1", "step2", "step3"] as const).map((key) => (
        <SubSection key={key} title={t(`${key}.title`)}>
          <Paragraph text={t(`${key}.desc`)} />
        </SubSection>
      ))}

      <Tip>{t("tip")}</Tip>
    </section>
  );
}

function DashboardSection() {
  const t = useTranslations("guide.dashboard");
  return (
    <section id="dashboard">
      <h2 className="text-3xl lg:text-4xl font-black text-white mb-8 tracking-tighter uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.15)] opacity-90">{t("title")}</h2>
      <p className="text-xs text-zinc-500 leading-loose font-mono uppercase tracking-widest mb-10 pl-4 border-l border-white/10">{t("intro")}</p>

      {(["signals", "opportunities", "risk"] as const).map((key) => (
        <SubSection key={key} title={t(`${key}.title`)}>
          <Paragraph text={t(`${key}.desc`)} />
        </SubSection>
      ))}

      <Tip>{t("tip")}</Tip>
    </section>
  );
}

function ConsensusSection() {
  const t = useTranslations("guide.consensus");
  const steps = t.raw("howTo.steps") as string[];
  return (
    <section id="consensus">
      <h2 className="text-3xl lg:text-4xl font-black text-white mb-8 tracking-tighter uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.15)] opacity-90">{t("title")}</h2>
      <p className="text-xs text-zinc-500 leading-loose font-mono uppercase tracking-widest mb-10 pl-4 border-l border-white/10">{t("intro")}</p>

      <SubSection title={t("howTo.title")}>
        <StepList steps={steps} />
      </SubSection>

      <SubSection title={t("readReport.title")}>
        <div className="space-y-4">
          {(["direction", "keyLevels", "weights", "divergence"] as const).map(
            (key) => (
              <Paragraph key={key} text={t(`readReport.${key}`)} />
            )
          )}
        </div>
      </SubSection>

      <SubSection title={t("modes.title")}>
        <div className="space-y-3">
          {(["scalping", "intraday", "trend"] as const).map((key) => (
            <Paragraph key={key} text={t(`modes.${key}`)} />
          ))}
        </div>
      </SubSection>

      <Tip>{t("tip")}</Tip>
    </section>
  );
}

function PlaybookSection() {
  const t = useTranslations("guide.playbook");
  return (
    <section id="playbook">
      <h2 className="text-3xl lg:text-4xl font-black text-white mb-8 tracking-tighter uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.15)] opacity-90">{t("title")}</h2>
      <p className="text-xs text-zinc-500 leading-loose font-mono uppercase tracking-widest mb-10 pl-4 border-l border-white/10">{t("intro")}</p>

      {(["what", "plaza", "posCalc"] as const).map((key) => (
        <SubSection key={key} title={t(`${key}.title`)}>
          <Paragraph text={t(`${key}.desc`)} />
        </SubSection>
      ))}

      <Tip>{t("tip")}</Tip>
    </section>
  );
}

function LeaderboardSection() {
  const t = useTranslations("guide.leaderboard");
  return (
    <section id="leaderboard">
      <h2 className="text-3xl lg:text-4xl font-black text-white mb-8 tracking-tighter uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.15)] opacity-90">{t("title")}</h2>
      <p className="text-xs text-zinc-500 leading-loose font-mono uppercase tracking-widest mb-10 pl-4 border-l border-white/10">{t("intro")}</p>

      {(["periods", "myStats"] as const).map((key) => (
        <SubSection key={key} title={t(`${key}.title`)}>
          <Paragraph text={t(`${key}.desc`)} />
        </SubSection>
      ))}

      <Tip>{t("tip")}</Tip>
    </section>
  );
}

function PerformanceSection() {
  const t = useTranslations("guide.performance");
  return (
    <section id="performance">
      <h2 className="text-3xl lg:text-4xl font-black text-white mb-8 tracking-tighter uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.15)] opacity-90">{t("title")}</h2>
      <p className="text-xs text-zinc-500 leading-loose font-mono uppercase tracking-widest mb-10 pl-4 border-l border-white/10">{t("intro")}</p>

      {(["stats", "backtest"] as const).map((key) => (
        <SubSection key={key} title={t(`${key}.title`)}>
          <Paragraph text={t(`${key}.desc`)} />
        </SubSection>
      ))}

      <Tip>{t("tip")}</Tip>
    </section>
  );
}

function DevSection({
  id,
  ns,
}: {
  id: string;
  ns: "guide.alerts" | "guide.push";
}) {
  const t = useTranslations(ns);
  const items = t.raw("planned.items") as string[];
  return (
    <section id={id}>
      <h2 className="text-xl font-semibold text-zinc-100 mb-3">
        {t("title")}
        <Badge>{t("badge")}</Badge>
      </h2>
      <p className="text-xs text-zinc-500 leading-loose font-mono uppercase tracking-widest mb-10 pl-4 border-l border-white/10">{t("intro")}</p>

      <SubSection title={t("planned.title")}>
        <ul className="space-y-2">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2 text-sm text-zinc-400">
              <Construction size={14} className="mt-0.5 shrink-0 text-amber-500/60" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </SubSection>

      <div className="mt-6 flex gap-2 items-start rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
        <MessageCircle size={14} className="mt-0.5 shrink-0 text-zinc-600" />
        <p className="text-sm text-zinc-600">{t("feedback")}</p>
      </div>
    </section>
  );
}

function MembershipSection() {
  const t = useTranslations("guide.membership");
  return (
    <section id="membership">
      <h2 className="text-3xl lg:text-4xl font-black text-white mb-8 tracking-tighter uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.15)] opacity-90">{t("title")}</h2>
      <p className="text-xs text-zinc-500 leading-loose font-mono uppercase tracking-widest mb-10 pl-4 border-l border-white/10">{t("intro")}</p>

      {(["free", "upgrade", "payment"] as const).map((key) => (
        <SubSection key={key} title={t(`${key}.title`)}>
          <Paragraph text={t(`${key}.desc`)} />
        </SubSection>
      ))}

      <Tip>{t("tip")}</Tip>
    </section>
  );
}

function FAQSection() {
  const t = useTranslations("guide.faq");
  const items = t.raw("items") as Array<{ q: string; a: string }>;
  return (
    <section id="faq">
      <h2 className="text-3xl lg:text-4xl font-black text-white mb-8 tracking-tighter uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.15)] opacity-90">{t("title")}</h2>
      <div className="border border-white/[0.05] bg-white/[0.01]">
        {items.map((item, i) => (
          <FAQItem key={i} q={item.q} a={item.a} />
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Guide                                                         */
/* ------------------------------------------------------------------ */

export function GuideContent() {
  const t = useTranslations("guide.nav");
  const locale = useLocale();
  const [activeSection, setActiveSection] = useState("quickStart");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const visibleSections = new Set<string>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visibleSections.add(entry.target.id);
          } else {
            visibleSections.delete(entry.target.id);
          }
        }
        for (const key of TOC_KEYS) {
          if (visibleSections.has(key)) {
            setActiveSection(key);
            break;
          }
        }
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );

    for (const key of TOC_KEYS) {
      const el = document.getElementById(key);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div className="text-white bg-black min-h-screen selection:bg-indigo-500/30 selection:text-white">
      {/* 极客深渊背景网络 */}
      <div className="fixed inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay pointer-events-none" />
      <div className="fixed inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />
      
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/[0.05] bg-black/80 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 relative z-10">
          <div className="flex items-center gap-6">
            <Link
              href={`/${locale}`}
              className="flex items-center gap-3 text-zinc-500 hover:text-indigo-400 transition-colors"
            >
              <LogoMark size={24} className="drop-shadow-[0_0_10px_rgba(99,102,241,0.5)]" />
              <span className="text-sm font-black">
                <span className="tracking-[0.2em] text-white">AXIOM</span>
              </span>
            </Link>
            <div className="h-4 w-px bg-white/10" />
            <span className="text-[10px] text-zinc-500 font-mono font-bold tracking-[0.2em] uppercase">{t("title")}</span>
          </div>

          <div className="flex items-center gap-6">
            <LanguageSwitcher />
            <Link
              href={`/${locale}`}
              className="hidden sm:inline-flex text-[10px] font-mono font-bold tracking-[0.2em] text-zinc-500 hover:text-white transition-colors uppercase"
            >
              [ {t("backHome")} ]
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex gap-10 pt-8 pb-20">
          {/* Sidebar — desktop */}
          <aside className="hidden lg:block w-56 shrink-0">
            <div className="sticky top-20">
              <p className="text-xs font-medium text-zinc-600 uppercase tracking-wider mb-4 px-3">
                {t("title")}
              </p>
              <TableOfContents activeSection={activeSection} />
            </div>
          </aside>

          {/* Mobile TOC toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="fixed bottom-6 right-6 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800 border border-white/[0.1] shadow-lg lg:hidden"
            aria-label="目录"
          >
            <ChevronUp
              size={18}
              className={`text-zinc-400 transition-transform ${mobileMenuOpen ? "rotate-180" : ""}`}
            />
          </button>

          {/* Mobile TOC panel */}
          {mobileMenuOpen && (
            <div className="fixed inset-x-0 bottom-20 z-30 mx-4 rounded-xl border border-white/[0.08] bg-[#111113] p-4 shadow-xl lg:hidden">
              <TableOfContents
                activeSection={activeSection}
                onSelect={() => setMobileMenuOpen(false)}
              />
            </div>
          )}

          {/* Content */}
          <main className="min-w-0 flex-1 space-y-32 relative z-10 py-10">
            <QuickStartSection />
            <DashboardSection />
            <ConsensusSection />
            <PlaybookSection />
            <LeaderboardSection />
            <PerformanceSection />
            <DevSection id="alerts" ns="guide.alerts" />
            <DevSection id="push" ns="guide.push" />
            <MembershipSection />
            <FAQSection />
          </main>
        </div>
      </div>
    </div>
  );
}
