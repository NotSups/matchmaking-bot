import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  type GuildTextBasedChannel,
  type GuildMember,
  type TextChannel,
  type ButtonInteraction,
} from "discord.js";
import type { BotContext } from "./ctx.js";
import type { MatchPreferences } from "@matchmaking/core";
import { announceMatch, entryFrom } from "./commands.js";
import { sendPanel } from "./panel.js";

const LANGUAGES = [
  { id: "fr", label: "🇫🇷 Français" },
  { id: "en", label: "🇬🇧 English" },
  { id: "es", label: "🇪🇸 Español" },
  { id: "de", label: "🇩🇪 Deutsch" },
  { id: "other", label: "🌍 Autre" },
];

const INTERESTS = [
  { id: "gaming", label: "🎮 Gaming" },
  { id: "music", label: "🎵 Musique" },
  { id: "movies", label: "🎬 Cinéma" },
  { id: "sport", label: "⚽ Sport" },
  { id: "tech", label: "💻 Tech" },
  { id: "art", label: "🎨 Art" },
];

interface OnboardingState {
  userId: string;
  guildId: string;
  channelId: string;
  languages: Set<string>;
  interests: Set<string>;
  step: "lang" | "interests" | "done";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Affiche l'indicateur "est en train d'écrire…" de façon fiable (ré-émis toutes
 * les 4 s pour rester visible), attend un délai humain, puis poste le message.
 */
async function humanSend(
  channel: GuildTextBasedChannel,
  payload: Parameters<GuildTextBasedChannel["send"]>[0],
  textForTiming = "",
): Promise<void> {
  const ms = Math.max(1600, Math.min(4500, 700 + textForTiming.length * 22));
  const end = Date.now() + ms;
  await channel.sendTyping().catch(() => {});
  while (Date.now() < end - 200) {
    await sleep(4000);
    if (Date.now() < end - 200) await channel.sendTyping().catch(() => {});
  }
  await channel.send(payload as never).catch(() => {});
}

export class OnboardingManager {
  private states = new Map<string, OnboardingState>(); // channelId -> state

  constructor(private ctx: BotContext) {}

  isOnboardingChannel(channelId: string): boolean {
    return this.states.has(channelId);
  }

  async start(member: GuildMember, channel: TextChannel): Promise<void> {
    const state: OnboardingState = {
      userId: member.id,
      guildId: member.guild.id,
      channelId: channel.id,
      languages: new Set(),
      interests: new Set(),
      step: "lang",
    };
    this.states.set(channel.id, state);

    await humanSend(
      channel,
      {
        content:
          `Salut <@${member.id}> 👋 Je suis **Match**, ton guide personnel. ` +
          `Je vais t'aider à configurer ton profil et te présenter le serveur. ` +
          `Ça prend 1 minute, suis les étapes ci-dessous 👇`,
      },
      "Salut ! Je suis Match, ton guide personnel. Je vais t'aider à configurer ton profil et te présenter le serveur. Ça prend une minute, suis les étapes.",
    );

    await this.askLanguage(channel, state);
  }

  private langRow(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      LANGUAGES.map((l) =>
        new ButtonBuilder().setCustomId(`onb:lang:${l.id}`).setLabel(l.label).setStyle(ButtonStyle.Secondary),
      ),
    );
  }

  private async askLanguage(channel: TextChannel, state: OnboardingState): Promise<void> {
    state.step = "lang";
    await humanSend(
      channel,
      {
        embeds: [
          new EmbedBuilder()
            .setTitle("🌐 Dans quelle langue veux-tu discuter ?")
            .setDescription("Choisis ta (ou tes) langue(s) en cliquant dessous. Tu seras matché en priorité avec les personnes qui la parlent.")
            .setColor(0x5865f2),
        ],
        components: [this.langRow()],
      },
      "Dans quelle langue veux-tu discuter ? Choisis ta langue, tu seras matché en priorité avec les personnes qui la parlent.",
    );
  }

  private interestRows(): ActionRowBuilder<ButtonBuilder>[] {
    const rows: ButtonBuilder[][] = [[], []];
    INTERESTS.forEach((it, i) =>
      rows[i < 3 ? 0 : 1].push(
        new ButtonBuilder().setCustomId(`onb:interest:${it.id}`).setLabel(it.label).setStyle(ButtonStyle.Secondary),
      ),
    );
    const done = new ButtonBuilder().setCustomId("onb:interests:done").setLabel("✅ Valider").setStyle(ButtonStyle.Success);
    rows[1].push(done);
    return rows.map((r) => new ActionRowBuilder<ButtonBuilder>().addComponents(r));
  }

  private async askInterests(channel: TextChannel, state: OnboardingState): Promise<void> {
    state.step = "interests";
    await humanSend(
      channel,
      {
        embeds: [
          new EmbedBuilder()
            .setTitle("🎯 Quels sont tes centres d'intérêt ?")
            .setDescription("Sélectionne tout ce qui t'intéresse (plusieurs choix possibles), puis clique sur **Valider**.")
            .setColor(0x5865f2),
        ],
        components: this.interestRows(),
      },
      "Quels sont tes centres d'intérêt ? Sélectionne tout ce qui t'intéresse puis valide.",
    );
  }

  private async finish(channel: TextChannel, state: OnboardingState): Promise<void> {
    state.step = "done";
    await this.ctx.storage.upsertUser({
      id: state.userId,
      username: channel.client.user?.username ?? "user",
      globalName: null,
      avatar: null,
    });
    const current =
      (await this.ctx.storage.getProfile(state.userId)) ??
      ({
        userId: state.userId,
        languages: [],
        interests: [],
        isPremium: false,
        reputation: 100,
        level: 1,
        xp: 0,
        likesReceived: 0,
        totalMatches: 0,
      } as const);
    await this.ctx.storage.upsertProfile({
      ...current,
      languages: [...state.languages],
      interests: [...state.interests],
    });

    await humanSend(
      channel,
      {
        embeds: [
          new EmbedBuilder()
            .setTitle("🚀 Prêt à rencontrer du monde !")
            .setDescription(
              [
                "**Comment ça marche :**",
                "• Ouvre le **panel fixe** avec `/panel` (ou le bouton ci-dessous) : choisis un mode et une portée, puis **Rejoindre la file**.",
                "• Dès qu'un partenaire est trouvé, un **salon privé** est créé automatiquement pour vous deux.",
                "• Pendant le match : **Next**, **Leave**, **Block**, **Report** sont à disposition.",
                "• Tout se gère depuis le panel — profils, statistiques, matchmaking.",
                "",
                "📜 Règles : sois respectueux·se, pas de spam, signalement en un clic. Bonne rencontre !",
              ].join("\n"),
            )
            .setColor(0x57f287),
        ],
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId("onb:launch").setLabel("Lancer mon 1er match 🚀").setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId("onb:panel").setLabel("Ouvrir le panel 🌐").setStyle(ButtonStyle.Secondary),
          ),
        ],
      },
      "Prêt à rencontrer du monde ! Voici comment ça marche : le panel te met en file, next change de partenaire, leave quitte. Tout se gère depuis le panel. Sois respectueux, amuse-toi !",
    );
  }

  async handleButton(interaction: ButtonInteraction): Promise<void> {
    const state = this.states.get(interaction.channelId);
    if (!state || interaction.user.id !== state.userId) return;
    const id = interaction.customId;
    const channel = interaction.channel as TextChannel;

    if (id.startsWith("onb:lang:")) {
      const lang = id.split(":")[2];
      state.languages.add(lang);
      await interaction.reply({ content: `✅ Langue ajoutée : **${lang}**`, ephemeral: true });
      await this.askInterests(channel, state);
      return;
    }

    if (id.startsWith("onb:interest:")) {
      const it = id.split(":")[2];
      if (state.interests.has(it)) state.interests.delete(it);
      else state.interests.add(it);
      const labels = [...state.interests].join(", ") || "(aucun)";
      await interaction.reply({ content: `🎯 Intérêts : ${labels}`, ephemeral: true });
      return;
    }

    if (id === "onb:interests:done") {
      await interaction.reply({ content: "✅ C'est noté !", ephemeral: true });
      await this.finish(channel, state);
      return;
    }

    if (id === "onb:launch") {
      await interaction.reply({ content: "🔗 Je te cherche un partenaire…", ephemeral: true });
      const prefs: MatchPreferences = {
        mode: "TEXT",
        scope: "GLOBAL",
        languages: [...state.languages],
        interests: [...state.interests],
      };
      const match = await this.ctx.matchmaker.enqueue(entryFrom(interaction, prefs));
      if (match) {
        await this.ctx.sessions.createForMatch(match);
        await announceMatch(this.ctx, match);
        await channel.send({ content: `<@${interaction.user.id}> 🔗 Match trouvé, ton salon privé a été créé juste au-dessus !` });
      } else {
        await humanSend(
          channel,
          { content: `<@${interaction.user.id}> 🔍 Recherche en cours… je t'avertis dès qu'un partenaire est là.` },
          "Recherche en cours, je t'avertis dès qu'un partenaire est là.",
        );
      }
      return;
    }

    if (id === "onb:panel") {
      await sendPanel(this.ctx, interaction);
      return;
    }
  }
}

/** Creates the private welcome channel for a new member. */
export async function createWelcomeChannel(member: GuildMember): Promise<TextChannel | null> {
  const guild = member.guild;
  try {
    const channel = (await guild.channels.create({
      name: `bienvenue-${member.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, ""),
      type: ChannelType.GuildText,
      topic: "Salon d'accueil privé — ton guide Match t'explique tout.",
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: member.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        },
      ],
    })) as TextChannel;
    return channel;
  } catch {
    return null;
  }
}
