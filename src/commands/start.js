const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { getPrdByOwnerId } = require("../services/prd");
const { createBaseEmbed, COLORS } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("start")
    .setDescription("Get started with BuildLab ’26"),

  /**
   * @param {import("discord.js").ChatInputCommandInteraction} interaction 
   */
  async execute(interaction) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
    }

    const prd = getPrdByOwnerId(interaction.user.id);

    // If user already submitted a PRD, show their existing setup
    if (prd) {
      const statusIcons = {
        Approved: "🟢 Approved",
        Pending: "🟡 Awaiting Review",
        "Changes Requested": "🟡 Changes Requested",
        Rejected: "🔴 Rejected",
      };
      const statusLabel = statusIcons[prd.status] || prd.status;
      const ghLabel = prd.repo_url ? `[Connected](${prd.repo_url})` : "Not connected";
      const teamFormat = prd.team_members || (prd.track === "Beginner" ? "Solo" : "Team");

      const embed = createBaseEmbed(
        "YOUR BUILDLAB PROJECT",
        `🆔 **PROJECT ID**\n\`${prd.id}\`\n\n` +
          `**PROJECT**\n${prd.title}\n\n` +
          `**TRACK**\n${prd.track} · ${teamFormat}\n\n` +
          `**PRD**\n${statusLabel}\n\n` +
          `**GITHUB**\n${ghLabel}`,
        COLORS.DEFAULT
      );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("prd_view_own")
          .setLabel("VIEW PRD")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("prd_update_start")
          .setLabel("UPDATE PRD")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("status_view_own")
          .setLabel("STATUS")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("start_get_help")
          .setLabel("HELP")
          .setStyle(ButtonStyle.Secondary)
      );

      if (interaction.deferred) return interaction.editReply({ embeds: [embed], components: [row] });
      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    // New participant onboarding view
    const embed = createBaseEmbed(
      "WELCOME TO BUILDLAB ’26 🚀",
      "A simple roadmap:\n\n" +
        "**01**\nChoose a project or bring your own idea.\n\n" +
        "**02**\nSubmit your project proposal.\n\n" +
        "**03**\nGet your BuildLab track role.\n\n" +
        "**04**\nStart building.",
      COLORS.DEFAULT
    );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("start_submit_prd")
        .setLabel("SUBMIT PRD")
        .setEmoji("📝")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("start_view_projects")
        .setLabel("VIEW PROJECTS")
        .setEmoji("💡")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("start_get_help")
        .setLabel("GET HELP")
        .setEmoji("🆘")
        .setStyle(ButtonStyle.Secondary)
    );

    if (interaction.deferred) return interaction.editReply({ embeds: [embed], components: [row] });
    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  },
};
