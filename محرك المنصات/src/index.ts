import { PlatformEngine } from "./محرك المنصات.js";
import { ReadonlyApi } from "./api.js";
import { logger } from "./logger.js";

const engine = new PlatformEngine();
const api = new ReadonlyApi(engine);

let shuttingDown = false;

const shutdown = async (signal: string): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "shutdown requested");
  try {
    await api.stop();
    await engine.stop();
    process.exit(0);
  } catch (error) {
    logger.error({ error: String(error) }, "shutdown failed");
    process.exit(1);
  }
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("uncaughtException", (error) => {
  logger.fatal({ error: String(error) }, "uncaught exception");
  void shutdown("uncaughtException");
});
process.on("unhandledRejection", (reason) => {
  logger.fatal({ reason: String(reason) }, "unhandled rejection");
  void shutdown("unhandledRejection");
});

try {
  await engine.start();
  api.start();
} catch (error) {
  logger.fatal({ error: String(error) }, "engine failed to start");
  await shutdown("startup_failure");
}
