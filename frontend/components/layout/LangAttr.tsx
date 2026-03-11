"use client";

import { useLocale } from "next-intl";
import { useEffect } from "react";

/**
 * 根据当前 locale 设置 document.documentElement.lang，便于无障碍与 SEO。
 * 根 layout 的 <html> 无法拿到 [locale]，故在 [locale]/layout 内用客户端组件同步。
 */
export function LangAttr() {
  const locale = useLocale();

  useEffect(() => {
    if (typeof document !== "undefined" && document.documentElement) {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  return null;
}
