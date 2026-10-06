const { SlashCommandBuilder } = require("discord.js");
const { getPrdById } = require("../services/prd");
const { connectProjectRepo } = require("../services/github");
const { isBuildLabTeam, getPermissionDeniedMessage } = require("../utils/permissions");
const { createSuccessEmbed, createErrorEmbed } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("project")
    .setDescription("Project administration and GitHub connections")
    .addSubcommand((sub) =>
      sub
        .setName("connect-repo")
        .setDescription("Connect a GitHub repository to a project (Team only)")
        .addStringOption((opt) =>
          opt
            .setName("project_id")
            .setDescription("Project ID (e.g. BL-PRD-001)")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("repository")
            .setDescription("Repository (e.g. techspace-srm/campus-expense-tracker or full URL)")
            .setRequired(true)
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

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "connect-repo") {
      const projectId = interaction.options.getString("project_id");
      const repoInput = interaction.options.getString("repository");

      const project = getPrdById(projectId);
      if (!project) {
        const notFoundEmbed = createErrorEmbed("Project Not Found", `No project found with ID \`${projectId}\`.`);
        if (interaction.deferred) return interaction.editReply({ embeds: [notFoundEmbed] });
        return interaction.reply({ embeds: [notFoundEmbed], ephemeral: true });
      }

      const connection = connectProjectRepo(projectId, repoInput);

      const embed = createSuccessEmbed(
        "Repository Connected",
        `**Project:** ${project.title} (\`${project.id}\`)\n` +
          `**Track:** ${project.track}\n` +
          `**Repository:** [${connection.repoName}](${connection.repoUrl})\n\n` +
          `Development activity signals from this repository will now be monitored automatically.`
      );

      if (interaction.deferred) return interaction.editReply({ embeds: [embed] });
      if (interaction.replied) return interaction.followUp({ embeds: [embed] });
      return interaction.reply({ embeds: [embed] });
    }
  },
};
