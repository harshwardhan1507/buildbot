const { SlashCommandBuilder } = require("discord.js");
const { getPrdById, buildParticipantApprovalView } = require("../services/prd");
const { isBuildLabTeam, getPermissionDeniedMessage } = require("../utils/permissions");
const { createErrorEmbed } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("notify")
    .setDescription("Notification commands")
    .addSubcommand((sub) =>
      sub
        .setName("approved")
        .setDescription("Notify approved BuildLab participants that their project is ready.")
        .addStringOption((opt) =>
          opt.setName("id").setDescription("Project ID to notify").setRequired(true)
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

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "approved") {
      const id = interaction.options.getString("id");
      const prd = getPrdById(id);

      if (!prd) {
        return interaction.reply({
          embeds: [createErrorEmbed("Not Found", `No project found with ID \`${id}\`.`)],
          ephemeral: true,
        });
      }

      // Generate the notification preview
      const { embed, components } = buildParticipantApprovalView(prd);

      // Reply with the preview directly
      return interaction.reply({
        content: `✅ Notification preview for project **${prd.id}**:`,
        embeds: [embed],
        components: components || [],
        ephemeral: true,
      });
    }
  },
};
