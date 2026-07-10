import { Client, GatewayIntentBits, Events, Message, Interaction } from "discord.js";
import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v10";
import { createPool, createStorage, Matchmaker } from "@matchmaking/core";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { createContext } from "./ctx.js";
import { commands } from "./commands.js";
import { setupCommand } from "./setup.js";
import { handleButton, handleReportModal } from "./buttons.js";
import { OnboardingManager, createWelcomeChannel } from "./onboarding.js";
import { panelCommand, handlePanelButton, handlePanelSelect, initLivePanels } from "./panel.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

const storage = createStorage();
const pool = createPool();
const matchmaker = new Matchmaker(pool, storage);
const ctx = createContext(client, matchmaker, storage);
const onboarding = new OnboardingManager(ctx);
initLivePanels(ctx);

async function deployCommands(): Promise<void> {
  if (!config.DISCORD_CLIENT_ID) {
    logger.warn("DISCORD_CLIENT_ID manquant — commandes non déployées automatiquement.");
    return;
  }
  const rest = new REST({ version: "10" }).setToken(config.DISCORD_TOKEN);
  const allCommands = [...commands, panelCommand];
  try {
    await rest.put(Routes.applicationCommands(config.DISCORD_CLIENT_ID), { body: allCommands.map((c) => c.data) });
    logger.info("Commandes slash déployées (global).");
  } catch (err) {
    logger.error("Échec du déploiement des commandes", { err: String(err) });
  }
}

client.once(Events.ClientReady, async (c) => {
  logger.info("Bot connecté", { tag: c.user.tag, guilds: c.guilds.cache.size });
  await deployCommands();
});

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const allCommands = [...commands, panelCommand, setupCommand];
      const cmd = allCommands.find((c) => c.data.name === interaction.commandName);
      if (cmd) await cmd.execute(ctx, interaction);
      return;
    }
    if (interaction.isButton()) {
      if (interaction.customId.startsWith("onb:")) {
        await onboarding.handleButton(interaction);
      } else if (interaction.customId.startsWith("panel:")) {
        await handlePanelButton(ctx, interaction);
      } else {
        await handleButton(ctx, interaction);
      }
      return;
    }
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId.startsWith("panel:")) {
        await handlePanelSelect(ctx, interaction);
      }
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId === "report:modal") {
      await handleReportModal(ctx, interaction);
    }
  } catch (err) {
    logger.error("Erreur interaction", { err: String(err) });
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "❌ Une erreur est survenue.", ephemeral: true }).catch(() => {});
    }
  }
});

client.on(Events.MessageCreate, async (message: Message) => {
  if (message.author.bot) return;
  if (!message.inGuild()) return;
  await ctx.sessions.relay(message);
});

client.on(Events.GuildMemberAdd, async (member) => {
  try {
    if (member.user.bot) return;
    const channel = await createWelcomeChannel(member);
    if (!channel) {
      logger.warn("Onboarding: impossible de créer le salon privé", { guild: member.guild.id });
      return;
    }
    logger.info("Onboarding démarré", { user: member.id, guild: member.guild.id });
    await onboarding.start(member, channel);
  } catch (err) {
    logger.error("Erreur onboarding", { err: String(err) });
  }
});

client.login(config.DISCORD_TOKEN).catch((err) => {
  logger.error("Connexion impossible", { err: String(err) });
  process.exit(1);
});

const shutdown = async () => {
  logger.info("Arrêt en cours…");
  await client.destroy();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
