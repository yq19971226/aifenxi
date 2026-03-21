"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { ArrowLeft, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { forgotPassword, resetPassword } from "@/lib/api/auth";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("login");

  const [step, setStep] = useState<1 | 2 | 3>(1); // 1=填邮箱, 2=填验证码+新密码, 3=成功
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sentHint, setSentHint] = useState(false);

  // Step 1: 发送验证码
  async function handleStep1(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSentHint(false);
    const fd = new FormData(e.currentTarget);
    const emailVal = (fd.get("email") as string)?.trim() || "";
    try {
      await forgotPassword(emailVal);
      setEmail(emailVal);
      setStep(2);
      setSentHint(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.sendFailed"));
    } finally {
      setLoading(false);
    }
  }

  // Step 2: 验证码 + 新密码
  async function handleStep2(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const codeVal = (fd.get("code") as string)?.trim() || "";
    const newPwd = fd.get("newPassword") as string;
    const confirmPwd = fd.get("confirmPassword") as string;

    if (newPwd !== confirmPwd) {
      setError(t("errors.passwordMismatch"));
      setLoading(false);
      return;
    }
    if (newPwd.length < 8) {
      setError(t("errors.passwordMinLength"));
      setLoading(false);
      return;
    }

    try {
      await resetPassword(email, codeVal, newPwd);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.resetFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout>
      {step === 1 && (
        <form onSubmit={handleStep1} className="space-y-6">
          <div className="mb-2">
            <p className="text-[9px] font-mono text-zinc-500 uppercase tracking-[0.2em]">
              {t("forgot.title")}
            </p>
            <p className="text-xs text-zinc-600 font-mono mt-1 leading-relaxed">
              {t("forgot.promptSend")}
            </p>
          </div>

          {error && (
            <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 text-sm flex items-center gap-3 backdrop-blur-md">
              <AlertCircle size={18} className="shrink-0" />
              <span className="font-medium tracking-tight">{error}</span>
            </div>
          )}

          <div className="space-y-1 group">
            <label className="text-[9px] font-mono text-zinc-500 uppercase tracking-[0.2em] ml-1 group-focus-within:text-indigo-400 transition-colors">
              {t("fields.email")}
            </label>
            <div className="relative">
              <input
                name="email"
                type="email"
                required
                className="w-full h-10 bg-transparent border-b border-white/[0.1] focus:border-indigo-500 px-1 outline-none transition-all font-mono text-base text-white placeholder:text-zinc-700/50"
                placeholder="user@system.com"
              />
              <div className="absolute bottom-0 left-0 h-[1px] w-0 bg-indigo-400 opacity-0 group-focus-within:w-full group-focus-within:opacity-100 transition-all duration-500 shadow-[0_0_10px_rgba(99,102,241,0.8)]" />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full relative group h-12 bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 rounded-none font-mono text-[11px] uppercase tracking-[0.3em] overflow-hidden transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-10"
          >
            <div className="absolute inset-0 bg-indigo-500/20 w-0 group-hover:w-full transition-all duration-500 ease-out z-0" />
            <span className="relative z-10 flex items-center justify-center gap-3">
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>SEND_RESET_CODE_ <span className="animate-pulse">_</span></>
              )}
            </span>
          </button>

          <div className="text-center mt-6 pt-6 border-t border-white/[0.04]">
            <Link
              href={`/${locale}/login`}
              className="inline-flex items-center gap-2 text-[10px] font-mono font-bold tracking-[0.2em] text-zinc-500 hover:text-white transition-colors uppercase"
            >
              <ArrowLeft size={12} />
              {t("forgot.backToLogin")}
            </Link>
          </div>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={handleStep2} className="space-y-6">
          {sentHint && (
            <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-sm font-medium tracking-tight backdrop-blur-md">
              {t("success.codeSentWithEmail", { email })}
            </div>
          )}
          {error && (
            <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 text-sm flex items-center gap-3 backdrop-blur-md">
              <AlertCircle size={18} className="shrink-0" />
              <span className="font-medium tracking-tight">{error}</span>
            </div>
          )}

          {/* 验证码 */}
          <div className="space-y-1 group">
            <label className="text-[9px] font-mono text-zinc-500 uppercase tracking-[0.2em] ml-1 group-focus-within:text-emerald-400 transition-colors">
              {t("fields.verificationCode")}
            </label>
            <div className="relative">
              <input
                name="code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="w-full h-14 bg-transparent border-b border-white/[0.1] focus:border-emerald-500 px-1 outline-none transition-all font-mono text-2xl text-emerald-400 placeholder:text-zinc-700/50 tracking-[0.5em] text-center"
                placeholder="000000"
              />
              <div className="absolute bottom-0 left-0 h-[1px] w-0 bg-emerald-400 opacity-0 group-focus-within:w-full group-focus-within:opacity-100 transition-all duration-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
            </div>
          </div>

          {/* 新密码 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1 group">
              <label className="text-[9px] font-mono text-zinc-500 uppercase tracking-[0.2em] ml-1 group-focus-within:text-indigo-400 transition-colors">
                {t("fields.newPassword")}
              </label>
              <div className="relative">
                <input
                  name="newPassword"
                  type="password"
                  required
                  minLength={8}
                  className="w-full h-10 bg-transparent border-b border-white/[0.1] focus:border-indigo-500 px-1 outline-none transition-all font-mono text-base text-white placeholder:text-zinc-700/50 tracking-[0.2em]"
                  placeholder="••••••••"
                />
                <div className="absolute bottom-0 left-0 h-[1px] w-0 bg-indigo-400 opacity-0 group-focus-within:w-full group-focus-within:opacity-100 transition-all duration-500 shadow-[0_0_10px_rgba(99,102,241,0.8)]" />
              </div>
            </div>
            <div className="space-y-1 group">
              <label className="text-[9px] font-mono text-zinc-500 uppercase tracking-[0.2em] ml-1 group-focus-within:text-indigo-400 transition-colors">
                {t("page.confirm")}
              </label>
              <div className="relative">
                <input
                  name="confirmPassword"
                  type="password"
                  required
                  minLength={8}
                  className="w-full h-10 bg-transparent border-b border-white/[0.1] focus:border-indigo-500 px-1 outline-none transition-all font-mono text-base text-white placeholder:text-zinc-700/50 tracking-[0.2em]"
                  placeholder="••••••••"
                />
                <div className="absolute bottom-0 left-0 h-[1px] w-0 bg-indigo-400 opacity-0 group-focus-within:w-full group-focus-within:opacity-100 transition-all duration-500 shadow-[0_0_10px_rgba(99,102,241,0.8)]" />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full relative group h-12 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-none font-mono text-[11px] uppercase tracking-[0.3em] overflow-hidden transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-10"
          >
            <div className="absolute inset-0 bg-emerald-500/20 w-0 group-hover:w-full transition-all duration-500 ease-out z-0" />
            <span className="relative z-10 flex items-center justify-center gap-3">
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>CONFIRM_RESET_ <span className="animate-pulse">_</span></>
              )}
            </span>
          </button>

          <button
            type="button"
            onClick={() => { setStep(1); setError(""); setCode(""); setSentHint(false); }}
            className="w-full text-[10px] font-mono font-bold uppercase tracking-widest text-zinc-500 hover:text-white transition-colors"
          >
            {t("layout.back")} · {email}
          </button>
        </form>
      )}

      {step === 3 && (
        <div className="space-y-8 text-center">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
          </div>
          <div>
            <p className="text-[9px] font-mono text-zinc-500 uppercase tracking-[0.2em] mb-3">
              {t("forgot.resetSuccess")}
            </p>
            <p className="text-xs text-zinc-600 font-mono leading-relaxed">
              {t("forgot.loginWithNewPassword")}
            </p>
          </div>
          <button
            onClick={() => router.push(`/${locale}/login`)}
            className="w-full relative group h-12 bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 rounded-none font-mono text-[11px] uppercase tracking-[0.3em] overflow-hidden transition-all"
          >
            <div className="absolute inset-0 bg-indigo-500/20 w-0 group-hover:w-full transition-all duration-500 ease-out z-0" />
            <span className="relative z-10 flex items-center justify-center gap-3">
              AUTHENTICATE_ <span className="animate-pulse">_</span>
            </span>
          </button>
        </div>
      )}
    </AuthLayout>
  );
}
