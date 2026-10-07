const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require("discord.js");
const { getDetailedOverview, getTeamStatus } = require("../services/teams");
const { calculateProjectProgress } = require("../services/milestones");
const { calculateActivityHealth } = require("../services/github");
const { isBuildLabTeam, getPermissionDeniedMessage } = require("../utils/permissions");
const { createBaseEmbed, COLORS } = require("../utils/embeds");

const TRACK_ICONS = {
  Beginner: "🔵",
  Intermediate: "🟣",
  Advanced: "🔴",
};

const HEALTH_ICONS = {
  "On Track": "🟢",
  "Needs Attention": "🟡",
  "At Risk": "🔴",
  "Not Assessed": "⚪",
};

/**
 * Builds the comprehensive dashboard embed for a selected project
 * @param {object} project 
 * @returns {{ embed: import("discord.js").EmbedBuilder, components: import("discord.js").ActionRowBuilder[] }}
 */
function buildTeamProjectView(project) {
  const progress = calculateProjectProgress(project.id);
  const trackIcon = TRACK_ICONS[project.track] || "⚪";
  const healthIcon = HEALTH_ICONS[project.mentor_status] || "⚪";
  const githubHealth = calculateActivityHealth(project.last_activity_at);

  const embed = createBaseEmbed(
    `🛠️ ${project.title} (${project.id})`,
    `**Track:** ${trackIcon} **${project.track}** • **Format:** ${project.team_members || "Solo"}\n` +
      `**Lead / Owner:** <@${project.owner_id}>\n` +
      `**Assigned Mentor:** ${project.mentor_id ? `<@${project.mentor_id}>` : "*None assigned*"}\n\n` +
      `**PRD Proposal:** **${project.status}** • **Stage:** 🔨 **${project.stage}**\n` +
      `**Health Assessment:** ${healthIcon} **${project.mentor_status}**\n` +
      (project.mentor_status_note ? `> *Note:* ${project.mentor_status_note}\n\n` : "\n") +
      `📊 **Progress:** \`${progress.progressBar}\` (${progress.completed}/${progress.total} milestones)\n` +
      `🐙 **GitHub Health:** ${githubHealth.icon} **${githubHealth.status}**\n` +
      (project.repo_url ? `[${project.repo_url}](${project.repo_url})` : "*No repository linked*"),
    COLORS.DEFAULT
  );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`team_view_prd_${project.id}`)
      .setLabel("View PRD")
      .setEmoji("📋")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`team_health_btn_${project.id}`)
      .setLabel("Update Health")
      .setEmoji("🧑‍⚕️")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`team_mentor_btn_${project.id}`)
      .setLabel("Assign Mentor")
      .setEmoji("🧑‍🏫")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`team_progress_btn_${project.id}`)
      .setLabel("Update Progress")
      .setEmoji("📊")
      .setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("staff_dash_teams")
      .setLabel("All Teams")
      .setEmoji("👥")
      .setStyle(ButtonStyle.Secondary)
  );

  return { embed, components: [row1, row2] };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("teams")
    .setDescription("View and manage BuildLab teams (Team only)")
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
    )
    .addStringOption((opt) =>
      opt
        .setName("project_id")
        .setDescription("Directly open a specific project dashboard (e.g. BL-PRD-001)")
        .setRequired(false)
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

    const directProjectId = interaction.options.getString("project_id");
    if (directProjectId) {
      const project = getTeamStatus(directProjectId);
      if (!project) {
        return interaction.editReply({
          content: `❌ Could not find any project matching \`${directProjectId}\`.`,
        });
      }
      const { embed, components } = buildTeamProjectView(project);
      return interaction.editReply({ embeds: [embed], components });
    }

    const filterTrack = interaction.options.getString("track");
    const filterStatus = interaction.options.getString("status");

    const overview = getDetailedOverview({
      track: filterTrack,
      status: filterStatus,
    });

    const embed = createBaseEmbed(
      "👥 BUILDLAB TEAMS & PROJECTS",
      "Overview of teams across tracks with mentor health assessments:",
      COLORS.DEFAULT
    );

    for (const [trackName, data] of Object.entries(overview.tracks)) {
      if (filterTrack && trackName.toLowerCase() !== filterTrack.toLowerCase()) continue;

      const icon = TRACK_ICONS[trackName] || "⚪";
      const value =
        `**${data.teams}** teams • Average completion: **${data.averageProgress}%**\n` +
        `🟢 On Track: **${data.onTrack}** | 🟡 Attention: **${data.attention}** | 🔴 At Risk: **${data.atRisk}**`;

      embed.addFields({
        name: `${icon} ${trackName.toUpperCase()}`,
        value,
        inline: false,
      });
    }

    const components = [];

    // Select menu to open a team directly
    const projectsToList =
      overview.filteredProjects.length > 0 ? overview.filteredProjects : overview.projects || [];

    if (projectsToList.length > 0) {
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("teams_select_project")
        .setPlaceholder("Select a team to view and manage...");

      projectsToList.slice(0, 25).forEach((p) => {
        const icon = HEALTH_ICONS[p.mentor_status] || "⚪";
        selectMenu.addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel(`${p.title.slice(0, 50)} (${p.id})`)
            .setValue(p.id)
            .setDescription(`${p.track} | ${icon} ${p.mentor_status} | Stage: ${p.stage}`)
        );
      });

      components.push(new ActionRowBuilder().addComponents(selectMenu));
    }

    if (interaction.deferred) return interaction.editReply({ embeds: [embed], components });
    return interaction.reply({ embeds: [embed], components, ephemeral: true });
  },

  buildTeamProjectView,
};
