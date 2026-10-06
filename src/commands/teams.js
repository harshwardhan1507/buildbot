const { SlashCommandBuilder } = require("discord.js");
const { getDetailedOverview } = require("../services/teams");
const { isBuildLabTeam, getPermissionDeniedMessage } = require("../utils/permissions");
const { createBaseEmbed, COLORS } = require("../utils/embeds");

const TRACK_ICONS = {
  Beginner: "🔵",
  Intermediate: "🟣",
  Advanced: "🔴",
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("teams")
    .setDescription("View BuildLab project overview & track health (Team only)")
    .addStringOption((opt) =>
      opt
        .setName("track")
        .setDescription("Filter by track")
        .setRequired(false)
        .addChoices(
          { name: "🔵 Beginner", value: "beginner" },
          { name: "🟣 Intermediate", value: "intermediate" },
          { name: "🔴 Advanced", value: "advanced" }
        )
    )
    .addStringOption((opt) =>
      opt
        .setName("status")
        .setDescription("Filter by mentor health status")
        .setRequired(false)
        .addChoices(
          { name: "🔴 At Risk", value: "at-risk" },
          { name: "🟡 Needs Attention", value: "attention" },
          { name: "🟢 On Track", value: "on-track" }
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
      await interaction.deferReply();
    }

    const filterTrack = interaction.options.getString("track");
    const filterStatus = interaction.options.getString("status");

    const overview = getDetailedOverview({
      track: filterTrack,
      status: filterStatus,
    });

    const embed = createBaseEmbed(
      "🚀 BUILDLAB PROJECT OVERVIEW",
      "Real-time program breakdown by PRD milestones and mentor assessment:",
      COLORS.DEFAULT
    );

    // Display each track
    for (const [trackName, data] of Object.entries(overview.tracks)) {
      if (filterTrack && trackName.toLowerCase() !== filterTrack.toLowerCase()) {
        continue;
      }

      const icon = TRACK_ICONS[trackName] || "⚪";
      const value =
        `**${data.teams}** teams\n` +
        `🟢 On Track: **${data.onTrack}** | 🟡 Attention: **${data.attention}** | 🔴 At Risk: **${data.atRisk}**\n` +
        `Average milestone completion: **${data.averageProgress}%**`;

      embed.addFields({
        name: `━━━━━━━━━━━━━━━━━━━━━━\n${icon} ${trackName.toUpperCase()}`,
        value,
        inline: false,
      });
    }

    // Totals
    embed.addFields({
      name: "━━━━━━━━━━━━━━━━━━━━━━\nTOTAL SUMMARY",
      value:
        `👥 **Teams:** ${overview.totalTeams}\n` +
        `🟢 **PRDs Approved:** ${overview.prdsApproved}\n` +
        `🔨 **In Development:** ${overview.inDevelopment}\n` +
        `📦 **Submitted:** ${overview.submitted}`,
      inline: false,
    });

    // If filtering by specific projects, list matching projects
    if (filterStatus || filterTrack) {
      if (overview.filteredProjects.length === 0) {
        embed.addFields({
          name: "Filtered Results",
          value: "*No projects matched the selected filters.*",
        });
      } else {
        const projectList = overview.filteredProjects
          .slice(0, 10)
          .map(
            (p) =>
              `• \`${p.id}\` **${p.title}** (${p.track}) — **${p.mentor_status}** (${p.stage})`
          )
          .join("\n");

        embed.addFields({
          name: `Matching Projects (${overview.filteredProjects.length})`,
          value: projectList,
          inline: false,
        });
      }
    }

    if (interaction.deferred) {
      return interaction.editReply({ embeds: [embed] });
    }
    if (interaction.replied) {
      return interaction.followUp({ embeds: [embed] });
    }
    return interaction.reply({ embeds: [embed] });
  },
};
