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

        <div className="space-y-2">
          <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-[0.15em] ml-1">{t("fields.email")}</label>
          <input
            name="email"
            type="email"
            required
            className="w-full h-12 bg-white/[0.02] border border-white/[0.06] focus:border-indigo-500/50 focus:bg-indigo-500/[0.02] hover:border-white/[0.1] rounded-xl px-4 outline-none transition-all font-mono text-sm text-white placeholder:text-zinc-600 focus:shadow-[0_0_15px_rgba(99,102,241,0.1)]"
            placeholder={t("placeholders.email")}
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center ml-1">
            <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-[0.15em]">{t("fields.password")}</label>
            <Link href={`/${locale}/forgot-password`} className="text-[11px] font-bold text-indigo-400/80 hover:text-indigo-400 transition-colors uppercase tracking-widest">
              {t("page.forgotLink")}
            </Link>
          </div>
          <input
            name="password"
            type="password"
            required
            className="w-full h-12 bg-white/[0.02] border border-white/[0.06] focus:border-indigo-500/50 focus:bg-indigo-500/[0.02] hover:border-white/[0.1] rounded-xl px-4 outline-none transition-all font-mono text-sm text-white placeholder:text-zinc-600 focus:shadow-[0_0_15px_rgba(99,102,241,0.1)] tracking-[0.2em]"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full h-12 bg-indigo-500 border border-indigo-400/50 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-indigo-400 hover:shadow-[0_0_25px_rgba(99,102,241,0.4)] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-3 mt-8 shadow-[0_0_15px_rgba(99,102,241,0.2)]"
        >
          {loading ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <>
              {t("page.submitButton")} <ArrowRight size={18} />
            </>
          )}
        </button>

        <div className="text-center mt-6 pt-6 border-t border-white/[0.06]">
          <span className="text-sm font-medium text-zinc-500">{t("page.noAccount")}</span>
          <Link href={`/${locale}/register`} className="ml-2 text-sm font-bold text-white hover:text-indigo-400 hover:drop-shadow-[0_0_8px_rgba(99,102,241,0.5)] transition-all">
            {t("page.applyForAccess")}
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}
