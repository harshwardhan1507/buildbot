const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { getParticipantTickets, formatTicketNumber } = require("../services/tickets");
const { createBaseEmbed, COLORS } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("my-tickets")
    .setDescription("View your support tickets"),

  /**
   * @param {import("discord.js").ChatInputCommandInteraction} interaction 
   */
  async execute(interaction) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
    }

    const tickets = getParticipantTickets(interaction.user.id);

    const embed = createBaseEmbed(
      "🎫 YOUR SUPPORT TICKETS",
      `You have **${tickets.length}** active support ticket(s):`,
      COLORS.DEFAULT
    );

    if (tickets.length === 0) {
      embed.setDescription(
        "You currently have no open support tickets. Need help with code, PRDs, or GitHub? Open a ticket below!"
      );
    } else {
      for (const t of tickets) {
        const num = formatTicketNumber(t.ticket_number);
        const mentorText = t.claimed_by ? `Assigned to <@${t.claimed_by}>` : "Waiting for mentor claim";
        const statusIcon = t.status === "OPEN" ? "🟡 Open" : "🔵 In Progress";

        embed.addFields({
          name: `#${num} — ${t.category}`,
          value: `**Channel:** <#${t.channel_id}>\n**Status:** ${statusIcon}\n**Mentor:** ${mentorText}`,
          inline: false,
        });
      }
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket_open_direct")
        .setLabel("Open Ticket")
        .setEmoji("🎫")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("start_get_help")
        .setLabel("Help Topics")
        .setEmoji("❓")
        .setStyle(ButtonStyle.Secondary)
    );

    if (interaction.deferred) return interaction.editReply({ embeds: [embed], components: [row] });
    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  },
};
