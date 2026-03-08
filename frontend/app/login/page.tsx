"use client";

import { Suspense, useState, useEffect, useMemo, type FormEvent, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
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

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
type TabType = "login" | "register" | "forgot";

/* ------------------------------------------------------------------ */
/*  Spinner                                                            */
/* ------------------------------------------------------------------ */
function Spinner() {
  return (
    <span
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current"
      aria-hidden
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Icon input field                                                   */
/* ------------------------------------------------------------------ */
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
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-zinc-400 transition-colors">
            {icon}
          </span>
        )}
        <input
          {...props}
          type={isPassword && showPw ? "text" : props.type}
          className={
            "w-full rounded-xl border border-white/[0.08] bg-white/[0.03] text-sm text-zinc-100 " +
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
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Password strength indicator                                        */
/* ------------------------------------------------------------------ */
function PasswordStrength({ password }: { password: string }) {
  const strength = useMemo(() => {
    if (!password) return { score: 0, label: "", color: "" };
    let s = 0;
    if (password.length >= 8) s++;
    if (password.length >= 12) s++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) s++;
    if (/\d/.test(password)) s++;
    if (/[^A-Za-z0-9]/.test(password)) s++;
    if (s <= 1) return { score: 1, label: "弱", color: "bg-red-500" };
    if (s <= 2) return { score: 2, label: "一般", color: "bg-yellow-500" };
    if (s <= 3) return { score: 3, label: "良好", color: "bg-blue-500" };
    return { score: 4, label: "强", color: "bg-emerald-500" };
  }, [password]);

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

/* ------------------------------------------------------------------ */
/*  Feature card for left panel                                        */
/* ------------------------------------------------------------------ */
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
      className="flex gap-3.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
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

/* ------------------------------------------------------------------ */
/*  Submit button                                                      */
/* ------------------------------------------------------------------ */
function SubmitButton({ loading, children }: { loading: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className={
        "mt-3 flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-medium transition-all duration-200 " +
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

/* ------------------------------------------------------------------ */
/*  Entry point (Suspense boundary for useSearchParams)                */
/* ------------------------------------------------------------------ */
export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageInner />
    </Suspense>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */
function LoginPageInner() {
  const { user, loading, login, register } = useAuth();
  const router = useRouter();

  const [tab, setTab] = useState<TabType>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [referralRequired, setReferralRequired] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
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

  // Parse ?ref= from URL and pre-fill referral code
  useEffect(() => {
    const ref = searchParams?.get("ref");
    if (ref) {
      setReferralCode(ref.toUpperCase().trim());
      setTab("register");
    }
  }, [searchParams]);

  // Check if referral code is required
  useEffect(() => {
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
    fetch(`${API_BASE}/api/auth/register-config`)
      .then((r) => (r.ok ? r.json() : { referral_required: false }))
      .then((d) => setReferralRequired(!!d.referral_required))
      .catch(() => {});
  }, []);

  function switchTab(next: TabType) {
    setTab(next);
    setError("");
    setSuccess("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setResetCode("");
    setNewPassword("");
    setConfirmNewPassword("");
    setCodeSent(false);
    if (next === "login") setReferralCode("");
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
      setError(msg.includes("fetch") ? "无法连接服务器，请检查网络" : msg || "登录失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegister(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (password !== confirmPassword) {
      setError("两次密码不一致");
      return;
    }
    if (password.length < 8) {
      setError("密码至少8位");
      return;
    }
    if (referralRequired && !referralCode.trim()) {
      setError("请填写邀请码");
      return;
    }
    setSubmitting(true);
    try {
      await register(email, password, referralCode.trim() || undefined);
      router.push("/dashboard");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      setError(msg.includes("fetch") ? "无法连接服务器，请检查网络" : msg || "注册失败");
    } finally {
      setSubmitting(false);
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
        throw new Error(d.detail || "发送失败");
      }
      setCodeSent(true);
      setSuccess("验证码已发送到邮箱，请10分钟内有效");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      setError(msg.includes("fetch") ? "无法连接服务器" : msg || "发送失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmNewPassword) {
      setError("两次密码不一致");
      return;
    }
    if (newPassword.length < 8) {
      setError("密码至少8位");
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
        throw new Error(d.detail || "重置失败");
      }
      setSuccess("密码重置成功，请登录");
      switchTab("login");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      setError(msg.includes("fetch") ? "无法连接服务器" : msg || "重置失败");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090b]">
        <div className="flex flex-col items-center gap-3">
          <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-300" />
          <span className="text-xs text-zinc-600">{"加载中..."}</span>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Form animation config                                            */
  /* ---------------------------------------------------------------- */
  const formVariants = {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
  };

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */
  return (
    <div className="flex min-h-screen bg-[#09090b]">
      {/* ── Left brand panel ── */}
      <div className="hidden lg:flex lg:w-[45%] relative flex-col justify-between border-r border-white/[0.06] px-12 py-12 overflow-hidden">
        {/* Gradient orbs */}
        <div className="pointer-events-none absolute -top-32 -left-32 h-[500px] w-[500px] rounded-full bg-blue-600/[0.06] blur-[120px]" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-indigo-600/[0.04] blur-[100px]" />
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[300px] w-[300px] rounded-full bg-emerald-600/[0.03] blur-[80px]" />

        {/* Grid pattern overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)`,
            backgroundSize: '60px 60px',
          }}
        />

        {/* Noise texture overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          }}
        />

        {/* Wordmark */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="flex items-center gap-3 relative z-10"
        >
          <LogoMark size={28} glow />
          <span className="text-sm font-semibold tracking-[0.25em] text-zinc-400 select-none">
            AXIOM
          </span>
        </motion.div>

        {/* Tagline + Features */}
        <div className="max-w-lg relative z-10 space-y-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <h1 className="text-[38px] font-semibold leading-[1.1] tracking-[-0.03em]">
              <span className="bg-gradient-to-br from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent">
                Institutional-grade
              </span>
              <br />
              <span className="bg-gradient-to-br from-zinc-100 via-zinc-300 to-zinc-600 bg-clip-text text-transparent">
                market intelligence.
              </span>
            </h1>
            <div className="mt-6 flex items-start gap-3">
              <div className="mt-1.5 w-0.5 h-10 rounded-full bg-gradient-to-b from-blue-500 to-blue-500/0" />
              <p className="text-base leading-relaxed text-zinc-500">
                Multi-agent adversarial consensus engine.
                <br />
                See through the noise. Trade the script.
              </p>
            </div>
          </motion.div>

          {/* Feature cards */}
          <div className="space-y-3">
            <FeatureCard
              icon={<Brain size={16} className="text-blue-400" />}
              title={"10 AI 智能体协同"}
              desc={"多模型博弈共识，不止一个观点"}
              delay={0.3}
            />
            <FeatureCard
              icon={<Shield size={16} className="text-emerald-400" />}
              title={"庄家对抗防御"}
              desc={"站在庄家视角反推，识别操纵风险"}
              delay={0.4}
            />
            <FeatureCard
              icon={<Zap size={16} className="text-yellow-400" />}
              title={"三模式全覆盖"}
              desc={"超短线 / 日内博弈 / 趋势布局"}
              delay={0.5}
            />
            <FeatureCard
              icon={<BarChart3 size={16} className="text-purple-400" />}
              title={"精准非整数点位"}
              desc={"修正后的入场/止损，避开整数关口"}
              delay={0.6}
            />
          </div>
        </div>

        {/* Bottom bar: stats + copyright */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.7 }}
          className="relative z-10 flex items-center justify-between"
        >
          <div className="flex items-center gap-6">
            <div className="flex flex-col">
              <span className="text-lg font-bold font-mono text-zinc-300">10</span>
              <span className="text-xs text-zinc-600">AI 智能体</span>
            </div>
            <div className="h-6 w-px bg-white/[0.06]" />
            <div className="flex flex-col">
              <span className="text-lg font-bold font-mono text-zinc-300">4</span>
              <span className="text-xs text-zinc-600">共识模型</span>
            </div>
            <div className="h-6 w-px bg-white/[0.06]" />
            <div className="flex flex-col">
              <span className="text-lg font-bold font-mono text-zinc-300">6</span>
              <span className="text-xs text-zinc-600">时间周期</span>
            </div>
          </div>
          <span className="text-xs text-zinc-700">&copy; 2025 Axiom</span>
        </motion.div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex flex-1 items-center justify-center bg-[#0c0c0f] px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="w-full max-w-[380px]"
        >
          {/* Mobile wordmark */}
          <p className="mb-10 text-sm font-semibold tracking-[0.3em] text-zinc-500 lg:hidden">
            AXIOM
          </p>

          {/* Tabs */}
          {tab !== "forgot" ? (
            <div className="mb-8 flex gap-1 rounded-xl bg-white/[0.03] border border-white/[0.06] p-1">
              {(["login", "register"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => switchTab(t)}
                  className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                    tab === t
                      ? "bg-white/[0.08] text-zinc-100 shadow-sm"
                      : "text-zinc-500 hover:text-zinc-400"
                  }`}
                >
                  {t === "login" ? "登录" : "注册"}
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
                {"返回登录"}
              </button>
              <h2 className="text-xl font-medium text-zinc-100">{"重置密码"}</h2>
              <p className="text-sm text-zinc-500 mt-1">
                {codeSent ? "请输入邮箱中收到的验证码" : "输入注册邮箱，我们将发送验证码"}
              </p>
            </div>
          )}

          {/* Messages */}
          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3"
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
                className="mb-5 flex items-start gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3"
              >
                <CheckCircle2 size={15} className="text-emerald-400 mt-0.5 shrink-0" />
                <p className="text-sm text-emerald-300 leading-relaxed">{success}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Forms with AnimatePresence ── */}
          <AnimatePresence mode="wait">
            {/* ── Login ── */}
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
                  label={"邮箱"}
                  icon={<Mail size={15} />}
                  type="email"
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <Field
                  label={"密码"}
                  icon={<Lock size={15} />}
                  type="password"
                  placeholder="输入密码"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <SubmitButton loading={submitting}>{"登录"}</SubmitButton>
                <button
                  type="button"
                  onClick={() => switchTab("forgot")}
                  className="self-center text-sm text-zinc-600 transition-colors hover:text-zinc-400"
                >
                  {"忘记密码？"}
                </button>
              </motion.form>
            )}

            {/* ── Forgot password ── */}
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
                      label={"注册邮箱"}
                      icon={<Mail size={15} />}
                      type="email"
                      placeholder="you@example.com"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                    <SubmitButton loading={submitting}>{"发送验证码"}</SubmitButton>
                  </form>
                ) : (
                  <form
                    onSubmit={handleResetPassword}
                    className="flex flex-col gap-5"
                  >
                    <Field
                      label={"验证码"}
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
                        label={"新密码"}
                        icon={<Lock size={15} />}
                        type="password"
                        placeholder="至少 8 位"
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                      <PasswordStrength password={newPassword} />
                    </div>
                    <Field
                      label={"确认新密码"}
                      icon={<Lock size={15} />}
                      type="password"
                      placeholder="再次输入新密码"
                      required
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                    />
                    <SubmitButton loading={submitting}>{"重置密码"}</SubmitButton>
                  </form>
                )}
              </motion.div>
            )}

            {/* ── Register ── */}
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
                  label={"邮箱"}
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
                    label={"密码"}
                    icon={<Lock size={15} />}
                    type="password"
                    placeholder="至少 8 位"
                    required
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <PasswordStrength password={password} />
                </div>
                <Field
                  label={"确认密码"}
                  icon={<Lock size={15} />}
                  type="password"
                  placeholder="再次输入密码"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                <Field
                  label={referralRequired ? "邀请码" : "邀请码（选填）"}
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
                <SubmitButton loading={submitting}>{"创建账户"}</SubmitButton>
              </motion.form>
            )}
          </AnimatePresence>

          {/* Bottom note */}
          <p className="mt-8 text-center text-sm text-zinc-700">
            {"继续即表示同意 Axiom 的服务条款与隐私政策"}
          </p>
        </motion.div>
      </div>
    </div>
  );
}
