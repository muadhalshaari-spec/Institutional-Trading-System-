import "dotenv/config";

const env = (name: string, fallback?: string): string => {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error("Missing environment variable: " + name);
  }
  return value;
};

const bool = (name: string, fallback: boolean): boolean => {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
};

const num = (name: string, fallback: number): number => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value)) throw new Error("Invalid number in " + name);
  return value;
};

const csv = (name: string, fallback: string[]): string[] => {
  const value = process.env[name];
  if (!value) return fallback;
  return value.split(",").map((v) => v.trim()).filter(Boolean);
};

export const config = Object.freeze({
  nodeEnv: process.env.NODE_ENV ?? "development",
  bybit: {
    testnet: bool("BYBIT_TESTNET", false),
    category: env("BYBIT_CATEGORY", "linear") as "linear" | "spot" | "inverse",
    symbol: env("BYBIT_SYMBOL", "ETHUSDT").toUpperCase(),
    restBase: env("BYBIT_REST_BASE", "https://api.bybit.com").replace(/\/$/, ""),
    wsUrl: env("BYBIT_WS_URL", "wss://stream.bybit.com/v5/public/linear")
  },
  candles: {
    limit: Math.min(1000, Math.max(1, num("CANDLE_LIMIT", 1000))),
    intervals: csv("CANDLE_INTERVALS", ["1", "5", "15", "60", "240", "D"])
  },
  derivatives: {
    markIndexPremium: bool("MARK_INDEX_PREMIUM_ENABLED", true),
    refreshMs: Math.max(15000, num("DERIVATIVES_REFRESH_MS", 60000)),
    reconcileMs: Math.max(15000, num("RECONCILE_MS", 60000))
  },
  orderbook: {
    depth: Math.min(1000, Math.max(1, num("ORDERBOOK_DEPTH", 50))),
    persistUpdates: bool("PERSIST_ORDERBOOK_UPDATES", true)
  },
  storage: {
    flushMs: Math.max(100, num("STORAGE_FLUSH_MS", 500)),
    batchSize: Math.min(1000, Math.max(1, num("STORAGE_BATCH_SIZE", 200))),
    rawEvents: bool("PERSIST_RAW_EVENTS", false)
  },
  supabase: {
    url: env("SUPABASE_URL"),
    serviceRoleKey: env("SUPABASE_SERVICE_ROLE_KEY")
  },
  api: {
    enabled: bool("API_ENABLED", true),
    host: env("API_HOST", "127.0.0.1"),
    port: num("API_PORT", 8787),
    readToken: process.env.API_READ_TOKEN ?? ""
  },
  logLevel: env("LOG_LEVEL", "info")
});
