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
    <div className="min-h-screen grid lg:grid-cols-[40%_60%] bg-bg-primary">
      {/* Left: Form Area */}
      <div className="relative flex flex-col justify-center px-4 sm:px-12 lg:px-20 py-12 border-r border-border bg-bg-primary z-10 transition-all duration-500">
        <div className="absolute top-8 left-8">
          <Link href={`/${locale}`} className="flex items-center gap-2 group text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
            <span className="text-sm font-medium">{t("layout.back")}</span>
          </Link>
        </div>
        
        <div className="w-full max-w-sm mx-auto">
          <div className="mb-10">
            <LogoMark className="h-10 w-10 text-foreground mb-6" />
            <h1 className="text-2xl font-bold tracking-tight mb-2 text-zinc-100">{title}</h1>
            <p className="text-muted-foreground text-sm">{subtitle}</p>
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
