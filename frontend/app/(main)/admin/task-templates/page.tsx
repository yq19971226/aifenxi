"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageTransition } from "@/components/layout/PageTransition";
import { adminTasksApi, type TaskTemplate } from "@/lib/api/tasks";
import { Plus, Pencil, Trash2, X } from "lucide-react";

const EMPTY_FORM = {
  title: "",
  platform: "twitter",
  icon: "🐦",
  description: "",
  rules: "",
  reward_mode: "scalping",
  reward_amount: 5,
  min_views: 200,
  verify_window_hours: 72,
  sort_order: 0,
  is_active: true,
};

export default function TaskTemplatesPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Partial<TaskTemplate> | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["admin-task-templates"],
    queryFn: adminTasksApi.listTemplates,
  });

  const createMutation = useMutation({
    mutationFn: adminTasksApi.createTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-task-templates"] });
      setEditing(null);
      setEditingId(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TaskTemplate> }) =>
      adminTasksApi.updateTemplate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-task-templates"] });
      setEditing(null);
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: adminTasksApi.deleteTemplate,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admin-task-templates"] }),
  });

  const openCreate = () => {
    setEditingId(null);
    setEditing({ ...EMPTY_FORM });
  };

  const openEdit = (t: TaskTemplate) => {
    setEditingId(t.id);
    setEditing({ ...t });
  };

  const handleSave = () => {
    if (!editing) return;
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: editing });
    } else {
      createMutation.mutate(editing);
    }
  };

  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">任务模板管理</h1>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-accent)]/80"
          >
            <Plus size={16} /> 新建模板
          </button>
        </div>

        {/* Edit Form */}
        {editing && (
          <div className="rounded-xl border border-accent/30 bg-white/[0.03] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">
                {editingId ? "编辑模板" : "新建模板"}
              </h3>
              <button onClick={() => setEditing(null)} className="text-zinc-400 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-zinc-400">标题</label>
                <input
                  value={editing.title ?? ""}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-400">平台</label>
                <select
                  value={editing.platform ?? "twitter"}
                  onChange={(e) => setEditing({ ...editing, platform: e.target.value })}
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
                >
                  <option value="twitter">Twitter / X</option>
                  <option value="binance_square">币安广场</option>
                  <option value="telegram">Telegram</option>
                  <option value="reddit">Reddit</option>
                  <option value="xiaohongshu">小红书 / 抖音</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-400">图标</label>
                <input
                  value={editing.icon ?? ""}
                  onChange={(e) => setEditing({ ...editing, icon: e.target.value })}
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-400">奖励模式</label>
                <select
                  value={editing.reward_mode ?? "scalping"}
                  onChange={(e) => setEditing({ ...editing, reward_mode: e.target.value })}
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
                >
                  <option value="scalping">超短线 (Scalping)</option>
                  <option value="intraday">日内 (Intraday)</option>
                  <option value="trend">趋势 (Trend)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-400">奖励次数</label>
                <input
                  type="number"
                  min={1}
                  value={editing.reward_amount ?? 5}
                  onChange={(e) => setEditing({ ...editing, reward_amount: Number(e.target.value) })}
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-400">最低浏览量</label>
                <input
                  type="number"
                  min={0}
                  value={editing.min_views ?? 200}
                  onChange={(e) => setEditing({ ...editing, min_views: Number(e.target.value) })}
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-400">描述</label>
              <textarea
                value={editing.description ?? ""}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                rows={2}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-400">规则说明</label>
              <textarea
                value={editing.rules ?? ""}
                onChange={(e) => setEditing({ ...editing, rules: e.target.value })}
                rows={2}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditing(null)}
                className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-white"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={!editing.title || createMutation.isPending || updateMutation.isPending}
                className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-accent)]/80 disabled:opacity-50"
              >
                保存
              </button>
            </div>
          </div>
        )}

        {/* Template List */}
        {isLoading ? (
          <div className="py-12 text-center text-zinc-400">加载中...</div>
        ) : (
          <div className="space-y-3">
            {templates.map((t: TaskTemplate) => (
              <div
                key={t.id}
                className={`flex items-center justify-between rounded-xl border p-4 ${
                  t.is_active
                    ? "border-white/10 bg-white/[0.03]"
                    : "border-white/5 bg-white/[0.01] opacity-50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{t.icon || "📱"}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{t.title}</span>
                      <span className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-zinc-400">
                        {t.platform}
                      </span>
                      {!t.is_active && (
                        <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-xs text-red-400">
                          已停用
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500">
                      +{t.reward_amount} {t.reward_mode} · ≥{t.min_views} 浏览量
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => openEdit(t)}
                    className="rounded-lg p-2 text-zinc-400 hover:bg-white/10 hover:text-white"
                  >
                    <Pencil size={14} />
                  </button>
                  {t.is_active && (
                    <button
                      onClick={() => deleteMutation.mutate(t.id)}
                      className="rounded-lg p-2 text-zinc-400 hover:bg-red-500/10 hover:text-red-400"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
