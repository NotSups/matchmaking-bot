import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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

function entryFrom(
  ctx: BotContext,
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

export async function announceMatch(ctx: BotContext, match: Match): Promise<void> {
  const partnerOf = (me: string) => (me === match.userA ? match.usernameB : match.usernameA);
  const embed = new EmbedBuilder()
    .setTitle("🌟 Match trouvé !")
    .setDescription(
      `Tu es en conversation avec **${match.userA === match.userA ? "ton partenaire" : ""}**. ` +
        `Sois respectueux·se — les salons sont modérés.`,
    )
    .addFields(
      { name: "Mode", value: match.mode, inline: true },
      { name: "Portée", value: match.scope, inline: true },
      { name: "Commandes", value: "`/next` suivant · `/leave` quitter", inline: false },
    )
    .setColor(0x5865f2)
    .setFooter({ text: "Matchmaking Platform" });

  const post = async (channelId: string | undefined, userId: string) => {
    if (!channelId) return;
    const ch = ctx.client.channels.cache.get(channelId);
    if (!ch || !("send" in ch)) return;
    await ch.send({ content: `<@${userId}>`, embeds: [embed], components: [matchButtons()] });
  };

  await post(match.id && ctx.sessions.session(match.id)?.channelA, match.userA);
  await post(ctx.sessions.session(match.id)?.channelB, match.userB);
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
    });
  }
}

export const commands: Command[] = [
  {
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
      .toJSON() as APIApplicationCommand,
    execute: async (ctx, interaction) => {
      const userId = interaction.user.id;
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
      };
      await ctx.storage.upsertProfile(profile);
      await interaction.reply({ content: "✅ Profil enregistré !", ephemeral: true });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("match")
      .setDescription("Rejoins la file d'attente de matchmaking.")
      .addStringOption((o) =>
        o.setName("mode").setDescription("Type de match").setRequired(true).addChoices(
          { name: "Texte", value: "TEXT" },
          { name: "Vocal", value: "VOICE" },
          { name: "Texte + Vocal", value: "BOTH" },
        ),
      )
      .addStringOption((o) =>
        o.setName("scope").setDescription("Portée").setRequired(true).addChoices(
          { name: "Mondial", value: "GLOBAL" },
          { name: "Serveur", value: "GUILD" },
          { name: "Partenaires", value: "PARTNER" },
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
        await announceMatch(ctx, match);
        await interaction.reply({ content: "🔗 Match trouvé, salon privé créé !", ephemeral: true });
      } else {
        await interaction.reply({
          content: "🔍 Recherche en cours… tu seras notifié·e dès qu'un partenaire est trouvé.",
          ephemeral: true,
          components: [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder().setCustomId("queue:leave").setLabel("Annuler").setStyle(ButtonStyle.Danger),
            ),
          ],
        });
      }
    },
  },
  {
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
      await interaction.reply({
        content: `⏳ En attente depuis ${waited}s. Personnes en file : **${total}**.`,
        ephemeral: true,
      });
    },
  },
  {
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
        await announceMatch(ctx, match);
        await interaction.reply({ content: "🔗 Nouveau match trouvé !", ephemeral: true });
      } else {
        await interaction.reply({ content: "🔍 Recherche d'un nouveau partenaire…", ephemeral: true });
      }
    },
  },
  {
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
  },
  {
    data: new SlashCommandBuilder()
      .setName("report")
      .setDescription("Signale ton partenaire actuel.")
      .addStringOption((o) =>
        o.setName("reason").setDescription("Raison").setRequired(true).addChoices(
          { name: "Spam", value: "SPAM" },
          { name: "Harcèlement", value: "HARASSMENT" },
          { name: "Contenu inapproprié", value: "INAPPROPRIATE" },
          { name: "Bot / faux compte", value: "BOT" },
          { name: "Autre", value: "OTHER" },
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
      await ctx.storage.logActivity("report", { matchId, target });
      await interaction.reply({ content: "✅ Signalement envoyé. Merci de nous aider à garder la communauté sûre.", ephemeral: true });
    },
  },
  {
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
      await interaction.reply({ content: "🚫 Partenaire bloqué et match terminé.", ephemeral: true });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("help")
      .setDescription("Affiche l'aide du bot.")
      .toJSON() as APIApplicationCommand,
    execute: async (_ctx, interaction) => {
      const embed = new EmbedBuilder()
        .setTitle("🤝 Matchmaking — Aide")
        .setDescription(
          [
            "`/profile` — crée/édite ton profil",
            "`/match` — rejoins la file (mode + portée)",
            "`/queue` — statut de la file",
            "`/next` — nouveau partenaire",
            "`/leave` — quitte match/file",
            "`/report` — signale ton partenaire",
            "`/block` — bloque ton partenaire",
          ].join("\n"),
        )
        .setColor(0x5865f2);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    },
  },
];

export function commandData(): APIApplicationCommand[] {
  return commands.map((c) => c.data);
}
