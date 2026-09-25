import { config } from "./config.js";
import { eventId } from "./utils.js";
import { logger } from "./logger.js";
import { BybitRest } from "./bybit/rest.js";
import { Storage } from "./storage/supabase.js";
import type { NormalizedCandle } from "./types.js";

const candleRow = (
  series: NormalizedCandle["series"],
  interval: string,
  row: { startTime: number; endTime: number; open: string; high: string; low: string; close: string; volume: string; turnover: string },
  confirm: boolean,
  observedAt: number
) => ({
  category: config.bybit.category,
  symbol: config.bybit.symbol,
  series,
  interval,
  start_time_ms: row.startTime,
  end_time_ms: row.endTime,
  open: row.open,
  high: row.high,
  low: row.low,
  close: row.close,
  volume: row.volume || null,
  turnover: row.turnover || null,
  confirm,
  source_timestamp_ms: observedAt,
  updated_at: new Date().toISOString()
});

export async function bootstrapMarket(rest: BybitRest, storage: Storage): Promise<void> {
  const observedAt = Date.now();

  const instruments = await rest.getInstruments();
  for (const instrument of instruments) {
    storage.enqueue("market_instruments", {
      category: config.bybit.category,
      symbol: String(instrument.symbol ?? config.bybit.symbol),
      instrument: instrument,
      observed_at: new Date().toISOString()
    }, "category,symbol");
  }

  for (const interval of config.candles.intervals) {
    const rows = await rest.getKlines(interval, config.candles.limit);
    for (const row of rows) {
      storage.enqueue("market_candles", candleRow("last", interval, row, row.endTime < observedAt, observedAt),
        "category,symbol,series,interval,start_time_ms");
    }
  }

  if (config.derivatives.markIndexPremium && config.bybit.category === "linear") {
    for (const interval of config.candles.intervals) {
      for (const item of await rest.getSecondaryKlines("/v5/market/mark-price-kline", interval)) {
        storage.enqueue("market_candles", candleRow("mark", interval, item, item.endTime < observedAt, observedAt),
          "category,symbol,series,interval,start_time_ms");
      }
      for (const item of await rest.getSecondaryKlines("/v5/market/index-price-kline", interval)) {
        storage.enqueue("market_candles", candleRow("index", interval, item, item.endTime < observedAt, observedAt),
          "category,symbol,series,interval,start_time_ms");
      }
      for (const item of await rest.getSecondaryKlines("/v5/market/premium-index-price-kline", interval)) {
        storage.enqueue("market_candles", candleRow("premium", interval, item, item.endTime < observedAt, observedAt),
          "category,symbol,series,interval,start_time_ms");
      }
    }
  }

  const ticker = await rest.getTicker();
  if (ticker) {
    storage.enqueue("market_ticker_state", {
      category: config.bybit.category,
      symbol: config.bybit.symbol,
      event_time_ms: observedAt,
      data: ticker,
      updated_at: new Date().toISOString()
    }, "category,symbol");
  }

  const book = await rest.getOrderbook();
  storage.enqueue("market_orderbook_state", {
    category: config.bybit.category,
    symbol: config.bybit.symbol,
    event_time_ms: book.ts,
    update_id: book.u,
    cross_sequence: book.seq,
    matching_engine_time_ms: book.cts,
    bids: book.b,
    asks: book.a,
    updated_at: new Date().toISOString()
  }, "category,symbol");

  for (const trade of await rest.getRecentTrades(1000)) {
    const id = String(trade.execId ?? eventId("rest-recent-trade", trade));
    storage.enqueue("market_trades", {
      event_id: id,
      category: config.bybit.category,
      symbol: config.bybit.symbol,
      trade_time_ms: Number(trade.time),
      side: trade.side ?? null,
      price: trade.price ?? null,
      size: trade.size ?? null,
      sequence_id: trade.seq ?? null,
      is_block_trade: trade.isBlockTrade ?? false,
      is_rpi_trade: trade.isRPITrade ?? false,
      raw: trade,
      observed_at: new Date().toISOString()
    }, "event_id");
  }

  for (const item of await rest.getFunding(200)) {
    storage.enqueue("market_funding", {
      category: config.bybit.category,
      symbol: config.bybit.symbol,
      funding_time_ms: Number(item.fundingRateTimestamp),
      funding_rate: item.fundingRate,
      raw: item,
      observed_at: new Date().toISOString()
    }, "category,symbol,funding_time_ms");
  }

  for (const item of await rest.getOpenInterest("5min", 200)) {
    storage.enqueue("market_open_interest", {
      category: config.bybit.category,
      symbol: config.bybit.symbol,
      interval_time: "5min",
      timestamp_ms: Number(item.timestamp),
      open_interest: item.openInterest ?? item.singleOpenInterest ?? null,
      open_interest_value: item.openInterestValue ?? item.singleOpenInterestValue ?? null,
      raw: item,
      observed_at: new Date().toISOString()
    }, "category,symbol,interval_time,timestamp_ms");
  }

  for (const period of ["5min", "15min", "30min", "1h", "4h", "1d"]) {
    for (const item of await rest.getAccountRatio(period, 500)) {
      storage.enqueue("market_account_ratio", {
        category: config.bybit.category,
        symbol: config.bybit.symbol,
        period,
        timestamp_ms: Number(item.timestamp),
        buy_ratio: item.buyRatio,
        sell_ratio: item.sellRatio,
        raw: item,
        observed_at: new Date().toISOString()
      }, "category,symbol,period,timestamp_ms");
    }
  }

  const [priceLimit, riskLimit, delivery, insurance, serverTime] = await Promise.all([
    rest.getPriceLimit(),
    rest.getRiskLimit(),
    rest.getDeliveryPrice(),
    rest.getInsurance(),
    rest.serverTime()
  ]);

  storage.enqueue("market_reference", {
    reference_key: "price_limit",
    category: config.bybit.category,
    symbol: config.bybit.symbol,
    data: priceLimit,
    observed_at: new Date().toISOString()
  }, "reference_key,category,symbol");

  storage.enqueue("market_reference", {
    reference_key: "risk_limit",
    category: config.bybit.category,
    symbol: config.bybit.symbol,
    data: riskLimit,
    observed_at: new Date().toISOString()
  }, "reference_key,category,symbol");

  storage.enqueue("market_reference", {
    reference_key: "delivery_price",
    category: config.bybit.category,
    symbol: config.bybit.symbol,
    data: delivery,
    observed_at: new Date().toISOString()
  }, "reference_key,category,symbol");

  storage.enqueue("market_reference", {
    reference_key: "insurance",
    category: config.bybit.category,
    symbol: config.bybit.symbol,
    data: insurance,
    observed_at: new Date().toISOString()
  }, "reference_key,category,symbol");

  storage.enqueue("market_reference", {
    reference_key: "server_time",
    category: config.bybit.category,
    symbol: config.bybit.symbol,
    data: { serverTime: serverTime },
    observed_at: new Date().toISOString()
  }, "reference_key,category,symbol");

  await storage.flush();
  logger.info("Bybit market bootstrap complete");
}

export async function reconcileLatest(rest: BybitRest, storage: Storage): Promise<void> {
  const observedAt = Date.now();
  for (const interval of config.candles.intervals) {
    const rows = await rest.getKlines(interval, 3);
    for (const row of rows) {
      storage.enqueue("market_candles", candleRow("last", interval, row, row.endTime < observedAt, observedAt),
        "category,symbol,series,interval,start_time_ms");
    }
  }
  const ticker = await rest.getTicker();
  if (ticker) {
    storage.enqueue("market_ticker_state", {
      category: config.bybit.category,
      symbol: config.bybit.symbol,
      event_time_ms: observedAt,
      data: ticker,
      updated_at: new Date().toISOString()
    }, "category,symbol");
  }
  await storage.flush();
  logger.info("recent REST reconciliation complete");
}
