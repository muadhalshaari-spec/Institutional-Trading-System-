import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config.js";
import { logger } from "../logger.js";

interface QueueItem {
  table: string;
  row: Record<string, unknown>;
  onConflict?: string;
}

export class Storage {
  readonly client: SupabaseClient;
  private readonly queue: QueueItem[] = [];
  private timer: NodeJS.Timeout | null;

  constructor() {
    this.client = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    this.timer = setInterval(() => void this.flush(), config.storage.flushMs);
  }

  enqueue(table: string, row: Record<string, unknown>, onConflict?: string): void {
    this.queue.push({ table, row, onConflict });
  }

  queueSize(): number {
    return this.queue.length;
  }

  async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    const drained = this.queue.splice(0, Math.min(this.queue.length, config.storage.batchSize * 20));
    const groups = new Map<string, QueueItem[]>();

    for (const item of drained) {
      const list = groups.get(item.table) ?? [];
      list.push(item);
      groups.set(item.table, list);
    }

    for (const [table, items] of groups) {
      for (let i = 0; i < items.length; i += config.storage.batchSize) {
        const part = items.slice(i, i + config.storage.batchSize);
        const rows = part.map((x) => x.row);
        const onConflict = part.find((x) => x.onConflict)?.onConflict;
        const query = onConflict
          ? this.client.from(table).upsert(rows, { onConflict, ignoreDuplicates: false })
          : this.client.from(table).insert(rows);

        const { error } = await query;
        if (error) {
          logger.error({ table, count: rows.length, error: error.message }, "supabase write failed");
          this.queue.unshift(...part);
        }
      }
    }
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (let i = 0; i < 20 && this.queue.length > 0; i++) {
      await this.flush();
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (this.queue.length > 0) {
      throw new Error("Storage stopped with " + this.queue.length + " queued rows");
    }
  }

  async recentCandles(interval: string, limit: number): Promise<Record<string, unknown>[]> {
    const result = await this.client
      .from("market_candles")
      .select("*")
      .eq("source", "BYBIT")
      .eq("instrument", config.bybit.symbol)
      .eq("timeframe", interval)
      .order("time_ms", { ascending: false })
      .limit(Math.min(limit, 1000));

    if (result.error) throw new Error(result.error.message);
    return result.data ?? [];
  }

  async latestTicker(): Promise<Record<string, unknown> | null> {
    const result = await this.client
      .from("market_ticker_state")
      .select("*")
      .eq("category", config.bybit.category)
      .eq("symbol", config.bybit.symbol)
      .maybeSingle();

    if (result.error) throw new Error(result.error.message);
    return result.data;
  }

  async upsertHealth(row: Record<string, unknown>): Promise<void> {
    const { error } = await this.client.from("collector_health").upsert([row], {
      onConflict: "id",
      ignoreDuplicates: false
    });
    if (error) throw new Error(error.message);
  }
}
