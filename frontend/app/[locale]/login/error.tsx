"use client";

import { useTranslations } from "next-intl";

export default function LoginError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");

  return (
    <div style={{ background: "#09090b", color: "#fff", fontFamily: "system-ui", padding: 40, minHeight: "100vh" }}>
      <h2 style={{ color: "#ef4444" }}>{t("pageError")}</h2>
      <pre style={{ color: "#fbbf24", whiteSpace: "pre-wrap", fontSize: 13 }}>
        {error.message}
      </pre>
      <pre style={{ color: "#71717a", whiteSpace: "pre-wrap", fontSize: 11, marginTop: 8 }}>
        {error.stack}
      </pre>
      <button
        onClick={() => reset()}
        style={{
          marginTop: 16,
          padding: "8px 16px",
          background: "#3b82f6",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
        }}
      >
        {t("retry")}
      </button>
    </div>
  );
}
