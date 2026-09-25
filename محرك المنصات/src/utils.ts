import { createHash } from "node:crypto";

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const toInt = (value: unknown): number => {
  const n = Number(value);
  if (!Number.isInteger(n)) throw new Error("Expected integer timestamp");
  return n;
};

export const eventId = (topic: string, payload: unknown): string => {
  const source = topic + ":" + JSON.stringify(payload);
  return createHash("sha256").update(source).digest("hex");
};

export const boundedBackoff = (attempt: number, base = 500, max = 30000): number => {
  const exponential = Math.min(max, base * Math.pow(2, Math.max(0, attempt)));
  const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(exponential * 0.2)));
  return exponential + jitter;
};

export const assertPositiveFinite = (name: string, value: number): number => {
  if (!Number.isFinite(value) || value <= 0) throw new Error(name + " must be positive");
  return value;
};
