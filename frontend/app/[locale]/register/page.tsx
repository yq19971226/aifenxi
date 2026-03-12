"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { sendRegisterCode } from "@/lib/api/auth";

export default function RegisterPage() {
  const router = useRouter();
  const locale = useLocale();
  const { register: doRegister } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [codeSentHint, setCodeSentHint] = useState(false);
  const t = useTranslations("login");

  async function handleStep1(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setCodeSentHint(false);
    const formData = new FormData(e.currentTarget);
    const emailVal = (formData.get("email") as string)?.trim() || "";
    const passwordVal = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;
    const referral = (formData.get("referralCode") as string)?.trim() || "";

    if (passwordVal !== confirmPassword) {
      setError(t("errors.passwordMismatch"));
      setLoading(false);
      return;
    }
    if (passwordVal.length < 8) {
      setError(t("errors.passwordMinLength"));
      setLoading(false);
      return;
    }

    try {
      await sendRegisterCode(emailVal);
      setEmail(emailVal);
      setPassword(passwordVal);
      setReferralCode(referral);
      setStep(2);
      setCodeSentHint(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.registerCodeSendFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function handleStep2(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const formData = new FormData(e.currentTarget);
    const codeVal = (formData.get("code") as string)?.trim() || "";
    if (!codeVal || codeVal.length !== 6) {
      setError(t("errors.verificationCodeRequired"));
      setLoading(false);
      return;
    }

    try {
      await doRegister(email, password, codeVal, referralCode || undefined);
      router.push(`/${locale}/dashboard`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.registerFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout variant="register">
      {step === 1 ? (
        <form onSubmit={handleStep1} className="space-y-6">
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
            <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{t("fields.referralCodeOptional")}</label>
            <input
              name="referralCode"
              type="text"
              className="w-full h-12 bg-transparent border-b border-border focus:border-foreground outline-none transition-colors font-mono text-sm placeholder:text-muted-foreground/50"
              placeholder=""
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{t("fields.password")}</label>
              <input
                name="password"
                type="password"
                required
                minLength={8}
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
                minLength={8}
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
                {t("buttons.sendCode")} <ArrowRight size={18} />
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
      ) : (
        <form onSubmit={handleStep2} className="space-y-6">
          {codeSentHint && (
            <div className="p-3 rounded border border-bull/20 bg-bull/10 text-bull text-sm">
              {t("success.registerCodeSent")}
            </div>
          )}
          {error && (
            <div className="p-3 rounded border border-bear/20 bg-bear/10 text-bear text-sm flex items-center gap-2">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            {t("placeholders.verificationCode")}
          </p>
          <div className="space-y-2">
            <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{t("fields.verificationCode")}</label>
            <input
              name="code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full h-12 bg-transparent border-b border-border focus:border-foreground outline-none transition-colors font-mono text-sm placeholder:text-muted-foreground/50 text-center tracking-[0.5em]"
              placeholder="000000"
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
                {t("page.submitApplication")} <ArrowRight size={18} />
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => { setStep(1); setError(""); setCode(""); setCodeSentHint(false); }}
            className="w-full text-sm text-muted-foreground hover:text-foreground"
          >
            {t("layout.back")} · {t("placeholders.email")}
          </button>

          <div className="text-center mt-6">
            <span className="text-sm text-muted-foreground">{t("page.haveAccount")}</span>
            <Link href={`/${locale}/login`} className="text-sm font-medium text-foreground hover:underline underline-offset-4">
              {t("tabs.login")}
            </Link>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
