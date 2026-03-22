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
            <label className="text-[9px] font-mono text-zinc-500 uppercase tracking-[0.2em] ml-1 group-focus-within:text-[#00E5FF] transition-colors">{t("fields.referralCodeOptional")}</label>
            <div className="relative">
              <input
                name="referralCode"
                type="text"
                className="input font-mono text-base uppercase tracking-widest placeholder:tracking-normal"
                placeholder=""
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1 group">
              <label className="text-[9px] font-mono text-zinc-500 uppercase tracking-[0.2em] ml-1 group-focus-within:text-[#00E5FF] transition-colors">{t("fields.password")}</label>
              <div className="relative">
                <input
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  className="input font-mono text-base tracking-[0.2em] placeholder:tracking-normal"
                  placeholder="••••••••"
                />
              </div>
            </div>
            <div className="space-y-1 group">
              <label className="text-[9px] font-mono text-zinc-500 uppercase tracking-[0.2em] ml-1 group-focus-within:text-[#00E5FF] transition-colors">{t("page.confirm")}</label>
              <div className="relative">
                <input
                  name="confirmPassword"
                  type="password"
                  required
                  minLength={8}
                  className="input font-mono text-base tracking-[0.2em] placeholder:tracking-normal"
                  placeholder="••••••••"
                />
              </div>
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
                  GENERATE_ACCESS_KEY_ <span className="animate-pulse">_</span>
                </>
              )}
            </span>
          </button>

          <div className="text-center mt-6 pt-6 border-t border-white/[0.04]">
            <span className="text-[10px] font-mono text-zinc-400 tracking-widest uppercase">{t("page.haveAccount")}</span>
            <Link href={`/${locale}/login`} className="ml-3 text-[10px] font-mono font-bold tracking-[0.2em] text-white hover:text-[#00E5FF] transition-colors uppercase">
              AUTHENTICATE
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
          <div className="space-y-1 group mt-8">
            <label className="text-[9px] font-mono text-zinc-500 uppercase tracking-[0.2em] ml-1 group-focus-within:text-neon-cyan transition-colors">{t("fields.verificationCode")}</label>
            <div className="relative">
              <input
                name="code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="input h-14 font-mono text-2xl text-neon-cyan placeholder:text-zinc-500/50 tracking-[0.5em] text-center"
                placeholder="000000"
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
                  CONFIRM_ACCESS_ <span className="animate-pulse">_</span>
                </>
              )}
            </span>
          </button>

          <button
            type="button"
            onClick={() => { setStep(1); setError(""); setCode(""); setCodeSentHint(false); }}
            className="w-full text-[10px] font-mono font-bold uppercase tracking-widest text-zinc-500 hover:text-white transition-colors"
          >
            {t("layout.back")} · {email || t("placeholders.email")}
          </button>

          <div className="text-center mt-6 pt-6 border-t border-white/[0.04]">
            <span className="text-[10px] font-mono text-zinc-400 tracking-widest uppercase">{t("page.haveAccount")}</span>
            <Link href={`/${locale}/login`} className="ml-3 text-[10px] font-mono font-bold tracking-[0.2em] text-white hover:text-neon-cyan transition-colors uppercase">
              AUTHENTICATE
            </Link>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
