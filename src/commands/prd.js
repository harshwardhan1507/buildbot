const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require("discord.js");
const {
  submitPrd,
  getPrdById,
  getPendingPrds,
  updatePrdStatus,
  getPrdByOwnerId,
} = require("../services/prd");
const { isBuildLabTeam, getMemberTrack, getPermissionDeniedMessage } = require("../utils/permissions");
const { createBaseEmbed, createSuccessEmbed, createWarningEmbed, createErrorEmbed, COLORS } = require("../utils/embeds");
const config = require("../config/config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("prd")
    .setDescription("Manage and review BuildLab Project Requirements Documents (PRDs)")
    .addSubcommand((sub) =>
      sub
        .setName("submit")
        .setDescription("Open the PRD submission form")
    )
    .addSubcommand((sub) =>
      sub
        .setName("pending")
        .setDescription("View all pending PRD submissions (Team only)")
    )
    .addSubcommand((sub) =>
      sub
        .setName("view")
        .setDescription("View details of a specific PRD")
        .addStringOption((opt) =>
          opt
            .setName("id")
            .setDescription("The PRD ID (e.g. BL-PRD-001) or leave empty for your own")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("approve")
        .setDescription("Approve a PRD submission (Team only)")
        .addStringOption((opt) =>
          opt
            .setName("id")
            .setDescription("The PRD ID (e.g. BL-PRD-001)")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("feedback")
            .setDescription("Optional feedback or mentor notes")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("changes")
        .setDescription("Request changes on a PRD (Team only)")
        .addStringOption((opt) =>
          opt
            .setName("id")
            .setDescription("The PRD ID (e.g. BL-PRD-001)")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("reason")
            .setDescription("Detailed reason and changes required")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("reject")
        .setDescription("Reject a PRD submission (Team only)")
        .addStringOption((opt) =>
          opt
            .setName("id")
            .setDescription("The PRD ID (e.g. BL-PRD-001)")
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
    const subcommand = interaction.options.getSubcommand();
    const member = interaction.member;

    // ----------------------------------------------------
    // SUBCOMMAND: submit
    // ----------------------------------------------------
    if (subcommand === "submit") {
      const userTrack = getMemberTrack(member) || "Beginner";
      const existing = getPrdByOwnerId(interaction.user.id);

      const modal = new ModalBuilder()
        .setCustomId("modal_prd_submit")
        .setTitle("BuildLab ’26 PRD Submission");

      const titleInput = new TextInputBuilder()
        .setCustomId("prd_title")
        .setLabel("Project Title")
        .setPlaceholder("e.g. Campus Expense Tracker")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100)
        .setValue(existing?.title || "");

      const teamInput = new TextInputBuilder()
        .setCustomId("prd_team")
        .setLabel("Track & Team Members")
        .setPlaceholder("e.g. Intermediate | @alice, @bob")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(150)
        .setValue(
          existing
            ? `${existing.track} | ${existing.team_members || ""}`
            : `${userTrack} | @${interaction.user.username}`
        );

      const problemInput = new TextInputBuilder()
        .setCustomId("prd_problem")
        .setLabel("Problem Statement & Target Users")
        .setPlaceholder("What problem does this solve and who is it built for?")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000)
        .setValue(
          existing
            ? `${existing.problem_statement}\nTarget Users: ${existing.target_users}`
            : ""
        );

      const featuresInput = new TextInputBuilder()
        .setCustomId("prd_features")
        .setLabel("Core & Stretch Features")
        .setPlaceholder("Core Features:\n- Feature 1\n\nStretch Features:\n- Feature 2")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000)
        .setValue(
          existing
            ? `Core: ${existing.core_features}\nStretch: ${existing.stretch_features}`
            : ""
        );

      const techInput = new TextInputBuilder()
        .setCustomId("prd_tech")
        .setLabel("Tech Stack & Milestones")
        .setPlaceholder("Tech Stack: Node.js, React, SQLite\nMilestones: Week 1 MVP, Week 2 Polish")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000)
        .setValue(
          existing
            ? `Tech Stack: ${existing.tech_stack}\nMilestones: ${existing.milestones}`
            : ""
        );

      modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(teamInput),
        new ActionRowBuilder().addComponents(problemInput),
        new ActionRowBuilder().addComponents(featuresInput),
        new ActionRowBuilder().addComponents(techInput)
      );

      return interaction.showModal(modal);
    }

    // ----------------------------------------------------
    // SUBCOMMAND: pending (Team only)
    // ----------------------------------------------------
    if (subcommand === "pending") {
      if (!isBuildLabTeam(member)) {
        return interaction.reply({
          content: getPermissionDeniedMessage("BuildLab Team"),
          ephemeral: true,
        });
      }

      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
      }

      const pending = getPendingPrds();
      if (pending.length === 0) {
        const embed = createBaseEmbed("📋 Pending PRD Submissions", "There are currently no PRDs waiting for review.", COLORS.DEFAULT);
        if (interaction.deferred) return interaction.editReply({ embeds: [embed] });
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      const embed = createBaseEmbed("📋 Pending PRD Submissions", `Total pending: **${pending.length}**\n\nUse \`/prd view <id>\` or \`/prd approve <id>\` to review.`, COLORS.WARNING);

      for (const item of pending.slice(0, 10)) {
        embed.addFields({
          name: `${item.id}: ${item.title}`,
          value: `**Track:** ${item.track} • **Owner:** <@${item.owner_id}>\n**Submitted:** <t:${Math.floor(new Date(item.created_at).getTime() / 1000)}:R>`,
          inline: false,
        });
      }

      if (interaction.deferred) return interaction.editReply({ embeds: [embed] });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ----------------------------------------------------
    // SUBCOMMAND: view
    // ----------------------------------------------------
    if (subcommand === "view") {
      const isEphemeral = !isBuildLabTeam(member);
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: isEphemeral });
      }

      let prdId = interaction.options.getString("id");

      let prd = null;
      if (prdId) {
        prd = getPrdById(prdId);
      } else {
        prd = getPrdByOwnerId(interaction.user.id);
      }

      if (!prd) {
        const errEmbed = createErrorEmbed(
          "PRD Not Found",
          prdId
            ? `Could not find a PRD with ID \`${prdId}\`.`
            : "You have not submitted a PRD yet. Use `/prd submit` to get started."
        );
        if (interaction.deferred) return interaction.editReply({ embeds: [errEmbed] });
        return interaction.reply({ embeds: [errEmbed], ephemeral: isEphemeral });
      }

      // Check permission: normal participants can only view their own PRD
      if (!isBuildLabTeam(member) && prd.owner_id !== interaction.user.id) {
        const content = "❌ You can only view your own PRD.";
        if (interaction.deferred) return interaction.editReply({ content });
        return interaction.reply({ content, ephemeral: true });
      }

      const statusColors = {
        Pending: COLORS.WARNING,
        "Changes Requested": COLORS.INFO,
        Approved: COLORS.SUCCESS,
        Rejected: COLORS.ERROR,
      };

      const statusEmoji = {
        Pending: "🟡",
        "Changes Requested": "🔵",
        Approved: "🟢",
        Rejected: "🔴",
      };

      const embed = createBaseEmbed(
        `📋 PRD: ${prd.title}`,
        `**ID:** \`${prd.id}\`\n**Status:** ${statusEmoji[prd.status] || "⚪"} **${prd.status}**`,
        statusColors[prd.status] || COLORS.DEFAULT
      )
        .addFields(
          { name: "Track", value: prd.track, inline: true },
          { name: "Owner", value: `<@${prd.owner_id}>`, inline: true },
          { name: "Mentor", value: prd.mentor_id ? `<@${prd.mentor_id}>` : "Unassigned", inline: true },
          { name: "Team Members", value: prd.team_members || "None listed", inline: false },
          { name: "Problem Statement & Users", value: prd.problem_statement || "N/A", inline: false },
          { name: "Features", value: prd.core_features || "N/A", inline: false },
          { name: "Tech Stack & Milestones", value: prd.tech_stack || "N/A", inline: false }
        );

      if (prd.status_reason) {
        embed.addFields({
          name: "Reviewer Feedback / Reason",
          value: prd.status_reason,
          inline: false,
        });
      }

      if (interaction.deferred) return interaction.editReply({ embeds: [embed] });
      return interaction.reply({ embeds: [embed], ephemeral: isEphemeral });
    }

    // ----------------------------------------------------
    // SUBCOMMAND: approve (Team only)
    // ----------------------------------------------------
    if (subcommand === "approve") {
      if (!isBuildLabTeam(member)) {
        return interaction.reply({
          content: getPermissionDeniedMessage("BuildLab Team"),
          ephemeral: true,
        });
      }

      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
      }

      const prdId = interaction.options.getString("id");
      const feedback = interaction.options.getString("feedback");

      const prd = getPrdById(prdId);
      if (!prd) {
        const notFoundEmbed = createErrorEmbed("PRD Not Found", `No PRD found with ID \`${prdId}\`.`);
        if (interaction.deferred) return interaction.editReply({ embeds: [notFoundEmbed] });
        return interaction.reply({ embeds: [notFoundEmbed], ephemeral: true });
      }

      const updated = updatePrdStatus(prdId, "Approved", feedback);

      const embed = createSuccessEmbed(
        "PRD Approved",
        `**PRD:** \`${updated.id}\`\n**Project:** ${updated.title}\n**Track:** ${updated.track}\n**Owner:** <@${updated.owner_id}>\n\n🚀 You may now begin development!`
      );

      if (feedback) {
        embed.addFields({ name: "Mentor Feedback", value: feedback });
      }

      if (interaction.deferred) return interaction.editReply({ embeds: [embed] });
      return interaction.reply({ embeds: [embed] });
    }

    // ----------------------------------------------------
    // SUBCOMMAND: changes (Team only)
    // ----------------------------------------------------
    if (subcommand === "changes") {
      if (!isBuildLabTeam(member)) {
        return interaction.reply({
          content: getPermissionDeniedMessage("BuildLab Team"),
          ephemeral: true,
        });
      }

      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
      }

      const prdId = interaction.options.getString("id");
      const reason = interaction.options.getString("reason");

      const prd = getPrdById(prdId);
      if (!prd) {
        const notFoundEmbed = createErrorEmbed("PRD Not Found", `No PRD found with ID \`${prdId}\`.`);
        if (interaction.deferred) return interaction.editReply({ embeds: [notFoundEmbed] });
        return interaction.reply({ embeds: [notFoundEmbed], ephemeral: true });
      }

      const updated = updatePrdStatus(prdId, "Changes Requested", reason);

      const embed = createWarningEmbed(
        "Changes Requested",
        `**PRD:** \`${updated.id}\`\n**Project:** ${updated.title}\n**Owner:** <@${updated.owner_id}>\n\n**Reason / Required Changes:**\n${reason}\n\n*The participant can resubmit using \`/prd submit\`.*`
      );

      if (interaction.deferred) return interaction.editReply({ embeds: [embed] });
      return interaction.reply({ embeds: [embed] });
    }

    // ----------------------------------------------------
    // SUBCOMMAND: reject (Team only)
    // ----------------------------------------------------
    if (subcommand === "reject") {
      if (!isBuildLabTeam(member)) {
        return interaction.reply({
          content: getPermissionDeniedMessage("BuildLab Team"),
          ephemeral: true,
        });
      }

      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
      }

      const prdId = interaction.options.getString("id");
      const reason = interaction.options.getString("reason");

      const prd = getPrdById(prdId);
      if (!prd) {
        const notFoundEmbed = createErrorEmbed("PRD Not Found", `No PRD found with ID \`${prdId}\`.`);
        if (interaction.deferred) return interaction.editReply({ embeds: [notFoundEmbed] });
        return interaction.reply({ embeds: [notFoundEmbed], ephemeral: true });
      }

      const updated = updatePrdStatus(prdId, "Rejected", reason);

      const embed = createErrorEmbed(
        "PRD Rejected",
        `**PRD:** \`${updated.id}\`\n**Project:** ${updated.title}\n**Owner:** <@${updated.owner_id}>\n\n**Reason:**\n${reason}`
      );

      if (interaction.deferred) return interaction.editReply({ embeds: [embed] });
      return interaction.reply({ embeds: [embed] });
    }
  },

  /**
   * Modal submission handler
   * @param {import("discord.js").ModalSubmitInteraction} interaction 
   */
  async handleModal(interaction) {
    if (interaction.customId !== "modal_prd_submit") return;

    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
    }

    const title = interaction.fields.getTextInputValue("prd_title").trim();
    const teamRaw = interaction.fields.getTextInputValue("prd_team").trim();
    const problem = interaction.fields.getTextInputValue("prd_problem").trim();
    const features = interaction.fields.getTextInputValue("prd_features").trim();
    const tech = interaction.fields.getTextInputValue("prd_tech").trim();

    // Parse track from teamRaw if specified (e.g. "Intermediate | @alice")
    let track = getMemberTrack(interaction.member) || "Beginner";
    let teamMembers = teamRaw;

    if (teamRaw.includes("|")) {
      const parts = teamRaw.split("|");
      const candidateTrack = parts[0].trim();
      const match = config.trackNames.find(
        (t) => t.toLowerCase() === candidateTrack.toLowerCase()
      );
      if (match) {
        track = match;
        teamMembers = parts.slice(1).join("|").trim();
      }
    }

    const prd = submitPrd({
      title,
      track,
      owner_id: interaction.user.id,
      team_members: teamMembers,
      problem_statement: problem,
      target_users: "Defined in problem statement",
      core_features: features,
      stretch_features: "Defined in features breakdown",
      tech_stack: tech,
      milestones: "Defined in tech & milestones",
      success_criteria: "Functioning MVP meeting track criteria",
      risks_dependencies: "None reported",
    });

    const embed = createBaseEmbed("📋 PRD Submitted", "", COLORS.SUCCESS)
      .addFields(
        { name: "Project", value: prd.title, inline: false },
        { name: "PRD ID", value: `\`${prd.id}\``, inline: true },
        { name: "Track", value: prd.track, inline: true },
        { name: "Status", value: "🟡 Pending Review", inline: true }
      )
      .setDescription(
        "Your PRD has been submitted to the BuildLab Team for review. You will receive an update once a mentor evaluates your submission."
      );

    if (interaction.deferred) {
      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // Notify team in #team-coordination
    try {
      const teamChannel = interaction.guild.channels.cache.find(
        (c) => c.name === config.channels.teamCoordination
      );
      if (teamChannel && teamChannel.isTextBased()) {
        const notifyEmbed = createBaseEmbed(
          "📬 New PRD Submission",
          `A new PRD has been submitted by <@${interaction.user.id}> and requires review.`,
          COLORS.WARNING
        ).addFields(
          { name: "Project", value: prd.title, inline: true },
          { name: "PRD ID", value: `\`${prd.id}\``, inline: true },
          { name: "Track", value: prd.track, inline: true },
          { name: "Action", value: `Use \`/prd view ${prd.id}\` to inspect.`, inline: false }
        );

        await teamChannel.send({ embeds: [notifyEmbed] });
      }
    } catch (e) {
      console.error("Failed to notify team channel:", e.message);
    }
  },
};
