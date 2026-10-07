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
} = require("../services/prd");
const { assignTrackRole } = require("../services/roles");
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
    .setTitle("Project Proposal — Step 1/2");

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

  const teamInput = new TextInputBuilder()
    .setCustomId("prd_team")
    .setLabel("Team Members (Solo or @partner mentions)")
    .setPlaceholder("e.g. Solo (for Beginner) or @teammate")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(150)
    .setValue(existing?.team_members || "Solo");

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
    .setTitle("Project Proposal — Step 2/2");

  const problemInput = new TextInputBuilder()
    .setCustomId("prd_problem")
    .setLabel("Problem (What are you trying to solve?)")
    .setPlaceholder("Describe the core problem and who it impacts...")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(600)
    .setValue(existing?.problem_statement || "");

  const solutionInput = new TextInputBuilder()
    .setCustomId("prd_solution")
    .setLabel("Solution / What are you going to build?")
    .setPlaceholder("Describe your solution and core architecture idea...")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(600)
    .setValue(existing?.solution || "");

  const featuresInput = new TextInputBuilder()
    .setCustomId("prd_features")
    .setLabel("Core Features (List 3 to 5 main features)")
    .setPlaceholder("1. User report form\n2. Search & filter\n3. Notification alert")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(600)
    .setValue(existing?.core_features || "");

  const stackInput = new TextInputBuilder()
    .setCustomId("prd_stack")
    .setLabel("Tech Stack & What you need to learn")
    .setPlaceholder("e.g. React, Node.js, SQLite. Learning: REST APIs")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(250)
    .setValue(existing?.tech_stack || "");

  const outcomeInput = new TextInputBuilder()
    .setCustomId("prd_outcome")
    .setLabel("Final Outcome / Stretch Features (Optional)")
    .setPlaceholder("Expected finished project state and any stretch goals...")
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
    ? `Catalogue Project · \`${prd.problem_statement_id}\``
    : prd.project_type || "Own Idea";

  const embed = createBaseEmbed(
    `📋 ${prd.title}`,
    `**Project ID:** \`${prd.id}\` • **Status:** ${statusLabel}\n` +
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
      name: "Problem Statement",
      value: prd.problem_statement ? prd.problem_statement.slice(0, 1024) : "Not specified",
      inline: false,
    },
    {
      name: "Proposed Solution",
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
    }
  );

  if (prd.final_outcome || prd.stretch_features) {
    embed.addFields({
      name: "Final Outcome & Stretch Goals",
      value: (prd.final_outcome || prd.stretch_features || "").slice(0, 1024),
      inline: false,
    });
  }

  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("prd")
    .setDescription("Submit or check your project proposal")
    .addSubcommand((sub) =>
      sub
        .setName("submit")
        .setDescription("Open the simple project proposal submission form")
    )
    .addSubcommand((sub) =>
      sub
        .setName("view")
        .setDescription("View details of a project proposal")
        .addStringOption((opt) =>
          opt
            .setName("id")
            .setDescription("Project ID (e.g. BL-PRD-001) or leave empty for your own")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("pending")
        .setDescription("View all pending project proposals (Team only)")
    )
    .addSubcommand((sub) =>
      sub
        .setName("approve")
        .setDescription("Approve a project proposal (Team only)")
        .addStringOption((opt) =>
          opt
            .setName("id")
            .setDescription("The Project ID (e.g. BL-PRD-001)")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("feedback")
            .setDescription("Mentor feedback or approval note")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("changes")
        .setDescription("Request revisions on a proposal (Team only)")
        .addStringOption((opt) =>
          opt
            .setName("id")
            .setDescription("The Project ID (e.g. BL-PRD-001)")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("reason")
            .setDescription("Details and changes required")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("reject")
        .setDescription("Reject a project proposal (Team only)")
        .addStringOption((opt) =>
          opt
            .setName("id")
            .setDescription("The Project ID (e.g. BL-PRD-001)")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("reason")
            .setDescription("Reason for rejection")
            .setRequired(true)
        )
    ),

  /**
   * @param {import("discord.js").ChatInputCommandInteraction} interaction 
   */
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand(false);

    // Default / No subcommand / submit
    if (!subcommand || subcommand === "submit") {
      const existing = getPrdByOwnerId(interaction.user.id);
      const modal = createStep1Modal(existing);
      return interaction.showModal(modal);
    }

    // SUBCOMMAND: view
    if (subcommand === "view") {
      const queryId = interaction.options.getString("id");
      let prd = null;

      if (queryId) {
        prd = getPrdById(queryId);
      } else {
        prd = getPrdByOwnerId(interaction.user.id);
      }

      if (!prd) {
        return interaction.reply({
          embeds: [
            createErrorEmbed(
              "Proposal Not Found",
              queryId
                ? `No proposal found with ID \`${queryId}\`.`
                : "You haven't submitted a project proposal yet! Use `/start` or `/prd submit` to begin."
            ),
          ],
          ephemeral: true,
        });
      }

      const isStaff = isBuildLabTeam(interaction.member);
      const embed = buildPrdViewEmbed(prd, isStaff);

      const rows = [];
      if (prd.owner_id === interaction.user.id) {
        rows.push(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("prd_update_start")
              .setLabel("Update PRD")
              .setEmoji("✏️")
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId("status_view_own")
              .setLabel("Check Status")
              .setEmoji("📊")
              .setStyle(ButtonStyle.Primary)
          )
        );
      } else if (isStaff && prd.status === "Pending") {
        rows.push(
          new ActionRowBuilder().addComponents(
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
          )
        );
      }

      return interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
    }

    // SUBCOMMAND: pending (Staff only)
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
        "📋 Pending Project Proposals",
        `There are **${pendingList.length}** proposals awaiting mentor review:`,
        COLORS.WARNING
      );

      if (pendingList.length === 0) {
        embed.setDescription("🎉 All project proposals have been reviewed! No submissions pending.");
        return interaction.editReply({ embeds: [embed] });
      }

      for (const p of pendingList.slice(0, 10)) {
        embed.addFields({
          name: `${p.title} (\`${p.id}\`)`,
          value:
            `**Track:** ${p.track} • **Owner:** <@${p.owner_id}>\n` +
            `*Submitted <t:${Math.floor(new Date(p.created_at).getTime() / 1000)}:R>* • [Repository](${p.repo_url || "#"})`,
          inline: false,
        });
      }

      return interaction.editReply({ embeds: [embed] });
    }

    // SUBCOMMAND: approve (Staff only)
    if (subcommand === "approve") {
      if (!isBuildLabTeam(interaction.member)) {
        return interaction.reply({
          content: getPermissionDeniedMessage("BuildLab Team"),
          ephemeral: true,
        });
      }

      const id = interaction.options.getString("id");
      const feedback = interaction.options.getString("feedback") || "Approved for BuildLab development.";

      const updated = updatePrdStatus(id, "Approved", feedback);
      if (!updated) {
        return interaction.reply({
          embeds: [createErrorEmbed("Proposal Not Found", `No proposal found with ID \`${id}\`.`)],
          ephemeral: true,
        });
      }

      const embed = createSuccessEmbed(
        "Project Proposal Approved! 🎉",
        `**Project:** ${updated.title} (\`${updated.id}\`)\n` +
          `**Track:** ${updated.track}\n` +
          `**Lead:** <@${updated.owner_id}>\n\n` +
          `**Mentor Feedback:**\n> ${feedback}\n\n` +
          `The project has transitioned to **DEVELOPMENT** and milestone tracking is initialized.`
      );

      return interaction.reply({ embeds: [embed] });
    }

    // SUBCOMMAND: changes (Staff only)
    if (subcommand === "changes") {
      if (!isBuildLabTeam(interaction.member)) {
        return interaction.reply({
          content: getPermissionDeniedMessage("BuildLab Team"),
          ephemeral: true,
        });
      }

      const id = interaction.options.getString("id");
      const reason = interaction.options.getString("reason");

      const updated = updatePrdStatus(id, "Changes Requested", reason);
      if (!updated) {
        return interaction.reply({
          embeds: [createErrorEmbed("Proposal Not Found", `No proposal found with ID \`${id}\`.`)],
          ephemeral: true,
        });
      }

      const embed = createWarningEmbed(
        "Changes Requested on Proposal",
        `**Project:** ${updated.title} (\`${updated.id}\`)\n` +
          `**Owner:** <@${updated.owner_id}>\n\n` +
          `**Required Changes:**\n> ${reason}\n\n` +
          `The participant has been notified to update their PRD using \`/prd\`.`
      );

      return interaction.reply({ embeds: [embed] });
    }

    // SUBCOMMAND: reject (Staff only)
    if (subcommand === "reject") {
      if (!isBuildLabTeam(interaction.member)) {
        return interaction.reply({
          content: getPermissionDeniedMessage("BuildLab Team"),
          ephemeral: true,
        });
      }

      const id = interaction.options.getString("id");
      const reason = interaction.options.getString("reason");

      const updated = updatePrdStatus(id, "Rejected", reason);
      if (!updated) {
        return interaction.reply({
          embeds: [createErrorEmbed("Proposal Not Found", `No proposal found with ID \`${id}\`.`)],
          ephemeral: true,
        });
      }

      const embed = createErrorEmbed(
        "Proposal Rejected",
        `**Project:** ${updated.title} (\`${updated.id}\`)\n` +
          `**Owner:** <@${updated.owner_id}>\n\n` +
          `**Reason:**\n> ${reason}`
      );

      return interaction.reply({ embeds: [embed] });
    }
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
            `'${rawTrack}' is not recognized. Please specify **Beginner**, **Intermediate**, or **Advanced**.`
          ),
        ],
        ephemeral: true,
      });
    }

    // 2. Validate Team Size
    const teamValidation = validateTeamSize(normTrack, teamMembers, interaction.user);
    if (!teamValidation.valid) {
      return interaction.reply({
        embeds: [createErrorEmbed("Team Size Mismatch", teamValidation.error)],
        ephemeral: true,
      });
    }

    // 3. Validate GitHub Repository URL
    const repoValidation = validateRepoUrl(repoInput);
    if (!repoValidation.valid) {
      return interaction.reply({
        embeds: [createErrorEmbed("Invalid GitHub Repository", repoValidation.error)],
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

    // Save Step 1 into user draft cache
    draftCache.set(interaction.user.id, {
      track: normTrack,
      project_type: projectType,
      problem_statement_id: problemStatementId,
      team_members: teamMembers,
      title,
      repo_url: repoValidation.repoUrl,
    });

    const existingPrd = getPrdByOwnerId(interaction.user.id);

    const embed = createBaseEmbed(
      "📋 Step 1 Saved: " + title,
      `**Track:** ${normTrack} (${teamValidation.count} member${teamValidation.count === 1 ? "" : "s"})\n` +
        `**Type:** ${problemStatementId ? `Catalogue Project (${problemStatementId})` : projectType}\n` +
        `**Repository:** [${repoValidation.repoName}](${repoValidation.repoUrl})\n\n` +
        `Now tell us about what you’re building! Click below to complete **Step 2: Project Details**.`,
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
        content: "⚠️ Your proposal session has expired. Please run `/prd submit` to restart.",
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

    // Show Confirmation Preview (Section 15)
    const typeText = draft.problem_statement_id
      ? `Catalogue Project · ${draft.problem_statement_id}`
      : draft.project_type || "Own Idea";

    const embed = createBaseEmbed(
      "📋 PROJECT PROPOSAL PREVIEW",
      "Please review your proposal summary before submitting:",
      COLORS.DEFAULT
    ).addFields(
      { name: "Project Title", value: `**${draft.title}**`, inline: true },
      { name: "Track & Format", value: `**${draft.track}** (${draft.team_members})`, inline: true },
      { name: "Project Type", value: typeText, inline: true },
      { name: "Repository", value: `[GitHub Link](${draft.repo_url})`, inline: false },
      { name: "Problem", value: draft.problem_statement.slice(0, 500), inline: false },
      { name: "Solution", value: draft.solution.slice(0, 500), inline: false },
      { name: "Core Features", value: draft.core_features.slice(0, 500), inline: false },
      { name: "Tech Stack", value: draft.tech_stack, inline: true },
      { name: "Expected Outcome", value: draft.final_outcome ? draft.final_outcome.slice(0, 300) : "Not specified", inline: false }
    );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("prd_confirm_submit")
        .setLabel("Submit PRD")
        .setEmoji("✅")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("prd_restart")
        .setLabel("Edit")
        .setEmoji("✏️")
        .setStyle(ButtonStyle.Secondary)
    );

    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  },

  // --------------------------------------------------------------------------
  // CONFIRMATION & AUTOMATIC ROLE ASSIGNMENT HANDLER
  // --------------------------------------------------------------------------
  async handleConfirmSubmit(interaction) {
    const draft = draftCache.get(interaction.user.id);
    if (!draft) {
      return interaction.reply({
        content: "⚠️ Proposal draft not found or session expired. Please run `/prd submit` to begin.",
        ephemeral: true,
      });
    }

    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
    }

    // 1. Submit or update PRD in database
    const prdData = {
      ...draft,
      owner_id: interaction.user.id,
      milestones: `1. Setup repository & environment\n2. Core architecture & database\n3. ${draft.core_features.slice(0, 100)}\n4. Testing & integration\n5. Final demo & submission`,
    };

    const savedPrd = submitPrd(prdData);

    // 2. Automatically assign Track Role and clean up conflicting track roles
    let roleMessage = "";
    if (interaction.member) {
      const roleResult = await assignTrackRole(interaction.member, draft.track);
      if (roleResult.success && roleResult.assignedRole) {
        roleMessage = `🏷️ Assigned **@${roleResult.assignedRole.name}** role`;
        if (roleResult.removedRoles.length > 0) {
          roleMessage += ` *(removed conflicting: ${roleResult.removedRoles.join(", ")})*`;
        }
      } else {
        console.warn(`[PRD ROLE WARNING] Could not assign role: ${roleResult.message}`);
        roleMessage = `⚠️ *Note: Role assignment could not complete (${roleResult.message}). Mentors have been alerted.*`;
      }
    }

    // Clear draft cache
    draftCache.delete(interaction.user.id);

    // 3. Send Single Clean Confirmation (Section 16 & 47)
    const successEmbed = createSuccessEmbed(
      "✅ YOUR PROJECT IS REGISTERED",
      `Your proposal has been recorded and submitted for mentor review!\n\n` +
        `**Project:** ${savedPrd.title} (\`${savedPrd.id}\`)\n` +
        `**Track:** **${savedPrd.track}**\n` +
        `**Role:** ${roleMessage}\n` +
        `**Repository:** [Connected GitHub Repository](${savedPrd.repo_url})\n` +
        `**Status:** 🟡 **Awaiting Review**\n\n` +
        `You're ready to start building! Head over to your track channel to connect with mentors.`
    );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("prd_view_own")
        .setLabel("View PRD")
        .setEmoji("👁️")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("start_get_help")
        .setLabel("Get Help")
        .setEmoji("🆘")
        .setStyle(ButtonStyle.Secondary)
    );

    if (interaction.deferred) {
      return interaction.editReply({ embeds: [successEmbed], components: [row] });
    }
    return interaction.reply({ embeds: [successEmbed], components: [row], ephemeral: true });
  },

  // Helper functions exposed for interactionCreate buttons
  createStep1Modal,
  createStep2Modal,
  buildPrdViewEmbed,
  draftCache,
};
