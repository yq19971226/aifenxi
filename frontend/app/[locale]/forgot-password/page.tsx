"use client";

import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { ArrowLeft } from "lucide-react";

export default function ForgotPasswordPage() {
  const locale = useLocale();
  const t = useTranslations("login");

  return (
    <AuthLayout>
      <div className="space-y-6 text-center">
        <h1 className="text-xl font-bold tracking-tight">
          {t("forgot.title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("forgot.contactPrompt")}
        </p>
        <Link
          href={`/${locale}/login`}
          className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:underline"
        >
          <ArrowLeft size={14} />
          {t("forgot.backToLogin")}
        </Link>
      </div>
    </AuthLayout>
  );
}
