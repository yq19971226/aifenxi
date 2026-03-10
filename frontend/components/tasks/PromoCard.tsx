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
          width: 420,
          padding: 32,
          borderRadius: 20,
          background: isLong
            ? "linear-gradient(145deg, #0a1a12 0%, #0d1117 40%, #0a0f14 100%)"
            : "linear-gradient(145deg, #1a0a0e 0%, #0d1117 40%, #140a0f 100%)",
          border: `1px solid ${isLong ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)"}`,
          fontFamily: "'Inter', 'SF Pro Display', -apple-system, sans-serif",
          position: "relative",
          overflow: "hidden",
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
              ? "radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 70%)"
              : "radial-gradient(circle, rgba(239,68,68,0.08) 0%, transparent 70%)",
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
            background: "radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 70%)",
          }}
        />

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "rgba(99,102,241,0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Shield size={18} color="#818cf8" />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#e4e4e7", letterSpacing: "-0.01em" }}>
                {data.brand_name || "AI 分析"}
              </div>
              <div style={{ fontSize: 11, color: "#71717a", marginTop: 1 }}>多智能体对抗分析</div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: "#52525b" }}>{now}</div>
        </div>

        {/* Symbol & Direction */}
        <div style={{ marginBottom: 20, position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 28, fontWeight: 800, color: "#fafafa", letterSpacing: "-0.02em" }}>
              {data.symbol.replace("USDT", "")}
            </span>
            <span style={{ fontSize: 11, color: "#71717a", fontWeight: 500 }}>/ USDT</span>
            <span
              style={{
                marginLeft: "auto",
                fontSize: 13,
                fontWeight: 700,
                color: isLong ? "#34d399" : "#f87171",
                background: isLong ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
                border: `1px solid ${isLong ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)"}`,
                padding: "4px 12px",
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              {isLong ? "▲" : "▼"} {dirLabel}
            </span>
          </div>
        </div>

        {/* Price Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginBottom: 20,
          }}
        >
          <div
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 12,
              padding: "12px 14px",
            }}
          >
            <div style={{ fontSize: 11, color: "#71717a", marginBottom: 4, fontWeight: 500 }}>入场价</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#d4d4d8", fontFamily: "'JetBrains Mono', monospace" }}>
              {data.entry_price}
            </div>
          </div>
          <div
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 12,
              padding: "12px 14px",
            }}
          >
            <div style={{ fontSize: 11, color: "#71717a", marginBottom: 4, fontWeight: 500 }}>目标价</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: isLong ? "#34d399" : "#f87171", fontFamily: "'JetBrains Mono', monospace" }}>
              {data.target_price}
            </div>
          </div>
        </div>

        {/* Gain Bar */}
        {gain !== 0 && (
          <div
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 12,
              padding: "12px 14px",
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontSize: 12, color: "#71717a", fontWeight: 500 }}>预期收益</span>
            <span
              style={{
                fontSize: 22,
                fontWeight: 800,
                color: gain > 0 ? "#34d399" : "#f87171",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {gain > 0 ? "+" : ""}{gain}%
            </span>
          </div>
        )}

        {/* Footer badges */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {data.verified && (
            <span
              style={{
                fontSize: 11,
                color: "#818cf8",
                background: "rgba(99,102,241,0.1)",
                border: "1px solid rgba(99,102,241,0.2)",
                padding: "3px 10px",
                borderRadius: 6,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              ✓ 链上验证
            </span>
          )}
          <span
            style={{
              fontSize: 11,
              color: "#a1a1aa",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)",
              padding: "3px 10px",
              borderRadius: 6,
              fontWeight: 500,
            }}
          >
            10 AI 交叉验证
          </span>
          <span
            style={{
              fontSize: 11,
              color: "#a1a1aa",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)",
              padding: "3px 10px",
              borderRadius: 6,
              fontWeight: 500,
            }}
          >
            庄家对抗推演
          </span>
        </div>

        {/* Disclaimer */}
        <div style={{ marginTop: 16, fontSize: 9, color: "#3f3f46", lineHeight: 1.5 }}>
          * 以上为 AI 分析结果，不构成投资建议，请结合自身判断
        </div>
      </div>

      {/* Download button */}
      <button
        onClick={handleDownload}
        disabled={saving}
        className="flex items-center justify-center gap-2 w-full rounded-lg bg-white/[0.05] border border-white/[0.08] py-2.5 text-sm font-medium text-zinc-300 hover:bg-white/[0.08] disabled:opacity-40 transition-all"
      >
        <Download size={14} />
        {saving ? "生成中..." : "下载推广图"}
      </button>
    </div>
  );
}
