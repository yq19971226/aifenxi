"use client";

import React from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { LogoMark } from "@/components/ui/Logo";
import { ArrowLeft } from "lucide-react";
import { AuthVisualizer } from "./AuthVisualizer";

export function AuthLayout({ children, variant = "login" }: { children: React.ReactNode; variant?: "login" | "register" }) {
  const locale = useLocale();
  const t = useTranslations("login");
  const title = variant === "register" ? t("tabs.register") : t("layout.welcomeTitle");
  const subtitle = variant === "register" ? t("layout.registerSubtitle") : t("layout.welcomeSubtitle");
  
  return (
    <div className="min-h-screen grid lg:grid-cols-[45%_55%] bg-black text-white selection:bg-indigo-500/30">
      {/* Left: Form Area */}
      <div className="relative flex flex-col justify-center px-4 sm:px-12 lg:px-20 py-12 border-r border-white/[0.04] bg-black/60 backdrop-blur-3xl z-10 transition-all duration-500 overflow-hidden">
        {/* Spotlight Effect for the form area */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-lg h-96 bg-indigo-500/10 blur-[120px] pointer-events-none mix-blend-screen" />

        <div className="absolute top-8 left-8 z-20">
          <Link href={`/${locale}`} className="flex items-center gap-2 group text-zinc-500 hover:text-white transition-colors">
            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
            <span className="text-sm font-bold uppercase tracking-widest">{t("layout.back")}</span>
          </Link>
        </div>
        
        <div className="w-full max-w-sm mx-auto relative z-20">
          <div className="mb-10 text-center lg:text-left">
            <LogoMark className="h-10 w-10 text-indigo-400 mb-6 mx-auto lg:mx-0 drop-shadow-[0_0_20px_rgba(99,102,241,0.6)]" />
            <h1 className="text-3xl font-black tracking-tighter mb-2 text-white/90">{title}</h1>
            <p className="text-zinc-500 text-sm font-mono tracking-widest uppercase">{subtitle}</p>
          </div>
          {children}
        </div>
      </div>

      {/* Right: Visual Area - Rebuilt for 2026 Geek/Cold aesthetics */}
      <div className="hidden lg:block relative overflow-hidden bg-black">
        <AuthVisualizer />
      </div>
    </div>
  );
}
