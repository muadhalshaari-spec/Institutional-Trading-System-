import { describe, expect, it } from "vitest";
import { eventId, boundedBackoff } from "../src/utils.js";

describe("platform engine primitives", () => {
  it("creates a deterministic event id", () => {
    const payload = { symbol: "ETHUSDT", price: "100", size: "1" };
    expect(eventId("publicTrade.ETHUSDT", payload))
      .toBe(eventId("publicTrade.ETHUSDT", payload));
  });

  it("creates different ids for different events", () => {
    expect(eventId("topic", { x: 1 })).not.toBe(eventId("topic", { x: 2 }));
  });

  it("keeps reconnect backoff bounded", () => {
    expect(boundedBackoff(0, 100, 1000)).toBeGreaterThanOrEqual(100);
    expect(boundedBackoff(20, 100, 1000)).toBeGreaterThanOrEqual(1000);
  });
});
