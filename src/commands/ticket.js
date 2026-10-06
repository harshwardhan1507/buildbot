const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require("discord.js");
const config = require("../config/config");
const { createTicketChannel } = require("../services/tickets");
const { createBaseEmbed, createSuccessEmbed, COLORS } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Open a private support ticket with the BuildLab Team"),

  /**
   * @param {import("discord.js").ChatInputCommandInteraction} interaction 
   */
  async execute(interaction) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
    }

    const embed = createBaseEmbed(
      "🎫 BuildLab Support Ticket",
      "Need help from the BuildLab Team? Select your issue category below to open a private ticket.\n\n" +
        "• A private text channel will be created exclusively for you and the mentors.\n" +
        "• Your ticket will be reviewed and claimed by a team member.",
      COLORS.DEFAULT
    );

    const select = new StringSelectMenuBuilder()
      .setCustomId("ticket_select_category")
      .setPlaceholder("Select help category...");

    for (const [key, cat] of Object.entries(config.tickets.categories)) {
      select.addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(cat.label)
          .setValue(key)
          .setDescription(cat.description.slice(0, 100))
          .setEmoji(cat.emoji)
      );
    }

    const row = new ActionRowBuilder().addComponents(select);

    if (interaction.deferred) {
      return interaction.editReply({
        embeds: [embed],
        components: [row],
      });
    }
    if (interaction.replied) {
      return interaction.followUp({
        embeds: [embed],
        components: [row],
        ephemeral: true,
      });
    }
    return interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true,
    });
  },

  /**
   * Handles ticket category selection from select menu
   * @param {import("discord.js").StringSelectMenuInteraction} interaction 
   */
  async handleSelectMenu(interaction) {
    if (interaction.customId !== "ticket_select_category") return;

    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
    }

    const categoryKey = interaction.values[0];

    try {
      const { channel, ticket } = await createTicketChannel(
        interaction.guild,
        interaction.user,
        categoryKey
      );

      const successEmbed = createSuccessEmbed(
        "Ticket Created",
        `Your private support ticket **#${String(ticket.ticket_number).padStart(4, "0")}** has been opened:\n\n` +
          `👉 Head over to <#${channel.id}> to discuss with the mentors.`
      );

      if (interaction.deferred) {
        return interaction.editReply({ embeds: [successEmbed] });
      }
      return interaction.reply({ embeds: [successEmbed], ephemeral: true });
    } catch (error) {
      console.error("Error creating ticket channel:", error);
      if (interaction.deferred) {
        return interaction.editReply({
          content: "❌ An error occurred while opening your support ticket. Please contact an admin in #help.",
        });
      }
      if (interaction.replied) {
        return interaction.followUp({
          content: "❌ An error occurred while opening your support ticket. Please contact an admin in #help.",
          ephemeral: true,
        });
      }
      return interaction.reply({
        content: "❌ An error occurred while opening your support ticket. Please contact an admin in #help.",
        ephemeral: true,
      });
    }
  },
};
