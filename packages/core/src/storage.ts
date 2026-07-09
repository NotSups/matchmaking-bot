import type { Match, MatchMode, MatchScope } from "./types.js";

export interface CoreUser {
  id: string;
  username: string;
  globalName?: string | null;
  avatar?: string | null;
}

export interface CoreProfile {
  userId: string;
  bio?: string | null;
  age?: number | null;
  gender?: string | null;
  pronouns?: string | null;
  languages: string[];
  interests: string[];
  country?: string | null;
  timezone?: string | null;
  isPremium: boolean;
  reputation: number;
  level: number;
}

export interface MatchRecord {
  id: string;
  userA: string;
  userB: string;
  mode: MatchMode;
  scope: MatchScope;
  guildA?: string | null;
  guildB?: string | null;
  startedAt: number;
}

export interface PlatformStats {
  matchesToday: number;
  waiting: number;
  activeMatches: number;
  onlineUsers: number;
}

/**
 * Persistence boundary. `InMemoryStorage` ships for zero-config dev; a
 * `PrismaStorage` (in packages/db) is the production implementation and is
 * selected automatically when STORAGE_BACKEND=postgres.
 */
export interface Storage {
  upsertUser(user: CoreUser): Promise<void>;
  getProfile(userId: string): Promise<CoreProfile | null>;
  upsertProfile(profile: CoreProfile): Promise<void>;

  isBlocked(a: string, b: string): Promise<boolean>;
  addBlock(a: string, b: string): Promise<void>;

  isBanned(userId: string, guildId?: string): Promise<boolean>;
  addBan(userId: string, scope: "GLOBAL" | "LOCAL", guildId?: string, reason?: string): Promise<void>;

  recordMatch(m: MatchRecord): Promise<string>;
  endMatch(id: string, data: { endedAt: number; durationSeconds?: number; rating?: number; liked?: boolean }): Promise<void>;

  addReport(r: { reporterId: string; targetId: string; matchId?: string; reason: string; comment?: string }): Promise<void>;

  logActivity(type: string, payload?: Record<string, unknown>): Promise<void>;

  getStats(): Promise<PlatformStats>;
}
