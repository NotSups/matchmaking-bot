import type { QueueEntry } from "./types.js";

/**
 * Backing store for the waiting pool. Two implementations ship today:
 *  - InMemoryWaitingPool : single-process, zero deps (dev / demo)
 *  - RedisWaitingPool    : shared across bot instances (production)
 *
 * The Matchmaker only depends on this interface, so adding a new backend
 * (e.g. a database-backed pool) is a drop-in.
 */
export interface WaitingPool {
  add(entry: QueueEntry): Promise<void>;
  remove(userId: string): Promise<boolean>;
  has(userId: string): Promise<boolean>;
  /** Returns the best compatible candidate for `entry`, or null. */
  findCompatible(entry: QueueEntry): Promise<QueueEntry | null>;
  size(scope: string): Promise<number>;
  waitingSince(userId: string): Promise<number | null>;
  /** Snapshot for dashboard stats (size per scope). */
  stats(): Promise<Record<string, number>>;
}
