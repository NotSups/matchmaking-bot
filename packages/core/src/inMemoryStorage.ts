import { randomUUID } from "node:crypto";
import type {
  Confession,
  CoreProfile,
  CoreUser,
  MatchRecord,
  PlatformStats,
  Storage,
} from "./storage.js";

/** Zero-dependency storage for local dev / demos. Not for production. */
export class InMemoryStorage implements Storage {
  private users = new Map<string, CoreUser>();
  private profiles = new Map<string, CoreProfile>();
  private blocks = new Set<string>(); // "a:b"
  private bans = new Map<string, { scope: "GLOBAL" | "LOCAL"; guildId?: string }>();
  private matches = new Map<string, MatchRecord & { endedAt?: number; durationSeconds?: number }>();
  private reports = new Set<string>();
  private activity: { type: string; at: number; payload?: Record<string, unknown> }[] = [];
  private confessions = new Map<string, Confession[]>();

  async upsertUser(user: CoreUser): Promise<void> {
    this.users.set(user.id, user);
  }

  async getProfile(userId: string): Promise<CoreProfile | null> {
    return this.profiles.get(userId) ?? null;
  }

  async upsertProfile(profile: CoreProfile): Promise<void> {
    this.profiles.set(profile.userId, profile);
  }

  async getAllProfiles(): Promise<CoreProfile[]> {
    return [...this.profiles.values()];
  }

  async isBlocked(a: string, b: string): Promise<boolean> {
    return this.blocks.has(`${a}:${b}`) || this.blocks.has(`${b}:${a}`);
  }

  async addBlock(a: string, b: string): Promise<void> {
    this.blocks.add(`${a}:${b}`);
  }

  async isBanned(userId: string, guildId?: string): Promise<boolean> {
    for (const [id, b] of this.bans) {
      if (id !== userId) continue;
      if (b.scope === "GLOBAL") return true;
      if (b.scope === "LOCAL" && b.guildId === guildId) return true;
    }
    return false;
  }

  async addBan(userId: string, scope: "GLOBAL" | "LOCAL", guildId?: string): Promise<void> {
    this.bans.set(userId, { scope, guildId });
  }

  async recordMatch(m: MatchRecord): Promise<string> {
    const id = m.id || randomUUID();
    this.matches.set(id, { ...m, id });
    return id;
  }

  async endMatch(id: string, data: { endedAt: number; durationSeconds?: number }): Promise<void> {
    const m = this.matches.get(id);
    if (m) Object.assign(m, data);
  }

  async addReport(): Promise<void> {
    this.reports.add(randomUUID());
  }

  async logActivity(type: string, payload?: Record<string, unknown>): Promise<void> {
    this.activity.push({ type, at: Date.now(), payload });
  }

  async getStats(): Promise<PlatformStats> {
    const startOfDay = new Date().setHours(0, 0, 0, 0);
    let matchesToday = 0;
    let activeMatches = 0;
    for (const m of this.matches.values()) {
      if (m.startedAt >= startOfDay) matchesToday++;
      if (!m.endedAt) activeMatches++;
    }
    return {
      matchesToday,
      waiting: 0,
      activeMatches,
      onlineUsers: this.users.size,
    };
  }

  async addConfession(c: Confession): Promise<void> {
    const list = this.confessions.get(c.channelId) ?? [];
    list.push(c);
    this.confessions.set(c.channelId, list);
  }

  async getConfessions(channelId: string, limit = 10): Promise<Confession[]> {
    return (this.confessions.get(channelId) ?? []).slice(-limit);
  }
}
