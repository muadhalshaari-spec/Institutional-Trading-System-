import { config } from "../config.js";
import { sleep } from "../utils.js";
import type { BybitEnvelope, KlineRow } from "../types.js";

type Query = Record<string, string | number | undefined>;

export class BybitRest {
  private readonly base = config.bybit.restBase;

  private async request<T>(path: string, query: Query, attempt = 0): Promise<BybitEnvelope<T>> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) params.set(key, String(value));
    }
    const url = this.base + path + "?" + params.toString();

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(15000)
      });
    } catch (error) {
      if (attempt >= 5) throw error;
      await sleep(Math.min(30000, 500 * 2 ** attempt));
      return this.request<T>(path, query, attempt + 1);
    }

    const text = await response.text();
    let body: BybitEnvelope<T>;
    try {
      body = JSON.parse(text) as BybitEnvelope<T>;
    } catch {
      if (attempt >= 5) throw new Error("Bybit returned non-JSON response: " + response.status);
      await sleep(Math.min(30000, 500 * 2 ** attempt));
      return this.request<T>(path, query, attempt + 1);
    }

    const retryable = response.status === 429 || response.status >= 500 || body.retCode === 10006;
    if (!response.ok || body.retCode !== 0) {
      if (retryable && attempt < 5) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : Math.min(30000, 500 * 2 ** attempt);
        await sleep(delay);
        return this.request<T>(path, query, attempt + 1);
      }
      throw new Error("Bybit API error " + response.status + " retCode=" + body.retCode + " " + body.retMsg);
    }
    return body;
  }

  async serverTime(): Promise<number> {
    const r = await this.request<{ timeSecond: string; timeNano: string }>("/v5/market/time", {});
    return r.time;
  }

  async getKlines(interval: string, limit = config.candles.limit): Promise<KlineRow[]> {
    const r = await this.request<{ category: string; symbol: string; list: string[][] }>("/v5/market/kline", {
      category: config.bybit.category,
      symbol: config.bybit.symbol,
      interval,
      limit
    });
    return r.result.list
      .map((row) => ({
        startTime: Number(row[0]),
        endTime: Number(row[0]) + this.intervalMs(interval) - 1,
        interval,
        open: row[1] ?? "",
        high: row[2] ?? "",
        low: row[3] ?? "",
        close: row[4] ?? "",
        volume: row[5] ?? "",
        turnover: row[6] ?? ""
      }))
      .filter((row) => Number.isFinite(row.startTime))
      .sort((a, b) => a.startTime - b.startTime);
  }

  async getSecondaryKlines(path: string, interval: string, limit = config.candles.limit): Promise<KlineRow[]> {
    const r = await this.request<{ category: string; symbol: string; list: string[][] }>(path, {
      category: config.bybit.category,
      symbol: config.bybit.symbol,
      interval,
      limit
    });
    return r.result.list
      .map((row) => ({
        startTime: Number(row[0]),
        endTime: Number(row[0]) + this.intervalMs(interval) - 1,
        interval,
        open: row[1] ?? "",
        high: row[2] ?? "",
        low: row[3] ?? "",
        close: row[4] ?? "",
        volume: "",
        turnover: ""
      }))
      .filter((row) => Number.isFinite(row.startTime))
      .sort((a, b) => a.startTime - b.startTime);
  }

  async getRecentTrades(limit = 1000) {
    const r = await this.request<{ list: Array<Record<string, unknown>> }>("/v5/market/recent-trade", {
      category: config.bybit.category,
      symbol: config.bybit.symbol,
      limit: Math.min(1000, limit)
    });
    return r.result.list;
  }

  async getTicker() {
    const r = await this.request<{ category: string; list: Array<Record<string, unknown>> }>("/v5/market/tickers", {
      category: config.bybit.category,
      symbol: config.bybit.symbol
    });
    return r.result.list[0] ?? null;
  }

  async getOrderbook(limit = config.orderbook.depth) {
    const r = await this.request<{
      s: string; b: string[][]; a: string[][]; ts: number; u: number; seq: number; cts: number;
    }>("/v5/market/orderbook", {
      category: config.bybit.category,
      symbol: config.bybit.symbol,
      limit
    });
    return r.result;
  }

  async getInstruments() {
    const all: Array<Record<string, unknown>> = [];
    let cursor: string | undefined;
    do {
      const r = await this.request<{ nextPageCursor?: string; list: Array<Record<string, unknown>> }>(
        "/v5/market/instruments-info",
        { category: config.bybit.category, symbol: config.bybit.symbol, limit: 1000, cursor }
      );
      all.push(...r.result.list);
      cursor = r.result.nextPageCursor || undefined;
    } while (cursor);
    return all;
  }

  async getFunding(limit = 200) {
    const r = await this.request<{ list: Array<Record<string, unknown>> }>("/v5/market/funding/history", {
      category: config.bybit.category, symbol: config.bybit.symbol, limit: Math.min(200, limit)
    });
    return r.result.list;
  }

  async getOpenInterest(intervalTime = "5min", limit = 200) {
    const r = await this.request<{ list: Array<Record<string, unknown>> }>("/v5/market/open-interest", {
      category: config.bybit.category, symbol: config.bybit.symbol, intervalTime, limit: Math.min(200, limit)
    });
    return r.result.list;
  }

  async getAccountRatio(period = "1h", limit = 500) {
    const r = await this.request<{ list: Array<Record<string, unknown>> }>("/v5/market/account-ratio", {
      category: config.bybit.category, symbol: config.bybit.symbol, period, limit: Math.min(500, limit)
    });
    return r.result.list;
  }

  async getPriceLimit() {
    const r = await this.request<Record<string, unknown>>("/v5/market/price-limit", {
      category: config.bybit.category, symbol: config.bybit.symbol
    });
    return r.result;
  }

  async getRiskLimit() {
    const r = await this.request<{ list: Array<Record<string, unknown>> }>("/v5/market/risk-limit", {
      category: config.bybit.category, symbol: config.bybit.symbol
    });
    return r.result.list;
  }

  async getDeliveryPrice() {
    const r = await this.request<{ list: Array<Record<string, unknown>> }>("/v5/market/delivery-price", {
      category: config.bybit.category, symbol: config.bybit.symbol, limit: 200
    });
    return r.result.list;
  }

  async getInsurance() {
    const r = await this.request<{ updatedTime: string; list: Array<Record<string, unknown>> }>("/v5/market/insurance", {});
    return r.result;
  }

  private intervalMs(interval: string): number {
    const minutes: Record<string, number> = {
      "1": 1, "3": 3, "5": 5, "15": 15, "30": 30, "60": 60, "120": 120,
      "240": 240, "360": 360, "720": 720, "D": 1440, "W": 10080, "M": 43200
    };
    const m = minutes[interval];
    if (!m) throw new Error("Unsupported interval: " + interval);
    return m * 60 * 1000;
  }
}
