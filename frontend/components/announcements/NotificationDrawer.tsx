"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  CheckCircle,
  ChevronDown,
  Clock,
  Megaphone,
  X,
  History,
  Archive,
} from "lucide-react";
import { fetchAnnouncementHistory, type AnnouncementHistoryItem } from "@/lib/api/announcements";
import { cn } from "@/lib/utils";

export function NotificationDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const handler = () => setIsOpen((prev) => !prev);
    window.addEventListener("toggle-notifications", handler);
    return () => window.removeEventListener("toggle-notifications", handler);
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ["announcements", "history"],
    queryFn: () => fetchAnnouncementHistory(1, 30),
    enabled: isOpen,
    staleTime: 60000,
  });

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isOpen]);

  // Reset expanded when drawer closes
  useEffect(() => {
    if (!isOpen) setExpandedId(null);
  }, [isOpen]);

  const items = data?.items ?? [];

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ position: "fixed", inset: 0, zIndex: 100, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
          onClick={() => setIsOpen(false)}
        />
      )}
      {isOpen && (
        <motion.div
          key="drawer"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className="fixed inset-y-0 right-0 z-[110] flex w-[320px] sm:w-[380px] md:w-[420px] flex-col overflow-hidden bg-[#121217] text-white shadow-2xl border-l border-white/[0.08]"
        >
          {/* Header */}
          <div className="flex h-16 items-center justify-between border-b border-white/[0.06] px-5 bg-white/[0.02]">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                <Bell size={16} />
              </div>
              <h2 className="text-base font-bold tracking-wider">
                消息中心 {items.length > 0 && <span className="ml-1 text-xs text-zinc-500">({items.length})</span>}
              </h2>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="flex items-center justify-center p-2 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              aria-label="关闭"
            >
              <X size={20} />
            </button>
          </div>

          {/* Content List */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-3">
                <div className="w-6 h-6 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin" />
                <p className="text-sm font-medium tracking-wide">加载消息中...</p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center h-full text-red-500/80 gap-2">
                <p className="text-sm">加载失败，请稍后重试。</p>
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-4">
                <div className="flex items-center justify-center w-16 h-16 rounded-full bg-white/[0.03] border border-white/[0.05]">
                  <History size={24} className="opacity-40" />
                </div>
                <p className="text-sm font-medium tracking-wide">暂无任何历史消息</p>
              </div>
            ) : (
              items.map((item: AnnouncementHistoryItem) => {
                const isArchived = item.status === "archived";
                const isExpanded = expandedId === item.id;
                const dateString = item.published_at 
                  ? new Date(item.published_at).toLocaleString("zh-CN", {
                      month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
                    })
                  : "—";

                return (
                  <div 
                    key={item.id} 
                    className={cn(
                      "group relative overflow-hidden rounded-xl border transition-all duration-300 cursor-pointer",
                      isArchived 
                        ? "border-white/[0.05] bg-white/[0.02] hover:border-white/[0.1]" 
                        : "border-indigo-500/20 bg-indigo-500/[0.02] shadow-[0_0_15px_rgba(99,102,241,0.05)] hover:border-indigo-500/40"
                    )}
                    onClick={() => toggleExpand(item.id)}
                  >
                    {/* Status indicator line */}
                    {!isArchived && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 opacity-60 rounded-l-xl" />
                    )}

                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold">
                          {isArchived ? (
                            <span className="text-zinc-500 flex items-center gap-1"><Archive size={10} /> 归档</span>
                          ) : (
                            <span className="text-indigo-400 flex items-center gap-1"><Megaphone size={10} /> 公告</span>
                          )}
                          <span className="text-zinc-600 px-1">•</span>
                          <span className="text-zinc-500 font-mono flex items-center gap-1">
                            <Clock size={10} className="opacity-70" /> {dateString}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-2 shrink-0">
                          {item.last_event === "confirmed" && (
                            <div className="flex items-center justify-center bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest gap-1">
                              <CheckCircle size={10} /> 已阅
                            </div>
                          )}
                          <ChevronDown 
                            size={14} 
                            className={cn(
                              "text-zinc-500 transition-transform duration-300",
                              isExpanded && "rotate-180"
                            )} 
                          />
                        </div>
                      </div>

                      <h3 className={cn(
                        "text-[15px] font-bold tracking-tight leading-snug", 
                        isArchived ? "text-zinc-400" : "text-zinc-200"
                      )}>
                        {item.title}
                      </h3>
                      
                      {!isExpanded && item.summary && (
                        <p className={cn(
                          "text-xs leading-relaxed line-clamp-2 mt-1.5", 
                          isArchived ? "text-zinc-500" : "text-zinc-400"
                        )}>
                          {item.summary}
                        </p>
                      )}
                    </div>

                    {/* Expandable content area */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: "easeInOut" }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-4 border-t border-white/[0.04] pt-3">
                            {item.summary && (
                              <p className="text-xs text-zinc-400 mb-3 leading-relaxed italic">
                                {item.summary}
                              </p>
                            )}
                            {item.content_md ? (
                              <div className="whitespace-pre-wrap text-sm leading-6 text-zinc-300">
                                {item.content_md}
                              </div>
                            ) : (
                              <p className="text-xs text-zinc-500 italic">暂无详细内容</p>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="flex h-14 items-center justify-center border-t border-white/[0.06] bg-black/20 text-[11px] font-mono text-zinc-500">
            AXIOM · 消息中心
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
