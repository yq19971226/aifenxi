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
            <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-[0.15em] ml-1">{t("fields.referralCodeOptional")}</label>
            <input
              name="referralCode"
              type="text"
              className="w-full h-12 bg-white/[0.02] border border-white/[0.06] focus:border-indigo-500/50 focus:bg-indigo-500/[0.02] hover:border-white/[0.1] rounded-xl px-4 outline-none transition-all font-mono text-sm text-white placeholder:text-zinc-600 focus:shadow-[0_0_15px_rgba(99,102,241,0.1)] uppercase tracking-[0.2em]"
              placeholder=""
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-[0.15em] ml-1">{t("fields.password")}</label>
              <input
                name="password"
                type="password"
                required
                minLength={8}
                className="w-full h-12 bg-white/[0.02] border border-white/[0.06] focus:border-indigo-500/50 focus:bg-indigo-500/[0.02] hover:border-white/[0.1] rounded-xl px-4 outline-none transition-all font-mono text-sm text-white placeholder:text-zinc-600 focus:shadow-[0_0_15px_rgba(99,102,241,0.1)] tracking-[0.2em]"
                placeholder="••••••••"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-[0.15em] ml-1">{t("page.confirm")}</label>
              <input
                name="confirmPassword"
                type="password"
                required
                minLength={8}
                className="w-full h-12 bg-white/[0.02] border border-white/[0.06] focus:border-indigo-500/50 focus:bg-indigo-500/[0.02] hover:border-white/[0.1] rounded-xl px-4 outline-none transition-all font-mono text-sm text-white placeholder:text-zinc-600 focus:shadow-[0_0_15px_rgba(99,102,241,0.1)] tracking-[0.2em]"
                placeholder="••••••••"
              />
            </div>
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
                {t("buttons.sendCode")} <ArrowRight size={18} />
              </>
            )}
          </button>

          <div className="text-center mt-6 pt-6 border-t border-white/[0.06]">
            <span className="text-sm font-medium text-zinc-500">{t("page.haveAccount")}</span>
            <Link href={`/${locale}/login`} className="ml-2 text-sm font-bold text-white hover:text-indigo-400 hover:drop-shadow-[0_0_8px_rgba(99,102,241,0.5)] transition-all">
              {t("tabs.login")}
            </Link>
          </div>
        </form>
      ) : (
        <form onSubmit={handleStep2} className="space-y-6">
          {codeSentHint && (
            <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-sm font-medium tracking-tight backdrop-blur-md">
              {t("success.registerCodeSent")}
            </div>
          )}
          {error && (
            <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 text-sm flex items-center gap-3 backdrop-blur-md">
              <AlertCircle size={18} className="shrink-0" />
              <span className="font-medium tracking-tight">{error}</span>
            </div>
          )}

          <p className="text-sm text-zinc-400 leading-relaxed">
            {t("placeholders.verificationCode")}
          </p>
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-[0.15em] ml-1">{t("fields.verificationCode")}</label>
            <input
              name="code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full h-14 bg-white/[0.02] border border-white/[0.06] focus:border-indigo-500/50 focus:bg-indigo-500/[0.02] hover:border-white/[0.1] rounded-xl px-4 outline-none transition-all font-mono text-xl text-white placeholder:text-zinc-700/50 text-center tracking-[0.5em] focus:shadow-[0_0_15px_rgba(99,102,241,0.1)]"
              placeholder="000000"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 bg-emerald-500 border border-emerald-400/50 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-emerald-400 hover:shadow-[0_0_25px_rgba(52,211,153,0.4)] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-3 mt-8 shadow-[0_0_15px_rgba(52,211,153,0.2)]"
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
            className="w-full text-sm font-bold text-zinc-500 hover:text-white transition-colors"
          >
            {t("layout.back")} · {t("placeholders.email")}
          </button>

          <div className="text-center mt-6 pt-6 border-t border-white/[0.06]">
            <span className="text-sm font-medium text-zinc-500">{t("page.haveAccount")}</span>
            <Link href={`/${locale}/login`} className="ml-2 text-sm font-bold text-white hover:text-indigo-400 hover:drop-shadow-[0_0_8px_rgba(99,102,241,0.5)] transition-all">
              {t("tabs.login")}
            </Link>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
