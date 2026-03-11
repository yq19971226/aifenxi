"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { LogoMark } from "@/components/ui/Logo";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { 
  Menu, 
  X, 
  Search,
  LayoutDashboard, 
  Brain, 
  Shield, 
  MoreHorizontal 
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

export function TopNav() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const t = useTranslations('nav');
  const locale = useLocale();

  return (
    <>
      {/* Mobile Top Bar */}
      <header className="md:hidden sticky top-0 z-50 flex h-14 w-full items-center justify-between border-b border-border bg-bg-primary/95 backdrop-blur-md px-4">
        <Link href="/" className="flex items-center gap-2">
          <LogoMark className="h-6 w-6 text-primary" />
          <span className="font-bold tracking-tight text-sm">AXIOM</span>
        </Link>

        <div className="flex items-center gap-4">
          <button className="text-muted-foreground hover:text-foreground">
            <Search size={20} />
          </button>
          <button 
            onClick={() => setMobileMenuOpen(true)}
            className="text-foreground"
          >
            <Menu size={24} />
          </button>
        </div>
      </header>

      {/* Mobile Bottom Bar - Essential Actions Only */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 h-16 border-t border-border bg-bg-primary/90 backdrop-blur-xl pb-safe">
        <div className="grid h-full grid-cols-4 items-center justify-items-center">
          <Link href={`/${locale}/dashboard`} className={cn("flex flex-col items-center gap-1", pathname.includes("/dashboard") ? "text-primary" : "text-muted-foreground")}>
            <LayoutDashboard size={20} />
            <span className="text-[10px] font-medium">{t('main.dashboard')}</span>
          </Link>
          <Link href={`/${locale}/consensus`} className={cn("flex flex-col items-center gap-1", pathname.includes("/consensus") ? "text-primary" : "text-muted-foreground")}>
            <Brain size={20} />
            <span className="text-[10px] font-medium">{t('main.consensus')}</span>
          </Link>
          <Link href={`/${locale}/alerts`} className={cn("flex flex-col items-center gap-1", pathname.includes("/alerts") ? "text-primary" : "text-muted-foreground")}>
            <Shield size={20} />
            <span className="text-[10px] font-medium">{t('main.alerts')}</span>
          </Link>
          <button 
            onClick={() => setMobileMenuOpen(true)}
            className="flex flex-col items-center gap-1 text-muted-foreground"
          >
            <MoreHorizontal size={20} />
            <span className="text-[10px] font-medium">{t('common.menu')}</span>
          </button>
        </div>
      </nav>

      {/* Full Screen Drawer for Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-[60] bg-bg-primary md:hidden flex flex-col"
          >
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <span className="font-bold">{t('common.menu')}</span>
              <button onClick={() => setMobileMenuOpen(false)}>
                <X size={24} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              <div className="space-y-4">
                <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{t('common.account')}</div>
                <div className="space-y-2">
                  <Link href={`/${locale}/settings`} className="block py-2 text-lg font-medium" onClick={() => setMobileMenuOpen(false)}>{t('main.settings')}</Link>
                  <Link href={`/${locale}/tasks`} className="block py-2 text-lg font-medium" onClick={() => setMobileMenuOpen(false)}>{t('main.growth')}</Link>
                </div>
              </div>
              
              <div className="space-y-4">
                 <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{t('common.system')}</div>
                 <LanguageSwitcher />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
