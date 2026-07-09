import { randomUUID } from "node:crypto";
import type { QueueEntry, Match } from "./types.js";
import type { Storage } from "./storage.js";
import type { WaitingPool } from "./pool.js";

export class Matchmaker {
  constructor(
    private pool: WaitingPool,
    private storage: Storage,
  ) {}

  /**
   * Try to match `entry` with a compatible waiter. Returns a Match when one is
   * found (and removes both from the pool), or null when the user is now
   * waiting in the pool.
   */
  async enqueue(entry: QueueEntry): Promise<Match | null> {
    const skipped: QueueEntry[] = [];
    try {
      // Bound the search so a pathological pool can't loop forever.
      for (let i = 0; i < 50; i++) {
        const candidate = await this.pool.findCompatible(entry);
        if (!candidate) {
          await this.pool.add(entry);
          await this.storage.logActivity("join_queue", { userId: entry.userId, scope: entry.prefs.scope });
          return null;
        }
        if (
          (await this.storage.isBlocked(entry.userId, candidate.userId)) ||
          (await this.storage.isBanned(candidate.userId))
        ) {
          await this.pool.remove(candidate.userId);
          skipped.push(candidate);
          continue;
        }
        await this.pool.remove(candidate.userId);
        const match = this.build(entry, candidate);
        await this.storage.recordMatch(match);
        await this.storage.logActivity("match_start", {
          matchId: match.id,
          userA: match.userA,
          userB: match.userB,
          scope: match.scope,
        });
        return match;
      }
      await this.pool.add(entry);
      return null;
    } finally {
      for (const c of skipped) await this.pool.add(c);
    }
  }

  /** Remove a user from the waiting pool (cancel queue). */
  async leave(userId: string): Promise<boolean> {
    return this.pool.remove(userId);
  }

  async isWaiting(userId: string): Promise<boolean> {
    return this.pool.has(userId);
  }

  async waitingSince(userId: string): Promise<number | null> {
    return this.pool.waitingSince(userId);
  }

  async poolStats(): Promise<Record<string, number>> {
    return this.pool.stats();
  }

  private build(a: QueueEntry, b: QueueEntry): Match {
    return {
      id: randomUUID(),
      userA: a.userId,
      userB: b.userId,
      usernameA: a.username,
      usernameB: b.username,
      guildA: a.guildId,
      guildB: b.guildId,
      mode: a.prefs.mode === "BOTH" || b.prefs.mode === "BOTH" ? "BOTH" : a.prefs.mode,
      scope: a.prefs.scope,
      startedAt: Date.now(),
    };
  }
}
