"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useLocale } from "next-intl";
import { getAlertSocket, type AlertMessage } from "./alertSocket";
import { getAccessToken } from "@/lib/api/auth";

/**
 * Hook for receiving real-time alert notifications via WebSocket.
 * Automatically connects when user is authenticated, disconnects on unmount.
 */
export function useAlertSocket() {
  const [alerts, setAlerts] = useState<AlertMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [connected, setConnected] = useState(false);
  const locale = useLocale();
  const socketRef = useRef(getAlertSocket());

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;

    const socket = socketRef.current;
    socket.setLocale(locale);

    const unsub = socket.subscribe((msg) => {
      setAlerts((prev) => [msg, ...prev].slice(0, 50));
      setUnreadCount((c) => c + 1);
    });

    socket.connect();

    const statusCheck = setInterval(() => {
      setConnected(socket.connected);
    }, 2000);

    return () => {
      unsub();
      clearInterval(statusCheck);
      socket.disconnect();
    };
  }, [locale]);

  const clearUnread = useCallback(() => {
    setUnreadCount(0);
  }, []);

  const clearAlerts = useCallback(() => {
    setAlerts([]);
    setUnreadCount(0);
  }, []);

  return { alerts, unreadCount, connected, clearUnread, clearAlerts };
}
