import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { config } from "./config.js";
import type { PlatformEngine } from "./محرك المنصات.js";
import { logger } from "./logger.js";

const json = (res: ServerResponse, status: number, body: unknown): void => {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
};

const authOk = (req: IncomingMessage, allowHealth = false): boolean => {
  if (allowHealth) return true;
  if (!config.api.readToken) return false;
  const header = req.headers.authorization ?? "";
  return header === "Bearer " + config.api.readToken;
};

export class ReadonlyApi {
  private server: ReturnType<typeof createServer> | null = null;

  constructor(private readonly engine: PlatformEngine) {}

  start(): void {
    if (!config.api.enabled || this.server) return;
    this.server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (req.method !== "GET") return json(res, 405, { error: "method_not_allowed" });

        if (url.pathname === "/health") {
          return json(res, 200, this.engine.health.snapshot(this.engine.storage.queueSize()));
        }

        if (!authOk(req)) {
          return json(res, 401, { error: "unauthorized" });
        }

        if (url.pathname === "/live") {
          return json(res, 200, this.engine.getLiveSnapshot());
        }

        if (url.pathname === "/ticker") {
          return json(res, 200, await this.engine.storage.latestTicker());
        }

        if (url.pathname === "/candles") {
          const interval = url.searchParams.get("interval") ?? "15";
          const requested = Number(url.searchParams.get("limit") ?? "200");
          const limit = Number.isInteger(requested) ? Math.min(1000, Math.max(1, requested)) : 200;
          return json(res, 200, await this.engine.storage.recentCandles(interval, limit));
        }

        return json(res, 404, { error: "not_found" });
      } catch (error) {
        logger.error({ error: String(error) }, "readonly api request failed");
        return json(res, 500, { error: "internal_error" });
      }
    });

    this.server.listen(config.api.port, config.api.host, () => {
      logger.info({ host: config.api.host, port: config.api.port }, "readonly API listening");
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve, reject) => {
      this.server?.close((error) => error ? reject(error) : resolve());
    });
    this.server = null;
  }
}
