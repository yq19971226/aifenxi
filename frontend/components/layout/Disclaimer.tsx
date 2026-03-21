"use client";

import { useTranslations } from "next-intl";

/**
 * 全站底部免责声明 —— 同时用于 SEO 合规与 Google SafeBrowsing 信任
 * 置于 main layout 页面底部，对登录后的所有页面可见
 */
export function Disclaimer() {
  const t = useTranslations("common");

  return (
    <footer className="mt-auto border-t border-white/[0.04] bg-black/20 px-4 py-6 text-center">
      <p className="mx-auto max-w-3xl text-[10px] leading-relaxed text-zinc-500/70 font-sans">
        {t("disclaimer")}
      </p>
    </footer>
  );
}
