"use client";

import { Container } from "lucide-react";
import { ContainerCard } from "./ContainerCard";
import type { ContainerInfo } from "@/lib/api/admin-system";

export function ContainerList({
  containers,
  isLoading,
}: {
  containers: ContainerInfo[];
  isLoading: boolean;
}) {
  const valid = containers.filter((c) => !c.error);

  return (
    <div className="card p-6">
      <div className="mb-4 flex items-center gap-2">
        <Container size={16} className="text-zinc-400" />
        <span className="text-sm font-medium text-zinc-200">服务状态</span>
        <span className="text-xs text-zinc-500">({valid.length} 个容器)</span>
      </div>
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 skeleton rounded-lg" />
          ))}
        </div>
      ) : valid.length === 0 ? (
        <p className="text-sm text-zinc-500">暂无容器信息</p>
      ) : (
        <div className="space-y-2">
          {valid.map((c) => (
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
  );
}
