const {
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const db = require("./database");
const config = require("../config/config");
const { createBaseEmbed, COLORS } = require("../utils/embeds");

/**
 * Format ticket number to 4-digit string
 * @param {number} num 
 * @returns {string} e.g. "0042"
 */
function formatTicketNumber(num) {
  return String(num).padStart(4, "0");
}

/**
 * Generate next sequential ticket number
 * @returns {number}
 */
function getNextTicketNumber() {
  const row = db.prepare("SELECT MAX(ticket_number) as max_num FROM tickets").get();
  return (row && row.max_num ? row.max_num : 0) + 1;
}

/**
 * Calculate formatted duration string between two timestamps
 * @param {string} startIso 
 * @param {string} endIso 
 * @returns {string} e.g. "1h 24m"
 */
function getDurationString(startIso, endIso) {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  const diffMs = Math.max(0, end - start);

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs / (1000 * 60)) % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

/**
 * Ensures or creates a parent category for tickets
 * @param {import("discord.js").Guild} guild 
 * @param {string} name 
 * @returns {Promise<import("discord.js").CategoryChannel>}
 */
async function getOrCreateCategory(guild, name) {
  let category = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === name
  );

  if (!category) {
    try {
      category = await guild.channels.create({
        name,
        type: ChannelType.GuildCategory,
      });
    } catch {
      // Return null if channel category limit reached
      return null;
    }
  }

  return category;
}

/**
 * Create a new private support ticket channel and database record
 * @param {import("discord.js").Guild} guild 
 * @param {import("discord.js").User} creator 
 * @param {string} categoryKey 
 * @returns {Promise<{ ticket: object, channel: import("discord.js").TextChannel }>}
 */
async function createTicketChannel(guild, creator, categoryKey) {
  const categoryConfig =
    config.tickets.categories[categoryKey] || config.tickets.categories.general;

  const ticketNumber = getNextTicketNumber();
  const formattedNum = formatTicketNumber(ticketNumber);
  const channelName = `ticket-${formattedNum}`;

  const categoryChannel = await getOrCreateCategory(guild, config.tickets.categoryName);

  const teamRole = guild.roles.cache.find((r) => r.name === config.roles.team);
  const adminRole = guild.roles.cache.find((r) => r.name === config.roles.admin);

  const permissionOverwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: creator.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
  ];

  if (teamRole) {
    permissionOverwrites.push({
      id: teamRole.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
      ],
    });
  }

  if (adminRole) {
    permissionOverwrites.push({
      id: adminRole.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ManageChannels,
      ],
    });
  }

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: categoryChannel ? categoryChannel.id : null,
    permissionOverwrites,
    topic: `BuildLab Support Ticket #${formattedNum} | Category: ${categoryConfig.label} | Creator: ${creator.tag}`,
  });

  const now = new Date().toISOString();

  // Save to database
  db.prepare(`
    INSERT INTO tickets (
      ticket_number, channel_id, creator_id, category, status, created_at
    ) VALUES (?, ?, ?, ?, 'OPEN', ?)
  `).run(ticketNumber, channel.id, creator.id, categoryConfig.label, now);

  const ticketRecord = getTicketByNumber(ticketNumber);

  // Send header embed and controls
  const headerEmbed = createBaseEmbed(
    `🎫 BUILDLAB SUPPORT TICKET #${formattedNum}`,
    `**Category:** ${categoryConfig.emoji} ${categoryConfig.label}\n` +
      `**Opened by:** <@${creator.id}>\n` +
      `**Status:** 🟡 **Open** (Waiting for mentor)\n\n` +
      `### What to provide:\n${categoryConfig.guidance}\n\n` +
      `⚠️ **Never share:** Passwords, API keys, private tokens, or \`.env\` contents!\n\n` +
      `*A BuildLab Team member will claim this ticket shortly to assist you.*`,
    COLORS.DEFAULT
  );

  const controlsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_claim_${ticketNumber}`)
      .setLabel("Claim Ticket")
      .setEmoji("👤")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`ticket_close_${ticketNumber}`)
      .setLabel("Close Ticket")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Secondary)
  );

  await channel.send({
    content: `<@${creator.id}> Welcome to your private support ticket!`,
    embeds: [headerEmbed],
    components: [controlsRow],
  });

  // Notify team channel
  try {
    const teamChannel = guild.channels.cache.find(
      (c) => c.name === config.channels.teamCoordination
    );
    if (teamChannel && teamChannel.isTextBased()) {
      const alertEmbed = createBaseEmbed(
        `📬 New Support Ticket #${formattedNum}`,
        `**Category:** ${categoryConfig.emoji} ${categoryConfig.label}\n` +
          `**Participant:** <@${creator.id}>\n` +
          `**Channel:** <#${channel.id}>\n\n` +
          `Use the button in the ticket channel to claim.`,
        COLORS.WARNING
      );
      await teamChannel.send({ embeds: [alertEmbed] });
    }
  } catch (err) {
    console.error("Failed to notify team channel:", err.message);
  }

  return { ticket: ticketRecord, channel };
}

/**
 * Fetch ticket record by channel ID
 * @param {string} channelId 
 * @returns {object|null}
 */
function getTicketByChannelId(channelId) {
  return db.prepare("SELECT * FROM tickets WHERE channel_id = ?").get(channelId) || null;
}

/**
 * Fetch ticket record by ticket number
 * @param {number} ticketNumber 
 * @returns {object|null}
 */
function getTicketByNumber(ticketNumber) {
  return (
    db.prepare("SELECT * FROM tickets WHERE ticket_number = ?").get(ticketNumber) || null
  );
}

/**
 * Claim an open ticket
 * @param {number} ticketNumber 
 * @param {import("discord.js").GuildMember} mentorMember 
 * @returns {{ success: boolean, message: string, ticket?: object }}
 */
function claimTicket(ticketNumber, mentorMember) {
  const ticket = getTicketByNumber(ticketNumber);
  if (!ticket) return { success: false, message: "Ticket not found in database." };

  if (ticket.status === "CLOSED" || ticket.status === "RESOLVED") {
    return { success: false, message: "This ticket is already closed." };
  }

  if (ticket.claimed_by && ticket.claimed_by !== mentorMember.id) {
    return {
      success: false,
      message: `ℹ️ This ticket is currently assigned to <@${ticket.claimed_by}>.`,
    };
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE tickets SET
      status = 'IN_PROGRESS',
      claimed_by = ?,
      claimed_at = COALESCE(claimed_at, ?)
    WHERE ticket_number = ?
  `).run(mentorMember.id, now, ticketNumber);

  return { success: true, message: "Ticket claimed.", ticket: getTicketByNumber(ticketNumber) };
}

/**
 * Close and archive a ticket
 * @param {number} ticketNumber 
 * @param {import("discord.js").GuildMember} closerMember 
 * @param {string} [resolution="Resolved"] 
 * @returns {Promise<{ success: boolean, message: string, duration?: string, ticket?: object }>}
 */
async function closeTicket(ticketNumber, closerMember, resolution = "Resolved by BuildLab Team") {
  const ticket = getTicketByNumber(ticketNumber);
  if (!ticket) return { success: false, message: "Ticket not found." };
  if (ticket.status === "CLOSED") return { success: false, message: "Ticket is already closed." };

  const now = new Date().toISOString();
  const duration = getDurationString(ticket.created_at, now);

  db.prepare(`
    UPDATE tickets SET
      status = 'CLOSED',
      closed_at = ?,
      closed_by = ?,
      resolution = ?
    WHERE ticket_number = ?
  `).run(now, closerMember.id, resolution, ticketNumber);

  const guild = closerMember.guild;
  const channel = guild.channels.cache.get(ticket.channel_id);

  if (channel) {
    try {
      const formattedNum = formatTicketNumber(ticketNumber);
      // Rename channel
      await channel.setName(`closed-${formattedNum}`);

      // Make read-only for participant
      await channel.permissionOverwrites.edit(ticket.creator_id, {
        SendMessages: false,
      });

      // Move to archive category if available
      const archiveCategory = await getOrCreateCategory(
        guild,
        config.tickets.archiveCategoryName
      );
      if (archiveCategory) {
        await channel.setParent(archiveCategory.id, { lockPermissions: false });
      }

      // Send resolution embed
      const closedEmbed = createBaseEmbed(
        `🔒 Ticket #${formattedNum} Closed`,
        `**Status:** 🟢 **Resolved**\n` +
          `**Resolved by:** <@${closerMember.id}>\n` +
          `**Resolution Duration:** \`${duration}\`\n\n` +
          `*This channel is now archived and read-only. Thank you for building with TechSpace BuildLab ’26!*`,
        COLORS.SUCCESS
      );

      const deleteRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket_delete_${ticketNumber}`)
          .setLabel("Delete Ticket (Admin Only)")
          .setEmoji("🗑️")
          .setStyle(ButtonStyle.Danger)
      );

      await channel.send({ embeds: [closedEmbed], components: [deleteRow] });

      // Notify ticket creator in DMs if possible
      try {
        const creatorUser = await guild.client.users.fetch(ticket.creator_id);
        if (creatorUser) {
          await creatorUser.send(
            `🎫 Your BuildLab support ticket **#${formattedNum}** (${ticket.category}) has been resolved and closed by <@${closerMember.id}>.`
          );
        }
      } catch {
        // Ignore DM error if participant has DMs off
      }
    } catch (err) {
      console.error("Error updating closed ticket channel:", err.message);
    }
  }

  return {
    success: true,
    message: "Ticket successfully closed.",
    duration,
    ticket: getTicketByNumber(ticketNumber),
  };
}

/**
 * Permanently delete ticket channel and remove from active list
 * @param {number} ticketNumber 
 * @param {import("discord.js").Guild} guild 
 * @returns {Promise<boolean>}
 */
async function deleteTicketChannel(ticketNumber, guild) {
  const ticket = getTicketByNumber(ticketNumber);
  if (!ticket) return false;

  const channel = guild.channels.cache.get(ticket.channel_id);
  if (channel) {
    try {
      await channel.delete("BuildLab Ticket permanent deletion");
    } catch {
      // Ignore if already deleted
    }
  }

  return true;
}

/**
 * List tickets with filters
 * @param {{ filter?: 'open'|'unclaimed'|'mine', userId?: string }} options 
 * @returns {Array<object>}
 */
function listTickets(options = {}) {
  let query = "SELECT * FROM tickets WHERE 1=1";
  const params = [];

  if (options.filter === "open") {
    query += " AND status IN ('OPEN', 'IN_PROGRESS')";
  } else if (options.filter === "unclaimed") {
    query += " AND status = 'OPEN' AND claimed_by IS NULL";
  } else if (options.filter === "mine" && options.userId) {
    query += " AND claimed_by = ? AND status IN ('OPEN', 'IN_PROGRESS')";
    params.push(options.userId);
  }

  query += " ORDER BY ticket_number DESC LIMIT 25";
  return db.prepare(query).all(...params);
}

/**
 * Get active tickets opened by a participant
 * @param {string} creatorId 
 * @returns {Array<object>}
 */
function getParticipantTickets(creatorId) {
  return db
    .prepare(
      "SELECT * FROM tickets WHERE creator_id = ? AND status IN ('OPEN', 'IN_PROGRESS') ORDER BY ticket_number DESC"
    )
    .all(creatorId);
}

module.exports = {
  formatTicketNumber,
  getNextTicketNumber,
  createTicketChannel,
  getTicketByChannelId,
  getTicketByNumber,
  claimTicket,
  closeTicket,
  deleteTicketChannel,
  listTickets,
  getParticipantTickets,
};
