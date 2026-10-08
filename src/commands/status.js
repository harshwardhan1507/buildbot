const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { timeline, getTimeRemaining, getCurrentPhase } = require("../config/events");
const { getDetailedOverview } = require("../services/teams");
const { getPrdByOwnerId } = require("../services/prd");
const { calculateProjectProgress } = require("../services/milestones");
const { calculateActivityHealth } = require("../services/github");
const { isBuildLabTeam } = require("../utils/permissions");
const db = require("../services/database");
const { createBaseEmbed, COLORS } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("status")
    .setDescription("Check your BuildLab project status"),

  /**
   * @param {import("discord.js").ChatInputCommandInteraction} interaction 
   */
  async execute(interaction) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
    }

    const member = interaction.member;
    const isStaff = isBuildLabTeam(member);
    const phase = getCurrentPhase();

    // If participant, show their personalized, phase-oriented project status
    if (!isStaff) {
      const project = getPrdByOwnerId(interaction.user.id);

      const phaseFields = [
        { name: "CURRENT PHASE", value: `**${phase.currentPhase}**`, inline: true },
      ];
      if (phase.nextLabel && phase.nextValue) {
        phaseFields.push({ name: phase.nextLabel, value: `**${phase.nextValue}**`, inline: true });
      }

      if (!project) {
        const embed = createBaseEmbed(
          "🚀 BUILDLAB STATUS",
          "You haven't submitted a project proposal yet!\n\n" +
            "**Get started in 2 minutes:**\n" +
            "1. Run `/start` or click **Submit PRD** below.\n" +
            "2. Select your track (**Beginner**, **Intermediate**, or **Advanced**).\n" +
            "3. Your track role will be assigned automatically!",
          COLORS.DEFAULT
        ).addFields(phaseFields);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("start_submit_prd")
            .setLabel("Submit PRD")
            .setEmoji("📝")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId("start_get_help")
            .setLabel("Get Help")
            .setEmoji("🆘")
            .setStyle(ButtonStyle.Secondary)
        );

        if (interaction.deferred) return interaction.editReply({ embeds: [embed], components: [row] });
        return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
      }

      const progress = calculateProjectProgress(project.id);
      const prdStatusIcons = {
        Approved: "🟢 Approved",
        Pending: "🟡 Awaiting Review",
        "Changes Requested": "🟡 Changes Requested",
        Rejected: "🔴 Rejected",
      };

      const teamFormat = project.team_members || (project.track === "Beginner" ? "Solo" : "Team");
      const stageName = project.stage === "DEVELOPMENT" ? "Build" : (project.stage === "PRD_REVIEW" ? "Proposal Review" : project.stage);
      const projectTitle = project.problem_statement_id ? `${project.problem_statement_id} · ${project.title}` : project.title;

      let repoStatusSection = "⚪ Not assigned";
      if (project.status === "Approved") {
        if (project.repo_status === "READY_TO_BUILD" && project.repo_url) {
          repoStatusSection = `🟢 Ready\n[${project.repo_name || project.repo_url}](${project.repo_url})`;
        } else if (project.repo_status === "PENDING_ASSIGNMENT") {
          repoStatusSection = "🟡 Being assigned";
        } else if (project.repo_url) {
          repoStatusSection = `🟢 Ready\n[${project.repo_name || project.repo_url}](${project.repo_url})`;
        } else {
          repoStatusSection = "🟡 Being assigned";
        }
      } else if (project.repo_url) {
        repoStatusSection = `🟡 Pending approval\n[${project.repo_url}](${project.repo_url})`;
      }

      const embed = createBaseEmbed(
        "YOUR BUILDLAB STATUS",
        `**YOUR PROJECT**\n${projectTitle}\n\n` +
          `**TRACK**\n${project.track} · ${teamFormat}\n\n` +
          `**PRD**\n${prdStatusIcons[project.status] || project.status}\n\n` +
          `**REPOSITORY**\n${repoStatusSection}\n\n` +
          `**PROGRESS**\n${progress.percentage}%\n\n` +
          `**CURRENT STAGE**\n${stageName}`,
        project.status === "Approved" ? COLORS.SUCCESS : COLORS.DEFAULT
      ).addFields(phaseFields);

      const row = new ActionRowBuilder();
      if (project.status === "Approved" && project.repo_status === "READY_TO_BUILD" && project.repo_url) {
        row.addComponents(
          new ButtonBuilder()
            .setLabel("Open Repository ↗")
            .setStyle(ButtonStyle.Link)
            .setURL(project.repo_url)
        );
      }
      row.addComponents(
        new ButtonBuilder()
          .setCustomId("prd_view_own")
          .setLabel("View PRD")
          .setEmoji("👁️")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("ticket_open_direct")
          .setLabel("Ask for Help")
          .setEmoji("🎫")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("start_get_help")
          .setLabel("Guides")
          .setEmoji("❓")
          .setStyle(ButtonStyle.Secondary)
      );

      if (interaction.deferred) return interaction.editReply({ embeds: [embed], components: [row] });
      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    // If staff/admin, display the complete program overview
    const overview = getDetailedOverview();
    const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get().count;
    const pendingPrds = db
      .prepare("SELECT COUNT(*) as count FROM projects WHERE status = 'Pending'")
      .get().count;

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
      "Real-time overview of participants, proposals, and engineering signals:",
      COLORS.DEFAULT
    ).addFields(
      {
        name: "PROGRAM STATUS",
        value:
          `📌 **Current Phase:** ${phase.currentPhase}` +
          (phase.nextLabel ? ` | **${phase.nextLabel}:** ${phase.nextValue}\n` : "\n") +
          `👥 **Teams:** ${overview.totalTeams}\n` +
          `👤 **Participants:** ${userCount}\n` +
          `📋 **PRDs Approved:** ${overview.prdsApproved} | **Pending:** ${pendingPrds}`,
        inline: false,
      },
      {
        name: "TRACK COMPLETION AVERAGE",
        value:
          `🔵 **Beginner:** ${overview.tracks["Beginner"]?.averageProgress || 0}%\n` +
          `🟣 **Intermediate:** ${overview.tracks["Intermediate"]?.averageProgress || 0}%\n` +
          `🔴 **Advanced:** ${overview.tracks["Advanced"]?.averageProgress || 0}%`,
        inline: true,
      },
      {
        name: "TEAM HEALTH",
        value:
          `🟢 **On Track:** ${totalOnTrack}\n` +
          `🟡 **Needs Attention:** ${totalAttention}\n` +
          `🔴 **At Risk:** ${totalAtRisk}`,
        inline: true,
      },
      {
        name: "GITHUB REPOSITORY SIGNALS",
        value:
          `🟢 Active: **${activeRepos}** | 🟡 Low: **${lowActivityRepos}** | 🔴 Inactive: **${noRecentRepos}**`,
        inline: false,
      }
    );

    const countdowns = timeline
      .map((e) => {
        const remaining = getTimeRemaining(e.date);
        return remaining.past ? null : `• **${e.title}:** ⏰ ${remaining.formatted}`;
      })
      .filter(Boolean);

    if (countdowns.length > 0) {
      embed.addFields({
        name: "UPCOMING DEADLINES & MILESTONES",
        value: countdowns.join("\n"),
        inline: false,
      });
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("staff_dash_prd")
        .setLabel("PRD Review Queue")
        .setEmoji("📋")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("staff_dash_tickets")
        .setLabel("Support Tickets")
        .setEmoji("🎫")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("staff_dash_teams")
        .setLabel("All Teams")
        .setEmoji("👥")
        .setStyle(ButtonStyle.Secondary)
    );

    if (interaction.deferred) return interaction.editReply({ embeds: [embed], components: [row] });
    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  },
};
