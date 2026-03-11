"use client";

import { useEffect, useCallback, useState } from "react";
import { AlertTriangle } from "lucide-react";

interface ConfirmDeployDialogProps {
  open: boolean;
  mode: "deploy" | "rollback";
  onConfirm: (target?: string) => void;
  onCancel: () => void;
}

export function ConfirmDeployDialog({
  open,
  mode,
  onConfirm,
  onCancel,
}: ConfirmDeployDialogProps) {
  const [target, setTarget] = useState("");
  const [confirmText, setConfirmText] = useState("");

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setTarget("");
        setConfirmText("");
        onCancel();
      }
    },
    [onCancel],
  );

  useEffect(() => {
    if (!open) {
      setTarget("");
      setConfirmText("");
      return;
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open) return null;

  const isConfirmed = confirmText === "CONFIRM";
  
  const handleConfirmAction = () => {
    if (isConfirmed) {
      onConfirm(target.trim() || undefined);
    }
  };

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

        <div className="mb-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-300">
              目标 Commit/Tag（可选）
            </label>
            <input
              type="text"
              className="w-full rounded bg-black/40 px-3 py-2 text-sm text-zinc-200 outline-none border border-white/[0.08] focus:border-amber-500/50"
              placeholder={mode === "deploy" ? "留空则拉取最新代码" : "留空则回退到上个版本"}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-300">
              为防止手滑，请输入 <span className="text-white font-mono bg-white/[0.1] px-1 rounded">CONFIRM</span> 以确认
            </label>
            <input
              type="text"
              className="w-full rounded bg-black/40 px-3 py-2 text-sm text-zinc-200 outline-none border border-white/[0.08] focus:border-amber-500/50"
              placeholder="CONFIRM"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => {
              setTarget("");
              setConfirmText("");
              onCancel();
            }}
            className="rounded-md bg-white/[0.06] px-4 py-2 text-sm text-zinc-400 hover:bg-white/[0.1]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirmAction}
            disabled={!isConfirmed}
            className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {mode === "deploy" ? "确认更新" : "确认回退"}
          </button>
        </div>
      </div>
    </div>
  );
}
