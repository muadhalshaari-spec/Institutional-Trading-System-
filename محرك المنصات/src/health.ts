import type { EngineHealth } from "./types.js";

export class Health {
  private readonly started = Date.now();
  private wsConnected = false;
  private wsLastMessageAt: number | null = null;
  private restLastSuccessAt: number | null = null;
  private lastErrorAt: number | null = null;
  private lastError: string | null = null;
  private messages = 0;
  private trades = 0;
  private orderbookMessages = 0;
  private tickerMessages = 0;
  private candleMessages = 0;
  private liquidationMessages = 0;

  wsStatus(value: boolean): void { this.wsConnected = value; }
  wsMessage(): void { this.wsLastMessageAt = Date.now(); this.messages++; }
  restSuccess(): void { this.restLastSuccessAt = Date.now(); }
  error(error: unknown): void {
    this.lastErrorAt = Date.now();
    this.lastError = String(error instanceof Error ? error.message : error);
  }

  count(kind: "trade" | "orderbook" | "ticker" | "candle" | "liquidation"): void {
    if (kind === "trade") this.trades++;
    else if (kind === "orderbook") this.orderbookMessages++;
    else if (kind === "ticker") this.tickerMessages++;
    else if (kind === "candle") this.candleMessages++;
    else this.liquidationMessages++;
  }

  snapshot(queuedRows: number): EngineHealth {
    return {
      processStartedAt: this.started,
      wsConnected: this.wsConnected,
      wsLastMessageAt: this.wsLastMessageAt,
      restLastSuccessAt: this.restLastSuccessAt,
      lastErrorAt: this.lastErrorAt,
      lastError: this.lastError,
      messages: this.messages,
      trades: this.trades,
      orderbookMessages: this.orderbookMessages,
      tickerMessages: this.tickerMessages,
      candleMessages: this.candleMessages,
      liquidationMessages: this.liquidationMessages,
      queuedRows
    };
  }
}
