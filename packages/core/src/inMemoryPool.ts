import { randomUUID } from "node:crypto";
import type { QueueEntry } from "./types.js";
import type { WaitingPool } from "./pool.js";
import { modesCompatible, scopeCompatible, score } from "./compat.js";

/** Single-process pool. Suitable for local dev and small deployments. */
export class InMemoryWaitingPool implements WaitingPool {
  private entries = new Map<string, QueueEntry>();

  async add(entry: QueueEntry): Promise<void> {
    this.entries.set(entry.userId, entry);
  }

  async remove(userId: string): Promise<boolean> {
    return this.entries.delete(userId);
  }

  async has(userId: string): Promise<boolean> {
    return this.entries.has(userId);
  }

  async findCompatible(entry: QueueEntry): Promise<QueueEntry | null> {
    let best: QueueEntry | null = null;
    let bestScore = -Infinity;
    for (const candidate of this.entries.values()) {
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
    return this.entries.size;
  }

  async waitingSince(userId: string): Promise<number | null> {
    const e = this.entries.get(userId);
    return e ? e.enqueuedAt : null;
  }

  async stats(): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const e of this.entries.values()) {
      const k = e.prefs.scope;
      out[k] = (out[k] ?? 0) + 1;
    }
    return out;
  }
}

export { randomUUID };
