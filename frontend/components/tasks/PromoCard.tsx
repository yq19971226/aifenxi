"use client";

import { useRef, useCallback, useState } from "react";
import { Download, Shield } from "lucide-react";
import html2canvas from "html2canvas";

interface PromoCardProps {
  data: {
    symbol: string;
    direction: string;
    entry_price: string;
    target_price: string;
    gain_pct: string;
    verified: boolean;
    brand_name: string;
  };
}

export default function PromoCard({ data }: PromoCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);

  const isLong = data.direction === "做多" || data.direction === "long" || data.direction === "bullish";
  const dirLabel = isLong ? "做多" : "做空";
  const gain = parseFloat(data.gain_pct) || 0;
  const now = new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });

  const handleDownload = useCallback(async () => {
    if (!cardRef.current) return;
    setSaving(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: null,
        scale: 3,
        useCORS: true,
        logging: false,
      });
      const link = document.createElement("a");
      link.download = `${data.symbol}_${dirLabel}_${now}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (e) {
      console.error("Failed to generate image:", e);
    } finally {
      setSaving(false);
    }
  }, [data.symbol, dirLabel, now]);

  return (
    <div className="space-y-3">
      {/* Preview card — this div gets captured */}
      <div
        ref={cardRef}
        style={{
          width: 440,
          padding: "36px 32px",
          borderRadius: 24,
          background: isLong
            ? "linear-gradient(145deg, #020617 0%, #064e3b 40%, #022c22 100%)"
            : "linear-gradient(145deg, #020617 0%, #4c0519 40%, #2a040b 100%)",
          border: `1px solid ${isLong ? "rgba(52,211,153,0.3)" : "rgba(248,113,113,0.3)"}`,
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Roboto Mono', monospace",
          position: "relative",
          overflow: "hidden",
          boxShadow: "inset 0 0 40px rgba(0,0,0,0.5)",
        }}
      >
        {/* Background glow */}
        <div
          style={{
            position: "absolute",
            top: -60,
            right: -60,
            width: 200,
            height: 200,
            borderRadius: "50%",
            background: isLong
              ? "radial-gradient(circle, rgba(52,211,153,0.15) 0%, transparent 70%)"
              : "radial-gradient(circle, rgba(248,113,113,0.15) 0%, transparent 70%)",
            filter: "blur(20px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -40,
            left: -40,
            width: 160,
            height: 160,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(129,140,248,0.15) 0%, transparent 70%)",
            filter: "blur(20px)",
          }}
        />

        {/* Grid lines background overlay */}
        <div 
          style={{
            position: "absolute",
            inset: 0,
            backgroundSize: "20px 20px",
            backgroundImage: "linear-gradient(to right, rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.02) 1px, transparent 1px)",
            pointerEvents: "none"
          }}
        />

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32, position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: "linear-gradient(135deg, rgba(99,102,241,0.2) 0%, rgba(129,140,248,0.05) 100%)",
                border: "1px solid rgba(129,140,248,0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 12px rgba(99,102,241,0.2)",
              }}
            >
              <Shield size={22} color="#818cf8" strokeWidth={2.5} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 900, color: "#fff", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                {data.brand_name || "AI 分析"}
              </div>
              <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2, letterSpacing: "0.1em", fontWeight: 700 }}>AI 智能体分析</div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
             <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, letterSpacing: "0.1em" }}>生成日期</div>
             <div style={{ fontSize: 11, color: "#cbd5e1", fontWeight: 600, marginTop: 2 }}>{now}</div>
          </div>
        </div>

        {/* Symbol & Direction */}
        <div style={{ marginBottom: 28, position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "baseline" }}>
              <span style={{ fontSize: 36, fontWeight: 900, color: "#fff", letterSpacing: "-0.02em", textShadow: "0 2px 10px rgba(255,255,255,0.2)" }}>
                {(data.symbol ?? "").replace("USDT", "")}
              </span>
              <span style={{ fontSize: 14, color: "#64748b", fontWeight: 800, marginLeft: 4 }}>/ USDT</span>
            </div>
            <span
              style={{
                marginLeft: "auto",
                fontSize: 16,
                fontWeight: 900,
                color: isLong ? "#10b981" : "#f43f5e",
                background: isLong ? "rgba(16,185,129,0.15)" : "rgba(244,63,94,0.15)",
                border: `1px solid ${isLong ? "rgba(16,185,129,0.4)" : "rgba(244,63,94,0.4)"}`,
                padding: "6px 16px",
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                gap: 6,
                boxShadow: `0 0 20px ${isLong ? "rgba(52,211,153,0.2)" : "rgba(248,113,113,0.2)"}`,
                textTransform: "uppercase",
                letterSpacing: "0.05em"
              }}
            >
              {isLong ? "▲ 强势看多" : "▼ 强势看空"} {dirLabel}
            </span>
          </div>
        </div>

        {/* Price Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            marginBottom: 24,
            position: "relative"
          }}
        >
          <div
            style={{
              background: "rgba(0,0,0,0.4)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 12,
              padding: "16px 20px",
              boxShadow: "inset 0 2px 10px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 6, fontWeight: 800, letterSpacing: "0.1em" }}>入场价</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#f8fafc" }}>
              {data.entry_price}
            </div>
          </div>
          <div
            style={{
              background: "rgba(0,0,0,0.4)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 12,
              padding: "16px 20px",
              boxShadow: "inset 0 2px 10px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 6, fontWeight: 800, letterSpacing: "0.1em" }}>目标价</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: isLong ? "#10b981" : "#f43f5e", textShadow: `0 0 10px ${isLong ? "rgba(16,185,129,0.4)" : "rgba(244,63,94,0.4)"}` }}>
              {data.target_price}
            </div>
          </div>
        </div>

        {/* Gain Bar */}
        {gain !== 0 && (
          <div
            style={{
              background: "linear-gradient(90deg, rgba(0,0,0,0.6) 0%, rgba(255,255,255,0.05) 100%)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderLeft: `4px solid ${gain > 0 ? "#10b981" : "#f43f5e"}`,
              borderRadius: "0 12px 12px 0",
              padding: "16px 24px",
              marginBottom: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              position: "relative"
            }}
          >
            <span style={{ fontSize: 12, color: "#cbd5e1", fontWeight: 800, letterSpacing: "0.1em" }}>预估收益</span>
            <span
              style={{
                fontSize: 28,
                fontWeight: 900,
                color: gain > 0 ? "#10b981" : "#f43f5e",
                textShadow: `0 0 15px ${gain > 0 ? "rgba(16,185,129,0.5)" : "rgba(244,63,94,0.5)"}`
              }}
            >
              {gain > 0 ? "+" : ""}{gain}%
            </span>
          </div>
        )}

        {/* Footer badges */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", position: "relative" }}>
          {data.verified && (
            <span
              style={{
                fontSize: 10,
                color: "#818cf8",
                background: "rgba(99,102,241,0.15)",
                border: "1px solid rgba(99,102,241,0.3)",
                padding: "6px 12px",
                borderRadius: 8,
                fontWeight: 800,
                display: "flex",
                alignItems: "center",
                gap: 6,
                letterSpacing: "0.05em",
                textTransform: "uppercase"
              }}
            >
              <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#818cf8", boxShadow: "0 0 8px #818cf8" }} />
              链上已验证
            </span>
          )}
          <span
            style={{
              fontSize: 10,
              color: "#94a3b8",
              background: "rgba(0,0,0,0.5)",
              border: "1px solid rgba(255,255,255,0.1)",
              padding: "6px 12px",
              borderRadius: 8,
              fontWeight: 800,
              letterSpacing: "0.05em",
              textTransform: "uppercase"
            }}
          >
            10 智能体共识
          </span>
          <span
            style={{
              fontSize: 10,
              color: "#94a3b8",
              background: "rgba(0,0,0,0.5)",
              border: "1px solid rgba(255,255,255,0.1)",
              padding: "6px 12px",
              borderRadius: 8,
              fontWeight: 800,
              letterSpacing: "0.05em",
              textTransform: "uppercase"
            }}
          >
            反庄推演
          </span>
        </div>

        {/* Disclaimer + Google Search */}
        <div style={{ marginTop: 20, borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 16, position: "relative" }}>
          <div style={{ fontSize: 9, color: "#475569", lineHeight: 1.6, fontWeight: 700, marginBottom: 14 }}>
            ⚠️ 系统生成数据，仅供参考，不构成投资建议
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600 }}>搜索</span>
            <span style={{ fontSize: 10, color: "#e2e8f0", fontWeight: 800, background: "rgba(255,255,255,0.06)", padding: "2px 8px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.1)" }}>
              AXIOM 洞察分析
            </span>
          </div>
        </div>
      </div>

      {/* Download button */}
      <button
        onClick={handleDownload}
        disabled={saving}
        className="flex items-center justify-center gap-2 w-full rounded-xl bg-bg-elevated border border-border py-3.5 text-xs font-bold font-mono text-zinc-300 uppercase tracking-widest hover:bg-bg-primary hover:text-white disabled:opacity-40 transition-all shadow-inner tabular-nums active:scale-[0.98]"
      >
        <Download size={14} className={saving ? "animate-bounce" : ""} />
        {saving ? "生成中..." : "下载推广卡片"}
      </button>
    </div>
  );
}
