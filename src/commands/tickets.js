const { SlashCommandBuilder } = require("discord.js");
const { listTickets, formatTicketNumber } = require("../services/tickets");
const { isBuildLabTeam, getPermissionDeniedMessage } = require("../utils/permissions");
const { createBaseEmbed, COLORS } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("tickets")
    .setDescription("View BuildLab support ticket queue (Team only)")
    .addStringOption((opt) =>
      opt
        .setName("filter")
        .setDescription("Filter tickets")
        .setRequired(false)
        .addChoices(
          { name: "🟡 Open / In Progress", value: "open" },
          { name: "⚡ Unclaimed", value: "unclaimed" },
          { name: "🧑‍🏫 Assigned to Me", value: "mine" }
        )
    ),

  /**
   * @param {import("discord.js").ChatInputCommandInteraction} interaction 
   */
  async execute(interaction) {
    if (!isBuildLabTeam(interaction.member)) {
      return interaction.reply({
        content: getPermissionDeniedMessage("BuildLab Team"),
        ephemeral: true,
      });
    }

    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
    }

    const filter = interaction.options.getString("filter") || "open";
    const tickets = listTickets({ filter, userId: interaction.user.id });

    const filterTitles = {
      open: "Active Support Tickets",
      unclaimed: "Unclaimed Support Tickets",
      mine: "My Assigned Support Tickets",
    };

    const embed = createBaseEmbed(
      `🎫 ${filterTitles[filter] || "Support Tickets"}`,
      `Found **${tickets.length}** ticket(s):`,
      COLORS.DEFAULT
    );

    if (tickets.length === 0) {
      embed.setDescription("No tickets matching this filter.");
      if (interaction.deferred) return interaction.editReply({ embeds: [embed] });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    for (const t of tickets.slice(0, 10)) {
      const num = formatTicketNumber(t.ticket_number);
      const mentorText = t.claimed_by ? `🧑‍🏫 <@${t.claimed_by}>` : "🟡 **Unclaimed**";
      const statusIcon = t.status === "OPEN" ? "🟡" : t.status === "IN_PROGRESS" ? "🔵" : "🟢";

      embed.addFields({
        name: `#${num} — ${t.category}`,
        value:
          `**Creator:** <@${t.creator_id}> • **Channel:** <#${t.channel_id}>\n` +
          `**Status:** ${statusIcon} ${t.status} • **Mentor:** ${mentorText}\n` +
          `*Opened <t:${Math.floor(new Date(t.created_at).getTime() / 1000)}:R>*`,
        inline: false,
      });
    }

    if (interaction.deferred) return interaction.editReply({ embeds: [embed] });
    if (interaction.replied) return interaction.followUp({ embeds: [embed], ephemeral: true });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
