import type { MatchPreferences, QueueEntry } from "./types.js";

/** True if both entries share at least one channel-capable mode. */
export function modesCompatible(a: MatchPreferences, b: MatchPreferences): boolean {
  const textA = a.mode === "TEXT" || a.mode === "BOTH";
  const textB = b.mode === "TEXT" || b.mode === "BOTH";
  const voiceA = a.mode === "VOICE" || a.mode === "BOTH";
  const voiceB = b.mode === "VOICE" || b.mode === "BOTH";
  return (textA && textB) || (voiceA && voiceB);
}

/** True if the two scopes can be matched together. */
export function scopeCompatible(a: QueueEntry, b: QueueEntry): boolean {
  if (a.prefs.scope === "GLOBAL" || b.prefs.scope === "GLOBAL") return true;
  if (a.prefs.scope === "GUILD" || b.prefs.scope === "GUILD") {
    return a.guildId === b.guildId;
  }
  // PARTNER: requires explicit partnership link (resolved by caller via partnerGuildIds).
  return false;
}

function overlap(a?: string[], b?: string[]): number {
  if (!a?.length || !b?.length) return 0;
  const set = new Set(a.map((x) => x.toLowerCase()));
  let n = 0;
  for (const x of b) if (set.has(x.toLowerCase())) n++;
  return n;
}

/**
 * Higher is better. Starts at 100 and is adjusted by soft preferences.
 * Compatibility *requirements* (mode/scope) are checked separately.
 */
export function score(entry: QueueEntry, candidate: QueueEntry): number {
  let s = 100 + candidate.priority * 5;

  const lang = overlap(entry.prefs.languages, candidate.prefs.languages);
  if (entry.prefs.languages?.length && candidate.prefs.languages?.length) {
    s += lang > 0 ? lang * 15 : -40; // hard-ish penalty if both set languages but none match
  }

  const int = overlap(entry.prefs.interests, candidate.prefs.interests);
  if (entry.prefs.interests?.length && candidate.prefs.interests?.length) {
    s += int > 0 ? int * 10 : -10;
  }

  if (entry.prefs.country && candidate.prefs.country) {
    s += entry.prefs.country === candidate.prefs.country ? 20 : -20;
  }
  if (entry.prefs.timezone && candidate.prefs.timezone) {
    s += entry.prefs.timezone === candidate.prefs.timezone ? 20 : -20;
  }

  // Prefer pairing with someone who waited longer (fairer).
  s += Math.min(30, (candidate.enqueuedAt ? Date.now() - candidate.enqueuedAt : 0) / 1000 / 30);
  return s;
}
