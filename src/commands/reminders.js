const { SlashCommandBuilder } = require("discord.js");
const {
  areRemindersEnabled,
  setRemindersEnabled,
  checkAndSendReminders,
} = require("../services/reminders");
const { isTechSpaceAdmin, getPermissionDeniedMessage } = require("../utils/permissions");
const { createBaseEmbed, createSuccessEmbed, COLORS } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("reminders")
    .setDescription("Configure automated BuildLab deadline reminders (Admin only)")
    .addSubcommand((sub) =>
      sub
        .setName("status")
        .setDescription("Check reminder service status")
    )
    .addSubcommand((sub) =>
      sub
        .setName("toggle")
        .setDescription("Enable or disable automated reminders")
        .addBooleanOption((opt) =>
          opt
            .setName("enabled")
            .setDescription("Enable (true) or Disable (false)")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("check")
        .setDescription("Run an immediate reminder check")
    ),

  /**
   * @param {import("discord.js").ChatInputCommandInteraction} interaction 
   */
  async execute(interaction) {
    if (!isTechSpaceAdmin(interaction.member)) {
      return interaction.reply({
        content: getPermissionDeniedMessage("TechSpace Admin"),
        ephemeral: true,
      });
    }

    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "status") {
      const enabled = areRemindersEnabled();
      const embed = createBaseEmbed(
        "⏰ Reminder System Status",
        `Automated reminders are currently: **${enabled ? "🟢 Enabled" : "🔴 Disabled"}**\nInterval: **Every 30 minutes**\nMilestones: **3 days, 1 day, and morning of deadline**.`,
        enabled ? COLORS.SUCCESS : COLORS.WARNING
      );
      if (interaction.deferred) return interaction.editReply({ embeds: [embed] });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subcommand === "toggle") {
      const enabled = interaction.options.getBoolean("enabled");
      setRemindersEnabled(enabled);

      const embed = createSuccessEmbed(
        "Reminder Setting Updated",
        `Automated deadline reminders have been **${enabled ? "enabled" : "disabled"}**.`
      );
      if (interaction.deferred) return interaction.editReply({ embeds: [embed] });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subcommand === "check") {
      const sent = await checkAndSendReminders(interaction.client, false);

      const embed = createBaseEmbed(
        "⏰ Reminder Check Complete",
        sent.length > 0
          ? `Sent ${sent.length} notification(s):\n• ${sent.join("\n• ")}`
          : "No new deadline milestones were due at this time.",
        COLORS.INFO
      );

      if (interaction.deferred) return interaction.editReply({ embeds: [embed] });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
