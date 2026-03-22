"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { ArrowRight, Loader2, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const locale = useLocale();
  const { user, loading: authLoading, login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const t = useTranslations("login");

  useEffect(() => {
    if (authLoading) return;
    if (user) {
      router.replace(`/${locale}/dashboard`);
    }
  }, [user, authLoading, locale, router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    
    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    try {
      await login(email, password);
      router.push(`/${locale}/dashboard`);
    } catch (err) {
      setError(t("page.errorInvalidCredentials"));
    } finally {
      setLoading(false);
    }
  }

  if (authLoading || user) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 text-sm flex items-center gap-3 backdrop-blur-md">
            <AlertCircle size={18} className="shrink-0" />
            <span className="font-medium tracking-tight">{error}</span>
          </div>
        )}

        <div className="space-y-1 group">
          <label className="text-[9px] font-mono text-zinc-500 uppercase tracking-[0.2em] ml-1 group-focus-within:text-[#00E5FF] transition-colors">{t("fields.email")}</label>
          <div className="relative">
            <input
              name="email"
              type="email"
              required
              className="input font-mono text-base tracking-widest placeholder:tracking-normal"
              placeholder="user@system.com"
            />
          </div>
        </div>

        <div className="space-y-1 group">
          <div className="flex justify-between items-center ml-1">
            <label className="text-[9px] font-mono text-zinc-500 uppercase tracking-[0.2em] group-focus-within:text-[#00E5FF] transition-colors">{t("fields.password")}</label>
            <Link href={`/${locale}/forgot-password`} className="text-[9px] font-mono text-zinc-400 hover:text-[#00E5FF] transition-colors uppercase tracking-[0.2em]">
              {t("page.forgotLink")}
            </Link>
          </div>
          <div className="relative">
            <input
              name="password"
              type="password"
              required
              className="input font-mono text-base tracking-[0.2em] placeholder:tracking-normal"
              placeholder="••••••••"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full btn-primary h-12 font-mono text-[11px] uppercase tracking-[0.3em] overflow-hidden transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-10"
        >
          <span className="relative z-10 flex items-center justify-center gap-3">
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <>
                {t("page.submitButton")} <span className="animate-pulse">_</span>
              </>
            )}
          </span>
        </button>

        <div className="text-center mt-6 pt-6 border-t border-white/[0.04]">
          <span className="text-[10px] font-mono text-zinc-400 tracking-widest uppercase">{t("page.noAccount")}</span>
          <Link href={`/${locale}/register`} className="ml-3 text-[10px] font-mono font-bold tracking-[0.2em] text-white hover:text-[#00E5FF] transition-colors uppercase">
            {t("page.applyForAccess")}
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}
