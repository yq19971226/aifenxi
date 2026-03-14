"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { authFetch } from "@/lib/api/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
const INTERVAL_MS = 90_000; // 90 秒，与后端 PRESENCE_TTL 180 秒配合

/** 登录状态下定时上报心跳，供管理端「登录在线」统计。 */
export function PresenceHeartbeat() {
  const { user } = useAuth();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const ping = () => {
      authFetch(`${API_BASE}/api/presence`, { method: "POST" }).catch(() => {});
    };

    ping();
    intervalRef.current = setInterval(ping, INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [user]);

  return null;
}
