import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type ChatInputCommandInteraction,
  type APIApplicationCommand,
} from "discord.js";
import type { BotContext } from "./ctx.js";
import type { Match, MatchPreferences, QueueEntry } from "@matchmaking/core";

export interface Command {
  data: APIApplicationCommand;
  execute: (ctx: BotContext, interaction: ChatInputCommandInteraction) => Promise<void>;
}

const splitList = (s?: string): string[] =>
  s ? s.split(",").map((x) => x.trim()).filter(Boolean) : [];

export function entryFrom(
  _ctx: BotContext,
  interaction: ChatInputCommandInteraction,
  prefs: MatchPreferences,
): QueueEntry {
  return {
    userId: interaction.user.id,
    username: interaction.user.username,
    guildId: interaction.guildId ?? "dm",
    prefs,
    enqueuedAt: Date.now(),
    priority: 0,
  };
}

const EMOJI = { next: "⏭️", leave: "🚪", block: "🚫", report: "⚠️" };

export function matchButtons(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("match:next").setLabel("Suivant").setStyle(ButtonStyle.Primary).setEmoji(EMOJI.next),
    new ButtonBuilder().setCustomId("match:leave").setLabel("Quitter").setStyle(ButtonStyle.Danger).setEmoji(EMOJI.leave),
    new ButtonBuilder().setCustomId("match:block").setLabel("Bloquer").setStyle(ButtonStyle.Secondary).setEmoji(EMOJI.block),
    new ButtonBuilder().setCustomId("match:report").setLabel("Signaler").setStyle(ButtonStyle.Secondary).setEmoji(EMOJI.report),
  );
}

const ICE_BREAKERS = [
  "🎲 Aléatoire : Si tu pouvais voyager n'importe où demain, tu irais où ?",
  "🎲 Aléatoire : C'est quoi ton plat préféré ?",
  "🎲 Aléatoire : Tu préférerais avoir le pouvoir d'invisibilité ou de voler ?",
  "🎲 Aléatoire : Dernier film/série que tu as regardé ?",
  "🎲 Aléatoire : Tu es plutôt matin ou soir ?",
  "🎲 Aléatoire : C'est quoi ton rêve le plus fou ?",
  "🎲 Aléatoire : Si tu pouvais rencontrer une célébrité, qui ?",
  "🎲 Aléatoire : Tu préférerais un superpower ou un million d'euros ?",
  "🎲 Aléatoire : C'est quoi la chose la plus random que tu aimes ?",
  "🎲 Aléatoire : Tu joues à quoi en ce moment ?",
  "🎲 Aléatoire : C'est quoi ton saison préférée et pourquoi ?",
  "🎲 Aléatoire : Tu préférerais vivre à la montagne ou à la plage ?",
  "🎲 Aléatoire : C'est quoi ton animal préféré ?",
  "🎲 Aléatoire : Si tu étais un musical, ce serait lequel ?",
  "🎲 Aléatoire : Quel est ton talent caché ?",
];

function pickIceBreakers(count = 2): string {
  const shuffled = [...ICE_BREAKERS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).join("\n");
}

function xpForLevel(level: number): number {
  return level * 100;
}

function levelFromXp(xp: number): { level: number; currentXp: number; needed: number } {
  let level = 1;
  let remaining = xp;
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level++;
  }
  return { level, currentXp: remaining, needed: xpForLevel(level) };
}

function bar(pct: number, len = 10): string {
  const f = Math.max(0, Math.min(len, Math.round((pct / 100) * len)));
  return "█".repeat(f) + "░".repeat(len - f);
}

function stars(n: number): string {
  const s = Math.max(0, Math.min(5, Math.round(n)));
  return "★".repeat(s) + "☆".repeat(5 - s);
}

async function ensureProfile(ctx: BotContext, interaction: ChatInputCommandInteraction): Promise<void> {
  const existing = await ctx.storage.getProfile(interaction.user.id);
  if (!existing) {
    await ctx.storage.upsertUser({
      id: interaction.user.id,
      username: interaction.user.username,
      globalName: interaction.user.globalName ?? null,
      avatar: interaction.user.avatarURL() ?? null,
    });
    await ctx.storage.upsertProfile({
      userId: interaction.user.id,
      languages: [],
      interests: [],
      isPremium: false,
      reputation: 100,
      level: 1,
      xp: 0,
      badges: [],
      streak: 0,
      bestStreak: 0,
      totalMatches: 0,
      likesReceived: 0,
    });
  }
}

export async function announceMatch(ctx: BotContext, match: Match): Promise<void> {
  const embed = new EmbedBuilder()
    .setTitle("🌟 Match trouvé !")
    .setDescription(
      `Tu es en conversation avec **ton partenaire**. ` +
        `Sois respectueux·se — les salons sont modérés.\n\n` +
        `💡 **Ice Breaker :**\n${pickIceBreakers(2)}`,
    )
    .addFields(
      { name: "Mode", value: match.mode, inline: true },
      { name: "Portée", value: match.scope, inline: true },
      { name: "Commandes", value: "`/next` suivant · `/leave` quitter", inline: false },
    )
    .setColor(0x5865f2)
    .setFooter({ text: "Matchmaking Platform • Tu peux utiliser /next pour trouver un autre partenaire" })
    .setTimestamp();

  const post = async (channelId: string | undefined, userId: string) => {
    if (!channelId) return;
    const ch = ctx.client.channels.cache.get(channelId);
    if (!ch || !("send" in ch)) return;
    await ch.send({ content: `<@${userId}>`, embeds: [embed], components: [matchButtons()] });
  };

  await post(ctx.sessions.session(match.id)?.channelA, match.userA);
  await post(ctx.sessions.session(match.id)?.channelB, match.userB);
}

// ─── /profile ─────────────────────────────────────────────────────────────────

const profileCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("Crée ou met à jour ton profil de matchmaking.")
    .addStringOption((o) => o.setName("bio").setDescription("Ta bio").setMaxLength(500))
    .addIntegerOption((o) => o.setName("age").setDescription("Ton âge (optionnel)").setMinValue(13).setMaxValue(120))
    .addStringOption((o) => o.setName("pronouns").setDescription("Ex: il/lui"))
    .addStringOption((o) => o.setName("languages").setDescription("Langues, séparées par des virgules"))
    .addStringOption((o) => o.setName("interests").setDescription("Centres d'intérêt, séparés par des virgules"))
    .addStringOption((o) => o.setName("country").setDescription("Pays (ISO, ex: FR)"))
    .addStringOption((o) => o.setName("timezone").setDescription("Fuseau, ex: Europe/Paris"))
    .addStringOption((o) => o.setName("looking-for").setDescription("Ce que tu recherche (amitié, romance, etc.)"))
    .addStringOption((o) => o.setName("color").setDescription("Couleur hex de ton profil, ex: #FF5733"))
    .toJSON() as APIApplicationCommand,
  execute: async (ctx, interaction) => {
    const userId = interaction.user.id;
    await ensureProfile(ctx, interaction);
    await ctx.storage.upsertUser({
      id: userId,
      username: interaction.user.username,
      globalName: interaction.user.globalName ?? null,
      avatar: interaction.user.avatarURL() ?? null,
    });
    const current = (await ctx.storage.getProfile(userId)) ?? {
      userId,
      languages: [],
      interests: [],
      isPremium: false,
      reputation: 100,
      level: 1,
    };
    const profile = {
      ...current,
      bio: interaction.options.getString("bio") ?? current.bio ?? null,
      age: interaction.options.getInteger("age") ?? current.age ?? null,
      pronouns: interaction.options.getString("pronouns") ?? current.pronouns ?? null,
      languages: splitList(interaction.options.getString("languages")) || current.languages,
      interests: splitList(interaction.options.getString("interests")) || current.interests,
      country: interaction.options.getString("country") ?? current.country ?? null,
      timezone: interaction.options.getString("timezone") ?? current.timezone ?? null,
      lookingFor: interaction.options.getString("looking-for") ?? current.lookingFor ?? null,
      customColor: interaction.options.getString("color") ?? current.customColor ?? null,
    };
    await ctx.storage.upsertProfile(profile);

    const embed = new EmbedBuilder()
      .setTitle("✅ Profil enregistré !")
      .setDescription("Ton profil a été mis à jour avec succès.")
      .setColor(0x2ecc71)
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields(
        { name: "👤 Bio", value: profile.bio || "_Aucune bio_", inline: false },
        { name: "🌍 Langues", value: (profile.languages || []).join(", ") || "_—_", inline: true },
        { name: "🎯 Intérêts", value: (profile.interests || []).join(", ") || "_—_", inline: true },
      )
      .setFooter({ text: "Utilise /profile view pour voir ton profil complet" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

// ─── /profile view ────────────────────────────────────────────────────────────

const profileViewCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("profile-view")
    .setDescription("Affiche ton profil complet.")
    .addUserOption((o) => o.setName("user").setDescription("Voir le profil d'un autre membre"))
    .toJSON() as APIApplicationCommand,
  execute: async (ctx, interaction) => {
    const target = interaction.options.getUser("user") || interaction.user;
    await ensureProfile(ctx, interaction as ChatInputCommandInteraction);
    const profile = await ctx.storage.getProfile(target.id);
    if (!profile) {
      await interaction.reply({ content: "❌ Profil introuvable.", ephemeral: true });
      return;
    }

    const color = profile.customColor ? parseInt(profile.customColor.replace("#", ""), 16) : 0xffffff;
    const xpInfo = levelFromXp(profile.xp ?? 0);
    const pct = Math.round((xpInfo.currentXp / xpInfo.needed) * 100);
    const badges = (profile.badges ?? []).length
      ? profile.badges!.map((b) => `🏅 ${b}`).join("  ")
      : "_Aucun pour l'instant_";

    const embed = new EmbedBuilder()
      .setTitle(`👤  ${target.username}`)
      .setColor(color)
      .setDescription(profile.bio || "_Aucune bio renseignée._")
      .setThumbnail(target.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: "🌍 Langues", value: (profile.languages || []).join(", ") || "_—_", inline: true },
        { name: "🎯 Intérêts", value: (profile.interests || []).join(", ") || "_—_", inline: true },
        { name: "🏳️ Pays", value: profile.country || "_—_", inline: true },
        { name: "🚻 Pronoms", value: profile.pronouns || "_—_", inline: true },
        { name: "🎂 Âge", value: profile.age ? String(profile.age) : "_—_", inline: true },
        { name: "🕒 Fuseau", value: profile.timezone || "_—_", inline: true },
        { name: "💭 Je recherche", value: profile.lookingFor || "_—_", inline: false },
        { name: "⭐ Réputation", value: `${stars((profile.reputation ?? 100) / 20)}  (${profile.reputation ?? 100})`, inline: true },
        { name: "🤝 Matchs", value: String(profile.totalMatches ?? 0), inline: true },
        { name: "🔥 Streak", value: `Actuel: ${profile.streak ?? 0} | Record: ${profile.bestStreak ?? 0}`, inline: true },
        { name: "📈 Niveau", value: `Niveau ${xpInfo.level} — XP ${xpInfo.currentXp}/${xpInfo.needed}\n\`${bar(pct)}\` ${pct}%`, inline: false },
        { name: "🏅 Badges", value: badges, inline: false },
      )
      .setFooter({ text: `ID: ${target.id}` })
      .setTimestamp();

    if (profile.isPremium) {
      embed.setAuthor({ name: "⭐ Membre Premium" });
    }

    await interaction.reply({ embeds: [embed] });
  },
};

// ─── /match ───────────────────────────────────────────────────────────────────

const matchCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("match")
    .setDescription("Rejoins la file d'attente de matchmaking.")
    .addStringOption((o) =>
      o.setName("mode").setDescription("Type de match").setRequired(true).addChoices(
        { name: "📝 Texte", value: "TEXT" },
        { name: "🎤 Vocal", value: "VOICE" },
        { name: "📝🎤 Texte + Vocal", value: "BOTH" },
      ),
    )
    .addStringOption((o) =>
      o.setName("scope").setDescription("Portée").setRequired(true).addChoices(
        { name: "🌍 Mondial", value: "GLOBAL" },
        { name: "🏠 Serveur", value: "GUILD" },
        { name: "🤝 Partenaires", value: "PARTNER" },
      ),
    )
    .addStringOption((o) => o.setName("languages").setDescription("Langues (virgules)"))
    .addStringOption((o) => o.setName("interests").setDescription("Intérêts (virgules)"))
    .toJSON() as APIApplicationCommand,
  execute: async (ctx, interaction) => {
    if (!interaction.guildId) {
      await interaction.reply({ content: "❌ Utilise cette commande dans un serveur.", ephemeral: true });
      return;
    }
    await ensureProfile(ctx, interaction);
    const prefs: MatchPreferences = {
      mode: (interaction.options.getString("mode", true) as MatchPreferences["mode"]),
      scope: (interaction.options.getString("scope", true) as MatchPreferences["scope"]),
      languages: splitList(interaction.options.getString("languages")),
      interests: splitList(interaction.options.getString("interests")),
    };
    ctx.lastPrefs.set(interaction.user.id, prefs);
    const match = await ctx.matchmaker.enqueue(entryFrom(ctx, interaction, prefs));
    if (match) {
      await ctx.sessions.createForMatch(match);

      // Update stats
      const profile = await ctx.storage.getProfile(interaction.user.id);
      if (profile) {
        await ctx.storage.upsertProfile({
          ...profile,
          totalMatches: (profile.totalMatches ?? 0) + 1,
          streak: (profile.streak ?? 0) + 1,
          bestStreak: Math.max(profile.bestStreak ?? 0, (profile.streak ?? 0) + 1),
          lastMatchAt: Date.now(),
          xp: (profile.xp ?? 0) + 25,
        });
      }

      await announceMatch(ctx, match);
      await interaction.reply({ content: "🔗 Match trouvé, salon privé créé ! +25 XP", ephemeral: true });
    } else {
      await interaction.reply({
        content: "🔍 **Recherche en cours…**\nTu seras notifié·e dès qu'un partenaire est trouvé.",
        ephemeral: true,
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId("queue:leave").setLabel("❌ Annuler la recherche").setStyle(ButtonStyle.Danger),
          ),
        ],
      });
    }
  },
};

// ─── /queue ───────────────────────────────────────────────────────────────────

const queueCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("queue")
    .setDescription("Affiche ton statut dans la file d'attente.")
    .toJSON() as APIApplicationCommand,
  execute: async (ctx, interaction) => {
    const since = await ctx.matchmaker.waitingSince(interaction.user.id);
    const stats = await ctx.matchmaker.poolStats();
    if (since == null) {
      await interaction.reply({ content: "ℹ️ Tu n'es pas dans la file d'attente.", ephemeral: true });
      return;
    }
    const waited = Math.round((Date.now() - since) / 1000);
    const total = Object.values(stats).reduce((a, b) => a + b, 0);
    const mins = Math.floor(waited / 60);
    const secs = waited % 60;

    const embed = new EmbedBuilder()
      .setTitle("⏳ En attente...")
      .setDescription(`Tu es dans la file d'attente depuis **${mins}m ${secs}s**`)
      .addFields(
        { name: "👥 Personnes en file", value: String(total), inline: true },
        { name: "📊 Répartition", value: Object.entries(stats).map(([k, v]) => `${k}: ${v}`).join(", ") || "Aucune", inline: true },
      )
      .setColor(0xf39c12)
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      ephemeral: true,
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId("queue:leave").setLabel("❌ Quitter la file").setStyle(ButtonStyle.Danger),
        ),
      ],
    });
  },
};

// ─── /next ────────────────────────────────────────────────────────────────────

const nextCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("next")
    .setDescription("Trouve un nouveau partenaire (quitte le match actuel).")
    .toJSON() as APIApplicationCommand,
  execute: async (ctx, interaction) => {
    const matchId = ctx.sessions.getUserMatch(interaction.user.id);
    if (matchId) await ctx.sessions.end(matchId);
    const prefs = ctx.lastPrefs.get(interaction.user.id);
    if (!prefs || !interaction.guildId) {
      await interaction.reply({ content: "❌ Aucune recherche en cours. Utilise `/match`.", ephemeral: true });
      return;
    }
    const match = await ctx.matchmaker.enqueue(entryFrom(ctx, interaction, prefs));
    if (match) {
      await ctx.sessions.createForMatch(match);

      const profile = await ctx.storage.getProfile(interaction.user.id);
      if (profile) {
        await ctx.storage.upsertProfile({
          ...profile,
          totalMatches: (profile.totalMatches ?? 0) + 1,
          streak: (profile.streak ?? 0) + 1,
          bestStreak: Math.max(profile.bestStreak ?? 0, (profile.streak ?? 0) + 1),
          lastMatchAt: Date.now(),
          xp: (profile.xp ?? 0) + 15,
        });
      }

      await announceMatch(ctx, match);
      await interaction.reply({ content: "🔗 Nouveau match trouvé ! +15 XP", ephemeral: true });
    } else {
      await interaction.reply({ content: "🔍 Recherche d'un nouveau partenaire…", ephemeral: true });
    }
  },
};

// ─── /leave ───────────────────────────────────────────────────────────────────

const leaveCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("leave")
    .setDescription("Quitte ton match ou la file d'attente.")
    .toJSON() as APIApplicationCommand,
  execute: async (ctx, interaction) => {
    const matchId = ctx.sessions.getUserMatch(interaction.user.id);
    if (matchId) {
      await ctx.sessions.end(matchId);
      await interaction.reply({ content: "🚪 Match terminé. À bientôt !", ephemeral: true });
      return;
    }
    const removed = await ctx.matchmaker.leave(interaction.user.id);
    await interaction.reply({
      content: removed ? "🚪 Tu as quitté la file d'attente." : "ℹ️ Tu n'étais pas en file.",
      ephemeral: true,
    });
  },
};

// ─── /report ──────────────────────────────────────────────────────────────────

const reportCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("report")
    .setDescription("Signale ton partenaire actuel.")
    .addStringOption((o) =>
      o.setName("reason").setDescription("Raison").setRequired(true).addChoices(
        { name: "🚫 Spam", value: "SPAM" },
        { name: "⛔ Harcèlement", value: "HARASSMENT" },
        { name: "🔞 Contenu inapproprié", value: "INAPPROPRIATE" },
        { name: "🤖 Bot / faux compte", value: "BOT" },
        { name: "📝 Autre", value: "OTHER" },
      ),
    )
    .addStringOption((o) => o.setName("comment").setDescription("Détails (optionnel)").setMaxLength(1000))
    .toJSON() as APIApplicationCommand,
  execute: async (ctx, interaction) => {
    const matchId = ctx.sessions.getUserMatch(interaction.user.id);
    if (!matchId) {
      await interaction.reply({ content: "❌ Tu n'es dans aucun match.", ephemeral: true });
      return;
    }
    const sess = ctx.sessions.session(matchId)!;
    const target = sess.match.userA === interaction.user.id ? sess.match.userB : sess.match.userA;
    await ctx.storage.addReport({
      reporterId: interaction.user.id,
      targetId: target,
      matchId,
      reason: interaction.options.getString("reason", true),
      comment: interaction.options.getString("comment") ?? undefined,
    });
    await ctx.storage.logActivity("report", { matchId, target, reporter: interaction.user.id });

    const embed = new EmbedBuilder()
      .setTitle("✅ Signalement envoyé")
      .setDescription("Merci de nous aider à garder la communauté sûre.")
      .setColor(0x2ecc71)
      .setTimestamp();
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

// ─── /block ───────────────────────────────────────────────────────────────────

const blockCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("block")
    .setDescription("Bloque ton partenaire actuel et quitte le match.")
    .toJSON() as APIApplicationCommand,
  execute: async (ctx, interaction) => {
    const matchId = ctx.sessions.getUserMatch(interaction.user.id);
    if (!matchId) {
      await interaction.reply({ content: "❌ Tu n'es dans aucun match.", ephemeral: true });
      return;
    }
    const sess = ctx.sessions.session(matchId)!;
    const target = sess.match.userA === interaction.user.id ? sess.match.userB : sess.match.userA;
    await ctx.storage.addBlock(interaction.user.id, target);
    await ctx.sessions.end(matchId);

    const embed = new EmbedBuilder()
      .setTitle("🚫 Membre bloqué")
      .setDescription("Ce membre a été bloqué. Tu ne seras plus mis en match avec lui.")
      .setColor(0xe74c3c)
      .setTimestamp();
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

// ─── /stats ───────────────────────────────────────────────────────────────────

const statsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Affiche tes statistiques personnelles.")
    .toJSON() as APIApplicationCommand,
  execute: async (ctx, interaction) => {
    await ensureProfile(ctx, interaction);
    const profile = await ctx.storage.getProfile(interaction.user.id);
    const platformStats = await ctx.storage.getStats();

    const xpInfo = levelFromXp(profile?.xp ?? 0);
    const pct = Math.round((xpInfo.currentXp / xpInfo.needed) * 100);

    const embed = new EmbedBuilder()
      .setTitle(`📊 Statistiques de ${interaction.user.username}`)
      .setThumbnail(interaction.user.displayAvatarURL({ size: 256 }))
      .setColor(0x3498db)
      .addFields(
        {
          name: "🎮 Tes Stats",
          value: [
            `🤝 Matchs total: **${profile?.totalMatches ?? 0}**`,
            `🔥 Streak actuel: **${profile?.streak ?? 0}**`,
            `🏆 Meilleur streak: **${profile?.bestStreak ?? 0}**`,
            `📈 Niveau: **${xpInfo.level}** (${xpInfo.currentXp}/${xpInfo.needed} XP)`,
            `\`${bar(pct)}\` ${pct}%`,
            `⭐ Réputation: **${profile?.reputation ?? 100}**`,
            `🏅 Badges: **${(profile?.badges ?? []).length}**`,
          ].join("\n"),
          inline: false,
        },
        {
          name: "🌐 Plateforme",
          value: [
            `📈 Matches aujourd'hui: **${platformStats.matchesToday}**`,
            `🔄 Matches actifs: **${platformStats.activeMatches}**`,
            `👥 En file: **${platformStats.waiting}**`,
            `🟢 Utilisateurs: **${platformStats.onlineUsers}**`,
          ].join("\n"),
          inline: false,
        },
      )
      .setFooter({ text: "Matchmaking Platform" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};

// ─── /leaderboard ─────────────────────────────────────────────────────────────

const leaderboardCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Affiche le classement des meilleurs membres.")
    .addStringOption((o) =>
      o.setName("sort").setDescription("Trier par").addChoices(
        { name: "📈 Niveau", value: "level" },
        { name: "🤝 Matchs", value: "matches" },
        { name: "🔥 Streak", value: "streak" },
        { name: "⭐ Réputation", value: "reputation" },
      ),
    )
    .toJSON() as APIApplicationCommand,
  execute: async (ctx, interaction) => {
    const sortBy = interaction.options.getString("sort") ?? "level";

    let profiles = await (ctx.storage.getAllProfiles?.() ?? Promise.resolve([]));
    if (!profiles.length) {
      await interaction.reply({ content: "ℹ️ Aucun profil enregistré pour le moment.", ephemeral: true });
      return;
    }

    switch (sortBy) {
      case "level":
        profiles.sort((a, b) => (b.xp ?? 0) - (a.xp ?? 0));
        break;
      case "matches":
        profiles.sort((a, b) => (b.totalMatches ?? 0) - (a.totalMatches ?? 0));
        break;
      case "streak":
        profiles.sort((a, b) => (b.bestStreak ?? 0) - (a.bestStreak ?? 0));
        break;
      case "reputation":
        profiles.sort((a, b) => (b.reputation ?? 0) - (a.reputation ?? 0));
        break;
    }

    const top10 = profiles.slice(0, 10);
    const medals = ["🥇", "🥈", "🥉"];
    const lines = top10.map((p, i) => {
      const medal = medals[i] ?? `**${i + 1}.**`;
      let value = "";
      switch (sortBy) {
        case "level": value = `Nv. ${levelFromXp(p.xp ?? 0).level}`; break;
        case "matches": value = `${p.totalMatches ?? 0} matchs`; break;
        case "streak": value = `${p.bestStreak ?? 0} streak`; break;
        case "reputation": value = `${p.reputation ?? 100} ⭐`; break;
      }
      return `${medal} <@${p.userId}> — ${value}`;
    });

    const embed = new EmbedBuilder()
      .setTitle(`🏆 Classement — ${sortBy === "level" ? "Niveau" : sortBy === "matches" ? "Matchs" : sortBy === "streak" ? "Streak" : "Réputation"}`)
      .setDescription(lines.join("\n") || "_Aucun classement pour le moment._")
      .setColor(0xf1c40f)
      .setFooter({ text: "Matchmaking Platform" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};

// ─── /daily ───────────────────────────────────────────────────────────────────

const DAILY_CHALLENGES = [
  "💬 Fais 3 matches aujourd'hui",
  "🌍 Fais un match mondial",
  "🎤 Fais un match vocal",
  "⏱️ Reste en conversation plus de 5 minutes",
  "🤝 Fais un match avec quelqu'un d'un autre pays",
  "📝 Modifie ton profil avec une nouvelle bio",
  "⭐ Envoie un like à ton partenaire",
  "🎮 Utilise /next 2 fois",
  "💬 Pose 3 questions à ton partenaire",
  "🌟 Complète un quiz de compatibilité",
];

const dailyCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Affiche le défi du jour et tes récompenses.")
    .toJSON() as APIApplicationCommand,
  execute: async (ctx, interaction) => {
    const today = new Date().toDateString();
    const seed = today.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const challenge = DAILY_CHALLENGES[seed % DAILY_CHALLENGES.length];

    const profile = await ctx.storage.getProfile(interaction.user.id);
    const xpInfo = levelFromXp(profile?.xp ?? 0);

    const embed = new EmbedBuilder()
      .setTitle("🎲 Défi du Jour")
      .setDescription(`**${challenge}**\n\nComplète ce défi pour gagner **+50 XP** !`)
      .setColor(0xe67e22)
      .addFields(
        { name: "📈 Ton Niveau", value: `Nv. ${xpInfo.level} — XP ${xpInfo.currentXp}/${xpInfo.needed}`, inline: true },
        { name: "🔥 Ton Streak", value: `${profile?.streak ?? 0} matchs`, inline: true },
      )
      .setFooter({ text: "Nouveau défi chaque jour à minuit !" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};

// ─── /confess ─────────────────────────────────────────────────────────────────

const confessCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("confess")
    .setDescription("Envoie un message anonyme dans le salon confessions.")
    .addStringOption((o) => o.setName("message").setDescription("Ton message anonyme").setRequired(true).setMaxLength(2000))
    .toJSON() as APIApplicationCommand,
  execute: async (ctx, interaction) => {
    const message = interaction.options.getString("message", true);

    const embed = new EmbedBuilder()
      .setTitle("💌 Confession Anonyme")
      .setDescription(message)
      .setColor(0xff6b9d)
      .setFooter({ text: "Confession anonyme • Tu peux utilser /confess pour écrire" })
      .setTimestamp();

    const channel = ctx.client.channels.cache.get(interaction.channelId);
    if (channel && "send" in channel) {
      await channel.send({ embeds: [embed] });
    }

    await interaction.reply({ content: "✅ Ta confession a été envoyée anonymement !", ephemeral: true });
  },
};

// ─── /help ────────────────────────────────────────────────────────────────────

const helpCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Affiche l'aide complète du bot.")
    .toJSON() as APIApplicationCommand,
  execute: async (_ctx, interaction) => {
    const embed = new EmbedBuilder()
      .setTitle("🤝 Matchmaking Platform — Aide")
      .setDescription("Bienvenue sur le bot de matchmaking ! Voici toutes les commandes disponibles.")
      .setColor(0x5865f2)
      .setThumbnail(interaction.client.user.displayAvatarURL())
      .addFields(
        {
          name: "📝 Profil",
          value: [
            "`/profile` — Crée ou modifie ton profil",
            "`/profile-view` — Voir un profil complet",
          ].join("\n"),
          inline: false,
        },
        {
          name: "🔍 Matchmaking",
          value: [
            "`/match` — Rejoins la file d'attente",
            "`/next` — Trouve un nouveau partenaire",
            "`/leave` — Quitte le match ou la file",
            "`/queue` — Voir ton statut en file",
          ].join("\n"),
          inline: false,
        },
        {
          name: "🛡️ Sécurité",
          value: [
            "`/report` — Signaler un partenaire",
            "`/block` — Bloquer un partenaire",
          ].join("\n"),
          inline: false,
        },
        {
          name: "📊 Stats & Classement",
          value: [
            "`/stats` — Tes statistiques personnelles",
            "`/leaderboard` — Classement des meilleurs",
            "`/daily` — Défi du jour",
          ].join("\n"),
          inline: false,
        },
        {
          name: "💬 Social",
          value: [
            "`/confess` — Message anonyme",
            "`/help` — Cette aide",
          ].join("\n"),
          inline: false,
        },
      )
      .setFooter({ text: "Matchmaking Platform • Fait avec ❤️" })
      .setTimestamp();

    const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("help:select")
        .setPlaceholder("📋 Navigation rapide...")
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel("📝 Profil").setValue("profile").setDescription("Commandes de profil"),
          new StringSelectMenuOptionBuilder().setLabel("🔍 Matchmaking").setValue("match").setDescription("Commandes de match"),
          new StringSelectMenuOptionBuilder().setLabel("🛡️ Sécurité").setValue("safety").setDescription("Report & Block"),
          new StringSelectMenuOptionBuilder().setLabel("📊 Stats").setValue("stats").setDescription("Statistiques & classement"),
          new StringSelectMenuOptionBuilder().setLabel("💬 Social").setValue("social").setDescription("Confessions & aide"),
        ),
    );

    await interaction.reply({ embeds: [embed], components: [selectRow], ephemeral: true });
  },
};

export const commands: Command[] = [
  profileCommand,
  profileViewCommand,
  matchCommand,
  queueCommand,
  nextCommand,
  leaveCommand,
  reportCommand,
  blockCommand,
  statsCommand,
  leaderboardCommand,
  dailyCommand,
  confessCommand,
  helpCommand,
];

export function commandData(): APIApplicationCommand[] {
  return commands.map((c) => c.data);
}
