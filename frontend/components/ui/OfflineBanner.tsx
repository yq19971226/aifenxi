"use client";

import { useState, useEffect } from "react";
import { WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";

export function OfflineBanner() {
  const t = useTranslations("common.offline");
  const [isOffline, setIsOffline] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => {
      setIsOffline(false);
      setDismissed(false);
    };

    // Check initial state
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setIsOffline(true);
    }

    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);

    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (!isOffline || dismissed) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[9998] flex items-center justify-center gap-2 bg-amber-600/90 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm">
      <WifiOff size={14} />
      <span>{t("message")}</span>
      <button
        onClick={() => setDismissed(true)}
        className="ml-4 rounded px-2 py-0.5 text-sm bg-white/20 hover:bg-white/30 transition-colors"
      >
        {t("dismiss")}
      </button>
    </div>
  );
}
