"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh">
      <body style={{ background: "#09090b", color: "#fff", fontFamily: "system-ui", padding: 40 }}>
        <h2 style={{ color: "#ef4444" }}>客户端错误</h2>
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
          重试
        </button>
      </body>
    </html>
  );
}
