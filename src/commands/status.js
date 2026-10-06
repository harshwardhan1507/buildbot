const { SlashCommandBuilder } = require("discord.js");
const { timeline, getTimeRemaining } = require("../config/events");
const { getDetailedOverview } = require("../services/teams");
const { calculateActivityHealth } = require("../services/github");
const db = require("../services/database");
const { createBaseEmbed, COLORS } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("status")
    .setDescription("View overall BuildLab ’26 program progress and countdown"),

  /**
   * @param {import("discord.js").ChatInputCommandInteraction} interaction 
   */
  async execute(interaction) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }
    const overview = getDetailedOverview();
    const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get().count;
    const pendingPrds = db
      .prepare("SELECT COUNT(*) as count FROM projects WHERE status = 'Pending'")
      .get().count;

    // Calculate GitHub health counts across connected repositories
    const connectedProjects = db
      .prepare("SELECT last_activity_at FROM projects WHERE repo_url IS NOT NULL")
      .all();

    let activeRepos = 0;
    let lowActivityRepos = 0;
    let noRecentRepos = 0;

    for (const p of connectedProjects) {
      const health = calculateActivityHealth(p.last_activity_at);
      if (health.status === "Active") activeRepos++;
      else if (health.status === "Low Activity") lowActivityRepos++;
      else noRecentRepos++;
    }

    // Health totals across all projects
    let totalOnTrack = 0;
    let totalAttention = 0;
    let totalAtRisk = 0;

    for (const data of Object.values(overview.tracks)) {
      totalOnTrack += data.onTrack;
      totalAttention += data.attention;
      totalAtRisk += data.atRisk;
    }

    const embed = createBaseEmbed(
      "🚀 TECHSPACE BUILDLAB ’26 — PROGRAM DASHBOARD",
      "Real-time overview of participants, PRD milestones, and engineering signals:",
      COLORS.DEFAULT
    ).addFields(
      {
        name: "PROGRAM STATUS",
        value:
          `👥 **Teams:** ${overview.totalTeams}\n` +
          `👤 **Participants:** ${userCount}\n` +
          `📋 **PRDs Approved:** ${overview.prdsApproved}`,
        inline: false,
      },
      {
        name: "━━━━━━━━━━━━━━━━━━━━━━\nPROJECT PROGRESS (Avg Milestone %)",
        value:
          `🔵 **Beginner:** ${overview.tracks["Beginner"]?.averageProgress || 0}%\n` +
          `🟣 **Intermediate:** ${overview.tracks["Intermediate"]?.averageProgress || 0}%\n` +
          `🔴 **Advanced:** ${overview.tracks["Advanced"]?.averageProgress || 0}%`,
        inline: false,
      },
      {
        name: "━━━━━━━━━━━━━━━━━━━━━━\nTEAM HEALTH",
        value:
          `🟢 **On Track:** ${totalOnTrack}\n` +
          `🟡 **Needs Attention:** ${totalAttention}\n` +
          `🔴 **At Risk:** ${totalAtRisk}`,
        inline: false,
      },
      {
        name: "━━━━━━━━━━━━━━━━━━━━━━\nSUBMISSIONS & STAGES",
        value:
          `📦 **Submitted:** ${overview.submitted}\n` +
          `🔨 **In Development:** ${overview.inDevelopment}\n` +
          `📋 **Pending PRD Review:** ${pendingPrds}`,
        inline: false,
      },
      {
        name: "━━━━━━━━━━━━━━━━━━━━━━\nGITHUB ACTIVITY SIGNALS",
        value:
          `🟢 **Active repositories:** ${activeRepos}\n` +
          `🟡 **Low activity:** ${lowActivityRepos}\n` +
          `🔴 **No recent activity:** ${noRecentRepos}`,
        inline: false,
      }
    );

    // Milestones countdown summary
    const countdowns = timeline
      .map((e) => {
        const remaining = getTimeRemaining(e.date);
        return remaining.past
          ? null
          : `• **${e.title}:** ⏰ ${remaining.formatted}`;
      })
      .filter(Boolean)
      .slice(0, 3);

    if (countdowns.length > 0) {
      embed.addFields({
        name: "━━━━━━━━━━━━━━━━━━━━━━\nUPCOMING DEADLINES",
        value: countdowns.join("\n"),
        inline: false,
      });
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
