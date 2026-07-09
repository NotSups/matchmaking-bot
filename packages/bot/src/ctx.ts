import type { Client } from "discord.js";
import type { Matchmaker, Storage, MatchPreferences } from "@matchmaking/core";
import { SessionManager } from "./session.js";

export interface BotContext {
  client: Client;
  matchmaker: Matchmaker;
  storage: Storage;
  sessions: SessionManager;
  /** Remembers each user's last match preferences so /next can re-queue. */
  lastPrefs: Map<string, MatchPreferences>;
  /** Guards against one user being in two matches at once. */
  lastMatch: Map<string, string>; // userId -> matchId
}

export function createContext(client: Client, matchmaker: Matchmaker, storage: Storage): BotContext {
  return {
    client,
    matchmaker,
    storage,
    sessions: new SessionManager(client, storage),
    lastPrefs: new Map(),
    lastMatch: new Map(),
  };
}
