"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { LogoMark } from "@/components/ui/Logo";
import { ArrowLeft } from "lucide-react";

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[40%_60%] bg-bg-primary">
      {/* Left: Form Area */}
      <div className="relative flex flex-col justify-center px-4 sm:px-12 lg:px-20 py-12 border-r border-border bg-bg-primary z-10">
        <div className="absolute top-8 left-8">
          <Link href="/" className="flex items-center gap-2 group text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
            <span className="text-sm font-medium">Back</span>
          </Link>
        </div>
        
        <div className="w-full max-w-sm mx-auto">
          <div className="mb-10">
            <LogoMark className="h-10 w-10 text-foreground mb-6" />
            <h1 className="text-2xl font-bold tracking-tight mb-2">Welcome back.</h1>
            <p className="text-muted-foreground text-sm">Enter your credentials to access the terminal.</p>
          </div>
          {children}
        </div>
      </div>

      {/* Right: Visual Area */}
      <div className="hidden lg:flex relative items-center justify-center bg-bg-surface overflow-hidden">
        {/* Abstract Data Visualization */}
        <div className="absolute inset-0 opacity-20">
           <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-tr from-bull/20 via-transparent to-bear/20 rounded-full blur-3xl animate-pulse duration-[10000ms]" />
           <div className="absolute inset-0 bg-[linear-gradient(to_right,#333_1px,transparent_1px),linear-gradient(to_bottom,#333_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]" />
        </div>
        
        <div className="relative z-10 max-w-md text-center">
          <div className="text-6xl font-mono font-bold text-foreground/10 mb-4 select-none">AXIOM</div>
          <p className="text-sm font-mono text-muted-foreground tracking-widest uppercase">
            Truth is in the code.
          </p>
        </div>
      </div>
    </div>
  );
}
