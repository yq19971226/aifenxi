"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useTransform, PanInfo } from "framer-motion";
import { Send } from "lucide-react";

const STORAGE_KEY = "tg-support-pos";
const BUTTON_SIZE = 48;
const EDGE_MARGIN = 12;

/** 从 localStorage 恢复位置，失败则返回右下角默认值 */
function loadPosition(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const pos = JSON.parse(raw);
    if (typeof pos.x === "number" && typeof pos.y === "number") return pos;
  } catch {}
  return null;
}

function savePosition(x: number, y: number) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ x, y }));
  } catch {}
}

/** 将坐标钳制到视口安全区域内 */
function clamp(x: number, y: number): { x: number; y: number } {
  const maxX = window.innerWidth - BUTTON_SIZE - EDGE_MARGIN;
  const maxY = window.innerHeight - BUTTON_SIZE - EDGE_MARGIN;
  return {
    x: Math.max(EDGE_MARGIN, Math.min(x, maxX)),
    y: Math.max(EDGE_MARGIN, Math.min(y, maxY)),
  };
}

export function TelegramSupport() {
  const [mounted, setMounted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const wasDragged = useRef(false);
  const posRef = useRef({ x: 0, y: 0 });

  // 初始化位置
  useEffect(() => {
    const saved = loadPosition();
    const defaultPos = {
      x: window.innerWidth - BUTTON_SIZE - 24,
      y: window.innerHeight - BUTTON_SIZE - 100,
    };
    const pos = saved ? clamp(saved.x, saved.y) : defaultPos;
    posRef.current = pos;
    setMounted(true);

    // 窗口 resize 时重新钳制
    const handleResize = () => {
      const clamped = clamp(posRef.current.x, posRef.current.y);
      posRef.current = clamped;
      savePosition(clamped.x, clamped.y);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  if (!mounted) return null;

  const handleDragStart = () => {
    setIsDragging(true);
    wasDragged.current = false;
  };

  const handleDrag = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    // 超过 4px 视为真正拖拽（区分点击）
    if (Math.abs(info.offset.x) > 4 || Math.abs(info.offset.y) > 4) {
      wasDragged.current = true;
    }
  };

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    setIsDragging(false);
    const newX = posRef.current.x + info.offset.x;
    const newY = posRef.current.y + info.offset.y;
    const clamped = clamp(newX, newY);
    posRef.current = clamped;
    savePosition(clamped.x, clamped.y);
  };

  const handleClick = (e: React.MouseEvent) => {
    // 如果刚刚拖拽过，阻止链接跳转
    if (wasDragged.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <motion.div
      drag
      dragMomentum={false}
      dragElastic={0}
      onDragStart={handleDragStart}
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
      initial={{ x: posRef.current.x, y: posRef.current.y, opacity: 0, scale: 0.8 }}
      animate={{ x: posRef.current.x, y: posRef.current.y, opacity: 1, scale: 1 }}
      transition={{ opacity: { duration: 0.3 }, scale: { duration: 0.3 } }}
      style={{ position: "fixed", top: 0, left: 0, zIndex: 100, touchAction: "none" }}
      className="flex flex-col items-end gap-2 group cursor-grab active:cursor-grabbing"
    >
      {/* 提示气泡 (Hover 时显示，拖拽时隐藏) */}
      {!isDragging && (
        <div className="hidden md:block opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 bg-white/[0.06] backdrop-blur-md border border-white/[0.1] text-zinc-300 text-xs px-3 py-1.5 rounded-lg shadow-lg pointer-events-none whitespace-nowrap">
          联系 Telegram 客服 @axiom888
        </div>
      )}

      {/* 悬浮按钮 */}
      <a
        href="https://t.me/axiom888"
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        className={`flex items-center justify-center rounded-full bg-[#2AABEE] text-white shadow-[0_0_20px_rgba(42,171,238,0.3)] hover:shadow-[0_0_30px_rgba(42,171,238,0.6)] transition-all duration-300 ${
          isDragging ? "opacity-70 scale-95" : "hover:-translate-y-0.5"
        }`}
        style={{ width: BUTTON_SIZE, height: BUTTON_SIZE }}
        aria-label="Telegram Customer Support"
      >
        <Send size={20} className="-ml-0.5 mt-0.5" />
      </a>
    </motion.div>
  );
}
