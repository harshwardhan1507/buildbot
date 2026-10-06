const { SlashCommandBuilder } = require("discord.js");
const { assignMentor, getPrdById } = require("../services/prd");
const { isBuildLabTeam, getPermissionDeniedMessage } = require("../utils/permissions");
const { createSuccessEmbed, createErrorEmbed } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("assign-mentor")
    .setDescription("Assign a mentor to a project or team (Team only)")
    .addStringOption((opt) =>
      opt
        .setName("project_id")
        .setDescription("The PRD / Project ID (e.g. BL-PRD-001)")
        .setRequired(true)
    )
    .addUserOption((opt) =>
      opt
        .setName("mentor")
        .setDescription("The mentor to assign")
        .setRequired(true)
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

    const projectId = interaction.options.getString("project_id");
    const mentorUser = interaction.options.getUser("mentor");

    const project = getPrdById(projectId);
    if (!project) {
      const errEmbed = createErrorEmbed(
        "Project Not Found",
        `No PRD or project found with ID \`${projectId}\`.`
      );
      return interaction.reply({ embeds: [errEmbed], ephemeral: true });
    }

    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }

    const updated = assignMentor(projectId, mentorUser.id);

    const successEmbed = createSuccessEmbed(
      "Mentor Assigned",
      `Assigned <@${mentorUser.id}> as mentor for **${updated.title}** (\`${updated.id}\`).`
    ).addFields(
      { name: "Track", value: updated.track, inline: true },
      { name: "Project Owner", value: `<@${updated.owner_id}>`, inline: true },
      { name: "Assigned Mentor", value: `<@${mentorUser.id}>`, inline: true }
    );

    if (interaction.deferred) return interaction.editReply({ embeds: [successEmbed] });
    if (interaction.replied) return interaction.followUp({ embeds: [successEmbed] });
    return interaction.reply({ embeds: [successEmbed] });
  },
};
