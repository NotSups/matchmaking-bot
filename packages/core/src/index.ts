import { InMemoryWaitingPool } from "./inMemoryPool.js";
import { RedisWaitingPool } from "./redisPool.js";
import type { WaitingPool } from "./pool.js";
import { InMemoryStorage } from "./inMemoryStorage.js";
import type { Storage } from "./storage.js";
import { Matchmaker } from "./matchmaker.js";

export * from "./types.js";
export * from "./pool.js";
export * from "./storage.js";
export * from "./compat.js";
export { InMemoryWaitingPool } from "./inMemoryPool.js";
export { RedisWaitingPool } from "./redisPool.js";
export { InMemoryStorage } from "./inMemoryStorage.js";
export { Matchmaker } from "./matchmaker.js";

export function createPool(): WaitingPool {
  const backend = (process.env.QUEUE_BACKEND ?? "memory").toLowerCase();
  if (backend === "redis") {
    const url = process.env.REDIS_URL ?? "redis://localhost:6379";
    return new RedisWaitingPool(url);
  }
  return new InMemoryWaitingPool();
}

export function createStorage(): Storage {
  const backend = (process.env.STORAGE_BACKEND ?? "memory").toLowerCase();
  if (backend === "memory") return new InMemoryStorage();
  if (backend === "postgres") {
    // Production: drop a PrismaStorage implementation in packages/db and wire it here.
    // Requires `npm run db:generate` + a reachable Postgres. Until then, fall back
    // to memory so the bot still boots. TODO(postgres): import and return PrismaStorage.
    throw new Error(
      "STORAGE_BACKEND=postgres selected but PrismaStorage is not wired yet. " +
        "Run the bot with STORAGE_BACKEND=memory, or implement PrismaStorage.",
    );
  }
  return new InMemoryStorage();
}

export function createMatchmaker(): Matchmaker {
  return new Matchmaker(createPool(), createStorage());
}
