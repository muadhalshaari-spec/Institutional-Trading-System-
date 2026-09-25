import WebSocket from "ws";
import { config } from "../config.js";
import { boundedBackoff, sleep } from "../utils.js";
import { logger } from "../logger.js";

export type WsHandler = (message: Record<string, unknown>) => Promise<void> | void;
export type WsStatusHandler = (connected: boolean) => Promise<void> | void;

export class BybitPublicWs {
  private ws: WebSocket | null = null;
  private stopping = false;
  private heartbeat: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;

  constructor(
    private readonly onMessage: WsHandler,
    private readonly onStatus: WsStatusHandler
  ) {}

  start(): void {
    this.stopping = false;
    this.connect();
  }

  stop(): void {
    this.stopping = true;
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.heartbeat = null;
    this.reconnectTimer = null;
    this.ws?.close();
    this.ws = null;
  }

  private connect(): void {
    if (this.stopping) return;
    logger.info({ url: config.bybit.wsUrl }, "bybit websocket connecting");
    const ws = new WebSocket(config.bybit.wsUrl, { handshakeTimeout: 15000 });
    this.ws = ws;

    ws.on("open", () => {
      this.reconnectAttempt = 0;
      this.subscribe(ws);
      if (this.heartbeat) clearInterval(this.heartbeat);
      this.heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ op: "ping" }));
        }
      }, 20000);
      void this.onStatus(true);
      logger.info("bybit websocket connected");
    });

    ws.on("message", (data) => {
      try {
        const parsed = JSON.parse(data.toString()) as Record<string, unknown>;
        void this.onMessage(parsed);
      } catch (error) {
        logger.warn({ error: String(error) }, "invalid websocket message");
      }
    });

    ws.on("error", (error) => {
      logger.error({ error: String(error) }, "bybit websocket error");
    });

    ws.on("close", async (code, reason) => {
      if (this.heartbeat) clearInterval(this.heartbeat);
      this.heartbeat = null;
      this.ws = null;
      await this.onStatus(false);
      logger.warn({ code, reason: reason.toString() }, "bybit websocket closed");
      if (!this.stopping) {
        const delay = boundedBackoff(this.reconnectAttempt++);
        this.reconnectTimer = setTimeout(() => this.connect(), delay);
      }
    });
  }

  private subscribe(ws: WebSocket): void {
    const args = [
      ...config.candles.intervals.map((i) => "kline." + i + "." + config.bybit.symbol),
      "publicTrade." + config.bybit.symbol,
      "orderbook." + config.orderbook.depth + "." + config.bybit.symbol,
      "tickers." + config.bybit.symbol,
      "allLiquidation." + config.bybit.symbol
    ];
    ws.send(JSON.stringify({
      req_id: "institutional-engine",
      op: "subscribe",
      args
    }));
  }

  async reconnectNow(): Promise<void> {
    this.ws?.close();
    await sleep(10);
  }
}
