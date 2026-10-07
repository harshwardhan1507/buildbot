const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { createBaseEmbed, COLORS } = require("../utils/embeds");

const HELP_DATA = {
  help_prd: {
    title: "📋 Project Proposal & PRD Help",
    text:
      "**Need help scoping or submitting your project?**\n\n" +
      "• Pick a track: **Beginner** (Solo), **Intermediate** (Duo), or **Advanced** (Squad).\n" +
      "• Browse project catalogues or bring your own idea.\n" +
      "• Use `/prd submit` to write your problem statement, features, and tech stack.\n" +
      "• Mentors review proposals and approve them for development.\n\n" +
      "💬 Discuss ideas in <#project-discussion>",
    action: "submit_prd",
  },
  help_github: {
    title: "🐙 Git & GitHub Workflow",
    text:
      "**Need help with your project repository?**\n\n" +
      "1. `git clone <repo-url>` — Clone your project locally\n" +
      "2. `git checkout -b feature-name` — Work on a feature branch\n" +
      "3. `git add .` & `git commit -m \"message\"` — Save your changes\n" +
      "4. `git push origin feature-name` — Upload to GitHub\n" +
      "5. Open a Pull Request on GitHub to merge into `main`\n\n" +
      "⚠️ *Never commit passwords, API keys, or `.env` files!*",
    action: "ticket",
  },
  help_debugging: {
    title: "🐛 Debugging & Code Assistance",
    text:
      "**Stuck on an error or unexpected bug?**\n\n" +
      "• Check console error logs and terminal stack traces.\n" +
      "• Search documentation and verify installed package versions.\n" +
      "• Share the exact error message and code snippet in <#debugging>.\n" +
      "• If blocked, open a support ticket to get 1-on-1 mentor guidance.",
    action: "ticket",
  },
  help_ticket: {
    title: "🎫 Mentor Support Tickets",
    text:
      "**Need private help from the BuildLab Team?**\n\n" +
      "• Run `/ticket` to open a private channel between you and mentors.\n" +
      "• Select your issue: Technical Bug, GitHub, PRD Scope, or General Doubt.\n" +
      "• A mentor will claim your ticket and assist you step-by-step.",
    action: "ticket",
  },
  help_general: {
    title: "❓ General BuildLab Guidelines",
    text:
      "**Welcome to BuildLab ’26!**\n\n" +
      "• Check <#announcements> for schedules and deadlines.\n" +
      "• Read <#rules> and <#getting-started> for community guidelines.\n" +
      "• Run `/start` to see your setup and next steps.\n" +
      "• Reach out anytime in <#general> or ask in <#help>.",
    action: "start",
  },
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Find help and guidance for your project"),

  /**
   * @param {import("discord.js").ChatInputCommandInteraction} interaction 
   */
  async execute(interaction) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
    }

    const embed = createBaseEmbed(
      "🆘 BUILDLAB HELP",
      "What do you need assistance with? Click a button below for clear guidance:",
      COLORS.DEFAULT
    );

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("help_prd")
        .setLabel("Project / PRD")
        .setEmoji("📋")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("help_github")
        .setLabel("GitHub")
        .setEmoji("🐙")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("help_debugging")
        .setLabel("Debugging")
        .setEmoji("🐛")
        .setStyle(ButtonStyle.Primary)
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("help_ticket")
        .setLabel("Support Ticket")
        .setEmoji("🎫")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("help_general")
        .setLabel("General")
        .setEmoji("❓")
        .setStyle(ButtonStyle.Secondary)
    );

    if (interaction.deferred) {
      return interaction.editReply({ embeds: [embed], components: [row1, row2] });
    }
    return interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: true });
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

    const actionRow = new ActionRowBuilder();
    if (data.action === "ticket") {
      actionRow.addComponents(
        new ButtonBuilder()
          .setCustomId("ticket_open_direct")
          .setLabel("Open Support Ticket")
          .setEmoji("🎫")
          .setStyle(ButtonStyle.Success)
      );
    } else if (data.action === "submit_prd") {
      actionRow.addComponents(
        new ButtonBuilder()
          .setCustomId("start_submit_prd")
          .setLabel("Submit PRD")
          .setEmoji("📝")
          .setStyle(ButtonStyle.Success)
      );
    } else {
      actionRow.addComponents(
        new ButtonBuilder()
          .setCustomId("status_view_own")
          .setLabel("My Project Status")
          .setEmoji("📊")
          .setStyle(ButtonStyle.Primary)
      );
    }

    if (interaction.deferred) {
      return interaction.editReply({ embeds: [embed], components: [actionRow] });
    }
    return interaction.reply({ embeds: [embed], components: [actionRow], ephemeral: true });
  },
};
