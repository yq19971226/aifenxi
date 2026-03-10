"use client";

import { useEffect, useCallback } from "react";
import { AlertTriangle } from "lucide-react";

interface ConfirmDeployDialogProps {
  open: boolean;
  mode: "deploy" | "rollback";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDeployDialog({
  open,
  mode,
  onConfirm,
  onCancel,
}: ConfirmDeployDialogProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    },
    [onCancel],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onCancel}
    >
      <div
        className="mx-4 w-full max-w-md rounded-lg border border-white/[0.08] bg-zinc-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10">
            <AlertTriangle size={20} className="text-amber-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-zinc-100">
              {mode === "deploy" ? "确认系统更新" : "确认系统回退"}
            </h3>
            <p className="text-xs text-zinc-500">此操作将中断服务数分钟</p>
          </div>
        </div>
        <div className="mb-5 space-y-2 rounded-lg bg-white/[0.03] px-4 py-3 text-sm text-zinc-400">
          <p>{mode === "deploy" ? "更新过程将执行以下操作：" : "回退过程将执行以下操作："}</p>
          <ul className="ml-4 list-disc space-y-1 text-xs text-zinc-500">
            <li>备份数据库</li>
            <li>{mode === "deploy" ? "拉取最新代码" : "回退到上一个稳定版本"}</li>
            <li>重新构建 Docker 镜像</li>
            <li>重启所有服务容器</li>
            <li>自动健康检查</li>
          </ul>
          <p className="text-xs text-amber-400/80">
            ⚠ 更新期间所有用户将暂时无法访问系统
          </p>
        </div>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md bg-white/[0.06] px-4 py-2 text-sm text-zinc-400 hover:bg-white/[0.1]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500"
          >
            {mode === "deploy" ? "确认更新" : "确认回退"}
          </button>
        </div>
      </div>
    </div>
  );
}
