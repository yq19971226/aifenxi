import { getAccessToken } from "@/lib/api/auth";

export interface AlertMessage {
  type: string;
  alert_id?: string;
  symbol?: string;
  level?: string;
  title?: string;
  message?: string;
  timestamp?: string;
  [key: string]: unknown;
}

type AlertCallback = (msg: AlertMessage) => void;

/**
 * WebSocket client for backend /ws/alerts endpoint.
 * Handles JWT auth, auto-reconnect, and heartbeat pong.
 */
export class AlertSocket {
  private ws: WebSocket | null = null;
  private callbacks: Set<AlertCallback> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = true;
  private reconnectDelay = 3000;
  private maxReconnectDelay = 30000;
  private locale = "zh-CN";

  setLocale(locale: string): void {
    if (this.locale === locale) return;
    this.locale = locale;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private getUrl(): string | null {
    const token = getAccessToken();
    if (!token) return null;
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "";
    // 与页面同源：HTTPS 用 wss，否则用 ws；无 API_BASE 时用当前 host，避免 Mixed Content
    const wsBase = apiBase
      ? apiBase.replace(/^http/, "ws")
      : `${typeof window !== "undefined" && window.location.protocol === "https:" ? "wss" : "ws"}://${typeof window !== "undefined" ? window.location.host : "localhost:8000"}`;
    return `${wsBase}/ws/alerts?token=${token}&locale=${this.locale}`;
  }

  connect(): void {
    if (this.ws) return;
    const url = this.getUrl();
    if (!url) return;

    try {
      this.ws = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectDelay = 3000;
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as AlertMessage;
        // Respond to heartbeat ping
        if (data.type === "ping") {
          this.ws?.send(JSON.stringify({ type: "pong" }));
          return;
        }
        this.callbacks.forEach((cb) => cb(data));
      } catch {
        // ignore malformed messages
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  subscribe(cb: AlertCallback): () => void {
    this.callbacks.add(cb);
    return () => {
      this.callbacks.delete(cb);
    };
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, this.maxReconnectDelay);
  }
}

// Singleton instance
let _instance: AlertSocket | null = null;

export function getAlertSocket(): AlertSocket {
  if (!_instance) {
    _instance = new AlertSocket();
  }
  return _instance;
}
