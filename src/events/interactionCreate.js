const {
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const {
  claimTicket,
  closeTicket,
  deleteTicketChannel,
  getTicketByNumber,
} = require("../services/tickets");
const {
  getPrdById,
  getPrdByOwnerId,
  getPendingPrds,
  updatePrdStatus,
  assignMentor,
  setMentorStatus,
} = require("../services/prd");
const { getTeamStatus, getTeamsByMentor } = require("../services/teams");
const {
  getProjectMilestones,
  updateMilestoneStatus,
} = require("../services/milestones");
const { isBuildLabTeam, isTechSpaceAdmin } = require("../utils/permissions");
const { createBaseEmbed, createSuccessEmbed, createWarningEmbed, createErrorEmbed, COLORS } = require("../utils/embeds");

module.exports = {
  name: Events.InteractionCreate,
  /**
   * @param {import("discord.js").Interaction} interaction 
   */
  async execute(interaction) {
    try {
      const userTag = interaction.user
        ? interaction.user.tag || interaction.user.username || interaction.user.id
        : "unknown_user";

      // ======================================================================
      // 1. SLASH COMMANDS
      // ======================================================================
      if (interaction.isChatInputCommand()) {
        console.log(`[INTERACTION] command=${interaction.commandName} user=${userTag}`);
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) {
          console.warn(`[INTERACTION ERROR] command=${interaction.commandName} - Command not found in registry`);
          const notFoundEmbed = createErrorEmbed(
            "Unknown Command",
            `The command \`/${interaction.commandName}\` is not recognized or has been retired.`
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

      // ======================================================================
      // 2. STRING SELECT MENUS
      // ======================================================================
      if (interaction.isStringSelectMenu()) {
        const customId = interaction.customId;
        console.log(`[INTERACTION] select_menu customId=${customId} user=${userTag}`);

        // Support ticket category selection
        if (customId === "ticket_select_category") {
          const ticketCmd = interaction.client.commands.get("ticket");
          if (ticketCmd && typeof ticketCmd.handleSelectMenu === "function") {
            await ticketCmd.handleSelectMenu(interaction);
            console.log(`[INTERACTION] acknowledged select_menu customId=${customId}`);
          }
          return;
        }

        // Teams management: select team to view dashboard
        if (customId === "teams_select_project" || customId === "select_my_team") {
          const selectedProjectId = interaction.values?.[0];
          const project = getTeamStatus(selectedProjectId);
          if (project) {
            const teamsCmd = interaction.client.commands.get("teams");
            if (teamsCmd && typeof teamsCmd.buildTeamProjectView === "function") {
              const { embed, components } = teamsCmd.buildTeamProjectView(project);
              await interaction.update({ embeds: [embed], components });
              console.log(`[INTERACTION] acknowledged select_menu customId=${customId}`);
              return;
            }
          }
        }

        // Staff PRD pending proposal select
        if (customId === "prd_staff_select_pending") {
          const selectedPrdId = interaction.values?.[0];
          const prd = getPrdById(selectedPrdId);
          if (prd) {
            const prdCmd = interaction.client.commands.get("prd");
            if (prdCmd && typeof prdCmd.buildPrdViewEmbed === "function") {
              const embed = prdCmd.buildPrdViewEmbed(prd, true);
              const actionRow = new ActionRowBuilder();
              if (prd.proposal_pdf_url) {
                actionRow.addComponents(
                  new ButtonBuilder()
                    .setLabel("View Proposal PDF")
                    .setEmoji("📎")
                    .setStyle(ButtonStyle.Link)
                    .setURL(prd.proposal_pdf_url)
                );
              }
              actionRow.addComponents(
                new ButtonBuilder()
                  .setCustomId(`prd_quick_approve_${prd.id}`)
                  .setLabel("Approve")
                  .setEmoji("✅")
                  .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                  .setCustomId(`prd_quick_changes_${prd.id}`)
                  .setLabel("Request Changes")
                  .setEmoji("🟡")
                  .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                  .setCustomId(`prd_quick_reject_${prd.id}`)
                  .setLabel("Reject")
                  .setEmoji("❌")
                  .setStyle(ButtonStyle.Danger)
              );
              await interaction.reply({ embeds: [embed], components: [actionRow], ephemeral: true });
              return;
            }
          }
        }

        // Staff ticket action select
        if (customId === "select_ticket_action") {
          const ticketNum = parseInt(interaction.values?.[0], 10);
          const ticket = getTicketByNumber(ticketNum);
          if (!ticket) {
            return interaction.reply({ content: "❌ Ticket not found.", ephemeral: true });
          }

          const embed = createBaseEmbed(
            `🎫 Support Ticket #${String(ticket.ticket_number).padStart(4, "0")}`,
            `**Category:** ${ticket.category}\n` +
              `**Created by:** <@${ticket.creator_id}>\n` +
              `**Channel:** <#${ticket.channel_id}>\n` +
              `**Status:** **${ticket.status}**\n` +
              `**Assigned Mentor:** ${ticket.claimed_by ? `<@${ticket.claimed_by}>` : "*Unclaimed*"}\n` +
              `*Opened <t:${Math.floor(new Date(ticket.created_at).getTime() / 1000)}:R>*`,
            COLORS.DEFAULT
          );

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`ticket_claim_${ticket.ticket_number}`)
              .setLabel("Claim Ticket")
              .setEmoji("✋")
              .setStyle(ButtonStyle.Success)
              .setDisabled(Boolean(ticket.claimed_by)),
            new ButtonBuilder()
              .setCustomId(`ticket_close_${ticket.ticket_number}`)
              .setLabel("Close Ticket")
              .setEmoji("🔒")
              .setStyle(ButtonStyle.Danger)
          );

          return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        }

        // Health assessment select
        if (customId.startsWith("team_health_select_")) {
          if (!isBuildLabTeam(interaction.member)) {
            return interaction.reply({ content: "❌ Only BuildLab Team members can update health.", ephemeral: true });
          }

          const projectId = customId.replace("team_health_select_", "");
          const statusVal = interaction.values?.[0]; // "On Track", "Needs Attention", "At Risk"

          setMentorStatus(projectId, interaction.user.id, statusVal, `Updated via staff dashboard by <@${interaction.user.id}>`);
          const updated = getTeamStatus(projectId);
          const teamsCmd = interaction.client.commands.get("teams");
          if (teamsCmd && typeof teamsCmd.buildTeamProjectView === "function") {
            const { embed, components } = teamsCmd.buildTeamProjectView(updated);
            await interaction.update({ embeds: [embed], components });
            console.log(`[INTERACTION] acknowledged select_menu customId=${customId}`);
            return;
          }
        }

        // Progress milestone update select
        if (customId.startsWith("team_progress_select_")) {
          const parts = customId.replace("team_progress_select_", "").split("_");
          const projectId = parts[0];
          const newStatus = interaction.values?.[0]; // e.g. "Completed", "In Progress"

          // Update milestone 1 or chosen index
          const milestones = getProjectMilestones(projectId);
          if (milestones.length > 0) {
            updateMilestoneStatus(projectId, milestones[0].milestone_index, newStatus);
          }

          const updated = getTeamStatus(projectId);
          const teamsCmd = interaction.client.commands.get("teams");
          if (teamsCmd && typeof teamsCmd.buildTeamProjectView === "function") {
            const { embed, components } = teamsCmd.buildTeamProjectView(updated);
            await interaction.update({ embeds: [embed], components });
            console.log(`[INTERACTION] acknowledged select_menu customId=${customId}`);
            return;
          }
        }

        // Fallback for unhandled select menus
        console.warn(`[INTERACTION ERROR] Unhandled select menu: ${customId}`);
        if (!interaction.deferred && !interaction.replied) {
          await interaction.reply({
            content: "⚠️ Unrecognized select menu selection or this action has expired.",
            ephemeral: true,
          }).catch(() => {});
        }
        return;
      }

      // ======================================================================
      // 3. BUTTONS
      // ======================================================================
      if (interaction.isButton()) {
        const customId = interaction.customId;
        console.log(`[INTERACTION] button customId=${customId} user=${userTag}`);

        // Help buttons
        if (customId.startsWith("help_")) {
          const helpCmd = interaction.client.commands.get("help");
          if (helpCmd && typeof helpCmd.handleButton === "function") {
            await helpCmd.handleButton(interaction);
            console.log(`[INTERACTION] acknowledged button customId=${customId}`);
          }
          return;
        }

        // Start command buttons: Submit PRD
        if (customId === "start_submit_prd" || customId === "prd_restart") {
          const prdCmd = interaction.client.commands.get("prd");
          if (prdCmd && typeof prdCmd.createStep1Modal === "function") {
            const existing = getPrdByOwnerId(interaction.user.id);
            const modal = prdCmd.createStep1Modal(existing);
            return interaction.showModal(modal);
          }
        }

        // Start command buttons: View project ideas / catalogue
        if (customId === "start_view_projects") {
          const embed = createBaseEmbed(
            "💡 BUILDLAB ’26 PROJECT THEMES & TRACKS",
            "Choose a track that matches your experience and team format:\n\n" +
              "🔵 **BEGINNER (Solo)**\n" +
              "• Perfect for first-year students and builders learning full-stack basics.\n" +
              "• *Sample Ideas:* Campus Lost & Found, Student Expense Tracker, Club Event RSVP.\n\n" +
              "🟣 **INTERMEDIATE (Duo — 2 Members)**\n" +
              "• For students building end-to-end applications with APIs and authentication.\n" +
              "• *Sample Ideas:* Campus Marketplace, Skill-Sharing Exchange, Study Room Booking.\n\n" +
              "🔴 **ADVANCED (Squad — 3–4 Members)**\n" +
              "• Complex architectures, real-time engines, AI agents, or distributed systems.\n" +
              "• *Sample Ideas:* Collaborative Whiteboard, AI Code Review Bot, Campus Navigation Engine.\n\n" +
              "Have an idea ready? Click **Submit PRD** below to get your track role automatically!",
            COLORS.DEFAULT
          );

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("start_submit_prd")
              .setLabel("Submit PRD")
              .setEmoji("📝")
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId("start_get_help")
              .setLabel("Get Help")
              .setEmoji("🆘")
              .setStyle(ButtonStyle.Secondary)
          );

          return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        }

        // Start command buttons: Get Help
        if (customId === "start_get_help") {
          const helpCmd = interaction.client.commands.get("help");
          if (helpCmd) return helpCmd.execute(interaction);
        }

        // PRD: Open Step 2 Modal
        if (customId === "prd_open_step2") {
          const prdCmd = interaction.client.commands.get("prd");
          if (prdCmd && typeof prdCmd.createStep2Modal === "function") {
            const existing = getPrdByOwnerId(interaction.user.id);
            const modal = prdCmd.createStep2Modal(existing);
            return interaction.showModal(modal);
          }
        }

        // PRD: Open Step 3 PDF Prompt
        if (customId === "prd_open_step3") {
          const prdCmd = interaction.client.commands.get("prd");
          if (prdCmd) {
            const draft = prdCmd.draftCache?.get(interaction.user.id) || {};
            const { embed, components } = prdCmd.buildStep3PdfPrompt(draft);
            return interaction.reply({ embeds: [embed], components, ephemeral: true });
          }
        }

        // PRD: Enter PDF Link (shows link modal)
        if (customId === "prd_pdf_enter_link") {
          const prdCmd = interaction.client.commands.get("prd");
          if (prdCmd && typeof prdCmd.createPdfLinkModal === "function") {
            const draft = prdCmd.draftCache?.get(interaction.user.id);
            const modal = prdCmd.createPdfLinkModal(draft);
            return interaction.showModal(modal);
          }
        }

        // PRD: Upload PDF File directly
        if (customId === "prd_pdf_upload_file") {
          const prdCmd = interaction.client.commands.get("prd");
          if (prdCmd && typeof prdCmd.handlePdfUploadButton === "function") {
            return prdCmd.handlePdfUploadButton(interaction);
          }
        }

        // PRD: Keep Existing PDF and proceed to final summary
        if (customId === "prd_pdf_keep_existing") {
          const prdCmd = interaction.client.commands.get("prd");
          if (prdCmd) {
            const draft = prdCmd.draftCache?.get(interaction.user.id);
            if (!draft) {
              return interaction.reply({ content: "⚠️ Session expired. Please run `/prd` to restart.", ephemeral: true });
            }
            const { embed, components } = prdCmd.buildFinalSummary(draft);
            return interaction.reply({ embeds: [embed], components, ephemeral: true });
          }
        }

        // PRD: Confirm Submit (Writes to DB & assigns track role!)
        if (customId === "prd_confirm_submit") {
          const prdCmd = interaction.client.commands.get("prd");
          if (prdCmd && typeof prdCmd.handleConfirmSubmit === "function") {
            return prdCmd.handleConfirmSubmit(interaction);
          }
        }

        // PRD: View own PRD
        if (customId === "prd_view_own") {
          const prd = getPrdByOwnerId(interaction.user.id);
          if (!prd) {
            return interaction.reply({
              content: "You haven't submitted a project proposal yet! Use `/start` or `/prd submit` to begin.",
              ephemeral: true,
            });
          }
          const prdCmd = interaction.client.commands.get("prd");
          if (prdCmd && typeof prdCmd.buildPrdViewEmbed === "function") {
            const embed = prdCmd.buildPrdViewEmbed(prd, isBuildLabTeam(interaction.member));
            return interaction.reply({ embeds: [embed], ephemeral: true });
          }
        }

        // PRD: Update PRD
        if (customId === "prd_update_start") {
          const prdCmd = interaction.client.commands.get("prd");
          if (prdCmd && typeof prdCmd.createStep1Modal === "function") {
            const existing = getPrdByOwnerId(interaction.user.id);
            const modal = prdCmd.createStep1Modal(existing);
            return interaction.showModal(modal);
          }
        }

        // Quick PRD Review buttons for staff
        if (customId.startsWith("prd_quick_approve_")) {
          if (!isBuildLabTeam(interaction.member)) {
            return interaction.reply({ content: "❌ Only BuildLab Team members can approve proposals.", ephemeral: true });
          }
          const prdId = customId.replace("prd_quick_approve_", "");
          const updated = updatePrdStatus(prdId, "Approved", `Approved by <@${interaction.user.id}>`);
          const embed = createSuccessEmbed(
            "Proposal Approved! 🎉",
            `Project **${updated.title}** (\`${updated.id}\`) is now approved for **DEVELOPMENT**.`
          );
          return interaction.reply({ embeds: [embed] });
        }

        if (customId.startsWith("prd_quick_changes_")) {
          if (!isBuildLabTeam(interaction.member)) {
            return interaction.reply({ content: "❌ Only BuildLab Team members can request changes.", ephemeral: true });
          }
          const prdId = customId.replace("prd_quick_changes_", "");
          const modal = new ModalBuilder()
            .setCustomId(`modal_prd_changes_${prdId}`)
            .setTitle(`Request Changes: ${prdId}`);

          const reasonInput = new TextInputBuilder()
            .setCustomId("reason")
            .setLabel("Feedback & Changes Required")
            .setPlaceholder("Explain what needs to be revised before approval...")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(600);

          modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
          return interaction.showModal(modal);
        }

        if (customId.startsWith("prd_quick_reject_")) {
          if (!isBuildLabTeam(interaction.member)) {
            return interaction.reply({ content: "❌ Only BuildLab Team members can reject proposals.", ephemeral: true });
          }
          const prdId = customId.replace("prd_quick_reject_", "");
          const modal = new ModalBuilder()
            .setCustomId(`modal_prd_reject_${prdId}`)
            .setTitle(`Reject Proposal: ${prdId}`);

          const reasonInput = new TextInputBuilder()
            .setCustomId("reason")
            .setLabel("Reason for Rejection")
            .setPlaceholder("Explain why this proposal is rejected...")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(600);

          modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
          return interaction.showModal(modal);
        }

        // Status view buttons
        if (customId === "status_view_own") {
          const statusCmd = interaction.client.commands.get("status");
          if (statusCmd) return statusCmd.execute(interaction);
        }

        // Ticket buttons: Direct open
        if (customId === "ticket_open_direct") {
          const ticketCmd = interaction.client.commands.get("ticket");
          if (ticketCmd) return ticketCmd.execute(interaction);
        }

        // Ticket queue filter buttons
        if (customId.startsWith("tickets_filter_")) {
          const filter = customId.replace("tickets_filter_", "");
          const ticketsCmd = interaction.client.commands.get("tickets");
          if (ticketsCmd && typeof ticketsCmd.buildTicketQueueView === "function") {
            const { embed, components } = ticketsCmd.buildTicketQueueView(filter, interaction.user.id);
            return interaction.update({ embeds: [embed], components });
          }
        }

        // Staff Dashboard buttons
        if (customId === "staff_dash_prd") {
          const pendingList = getPendingPrds();
          const embed = createBaseEmbed(
            "📋 PENDING PRD QUEUE",
            `Found **${pendingList.length}** project proposals awaiting review:`,
            COLORS.WARNING
          );
          if (pendingList.length === 0) {
            embed.setDescription("🎉 No pending proposals! All PRDs have been reviewed.");
          } else {
            pendingList.slice(0, 10).forEach((p) => {
              embed.addFields({
                name: `${p.title} (\`${p.id}\`)`,
                value: `**Track:** ${p.track} • **Lead:** <@${p.owner_id}>\n[Repository](${p.repo_url || "#"})`,
                inline: false,
              });
            });
          }
          return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (customId === "staff_dash_tickets") {
          const ticketsCmd = interaction.client.commands.get("tickets");
          if (ticketsCmd && typeof ticketsCmd.buildTicketQueueView === "function") {
            const { embed, components } = ticketsCmd.buildTicketQueueView("open", interaction.user.id);
            return interaction.reply({ embeds: [embed], components, ephemeral: true });
          }
        }

        if (customId === "staff_dash_teams") {
          const teamsCmd = interaction.client.commands.get("teams");
          if (teamsCmd) return teamsCmd.execute(interaction);
        }

        if (customId === "staff_dash_my_teams") {
          const teams = getTeamsByMentor(interaction.user.id);
          const embed = createBaseEmbed(
            "🧑‍🏫 YOUR MENTORED TEAMS",
            `You are currently assigned as mentor to **${teams.length}** project(s):`,
            COLORS.SUCCESS
          );
          if (teams.length === 0) {
            embed.setDescription("You currently have no teams assigned. An organizer can assign you in `/teams`.");
          } else {
            teams.forEach((t, i) => {
              embed.addFields({
                name: `${i + 1}. ${t.title} (\`${t.id}\`)`,
                value: `**Track:** ${t.track} • **Health:** ${t.mentor_status} • **Stage:** ${t.stage}`,
                inline: false,
              });
            });
          }
          return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // Team management buttons
        if (customId.startsWith("team_view_prd_")) {
          const projectId = customId.replace("team_view_prd_", "");
          const project = getPrdById(projectId);
          if (project) {
            const prdCmd = interaction.client.commands.get("prd");
            if (prdCmd && typeof prdCmd.buildPrdViewEmbed === "function") {
              const embed = prdCmd.buildPrdViewEmbed(project, true);
              return interaction.reply({ embeds: [embed], ephemeral: true });
            }
          }
        }

        if (customId.startsWith("team_health_btn_")) {
          const projectId = customId.replace("team_health_btn_", "");
          const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`team_health_select_${projectId}`)
            .setPlaceholder("Select new health status...")
            .addOptions(
              new StringSelectMenuOptionBuilder().setLabel("🟢 On Track").setValue("On Track"),
              new StringSelectMenuOptionBuilder().setLabel("🟡 Needs Attention").setValue("Needs Attention"),
              new StringSelectMenuOptionBuilder().setLabel("🔴 At Risk").setValue("At Risk")
            );

          const row = new ActionRowBuilder().addComponents(selectMenu);
          return interaction.reply({
            content: `Select health status assessment for project \`${projectId}\`:`,
            components: [row],
            ephemeral: true,
          });
        }

        if (customId.startsWith("team_mentor_btn_")) {
          const projectId = customId.replace("team_mentor_btn_", "");
          const modal = new ModalBuilder()
            .setCustomId(`modal_assign_mentor_${projectId}`)
            .setTitle(`Assign Mentor: ${projectId}`);

          const mentorInput = new TextInputBuilder()
            .setCustomId("mentor_id")
            .setLabel("Mentor Discord User ID or @mention")
            .setPlaceholder("e.g. 123456789012345678 or @mentor")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setValue(interaction.user.id);

          modal.addComponents(new ActionRowBuilder().addComponents(mentorInput));
          return interaction.showModal(modal);
        }

        if (customId.startsWith("team_progress_btn_")) {
          const projectId = customId.replace("team_progress_btn_", "");
          const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`team_progress_select_${projectId}`)
            .setPlaceholder("Update milestone status...")
            .addOptions(
              new StringSelectMenuOptionBuilder().setLabel("✅ Completed").setValue("Completed"),
              new StringSelectMenuOptionBuilder().setLabel("🔄 In Progress").setValue("In Progress"),
              new StringSelectMenuOptionBuilder().setLabel("⚠️ Blocked").setValue("Blocked"),
              new StringSelectMenuOptionBuilder().setLabel("⬜ Not Started").setValue("Not Started")
            );

          const row = new ActionRowBuilder().addComponents(selectMenu);
          return interaction.reply({
            content: `Update milestone progress for project \`${projectId}\`:`,
            components: [row],
            ephemeral: true,
          });
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
            await interaction.deferReply({ ephemeral: true });
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

        // Ticket: Close request
        if (customId.startsWith("ticket_close_")) {
          const ticketNum = parseInt(customId.replace("ticket_close_", ""), 10);
          const ticket = getTicketByNumber(ticketNum);

          if (!isBuildLabTeam(interaction.member) && ticket?.creator_id !== interaction.user.id) {
            return interaction.reply({
              content: "❌ You don't have permission to close this ticket.",
              ephemeral: true,
            });
          }

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
          return;
        }

        if (customId.startsWith("ticket_confirm_close_")) {
          const ticketNum = parseInt(customId.replace("ticket_confirm_close_", ""), 10);
          await interaction.deferUpdate();
          await closeTicket(ticketNum, interaction.member, "Resolved in ticket channel");
          return;
        }

        if (customId.startsWith("ticket_cancel_close_")) {
          await interaction.update({
            content: "Ticket closure cancelled.",
            components: [],
          });
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
          return;
        }

        // Fallback for unhandled buttons
        console.warn(`[INTERACTION ERROR] Unhandled button: ${customId}`);
        if (!interaction.deferred && !interaction.replied) {
          await interaction.reply({
            content: "⚠️ Unrecognized button interaction or this action has expired.",
            ephemeral: true,
          }).catch(() => {});
        }
        return;
      }

      // ======================================================================
      // 4. MODALS
      // ======================================================================
      if (interaction.isModalSubmit()) {
        const customId = interaction.customId;
        console.log(`[INTERACTION] modal customId=${customId} user=${userTag}`);

        // PRD Step 1
        if (customId === "modal_prd_step1" || customId === "modal_prd_submit") {
          const prdCmd = interaction.client.commands.get("prd");
          if (prdCmd && typeof prdCmd.handleStep1Modal === "function") {
            await prdCmd.handleStep1Modal(interaction);
            console.log(`[INTERACTION] acknowledged modal customId=${customId}`);
          }
          return;
        }

        // PRD Step 2
        if (customId === "modal_prd_step2") {
          const prdCmd = interaction.client.commands.get("prd");
          if (prdCmd && typeof prdCmd.handleStep2Modal === "function") {
            await prdCmd.handleStep2Modal(interaction);
            console.log(`[INTERACTION] acknowledged modal customId=${customId}`);
          }
          return;
        }

        // PRD Step 3: PDF Link Modal
        if (customId === "modal_prd_pdf_link") {
          const prdCmd = interaction.client.commands.get("prd");
          if (prdCmd && typeof prdCmd.handlePdfLinkModal === "function") {
            await prdCmd.handlePdfLinkModal(interaction);
            console.log(`[INTERACTION] acknowledged modal customId=${customId}`);
          }
          return;
        }

        // Staff assign mentor modal
        if (customId.startsWith("modal_assign_mentor_")) {
          const projectId = customId.replace("modal_assign_mentor_", "");
          const mentorInput = interaction.fields.getTextInputValue("mentor_id").trim();
          const cleanMentorId = mentorInput.replace(/[<@!>]/g, "");

          assignMentor(projectId, cleanMentorId);
          const embed = createSuccessEmbed(
            "Mentor Assigned",
            `Assigned <@${cleanMentorId}> as mentor for project \`${projectId}\`.`
          );
          return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // Staff request changes modal
        if (customId.startsWith("modal_prd_changes_")) {
          const projectId = customId.replace("modal_prd_changes_", "");
          const reason = interaction.fields.getTextInputValue("reason").trim();
          const updated = updatePrdStatus(projectId, "Changes Requested", reason);
          const embed = createWarningEmbed(
            "Changes Requested",
            `Requested revisions on **${updated.title}** (\`${updated.id}\`):\n> *${reason}*`
          );
          return interaction.reply({ embeds: [embed] });
        }

        // Staff reject proposal modal
        if (customId.startsWith("modal_prd_reject_")) {
          const projectId = customId.replace("modal_prd_reject_", "");
          const reason = interaction.fields.getTextInputValue("reason").trim();
          const updated = updatePrdStatus(projectId, "Rejected", reason);
          const embed = createErrorEmbed(
            "Proposal Rejected",
            `Project proposal **${updated.title}** (\`${updated.id}\`) was rejected:\n> *${reason}*`
          );
          return interaction.reply({ embeds: [embed] });
        }

        // Fallback for unhandled modals
        console.warn(`[INTERACTION ERROR] Unhandled modal: ${customId}`);
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
