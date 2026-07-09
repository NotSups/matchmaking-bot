export type MatchMode = "TEXT" | "VOICE" | "BOTH";
export type MatchScope = "GLOBAL" | "GUILD" | "PARTNER";

export interface MatchPreferences {
  mode: MatchMode;
  scope: MatchScope;
  languages?: string[];
  country?: string;
  timezone?: string;
  interests?: string[];
}

export interface QueueEntry {
  userId: string;
  username: string;
  /** Guild where the user issued the command (channel creation happens here). */
  guildId: string;
  prefs: MatchPreferences;
  /** Epoch ms. */
  enqueuedAt: number;
  /** Higher = matched first (premium, reputation, ...). */
  priority: number;
}

export interface Match {
  id: string;
  userA: string;
  userB: string;
  usernameA: string;
  usernameB: string;
  guildA: string;
  guildB: string;
  mode: MatchMode;
  scope: MatchScope;
  startedAt: number;
}

export const SCOPE_KEYS: Record<MatchScope, string> = {
  GLOBAL: "global",
  GUILD: "guild",
  PARTNER: "partner",
};
