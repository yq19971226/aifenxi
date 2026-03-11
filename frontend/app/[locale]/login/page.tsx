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
          <div className="p-3 rounded border border-bear/20 bg-bear/10 text-bear text-sm flex items-center gap-2">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <div className="space-y-2">
          <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{t("fields.email")}</label>
          <input
            name="email"
            type="email"
            required
            className="w-full h-12 bg-transparent border-b border-border focus:border-foreground outline-none transition-colors font-mono text-sm placeholder:text-muted-foreground/50"
            placeholder={t("placeholders.email")}
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{t("fields.password")}</label>
            <Link href={`/${locale}/forgot-password`} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              {t("page.forgotLink")}
            </Link>
          </div>
          <input
            name="password"
            type="password"
            required
            className="w-full h-12 bg-transparent border-b border-border focus:border-foreground outline-none transition-colors font-mono text-sm placeholder:text-muted-foreground/50"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full h-12 bg-foreground text-bg-primary font-bold text-sm hover:bg-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 mt-8"
        >
          {loading ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <>
              {t("page.submitButton")} <ArrowRight size={18} />
            </>
          )}
        </button>

        <div className="text-center mt-6">
          <span className="text-sm text-muted-foreground">{t("page.noAccount")}</span>
          <Link href={`/${locale}/register`} className="text-sm font-medium text-foreground hover:underline underline-offset-4">
            {t("page.applyForAccess")}
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}
