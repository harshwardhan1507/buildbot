const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require("discord.js");
const { listTickets, formatTicketNumber } = require("../services/tickets");
const { isBuildLabTeam, getPermissionDeniedMessage } = require("../utils/permissions");
const { createBaseEmbed, COLORS } = require("../utils/embeds");

/**
 * Builds the interactive tickets queue embed and components
 * @param {'open'|'unclaimed'|'mine'} filter 
 * @param {string} userId 
 * @returns {{ embed: import("discord.js").EmbedBuilder, components: import("discord.js").ActionRowBuilder[] }}
 */
function buildTicketQueueView(filter = "open", userId) {
  const tickets = listTickets({ filter, userId });
  const openCount = listTickets({ filter: "open" }).length;
  const unclaimedCount = listTickets({ filter: "unclaimed" }).length;
  const myCount = listTickets({ filter: "mine", userId }).length;

  const titles = {
    open: "🟡 All Active Tickets",
    unclaimed: "🔴 Unclaimed Tickets",
    mine: "🧑‍🏫 Assigned to Me",
  };

  const embed = createBaseEmbed(
    `🎫 SUPPORT TICKET QUEUE — ${titles[filter] || "Tickets"}`,
    `**Queue Summary:** 🔴 **${unclaimedCount}** Unclaimed • 🟡 **${openCount}** Active • 🧑‍🏫 **${myCount}** Assigned to you\n\n` +
      (tickets.length === 0
        ? "*No tickets matching this filter.*"
        : `Showing **${Math.min(tickets.length, 10)}** ticket(s):`),
    filter === "unclaimed" ? COLORS.DANGER : COLORS.DEFAULT
  );

  for (const t of tickets.slice(0, 10)) {
    const num = formatTicketNumber(t.ticket_number);
    const mentorText = t.claimed_by ? `<@${t.claimed_by}>` : "🔴 **Unclaimed**";
    const statusIcon = t.status === "OPEN" ? "🟡 Open" : "🔵 In Progress";

    embed.addFields({
      name: `#${num} — ${t.category}`,
      value:
        `**Creator:** <@${t.creator_id}> • **Channel:** <#${t.channel_id}>\n` +
        `**Status:** ${statusIcon} • **Mentor:** ${mentorText}\n` +
        `*Created <t:${Math.floor(new Date(t.created_at).getTime() / 1000)}:R>*`,
      inline: false,
    });
  }

  // Row 1: Filter buttons
  const buttonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("tickets_filter_unclaimed")
      .setLabel(`Unclaimed (${unclaimedCount})`)
      .setEmoji("🔴")
      .setStyle(filter === "unclaimed" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("tickets_filter_mine")
      .setLabel(`Assigned to Me (${myCount})`)
      .setEmoji("🧑‍🏫")
      .setStyle(filter === "mine" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("tickets_filter_open")
      .setLabel(`All Open (${openCount})`)
      .setEmoji("🟡")
      .setStyle(filter === "open" ? ButtonStyle.Primary : ButtonStyle.Secondary)
  );

  const rows = [buttonRow];

  // Row 2: Select menu to quickly act on a ticket
  if (tickets.length > 0) {
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("select_ticket_action")
      .setPlaceholder("Select a ticket to claim or manage...");

    tickets.slice(0, 15).forEach((t) => {
      const num = formatTicketNumber(t.ticket_number);
      selectMenu.addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(`#${num} - ${t.category}`)
          .setValue(String(t.ticket_number))
          .setDescription(t.claimed_by ? `Assigned to mentor` : `Unclaimed! Click to act`)
      );
    });

    rows.push(new ActionRowBuilder().addComponents(selectMenu));
  }

  return { embed, components: rows };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("tickets")
    .setDescription("Manage participant support tickets (Team only)")
    .addStringOption((opt) =>
      opt
        .setName("filter")
        .setDescription("Filter tickets")
        .setRequired(false)
        .addChoices(
          { name: "🟡 All Open", value: "open" },
          { name: "🔴 Unclaimed", value: "unclaimed" },
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
    const { embed, components } = buildTicketQueueView(filter, interaction.user.id);

    if (interaction.deferred) return interaction.editReply({ embeds: [embed], components });
    return interaction.reply({ embeds: [embed], components, ephemeral: true });
  },

  buildTicketQueueView,
};
