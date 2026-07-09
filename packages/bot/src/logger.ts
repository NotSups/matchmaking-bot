import { config } from "./config.js";

type Level = "debug" | "info" | "warn" | "error";
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const min = order[config.LOG_LEVEL];

function emit(level: Level, msg: string, meta?: unknown) {
  if (order[level] < min) return;
  const ts = new Date().toISOString();
  const line = JSON.stringify({ ts, level, msg, ...(meta ? { meta } : {}) });
  if (level === "error") console.error(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, meta?: unknown) => emit("debug", msg, meta),
  info: (msg: string, meta?: unknown) => emit("info", msg, meta),
  warn: (msg: string, meta?: unknown) => emit("warn", msg, meta),
  error: (msg: string, meta?: unknown) => emit("error", msg, meta),
};
