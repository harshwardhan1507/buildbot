const { SlashCommandBuilder } = require("discord.js");
const { getParticipantTickets, formatTicketNumber } = require("../services/tickets");
const { createBaseEmbed, COLORS } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("my-tickets")
    .setDescription("View your active BuildLab support tickets"),

  /**
   * @param {import("discord.js").ChatInputCommandInteraction} interaction 
   */
  async execute(interaction) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
    }

    const tickets = getParticipantTickets(interaction.user.id);

    const embed = createBaseEmbed(
      "🎫 Your Support Tickets",
      `You have **${tickets.length}** active ticket(s):`,
      COLORS.DEFAULT
    );

    if (tickets.length === 0) {
      embed.setDescription(
        "You currently have no open support tickets. Use `/ticket` if you need help from the BuildLab Team!"
      );
      if (interaction.deferred) return interaction.editReply({ embeds: [embed] });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

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

    if (interaction.deferred) return interaction.editReply({ embeds: [embed] });
    if (interaction.replied) return interaction.followUp({ embeds: [embed], ephemeral: true });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
