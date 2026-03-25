"use client";

import { useEffect, useRef, useState } from "react";

/**
 * useBinancePrice — 直连币安公开 WebSocket 获取实时成交价格。
 *
 * 使用 aggTrade 流（聚合成交），延迟 < 100ms。
 * 自动重连，组件卸载时自动清理。
 *
 * @param symbol 交易对（小写），如 "ethusdt"
 * @returns { price, connected }
 */
export function useBinancePrice(symbol: string) {
  const [price, setPrice] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const sym = symbol.toLowerCase();

    function connect() {
      if (!mountedRef.current) return;

      const ws = new WebSocket(
        `wss://stream.binance.com:9443/ws/${sym}@aggTrade`
      );
      wsRef.current = ws;

      ws.onopen = () => {
        if (mountedRef.current) setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // aggTrade 消息格式：{ p: "价格字符串", ... }
          if (data.p) {
            const p = parseFloat(data.p);
            if (!isNaN(p) && mountedRef.current) {
              setPrice(p);
            }
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        if (mountedRef.current) {
          setConnected(false);
          // 3 秒后重连
          reconnectTimer.current = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on unmount
        wsRef.current.close();
      }
    };
  }, [symbol]);

  return { price, connected };
}
