const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const {
  submitPrd,
  getPrdById,
  getPendingPrds,
  updatePrdStatus,
  getPrdByOwnerId,
  validateRepoUrl,
  validateTeamSize,
  parseTeammateTokens,
  cleanMemberToken,
  isSubmitterToken,
  validatePdf,
} = require("../services/prd");
const { assignTrackRole, assignTrackRoleToTeam } = require("../services/roles");
const { isBuildLabTeam, getPermissionDeniedMessage } = require("../utils/permissions");
const { createBaseEmbed, createSuccessEmbed, createWarningEmbed, createErrorEmbed, COLORS } = require("../utils/embeds");

// Temporary in-memory draft cache for multi-step submission (keyed by userId)
const draftCache = new Map();

/**
 * Creates the Step 1 Modal: Team, Track & Repo basics
 * @param {object} [existing] 
 * @returns {ModalBuilder}
 */
function createStep1Modal(existing = null) {
  const modal = new ModalBuilder()
    .setCustomId("modal_prd_step1")
    .setTitle("Project Proposal — Step 1/3");

  const trackInput = new TextInputBuilder()
    .setCustomId("prd_track")
    .setLabel("Track (Beginner / Intermediate / Advanced)")
    .setPlaceholder("e.g. Beginner (Solo), Intermediate (2), or Advanced (3-4)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(30)
    .setValue(existing?.track || "Beginner");

  const projectTypeInput = new TextInputBuilder()
    .setCustomId("prd_type")
    .setLabel("Project Type (Own Idea or Catalogue ID)")
    .setPlaceholder("e.g. Own Idea or Catalogue B07")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(50)
    .setValue(
      existing?.problem_statement_id
        ? `Catalogue ${existing.problem_statement_id}`
        : existing?.project_type || "Own Idea"
    );

  let prefillTeam = "Solo";
  if (existing?.team_members) {
    if (existing.track === "Beginner" || existing.team_members.toLowerCase() === "solo") {
      prefillTeam = "Solo";
    } else {
      const tokens = parseTeammateTokens(existing.team_members);
      const teammatesOnly = tokens.filter((t) => !isSubmitterToken(t, { id: existing.owner_id }));
      prefillTeam = teammatesOnly.join(", ") || (existing.track === "Beginner" ? "Solo" : "");
    }
  }

  const teamInput = new TextInputBuilder()
    .setCustomId("prd_team")
    .setLabel("Teammates (Do NOT include yourself)")
    .setPlaceholder("Beginner: Solo | Intermediate: @partner | Advanced: @b, @c")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(150)
    .setValue(prefillTeam);

  const titleInput = new TextInputBuilder()
    .setCustomId("prd_title")
    .setLabel("Project Title")
    .setPlaceholder("e.g. Campus Lost & Found")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100)
    .setValue(existing?.title || "");

  const repoInput = new TextInputBuilder()
    .setCustomId("prd_repo")
    .setLabel("GitHub Repository URL")
    .setPlaceholder("https://github.com/username/repository-name")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(120)
    .setValue(existing?.repo_url || "");

  modal.addComponents(
    new ActionRowBuilder().addComponents(trackInput),
    new ActionRowBuilder().addComponents(projectTypeInput),
    new ActionRowBuilder().addComponents(teamInput),
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(repoInput)
  );

  return modal;
}

/**
 * Creates the Step 2 Modal: Problem, Solution & Technical details
 * @param {object} [existing] 
 * @returns {ModalBuilder}
 */
function createStep2Modal(existing = null) {
  const modal = new ModalBuilder()
    .setCustomId("modal_prd_step2")
    .setTitle("Project Proposal — Step 2/3");

  const problemInput = new TextInputBuilder()
    .setCustomId("prd_problem")
    .setLabel("Problem (What are you trying to solve?)")
    .setPlaceholder("Describe the problem simply...")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(600)
    .setValue(existing?.problem_statement || "");

  const solutionInput = new TextInputBuilder()
    .setCustomId("prd_solution")
    .setLabel("Solution / What are you planning to build?")
    .setPlaceholder("Describe what you are planning to build...")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(600)
    .setValue(existing?.solution || "");

  const featuresInput = new TextInputBuilder()
    .setCustomId("prd_features")
    .setLabel("Core Features (3 to 5 essential features)")
    .setPlaceholder("1. Report items\n2. Search & filter\n3. Mark claimed")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(600)
    .setValue(existing?.core_features || "");

  const stackInput = new TextInputBuilder()
    .setCustomId("prd_stack")
    .setLabel("Tech Stack (Language / Framework / DB)")
    .setPlaceholder("e.g. React, Node.js, SQLite")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(250)
    .setValue(existing?.tech_stack || "");

  const outcomeInput = new TextInputBuilder()
    .setCustomId("prd_outcome")
    .setLabel("Stretch Features (Optional, 0-3 features)")
    .setPlaceholder("e.g. Image upload, push notifications (optional)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(500)
    .setValue(
      existing?.final_outcome
        ? existing.final_outcome
        : existing?.stretch_features || ""
    );

  modal.addComponents(
    new ActionRowBuilder().addComponents(problemInput),
    new ActionRowBuilder().addComponents(solutionInput),
    new ActionRowBuilder().addComponents(featuresInput),
    new ActionRowBuilder().addComponents(stackInput),
    new ActionRowBuilder().addComponents(outcomeInput)
  );

  return modal;
}

/**
 * Creates Step 3 PDF Link Modal
 * @param {object} [existing] 
 * @returns {ModalBuilder}
 */
function createPdfLinkModal(existing = null) {
  const modal = new ModalBuilder()
    .setCustomId("modal_prd_pdf_link")
    .setTitle("Proposal PDF — Step 3/3");

  const pdfInput = new TextInputBuilder()
    .setCustomId("prd_pdf_url")
    .setLabel("Completed Project Proposal PDF URL")
    .setPlaceholder("https://drive.google.com/... or https://github.com/.../proposal.pdf")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(300)
    .setValue(existing?.proposal_pdf_url || "");

  modal.addComponents(new ActionRowBuilder().addComponents(pdfInput));
  return modal;
}

/**
 * Builds Step 3 Proposal PDF Prompt
 * @param {object} draft 
 * @returns {{ embed: import("discord.js").EmbedBuilder, components: import("discord.js").ActionRowBuilder[] }}
 */
function buildStep3PdfPrompt(draft) {
  const existingPdfText = draft.proposal_pdf_url
    ? `\n\n📄 **Current Attached PDF:** [View Document](${draft.proposal_pdf_url})`
    : "";

  const embed = createBaseEmbed(
    "PROPOSAL PDF (STEP 3/3)",
    "Every BuildLab project proposal must include your completed **Project Proposal PDF**." +
      existingPdfText +
      "\n\nPlease provide your completed proposal document using one of the options below:\n\n" +
      "• **🔗 Enter PDF Link (Recommended):** Submit a Google Drive, Dropbox, or GitHub document link.\n" +
      "• **📤 Upload PDF File:** Drop a `.pdf` file in this channel within 60 seconds.",
    COLORS.DEFAULT
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("prd_pdf_enter_link")
      .setLabel("Enter PDF Link")
      .setEmoji("🔗")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("prd_pdf_upload_file")
      .setLabel("Upload PDF File")
      .setEmoji("📤")
      .setStyle(ButtonStyle.Secondary)
  );

  if (draft.proposal_pdf_url) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId("prd_pdf_keep_existing")
        .setLabel("Keep Existing PDF")
        .setEmoji("➡️")
        .setStyle(ButtonStyle.Success)
    );
  }

  row.addComponents(
    new ButtonBuilder()
      .setCustomId("prd_open_step2")
      .setLabel("Edit Details")
      .setEmoji("✏️")
      .setStyle(ButtonStyle.Secondary)
  );

  return { embed, components: [row] };
}

/**
 * Builds Step 4 Final Submission Summary view
 * @param {object} draft 
 * @returns {{ embed: import("discord.js").EmbedBuilder, components: import("discord.js").ActionRowBuilder[] }}
 */
function buildFinalSummary(draft) {
  const typeText = draft.problem_statement_id
    ? `BuildLab Problem Statement · ${draft.problem_statement_id}`
    : draft.project_type || "Own Idea";

  const teamFormat =
    draft.track === "Beginner"
      ? "Solo"
      : draft.track === "Intermediate"
      ? "Duo · 2 members"
      : "Squad · 3–4 members";

  const pdfDisplay = draft.proposal_pdf_url
    ? `✅ Attached ([View Document](${draft.proposal_pdf_url}))`
    : "❌ Missing";

  const embed = createBaseEmbed(
    "PROJECT PROPOSAL",
    "Please review your proposal summary before confirming submission:",
    COLORS.DEFAULT
  ).addFields(
    { name: "Project", value: draft.title || "Untitled", inline: true },
    { name: "Type", value: typeText, inline: true },
    { name: "Track", value: `${draft.track} · ${teamFormat}`, inline: true },
    { name: "Team", value: draft.team_members || "Solo", inline: false },
    { name: "Problem", value: (draft.problem_statement || "Not specified").slice(0, 500), inline: false },
    { name: "Solution", value: (draft.solution || "Not specified").slice(0, 500), inline: false },
    { name: "Core Features", value: (draft.core_features || "Not specified").slice(0, 500), inline: false },
    { name: "Stretch Features", value: (draft.final_outcome || draft.stretch_features || "None").slice(0, 300), inline: false },
    { name: "Tech Stack", value: draft.tech_stack || "Not specified", inline: true },
    { name: "GitHub", value: draft.repo_url ? `[${draft.repo_url}](${draft.repo_url})` : "Not linked", inline: true },
    { name: "Proposal PDF", value: pdfDisplay, inline: false }
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("prd_confirm_submit")
      .setLabel("SUBMIT PRD")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("start_submit_prd")
      .setLabel("EDIT")
      .setEmoji("✏️")
      .setStyle(ButtonStyle.Secondary)
  );

  return { embed, components: [row] };
}

/**
 * Builds a readable embed for viewing a PRD proposal
 * @param {object} prd 
 * @param {boolean} isStaff 
 * @returns {import("discord.js").EmbedBuilder}
 */
function buildPrdViewEmbed(prd, isStaff = false) {
  const statusColors = {
    Approved: COLORS.SUCCESS,
    Pending: COLORS.WARNING,
    "Changes Requested": COLORS.WARNING,
    Rejected: COLORS.DANGER,
  };

  const statusIcons = {
    Approved: "🟢 Approved",
    Pending: "🟡 Awaiting Review",
    "Changes Requested": "🟡 Changes Requested",
    Rejected: "🔴 Rejected",
  };

  const color = statusColors[prd.status] || COLORS.DEFAULT;
  const statusLabel = statusIcons[prd.status] || prd.status;

  const typeLabel = prd.problem_statement_id
    ? `BuildLab Problem Statement · ${prd.problem_statement_id}`
    : prd.project_type || "Own Idea";

  const embed = createBaseEmbed(
    `📋 ${prd.title} (${prd.id})`,
    `🆔 **Project ID:** \`${prd.id}\` • **Status:** ${statusLabel}\n` +
      `**Track:** **${prd.track}** • **Type:** ${typeLabel}\n` +
      `**Owner:** <@${prd.owner_id}> • **Team:** ${prd.team_members || "Solo"}`,
    color
  );

  if (prd.status_reason) {
    embed.addFields({
      name: "Mentor Feedback",
      value: `> *${prd.status_reason}*`,
      inline: false,
    });
  }

  embed.addFields(
    {
      name: "Problem",
      value: prd.problem_statement ? prd.problem_statement.slice(0, 1024) : "Not specified",
      inline: false,
    },
    {
      name: "Solution",
      value: prd.solution ? prd.solution.slice(0, 1024) : "Not specified",
      inline: false,
    },
    {
      name: "Core Features",
      value: prd.core_features ? prd.core_features.slice(0, 1024) : "Not specified",
      inline: false,
    },
    {
      name: "Tech Stack",
      value: prd.tech_stack || "Not specified",
      inline: true,
    },
    {
      name: "GitHub Repository",
      value: prd.repo_url ? `[${prd.repo_url}](${prd.repo_url})` : "Not linked",
      inline: true,
    },
    {
      name: "Proposal PDF",
      value: prd.proposal_pdf_url
        ? `[📎 View Proposal PDF](${prd.proposal_pdf_url})`
        : "⚠️ Not Attached",
      inline: true,
    }
  );

  if (prd.final_outcome || prd.stretch_features) {
    embed.addFields({
      name: "Stretch Features & Final Outcome",
      value: (prd.final_outcome || prd.stretch_features || "").slice(0, 1024),
      inline: false,
    });
  }

  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("prd")
    .setDescription("Submit or manage your project proposal")
    .addStringOption((opt) =>
      opt
        .setName("id")
        .setDescription("Project ID to view or review (optional)")
        .setRequired(false)
    ),

  /**
   * @param {import("discord.js").ChatInputCommandInteraction} interaction 
   */
  async execute(interaction) {
    const subcommand = typeof interaction.options?.getSubcommand === "function"
      ? interaction.options.getSubcommand(false)
      : null;
    const queryId = interaction.options?.getString ? interaction.options.getString("id") : null;

    // Subcommand: submit (compatibility with mocks/tests)
    if (subcommand === "submit") {
      const existing = getPrdByOwnerId(interaction.user.id);
      if (existing) {
        draftCache.set(interaction.user.id, { ...existing });
      }
      const modal = createStep1Modal(existing);
      return interaction.showModal(modal);
    }

    // View specific ID if provided
    if (queryId || subcommand === "view") {
      const targetId = queryId || (interaction.options?.getString ? interaction.options.getString("id") : null);
      let prd = targetId ? getPrdById(targetId) : getPrdByOwnerId(interaction.user.id);

      if (!prd) {
        return interaction.reply({
          embeds: [
            createErrorEmbed(
              "Proposal Not Found",
              targetId
                ? `No proposal found with ID \`${targetId}\`.`
                : "You haven't submitted a project proposal yet! Run `/start` or `/prd` to begin."
            ),
          ],
          ephemeral: true,
        });
      }

      const isStaff = isBuildLabTeam(interaction.member);
      const embed = buildPrdViewEmbed(prd, isStaff);
      const rows = [];

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

      if (prd.owner_id === interaction.user.id) {
        actionRow.addComponents(
          new ButtonBuilder()
            .setCustomId("prd_update_start")
            .setLabel("Update PRD")
            .setEmoji("✏️")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId("status_view_own")
            .setLabel("Status")
            .setEmoji("📊")
            .setStyle(ButtonStyle.Primary)
        );
        rows.push(actionRow);
      } else if (isStaff) {
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
        rows.push(actionRow);
      }

      return interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
    }

    // Subcommand: pending (Staff only)
    if (subcommand === "pending") {
      if (!isBuildLabTeam(interaction.member)) {
        return interaction.reply({
          content: getPermissionDeniedMessage("BuildLab Team"),
          ephemeral: true,
        });
      }

      await interaction.deferReply({ ephemeral: true });
      const pendingList = getPendingPrds();

      const embed = createBaseEmbed(
        "📋 PENDING PRD QUEUE",
        `There are **${pendingList.length}** proposals awaiting mentor review:`,
        COLORS.WARNING
      );

      if (pendingList.length === 0) {
        embed.setDescription("🎉 All project proposals have been reviewed! No submissions pending.");
        return interaction.editReply({ embeds: [embed] });
      }

      for (const p of pendingList.slice(0, 10)) {
        const pdfText = p.proposal_pdf_url ? ` • [📎 Proposal PDF](${p.proposal_pdf_url})` : "";
        embed.addFields({
          name: `${p.title} (\`${p.id}\`)`,
          value:
            `**Track:** ${p.track} • **Owner:** <@${p.owner_id}>\n` +
            `*Submitted <t:${Math.floor(new Date(p.created_at).getTime() / 1000)}:R>* • [Repository](${p.repo_url || "#"})${pdfText}`,
          inline: false,
        });
      }

      return interaction.editReply({ embeds: [embed] });
    }

    // Subcommand: approve (Staff only)
    if (subcommand === "approve") {
      if (!isBuildLabTeam(interaction.member)) {
        return interaction.reply({ content: getPermissionDeniedMessage("BuildLab Team"), ephemeral: true });
      }
      const id = interaction.options?.getString ? interaction.options.getString("id") : null;
      const feedback = (interaction.options?.getString ? interaction.options.getString("feedback") : null) || "Approved for BuildLab development.";
      const updated = updatePrdStatus(id, "Approved", feedback);
      if (!updated) {
        return interaction.reply({ embeds: [createErrorEmbed("Proposal Not Found", `No proposal found with ID \`${id}\`.`)], ephemeral: true });
      }
      if (updated.error) {
        return interaction.reply({
          embeds: [createErrorEmbed("Cannot Approve Duplicate Project", updated.error)],
          ephemeral: true,
        });
      }

      // Assign track role to all team members (owner + teammates) upon approval
      let roleInfo = "";
      if (interaction.guild) {
        const teamRoleResult = await assignTrackRoleToTeam(interaction.guild, updated);
        if (teamRoleResult.assignedMembers.length > 0) {
          roleInfo = `\n\n🎭 **Track Role Assigned:** @${updated.track} assigned to **${teamRoleResult.assignedMembers.length}** team member(s).`;
        }
      }

      return interaction.reply({
        embeds: [
          createSuccessEmbed(
            "🟢 PRD APPROVED",
            `**Project:** ${updated.title} (\`${updated.id}\`)\n` +
              `**Track:** ${updated.track}\n` +
              `**Owner:** <@${updated.owner_id}>\n\n` +
              `**Mentor Feedback:**\n> ${feedback}\n\n` +
              `The proposal is approved and project state is set to **DEVELOPMENT**.*${roleInfo}*`
          ),
        ],
      });
    }

    // Subcommand: changes (Staff only)
    if (subcommand === "changes") {
      if (!isBuildLabTeam(interaction.member)) {
        return interaction.reply({ content: getPermissionDeniedMessage("BuildLab Team"), ephemeral: true });
      }
      const id = interaction.options?.getString ? interaction.options.getString("id") : null;
      const reason = interaction.options?.getString ? interaction.options.getString("reason") : null;
      const updated = updatePrdStatus(id, "Changes Requested", reason);
      if (!updated) {
        return interaction.reply({ embeds: [createErrorEmbed("Proposal Not Found", `No proposal found with ID \`${id}\`.`)], ephemeral: true });
      }
      return interaction.reply({
        embeds: [
          createWarningEmbed(
            "🟡 CHANGES REQUESTED",
            `**Project:** ${updated.title} (\`${updated.id}\`)\n` +
              `**Owner:** <@${updated.owner_id}>\n\n` +
              `**Mentor Feedback:**\n> ${reason}`
          ),
        ],
      });
    }

    // Subcommand: reject (Staff only)
    if (subcommand === "reject") {
      if (!isBuildLabTeam(interaction.member)) {
        return interaction.reply({ content: getPermissionDeniedMessage("BuildLab Team"), ephemeral: true });
      }
      const id = interaction.options?.getString ? interaction.options.getString("id") : null;
      const reason = interaction.options?.getString ? interaction.options.getString("reason") : null;
      const updated = updatePrdStatus(id, "Rejected", reason);
      if (!updated) {
        return interaction.reply({ embeds: [createErrorEmbed("Proposal Not Found", `No proposal found with ID \`${id}\`.`)], ephemeral: true });
      }
      return interaction.reply({
        embeds: [
          createErrorEmbed(
            "🔴 PROPOSAL REJECTED",
            `**Project:** ${updated.title} (\`${updated.id}\`)\n` +
              `**Owner:** <@${updated.owner_id}>\n\n` +
              `**Reason:**\n> ${reason}`
          ),
        ],
      });
    }

    // DEFAULT: Central /prd entrypoint (Section 4 & Section 25)
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
    }

    const existingPrd = getPrdByOwnerId(interaction.user.id);
    const isStaff = isBuildLabTeam(interaction.member);

    if (!existingPrd) {
      const embed = createBaseEmbed(
        "PROJECT PROPOSAL",
        "Submit and manage your BuildLab project proposal.\n\n" +
          "Your proposal defines what you are building, your team format, tech stack, and proposal PDF.\n\n" +
          "Once submitted, your track role will be assigned automatically and you can begin development.",
        COLORS.DEFAULT
      );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("start_submit_prd")
          .setLabel("SUBMIT NEW PRD")
          .setEmoji("📝")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("start_view_projects")
          .setLabel("VIEW PROJECTS")
          .setEmoji("💡")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("start_get_help")
          .setLabel("GET HELP")
          .setEmoji("🆘")
          .setStyle(ButtonStyle.Secondary)
      );

      const rows = [row];
      if (isStaff) {
        const staffRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("staff_dash_prd")
            .setLabel("PENDING PRDS")
            .setEmoji("📋")
            .setStyle(ButtonStyle.Primary)
        );
        rows.push(staffRow);
      }

      if (interaction.deferred) return interaction.editReply({ embeds: [embed], components: rows });
      return interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
    }

    // Existing PRD view
    const statusIcons = {
      Approved: "🟢 Approved",
      Pending: "🟡 Awaiting Review",
      "Changes Requested": "🟡 Changes Requested",
      Rejected: "🔴 Rejected",
    };
    const statusText = statusIcons[existingPrd.status] || existingPrd.status;
    const pdfText = existingPrd.proposal_pdf_url
      ? `✅ Attached ([View Document](${existingPrd.proposal_pdf_url}))`
      : "⚠️ Missing";

    const embed = createBaseEmbed(
      "PROJECT PROPOSAL",
      `**PROJECT**\n${existingPrd.title} (\`${existingPrd.id}\`)\n\n` +
        `**TRACK**\n${existingPrd.track} · ${existingPrd.team_members || "Solo"}\n\n` +
        `**PRD STATUS**\n${statusText}\n\n` +
        `**PROPOSAL PDF**\n${pdfText}\n\n` +
        `**GITHUB**\n${existingPrd.repo_url ? `[Connected](${existingPrd.repo_url})` : "Not connected"}`,
      COLORS.DEFAULT
    );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("prd_view_own")
        .setLabel("VIEW MY PRD")
        .setEmoji("👁️")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("prd_update_start")
        .setLabel("UPDATE MY PRD")
        .setEmoji("✏️")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("status_view_own")
        .setLabel("STATUS")
        .setEmoji("📊")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("start_get_help")
        .setLabel("HELP")
        .setEmoji("🆘")
        .setStyle(ButtonStyle.Secondary)
    );

    const rows = [row];
    if (isStaff) {
      const staffRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("staff_dash_prd")
          .setLabel("PENDING PRDS")
          .setEmoji("📋")
          .setStyle(ButtonStyle.Primary)
      );
      rows.push(staffRow);
    }

    if (interaction.deferred) return interaction.editReply({ embeds: [embed], components: rows });
    return interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
  },

  // --------------------------------------------------------------------------
  // STEP 1 MODAL HANDLER
  // --------------------------------------------------------------------------
  async handleStep1Modal(interaction) {
    const rawTrack = interaction.fields.getTextInputValue("prd_track").trim();
    const rawType = interaction.fields.getTextInputValue("prd_type").trim();
    const teamMembers = interaction.fields.getTextInputValue("prd_team").trim();
    const title = interaction.fields.getTextInputValue("prd_title").trim();
    const repoInput = interaction.fields.getTextInputValue("prd_repo").trim();

    // 1. Validate Track
    const normTrack =
      rawTrack.toLowerCase().includes("beginner")
        ? "Beginner"
        : rawTrack.toLowerCase().includes("intermediate")
        ? "Intermediate"
        : rawTrack.toLowerCase().includes("advanced")
        ? "Advanced"
        : null;

    if (!normTrack) {
      return interaction.reply({
        embeds: [
          createErrorEmbed(
            "Invalid Track",
            `'${rawTrack}' is not recognized. Please choose **Beginner**, **Intermediate**, or **Advanced**.`
          ),
        ],
        ephemeral: true,
      });
    }

    // 2. Validate Team Size
    const teamValidation = validateTeamSize(normTrack, teamMembers, interaction.user);
    if (!teamValidation.valid) {
      return interaction.reply({
        embeds: [createErrorEmbed("TEAM SIZE INVALID", teamValidation.error)],
        ephemeral: true,
      });
    }

    // 3. Validate GitHub Repository URL
    const repoValidation = validateRepoUrl(repoInput);
    if (!repoValidation.valid) {
      return interaction.reply({
        embeds: [createErrorEmbed("INVALID GITHUB URL", repoValidation.error)],
        ephemeral: true,
      });
    }

    // Parse project type / PS ID
    let problemStatementId = null;
    let projectType = "Own Idea";
    const psMatch = rawType.match(/\b([A-Z]\d{2})\b/i);
    if (psMatch) {
      problemStatementId = psMatch[1].toUpperCase();
      projectType = "Catalogue Project";
    } else if (rawType.toLowerCase().includes("catalogue")) {
      projectType = "Catalogue Project";
    }

    // Load existing project to preserve proposal_pdf_url if available
    const existingPrd = getPrdByOwnerId(interaction.user.id);

    // Save Step 1 into user draft cache
    draftCache.set(interaction.user.id, {
      ...(existingPrd || {}),
      track: normTrack,
      project_type: projectType,
      problem_statement_id: problemStatementId,
      team_members: teamMembers,
      title,
      repo_url: repoValidation.repoUrl,
      proposal_pdf_url: existingPrd?.proposal_pdf_url || null,
    });

    const embed = createBaseEmbed(
      "📋 Step 1 Saved: " + title,
      `**Track:** ${normTrack} (${teamValidation.count} member${teamValidation.count === 1 ? "" : "s"})\n` +
        `**Type:** ${problemStatementId ? `Catalogue Project (${problemStatementId})` : projectType}\n` +
        `**Repository:** [${repoValidation.repoName}](${repoValidation.repoUrl})\n\n` +
        `Now tell us about what you’re planning to build! Click below for **Step 2: Project Details**.`,
      COLORS.SUCCESS
    );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("prd_open_step2")
        .setLabel("Continue to Step 2: Project Details")
        .setEmoji("➡️")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("start_submit_prd")
        .setLabel("Edit Step 1")
        .setEmoji("↩️")
        .setStyle(ButtonStyle.Secondary)
    );

    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  },

  // --------------------------------------------------------------------------
  // STEP 2 MODAL HANDLER
  // --------------------------------------------------------------------------
  async handleStep2Modal(interaction) {
    const draft = draftCache.get(interaction.user.id);
    if (!draft) {
      return interaction.reply({
        content: "⚠️ Your proposal session has expired. Please run `/prd` to restart.",
        ephemeral: true,
      });
    }

    const problem = interaction.fields.getTextInputValue("prd_problem").trim();
    const solution = interaction.fields.getTextInputValue("prd_solution").trim();
    const coreFeatures = interaction.fields.getTextInputValue("prd_features").trim();
    const techStack = interaction.fields.getTextInputValue("prd_stack").trim();
    const outcome = interaction.fields.getTextInputValue("prd_outcome")?.trim() || "";

    // Merge into draft
    draft.problem_statement = problem;
    draft.solution = solution;
    draft.core_features = coreFeatures;
    draft.tech_stack = techStack;
    draft.final_outcome = outcome;
    draft.stretch_features = outcome;

    // Transition to Step 3: Proposal PDF (Section 5 & 6)
    const { embed, components } = buildStep3PdfPrompt(draft);
    return interaction.reply({ embeds: [embed], components, ephemeral: true });
  },

  // --------------------------------------------------------------------------
  // STEP 3: PROPOSAL PDF MODAL & BUTTON HANDLERS
  // --------------------------------------------------------------------------
  async handlePdfLinkModal(interaction) {
    const draft = draftCache.get(interaction.user.id);
    if (!draft) {
      return interaction.reply({
        content: "⚠️ Your proposal session has expired. Please run `/prd` to restart.",
        ephemeral: true,
      });
    }

    const rawPdfUrl = interaction.fields.getTextInputValue("prd_pdf_url").trim();
    const validation = validatePdf(rawPdfUrl);

    if (!validation.valid) {
      return interaction.reply({
        embeds: [createErrorEmbed("PROPOSAL PDF REQUIRED", validation.error)],
        ephemeral: true,
      });
    }

    draft.proposal_pdf_url = validation.url;

    // Show Step 4 Final Summary
    const { embed, components } = buildFinalSummary(draft);
    const ackEmbed = createSuccessEmbed(
      "PDF RECEIVED",
      `Proposal PDF attached: [${validation.fileName}](${validation.url})\n\nPlease review your summary below and confirm submission:`
    );

    return interaction.reply({
      embeds: [ackEmbed, embed],
      components,
      ephemeral: true,
    });
  },

  async handlePdfUploadButton(interaction) {
    const draft = draftCache.get(interaction.user.id);
    if (!draft) {
      return interaction.reply({
        content: "⚠️ Your proposal session has expired. Please run `/prd` to restart.",
        ephemeral: true,
      });
    }

    const embed = createBaseEmbed(
      "PROPOSAL PDF",
      "Please upload your completed BuildLab Project Proposal PDF.\n\n" +
        "**[ WAITING FOR PDF ]**\n" +
        "Drop your completed `.pdf` file (or paste a Google Drive / document link) in this channel within 60 seconds.",
      COLORS.WARNING
    );

    await interaction.reply({ embeds: [embed], ephemeral: true });

    if (!interaction.channel || typeof interaction.channel.awaitMessages !== "function") {
      return;
    }

    const filter = (m) => m.author.id === interaction.user.id;
    try {
      const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 60000, errors: ["time"] });
      const msg = collected.first();
      const attachment = msg?.attachments?.first();

      // Check if user attached a file OR typed a link into the chat
      let validation = null;
      if (attachment) {
        validation = validatePdf(attachment);
      } else if (msg?.content) {
        const urlMatch = msg.content.match(/https?:\/\/[^\s]+/i);
        const candidateUrl = urlMatch ? urlMatch[0] : msg.content.trim();
        validation = validatePdf(candidateUrl);
      }

      const retryActionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("prd_pdf_enter_link")
          .setLabel("Enter PDF Link")
          .setEmoji("🔗")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("prd_pdf_upload_file")
          .setLabel("Try Upload Again")
          .setEmoji("📤")
          .setStyle(ButtonStyle.Secondary)
      );

      if (!validation) {
        return interaction.followUp({
          embeds: [
            createErrorEmbed(
              "PROPOSAL PDF REQUIRED",
              "No readable file attachment or link found.\n\n" +
                "💡 **Did you drop a file?**\n" +
                "If the bot does not receive the file attachment, Discord requires the **Message Content Intent** to be enabled for the bot in the Discord Developer Portal.\n\n" +
                "**Quick alternative:** Click **'Enter PDF Link'** below to paste your Google Drive, GitHub, or direct document link!"
            ),
          ],
          components: [retryActionRow],
          ephemeral: true,
        });
      }

      if (!validation.valid) {
        return interaction.followUp({
          embeds: [createErrorEmbed("PROPOSAL PDF REQUIRED", validation.error)],
          components: [retryActionRow],
          ephemeral: true,
        });
      }

      draft.proposal_pdf_url = validation.url;

      try {
        await msg.delete().catch(() => {});
      } catch {}

      const ackEmbed = createSuccessEmbed(
        "PDF RECEIVED",
        `Received **${validation.fileName}**!\n\nPlease review your summary below and confirm submission:`
      );

      const { embed: summaryEmbed, components } = buildFinalSummary(draft);
      return interaction.followUp({
        embeds: [ackEmbed, summaryEmbed],
        components,
        ephemeral: true,
      });
    } catch {
      // Timeout
      return interaction.followUp({
        embeds: [
          createWarningEmbed(
            "Upload Window Closed",
            "No PDF upload received within 60 seconds. Click below to try again or paste a PDF document link:"
          ),
        ],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("prd_pdf_enter_link")
              .setLabel("Enter PDF Link")
              .setEmoji("🔗")
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId("prd_pdf_upload_file")
              .setLabel("Upload PDF File")
              .setEmoji("📤")
              .setStyle(ButtonStyle.Secondary)
          ),
        ],
        ephemeral: true,
      });
    }
  },

  // --------------------------------------------------------------------------
  // STEP 5: CONFIRMATION & ATOMIC ROLE ASSIGNMENT
  // --------------------------------------------------------------------------
  async handleConfirmSubmit(interaction) {
    const draft = draftCache.get(interaction.user.id);
    if (!draft) {
      return interaction.reply({
        content: "⚠️ Proposal draft not found or session expired. Please run `/prd` to begin.",
        ephemeral: true,
      });
    }

    // Comprehensive Submission Validation (Section 18)
    if (!draft.title || !draft.title.trim()) {
      return interaction.reply({ embeds: [createErrorEmbed("Project Title Required", "Please provide a project title.")], ephemeral: true });
    }
    if (!draft.track) {
      return interaction.reply({ embeds: [createErrorEmbed("Track Required", "Please select a valid track.")], ephemeral: true });
    }
    const teamCheck = validateTeamSize(draft.track, draft.team_members, interaction.user);
    if (!teamCheck.valid) {
      return interaction.reply({ embeds: [createErrorEmbed("TEAM SIZE INVALID", teamCheck.error)], ephemeral: true });
    }
    const repoCheck = validateRepoUrl(draft.repo_url);
    if (!repoCheck.valid) {
      return interaction.reply({ embeds: [createErrorEmbed("INVALID GITHUB URL", repoCheck.error)], ephemeral: true });
    }
    if (!draft.problem_statement || !draft.problem_statement.trim()) {
      return interaction.reply({ embeds: [createErrorEmbed("Problem Statement Required", "Please describe what problem you are solving.")], ephemeral: true });
    }
    if (!draft.solution || !draft.solution.trim()) {
      return interaction.reply({ embeds: [createErrorEmbed("Proposed Solution Required", "Please describe what you are planning to build.")], ephemeral: true });
    }
    if (!draft.core_features || !draft.core_features.trim()) {
      return interaction.reply({ embeds: [createErrorEmbed("Core Features Required", "Please list 3 to 5 core features.")], ephemeral: true });
    }
    if (!draft.tech_stack || !draft.tech_stack.trim()) {
      return interaction.reply({ embeds: [createErrorEmbed("Tech Stack Required", "Please specify your technology stack.")], ephemeral: true });
    }

    // Require Proposal PDF (Section 5, 16, 18)
    if (!draft.proposal_pdf_url) {
      return interaction.reply({
        embeds: [
          createErrorEmbed(
            "❌ PROPOSAL PDF REQUIRED",
            "Please upload or link your completed BuildLab Project Proposal PDF before submitting."
          ),
        ],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("prd_pdf_enter_link")
              .setLabel("Enter PDF Link")
              .setEmoji("🔗")
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId("prd_pdf_upload_file")
              .setLabel("Upload PDF File")
              .setEmoji("📤")
              .setStyle(ButtonStyle.Secondary)
          ),
        ],
        ephemeral: true,
      });
    }

    // Double-click / duplicate submission protection (Section 31)
    if (draft.isSubmitting) {
      return interaction.reply({ content: "⏳ Submission in progress...", ephemeral: true });
    }
    draft.isSubmitting = true;

    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
    }

    try {
      // 1. Submit or update PRD in database as one coherent record
      const completeTeamString = teamCheck.count === 1
        ? (draft.track === "Beginner" ? "Solo" : teamCheck.members.join(", "))
        : teamCheck.members.join(", ");

      const prdData = {
        ...draft,
        team_members: completeTeamString,
        owner_id: interaction.user.id,
        milestones: `1. Setup repository & environment\n2. Core architecture & database\n3. ${draft.core_features.slice(0, 100)}\n4. Testing & integration\n5. Final demo & submission`,
      };

      const savedPrd = submitPrd(prdData);

      // 2. Automatically assign Track Role to submitter and valid teammates
      let roleText = `@${draft.track}`;
      let roleWarning = "";

      if (interaction.member) {
        const roleResult = await assignTrackRole(interaction.member, draft.track);
        if (roleResult.success && roleResult.assignedRole) {
          roleText = `@${roleResult.assignedRole.name}`;
        } else {
          console.error(`[ROLE ASSIGNMENT FAILURE] user=${interaction.user.id} track=${draft.track}: ${roleResult.message}`);
          roleWarning = "\n\n⚠️ **TRACK ROLE COULD NOT BE ASSIGNED AUTOMATICALLY.**\nPlease contact the BuildLab Team.";
        }
      }

      // Assign track role to teammates if present in guild
      if (interaction.guild?.members && teamCheck.teammates && teamCheck.teammates.length > 0) {
        for (const tm of teamCheck.teammates) {
          try {
            const idMatch = tm.match(/^<@!?(\d+)>$/) || tm.match(/^(\d{17,20})$/);
            let member = null;
            if (idMatch) {
              member = interaction.guild.members.cache?.get?.(idMatch[1]) ||
                (await interaction.guild.members.fetch?.(idMatch[1]).catch(() => null));
            } else if (interaction.guild.members.cache?.find) {
              const clean = cleanMemberToken(tm);
              member = interaction.guild.members.cache.find(
                (m) => m.user?.username?.toLowerCase() === clean
              );
            }
            if (member) {
              await assignTrackRole(member, draft.track).catch((err) => {
                console.warn(`Could not assign track role to teammate ${member.id}:`, err.message);
              });
            }
          } catch (err) {
            console.warn(`Teammate role assignment error for ${tm}:`, err.message);
          }
        }
      }

      // Clear draft cache
      draftCache.delete(interaction.user.id);

      // 3. Single clean success message (Section 24 & 45)
      const successEmbed = createSuccessEmbed(
        "✅ PROJECT REGISTERED",
        "Your proposal has been submitted successfully.\n\n" +
          `**PROJECT:**\n${savedPrd.title} (\`${savedPrd.id}\`)\n\n` +
          `**TRACK:**\n${savedPrd.track}\n\n` +
          `**PRD:**\n🟡 Awaiting Review\n\n` +
          `**PROPOSAL PDF:**\n✅ Attached\n\n` +
          `**GITHUB:**\n✅ Connected\n\n` +
          `**ROLE:**\n${roleText}${roleWarning}`
      );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("prd_view_own")
          .setLabel("VIEW PRD")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("start_get_help")
          .setLabel("GET HELP")
          .setStyle(ButtonStyle.Secondary)
      );

      if (interaction.deferred) {
        return interaction.editReply({ embeds: [successEmbed], components: [row] });
      }
      return interaction.reply({ embeds: [successEmbed], components: [row], ephemeral: true });
    } catch (saveErr) {
      draft.isSubmitting = false;
      console.error("[SUBMISSION FAILED] PRD Save error:", saveErr);
      const failEmbed = createErrorEmbed(
        "❌ SUBMISSION FAILED",
        "Something went wrong while saving your proposal. Please try again or contact the BuildLab Team."
      );
      if (interaction.deferred) {
        return interaction.editReply({ embeds: [failEmbed] });
      }
      return interaction.reply({ embeds: [failEmbed], ephemeral: true });
    }
  },

  // Helper functions exposed for interactionCreate events and tests
  createStep1Modal,
  createStep2Modal,
  createPdfLinkModal,
  buildStep3PdfPrompt,
  buildFinalSummary,
  buildPrdViewEmbed,
  draftCache,
};
