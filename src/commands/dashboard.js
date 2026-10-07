const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { getDetailedOverview, getTeamsByMentor } = require("../services/teams");
const { getPendingPrds } = require("../services/prd");
const { listTickets } = require("../services/tickets");
const { isBuildLabTeam, getPermissionDeniedMessage } = require("../utils/permissions");
const { createBaseEmbed, COLORS } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dashboard")
    .setDescription("Open the BuildLab staff operations dashboard (Team only)"),

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

    const pendingPrds = getPendingPrds();
    const openTickets = listTickets({ filter: "open" });
    const unclaimedTickets = listTickets({ filter: "unclaimed" });
    const myTeams = getTeamsByMentor(interaction.user.id);
    const overview = getDetailedOverview();

    let totalOnTrack = 0;
    let totalAttention = 0;
    let totalAtRisk = 0;

    for (const data of Object.values(overview.tracks)) {
      totalOnTrack += data.onTrack;
      totalAttention += data.attention;
      totalAtRisk += data.atRisk;
    }

    const embed = createBaseEmbed(
      "🛠️ BUILDLAB STAFF OPERATIONS DASHBOARD",
      "Central command panel for mentors, organizers, and coordinators:\n\n" +
        `📋 **Pending PRDs:** **${pendingPrds.length}** submissions awaiting review\n` +
        `🎫 **Support Tickets:** **${openTickets.length}** active (**${unclaimedTickets.length}** unclaimed)\n` +
        `🧑‍🏫 **My Mentored Teams:** **${myTeams.length}** projects assigned to you\n` +
        `👥 **Total Teams:** **${overview.totalTeams}** (🟢 ${totalOnTrack} | 🟡 ${totalAttention} | 🔴 ${totalAtRisk})`,
      COLORS.DEFAULT
    );

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("staff_dash_prd")
        .setLabel(`PRD Queue (${pendingPrds.length})`)
        .setEmoji("📋")
        .setStyle(pendingPrds.length > 0 ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("staff_dash_tickets")
        .setLabel(`Tickets (${openTickets.length})`)
        .setEmoji("🎫")
        .setStyle(unclaimedTickets.length > 0 ? ButtonStyle.Danger : ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("staff_dash_my_teams")
        .setLabel(`My Teams (${myTeams.length})`)
        .setEmoji("🧑‍🏫")
        .setStyle(ButtonStyle.Success)
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("staff_dash_teams")
        .setLabel("Browse All Teams")
        .setEmoji("👥")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("status_view_program")
        .setLabel("Program Stats")
        .setEmoji("📊")
        .setStyle(ButtonStyle.Secondary)
    );

    if (interaction.deferred) {
      return interaction.editReply({ embeds: [embed], components: [row1, row2] });
    }
    return interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: true });
  },
};
