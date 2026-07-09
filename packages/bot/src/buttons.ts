import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
} from "discord.js";
import type { BotContext } from "./ctx.js";
import { announceMatch, entryFrom } from "./commands.js";

export async function handleButton(ctx: BotContext, interaction: ButtonInteraction): Promise<void> {
  const id = interaction.customId;

  if (id === "queue:leave") {
    await ctx.matchmaker.leave(interaction.user.id);
    await interaction.reply({ content: "🚪 File d'attente quittée.", ephemeral: true });
    return;
  }

  const matchId = ctx.sessions.getUserMatch(interaction.user.id);
  if (!matchId) {
    await interaction.reply({ content: "ℹ️ Aucun match actif.", ephemeral: true });
    return;
  }
  const sess = ctx.sessions.session(matchId)!;
  const partner = sess.match.userA === interaction.user.id ? sess.match.userB : sess.match.userA;

  switch (id) {
    case "match:next": {
      await ctx.sessions.end(matchId);
      const prefs = ctx.lastPrefs.get(interaction.user.id);
      if (!prefs || !interaction.guildId) {
        await interaction.reply({ content: "❌ Aucune recherche en mémoire. Relance `/match`.", ephemeral: true });
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
      break;
    }
    case "match:leave": {
      await ctx.sessions.end(matchId);
      await interaction.reply({ content: "🚪 Match terminé. À bientôt !", ephemeral: true });
      break;
    }
    case "match:block": {
      await ctx.storage.addBlock(interaction.user.id, partner);
      await ctx.sessions.end(matchId);
      await interaction.reply({ content: "🚫 Partenaire bloqué et match terminé.", ephemeral: true });
      break;
    }
    case "match:report": {
      const modal = new ModalBuilder()
        .setCustomId("report:modal")
        .setTitle("Signaler un utilisateur")
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("reason")
              .setLabel("Raison")
              .setStyle(TextInputStyle.Short)
              .setPlaceholder("Spam, Harcèlement, Inapproprié, Bot, Autre")
              .setRequired(true),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("comment")
              .setLabel("Détails (optionnel)")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false),
          ),
        );
      await interaction.showModal(modal);
      break;
    }
    default:
      await interaction.reply({ content: "❓ Action inconnue.", ephemeral: true });
  }
}

export async function handleReportModal(ctx: BotContext, interaction: import("discord.js").ModalSubmitInteraction): Promise<void> {
  const matchId = ctx.sessions.getUserMatch(interaction.user.id);
  if (!matchId) {
    await interaction.reply({ content: "❌ Aucun match actif.", ephemeral: true });
    return;
  }
  const sess = ctx.sessions.session(matchId)!;
  const partner = sess.match.userA === interaction.user.id ? sess.match.userB : sess.match.userA;
  const reason = interaction.fields.getTextInputValue("reason").slice(0, 32);
  const comment = interaction.fields.getTextInputValue("comment") || undefined;
  await ctx.storage.addReport({ reporterId: interaction.user.id, targetId: partner, matchId, reason, comment });
  await ctx.storage.logActivity("report", { matchId, target: partner, reason });
  await interaction.reply({ content: "✅ Signalement envoyé. Merci !", ephemeral: true });
}
