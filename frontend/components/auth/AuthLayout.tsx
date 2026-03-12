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
    <div className="min-h-screen grid lg:grid-cols-[40%_60%] bg-[#09090b] text-white">
      {/* Left: Form Area */}
      <div className="relative flex flex-col justify-center px-4 sm:px-12 lg:px-20 py-12 border-r border-white/[0.06] bg-[#09090b]/95 backdrop-blur-xl z-10 transition-all duration-500 overflow-hidden">
        {/* Background glow for the form area */}
        <div className="absolute top-0 left-0 w-full h-96 bg-indigo-500/5 blur-[100px] pointer-events-none" />

        <div className="absolute top-8 left-8 z-20">
          <Link href={`/${locale}`} className="flex items-center gap-2 group text-zinc-500 hover:text-white transition-colors">
            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
            <span className="text-sm font-bold uppercase tracking-widest">{t("layout.back")}</span>
          </Link>
        </div>
        
        <div className="w-full max-w-sm mx-auto relative z-20">
          <div className="mb-10 text-center lg:text-left">
            <LogoMark className="h-12 w-12 text-indigo-400 mb-6 mx-auto lg:mx-0 drop-shadow-[0_0_15px_rgba(99,102,241,0.5)]" />
            <h1 className="text-3xl font-black tracking-tight mb-2 text-white">{title}</h1>
            <p className="text-zinc-400 text-sm font-mono tracking-tight">{subtitle}</p>
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
