import { EmbedBuilder } from "discord.js";
import type { CoreProfile } from "@matchmaking/core";

const WHITE = 0xffffff;

function bar(pct: number, len = 10): string {
  const f = Math.max(0, Math.min(len, Math.round((pct / 100) * len)));
  return "█".repeat(f) + "░".repeat(len - f);
}

function stars(n: number): string {
  const s = Math.max(0, Math.min(5, Math.round(n)));
  return "★".repeat(s) + "☆".repeat(5 - s);
}

/** Validates and normalizes a hex color (#RRGGBB). Returns null if invalid. */
export function parseColor(input?: string | null): number | null {
  if (!input) return null;
  const hex = input.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  return parseInt(hex.slice(1), 16);
}

/** Renders a premium-style profile card embed. */
export function renderProfileCard(profile: CoreProfile, name?: string): EmbedBuilder {
  const color = parseColor(profile.customColor) ?? WHITE;
  const need = profile.level * 100;
  const pct = need > 0 ? Math.min(100, Math.round(((profile.xp ?? 0) % need / need) * 100)) : 0;
  const badges = (profile.badges ?? []).length
    ? profile.badges!.map((b) => `🏅 ${b}`).join("  ")
    : "_Aucun pour l'instant_";

  const embed = new EmbedBuilder()
    .setTitle(`👤  ${name ?? "Profil"}`)
    .setColor(color)
    .setDescription(profile.bio || "_Aucune bio renseignée._")
    .addFields(
      { name: "🌍 Langues", value: (profile.languages || []).join(", ") || "_—_", inline: true },
      { name: "🎯 Intérêts", value: (profile.interests || []).join(", ") || "_—_", inline: true },
      { name: "🏳️ Pays", value: profile.country || "_—_", inline: true },
      { name: "🚻 Pronoms", value: profile.pronouns || "_—_", inline: true },
      { name: "🎂 Âge", value: profile.age ? String(profile.age) : "_—_", inline: true },
      { name: "🕒 Fuseau", value: profile.timezone || "_—_", inline: true },
      { name: "💭 Je recherche", value: profile.lookingFor || "_—_", inline: false },
      { name: "🔗 Réseaux", value: (profile.socials || []).join("  ") || "_—_", inline: false },
      { name: "⭐ Réputation", value: `${stars((profile.reputation ?? 100) / 20)}  (${profile.reputation ?? 100})`, inline: true },
      { name: "💚 Likes reçus", value: String(profile.likesReceived ?? 0), inline: true },
      { name: "🤝 Matchs", value: String(profile.totalMatches ?? 0), inline: true },
      { name: "📈 Niveau", value: `Niveau ${profile.level} — XP ${profile.xp ?? 0}\n\`${bar(pct)}\` ${pct}%`, inline: false },
      { name: "🏅 Badges", value: badges, inline: false },
    );

  if (profile.isPremium) {
    embed.setAuthor({ name: "⭐ Membre Premium" });
  }
  return embed;
}
