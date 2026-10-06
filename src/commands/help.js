const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { createBaseEmbed, COLORS } = require("../utils/embeds");

const HELP_DATA = {
  help_debugging: {
    title: "🐛 Debugging Support",
    text:
      "→ **Channel:** Use <#debugging>\n" +
      "→ Explain **expected vs actual** behaviour\n" +
      "→ Include relevant **error messages** and logs\n" +
      "→ Include the smallest relevant code snippet\n" +
      "→ ⚠️ **Never share** API keys, passwords, or secrets!",
  },
  help_github: {
    title: "🐙 Git & GitHub Support",
    text:
      "→ **Channel:** Use <#github-help>\n" +
      "→ Ask about Git commands, branches, commits, PRs, and merge conflicts\n" +
      "→ Mention repository name and the exact git command you ran\n" +
      "→ ⚠️ Never commit or share `.env` files or tokens!",
  },
  help_prd: {
    title: "📋 PRD Help & Clarifications",
    text:
      "→ **Channel:** Use <#project-discussion>\n" +
      "→ Ask about PRD scope, problem statements, requirements, or milestones\n" +
      "→ Use `/prd submit` to submit your project PRD for mentor review\n" +
      "→ Check <#rules> for PRD guidelines",
  },
  help_scope: {
    title: "💡 Project Scope Guidance",
    text:
      "→ **Channel:** Use <#project-discussion>\n" +
      "→ Discuss whether specific features belong in **Core** or **Stretch** goals\n" +
      "→ Prioritize getting a working MVP built first before expanding scope\n" +
      "→ Tag a mentor if you need advice on technical feasibility",
  },
  help_submission: {
    title: "📦 Project Submission",
    text:
      "→ **Channel:** Use <#submissions>\n" +
      "→ Ensure your PRD is approved before final submission\n" +
      "→ Complete your GitHub README, documentation, and live demo\n" +
      "→ Follow the format outlined in the pinned guide in <#submissions>",
  },
  help_general: {
    title: "❓ General Assistance",
    text:
      "→ **Channel:** Use <#help>\n" +
      "→ Ask here when you're not sure which channel your problem belongs to\n" +
      "→ Search existing messages or check <#getting-started> first\n" +
      "→ Be specific about what you are trying to accomplish",
  },
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Interactive BuildLab help and support guide"),

  /**
   * @param {import("discord.js").ChatInputCommandInteraction} interaction 
   */
  async execute(interaction) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }

    const embed = createBaseEmbed("🆘 BuildLab Help", "What do you need help with?\nClick a button below for guidance.", COLORS.DEFAULT);

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("help_debugging")
        .setLabel("Debugging")
        .setEmoji("🐛")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("help_github")
        .setLabel("GitHub")
        .setEmoji("🐙")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("help_prd")
        .setLabel("PRD")
        .setEmoji("📋")
        .setStyle(ButtonStyle.Primary)
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("help_scope")
        .setLabel("Project Scope")
        .setEmoji("💡")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("help_submission")
        .setLabel("Submission")
        .setEmoji("📦")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("help_general")
        .setLabel("General")
        .setEmoji("❓")
        .setStyle(ButtonStyle.Secondary)
    );

    if (interaction.deferred) {
      return interaction.editReply({
        embeds: [embed],
        components: [row1, row2],
      });
    }
    if (interaction.replied) {
      return interaction.followUp({
        embeds: [embed],
        components: [row1, row2],
      });
    }
    return interaction.reply({
      embeds: [embed],
      components: [row1, row2],
    });
  },

  /**
   * Handles button interaction for help categories
   * @param {import("discord.js").ButtonInteraction} interaction 
   */
  async handleButton(interaction) {
    const data = HELP_DATA[interaction.customId];
    if (!data) return;

    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
    }

    const embed = createBaseEmbed(data.title, data.text, COLORS.INFO);
    if (interaction.deferred) {
      return interaction.editReply({ embeds: [embed] });
    }
    if (interaction.replied) {
      return interaction.followUp({ embeds: [embed], ephemeral: true });
    }
    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
