"use client";

import { Send } from "lucide-react";
import { useTranslations } from "next-intl";

export function TelegramSupport() {
  return (
    <div className="fixed bottom-6 right-6 z-[100] group flex flex-col items-end gap-2">
      {/* 提示气泡 (Hover 时显示) */}
      <div className="opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 bg-white/[0.05] backdrop-blur-md border border-white/[0.1] text-zinc-300 text-xs px-3 py-1.5 rounded-lg shadow-lg">
        联系 Telegram 客服 @axiom888
      </div>
      
      {/* 悬浮按钮主结构 */}
      <a
        href="https://t.me/axiom888"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center w-12 h-12 rounded-full bg-[#2AABEE] text-white shadow-[0_0_20px_rgba(42,171,238,0.3)] hover:shadow-[0_0_30px_rgba(42,171,238,0.6)] hover:-translate-y-1 transition-all duration-300"
        aria-label="Telegram Customer Support"
      >
        {/* Lucide 的 Send 图标微调位置使其在圆心 */}
        <Send size={20} className="-ml-0.5 mt-0.5" />
      </a>
    </div>
  );
}
