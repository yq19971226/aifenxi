"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
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
    <div className="mt-6 flex gap-3 rounded-lg border border-blue-500/10 bg-blue-500/[0.04] px-4 py-3">
      <Lightbulb size={16} className="mt-0.5 shrink-0 text-blue-400" />
      <p className="text-sm text-blue-300/80 leading-relaxed">{children}</p>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-2 inline-block rounded bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400 align-middle">
      {children}
    </span>
  );
}

function StepList({ steps }: { steps: string[] }) {
  return (
    <ol className="mt-4 space-y-3">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-xs font-medium text-zinc-400">
            {i + 1}
          </span>
          <span className="text-sm text-zinc-400 leading-relaxed pt-0.5">{step}</span>
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
    <div className="mt-8">
      <h3 className="text-base font-medium text-zinc-200 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Paragraph({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <p className="text-sm text-zinc-400 leading-relaxed">
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <span key={i} className="font-medium text-zinc-300">
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
    <div className="border-b border-white/[0.06]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-4 text-left"
      >
        <span className="text-sm font-medium text-zinc-300 pr-4">{q}</span>
        {open ? (
          <ChevronUp size={16} className="shrink-0 text-zinc-600" />
        ) : (
          <ChevronDown size={16} className="shrink-0 text-zinc-600" />
        )}
      </button>
      {open && (
        <div className="pb-4">
          <p className="text-sm text-zinc-500 leading-relaxed">{a}</p>
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
    <nav className="space-y-1">
      {TOC_KEYS.map((key) => {
        const isActive = activeSection === key;
        return (
          <a
            key={key}
            href={`#${key}`}
            onClick={onSelect}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
              isActive
                ? "text-zinc-100 bg-white/[0.06]"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]"
            }`}
          >
            <ChevronRight
              size={12}
              className={isActive ? "text-zinc-400" : "text-zinc-700"}
            />
            {t(key)}
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
      <h2 className="text-xl font-semibold text-zinc-100 mb-3">{t("title")}</h2>
      <p className="text-sm text-zinc-500 leading-relaxed">{t("intro")}</p>

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
      <h2 className="text-xl font-semibold text-zinc-100 mb-3">{t("title")}</h2>
      <p className="text-sm text-zinc-500 leading-relaxed">{t("intro")}</p>

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
      <h2 className="text-xl font-semibold text-zinc-100 mb-3">{t("title")}</h2>
      <p className="text-sm text-zinc-500 leading-relaxed">{t("intro")}</p>

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
      <h2 className="text-xl font-semibold text-zinc-100 mb-3">{t("title")}</h2>
      <p className="text-sm text-zinc-500 leading-relaxed">{t("intro")}</p>

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
      <h2 className="text-xl font-semibold text-zinc-100 mb-3">{t("title")}</h2>
      <p className="text-sm text-zinc-500 leading-relaxed">{t("intro")}</p>

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
      <h2 className="text-xl font-semibold text-zinc-100 mb-3">{t("title")}</h2>
      <p className="text-sm text-zinc-500 leading-relaxed">{t("intro")}</p>

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
      <p className="text-sm text-zinc-500 leading-relaxed">{t("intro")}</p>

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
      <h2 className="text-xl font-semibold text-zinc-100 mb-3">{t("title")}</h2>
      <p className="text-sm text-zinc-500 leading-relaxed">{t("intro")}</p>

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
      <h2 className="text-xl font-semibold text-zinc-100 mb-6">{t("title")}</h2>
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-5">
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
    <div className="text-zinc-100">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/[0.04] bg-black/60 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <LogoMark size={20} />
              <span className="text-sm font-semibold">
                <span className="tracking-[0.16em] text-zinc-300">AXIOM</span>
                <span className="text-zinc-600 font-normal ml-1">洞察</span>
              </span>
            </Link>
            <span className="text-zinc-700">/</span>
            <span className="text-sm text-zinc-400">{t("title")}</span>
          </div>

          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link
              href="/"
              className="hidden sm:inline-flex text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <ArrowLeft size={14} className="mr-1.5" />
              {t("backHome")}
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
          <main className="min-w-0 flex-1 space-y-16">
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
