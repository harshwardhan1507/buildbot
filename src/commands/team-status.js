const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { getTeamStatus, canUserViewProject, getProjectSignals } = require("../services/teams");
const { getProjectMilestones, calculateProjectProgress, STATUS_ICONS } = require("../services/milestones");
const { getRepoStats, calculateActivityHealth } = require("../services/github");
const { getPrdByOwnerId } = require("../services/prd");
const { createBaseEmbed, createErrorEmbed, COLORS } = require("../utils/embeds");

const TRACK_ICONS = {
  Beginner: "🔵",
  Intermediate: "🟣",
  Advanced: "🔴",
};

const MENTOR_STATUS_ICONS = {
  "On Track": "🟢",
  "Needs Attention": "🟡",
  "At Risk": "🔴",
  "Not Assessed": "⚪",
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("team-status")
    .setDescription("View comprehensive real-time dashboard for a BuildLab project")
    .addStringOption((opt) =>
      opt
        .setName("query")
        .setDescription("Project ID (e.g. BL-PRD-001) or title (leave empty for your own)")
        .setRequired(false)
    ),

  /**
   * @param {import("discord.js").ChatInputCommandInteraction} interaction 
   */
  async execute(interaction) {
    const query = interaction.options.getString("query");

    let project = null;
    if (query) {
      project = getTeamStatus(query);
    } else {
      project = getPrdByOwnerId(interaction.user.id);
    }

    if (!project) {
      const errEmbed = createErrorEmbed(
        "Project Not Found",
        query
          ? `Could not find any project matching \`${query}\`.`
          : "You haven't submitted a project yet. Use `/prd submit` to get started."
      );
      return interaction.reply({ embeds: [errEmbed], ephemeral: true });
    }

    // Privacy & permission check
    if (!canUserViewProject(interaction.member, project)) {
      return interaction.reply({
        content: "🔒 **Private Dashboard:** You do not have permission to view detailed project data for this team.",
        ephemeral: true,
      });
    }

    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }

    const embed = buildTeamStatusEmbed(project);
    const buttonsRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`team_view_milestones_${project.id}`)
        .setLabel("Milestones")
        .setEmoji("📋")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`team_view_github_${project.id}`)
        .setLabel("GitHub")
        .setEmoji("🐙")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`team_view_mentor_${project.id}`)
        .setLabel("Mentor")
        .setEmoji("🧑‍🏫")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`team_view_team_${project.id}`)
        .setLabel("Team")
        .setEmoji("👥")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`team_view_activity_${project.id}`)
        .setLabel("Signals")
        .setEmoji("📈")
        .setStyle(ButtonStyle.Secondary)
    );

    if (interaction.deferred) {
      return interaction.editReply({ embeds: [embed], components: [buttonsRow] });
    }
    if (interaction.replied) {
      return interaction.followUp({ embeds: [embed], components: [buttonsRow] });
    }
    return interaction.reply({ embeds: [embed], components: [buttonsRow] });
  },

  /**
   * Handles interactive buttons for detailed focused views
   * @param {import("discord.js").ButtonInteraction} interaction 
   */
  async handleButton(interaction) {
    const customId = interaction.customId;
    const parts = customId.split("_");
    const action = parts[2]; // milestones, github, mentor, team, activity
    const projectId = parts.slice(3).join("_");

    const project = getTeamStatus(projectId);
    if (!project || !canUserViewProject(interaction.member, project)) {
      if (!interaction.deferred && !interaction.replied) {
        return interaction.reply({
          content: "❌ You don't have permission to inspect this project.",
          ephemeral: true,
        });
      }
      return interaction.editReply({
        content: "❌ You don't have permission to inspect this project.",
      });
    }

    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
    }

    const respond = (payload) => {
      if (interaction.deferred) {
        return interaction.editReply(payload);
      }
      if (interaction.replied) {
        return interaction.followUp({ ...payload, ephemeral: true });
      }
      return interaction.reply({ ...payload, ephemeral: true });
    };

    if (action === "milestones") {
      const milestones = getProjectMilestones(project.id);
      const progress = calculateProjectProgress(project.id);
      const embed = createBaseEmbed(`📋 ${project.title} — Milestones`, "", COLORS.DEFAULT)
        .setDescription(
          `**Progress:** \`${progress.progressBar}\` (${progress.completed}/${progress.total} completed)\n` +
            `**Stage:** 🔨 **${project.stage}**\n\n` +
            milestones
              .map(
                (m) =>
                  `**${m.milestone_index}.** ${STATUS_ICONS[m.status] || "⬜"} **${m.title}** (${m.status})`
              )
              .join("\n")
        );
      return respond({ embeds: [embed] });
    }

    if (action === "github") {
      const stats = getRepoStats(project.repo_url);
      const health = calculateActivityHealth(project.last_activity_at);
      const embed = createBaseEmbed(`🐙 ${project.title} — GitHub Activity`, "", COLORS.DEFAULT).addFields(
        { name: "Repository", value: project.repo_url ? `[Link](${project.repo_url})` : "Not connected", inline: false },
        { name: "Activity Health", value: `${health.icon} **${health.status}**`, inline: true },
        { name: "Commits (7d)", value: `${stats?.commits_last_7_days || 0}`, inline: true },
        { name: "Open PRs", value: `${stats?.open_prs || 0}`, inline: true },
        { name: "Merged PRs", value: `${stats?.merged_prs || 0}`, inline: true },
        { name: "Open Issues", value: `${stats?.open_issues || 0}`, inline: true },
        { name: "Closed Issues", value: `${stats?.closed_issues || 0}`, inline: true }
      );
      return respond({ embeds: [embed] });
    }

    if (action === "mentor") {
      const icon = MENTOR_STATUS_ICONS[project.mentor_status] || "⚪";
      const mentorDisplay = project.mentor_id ? `<@${project.mentor_id}>` : "Unassigned";
      const reviewTime = project.mentor_status_updated_at
        ? `<t:${Math.floor(new Date(project.mentor_status_updated_at).getTime() / 1000)}:R>`
        : "No assessment recorded yet";

      const embed = createBaseEmbed(`🧑‍🏫 ${project.title} — Mentor Evaluation`, "", COLORS.DEFAULT).addFields(
        { name: "Assigned Mentor", value: mentorDisplay, inline: true },
        { name: "Human Assessment", value: `${icon} **${project.mentor_status}**`, inline: true },
        { name: "Last Review", value: reviewTime, inline: true },
        { name: "Review Notes", value: project.mentor_status_note || "No specific notes provided.", inline: false }
      );
      return respond({ embeds: [embed] });
    }

    if (action === "team") {
      const embed = createBaseEmbed(`👥 ${project.title} — Team Members`, "", COLORS.DEFAULT).addFields(
        { name: "Project Owner", value: `<@${project.owner_id}>`, inline: true },
        { name: "Track", value: project.track, inline: true },
        { name: "Team Members", value: project.team_members || "Single builder", inline: false }
      );
      return respond({ embeds: [embed] });
    }

    if (action === "activity") {
      const signals = getProjectSignals(project);
      const embed = createBaseEmbed(`📈 ${project.title} — Signals & Activity`, "", COLORS.DEFAULT);
      if (signals.length > 0) {
        embed.setDescription(`**Attention Signals:**\n• ${signals.join("\n• ")}`);
      } else {
        embed.setDescription("🟢 All automated signals look healthy. No blocking warnings detected.");
      }
      return respond({ embeds: [embed] });
    }
  },
};

/**
 * Builds the comprehensive dashboard embed
 * @param {object} project 
 * @returns {import("discord.js").EmbedBuilder}
 */
function buildTeamStatusEmbed(project) {
  const trackIcon = TRACK_ICONS[project.track] || "⚪";
  const mentorIcon = MENTOR_STATUS_ICONS[project.mentor_status] || "⚪";

  const progress = calculateProjectProgress(project.id);
  const milestones = getProjectMilestones(project.id);
  const stats = getRepoStats(project.repo_url);
  const health = calculateActivityHealth(project.last_activity_at);
  const signals = getProjectSignals(project);

  let memberCount = 1;
  if (project.team_members) {
    const mentions = (project.team_members.match(/@/g) || []).length;
    const commas = (project.team_members.match(/,/g) || []).length;
    memberCount = Math.max(1, mentions, commas + 1);
  }

  const mentorDisplay = project.mentor_id ? `<@${project.mentor_id}>` : "Unassigned";
  const repoStatus = project.repo_url ? `🟢 Connected ([Link](${project.repo_url}))` : "⚪ Not connected";

  // Milestones list (up to 5)
  let milestonesPreview = "*No milestones recorded.*";
  if (milestones.length > 0) {
    milestonesPreview = milestones
      .slice(0, 5)
      .map((m) => `${STATUS_ICONS[m.status] || "⬜"} ${m.title}`)
      .join("\n");
  }

  // GitHub activity text
  const lastActiveText = project.last_activity_at
    ? `<t:${Math.floor(new Date(project.last_activity_at).getTime() / 1000)}:R>`
    : "No activity recorded";

  const githubPreview =
    `Commits (last 7d): **${stats?.commits_last_7_days || 0}** • Open PRs: **${stats?.open_prs || 0}**\n` +
    `Merged PRs: **${stats?.merged_prs || 0}** • Closed Issues: **${stats?.closed_issues || 0}**\n` +
    `Last Activity: ${lastActiveText}\n` +
    `Activity Health: ${health.icon} **${health.status}**`;

  const mentorPreview =
    `${mentorIcon} **${project.mentor_status}**\n` +
    `*${project.mentor_status_note || "No review notes."}*`;

  const embed = createBaseEmbed(
    `📊 BUILDLAB TEAM STATUS — ${project.title}`,
    `**Track:** ${trackIcon} **${project.track}** • **PRD ID:** \`${project.id}\`\n` +
      `**Team:** ${memberCount} member(s) • **Mentor:** ${mentorDisplay}\n` +
      `**PRD:** ${project.status === "Approved" ? "🟢 Approved" : "🟡 " + project.status} • **Repo:** ${repoStatus}`,
    COLORS.DEFAULT
  ).addFields(
    {
      name: "━━━━━━━━━━━━━━━━━━━━━━\nPROJECT PROGRESS",
      value: `\`${progress.progressBar}\`\n**${progress.completed} / ${progress.total}** milestones completed\n**Current Stage:** 🔨 **${project.stage}**`,
      inline: false,
    },
    {
      name: "━━━━━━━━━━━━━━━━━━━━━━\nMILESTONES",
      value: milestonesPreview,
      inline: false,
    },
    {
      name: "━━━━━━━━━━━━━━━━━━━━━━\nGITHUB ACTIVITY",
      value: githubPreview,
      inline: false,
    },
    {
      name: "━━━━━━━━━━━━━━━━━━━━━━\nMENTOR STATUS",
      value: mentorPreview,
      inline: false,
    }
  );

  if (signals.length > 0) {
    embed.addFields({
      name: "━━━━━━━━━━━━━━━━━━━━━━\n⚠️ ATTENTION SIGNALS",
      value: signals.map((s) => `• ${s}`).join("\n"),
      inline: false,
    });
  }

  return embed;
}
