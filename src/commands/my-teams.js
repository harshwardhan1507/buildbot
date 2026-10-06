const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require("discord.js");
const { getTeamsByMentor } = require("../services/teams");
const { calculateProjectProgress } = require("../services/milestones");
const { isBuildLabTeam, getPermissionDeniedMessage } = require("../utils/permissions");
const { createBaseEmbed, COLORS } = require("../utils/embeds");

const TRACK_ICONS = {
  Beginner: "🔵",
  Intermediate: "🟣",
  Advanced: "🔴",
};

const MENTOR_STATUS_ICONS = {
  "On Track": "🟢",
  "Needs Attention": "🟡",
  "At Risk": "🔴",
  "Not Assessed": "⚪",
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("my-teams")
    .setDescription("View teams and projects assigned to you as a mentor (Team only)"),

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

    const mentorId = interaction.user.id;
    const teams = getTeamsByMentor(mentorId);

    if (teams.length === 0) {
      const embed = createBaseEmbed(
        "🧑‍🏫 Your BuildLab Teams",
        "You currently have no teams or projects assigned to you. An admin can assign you using `/assign-mentor`.",
        COLORS.INFO
      );
      if (interaction.deferred) return interaction.editReply({ embeds: [embed] });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const embed = createBaseEmbed(
      "🧑‍🏫 YOUR BUILDLAB TEAMS",
      `You are mentoring **${teams.length}** project${teams.length === 1 ? "" : "s"}. Select a project below for the complete dashboard:`,
      COLORS.SUCCESS
    );

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("select_my_team")
      .setPlaceholder("Select a team to view full dashboard...");

    teams.forEach((team, i) => {
      const progress = calculateProjectProgress(team.id);
      const trackIcon = TRACK_ICONS[team.track] || "⚪";
      const statusIcon = MENTOR_STATUS_ICONS[team.mentor_status] || "⚪";

      const lastActivityText = team.last_activity_at
        ? `<t:${Math.floor(new Date(team.last_activity_at).getTime() / 1000)}:R>`
        : "No activity recorded";

      embed.addFields({
        name: `${i + 1}. ${team.title} (\`${team.id}\`)`,
        value:
          `${trackIcon} **${team.track}** • 🔨 **${team.stage}** • **${progress.percentage}%**\n` +
          `Status: ${statusIcon} **${team.mentor_status}**\n` +
          `Last Activity: ${lastActivityText}`,
        inline: false,
      });

      selectMenu.addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(`${team.title} (${team.id})`)
          .setValue(team.id)
          .setDescription(`${team.track} | ${team.stage} | ${progress.percentage}% completed`)
      );
    });

    const row = new ActionRowBuilder().addComponents(selectMenu);

    if (interaction.deferred) {
      return interaction.editReply({ embeds: [embed], components: [row] });
    }
    if (interaction.replied) {
      return interaction.followUp({ embeds: [embed], components: [row] });
    }
    return interaction.reply({ embeds: [embed], components: [row] });
  },
};
