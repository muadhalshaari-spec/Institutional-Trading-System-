import { config } from "./config.js";
import { BybitRest } from "./bybit/rest.js";
import { BybitPublicWs } from "./bybit/ws.js";
import { Storage } from "./storage/supabase.js";
import { Health } from "./health.js";
import { eventId } from "./utils.js";
import { logger } from "./logger.js";
import { klineItemSchema, liquidationSchema, orderbookSchema, tradeItemSchema } from "./schemas.js";
import { bootstrapMarket, reconcileLatest } from "./recovery.js";

type Book = {
  bids: Map<string, string>;
  asks: Map<string, string>;
  updateId: number | null;
  sequence: number | null;
  matchingEngineTime: number | null;
  eventTime: number | null;
};

const nowIso = () => new Date().toISOString();

export class PlatformEngine {
  readonly rest = new BybitRest();
  readonly storage = new Storage();
  readonly health = new Health();

  private readonly ws: BybitPublicWs;
  private derivativeTimer: NodeJS.Timeout | null = null;
  private reconcileTimer: NodeJS.Timeout | null = null;
  private healthTimer: NodeJS.Timeout | null = null;
  private bookTimer: NodeJS.Timeout | null = null;
  private stopping = false;
  private latestTicker: Record<string, unknown> = {};
  private latestCandles = new Map<string, Record<string, unknown>>();
  private readonly book: Book = {
    bids: new Map(),
    asks: new Map(),
    updateId: null,
    sequence: null,
    matchingEngineTime: null,
    eventTime: null
  };

  constructor() {
    this.ws = new BybitPublicWs(
      (message) => this.handleWsMessage(message),
      (connected) => this.handleWsStatus(connected)
    );
  }

  async start(): Promise<void> {
    logger.info({
      category: config.bybit.category,
      symbol: config.bybit.symbol,
      intervals: config.candles.intervals
    }, "starting Bybit platform engine");

    this.ws.start();

    try {
      await bootstrapMarket(this.rest, this.storage);
      this.health.restSuccess();
    } catch (error) {
      this.health.error(error);
      logger.error({ error: String(error) }, "initial market bootstrap failed");
      throw error;
    }

    this.derivativeTimer = setInterval(() => void this.refreshDerivatives(), config.derivatives.refreshMs);
    this.reconcileTimer = setInterval(() => void this.runReconcile(), config.derivatives.reconcileMs);
    this.healthTimer = setInterval(() => void this.persistHealth(), 10000);
    this.bookTimer = setInterval(() => void this.persistBookState(), 1000);

    await this.refreshDerivatives();
    await this.persistHealth();
    logger.info("Bybit platform engine started");
  }

  async stop(): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;

    if (this.derivativeTimer) clearInterval(this.derivativeTimer);
    if (this.reconcileTimer) clearInterval(this.reconcileTimer);
    if (this.healthTimer) clearInterval(this.healthTimer);
    if (this.bookTimer) clearInterval(this.bookTimer);

    this.ws.stop();
    await this.persistBookState();
    await this.persistHealth();
    await this.storage.stop();
  }

  getLiveSnapshot(): Record<string, unknown> {
    return {
      exchange: "bybit",
      category: config.bybit.category,
      symbol: config.bybit.symbol,
      asOf: Date.now(),
      ticker: this.latestTicker,
      candles: Object.fromEntries(this.latestCandles),
      orderbook: {
        updateId: this.book.updateId,
        sequence: this.book.sequence,
        matchingEngineTime: this.book.matchingEngineTime,
        eventTime: this.book.eventTime,
        bids: this.sortedLevels(this.book.bids, true),
        asks: this.sortedLevels(this.book.asks, false)
      },
      health: this.health.snapshot(this.storage.queueSize())
    };
  }

  private async handleWsStatus(connected: boolean): Promise<void> {
    this.health.wsStatus(connected);
    if (connected) {
      try {
        await reconcileLatest(this.rest, this.storage);
        this.health.restSuccess();
      } catch (error) {
        this.health.error(error);
        logger.error({ error: String(error) }, "reconcile after websocket connect failed");
      }
    }
  }

  private async handleWsMessage(message: Record<string, unknown>): Promise<void> {
    this.health.wsMessage();
    const topic = typeof message.topic === "string" ? message.topic : "";
    if (!topic || message.op === "pong") return;

    try {
      const data = message.data;

      if (topic.startsWith("kline.")) {
        await this.handleKline(topic, data);
        this.health.count("candle");
        return;
      }

      if (topic.startsWith("publicTrade.")) {
        await this.handleTrade(topic, data);
        this.health.count("trade");
        return;
      }

      if (topic.startsWith("orderbook.")) {
        await this.handleOrderbook(topic, data);
        this.health.count("orderbook");
        return;
      }

      if (topic.startsWith("tickers.")) {
        await this.handleTicker(topic, data);
        this.health.count("ticker");
        return;
      }

      if (topic.startsWith("allLiquidation.")) {
        await this.handleLiquidation(topic, data);
        this.health.count("liquidation");
        return;
      }

      if (config.storage.rawEvents) {
        this.storage.enqueue("market_raw_events", {
          event_id: eventId(topic, message),
          topic,
          event_time_ms: Number(message.ts ?? Date.now()),
          payload: message,
          observed_at: nowIso()
        }, "event_id");
      }
    } catch (error) {
      this.health.error(error);
      logger.error({ topic, error: String(error) }, "websocket message handling failed");
    }
  }

  private async handleKline(topic: string, data: unknown): Promise<void> {
    if (!Array.isArray(data) || data.length === 0) return;
    const parsed = klineItemSchema.array().safeParse(data);
    if (!parsed.success) throw new Error("invalid kline payload: " + parsed.error.message);
    const item = parsed.data[0];
    const interval = String(item.interval ?? topic.split(".")[1] ?? "");
    const start = Number(item.start);
    const end = Number(item.end);
    const observed = Number(messageTimestamp(item.timestamp, Date.now()));
    if (!Number.isFinite(start) || !Number.isFinite(end)) return;

    const row = {
      source: "BYBIT",
      instrument: config.bybit.symbol,
      timeframe: interval,
      time_ms: start,
      open: String(item.open ?? ""),
      high: String(item.high ?? ""),
      low: String(item.low ?? ""),
      close: String(item.close ?? ""),
      volume: String(item.volume ?? ""),
      confirmed: Boolean(item.confirm),
      observed_at: nowIso()
    };

    this.latestCandles.set(interval, row);
    this.storage.enqueue("market_candles", row, "source,instrument,timeframe,time_ms");
    if (config.storage.rawEvents) {
      this.storage.enqueue("market_raw_events", {
        event_id: eventId(topic, data),
        topic,
        event_time_ms: Number(messageTimestamp(dataTimestamp(data), Date.now())),
        payload: data,
        observed_at: nowIso()
      }, "event_id");
    }
  }

  private async handleTrade(topic: string, data: unknown): Promise<void> {
    if (!Array.isArray(data)) return;
    const parsed = tradeItemSchema.array().safeParse(data);
    if (!parsed.success) throw new Error("invalid trade payload: " + parsed.error.message);
    for (const item of parsed.data) {
      const id = String(item.execId ?? item.i ?? eventId(topic, item));
      const tradeTime = Number(item.time ?? item.T ?? Date.now());
      const row = {
        event_id: id,
        category: config.bybit.category,
        symbol: String(item.symbol ?? item.s ?? config.bybit.symbol),
        trade_time_ms: tradeTime,
        side: item.side ?? item.S ?? null,
        price: item.price ?? item.p ?? null,
        size: item.size ?? item.v ?? null,
        sequence_id: item.seq ?? null,
        is_block_trade: item.isBlockTrade ?? false,
        is_rpi_trade: item.isRPITrade ?? false,
        raw: item,
        observed_at: nowIso()
      };
      this.storage.enqueue("market_trades", row, "event_id");
    }
  }

  private async handleOrderbook(topic: string, data: unknown): Promise<void> {
    if (!data || typeof data !== "object") return;
    const validation = orderbookSchema.safeParse(data);
    if (!validation.success) throw new Error("invalid orderbook payload: " + validation.error.message);
    const item = validation.data;
    const type = String(item.type ?? messageTypeFallback(topic));
    const bids = Array.isArray(item.b) ? item.b as string[][] : [];
    const asks = Array.isArray(item.a) ? item.a as string[][] : [];

    const incomingUpdateId = Number(item.u);
    if (type === "snapshot") {
      this.book.bids.clear();
      this.book.asks.clear();
    } else if (Number.isFinite(incomingUpdateId) && this.book.updateId !== null) {
      if (incomingUpdateId <= this.book.updateId) return;
      if (incomingUpdateId > this.book.updateId + 1) {
        logger.warn({
          previousUpdateId: this.book.updateId,
          incomingUpdateId
        }, "orderbook update gap detected; requesting REST snapshot");
        await this.recoverOrderbook();
        return;
      }
    }
    this.applyLevels(this.book.bids, bids);
    this.applyLevels(this.book.asks, asks);
    this.book.updateId = Number(item.u ?? this.book.updateId);
    this.book.sequence = Number(item.seq ?? this.book.sequence);
    this.book.matchingEngineTime = Number(item.cts ?? this.book.matchingEngineTime);
    this.book.eventTime = Number(item.ts ?? Date.now());

    if (config.orderbook.persistUpdates) {
      this.storage.enqueue("market_orderbook_updates", {
        event_id: eventId(topic, item),
        category: config.bybit.category,
        symbol: config.bybit.symbol,
        message_type: type,
        event_time_ms: Number(item.ts ?? Date.now()),
        update_id: item.u ?? null,
        cross_sequence: item.seq ?? null,
        matching_engine_time_ms: item.cts ?? null,
        bids,
        asks,
        raw: item,
        observed_at: nowIso()
      }, "event_id");
    }
  }

  private async handleTicker(_topic: string, data: unknown): Promise<void> {
    if (!Array.isArray(data)) return;
    const item = data[0] as Record<string, unknown> | undefined;
    if (!item) return;
    this.latestTicker = { ...this.latestTicker, ...item };
    this.storage.enqueue("market_ticker_state", {
      category: config.bybit.category,
      symbol: config.bybit.symbol,
      event_time_ms: Date.now(),
      data: this.latestTicker,
      updated_at: nowIso()
    }, "category,symbol");
  }

  private async handleLiquidation(topic: string, data: unknown): Promise<void> {
    if (!data || typeof data !== "object") return;
    const validation = liquidationSchema.safeParse(data);
    if (!validation.success) throw new Error("invalid liquidation payload: " + validation.error.message);
    const item = validation.data;
    this.storage.enqueue("market_liquidations", {
      event_id: eventId(topic, item),
      category: config.bybit.category,
      symbol: String(item.s ?? config.bybit.symbol),
      event_time_ms: Number(item.T ?? item.ts ?? Date.now()),
      side: item.S ?? null,
      size: item.v ?? null,
      bankruptcy_price: item.p ?? null,
      raw: item,
      observed_at: nowIso()
    }, "event_id");
  }

  private async recoverOrderbook(): Promise<void> {
    try {
      const snapshot = await this.rest.getOrderbook();
      this.book.bids.clear();
      this.book.asks.clear();
      this.applyLevels(this.book.bids, snapshot.b);
      this.applyLevels(this.book.asks, snapshot.a);
      this.book.updateId = snapshot.u;
      this.book.sequence = snapshot.seq;
      this.book.matchingEngineTime = snapshot.cts;
      this.book.eventTime = snapshot.ts;
      this.storage.enqueue("market_orderbook_state", {
        category: config.bybit.category,
        symbol: config.bybit.symbol,
        event_time_ms: snapshot.ts,
        update_id: snapshot.u,
        cross_sequence: snapshot.seq,
        matching_engine_time_ms: snapshot.cts,
        bids: snapshot.b,
        asks: snapshot.a,
        updated_at: nowIso()
      }, "category,symbol");
      await this.storage.flush();
      this.health.restSuccess();
      logger.info({ updateId: snapshot.u }, "orderbook restored from REST snapshot");
    } catch (error) {
      this.health.error(error);
      logger.error({ error: String(error) }, "orderbook REST recovery failed");
    }
  }

  private applyLevels(target: Map<string, string>, levels: string[][]): void {
    for (const level of levels) {
      const price = level[0];
      const size = level[1];
      if (!price || size === undefined) continue;
      if (Number(size) === 0) target.delete(price);
      else target.set(price, size);
    }
  }

  private sortedLevels(target: Map<string, string>, descending: boolean): string[][] {
    return [...target.entries()]
      .sort((a, b) => {
        const d = Number(a[0]) - Number(b[0]);
        return descending ? -d : d;
      })
      .slice(0, config.orderbook.depth)
      .map(([price, size]) => [price, size]);
  }

  private async persistBookState(): Promise<void> {
    if (this.book.eventTime === null) return;
    this.storage.enqueue("market_orderbook_state", {
      category: config.bybit.category,
      symbol: config.bybit.symbol,
      event_time_ms: this.book.eventTime,
      update_id: this.book.updateId,
      cross_sequence: this.book.sequence,
      matching_engine_time_ms: this.book.matchingEngineTime,
      bids: this.sortedLevels(this.book.bids, true),
      asks: this.sortedLevels(this.book.asks, false),
      updated_at: nowIso()
    }, "category,symbol");
  }

  private async refreshDerivatives(): Promise<void> {
    try {
      if (config.bybit.category === "linear" || config.bybit.category === "inverse") {
        for (const period of ["5min", "15min", "30min", "1h", "4h", "1d"]) {
          for (const item of await this.rest.getAccountRatio(period, 500)) {
            this.storage.enqueue("market_account_ratio", {
              category: config.bybit.category,
              symbol: config.bybit.symbol,
              period,
              timestamp_ms: Number(item.timestamp),
              buy_ratio: item.buyRatio,
              sell_ratio: item.sellRatio,
              raw: item,
              observed_at: nowIso()
            }, "category,symbol,period,timestamp_ms");
          }
        }

        for (const intervalTime of ["5min", "15min", "30min", "1h", "4h", "1d"]) {
          for (const item of await this.rest.getOpenInterest(intervalTime, 200)) {
            this.storage.enqueue("market_open_interest", {
              category: config.bybit.category,
              symbol: config.bybit.symbol,
              interval_time: intervalTime,
              timestamp_ms: Number(item.timestamp),
              open_interest: item.openInterest ?? item.singleOpenInterest ?? null,
              open_interest_value: item.openInterestValue ?? item.singleOpenInterestValue ?? null,
              raw: item,
              observed_at: nowIso()
            }, "category,symbol,interval_time,timestamp_ms");
          }
        }

        for (const item of await this.rest.getFunding(200)) {
          this.storage.enqueue("market_funding", {
            category: config.bybit.category,
            symbol: config.bybit.symbol,
            funding_time_ms: Number(item.fundingRateTimestamp),
            funding_rate: item.fundingRate,
            raw: item,
            observed_at: nowIso()
          }, "category,symbol,funding_time_ms");
        }
      }

      if (config.derivatives.markIndexPremium && config.bybit.category === "linear") {
        for (const interval of config.candles.intervals) {
          for (const [series, path] of [
            ["mark", "/v5/market/mark-price-kline"],
            ["index", "/v5/market/index-price-kline"],
            ["premium", "/v5/market/premium-index-price-kline"]
          ] as const) {
            for (const row of await this.rest.getSecondaryKlines(path, interval, 2)) {
              this.storage.enqueue("market_candles", {
                source: "BYBIT_" + series.toUpperCase(),
                instrument: config.bybit.symbol,
                timeframe: interval,
                time_ms: row.startTime,
                open: row.open,
                high: row.high,
                low: row.low,
                close: row.close,
                volume: 0,
                confirmed: row.endTime < Date.now(),
                observed_at: nowIso()
              }, "category,symbol,series,interval,start_time_ms");
            }
          }
        }
      }

      const [priceLimit, riskLimit, delivery, insurance, serverTime] = await Promise.all([
        this.rest.getPriceLimit(),
        this.rest.getRiskLimit(),
        this.rest.getDeliveryPrice(),
        this.rest.getInsurance(),
        this.rest.serverTime()
      ]);

      const refs: Array<[string, unknown]> = [
        ["price_limit", priceLimit],
        ["risk_limit", riskLimit],
        ["delivery_price", delivery],
        ["insurance", insurance],
        ["server_time", { serverTime }]
      ];

      for (const [key, data] of refs) {
        this.storage.enqueue("market_reference", {
          reference_key: key,
          category: config.bybit.category,
          symbol: config.bybit.symbol,
          data,
          observed_at: nowIso()
        }, "reference_key,category,symbol");
      }

      await this.storage.flush();
      this.health.restSuccess();
    } catch (error) {
      this.health.error(error);
      logger.error({ error: String(error) }, "derivative/reference refresh failed");
    }
  }

  private async runReconcile(): Promise<void> {
    try {
      await reconcileLatest(this.rest, this.storage);
      this.health.restSuccess();
    } catch (error) {
      this.health.error(error);
      logger.error({ error: String(error) }, "periodic REST reconciliation failed");
    }
  }

  private async persistHealth(): Promise<void> {
    const h = this.health.snapshot(this.storage.queueSize());
    try {
      await this.storage.upsertHealth({
        id: "bybit-" + config.bybit.category + "-" + config.bybit.symbol,
        category: config.bybit.category,
        symbol: config.bybit.symbol,
        process_started_at_ms: h.processStartedAt,
        ws_connected: h.wsConnected,
        ws_last_message_at_ms: h.wsLastMessageAt,
        rest_last_success_at_ms: h.restLastSuccessAt,
        last_error_at_ms: h.lastErrorAt,
        last_error: h.lastError,
        messages: h.messages,
        trades: h.trades,
        orderbook_messages: h.orderbookMessages,
        ticker_messages: h.tickerMessages,
        candle_messages: h.candleMessages,
        liquidation_messages: h.liquidationMessages,
        queued_rows: h.queuedRows,
        updated_at: nowIso()
      });
    } catch (error) {
      this.health.error(error);
      logger.error({ error: String(error) }, "health persistence failed");
    }
  }
}

function messageTimestamp(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function dataTimestamp(data: unknown): unknown {
  if (Array.isArray(data) && data[0] && typeof data[0] === "object") {
    return (data[0] as Record<string, unknown>).timestamp;
  }
  return undefined;
}

function messageTypeFallback(topic: string): string {
  return topic.includes("orderbook") ? "delta" : "unknown";
}
