import {
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
  type ChatInputCommandInteraction,
  type APIApplicationCommand,
  type Guild,
  type Role,
  type CategoryChannel,
  type TextChannel,
  type VoiceChannel,
} from "discord.js";
import type { BotContext } from "./ctx.js";
import { logger } from "./logger.js";
import type { Command } from "./commands.js";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RoleConfig {
  name: string;
  color: string;
  hoist: boolean;
  mentionable: boolean;
  permissions: bigint[];
}

interface ChannelConfig {
  name: string;
  type: ChannelType;
  topic?: string;
  nsfw?: boolean;
}

interface CategoryConfig {
  name: string;
  channels: ChannelConfig[];
}

// ─── Configuration ────────────────────────────────────────────────────────────

const ROLES: RoleConfig[] = [
  {
    name: "👑 Fondateur",
    color: "#FFD700",
    hoist: true,
    mentionable: false,
    permissions: [PermissionFlagsBits.Administrator],
  },
  {
    name: "🛡️ Admin",
    color: "#E74C3C",
    hoist: true,
    mentionable: false,
    permissions: [
      PermissionFlagsBits.ManageGuild,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ManageRoles,
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.BanMembers,
      PermissionFlagsBits.KickMembers,
    ],
  },
  {
    name: "🎖️ Modérateur",
    color: "#3498DB",
    hoist: true,
    mentionable: true,
    permissions: [
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.MuteMembers,
      PermissionFlagsBits.DeafenMembers,
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.BanMembers,
    ],
  },
  {
    name: "⭐ Premium",
    color: "#9B59B6",
    hoist: true,
    mentionable: false,
    permissions: [],
  },
  {
    name: "🎉 Event Master",
    color: "#E67E22",
    hoist: true,
    mentionable: true,
    permissions: [
      PermissionFlagsBits.ManageEvents,
      PermissionFlagsBits.CreateEvents,
    ],
  },
  {
    name: "🤖 Bot",
    color: "#2ECC71",
    hoist: true,
    mentionable: false,
    permissions: [],
  },
  {
    name: "👤 Membre",
    color: "#95A5A6",
    hoist: false,
    mentionable: false,
    permissions: [],
  },
  {
    name: "🆕 Nouveau",
    color: "#BDC3C7",
    hoist: false,
    mentionable: false,
    permissions: [],
  },
];

const CATEGORIES: CategoryConfig[] = [
  {
    name: "⚙️ STAFF",
    channels: [
      { name: "💬・staff-chat", type: ChannelType.GuildText, topic: "Discussion privée du staff" },
      { name: "📋・logs-bot", type: ChannelType.GuildText, topic: "Logs automatiques du bot" },
      { name: "🎯・logs-matches", type: ChannelType.GuildText, topic: "Historique des matches" },
      { name: "⚠️・signalements", type: ChannelType.GuildText, topic: "Reports des membres" },
      { name: "📊・stats-dashboard", type: ChannelType.GuildText, topic: "Tableau de bord des stats" },
    ],
  },
  {
    name: "📢 INFORMATIONS",
    channels: [
      { name: "✨・accueil", type: ChannelType.GuildText, topic: "Bienvenue ! Présentation du serveur" },
      { name: "📜・règlement", type: ChannelType.GuildText, topic: "Règles du serveur" },
      { name: "📢・annonces", type: ChannelType.GuildText, topic: "News et updates" },
      { name: "🎉・événements", type: ChannelType.GuildText, topic: "Annonces d'événements" },
      { name: "🆕・nouveautés", type: ChannelType.GuildText, topic: "Changelog du bot" },
    ],
  },
  {
    name: "🎫 ÉVÉNEMENTS",
    channels: [
      { name: "📅・calendrier", type: ChannelType.GuildText, topic: "Planning des events de la semaine" },
      { name: "🗳️・sondages", type: ChannelType.GuildText, topic: "Voter pour le prochain event" },
      { name: "🏆・résultats", type: ChannelType.GuildText, topic: "Résultats des events passés" },
    ],
  },
  {
    name: "🚀 MATCHMAKING",
    channels: [
      { name: "🎯・panel", type: ChannelType.GuildText, topic: "Panel public du bot — /panel" },
      { name: "📊・leaderboard", type: ChannelType.GuildText, topic: "Classement en temps réel" },
      { name: "🎲・daily-challenge", type: ChannelType.GuildText, topic: "Défi du jour" },
      { name: "🏆・hall-of-fame", type: ChannelType.GuildText, topic: "Meilleurs matches du mois" },
      { name: "💌・confessions", type: ChannelType.GuildText, topic: "Messages anonymes" },
    ],
  },
  {
    name: "💬 COMMUNAUTÉ",
    channels: [
      { name: "💭・discussion", type: ChannelType.GuildText, topic: "Chat général" },
      { name: "📸・photos", type: ChannelType.GuildText, topic: "Partage d'images" },
      { name: "🎮・gaming", type: ChannelType.GuildText, topic: "Parler de jeux vidéo" },
      { name: "🎵・musique", type: ChannelType.GuildText, topic: "Partager sa musique" },
      { name: "🌍・voyages", type: ChannelType.GuildText, topic: "Parler de voyages" },
      { name: "🤖・bot-commands", type: ChannelType.GuildText, topic: "Commandes du bot hors-match" },
    ],
  },
  {
    name: "🔊 VOCAL",
    channels: [
      { name: "☕・Salon Général", type: ChannelType.GuildVoice },
      { name: "🎮・Gaming Lounge", type: ChannelType.GuildVoice },
      { name: "🎵・Music Room", type: ChannelType.GuildVoice },
      { name: "🏟️・Speed Dating", type: ChannelType.GuildVoice },
    ],
  },
  {
    name: "🛡️ SUPPORT",
    channels: [
      { name: "🎫・tickets", type: ChannelType.GuildText, topic: "Créer un ticket pour le staff" },
      { name: "❓・faq", type: ChannelType.GuildText, topic: "Questions fréquentes" },
      { name: "🐛・bug-report", type: ChannelType.GuildText, topic: "Signaler un bug du bot" },
      { name: "💡・suggestions", type: ChannelType.GuildText, topic: "Proposer des idées" },
    ],
  },
];

// ─── Setup Function ───────────────────────────────────────────────────────────

async function runSetup(guild: Guild): Promise<{ success: boolean; message: string }> {
  const createdRoles: Role[] = [];
  const createdCategories: CategoryChannel[] = [];
  const createdChannels: (TextChannel | VoiceChannel)[] = [];

  try {
    // 1. Create Roles
    logger.info("Setup: Création des rôles...");
    for (const roleConfig of ROLES) {
      const existingRole = guild.roles.cache.find((r) => r.name === roleConfig.name);
      if (existingRole) {
        createdRoles.push(existingRole);
        continue;
      }

      const role = await guild.roles.create({
        name: roleConfig.name,
        color: roleConfig.color as `#${string}`,
        hoist: roleConfig.hoist,
        mentionable: roleConfig.mentionable,
        permissions: roleConfig.permissions,
        reason: "Setup automatique du serveur matchmaking",
      });
      createdRoles.push(role);
      logger.info(`Setup: Rôle créé: ${role.name}`);
    }

    // Get role IDs
    const everyoneRole = guild.roles.everyone;
    const staffRole = createdRoles.find((r) => r.name === "🛡️ Admin");

    // 2. Create Categories and Channels
    logger.info("Setup: Création des catégories et salons...");
    for (const catConfig of CATEGORIES) {
      const existingCategory = guild.channels.cache.find(
        (c) => c.type === ChannelType.GuildCategory && c.name === catConfig.name
      ) as CategoryChannel | undefined;

      let category: CategoryChannel;
      if (existingCategory) {
        category = existingCategory;
      } else {
        // Set permissions based on category type
        let permissionOverwrites: Array<{ id: string; allow: bigint[]; deny: bigint[] }> = [];
        if (catConfig.name.includes("STAFF")) {
          permissionOverwrites = staffRole
            ? [
                {
                  id: everyoneRole.id,
                  deny: [PermissionFlagsBits.ViewChannel],
                  allow: [],
                },
                {
                  id: staffRole.id,
                  allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
                  deny: [],
                },
              ]
            : [];
        } else if (catConfig.name.includes("INFORMATIONS")) {
          permissionOverwrites = [
            {
              id: everyoneRole.id,
              allow: [PermissionFlagsBits.ViewChannel],
              deny: [PermissionFlagsBits.SendMessages],
            },
          ];
        } else {
          permissionOverwrites = [
            {
              id: everyoneRole.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
              deny: [],
            },
          ];
        }

        category = await guild.channels.create({
          name: catConfig.name,
          type: ChannelType.GuildCategory,
          permissionOverwrites,
          reason: "Setup automatique du serveur matchmaking",
        });
        logger.info(`Setup: Catégorie créée: ${category.name}`);
      }
      createdCategories.push(category);

      // Create channels in category
      for (const channelConfig of catConfig.channels) {
        const existingChannel = guild.channels.cache.find(
          (c) => c.name === channelConfig.name && c.parentId === category.id
        );

        if (existingChannel) {
          createdChannels.push(existingChannel as TextChannel | VoiceChannel);
          continue;
        }

        // Set channel-specific permissions
        let channelPermissions: Array<{ id: string; allow: bigint[]; deny: bigint[] }> = [];
        if (catConfig.name.includes("STAFF")) {
          channelPermissions = staffRole
            ? [
                {
                  id: everyoneRole.id,
                  deny: [PermissionFlagsBits.ViewChannel],
                  allow: [],
                },
                {
                  id: staffRole.id,
                  allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
                  deny: [],
                },
              ]
            : [];
        } else if (catConfig.name.includes("INFORMATIONS")) {
          channelPermissions = [
            {
              id: everyoneRole.id,
              allow: [PermissionFlagsBits.ViewChannel],
              deny: [PermissionFlagsBits.SendMessages],
            },
          ];
        }

        if (channelConfig.type === ChannelType.GuildText) {
          const channel = await guild.channels.create({
            name: channelConfig.name,
            type: ChannelType.GuildText,
            topic: channelConfig.topic,
            parent: category.id,
            nsfw: channelConfig.nsfw || false,
            permissionOverwrites: channelPermissions,
            reason: "Setup automatique du serveur matchmaking",
          });
          createdChannels.push(channel);
          logger.info(`Setup: Salon créé: ${channel.name}`);
        } else if (channelConfig.type === ChannelType.GuildVoice) {
          const channel = await guild.channels.create({
            name: channelConfig.name,
            type: ChannelType.GuildVoice,
            parent: category.id,
            permissionOverwrites: channelPermissions,
            reason: "Setup automatique du serveur matchmaking",
          });
          createdChannels.push(channel);
          logger.info(`Setup: Salon vocal créé: ${channel.name}`);
        }
      }
    }

    const successMessage = [
      `✅ **Setup terminé !**`,
      ``,
      `🎭 **${createdRoles.length} rôles** créés`,
      `📂 **${createdCategories.length} catégories** créées`,
      `💬 **${createdChannels.length} salons** créés`,
      ``,
      `🚀 Le serveur est prêt !`,
    ].join("\n");

    return { success: true, message: successMessage };
  } catch (error) {
    logger.error("Setup: Erreur", { error: String(error) });
    return {
      success: false,
      message: `❌ Erreur lors du setup: ${String(error)}`,
    };
  }
}

// ─── Slash Command ────────────────────────────────────────────────────────────

export const setupCommand: Command = {
  data: {
    name: "setup",
    description: "Configure automatiquement tout le serveur (salons, rôles, permissions)",
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
    dm_permission: false,
  } as APIApplicationCommand,

  async execute(_ctx: BotContext, interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({
        content: "❌ Cette commande doit être utilisée dans un serveur.",
        ephemeral: true,
      });
      return;
    }

    // Check permissions
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        content: "❌ Vous devez être administrateur pour utiliser cette commande.",
        ephemeral: true,
      });
      return;
    }

    // Defer reply (can take a while)
    await interaction.deferReply({ ephemeral: false });

    const guild = interaction.guild;

    // Confirmation embed
    const confirmEmbed = new EmbedBuilder()
      .setTitle("⚙️ Configuration du serveur")
      .setDescription("Création de tous les rôles, catégories et salons en cours...")
      .setColor(0x3498db)
      .setTimestamp();

    await interaction.editReply({ embeds: [confirmEmbed] });

    // Run setup
    const result = await runSetup(guild);

    // Result embed
    const resultEmbed = new EmbedBuilder()
      .setTitle(result.success ? "✅ Setup terminé !" : "❌ Erreur lors du setup")
      .setDescription(result.message)
      .setColor(result.success ? 0x2ecc71 : 0xe74c3c)
      .setTimestamp();

    await interaction.editReply({ embeds: [resultEmbed] });
  },
};
