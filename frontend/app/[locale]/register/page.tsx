"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { ArrowRight, Loader2, AlertCircle } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const locale = useLocale();
  const { register } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const t = useTranslations("login");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    
    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const username = formData.get("username") as string;
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (password !== confirmPassword) {
      setError(t("errors.passwordMismatch"));
      setLoading(false);
      return;
    }

    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      router.push(`/${locale}/login?registered=true`);
    } catch (err) {
      setError(t("errors.registerFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout variant="register">
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="p-3 rounded border border-bear/20 bg-bear/10 text-bear text-sm flex items-center gap-2">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <div className="space-y-2">
          <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{t("page.username")}</label>
          <input
            name="username"
            type="text"
            required
            className="w-full h-12 bg-transparent border-b border-border focus:border-foreground outline-none transition-colors font-mono text-sm placeholder:text-muted-foreground/50"
            placeholder={t("page.placeholderUsername")}
          />
        </div>

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

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{t("fields.password")}</label>
            <input
              name="password"
              type="password"
              required
              className="w-full h-12 bg-transparent border-b border-border focus:border-foreground outline-none transition-colors font-mono text-sm placeholder:text-muted-foreground/50"
              placeholder="••••••••"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{t("page.confirm")}</label>
            <input
              name="confirmPassword"
              type="password"
              required
              className="w-full h-12 bg-transparent border-b border-border focus:border-foreground outline-none transition-colors font-mono text-sm placeholder:text-muted-foreground/50"
              placeholder="••••••••"
            />
          </div>
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
              {t("page.submitApplication")} <ArrowRight size={18} />
            </>
          )}
        </button>

        <div className="text-center mt-6">
          <span className="text-sm text-muted-foreground">{t("page.haveAccount")}</span>
          <Link href={`/${locale}/login`} className="text-sm font-medium text-foreground hover:underline underline-offset-4">
            {t("tabs.login")}
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}
