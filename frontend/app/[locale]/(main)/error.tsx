"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function MainErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("页面错误:", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      <div className="max-w-sm text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-red-500/10">
          <AlertTriangle size={24} className="text-red-400" />
        </div>
        <h2 className="text-lg font-medium text-zinc-100">页面加载出错</h2>
        <p className="text-sm text-zinc-500">
          {error.message || "发生了未知错误，请稍后重试。"}
        </p>
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-white/[0.06] px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-white/[0.1]"
        >
          重试
        </button>
      </div>
    </div>
  );
}
