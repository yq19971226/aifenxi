"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Server,
  GitBranch,
  ArrowDownCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import {
  fetchSystemStatus,
  startDeploy,
  startRollback,
  type SystemStatus,
  type DeployEvent,
} from "@/lib/api/admin-system";
import { ConfirmDeployDialog } from "./ConfirmDeployDialog";
import { ContainerList } from "./ContainerList";

export default function AdminSystemPage() {
  const t = useTranslations("admin");
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [deploying, setDeploying] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [deployResult, setDeployResult] = useState<"success" | "error" | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [actionMode, setActionMode] = useState<"deploy" | "rollback">("deploy");
  const [refreshCountdown, setRefreshCountdown] = useState<number | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const isAdmin = user?.role === "admin";

  const {
    data: status,
    isLoading,
    refetch,
  } = useQuery<SystemStatus>({
    queryKey: ["admin-system-status"],
    queryFn: fetchSystemStatus,
    refetchInterval: deploying ? 5000 : 30000,
    retry: 1,
    enabled: isAdmin,
  });

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    if (refreshCountdown === null || refreshCountdown <= 0) return;
    const timer = setTimeout(() => {
      if (refreshCountdown === 1) {
        window.location.reload();
      } else {
        setRefreshCountdown(refreshCountdown - 1);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [refreshCountdown]);

  const pollFinalResult = useCallback(async () => {
    setLogs((prev) => [...prev, "[log] SSE 连接中断（后端正在重启），轮询最终结果..."]);
    for (let i = 0; i < 24; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      try {
        const st = await fetchSystemStatus();
        if (!st.deploying) {
          const ok = st.last_deploy?.success ?? false;
          setDeployResult(ok ? "success" : "error");
          setLogs((prev) => [
            ...prev,
            ok
              ? `[done] 部署成功 (版本 ${st.last_deploy?.commit})`
              : "[error] 部署失败，请检查服务器日志",
          ]);
          setDeploying(false);
          queryClient.invalidateQueries({ queryKey: ["admin-system-status"] });
          if (ok) setRefreshCountdown(8);
          return;
        }
        setLogs((prev) => [...prev, `[log] 部署仍在进行中... (${(i + 1) * 5}s)`]);
      } catch {
        setLogs((prev) => [...prev, `[log] 服务暂不可用，继续等待... (${(i + 1) * 5}s)`]);
      }
    }
    setLogs((prev) => [...prev, "[error] 轮询超时（120s），请手动检查服务器状态"]);
    setDeployResult("error");
    setDeploying(false);
  }, [queryClient]);

  const handleAction = useCallback(async (targetCommit?: string) => {
    if (deploying) return;
    setShowConfirm(false);
    setDeploying(true);
    setLogs([]);
    setDeployResult(null);
    setRefreshCountdown(null);

    try {
      if (actionMode === "rollback") {
        await startRollback(
          targetCommit ? { target: targetCommit } : {},
          (event: DeployEvent) => {
            setLogs((prev) => [...prev, `[${event.type}] ${event.data}`]);
            if (event.type === "done") {
              setDeployResult("success");
              setRefreshCountdown(8);
            }
            if (event.type === "error") setDeployResult("error");
          },
          () => {
            setDeploying(false);
            queryClient.invalidateQueries({ queryKey: ["admin-system-status"] });
          },
        );
        return;
      }

      await startDeploy(
        targetCommit ? { target: targetCommit } : {},
        (event: DeployEvent) => {
          setLogs((prev) => [...prev, `[${event.type}] ${event.data}`]);
          if (event.type === "done") {
            setDeployResult("success");
            setRefreshCountdown(8);
          }
          if (event.type === "error") setDeployResult("error");
        },
        () => {
          setDeploying(false);
          queryClient.invalidateQueries({ queryKey: ["admin-system-status"] });
        },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("systemMgmt.unknownError");
      if (msg.includes("network") || msg.includes("fetch") || msg.includes("Failed")) {
        await pollFinalResult();
      } else {
        setLogs((prev) => [...prev, `[error] ${msg}`]);
        setDeployResult("error");
        setDeploying(false);
      }
    }
  }, [deploying, queryClient, pollFinalResult, actionMode]);

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center py-20 text-zinc-500">
        {t("systemMgmt.noAccess")}
      </div>
    );
  }

  const git = status?.git;
  const containers = status?.containers ?? [];
  const lastDeploy = status?.last_deploy;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">{t("systemMgmt.title")}</h1>
          <p className="mt-1 text-sm text-zinc-500">{t("systemMgmt.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isLoading}
          className="flex items-center gap-1.5 rounded-md bg-white/[0.06] px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-white/[0.1] hover:text-zinc-200"
        >
          <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} />
          {t("systemMgmt.refresh")}
        </button>
      </div>

      {/* Agent Connection Warning */}
      {status && !status.agent_connected && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] px-4 py-3">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-amber-400" />
            <p className="text-sm text-amber-400">
              {t("systemMgmt.agentWarning")} — {status.error || t("systemMgmt.agentHint")}
            </p>
          </div>
        </div>
      )}

      {/* Git Info + Deploy Button */}
      <div className="card p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <GitBranch size={16} className="text-zinc-400" />
              <span className="text-sm font-medium text-zinc-200">{t("systemMgmt.codeVersion")}</span>
            </div>
            {isLoading ? (
              <div className="h-12 w-48 skeleton rounded-lg" />
            ) : git && !git.error ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <code className="rounded bg-white/[0.06] px-2 py-0.5 text-sm font-mono text-zinc-300">
                    {git.branch}
                  </code>
                  <code className="text-xs font-mono text-zinc-500">{git.commit}</code>
                </div>
                <p className="text-xs text-zinc-500">{git.message}</p>
                {git.has_update ? (
                  <div className="flex items-center gap-1.5 text-xs text-amber-400">
                    <ArrowDownCircle size={13} />
                    <span>{t("systemMgmt.newCommits", { count: git.behind })}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                    <CheckCircle2 size={13} />
                    <span>{t("systemMgmt.upToDate")}</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-zinc-500">{git?.error || t("systemMgmt.cannotGetVersion")}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setActionMode("rollback");
                setShowConfirm(true);
              }}
              disabled={deploying || !status?.agent_connected}
              className="flex items-center gap-2 rounded-md bg-white/[0.06] px-4 py-2.5 text-sm text-zinc-300 transition-colors hover:bg-white/[0.1] disabled:opacity-40"
            >
              <RotateCcw size={15} />
              {t("systemMgmt.rollback")}
            </button>
            <button
              type="button"
              onClick={() => {
                setActionMode("deploy");
                setShowConfirm(true);
              }}
              disabled={deploying || !status?.agent_connected}
              className="btn-primary flex items-center gap-2 px-5 py-2.5 text-sm disabled:opacity-40"
            >
              {deploying ? (
                <><Loader2 size={15} className="animate-spin" /> {t("systemMgmt.deploying")}</>
              ) : (
                <><Server size={15} /> {t("systemMgmt.deploy")}</>
              )}
            </button>
          </div>
        </div>

        {lastDeploy && (
          <div className="mt-4 border-t border-white/[0.06] pt-4">
            <div className="flex items-center gap-4 text-xs text-zinc-500">
              <span className="flex items-center gap-1">
                {lastDeploy.success ? (
                  <CheckCircle2 size={12} className="text-emerald-400" />
                ) : (
                  <XCircle size={12} className="text-red-400" />
                )}
                {t("systemMgmt.lastDeploy")}: {lastDeploy.success ? t("systemMgmt.success") : t("systemMgmt.failed")}
              </span>
              <span>{t("systemMgmt.elapsed", { seconds: lastDeploy.elapsed_s })}</span>
              <span>{t("systemMgmt.version", { commit: lastDeploy.commit })}</span>
              <span>{new Date(lastDeploy.finished_at).toLocaleString("zh-CN")}</span>
            </div>
          </div>
        )}
      </div>

      {/* Deploy Log */}
      {logs.length > 0 && (
        <div className="card p-6">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-200">{t("systemMgmt.deployLog")}</span>
            {deployResult === "success" && (
              <span className="flex items-center gap-1 text-xs text-emerald-400">
                <CheckCircle2 size={13} /> {t("systemMgmt.deploySuccess")}
                {refreshCountdown !== null && refreshCountdown > 0 && (
                  <span className="ml-2 text-zinc-500">{t("systemMgmt.autoRefresh", { count: refreshCountdown })}</span>
                )}
              </span>
            )}
            {deployResult === "error" && (
              <span className="flex items-center gap-1 text-xs text-red-400">
                <XCircle size={13} /> {t("systemMgmt.deployFailed")}
              </span>
            )}
            {deploying && (
              <span className="flex items-center gap-1 text-xs text-zinc-400">
                <Loader2 size={13} className="animate-spin" /> {t("systemMgmt.inProgress")}
              </span>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto rounded-lg bg-black/40 p-4 font-mono text-xs leading-relaxed">
            {logs.map((line, i) => (
              <div
                key={i}
                className={
                  line.includes("[error]")
                    ? "text-red-400"
                    : line.includes("[done]")
                      ? "text-emerald-400"
                      : "text-zinc-400"
                }
              >
                {line}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}

      <ContainerList containers={containers} isLoading={isLoading} />

      <ConfirmDeployDialog
        open={showConfirm}
        mode={actionMode}
        onConfirm={handleAction}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
}
