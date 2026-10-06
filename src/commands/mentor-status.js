const { SlashCommandBuilder } = require("discord.js");
const { getPrdById, setMentorStatus } = require("../services/prd");
const { isBuildLabTeam } = require("../utils/permissions");
const { createSuccessEmbed, createErrorEmbed } = require("../utils/embeds");

const STATUS_MAP = {
  "on-track": "On Track",
  "needs-attention": "Needs Attention",
  "at-risk": "At Risk",
};

const STATUS_ICONS = {
  "On Track": "🟢",
  "Needs Attention": "🟡",
  "At Risk": "🔴",
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("mentor-status")
    .setDescription("Assess and update project health status (Mentors/Team only)")
    .addStringOption((opt) =>
      opt
        .setName("project_id")
        .setDescription("Project ID (e.g. BL-PRD-001)")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("status")
        .setDescription("Human assessment status")
        .setRequired(true)
        .addChoices(
          { name: "🟢 On Track", value: "on-track" },
          { name: "🟡 Needs Attention", value: "needs-attention" },
          { name: "🔴 At Risk", value: "at-risk" }
        )
    )
    .addStringOption((opt) =>
      opt
        .setName("note")
        .setDescription("Mentor evaluation note or reasoning")
        .setRequired(false)
    ),

  /**
   * @param {import("discord.js").ChatInputCommandInteraction} interaction 
   */
  async execute(interaction) {
    const projectId = interaction.options.getString("project_id");
    const statusKey = interaction.options.getString("status");
    const note = interaction.options.getString("note") || "Standard mentor checkpoint assessment";

    const project = getPrdById(projectId);
    if (!project) {
      return interaction.reply({
        embeds: [createErrorEmbed("Project Not Found", `No project found with ID \`${projectId}\`.`)],
        ephemeral: true,
      });
    }

    // Permission check: assigned mentor, BuildLab Team, or TechSpace Admin
    const isMentor = project.mentor_id === interaction.user.id;
    const isTeam = isBuildLabTeam(interaction.member);

    if (!isMentor && !isTeam) {
      return interaction.reply({
        content: "❌ You must be the assigned mentor or a BuildLab Team member to update mentor status.",
        ephemeral: true,
      });
    }

    const formalStatus = STATUS_MAP[statusKey] || "On Track";

    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }

    const updated = setMentorStatus(projectId, interaction.user.id, formalStatus, note);
    const icon = STATUS_ICONS[formalStatus] || "⚪";

    const embed = createSuccessEmbed(
      "Mentor Status Updated",
      `**Project:** ${updated.title} (\`${updated.id}\`)\n` +
        `**Mentor Status:** ${icon} **${formalStatus}**\n` +
        `**Evaluated by:** <@${interaction.user.id}>\n\n` +
        `**Assessment Note:**\n${note}`
    );

    if (interaction.deferred) return interaction.editReply({ embeds: [embed] });
    if (interaction.replied) return interaction.followUp({ embeds: [embed] });
    return interaction.reply({ embeds: [embed] });
  },
};
