"use client";

import { useState, useEffect } from "react";
import { WifiOff } from "lucide-react";

export function OfflineBanner() {
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
      <span>网络连接已断开，部分功能可能不可用</span>
      <button
        onClick={() => setDismissed(true)}
        className="ml-4 rounded px-2 py-0.5 text-sm bg-white/20 hover:bg-white/30 transition-colors"
      >
        关闭
      </button>
    </div>
  );
}
