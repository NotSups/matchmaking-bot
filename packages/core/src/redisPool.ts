import Redis from "ioredis";
import type { QueueEntry } from "./types.js";
import type { WaitingPool } from "./pool.js";
import { modesCompatible, scopeCompatible, score } from "./compat.js";

const KEY = "matchmaking:pool";

/**
 * Distributed pool backed by Redis. Every bot instance reads/writes the same
 * hash, so matchmaking works across a horizontally scaled fleet.
 *
 * Note: findCompatible does an O(n) scan of the pool. This is fine up to tens
 * of thousands of waiters; for larger scale, add secondary indexes (one sorted
 * set per scope/language) and intersect them before scoring.
 */
export class RedisWaitingPool implements WaitingPool {
  private redis: Redis;

  constructor(url: string) {
    this.redis = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 3 });
  }

  async add(entry: QueueEntry): Promise<void> {
    await this.redis.hset(KEY, entry.userId, JSON.stringify(entry));
  }

  async remove(userId: string): Promise<boolean> {
    return (await this.redis.hdel(KEY, userId)) > 0;
  }

  async has(userId: string): Promise<boolean> {
    return (await this.redis.hexists(KEY, userId)) === 1;
  }

  private async all(): Promise<QueueEntry[]> {
    const raw = await this.redis.hgetall(KEY);
    return Object.values(raw).map((v) => JSON.parse(v) as QueueEntry);
  }

  async findCompatible(entry: QueueEntry): Promise<QueueEntry | null> {
    const all = await this.all();
    let best: QueueEntry | null = null;
    let bestScore = -Infinity;
    for (const candidate of all) {
      if (candidate.userId === entry.userId) continue;
      if (!modesCompatible(entry.prefs, candidate.prefs)) continue;
      if (!scopeCompatible(entry, candidate)) continue;
      const sc = score(entry, candidate);
      if (sc > bestScore) {
        bestScore = sc;
        best = candidate;
      }
    }
    return best;
  }

  async size(_scope: string): Promise<number> {
    return this.redis.hlen(KEY);
  }

  async waitingSince(userId: string): Promise<number | null> {
    const raw = await this.redis.hget(KEY, userId);
    return raw ? (JSON.parse(raw) as QueueEntry).enqueuedAt : null;
  }

  async stats(): Promise<Record<string, number>> {
    const all = await this.all();
    const out: Record<string, number> = {};
    for (const e of all) out[e.prefs.scope] = (out[e.prefs.scope] ?? 0) + 1;
    return out;
  }
}
