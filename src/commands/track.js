const { SlashCommandBuilder } = require("discord.js");
const config = require("../config/config");
const { timeline, getTimeRemaining } = require("../config/events");
const { setUserTrack } = require("../services/teams");
const { createSuccessEmbed, createInfoEmbed, createErrorEmbed } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("track")
    .setDescription("Choose or update your BuildLab track")
    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("Select your track")
        .setRequired(true)
        .addChoices(
          { name: "Beginner", value: "Beginner" },
          { name: "Intermediate", value: "Intermediate" },
          { name: "Advanced", value: "Advanced" }
        )
    ),

  /**
   * @param {import("discord.js").ChatInputCommandInteraction} interaction 
   */
  async execute(interaction) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
    }

    const respond = (payload) => {
      if (interaction.deferred) {
        return interaction.editReply(payload);
      }
      if (interaction.replied) {
        return interaction.followUp({ ...payload, ephemeral: true });
      }
      return interaction.reply({ ...payload, ephemeral: true });
    };

    const selectedTrack = interaction.options.getString("name");
    const member = interaction.member;

    if (!member || !member.roles) {
      const errEmbed = createErrorEmbed(
        "Action Failed",
        "Could not resolve your server member profile."
      );
      return respond({ embeds: [errEmbed] });
    }

    // Check track selection deadline
    const deadlineEvent = timeline.find((e) => e.key === "track_selection");
    if (deadlineEvent) {
      const remaining = getTimeRemaining(deadlineEvent.date);
      if (remaining.past) {
        const errEmbed = createErrorEmbed(
          "Track Selection Closed",
          `The track selection deadline (${new Date(deadlineEvent.date).toLocaleDateString()}) has passed. Please contact a mentor in #help if you need assistance.`
        );
        return respond({ embeds: [errEmbed] });
      }
    }

    const guildRoles = interaction.guild?.roles?.cache || [];
    const targetRole = guildRoles.find(
      (r) => r.name.toLowerCase() === selectedTrack.toLowerCase()
    );

    if (!targetRole) {
      const errEmbed = createErrorEmbed(
        "Role Not Found",
        `The "${selectedTrack}" role is not found on this server. Please contact an admin.`
      );
      return respond({ embeds: [errEmbed] });
    }

    // Check if user already has the selected role
    if (member.roles.cache && typeof member.roles.cache.has === "function" && member.roles.cache.has(targetRole.id)) {
      const infoEmbed = createInfoEmbed(
        "Already Registered",
        `You are already registered for the **${selectedTrack}** track.`
      );
      return respond({ embeds: [infoEmbed] });
    }

    try {
      // Find all track roles to remove
      if (member.roles.cache && typeof member.roles.cache.filter === "function") {
        const trackRolesToRemove = member.roles.cache.filter((role) =>
          config.trackNames.some((t) => t.toLowerCase() === role.name.toLowerCase())
        );

        for (const [, role] of trackRolesToRemove) {
          if (typeof member.roles.remove === "function") {
            await member.roles.remove(role, "BuildLab track update");
          }
        }
      }

      // Add selected track role
      if (typeof member.roles.add === "function") {
        await member.roles.add(targetRole, "BuildLab track registration");
      }

      // Update in database
      setUserTrack(member.id, member.user?.username || member.id, selectedTrack);

      const successEmbed = createSuccessEmbed(
        "Track Updated",
        `You are now registered as an **${selectedTrack}** participant.\n\nWelcome to your track! Head over to your track channel to connect with your peers.`
      );

      return respond({ embeds: [successEmbed] });
    } catch (error) {
      console.error("Error updating track:", error);
      const errEmbed = createErrorEmbed(
        "Permission Error",
        "The bot was unable to update your role. Please ensure the bot's role is positioned higher than the track roles in Server Settings -> Roles."
      );
      return respond({ embeds: [errEmbed] });
    }
  },
};
