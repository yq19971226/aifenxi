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
  Container,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  fetchSystemStatus,
  startDeploy,
  type SystemStatus,
  type DeployEvent,
} from "@/lib/api/admin-system";

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${
        ok ? "bg-emerald-500" : "bg-red-500"
      }`}
    />
  );
}

function ContainerCard({
  name,
  state,
  status,
  health,
}: {
  name: string;
  state: string;
  status: string;
  health: string;
}) {
  const isHealthy = health === "healthy" || state === "running";
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
      <div className="flex items-center gap-3">
        <Container size={15} className="text-zinc-500" />
        <span className="text-sm font-medium text-zinc-200">{name}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500">{status}</span>
        <StatusDot ok={isHealthy} />
      </div>
    </div>
  );
}

export default function AdminSystemPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [deploying, setDeploying] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [deployResult, setDeployResult] = useState<"success" | "error" | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const {
    data: status,
    isLoading,
    refetch,
  } = useQuery<SystemStatus>({
    queryKey: ["admin-system-status"],
    queryFn: fetchSystemStatus,
    refetchInterval: deploying ? 5000 : 30000,
    retry: 1,
  });

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const [showConfirm, setShowConfirm] = useState(false);
  const [refreshCountdown, setRefreshCountdown] = useState<number | null>(null);

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

  const handleDeploy = useCallback(async () => {
    if (deploying) return;
    setShowConfirm(false);
    setDeploying(true);
    setLogs([]);
    setDeployResult(null);
    setRefreshCountdown(null);

    try {
      await startDeploy(
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
      const msg = err instanceof Error ? err.message : "未知错误";
      if (msg.includes("network") || msg.includes("fetch") || msg.includes("Failed")) {
        await pollFinalResult();
      } else {
        setLogs((prev) => [...prev, `[error] ${msg}`]);
        setDeployResult("error");
        setDeploying(false);
      }
    }
  }, [deploying, queryClient, pollFinalResult]);

  const git = status?.git;
  const containers = status?.containers ?? [];
  const lastDeploy = status?.last_deploy;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">系统管理</h1>
          <p className="mt-1 text-sm text-zinc-500">
            代码更新、服务状态、一键部署
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isLoading}
          className="flex items-center gap-1.5 rounded-md bg-white/[0.06] px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-white/[0.1] hover:text-zinc-200"
        >
          <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} />
          刷新
        </button>
      </div>

      {/* Agent Connection Warning */}
      {status && !status.agent_connected && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] px-4 py-3">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-amber-400" />
            <p className="text-sm text-amber-400">
              无法连接部署代理 — {status.error || "请确认服务器上 axiom-deploy-agent 服务已启动"}
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
              <span className="text-sm font-medium text-zinc-200">代码版本</span>
            </div>

            {isLoading ? (
              <div className="h-12 w-48 skeleton rounded-lg" />
            ) : git && !git.error ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <code className="rounded bg-white/[0.06] px-2 py-0.5 text-sm font-mono text-zinc-300">
                    {git.branch}
                  </code>
                  <code className="text-xs font-mono text-zinc-500">
                    {git.commit}
                  </code>
                </div>
                <p className="text-xs text-zinc-500">{git.message}</p>
                {git.has_update && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-400">
                    <ArrowDownCircle size={13} />
                    <span>有 {git.behind} 个新提交可更新</span>
                  </div>
                )}
                {!git.has_update && (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                    <CheckCircle2 size={13} />
                    <span>已是最新版本</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-zinc-500">
                {git?.error || "无法获取版本信息"}
              </p>
            )}
          </div>

          {/* Deploy Button */}
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            disabled={deploying || !status?.agent_connected}
            className="btn-primary flex items-center gap-2 px-5 py-2.5 text-sm disabled:opacity-40"
          >
            {deploying ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                部署中...
              </>
            ) : (
              <>
                <Server size={15} />
                一键更新
              </>
            )}
          </button>
        </div>

        {/* Last Deploy */}
        {lastDeploy && (
          <div className="mt-4 border-t border-white/[0.06] pt-4">
            <div className="flex items-center gap-4 text-xs text-zinc-500">
              <span className="flex items-center gap-1">
                {lastDeploy.success ? (
                  <CheckCircle2 size={12} className="text-emerald-400" />
                ) : (
                  <XCircle size={12} className="text-red-400" />
                )}
                上次部署: {lastDeploy.success ? "成功" : "失败"}
              </span>
              <span>耗时 {lastDeploy.elapsed_s}s</span>
              <span>版本 {lastDeploy.commit}</span>
              <span>
                {new Date(lastDeploy.finished_at).toLocaleString("zh-CN")}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Deploy Log */}
      {logs.length > 0 && (
        <div className="card p-6">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-200">部署日志</span>
            {deployResult === "success" && (
              <span className="flex items-center gap-1 text-xs text-emerald-400">
                <CheckCircle2 size={13} />
                部署成功
                {refreshCountdown !== null && refreshCountdown > 0 && (
                  <span className="ml-2 text-zinc-500">
                    {refreshCountdown}s 后自动刷新
                  </span>
                )}
              </span>
            )}
            {deployResult === "error" && (
              <span className="flex items-center gap-1 text-xs text-red-400">
                <XCircle size={13} />
                部署失败
              </span>
            )}
            {deploying && (
              <span className="flex items-center gap-1 text-xs text-zinc-400">
                <Loader2 size={13} className="animate-spin" />
                进行中...
              </span>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto rounded-lg bg-black/40 p-4 font-mono text-xs leading-relaxed">
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

      {/* Containers */}
      <div className="card p-6">
        <div className="mb-4 flex items-center gap-2">
          <Container size={16} className="text-zinc-400" />
          <span className="text-sm font-medium text-zinc-200">服务状态</span>
          <span className="text-xs text-zinc-600">
            ({containers.filter((c) => !c.error).length} 个容器)
          </span>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 skeleton rounded-lg" />
            ))}
          </div>
        ) : containers.length === 0 ? (
          <p className="text-sm text-zinc-500">暂无容器信息</p>
        ) : (
          <div className="space-y-2">
            {containers
              .filter((c) => !c.error)
              .map((c) => (
                <ContainerCard
                  key={c.name}
                  name={c.service || c.name}
                  state={c.state}
                  status={c.status}
                  health={c.health}
                />
              ))}
          </div>
        )}
      </div>

      {/* Confirm Dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="mx-4 w-full max-w-md rounded-xl border border-white/[0.08] bg-zinc-900 p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10">
                <AlertTriangle size={20} className="text-amber-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-zinc-100">确认系统更新</h3>
                <p className="text-xs text-zinc-500">此操作将中断服务数分钟</p>
              </div>
            </div>
            <div className="mb-5 space-y-2 rounded-lg bg-white/[0.03] px-4 py-3 text-sm text-zinc-400">
              <p>更新过程将执行以下操作：</p>
              <ul className="ml-4 list-disc space-y-1 text-xs text-zinc-500">
                <li>备份数据库</li>
                <li>拉取最新代码</li>
                <li>重新构建 Docker 镜像</li>
                <li>重启所有服务容器</li>
                <li>自动健康检查</li>
              </ul>
              <p className="text-xs text-amber-400/80">⚠ 更新期间所有用户将暂时无法访问系统</p>
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="rounded-md bg-white/[0.06] px-4 py-2 text-sm text-zinc-400 hover:bg-white/[0.1]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleDeploy}
                className="btn-primary rounded-md px-4 py-2 text-sm"
              >
                确认更新
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
