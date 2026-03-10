"use client";

import { Suspense, useState, useEffect, useMemo, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { sendRegisterCode } from "@/lib/api/auth";
import { LogoMark } from "@/components/ui/Logo";
import {
  Mail,
  Lock,
  KeyRound,
  Ticket,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Brain,
  Shield,
  Zap,
  BarChart3,
  ChevronLeft,
  Eye,
  EyeOff,
} from "lucide-react";

type TabType = "login" | "register" | "forgot";

function Spinner() {
  return (
    <span
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current"
      aria-hidden
    />
  );
}

function Field({
  label,
  icon,
  ...props
}: { label: string; icon?: ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  const [showPw, setShowPw] = useState(false);
  const isPassword = props.type === "password";

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
        {label}
      </label>
      <div className="relative group">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-zinc-400 transition-colors">
            {icon}
          </span>
        )}
        <input
          {...props}
          type={isPassword && showPw ? "text" : props.type}
          className={
            "w-full rounded-lg border border-white/[0.08] bg-white/[0.03] text-sm text-zinc-100 " +
            "placeholder:text-zinc-700 outline-none transition-all duration-200 " +
            "focus:border-white/[0.16] focus:bg-white/[0.05] focus:ring-1 focus:ring-white/[0.06] " +
            (icon ? "pl-10 " : "pl-4 ") +
            (isPassword ? "pr-10 " : "pr-4 ") +
            "py-3 " +
            (props.className || "")
          }
        />
        {isPassword && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowPw(!showPw)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-400 transition-colors"
          >
            {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        )}
      </div>
    </div>
  );
}

function PasswordStrength({ password, t: tr }: { password: string; t: (key: string) => string }) {
  const strength = useMemo(() => {
    if (!password) return { score: 0, label: "", color: "" };
    let s = 0;
    if (password.length >= 8) s++;
    if (password.length >= 12) s++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) s++;
    if (/\d/.test(password)) s++;
    if (/[^A-Za-z0-9]/.test(password)) s++;
    if (s <= 1) return { score: 1, label: tr('strength.weak'), color: "bg-red-500" };
    if (s <= 2) return { score: 2, label: tr('strength.fair'), color: "bg-yellow-500" };
    if (s <= 3) return { score: 3, label: tr('strength.good'), color: "bg-blue-500" };
    return { score: 4, label: tr('strength.strong'), color: "bg-emerald-500" };
  }, [password, tr]);

  if (!password) return null;

  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex gap-1 flex-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
              i <= strength.score ? strength.color : "bg-white/[0.06]"
            }`}
          />
        ))}
      </div>
      <span className={`text-sm ${
        strength.score <= 1 ? "text-red-400" :
        strength.score <= 2 ? "text-yellow-400" :
        strength.score <= 3 ? "text-blue-400" : "text-emerald-400"
      }`}>
        {strength.label}
      </span>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  desc,
  delay,
}: {
  icon: ReactNode;
  title: string;
  desc: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay }}
      className="flex gap-3.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.04]">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-200">{title}</p>
        <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{desc}</p>
      </div>
    </motion.div>
  );
}

function SubmitButton({ loading, children }: { loading: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className={
        "mt-3 flex h-11 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all duration-200 " +
        "bg-gradient-to-r from-zinc-100 to-zinc-300 text-zinc-900 " +
        "hover:from-white hover:to-zinc-200 hover:shadow-[0_0_20px_rgba(255,255,255,0.1)] " +
        "active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none"
      }
    >
      {loading ? <Spinner /> : (
        <>
          {children}
          <ArrowRight size={15} />
        </>
      )}
    </button>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const REGISTER_CODE_COOLDOWN_SECONDS = 60;
  const { user, loading, login, register } = useAuth();
  const router = useRouter();
  const t = useTranslations('login');

  const [tab, setTab] = useState<TabType>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [registerCode, setRegisterCode] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [registerEnabled, setRegisterEnabled] = useState(true);
  const [referralRequired, setReferralRequired] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sendingRegisterCode, setSendingRegisterCode] = useState(false);
  const [registerCodeCooldown, setRegisterCodeCooldown] = useState(0);
  const searchParams = useSearchParams();
  // forgot password state
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [codeSent, setCodeSent] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.push("/dashboard");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (registerCodeCooldown <= 0) {
      return;
    }
    const timer = window.setInterval(() => {
      setRegisterCodeCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [registerCodeCooldown]);

  // Parse URL params: ?tab=register to switch tab, ?ref= to pre-fill referral
  useEffect(() => {
    const tabParam = searchParams?.get("tab");
    if (tabParam === "register" && registerEnabled) {
      setTab("register");
    } else if (tabParam === "register") {
      setError(t('errors.registrationDisabled'));
    }
    const ref = searchParams?.get("ref");
    if (ref && registerEnabled) {
      setReferralCode(ref.toUpperCase().trim());
      setTab("register");
    }
  }, [searchParams, registerEnabled, t]);

  // Check if referral code is required (cached to avoid redundant requests)
  useEffect(() => {
    const CACHE_KEY = "register_config";
    const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const { value, ts } = JSON.parse(cached);
        if (Date.now() - ts < CACHE_TTL) {
          if (typeof value === "object" && value !== null) {
            setReferralRequired(!!value.referral_required);
            setRegisterEnabled(value.register_enabled !== false);
          } else {
            setReferralRequired(!!value);
            setRegisterEnabled(true);
          }
          return;
        }
      }
    } catch { /* ignore */ }

    const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
    fetch(`${API_BASE}/api/auth/register-config`)
      .then((r) => (r.ok ? r.json() : { referral_required: false }))
      .then((d) => {
        setReferralRequired(!!d.referral_required);
        setRegisterEnabled(d.register_enabled !== false);
        try {
          sessionStorage.setItem(
            CACHE_KEY,
            JSON.stringify({
              value: {
                referral_required: !!d.referral_required,
                register_enabled: d.register_enabled !== false,
              },
              ts: Date.now(),
            })
          );
        } catch { /* ignore */ }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!registerEnabled && tab === "register") {
      setTab("login");
      setError(t('errors.registrationDisabled'));
      setSuccess("");
    }
  }, [registerEnabled, tab, t]);

  function switchTab(next: TabType) {
    if (next === "register" && !registerEnabled) {
      setError(t('errors.registrationDisabled'));
      setSuccess("");
      return;
    }
    setTab(next);
    setError("");
    setSuccess("");
    setPassword("");
    setConfirmPassword("");
    setRegisterCode("");
    setResetCode("");
    setNewPassword("");
    setConfirmNewPassword("");
    setCodeSent(false);
  }

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);
    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      setError(msg.includes("fetch") ? t('errors.networkError') : msg || t('errors.loginFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegister(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!registerEnabled) {
      setError(t('errors.registrationDisabled'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('errors.passwordMismatch'));
      return;
    }
    if (password.length < 8) {
      setError(t('errors.passwordMinLength'));
      return;
    }
    if (!registerCode.trim()) {
      setError(t('errors.verificationCodeRequired'));
      return;
    }
    if (referralRequired && !referralCode.trim()) {
      setError(t('errors.referralRequired'));
      return;
    }
    setSubmitting(true);
    try {
      await register(email, password, registerCode.trim(), referralCode.trim() || undefined);
      router.push("/dashboard");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      setError(msg.includes("fetch") ? t('errors.networkError') : msg || t('errors.registerFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSendRegisterCode() {
    setError("");
    setSuccess("");
    if (!registerEnabled) {
      setError(t('errors.registrationDisabled'));
      return;
    }
    if (registerCodeCooldown > 0) {
      return;
    }
    if (!email.trim()) {
      setError(t('errors.emailRequired'));
      return;
    }
    setSendingRegisterCode(true);
    try {
      const res = await sendRegisterCode(email.trim());
      setSuccess(res.message || t('success.registerCodeSent'));
      setRegisterCodeCooldown(REGISTER_CODE_COOLDOWN_SECONDS);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      setError(msg.includes("fetch") ? t('errors.serverUnavailable') : msg || t('errors.registerCodeSendFailed'));
    } finally {
      setSendingRegisterCode(false);
    }
  }

  const API_BASE_FP = process.env.NEXT_PUBLIC_API_URL || "";

  async function handleForgotSendCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_FP}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || t('errors.sendFailed'));
      }
      setCodeSent(true);
      setSuccess(t('success.codeSent'));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      setError(msg.includes("fetch") ? t('errors.serverUnavailable') : msg || t('errors.sendFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmNewPassword) {
      setError(t('errors.passwordMismatch'));
      return;
    }
    if (newPassword.length < 8) {
      setError(t('errors.passwordMinLength'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_FP}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          code: resetCode,
          new_password: newPassword,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || t('errors.resetFailed'));
      }
      setSuccess(t('success.passwordReset'));
      switchTab("login");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      setError(msg.includes("fetch") ? t('errors.serverUnavailable') : msg || t('errors.resetFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090b]">
        <div className="flex flex-col items-center gap-3">
          <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-300" />
          <span className="text-xs text-zinc-500">{t('loading')}</span>
        </div>
      </div>
    );
  }

  const formVariants = {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
  };

  return (
    <div className="flex min-h-screen bg-[#09090b]">
      <div className="hidden lg:flex lg:w-[45%] relative flex-col justify-between border-r border-white/[0.06] px-12 py-12 overflow-hidden">
        <div className="pointer-events-none absolute -top-32 -left-32 h-[500px] w-[500px] rounded-full bg-blue-600/[0.06] blur-[120px]" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-indigo-600/[0.04] blur-[100px]" />
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[300px] w-[300px] rounded-full bg-emerald-600/[0.03] blur-[80px]" />

        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)`,
            backgroundSize: '60px 60px',
          }}
        />

        <div
          className="pointer-events-none absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          }}
        />

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="flex items-center gap-3 relative z-10"
        >
          <LogoMark size={28} glow />
          <span className="text-sm font-semibold text-zinc-400 select-none">
            <span className="tracking-[0.25em]">AXIOM</span>
            <span className="text-zinc-600 font-normal ml-1.5">洞察</span>
          </span>
        </motion.div>

        <div className="max-w-lg relative z-10 space-y-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <h1 className="text-[38px] font-semibold leading-[1.1] tracking-[-0.03em]">
              <span className="bg-gradient-to-br from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent">
                {t('features.heroTitle1')}
              </span>
              <br />
              <span className="bg-gradient-to-br from-zinc-100 via-zinc-300 to-zinc-600 bg-clip-text text-transparent">
                {t('features.heroTitle2')}
              </span>
            </h1>
            <div className="mt-6 flex items-start gap-3">
              <div className="mt-1.5 w-0.5 h-10 rounded-full bg-gradient-to-b from-blue-500 to-blue-500/0" />
              <p className="text-base leading-relaxed text-zinc-500">
                {t('features.heroSubtitle1')}
                <br />
                {t('features.heroSubtitle2')}
              </p>
            </div>
          </motion.div>

          <div className="space-y-3">
            <FeatureCard
              icon={<Brain size={16} className="text-blue-400" />}
              title={t('features.agentsTitle')}
              desc={t('features.agentsDesc')}
              delay={0.2}
            />
            <FeatureCard
              icon={<Shield size={16} className="text-emerald-400" />}
              title={t('features.defenseTitle')}
              desc={t('features.defenseDesc')}
              delay={0.35}
            />
            <FeatureCard
              icon={<Zap size={16} className="text-yellow-400" />}
              title={t('features.modesTitle')}
              desc={t('features.modesDesc')}
              delay={0.45}
            />
            <FeatureCard
              icon={<BarChart3 size={16} className="text-purple-400" />}
              title={t('features.precisionTitle')}
              desc={t('features.precisionDesc')}
              delay={0.65}
            />
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.7 }}
          className="relative z-10 flex items-center justify-between"
        >
          <div className="flex items-center gap-6">
            <div className="flex flex-col">
              <span className="text-lg font-bold font-mono text-zinc-300">10</span>
              <span className="text-xs text-zinc-500">{t('stats.agents')}</span>
            </div>
            <div className="h-6 w-px bg-white/[0.06]" />
            <div className="flex flex-col">
              <span className="text-lg font-bold font-mono text-zinc-300">4</span>
              <span className="text-xs text-zinc-500">{t('stats.models')}</span>
            </div>
            <div className="h-6 w-px bg-white/[0.06]" />
            <div className="flex flex-col">
              <span className="text-lg font-bold font-mono text-zinc-300">6</span>
              <span className="text-xs text-zinc-500">{t('stats.timeframes')}</span>
            </div>
          </div>
          <span className="text-xs text-zinc-700">&copy; 2025 AXIOM洞察</span>
        </motion.div>
      </div>

      <div className="flex flex-1 items-center justify-center bg-[#0c0c0f] px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="w-full max-w-[380px]"
        >
          {/* Mobile wordmark */}
          <p className="mb-10 text-sm font-semibold text-zinc-500 lg:hidden">
            <span className="tracking-[0.3em]">AXIOM</span>
            <span className="text-zinc-600 font-normal ml-1.5">洞察</span>
          </p>

          {tab !== "forgot" ? (
            <div className="mb-8 flex gap-1 rounded-lg bg-white/[0.03] border border-white/[0.06] p-1">
              {(["login", ...(registerEnabled ? ["register"] : [])] as const).map((tabKey) => (
                <button
                  key={tabKey}
                  type="button"
                  onClick={() => switchTab(tabKey)}
                  className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                    tab === tabKey
                      ? "bg-white/[0.08] text-zinc-100 shadow-sm"
                      : "text-zinc-500 hover:text-zinc-400"
                  }`}
                >
                  {t(`tabs.${tabKey}`)}
                </button>
              ))}
            </div>
          ) : (
            <div className="mb-8">
              <button
                type="button"
                onClick={() => switchTab("login")}
                className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-4"
              >
                <ChevronLeft size={14} />
                {t('forgot.backToLogin')}
              </button>
              <h2 className="text-xl font-medium text-zinc-100">{t('forgot.title')}</h2>
              <p className="text-sm text-zinc-500 mt-1">
                {codeSent ? t('forgot.promptCode') : t('forgot.promptSend')}
              </p>
            </div>
          )}

          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mb-5 flex items-start gap-2.5 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-4 py-3"
              >
                <AlertCircle size={15} className="text-red-400 mt-0.5 shrink-0" />
                <p className="text-sm text-red-300 leading-relaxed">{error}</p>
              </motion.div>
            )}
            {success && (
              <motion.div
                key="success"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mb-5 flex items-start gap-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3"
              >
                <CheckCircle2 size={15} className="text-emerald-400 mt-0.5 shrink-0" />
                <p className="text-sm text-emerald-300 leading-relaxed">{success}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {tab === "login" && (
              <motion.form
                key="login"
                variants={formVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.25 }}
                onSubmit={handleLogin}
                className="flex flex-col gap-5"
              >
                <Field
                  label={t('fields.email')}
                  icon={<Mail size={15} />}
                  type="email"
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <Field
                  label={t('fields.password')}
                  icon={<Lock size={15} />}
                  type="password"
                  placeholder={t('placeholders.password')}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <SubmitButton loading={submitting}>{t('buttons.login')}</SubmitButton>
                <button
                  type="button"
                  onClick={() => switchTab("forgot")}
                  className="self-center text-sm text-zinc-500 transition-colors hover:text-zinc-400"
                >
                  {t('forgot.link')}
                </button>
              </motion.form>
            )}

            {tab === "forgot" && (
              <motion.div
                key="forgot"
                variants={formVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.25 }}
                className="flex flex-col gap-5"
              >
                {!codeSent ? (
                  <form
                    onSubmit={handleForgotSendCode}
                    className="flex flex-col gap-5"
                  >
                    <Field
                      label={t('fields.registerEmail')}
                      icon={<Mail size={15} />}
                      type="email"
                      placeholder="you@example.com"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                    <SubmitButton loading={submitting}>{t('buttons.sendCode')}</SubmitButton>
                  </form>
                ) : (
                  <form
                    onSubmit={handleResetPassword}
                    className="flex flex-col gap-5"
                  >
                    <Field
                      label={t('fields.verificationCode')}
                      icon={<KeyRound size={15} />}
                      type="text"
                      placeholder="000000"
                      required
                      maxLength={6}
                      value={resetCode}
                      onChange={(e) =>
                        setResetCode(e.target.value.replace(/\D/g, ""))
                      }
                      className="text-center tracking-[0.3em] font-mono"
                    />
                    <div>
                      <Field
                        label={t('fields.newPassword')}
                        icon={<Lock size={15} />}
                        type="password"
                        placeholder={t('placeholders.minLength')}
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                      <PasswordStrength password={newPassword} t={t} />
                    </div>
                    <Field
                      label={t('fields.confirmNewPassword')}
                      icon={<Lock size={15} />}
                      type="password"
                      placeholder={t('placeholders.confirmNewPassword')}
                      required
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                    />
                    <SubmitButton loading={submitting}>{t('buttons.resetPassword')}</SubmitButton>
                  </form>
                )}
              </motion.div>
            )}

            {tab === "register" && (
              <motion.form
                key="register"
                variants={formVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.25 }}
                onSubmit={handleRegister}
                className="flex flex-col gap-5"
              >
                <Field
                  label={t('fields.email')}
                  icon={<Mail size={15} />}
                  type="email"
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <div>
                  <Field
                    label={t('fields.password')}
                    icon={<Lock size={15} />}
                    type="password"
                    placeholder={t('placeholders.minLength')}
                    required
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <PasswordStrength password={password} t={t} />
                </div>
                <Field
                  label={t('fields.confirmPassword')}
                  icon={<Lock size={15} />}
                  type="password"
                  placeholder={t('placeholders.confirmPassword')}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                <div className="flex flex-col gap-2">
                  <Field
                    label={t('fields.verificationCode')}
                    icon={<KeyRound size={15} />}
                    type="text"
                    inputMode="numeric"
                    placeholder={t('placeholders.verificationCode')}
                    required
                    value={registerCode}
                    onChange={(e) => setRegisterCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    maxLength={6}
                    className="text-center tracking-[0.3em] font-mono"
                  />
                  <button
                    type="button"
                    disabled={sendingRegisterCode || submitting || registerCodeCooldown > 0}
                    onClick={handleSendRegisterCode}
                    className="inline-flex h-10 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 text-sm font-medium text-zinc-200 transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {sendingRegisterCode
                      ? t('buttons.sendingCode')
                      : registerCodeCooldown > 0
                        ? `${registerCodeCooldown}s`
                        : t('buttons.sendCode')}
                  </button>
                </div>
                <Field
                  label={referralRequired ? t('fields.referralCode') : t('fields.referralCodeOptional')}
                  icon={<Ticket size={15} />}
                  type="text"
                  placeholder="ABCD1234"
                  required={referralRequired}
                  value={referralCode}
                  onChange={(e) =>
                    setReferralCode(e.target.value.toUpperCase())
                  }
                  maxLength={20}
                />
                <SubmitButton loading={submitting}>{t('buttons.register')}</SubmitButton>
              </motion.form>
            )}
          </AnimatePresence>

          <div className="mt-8 text-center space-y-2">
            <p className="text-sm text-zinc-700">{t('legal')}</p>
            <Link
              href="/guide"
              className="inline-block text-sm text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              {t('guideLink')}
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
