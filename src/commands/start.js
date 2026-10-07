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
      const statusIcon =
        prd.status === "Approved"
          ? "🟢"
          : prd.status === "Changes Requested"
          ? "🟡"
          : prd.status === "Rejected"
          ? "🔴"
          : "⏳";

      const embed = createBaseEmbed(
        "🚀 YOUR BUILDLAB SETUP",
        `Welcome back! Here is your current project status:\n\n` +
          `**Project:** ${prd.title} (\`${prd.id}\`)\n` +
          `**Track:** **${prd.track}**\n` +
          `**Proposal Status:** ${statusIcon} **${prd.status}**\n` +
          (prd.status_reason ? `**Feedback:** *${prd.status_reason}*\n` : "") +
          (prd.repo_url ? `**Repository:** [GitHub Link](${prd.repo_url})\n` : "") +
          `\nYou’re all set to build. Use the buttons below to view or update your proposal:`,
        COLORS.DEFAULT
      );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("prd_view_own")
          .setLabel("View PRD")
          .setEmoji("👁️")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("prd_update_start")
          .setLabel("Update PRD")
          .setEmoji("✏️")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("status_view_own")
          .setLabel("Check Status")
          .setEmoji("📊")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("start_get_help")
          .setLabel("Get Help")
          .setEmoji("🆘")
          .setStyle(ButtonStyle.Secondary)
      );

      if (interaction.deferred) return interaction.editReply({ embeds: [embed], components: [row] });
      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    // New participant onboarding view
    const embed = createBaseEmbed(
      "WELCOME TO BUILDLAB ’26 🚀",
      "BuildLab is your journey to design, build, and ship a complete technical project.\n\n" +
        "**Here’s how to get started:**\n" +
        "1. 💡 **Choose your project / idea** (Pick from the catalogue or bring your own)\n" +
        "2. 📋 **Submit your PRD** (Project Requirements Document)\n" +
        "3. 🏷️ **Get your track role automatically** (`@Beginner`, `@Intermediate`, or `@Advanced`)\n" +
        "4. 🔨 **Start building!** (Connect your GitHub repository and hit your milestones)\n\n" +
        "Click below to begin:",
      COLORS.DEFAULT
    );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("start_submit_prd")
        .setLabel("Submit PRD")
        .setEmoji("📝")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("start_view_projects")
        .setLabel("Project Ideas")
        .setEmoji("💡")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("start_get_help")
        .setLabel("Get Help")
        .setEmoji("🆘")
        .setStyle(ButtonStyle.Secondary)
    );

    if (interaction.deferred) return interaction.editReply({ embeds: [embed], components: [row] });
    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  },
};
