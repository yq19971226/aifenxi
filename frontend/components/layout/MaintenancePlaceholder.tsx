"use client";

import { Wrench } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

interface MaintenancePlaceholderProps {
  featureName: string;
  message?: string;
}

export function MaintenancePlaceholder({
  featureName,
  message,
}: MaintenancePlaceholderProps) {
  const locale = useLocale();
  const t = useTranslations("common.maintenance");
  const displayMessage = message ?? t("message");
  return (
    <div className="flex flex-col items-center justify-center py-32 px-4">
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] p-8 max-w-md text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-amber-500/10">
          <Wrench size={24} className="text-amber-400" />
        </div>
        <h2 className="text-lg font-semibold text-white mb-2">{featureName}</h2>
        <p className="text-sm text-zinc-400 leading-relaxed mb-6">{displayMessage}</p>
        <Link
          href={`/${locale}/dashboard`}
          className="inline-flex items-center gap-2 rounded-lg bg-white/[0.06] px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-white/[0.1] transition-colors"
        >
          {t("backToDashboard")}
        </Link>
      </div>
    </div>
  );
}
