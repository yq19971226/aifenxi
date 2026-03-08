"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from "lucide-react";

/* ── Types ── */

export type ToastVariant = "success" | "error" | "warning" | "info";

export interface ToastItem {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
  duration?: number;
}

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

/* ── Context ── */

interface ToastContextValue {
  toast: (options: ToastOptions) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue>({
  toast: () => {},
  dismiss: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

/* ── Icon map ── */

const ICONS: Record<ToastVariant, ReactNode> = {
  success: <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />,
  error: <XCircle size={16} className="text-red-400 shrink-0" />,
  warning: <AlertTriangle size={16} className="text-amber-400 shrink-0" />,
  info: <Info size={16} className="text-zinc-400 shrink-0" />,
};

const BORDER_COLOR: Record<ToastVariant, string> = {
  success: "border-l-emerald-500/50",
  error: "border-l-red-500/50",
  warning: "border-l-amber-500/50",
  info: "border-l-zinc-500/50",
};

/* ── Single Toast ── */

function ToastCard({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const dur = item.duration ?? 4000;
    if (dur <= 0) return;
    const timer = setTimeout(onDismiss, dur);
    return () => clearTimeout(timer);
  }, [item.duration, onDismiss]);

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border border-white/[0.08] border-l-2 ${
        BORDER_COLOR[item.variant]
      } bg-[#1a1a1f] px-4 py-3 shadow-xl shadow-black/40 backdrop-blur-md fade-in max-w-sm`}
    >
      {ICONS[item.variant]}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-200">{item.title}</p>
        {item.description && (
          <p className="text-sm text-zinc-500 mt-0.5">{item.description}</p>
        )}
      </div>
      <button
        onClick={onDismiss}
        className="text-zinc-500 hover:text-zinc-400 transition-colors shrink-0 mt-0.5"
      >
        <X size={14} />
      </button>
    </div>
  );
}

/* ── Provider ── */

let toastCounter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((options: ToastOptions) => {
    const id = `toast-${++toastCounter}-${Date.now()}`;
    const item: ToastItem = {
      id,
      variant: options.variant ?? "info",
      title: options.title,
      description: options.description,
      duration: options.duration ?? 4000,
    };
    setToasts((prev) => [...prev, item].slice(-5)); // max 5 visible
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}

      {/* Toast container ?bottom-right */}
      {toasts.length > 0 && (
        <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2">
          {toasts.map((item) => (
            <ToastCard
              key={item.id}
              item={item}
              onDismiss={() => dismiss(item.id)}
            />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

/* ── Usage examples (comments only) ──
 *
 * // 1. Wrap app with <ToastProvider>:
 * // app/layout.tsx:
 * //   <ToastProvider>{children}</ToastProvider>
 *
 * // 2. Use in any component:
 * const { toast } = useToast();
 * toast({ title: "保存成功", variant: "success" });
 * toast({ title: "操作失败", description: "网络错误，请重试", variant: "error" });
 * toast({ title: "注意", description: "配额即将用尽", variant: "warning", duration: 6000 });
 */
