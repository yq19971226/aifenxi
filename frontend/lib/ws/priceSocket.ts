type PriceCallback = (price: number, time: string) => void;

interface BinanceTradeMessage {
  e: string;
  E: number;
  s: string;
  t: number;
  p: string;
  q: string;
  T: number;
}

export class PriceSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private callbacks: Set<PriceCallback> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = true;

  constructor(symbol: string) {
    this.url = `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@trade`;
  }

  connect(): void {
    if (this.ws) return;

    this.ws = new WebSocket(this.url);

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as BinanceTradeMessage;
        const price = parseFloat(data.p);
        const time = new Date(data.T).toISOString();
        this.callbacks.forEach((cb) => cb(price, time));
      } catch {
        // ignore malformed messages
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
      if (this.shouldReconnect) {
        this.reconnectTimer = setTimeout(() => this.connect(), 3000);
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

  subscribe(cb: PriceCallback): () => void {
    this.callbacks.add(cb);
    return () => {
      this.callbacks.delete(cb);
    };
  }
}
