const {
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const {
  claimTicket,
  closeTicket,
  deleteTicketChannel,
  getTicketByNumber,
} = require("../services/tickets");
const { isBuildLabTeam, isTechSpaceAdmin } = require("../utils/permissions");
const { createBaseEmbed, createSuccessEmbed, createErrorEmbed, COLORS } = require("../utils/embeds");

module.exports = {
  name: Events.InteractionCreate,
  /**
   * @param {import("discord.js").Interaction} interaction 
   */
  async execute(interaction) {
    try {
      const userTag = interaction.user
        ? (interaction.user.tag || interaction.user.username || interaction.user.id)
        : "unknown_user";

      // 1. Slash commands
      if (interaction.isChatInputCommand()) {
        console.log(`[INTERACTION] command=${interaction.commandName} user=${userTag}`);
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) {
          console.warn(`[INTERACTION ERROR] command=${interaction.commandName} - Command not found in registry`);
          const notFoundEmbed = createErrorEmbed(
            "Unknown Command",
            `The command \`/${interaction.commandName}\` is not recognized or not available.`
          );
          if (!interaction.deferred && !interaction.replied) {
            await interaction.reply({ embeds: [notFoundEmbed], ephemeral: true }).catch(() => {});
          }
          return;
        }

        try {
          await command.execute(interaction);
          console.log(`[INTERACTION] acknowledged command=${interaction.commandName}`);
        } catch (error) {
          console.error(`[INTERACTION ERROR] command=${interaction.commandName}:`, error.message || error);
          const errorEmbed = createErrorEmbed(
            "Execution Error",
            "An unexpected error occurred while processing this command. Please try again or notify a mentor."
          );

          try {
            if (interaction.replied) {
              await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
            } else if (interaction.deferred) {
              await interaction.editReply({ embeds: [errorEmbed] });
            } else {
              await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
          } catch (replyErr) {
            console.error(`[INTERACTION ERROR] Failed to deliver error response for /${interaction.commandName}:`, replyErr.message);
          }
        }
        return;
      }

      // 2. String Select Menus
      if (interaction.isStringSelectMenu()) {
        console.log(`[INTERACTION] select_menu customId=${interaction.customId} user=${userTag}`);
        if (interaction.customId === "ticket_select_category") {
          const ticketCmd = interaction.client.commands.get("ticket");
          if (ticketCmd && typeof ticketCmd.handleSelectMenu === "function") {
            await ticketCmd.handleSelectMenu(interaction);
            console.log(`[INTERACTION] acknowledged select_menu customId=${interaction.customId}`);
          }
          return;
        }

        if (interaction.customId === "select_my_team") {
          const selectedProjectId = interaction.values?.[0];
          const teamStatusCmd = interaction.client.commands.get("team-status");
          if (teamStatusCmd) {
            // Safely assign option getter for team-status
            interaction.options = {
              getString: (name) => (name === "query" ? selectedProjectId : null),
              getSubcommand: () => null,
              getUser: () => null,
              getInteger: () => null,
              getBoolean: () => null,
            };
            await teamStatusCmd.execute(interaction);
            console.log(`[INTERACTION] acknowledged select_menu customId=${interaction.customId}`);
          }
          return;
        }

        // Unknown select menu fallback
        console.warn(`[INTERACTION ERROR] Unhandled select menu: ${interaction.customId}`);
        if (!interaction.deferred && !interaction.replied) {
          await interaction.reply({
            content: "⚠️ Unrecognized select menu selection or this action has expired.",
            ephemeral: true,
          }).catch(() => {});
        }
        return;
      }

      // 3. Buttons
      if (interaction.isButton()) {
        const customId = interaction.customId;
        console.log(`[INTERACTION] button customId=${customId} user=${userTag}`);

        // Help buttons
        if (customId.startsWith("help_")) {
          const helpCommand = interaction.client.commands.get("help");
          if (helpCommand && typeof helpCommand.handleButton === "function") {
            await helpCommand.handleButton(interaction);
            console.log(`[INTERACTION] acknowledged button customId=${customId}`);
          }
          return;
        }

        // Team Status interactive buttons
        if (customId.startsWith("team_view_")) {
          const teamStatusCmd = interaction.client.commands.get("team-status");
          if (teamStatusCmd && typeof teamStatusCmd.handleButton === "function") {
            await teamStatusCmd.handleButton(interaction);
            console.log(`[INTERACTION] acknowledged button customId=${customId}`);
          }
          return;
        }

        // Ticket: Claim
        if (customId.startsWith("ticket_claim_")) {
          if (!isBuildLabTeam(interaction.member)) {
            return interaction.reply({
              content: "❌ Only BuildLab Team members can claim support tickets.",
              ephemeral: true,
            });
          }

          if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply();
          }

          const ticketNum = parseInt(customId.replace("ticket_claim_", ""), 10);
          const result = claimTicket(ticketNum, interaction.member);

          if (!result.success) {
            return interaction.editReply({ content: result.message });
          }

          const embed = createSuccessEmbed(
            "Ticket Claimed",
            `🧑‍🏫 **Claimed by:** <@${interaction.user.id}>\n**Status:** 🔵 **In Progress**\n\nThe mentor is now assisting with this ticket.`
          );

          await interaction.editReply({ embeds: [embed] });
          console.log(`[INTERACTION] acknowledged button customId=${customId}`);
          return;
        }

        // Ticket: Request Close (Confirm prompt)
        if (customId.startsWith("ticket_close_")) {
          if (!isBuildLabTeam(interaction.member)) {
            // Check if ticket creator is closing
            const ticketNum = parseInt(customId.replace("ticket_close_", ""), 10);
            const ticket = getTicketByNumber(ticketNum);
            if (!ticket || ticket.creator_id !== interaction.user.id) {
              return interaction.reply({
                content: "❌ You don't have permission to close this ticket.",
                ephemeral: true,
              });
            }
          }

          const ticketNum = parseInt(customId.replace("ticket_close_", ""), 10);
          const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`ticket_confirm_close_${ticketNum}`)
              .setLabel("Yes, Close Ticket")
              .setEmoji("✅")
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId(`ticket_cancel_close_${ticketNum}`)
              .setLabel("Cancel")
              .setEmoji("↩️")
              .setStyle(ButtonStyle.Secondary)
          );

          await interaction.reply({
            content: "⚠️ **Are you sure you want to resolve and close this ticket?**",
            components: [confirmRow],
            ephemeral: true,
          });
          console.log(`[INTERACTION] acknowledged button customId=${customId}`);
          return;
        }

        // Ticket: Confirm Close
        if (customId.startsWith("ticket_confirm_close_")) {
          const ticketNum = parseInt(customId.replace("ticket_confirm_close_", ""), 10);
          await interaction.deferUpdate();
          await closeTicket(ticketNum, interaction.member, "Resolved in ticket channel");
          console.log(`[INTERACTION] acknowledged button customId=${customId}`);
          return;
        }

        // Ticket: Cancel Close
        if (customId.startsWith("ticket_cancel_close_")) {
          await interaction.update({
            content: "Ticket closure cancelled.",
            components: [],
          });
          console.log(`[INTERACTION] acknowledged button customId=${customId}`);
          return;
        }

        // Ticket: Permanent Delete (Admin only)
        if (customId.startsWith("ticket_delete_")) {
          if (!isTechSpaceAdmin(interaction.member)) {
            return interaction.reply({
              content: "❌ Only TechSpace Admins can permanently delete ticket channels.",
              ephemeral: true,
            });
          }

          const ticketNum = parseInt(customId.replace("ticket_delete_", ""), 10);
          await interaction.reply({ content: "🗑️ Deleting ticket channel...", ephemeral: true });
          await deleteTicketChannel(ticketNum, interaction.guild);
          console.log(`[INTERACTION] acknowledged button customId=${customId}`);
          return;
        }

        // Unknown button fallback
        console.warn(`[INTERACTION ERROR] Unhandled button: ${customId}`);
        if (!interaction.deferred && !interaction.replied) {
          await interaction.reply({
            content: "⚠️ Unrecognized button interaction or this action has expired.",
            ephemeral: true,
          }).catch(() => {});
        }
        return;
      }

      // 4. Modals
      if (interaction.isModalSubmit()) {
        console.log(`[INTERACTION] modal customId=${interaction.customId} user=${userTag}`);
        if (interaction.customId === "modal_prd_submit") {
          const prdCommand = interaction.client.commands.get("prd");
          if (prdCommand && typeof prdCommand.handleModal === "function") {
            await prdCommand.handleModal(interaction);
            console.log(`[INTERACTION] acknowledged modal customId=${interaction.customId}`);
          }
          return;
        }

        // Unknown modal fallback
        console.warn(`[INTERACTION ERROR] Unhandled modal: ${interaction.customId}`);
        if (!interaction.deferred && !interaction.replied) {
          await interaction.reply({
            content: "⚠️ Unrecognized modal submission.",
            ephemeral: true,
          }).catch(() => {});
        }
        return;
      }
    } catch (topError) {
      console.error("[INTERACTION ERROR] Unhandled interaction error:", topError.message || topError);
      try {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.reply({
            content: "❌ An internal error occurred while processing this interaction.",
            ephemeral: true,
          }).catch(() => {});
        } else if (interaction.deferred && !interaction.replied) {
          await interaction.editReply({
            content: "❌ An internal error occurred while processing this interaction.",
          }).catch(() => {});
        }
      } catch {
        // Suppress secondary failures during error recovery
      }
    }
  },
};
