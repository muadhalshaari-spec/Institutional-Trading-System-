import { z } from "zod";

const decimalText = z.string().min(1).refine((v) => Number.isFinite(Number(v)), {
  message: "must be numeric text"
});

export const klineItemSchema = z.object({
  start: z.coerce.number().int().nonnegative(),
  end: z.coerce.number().int().positive(),
  interval: z.string().min(1),
  open: decimalText,
  high: decimalText,
  low: decimalText,
  close: decimalText,
  volume: decimalText,
  turnover: decimalText,
  confirm: z.boolean().optional(),
  timestamp: z.coerce.number().int().positive().optional()
});

export const tradeItemSchema = z.object({
  execId: z.string().optional(),
  i: z.string().optional(),
  symbol: z.string().optional(),
  s: z.string().optional(),
  price: decimalText.optional(),
  p: decimalText.optional(),
  size: decimalText.optional(),
  v: decimalText.optional(),
  side: z.string().optional(),
  S: z.string().optional(),
  time: z.coerce.number().int().nonnegative().optional(),
  T: z.coerce.number().int().nonnegative().optional(),
  seq: z.union([z.string(), z.number()]).optional(),
  isBlockTrade: z.boolean().optional(),
  isRPITrade: z.boolean().optional()
});

export const orderbookSchema = z.object({
  type: z.enum(["snapshot", "delta"]).optional(),
  s: z.string().optional(),
  b: z.array(z.array(z.string()).length(2)).optional(),
  a: z.array(z.array(z.string()).length(2)).optional(),
  ts: z.coerce.number().int().positive().optional(),
  u: z.coerce.number().int().nonnegative().optional(),
  seq: z.coerce.number().int().nonnegative().optional(),
  cts: z.coerce.number().int().nonnegative().optional()
});

export const liquidationSchema = z.object({
  T: z.coerce.number().int().positive().optional(),
  s: z.string().optional(),
  S: z.string().optional(),
  v: decimalText.optional(),
  p: decimalText.optional()
});
