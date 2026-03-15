"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageTransition } from "@/components/layout/PageTransition";
import { adminTasksApi, type TaskTemplate } from "@/lib/api/tasks";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

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
  const { user } = useAuth();
  
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Partial<TaskTemplate> | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["admin-task-templates"],
    queryFn: adminTasksApi.listTemplates,
    enabled: !!user && user.role === "admin",
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

  if (!user || user.role !== "admin") return null;

  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
        <div className="flex items-end justify-between border-b border-white/[0.05] pb-6">
          <div>
            <h1 className="text-2xl font-black text-white font-mono tracking-widest uppercase mb-2">任务模板</h1>
            <p className="text-[10px] font-bold font-mono text-zinc-500 uppercase tracking-[0.3em]">
              任务模板管理
            </p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-[10px] font-black font-mono uppercase tracking-[0.2em] text-indigo-400 hover:bg-indigo-500 hover:text-white transition-all duration-300 shadow-[0_0_15px_rgba(99,102,241,0.1)]"
          >
            <Plus size={14} /> 新建模板
          </button>
        </div>

        {/* Edit Form */}
        {editing && (
          <div className="relative bg-black border border-indigo-500/30 p-6 shadow-[0_0_20px_rgba(99,102,241,0.05)] space-y-5">
            <div className="absolute top-0 right-0 w-16 h-[1px] bg-indigo-500/50" />
            <div className="absolute bottom-0 left-0 w-16 h-[1px] bg-indigo-500/50" />
            
            <div className="flex items-center justify-between border-b border-white/[0.05] pb-4 mb-4">
              <h3 className="text-[11px] font-black font-mono text-indigo-400 uppercase tracking-[0.3em] flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-indigo-400 animate-pulse"></span>
                {editingId ? "编辑模板" : "创建模板"}
              </h3>
              <button onClick={() => setEditing(null)} className="text-zinc-500 hover:text-white transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="mb-2 block text-[9px] font-bold font-mono text-zinc-500 uppercase tracking-widest">模板标题</label>
                <input
                  value={editing.title ?? ""}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  className="w-full border border-white/[0.1] bg-white/[0.02] px-4 py-2.5 text-[11px] text-white font-mono tracking-widest focus:border-indigo-500/50 focus:bg-indigo-500/5 outline-none transition-all"
                />
              </div>
              <div>
                <label className="mb-2 block text-[9px] font-bold font-mono text-zinc-500 uppercase tracking-widest">平台</label>
                <select
                  value={editing.platform ?? "twitter"}
                  onChange={(e) => setEditing({ ...editing, platform: e.target.value })}
                  className="w-full border border-white/[0.1] bg-[#0a0a0a] px-4 py-2.5 text-[11px] text-white font-mono tracking-widest focus:border-indigo-500/50 outline-none transition-all cursor-pointer"
                >
                  <option value="twitter">推特/X</option>
                  <option value="binance_square">币安广场</option>
                  <option value="telegram">电报群</option>
                  <option value="reddit">论坛</option>
                  <option value="xiaohongshu">小红书/抖音</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-[9px] font-bold font-mono text-zinc-500 uppercase tracking-widest">图标</label>
                <input
                  value={editing.icon ?? ""}
                  onChange={(e) => setEditing({ ...editing, icon: e.target.value })}
                  className="w-full border border-white/[0.1] bg-white/[0.02] px-4 py-2.5 text-[11px] text-white font-mono tracking-widest focus:border-indigo-500/50 focus:bg-indigo-500/5 outline-none transition-all"
                />
              </div>
              <div>
                <label className="mb-2 block text-[9px] font-bold font-mono text-zinc-500 uppercase tracking-widest">奖励模式</label>
                <select
                  value={editing.reward_mode ?? "scalping"}
                  onChange={(e) => setEditing({ ...editing, reward_mode: e.target.value })}
                  className="w-full border border-white/[0.1] bg-[#0a0a0a] px-4 py-2.5 text-[11px] text-white font-mono tracking-widest focus:border-indigo-500/50 outline-none transition-all cursor-pointer"
                >
                  <option value="scalping">超短线 (日归)</option>
                  <option value="intraday">日内 (周归)</option>
                  <option value="trend">趋势 (月归)</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="mb-2 block text-[9px] font-bold font-mono text-zinc-500 uppercase tracking-widest">奖励数量</label>
                  <input
                    type="number"
                    min={1}
                    value={editing.reward_amount ?? 5}
                    onChange={(e) => setEditing({ ...editing, reward_amount: Number(e.target.value) })}
                    className="w-full border border-white/[0.1] bg-white/[0.02] px-4 py-2.5 text-[11px] text-white font-mono tracking-widest focus:border-indigo-500/50 focus:bg-indigo-500/5 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-[9px] font-bold font-mono text-zinc-500 uppercase tracking-widest">最低浏览</label>
                  <input
                    type="number"
                    min={0}
                    value={editing.min_views ?? 200}
                    onChange={(e) => setEditing({ ...editing, min_views: Number(e.target.value) })}
                    className="w-full border border-white/[0.1] bg-white/[0.02] px-4 py-2.5 text-[11px] text-white font-mono tracking-widest focus:border-indigo-500/50 focus:bg-indigo-500/5 outline-none transition-all"
                  />
                </div>
              </div>
            </div>
            
            <div className="space-y-5 border-t border-white/[0.05] pt-5">
              <div>
                <label className="mb-2 block text-[9px] font-bold font-mono text-zinc-500 uppercase tracking-widest">描述</label>
                <textarea
                  value={editing.description ?? ""}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  rows={2}
                  className="w-full border border-white/[0.1] bg-white/[0.02] px-4 py-2.5 text-[11px] text-white font-mono tracking-wide focus:border-indigo-500/50 focus:bg-indigo-500/5 outline-none transition-all leading-relaxed"
                />
              </div>
              <div>
                <label className="mb-2 block text-[9px] font-bold font-mono text-zinc-500 uppercase tracking-widest">规则详情</label>
                <textarea
                  value={editing.rules ?? ""}
                  onChange={(e) => setEditing({ ...editing, rules: e.target.value })}
                  rows={2}
                  className="w-full border border-white/[0.1] bg-white/[0.02] px-4 py-2.5 text-[11px] text-white font-mono tracking-wide focus:border-indigo-500/50 focus:bg-indigo-500/5 outline-none transition-all leading-relaxed"
                />
              </div>
            </div>
            
            <div className="flex justify-end gap-4 pt-4">
              <button
                onClick={() => setEditing(null)}
                className="border border-white/[0.1] bg-white/[0.02] px-6 py-2.5 text-[10px] font-black font-mono uppercase tracking-[0.2em] text-zinc-400 hover:bg-white/[0.05] hover:text-white transition-all"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={!editing.title || createMutation.isPending || updateMutation.isPending}
                className="border border-indigo-500/40 bg-indigo-600/80 px-8 py-2.5 text-[10px] font-black font-mono uppercase tracking-[0.2em] text-white disabled:opacity-40 transition-all hover:bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.2)]"
              >
                保存模板
              </button>
            </div>
          </div>
        )}

        {/* Template List */}
        {isLoading ? (
          <div className="relative bg-black border border-white/[0.05] py-20 text-center overflow-hidden">
             <span className="text-[11px] font-black font-mono text-zinc-500 uppercase tracking-[0.3em] animate-pulse">加载中...</span>
          </div>
        ) : templates.length === 0 ? (
          <div className="relative bg-black border border-white/[0.05] py-20 text-center overflow-hidden">
             <span className="text-[11px] font-black font-mono text-zinc-500 uppercase tracking-[0.3em]">暂无模板</span>
          </div>
        ) : (
          <div className="space-y-4">
            {templates.map((t: TaskTemplate) => (
              <div
                key={t.id}
                className={`relative flex items-center justify-between p-5 lg:p-6 transition-all duration-300 border ${
                  t.is_active
                    ? "bg-black border-white/[0.05] hover:border-white/[0.15] hover:bg-white/[0.01]"
                    : "bg-black/50 border-white/[0.02] opacity-60 grayscale"
                }`}
              >
                {t.is_active && (
                   <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-indigo-500/50" />
                )}
                
                <div className="flex items-center gap-5">
                  <span className="text-3xl drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]">{t.icon || "📱"}</span>
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-sm font-black font-mono tracking-widest text-white uppercase">{t.title}</span>
                      <span className="border border-white/[0.1] bg-white/[0.05] px-2 py-0.5 text-[9px] font-bold font-mono tracking-widest text-zinc-400 uppercase">
                        {t.platform}
                      </span>
                      {!t.is_active && (
                        <span className="border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[9px] font-bold font-mono tracking-widest text-red-400 uppercase">
                          已禁用
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-[10px] font-mono font-bold tracking-widest text-zinc-500 uppercase">
                      <span className="flex items-center gap-1.5">
                        <span className="w-1 h-3 bg-emerald-500/50 block"></span>
                        奖励: <span className="text-emerald-400">+{t.reward_amount} {t.reward_mode}</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-1 h-3 bg-zinc-600 block"></span>
                        最低浏览: <span className="text-zinc-300">≥{t.min_views}</span>
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <button
                    onClick={() => openEdit(t)}
                    className="border border-white/[0.08] p-2.5 text-zinc-400 hover:bg-white/[0.05] hover:text-white transition-all bg-black"
                  >
                    <Pencil size={14} />
                  </button>
                  {t.is_active && (
                    <button
                      onClick={() => deleteMutation.mutate(t.id)}
                      className="border border-red-500/20 p-2.5 text-zinc-500 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/40 transition-all bg-black"
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
