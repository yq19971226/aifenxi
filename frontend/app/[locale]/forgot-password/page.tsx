"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { ArrowLeft } from "lucide-react";

export default function ForgotPasswordPage() {
  const locale = useLocale();

  return (
    <AuthLayout>
      <div className="space-y-6 text-center">
        <h1 className="text-xl font-bold tracking-tight">
          {locale.startsWith("zh") ? "找回密码" : "Forgot Password"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {locale === "zh-CN"
            ? "请联系管理员或通过注册邮箱找回密码。"
            : locale === "zh-TW"
              ? "請聯繫管理員或透過註冊信箱找回密碼。"
              : "Please contact the administrator or use your registration email to reset your password."}
        </p>
        <Link
          href={`/${locale}/login`}
          className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:underline"
        >
          <ArrowLeft size={14} />
          {locale.startsWith("zh") ? "返回登录" : "Back to Login"}
        </Link>
      </div>
    </AuthLayout>
  );
}
