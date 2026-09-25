export interface BybitEnvelope<T> {
  retCode: number;
  retMsg: string;
  result: T;
  time: number;
}

export interface KlineRow {
  startTime: number;
  endTime: number;
  interval: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  turnover: string;
}

export interface NormalizedCandle extends KlineRow {
  category: string;
  symbol: string;
  series: "last" | "mark" | "index" | "premium";
  confirm: boolean;
  sourceTimestamp: number;
}

export interface StorageRow {
  [key: string]: unknown;
}

export interface EngineHealth {
  processStartedAt: number;
  wsConnected: boolean;
  wsLastMessageAt: number | null;
  restLastSuccessAt: number | null;
  lastErrorAt: number | null;
  lastError: string | null;
  messages: number;
  trades: number;
  orderbookMessages: number;
  tickerMessages: number;
  candleMessages: number;
  liquidationMessages: number;
  queuedRows: number;
}
