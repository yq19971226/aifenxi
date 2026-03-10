"use client";

import { Container } from "lucide-react";

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${
        ok ? "bg-emerald-500" : "bg-red-500"
      }`}
    />
  );
}

export function ContainerCard({
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
