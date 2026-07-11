import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  GuildTextBasedChannel,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type APIApplicationCommand,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
  type ChatInputCommandInteraction,
  type Message,
} from "discord.js";
import type { BotContext } from "./ctx.js";
import type { MatchMode, MatchScope } from "@matchmaking/core";
import { announceMatch, entryFrom } from "./commands.js";
import { renderProfileCard } from "./profile.js";

interface PanelPrefs {
  mode: MatchMode;
  scope: MatchScope;
}

const DEFAULTS: PanelPrefs = { mode: "TEXT", scope: "GLOBAL" };
const userPrefs = new Map<string, PanelPrefs>();

/** One fixed panel per channel (the public kiosk). */
const channelPanels = new Map<string, string>();

function prefsOf(userId: string): PanelPrefs {
  return userPrefs.get(userId) ?? DEFAULTS;
}

function bar(pct: number, len = 10): string {
  const f = Math.max(0, Math.min(len, Math.round((pct / 100) * len)));
  return "█".repeat(f) + "░".repeat(len - f);
}

/** Embeds for the SHARED, fixed panel (global stats only — no personal data). */
export async function buildSharedPanelEmbeds(ctx: BotContext): Promise<EmbedBuilder[]> {
  const pool = await ctx.matchmaker.poolStats();
  const waiting = Object.values(pool).reduce((a, b) => a + b, 0);
  const active = ctx.sessions.activeCount();
  const stored = await ctx.storage.getStats();

  const hero = new EmbedBuilder()
    .setTitle("🚀  Matchmaking Platform")
    .setDescription(
      [
        "`````````````````````````````````````````````````",
        "     ╔═══════════════════════════════════╗",
        "     ║   🤝  MATCHMAKING  ·  PREMIUM  🤝  ║",
        "     ╚═══════════════════════════════════╝",
        "`````````````````````````````````````````````````",
        "",
        "**Bienvenue sur le panel officiel du serveur.**",
        "Rencontre des inconnus du monde entier, en texte ou en vocal,",
        "via des salons privés créés automatiquement.",
        "",
        "▶️ Choisis un **mode** et une **portée** dans les menus, puis clique **🚀 Rejoindre la file**.",
        "Ton match et tes actions sont personnels et restent privés — ce panneau est partagé par tous.",
      ].join("\n"),
    )
    .setColor(0x5865f2)
    .setThumbnail(ctx.client.user.displayAvatarURL())
    .addFields(
      { name: "⏳ En file", value: `**${waiting}**`, inline: true },
      { name: "💬 Actifs", value: `**${active}**`, inline: true },
      { name: "📅 Aujourd'hui", value: `**${stored.matchesToday}**`, inline: true },
      { name: "👥 En ligne", value: `**${stored.onlineUsers}**`, inline: true },
    )
    .setFooter({ text: "Matchmaking Platform • Mis à jour en temps réel" })
    .setTimestamp(new Date());

  const scopeLines = (["GLOBAL", "GUILD", "PARTNER"] as const)
    .map((s) => {
      const n = pool[s] ?? 0;
      const emoji = s === "GLOBAL" ? "🌍" : s === "GUILD" ? "🏠" : "🤝";
      return `${emoji} ${s.padEnd(8)} ${bar(n > 0 ? Math.min(100, n * 25) : 0, 8)} ${n}`;
    })
    .join("\n");

  const stats = new EmbedBuilder()
    .setTitle("📊  Statistiques en direct")
    .setColor(0x2ecc71)
    .setDescription(
      [
        "`````````````````````````````````````````````````",
        "          📊  STATISTIQUES  EN  DIRECT",
        "`````````````````````````````````````````````````",
      ].join("\n"),
    )
    .addFields(
      { name: "👥 En ligne", value: `**${stored.onlineUsers}**`, inline: true },
      { name: "⏳ En attente", value: `**${waiting}**`, inline: true },
      { name: "💬 Actifs", value: `**${active}**`, inline: true },
      { name: "📅 Aujourd'hui", value: `**${stored.matchesToday}**`, inline: true },
      { name: "🌐 File par portée", value: `\`\`\`\n${scopeLines}\n\`\`\``, inline: false },
    );

  const guide = new EmbedBuilder()
    .setTitle("❓  Comment ça marche")
    .setColor(0xf1c40f)
    .setDescription(
      [
        "```",
        "  1️⃣  Complète ton profil avec `/profile`.",
        "  2️⃣  Choisis **mode** et **portée** dans les menus ci-dessous.",
        "  3️⃣  Clique **🚀 Rejoindre la file**.",
        "  4️⃣  Dès qu'un partenaire est trouvé, un salon privé est créé.",
        "  5️⃣  Profite de la conversation !",
        "```",
        "",
        "**Commandes disponibles :**",
        "`/profile` · `/match` · `/stats` · `/leaderboard` · `/daily` · `/confess` · `/help`",
      ].join("\n"),
    );

  return [hero, stats, guide];
}

export function buildPanelComponents(userId: string): ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] {
  const p = prefsOf(userId);
  const joinBtn = new ButtonBuilder()
    .setCustomId("panel:join")
    .setLabel("🚀 Rejoindre la file")
    .setStyle(ButtonStyle.Primary);
  const leaveBtn = new ButtonBuilder().setCustomId("panel:leave").setLabel("🚪 Quitter").setStyle(ButtonStyle.Danger);

  const modeMenu = new StringSelectMenuBuilder()
    .setCustomId("panel:mode")
    .setPlaceholder(`📝 Mode : ${p.mode}`)
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel("📝 Texte").setValue("TEXT").setDefault(p.mode === "TEXT"),
      new StringSelectMenuOptionBuilder().setLabel("🎤 Vocal").setValue("VOICE").setDefault(p.mode === "VOICE"),
      new StringSelectMenuOptionBuilder().setLabel("📝🎤 Texte + Vocal").setValue("BOTH").setDefault(p.mode === "BOTH"),
    );

  const scopeMenu = new StringSelectMenuBuilder()
    .setCustomId("panel:scope")
    .setPlaceholder(`🌍 Portée : ${p.scope}`)
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel("🌍 Mondial").setValue("GLOBAL").setDefault(p.scope === "GLOBAL"),
      new StringSelectMenuOptionBuilder().setLabel("🏠 Serveur").setValue("GUILD").setDefault(p.scope === "GUILD"),
      new StringSelectMenuOptionBuilder().setLabel("🤝 Partenaires").setValue("PARTNER").setDefault(p.scope === "PARTNER"),
    );

  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(joinBtn, leaveBtn),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(modeMenu),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(scopeMenu),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("panel:status").setLabel("📊 Statut").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("panel:profile").setLabel("👤 Profil").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("panel:stats").setLabel("📈 Stats").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("panel:help").setLabel("❓ Aide").setStyle(ButtonStyle.Secondary),
    ),
  ] as ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[];
}

/** Posts or updates the single fixed panel in the channel. */
export async function sendPanel(ctx: BotContext, interaction: ChatInputCommandInteraction | ButtonInteraction): Promise<void> {
  const channel = interaction.channel as unknown as GuildTextBasedChannel | null;
  if (!channel || !("send" in channel)) {
    await interaction.reply({ content: "❌ Cette commande doit être utilisée dans un salon.", ephemeral: true }).catch(() => {});
    return;
  }
  const embeds = await buildSharedPanelEmbeds(ctx);
  const components = buildPanelComponents(interaction.user.id);

  const existingId = channelPanels.get(channel.id);
  if (existingId) {
    try {
      const msg = await channel.messages.fetch(existingId);
      await msg.edit({ embeds, components });
      registerLivePanel(msg);
      return;
    } catch {
      channelPanels.delete(channel.id);
    }
  }

  const msg = (await channel.send({ embeds, components })) as Message;
  channelPanels.set(channel.id, msg.id);
  registerLivePanel(msg);
  msg.pin().catch(() => {});
}

// ---------------------------------------------------------------------------
// Real-time auto-refresh of the fixed panel(s).
// ---------------------------------------------------------------------------
const livePanels = new Map<string, Message>();
let liveCtx: BotContext | null = null;

export function registerLivePanel(msg: Message): void {
  livePanels.set(msg.id, msg);
}

export function initLivePanels(ctx: BotContext): void {
  liveCtx = ctx;
  setInterval(async () => {
    if (!liveCtx) return;
    for (const [id, msg] of livePanels) {
      try {
        const embeds = await buildSharedPanelEmbeds(liveCtx);
        await msg.edit({ embeds, components: buildPanelComponents("shared") });
      } catch {
        livePanels.delete(id);
      }
    }
  }, 5000);
}

export async function handlePanelButton(ctx: BotContext, interaction: ButtonInteraction): Promise<void> {
  const userId = interaction.user.id;
  const p = prefsOf(userId);

  if (interaction.customId === "panel:join") {
    const match = await ctx.matchmaker.enqueue(entryFrom(ctx, interaction, { ...p, languages: [], interests: [] }));
    if (match) {
      await ctx.sessions.createForMatch(match);
      await announceMatch(ctx, match);
      await interaction.reply({ content: "🔗 Match trouvé ! Ton salon privé a été créé.", ephemeral: true });
    } else {
      await interaction.reply({ content: "🔍 Recherche en cours… tu seras notifié·e dans ton salon privé.", ephemeral: true });
    }
    return;
  }

  if (interaction.customId === "panel:leave") {
    const matchId = ctx.sessions.getUserMatch(userId);
    if (matchId) await ctx.sessions.end(matchId);
    else await ctx.matchmaker.leave(userId);
    await interaction.reply({ content: "🚪 Tu as quitté le match ou la file.", ephemeral: true });
    return;
  }

  if (interaction.customId === "panel:status") {
    const matchId = ctx.sessions.getUserMatch(userId);
    const since = await ctx.matchmaker.waitingSince(userId);
    const profile = await ctx.storage.getProfile(userId);
    const text = matchId
      ? "💬 Tu es en match."
      : since
        ? `⏳ Tu es en file depuis ${Math.round((Date.now() - since) / 1000)}s.`
        : "🟢 Disponible, pas en file.";

    const embed = new EmbedBuilder()
      .setTitle("📊 Ton Statut")
      .setDescription(text)
      .setColor(0x3498db)
      .addFields(
        { name: "🔥 Streak", value: `${profile?.streak ?? 0} matchs`, inline: true },
        { name: "🤝 Total matchs", value: `${profile?.totalMatches ?? 0}`, inline: true },
        { name: "📈 Niveau", value: `${profile?.level ?? 1}`, inline: true },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (interaction.customId === "panel:profile") {
    const profile = await ctx.storage.getProfile(userId);
    if (!profile) {
      await interaction.reply({ content: "Aucun profil. Crée-le avec `/profile`.", ephemeral: true });
      return;
    }
    await interaction.reply({ embeds: [renderProfileCard(profile, interaction.user.username)], ephemeral: true });
    return;
  }

  if (interaction.customId === "panel:stats") {
    const profile = await ctx.storage.getProfile(userId);
    const stats = await ctx.storage.getStats();

    const embed = new EmbedBuilder()
      .setTitle(`📊 Statistiques de ${interaction.user.username}`)
      .setThumbnail(interaction.user.displayAvatarURL({ size: 256 }))
      .setColor(0x3498db)
      .addFields(
        { name: "🤝 Matchs total", value: `**${profile?.totalMatches ?? 0}**`, inline: true },
        { name: "🔥 Streak", value: `**${profile?.streak ?? 0}**`, inline: true },
        { name: "📈 Niveau", value: `**${profile?.level ?? 1}**`, inline: true },
        { name: "🌐 En ligne", value: `**${stats.onlineUsers}**`, inline: true },
        { name: "📅 Aujourd'hui", value: `**${stats.matchesToday}**`, inline: true },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (interaction.customId === "panel:help") {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("❓ Aide — Matchmaking Platform")
          .setColor(0x5865f2)
          .setDescription(
            [
              "**Commandes disponibles :**",
              "",
              "📝 `/profile` — Crée ou modifie ton profil",
              "👤 `/profile-view` — Voir un profil complet",
              "🔍 `/match` — Rejoins la file d'attente",
              "⏭️ `/next` — Trouve un nouveau partenaire",
              "🚪 `/leave` — Quitte le match ou la file",
              "📊 `/queue` — Voir ton statut en file",
              "📈 `/stats` — Tes statistiques",
              "🏆 `/leaderboard` — Classement",
              "🎲 `/daily` — Défi du jour",
              "💌 `/confess` — Message anonyme",
              "🚫 `/report` — Signaler un partenaire",
              "⛔ `/block` — Bloquer un partenaire",
              "❓ `/help` — Cette aide",
            ].join("\n"),
          )
          .setFooter({ text: "Matchmaking Platform" })
          .setTimestamp(),
      ],
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({ content: "Action inconnue.", ephemeral: true });
}

export async function handlePanelSelect(_ctx: BotContext, interaction: StringSelectMenuInteraction): Promise<void> {
  const userId = interaction.user.id;
  const value = interaction.values[0] as MatchMode | MatchScope;
  const current = prefsOf(userId);
  if (interaction.customId === "panel:mode") userPrefs.set(userId, { ...current, mode: value as MatchMode });
  if (interaction.customId === "panel:scope") userPrefs.set(userId, { ...current, scope: value as MatchScope });
  const emoji = interaction.customId === "panel:mode" ? "📝" : "🌍";
  const label = interaction.customId === "panel:mode" ? "Mode" : "Portée";
  await interaction.reply({ content: `${emoji} **${label}** défini(e) sur **${value}**.`, ephemeral: true });
}

export const panelCommand = {
  data: new SlashCommandBuilder()
    .setName("panel")
    .setDescription("Ouvre le panel fixe de matchmaking du serveur.")
    .toJSON() as APIApplicationCommand,
  execute: async (ctx: BotContext, interaction: ChatInputCommandInteraction) => {
    await sendPanel(ctx, interaction);
  },
};
