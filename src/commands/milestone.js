const { SlashCommandBuilder } = require("discord.js");
const {
  getProjectMilestones,
  getMilestoneByIndex,
  updateMilestoneStatus,
  calculateProjectProgress,
  STATUS_ICONS,
} = require("../services/milestones");
const { getPrdById, getPrdByOwnerId } = require("../services/prd");
const { canUserModifyMilestones } = require("../services/teams");
const { createBaseEmbed, createSuccessEmbed, createErrorEmbed, COLORS } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("milestone")
    .setDescription("View and update your project PRD milestones")
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("List all milestones and current progress for a project")
        .addStringOption((opt) =>
          opt
            .setName("project_id")
            .setDescription("Project ID (e.g. BL-PRD-001) or leave empty for your own")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("update")
        .setDescription("Update a milestone's status")
        .addIntegerOption((opt) =>
          opt
            .setName("index")
            .setDescription("Milestone number (e.g. 1, 2, 3)")
            .setRequired(true)
            .setMinValue(1)
        )
        .addStringOption((opt) =>
          opt
            .setName("status")
            .setDescription("Milestone status")
            .setRequired(true)
            .addChoices(
              { name: "⬜ Not Started", value: "Not Started" },
              { name: "🔄 In Progress", value: "In Progress" },
              { name: "✅ Completed", value: "Completed" },
              { name: "⚠️ Blocked", value: "Blocked" }
            )
        )
        .addStringOption((opt) =>
          opt
            .setName("project_id")
            .setDescription("Project ID (e.g. BL-PRD-001) or leave empty for your own")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("complete")
        .setDescription("Quickly mark a milestone as Completed")
        .addIntegerOption((opt) =>
          opt
            .setName("index")
            .setDescription("Milestone number (e.g. 1, 2, 3)")
            .setRequired(true)
            .setMinValue(1)
        )
        .addStringOption((opt) =>
          opt
            .setName("project_id")
            .setDescription("Project ID (e.g. BL-PRD-001) or leave empty for your own")
            .setRequired(false)
        )
    ),

  /**
   * @param {import("discord.js").ChatInputCommandInteraction} interaction 
   */
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const queryId = interaction.options.getString("project_id");

    let project = null;
    if (queryId) {
      project = getPrdById(queryId);
    } else {
      project = getPrdByOwnerId(interaction.user.id);
    }

    if (!project) {
      const err = createErrorEmbed(
        "Project Not Found",
        queryId
          ? `No project found with ID \`${queryId}\`.`
          : "You haven't submitted a project PRD yet. Use `/prd submit` to get started."
      );
      return interaction.reply({ embeds: [err], ephemeral: true });
    }

    // Permission check
    if (!canUserModifyMilestones(interaction.member, project)) {
      return interaction.reply({
        content: "❌ You don't have permission to view or manage milestones for this project.",
        ephemeral: true,
      });
    }

    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }

    const respond = (payload) => {
      if (interaction.deferred) {
        return interaction.editReply(payload);
      }
      if (interaction.replied) {
        return interaction.followUp(payload);
      }
      return interaction.reply(payload);
    };

    // ----------------------------------------------------
    // SUBCOMMAND: list
    // ----------------------------------------------------
    if (subcommand === "list") {
      const milestones = getProjectMilestones(project.id);
      const progress = calculateProjectProgress(project.id);

      const embed = createBaseEmbed(
        `📋 ${project.title} — Milestones`,
        `**Project ID:** \`${project.id}\` • **Track:** ${project.track}\n\n` +
          `**Progress:** \`${progress.progressBar}\`\n` +
          `**Completed:** ${progress.completed} / ${progress.total} milestones\n` +
          `**Stage:** 🔨 **${project.stage}**`,
        COLORS.DEFAULT
      );

      if (milestones.length === 0) {
        embed.addFields({
          name: "Milestones",
          value: "*No milestones initialized yet. Milestones are created automatically upon PRD approval.*",
        });
      } else {
        const lines = milestones.map((m) => {
          const icon = STATUS_ICONS[m.status] || "⬜";
          const doneTag = m.completed_at
            ? ` *(Completed <t:${Math.floor(new Date(m.completed_at).getTime() / 1000)}:R>)*`
            : "";
          return `**${m.milestone_index}.** ${icon} **${m.title}** — *${m.status}*${doneTag}`;
        });

        embed.addFields({
          name: "Milestones Breakdown",
          value: lines.join("\n"),
        });
      }

      return respond({ embeds: [embed] });
    }

    // ----------------------------------------------------
    // SUBCOMMAND: update
    // ----------------------------------------------------
    if (subcommand === "update") {
      const index = interaction.options.getInteger("index");
      const newStatus = interaction.options.getString("status");

      const existingMilestone = getMilestoneByIndex(project.id, index);
      if (!existingMilestone) {
        return respond({
          embeds: [
            createErrorEmbed(
              "Invalid Milestone",
              `Milestone #${index} does not exist for project **${project.title}**.`
            ),
          ],
        });
      }

      const updated = updateMilestoneStatus(project.id, index, newStatus);
      const progress = calculateProjectProgress(project.id);
      const icon = STATUS_ICONS[newStatus] || "⬜";

      const embed = createSuccessEmbed(
        "Milestone Updated",
        `**Project:** ${project.title} (\`${project.id}\`)\n` +
          `**Milestone #${index}:** ${icon} **${updated.title}**\n` +
          `**New Status:** ${newStatus}\n\n` +
          `📊 **New Progress:** \`${progress.progressBar}\` (${progress.completed}/${progress.total} completed)`
      );

      return respond({ embeds: [embed] });
    }

    // ----------------------------------------------------
    // SUBCOMMAND: complete
    // ----------------------------------------------------
    if (subcommand === "complete") {
      const index = interaction.options.getInteger("index");

      const existingMilestone = getMilestoneByIndex(project.id, index);
      if (!existingMilestone) {
        return respond({
          embeds: [
            createErrorEmbed(
              "Invalid Milestone",
              `Milestone #${index} does not exist for project **${project.title}**.`
            ),
          ],
        });
      }

      const updated = updateMilestoneStatus(project.id, index, "Completed");
      const progress = calculateProjectProgress(project.id);

      const embed = createSuccessEmbed(
        "Milestone Completed! 🎉",
        `**Project:** ${project.title} (\`${project.id}\`)\n` +
          `**Milestone #${index}:** ✅ **${updated.title}**\n\n` +
          `📊 **Project Progress:** \`${progress.progressBar}\` (${progress.completed}/${progress.total} completed)`
      );

      return respond({ embeds: [embed] });
    }
  },
};
