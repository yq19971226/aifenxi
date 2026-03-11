"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { ArrowRight, Loader2, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    
    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err) {
      setError("Invalid credentials. Please try again.");
    } finally {
      setLoading(false);
    }
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
          <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Email</label>
          <input
            name="email"
            type="email"
            required
            className="w-full h-12 bg-transparent border-b border-border focus:border-foreground outline-none transition-colors font-mono text-sm placeholder:text-muted-foreground/50"
            placeholder="name@example.com"
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Password</label>
            <Link href="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Forgot?
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
              Access Terminal <ArrowRight size={18} />
            </>
          )}
        </button>

        <div className="text-center mt-6">
          <span className="text-sm text-muted-foreground">Don't have an account? </span>
          <Link href="/register" className="text-sm font-medium text-foreground hover:underline underline-offset-4">
            Apply for access
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}
