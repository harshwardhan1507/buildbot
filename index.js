/**
 * BuildLab Discord Server Security Setup & Permission Hardening
 * 
 * IDEMPOTENT: Safe to run multiple times.
 * - Detects existing roles/channels by name
 * - Updates permissions, mentionability, hoisting, positions
 * - Preserves existing IDs and messages
 * - Never creates duplicates
 * - Never touches production SQLite database
 * - Never logs tokens or secrets
 * 
 * Usage: npm run setup:server
 * 
 * @module setup-server
 */
require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionFlagsBits,
  PermissionsBitField,
} = require("discord.js");

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !GUILD_ID) {
  console.error("❌ Missing DISCORD_TOKEN or GUILD_ID in .env");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

// ============================================================
// ROLE DEFINITIONS — Least-Privilege
// ============================================================

const ROLE_DEFINITIONS = [
  {
    name: "TechSpace Admin",
    color: 0xc0392b,
    hoist: true,
    mentionable: false,
    permissions: new PermissionsBitField([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.SendMessagesInThreads,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ManageRoles,
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.ManageThreads,
      PermissionFlagsBits.ManageNicknames,
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.BanMembers,
      PermissionFlagsBits.ModerateMembers,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.AddReactions,
      PermissionFlagsBits.UseExternalEmojis,
      PermissionFlagsBits.MentionEveryone,
      PermissionFlagsBits.ManageEvents,
      PermissionFlagsBits.ManageWebhooks,
      PermissionFlagsBits.CreatePublicThreads,
      PermissionFlagsBits.CreatePrivateThreads,
      PermissionFlagsBits.Connect,
      PermissionFlagsBits.Speak,
      PermissionFlagsBits.MuteMembers,
      PermissionFlagsBits.DeafenMembers,
      PermissionFlagsBits.MoveMembers,
    ]),
  },
  {
    name: "BuildLab Team",
    color: 0x5865f2,
    hoist: true,
    mentionable: false,
    permissions: new PermissionsBitField([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.SendMessagesInThreads,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.ManageThreads,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.AddReactions,
      PermissionFlagsBits.UseExternalEmojis,
      PermissionFlagsBits.MentionEveryone,
      PermissionFlagsBits.CreatePublicThreads,
      PermissionFlagsBits.CreatePrivateThreads,
      PermissionFlagsBits.Connect,
      PermissionFlagsBits.Speak,
    ]),
  },
  {
    name: "Beginner",
    color: 0x3498db,
    hoist: false,
    mentionable: false,
    permissions: new PermissionsBitField([
      // No server-wide elevated permissions.
      // Channel access granted through overwrites only.
    ]),
  },
  {
    name: "Intermediate",
    color: 0x9b59b6,
    hoist: false,
    mentionable: false,
    permissions: new PermissionsBitField([]),
  },
  {
    name: "Advanced",
    color: 0xe74c3c,
    hoist: false,
    mentionable: false,
    permissions: new PermissionsBitField([]),
  },
];

// ============================================================
// @everyone LOCKDOWN PERMISSIONS
// ============================================================

// Minimal @everyone permissions: view, read history, add reactions, connect
// DENY all dangerous server-wide permissions
const EVERYONE_PERMISSIONS = new PermissionsBitField([
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.AddReactions,
  PermissionFlagsBits.UseExternalEmojis,
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.Speak,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.SendMessagesInThreads,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.CreatePublicThreads,
]);

// ============================================================
// CHANNEL STRUCTURE & PERMISSION OVERWRITES
// ============================================================

/**
 * Build category + channel definitions with explicit permission overwrites.
 * Each overwrite explicitly specifies allow + deny to prevent inheritance issues.
 * 
 * @param {Object} roles - Map of role name -> Role object
 * @param {string} everyoneId - Guild @everyone role ID
 * @param {string} botId - Bot user ID
 * @returns {Array} Channel structure definitions
 */
function buildChannelStructure(roles, everyoneId, botId) {
  // Reusable overwrite builders
  const readOnly = (id) => ({
    id,
    allow: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.AddReactions,
    ],
    deny: [
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.SendMessagesInThreads,
      PermissionFlagsBits.CreatePublicThreads,
      PermissionFlagsBits.CreatePrivateThreads,
      PermissionFlagsBits.MentionEveryone,
    ],
  });

  const readWrite = (id) => ({
    id,
    allow: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.AddReactions,
    ],
    deny: [
      PermissionFlagsBits.MentionEveryone,
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.ManageChannels,
    ],
  });

  const staffAccess = (id) => ({
    id,
    allow: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.SendMessagesInThreads,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.AddReactions,
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.MentionEveryone,
      PermissionFlagsBits.CreatePublicThreads,
      PermissionFlagsBits.CreatePrivateThreads,
    ],
  });

  const botAccess = (id) => ({
    id,
    allow: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ManageRoles,
    ],
  });

  const denyView = (id) => ({
    id,
    deny: [PermissionFlagsBits.ViewChannel],
  });

  const teamId = roles["BuildLab Team"].id;
  const adminId = roles["TechSpace Admin"].id;
  const beginnerId = roles["Beginner"].id;
  const intermediateId = roles["Intermediate"].id;
  const advancedId = roles["Advanced"].id;

  return [
    // ── 📌 INFORMATION ──────────────────────────
    {
      category: "📌 INFORMATION",
      categoryOverwrites: [
        readOnly(everyoneId),
        staffAccess(teamId),
        staffAccess(adminId),
        botAccess(botId),
      ],
      channels: [
        { name: "announcements", type: ChannelType.GuildText },
        { name: "rules", type: ChannelType.GuildText },
        { name: "getting-started", type: ChannelType.GuildText },
        { name: "faq", type: ChannelType.GuildText },
      ],
      // Children inherit from category — no channel-level overrides needed
      // unless a channel needs different permissions
    },

    // ── 🧭 BUILDLAB ─────────────────────────────
    {
      category: "🧭 BUILDLAB",
      categoryOverwrites: [
        // Default: participants can view and read
        {
          id: everyoneId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AddReactions,
          ],
          deny: [
            PermissionFlagsBits.MentionEveryone,
          ],
        },
        staffAccess(teamId),
        staffAccess(adminId),
        botAccess(botId),
      ],
      channels: [
        {
          name: "project-discussion",
          type: ChannelType.GuildText,
          overwrites: [
            readWrite(everyoneId),
            staffAccess(teamId),
            staffAccess(adminId),
            botAccess(botId),
          ],
        },
        {
          name: "weekly-updates",
          type: ChannelType.GuildText,
          overwrites: [
            readOnly(everyoneId),
            staffAccess(teamId),
            staffAccess(adminId),
            botAccess(botId),
          ],
        },
        {
          name: "submissions",
          type: ChannelType.GuildText,
          overwrites: [
            readWrite(everyoneId),
            staffAccess(teamId),
            staffAccess(adminId),
            botAccess(botId),
          ],
        },
      ],
    },

    // ── 💬 COMMUNITY ─────────────────────────────
    {
      category: "💬 COMMUNITY",
      categoryOverwrites: [
        readWrite(everyoneId),
        staffAccess(teamId),
        staffAccess(adminId),
        botAccess(botId),
      ],
      channels: [
        { name: "general", type: ChannelType.GuildText },
        { name: "introductions", type: ChannelType.GuildText },
      ],
    },

    // ── 🛠 SUPPORT ───────────────────────────────
    {
      category: "🛠 SUPPORT",
      categoryOverwrites: [
        readWrite(everyoneId),
        staffAccess(teamId),
        staffAccess(adminId),
        botAccess(botId),
      ],
      channels: [
        { name: "help", type: ChannelType.GuildText },
        { name: "github-help", type: ChannelType.GuildText },
        { name: "debugging", type: ChannelType.GuildText },
      ],
    },

    // ── 👨‍💻 TRACKS ──────────────────────────────
    {
      category: "👨‍💻 TRACKS",
      categoryOverwrites: [
        // @everyone denied by default — only track role holders can see
        denyView(everyoneId),
        staffAccess(teamId),
        staffAccess(adminId),
        botAccess(botId),
      ],
      channels: [
        {
          name: "beginner",
          type: ChannelType.GuildText,
          overwrites: [
            denyView(everyoneId),
            readWrite(beginnerId),
            staffAccess(teamId),
            staffAccess(adminId),
            botAccess(botId),
          ],
        },
        {
          name: "intermediate",
          type: ChannelType.GuildText,
          overwrites: [
            denyView(everyoneId),
            readWrite(intermediateId),
            staffAccess(teamId),
            staffAccess(adminId),
            botAccess(botId),
          ],
        },
        {
          name: "advanced",
          type: ChannelType.GuildText,
          overwrites: [
            denyView(everyoneId),
            readWrite(advancedId),
            staffAccess(teamId),
            staffAccess(adminId),
            botAccess(botId),
          ],
        },
      ],
    },

    // ── 🔒 BUILDLAB TEAM ────────────────────────
    {
      category: "🔒 BUILDLAB TEAM",
      categoryOverwrites: [
        denyView(everyoneId),
        {
          id: teamId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.SendMessagesInThreads,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.AddReactions,
            PermissionFlagsBits.ManageMessages,
            PermissionFlagsBits.CreatePublicThreads,
            PermissionFlagsBits.CreatePrivateThreads,
          ],
        },
        {
          id: adminId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.SendMessagesInThreads,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.AddReactions,
            PermissionFlagsBits.ManageMessages,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.CreatePublicThreads,
            PermissionFlagsBits.CreatePrivateThreads,
          ],
        },
        botAccess(botId),
      ],
      channels: [
        { name: "team-coordination", type: ChannelType.GuildText },
        { name: "mentor-help", type: ChannelType.GuildText },
        { name: "evaluation", type: ChannelType.GuildText },
        { name: "Team Room", type: ChannelType.GuildVoice },
      ],
    },
  ];
}

// ============================================================
// MAIN SETUP FUNCTION
// ============================================================

client.once("clientReady", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const guild = await client.guilds.fetch(GUILD_ID);
  if (!guild) {
    console.error("❌ Guild not found.");
    process.exit(1);
  }

  // Fetch all guild data
  await guild.roles.fetch();
  await guild.channels.fetch();
  const botMember = await guild.members.fetchMe();

  console.log(`📡 Setting up security for: ${guild.name}`);
  console.log(`🤖 Bot role: ${botMember.roles.highest.name} (position ${botMember.roles.highest.position})`);

  // Check required bot permissions
  const requiredPerms = [
    { flag: PermissionFlagsBits.ManageRoles, name: "Manage Roles" },
    { flag: PermissionFlagsBits.ManageChannels, name: "Manage Channels" },
  ];
  const missing = requiredPerms.filter(({ flag }) => !botMember.permissions.has(flag));
  if (missing.length > 0) {
    console.error(`❌ Bot missing permissions: ${missing.map(m => m.name).join(", ")}`);
    process.exit(1);
  }

  // ========================================================
  // PHASE 1: ROLES — Create or Update
  // ========================================================
  console.log("\n── PHASE 1: ROLES ──────────────────────────────");

  const roles = {};
  const botHighestPos = botMember.roles.highest.position;

  for (const def of ROLE_DEFINITIONS) {
    let role = guild.roles.cache.find((r) => r.name === def.name);

    if (!role) {
      try {
        role = await guild.roles.create({
          name: def.name,
          color: def.color,
          hoist: def.hoist,
          mentionable: def.mentionable,
          permissions: def.permissions,
          reason: "BuildLab '26 security setup",
        });
        console.log(`  ✅ Created role: ${def.name}`);
      } catch (err) {
        console.error(`  ❌ Failed to create role "${def.name}": ${err.message}`);
        process.exit(1);
      }
    } else {
      // Update existing role properties
      const updates = {};
      let needsUpdate = false;

      if (role.color !== def.color) {
        updates.color = def.color;
        needsUpdate = true;
      }
      if (role.hoist !== def.hoist) {
        updates.hoist = def.hoist;
        needsUpdate = true;
      }
      if (role.mentionable !== def.mentionable) {
        updates.mentionable = def.mentionable;
        needsUpdate = true;
      }
      if (role.permissions.bitfield !== def.permissions.bitfield) {
        updates.permissions = def.permissions;
        needsUpdate = true;
      }

      if (needsUpdate && role.position < botHighestPos) {
        try {
          await role.edit({ ...updates, reason: "BuildLab '26 security hardening" });
          console.log(`  🔧 Updated role: ${def.name} (${Object.keys(updates).join(", ")})`);
        } catch (err) {
          console.error(`  ⚠️  Could not update "${def.name}": ${err.message}`);
        }
      } else if (needsUpdate) {
        console.log(`  ⚠️  Role "${def.name}" needs updates but is at or above bot's position — skipping permission edit`);
      } else {
        console.log(`  ↪️  Role OK: ${def.name}`);
      }
    }

    roles[def.name] = role;
  }

  // ========================================================
  // PHASE 2: @EVERYONE LOCKDOWN
  // ========================================================
  console.log("\n── PHASE 2: @EVERYONE LOCKDOWN ─────────────────");

  const everyoneRole = guild.roles.everyone;
  try {
    const currentBits = everyoneRole.permissions.bitfield;
    const targetBits = EVERYONE_PERMISSIONS.bitfield;

    if (currentBits !== targetBits) {
      await everyoneRole.edit({
        permissions: EVERYONE_PERMISSIONS,
        reason: "BuildLab '26 @everyone security lockdown",
      });
      console.log("  🔒 @everyone permissions locked down");

      // Detail what was removed
      const removed = new PermissionsBitField(currentBits & ~targetBits);
      if (removed.bitfield !== 0n) {
        const removedFlags = removed.toArray();
        console.log(`  ⛔ Removed from @everyone: ${removedFlags.join(", ")}`);
      }
    } else {
      console.log("  ↪️  @everyone permissions already correct");
    }
  } catch (err) {
    console.error(`  ❌ Failed to update @everyone: ${err.message}`);
  }

  // ========================================================
  // PHASE 3: ROLE HIERARCHY
  // ========================================================
  console.log("\n── PHASE 3: ROLE HIERARCHY ─────────────────────");

  // Desired order (highest position first):
  // Bot's managed role (unchanged — Discord manages it)
  // TechSpace Admin
  // BuildLab Team
  // Advanced
  // Intermediate
  // Beginner
  // @everyone (always position 0)
  //
  // We only reorder roles that are BELOW the bot's highest role.
  // We do NOT move TechSpace Admin or BuildLab Team below the bot if they are above it.

  const desiredOrder = [
    "TechSpace Admin",
    "BuildLab Team",
    "Advanced",
    "Intermediate",
    "Beginner",
  ];

  // Determine which roles the bot can manage (below its highest role)
  const manageable = desiredOrder.filter((name) => {
    const r = roles[name];
    return r && r.position < botHighestPos;
  });

  if (manageable.length > 0) {
    // Calculate target positions. Start just below bot's role, assign descending.
    // But we must not move roles above roles we can't manage.
    try {
      // Find the highest position available below the bot role
      let nextPos = botHighestPos - 1;

      // First, account for roles the bot CAN'T manage that are in our desired list
      const unmanageable = desiredOrder.filter((name) => {
        const r = roles[name];
        return r && r.position >= botHighestPos;
      });

      if (unmanageable.length > 0) {
        console.log(`  ⚠️  Cannot reposition (above bot): ${unmanageable.join(", ")}`);
      }

      // Build position map for manageable roles
      const positionUpdates = [];
      for (const name of manageable) {
        const r = roles[name];
        if (r.position !== nextPos) {
          positionUpdates.push({ role: r.id, position: nextPos });
        }
        nextPos--;
      }

      if (positionUpdates.length > 0) {
        await guild.roles.setPositions(positionUpdates);
        console.log(`  📊 Role positions updated for: ${manageable.join(", ")}`);
      } else {
        console.log("  ↪️  Role hierarchy already correct");
      }
    } catch (err) {
      console.error(`  ⚠️  Role position update failed: ${err.message}`);
    }
  } else {
    console.log("  ↪️  No roles to reposition (all above bot)");
  }

  // ========================================================
  // PHASE 4: CATEGORIES & CHANNELS
  // ========================================================
  console.log("\n── PHASE 4: CATEGORIES & CHANNELS ──────────────");

  const channelStructure = buildChannelStructure(roles, everyoneRole.id, client.user.id);

  for (const categoryDef of channelStructure) {
    // Find or create category
    let category = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildCategory && c.name === categoryDef.category
    );

    if (!category) {
      try {
        category = await guild.channels.create({
          name: categoryDef.category,
          type: ChannelType.GuildCategory,
          permissionOverwrites: categoryDef.categoryOverwrites,
          reason: "BuildLab '26 server setup",
        });
        console.log(`  📁 Created category: ${categoryDef.category}`);
      } catch (err) {
        console.error(`  ❌ Failed to create category "${categoryDef.category}": ${err.message}`);
        continue;
      }
    } else {
      // Update category permissions
      try {
        await category.permissionOverwrites.set(categoryDef.categoryOverwrites, "BuildLab '26 security hardening");
        console.log(`  🔧 Updated category permissions: ${categoryDef.category}`);
      } catch (err) {
        console.error(`  ⚠️  Failed to update category "${categoryDef.category}": ${err.message}`);
      }
    }

    // Process channels within this category
    for (const chDef of categoryDef.channels) {
      const isVoice = chDef.type === ChannelType.GuildVoice;
      const channelName = chDef.name;

      // Find existing channel (case-insensitive, in this category)
      let channel = guild.channels.cache.find(
        (c) => c.name.toLowerCase() === channelName.toLowerCase().replace(/ /g, "-") && c.parentId === category.id
      );

      // Also check for "Team Room" style voice channel names
      if (!channel && isVoice) {
        channel = guild.channels.cache.find(
          (c) =>
            c.name.toLowerCase() === channelName.toLowerCase() &&
            c.parentId === category.id &&
            c.type === ChannelType.GuildVoice
        );
      }

      const overwrites = chDef.overwrites || null; // null = inherit from category

      if (!channel) {
        try {
          const createOpts = {
            name: channelName,
            type: chDef.type,
            parent: category.id,
            reason: "BuildLab '26 server setup",
          };

          if (overwrites) {
            createOpts.permissionOverwrites = overwrites;
          }

          channel = await guild.channels.create(createOpts);
          console.log(`    └─ Created ${isVoice ? "voice" : "text"}: #${channelName}`);
        } catch (err) {
          console.error(`    ❌ Failed to create #${channelName}: ${err.message}`);
        }
      } else {
        // Update existing channel permissions
        if (overwrites) {
          try {
            await channel.permissionOverwrites.set(overwrites, "BuildLab '26 security hardening");
            console.log(`    🔧 Updated permissions: #${channelName}`);
          } catch (err) {
            console.error(`    ⚠️  Failed to update #${channelName}: ${err.message}`);
          }
        } else {
          // Sync with category (remove channel-specific overrides)
          try {
            await channel.lockPermissions();
            console.log(`    🔗 Synced with category: #${channelName}`);
          } catch (err) {
            console.error(`    ⚠️  Failed to sync #${channelName}: ${err.message}`);
          }
        }
      }
    }
  }

  // ========================================================
  // PHASE 5: AUDIT & VERIFICATION
  // ========================================================
  console.log("\n── PHASE 5: AUDIT & VERIFICATION ───────────────");

  // Re-fetch all roles & channels after updates
  await guild.roles.fetch();
  await guild.channels.fetch();

  // 5a. Verify role properties
  console.log("\n  ── Role Audit ──");
  for (const def of ROLE_DEFINITIONS) {
    const role = guild.roles.cache.find((r) => r.name === def.name);
    if (!role) {
      console.error(`  ❌ MISSING: ${def.name}`);
      continue;
    }

    const issues = [];
    if (role.mentionable !== def.mentionable) issues.push(`mentionable=${role.mentionable} (want ${def.mentionable})`);
    if (role.hoist !== def.hoist) issues.push(`hoist=${role.hoist} (want ${def.hoist})`);

    if (issues.length > 0) {
      console.warn(`  ⚠️  ${def.name}: ${issues.join(", ")}`);
    } else {
      console.log(`  ✅ ${def.name}: mentionable=false, hoist=${def.hoist}, pos=${role.position}`);
    }
  }

  // 5b. Verify @everyone
  const evRefreshed = guild.roles.everyone;
  const hasMentionEveryone = evRefreshed.permissions.has(PermissionFlagsBits.MentionEveryone);
  const hasAdmin = evRefreshed.permissions.has(PermissionFlagsBits.Administrator);
  const hasManageServer = evRefreshed.permissions.has(PermissionFlagsBits.ManageGuild);
  const hasManageRoles = evRefreshed.permissions.has(PermissionFlagsBits.ManageRoles);
  const hasManageChannels = evRefreshed.permissions.has(PermissionFlagsBits.ManageChannels);
  const hasManageMessages = evRefreshed.permissions.has(PermissionFlagsBits.ManageMessages);
  const hasKick = evRefreshed.permissions.has(PermissionFlagsBits.KickMembers);
  const hasBan = evRefreshed.permissions.has(PermissionFlagsBits.BanMembers);
  const hasModerate = evRefreshed.permissions.has(PermissionFlagsBits.ModerateMembers);

  console.log("\n  ── @everyone Audit ──");
  console.log(`  MentionEveryone: ${hasMentionEveryone ? "❌ ALLOWED" : "✅ DENIED"}`);
  console.log(`  Administrator: ${hasAdmin ? "❌ ALLOWED" : "✅ DENIED"}`);
  console.log(`  ManageServer: ${hasManageServer ? "❌ ALLOWED" : "✅ DENIED"}`);
  console.log(`  ManageRoles: ${hasManageRoles ? "❌ ALLOWED" : "✅ DENIED"}`);
  console.log(`  ManageChannels: ${hasManageChannels ? "❌ ALLOWED" : "✅ DENIED"}`);
  console.log(`  ManageMessages: ${hasManageMessages ? "❌ ALLOWED" : "✅ DENIED"}`);
  console.log(`  KickMembers: ${hasKick ? "❌ ALLOWED" : "✅ DENIED"}`);
  console.log(`  BanMembers: ${hasBan ? "❌ ALLOWED" : "✅ DENIED"}`);
  console.log(`  ModerateMembers: ${hasModerate ? "❌ ALLOWED" : "✅ DENIED"}`);

  // 5c. Effective permission check for participant scenario
  console.log("\n  ── Effective Permission Spot Check ──");

  // Find a channel from each category to test
  const testChannels = [
    { name: "announcements", expectSend: false, expectView: true },
    { name: "rules", expectSend: false, expectView: true },
    { name: "general", expectSend: true, expectView: true },
    { name: "project-discussion", expectSend: true, expectView: true },
    { name: "weekly-updates", expectSend: false, expectView: true },
    { name: "team-coordination", expectSend: false, expectView: false },
    { name: "evaluation", expectSend: false, expectView: false },
  ];

  for (const tc of testChannels) {
    const channel = guild.channels.cache.find((c) => c.name === tc.name && c.type === ChannelType.GuildText);
    if (!channel) {
      console.warn(`  ⚠️  Channel #${tc.name} not found`);
      continue;
    }

    // Compute effective permissions for @everyone (simulates a participant with no extra roles)
    const perms = channel.permissionsFor(everyoneRole);

    const canView = perms.has(PermissionFlagsBits.ViewChannel);
    // If can't view, effective send is false regardless of SendMessages bit
    const canSend = canView ? perms.has(PermissionFlagsBits.SendMessages) : false;
    const canMention = canView ? perms.has(PermissionFlagsBits.MentionEveryone) : false;

    const viewOk = canView === tc.expectView;
    const sendOk = canSend === tc.expectSend;
    const mentionOk = !canMention; // Should always be false for participants

    const status = (viewOk && sendOk && mentionOk) ? "✅" : "❌";
    console.log(
      `  ${status} #${tc.name}: View=${canView}(want ${tc.expectView}), ` +
      `Send=${canSend}(want ${tc.expectSend}), MentionAll=${canMention}(want false)`
    );
  }

  // 5d. Check track channel isolation
  console.log("\n  ── Track Channel Isolation ──");
  for (const trackName of ["beginner", "intermediate", "advanced"]) {
    const channel = guild.channels.cache.find((c) => c.name === trackName && c.type === ChannelType.GuildText);
    if (!channel) {
      console.warn(`  ⚠️  Channel #${trackName} not found`);
      continue;
    }

    const evPerms = channel.permissionsFor(everyoneRole);
    const canView = evPerms.has(PermissionFlagsBits.ViewChannel);
    console.log(`  ${canView ? "❌" : "✅"} #${trackName}: @everyone View=${canView} (want false)`);

    // Check the corresponding track role CAN view
    const trackRoleName = trackName.charAt(0).toUpperCase() + trackName.slice(1);
    const trackRole = roles[trackRoleName];
    if (trackRole) {
      const trackPerms = channel.permissionsFor(trackRole);
      const trackCanView = trackPerms.has(PermissionFlagsBits.ViewChannel);
      const trackCanSend = trackPerms.has(PermissionFlagsBits.SendMessages);
      console.log(`  ${trackCanView ? "✅" : "❌"} #${trackName}: ${trackRoleName} View=${trackCanView}, Send=${trackCanSend}`);
    }
  }

  // 5e. Bot permissions in key channels
  console.log("\n  ── Bot Permission Check ──");
  const botChannels = ["announcements", "introductions", "project-discussion", "team-coordination"];
  for (const chName of botChannels) {
    const channel = guild.channels.cache.find((c) => c.name === chName);
    if (!channel) continue;

    const perms = channel.permissionsFor(botMember);
    const canView = perms.has(PermissionFlagsBits.ViewChannel);
    const canSend = perms.has(PermissionFlagsBits.SendMessages);
    const canEmbed = perms.has(PermissionFlagsBits.EmbedLinks);
    const canManageMsg = perms.has(PermissionFlagsBits.ManageMessages);

    console.log(
      `  ${(canView && canSend && canEmbed) ? "✅" : "❌"} #${chName}: ` +
      `View=${canView}, Send=${canSend}, Embed=${canEmbed}, ManageMsg=${canManageMsg}`
    );
  }

  // ========================================================
  // PHASE 6: ROLE HIERARCHY REPORT
  // ========================================================
  console.log("\n── PHASE 6: FINAL ROLE HIERARCHY ────────────────");

  const sortedRoles = [...guild.roles.cache.values()]
    .sort((a, b) => b.position - a.position);

  for (const role of sortedRoles) {
    const isBot = role.managed;
    const marker = isBot ? " [managed/integration]" : "";
    console.log(`  ${role.position.toString().padStart(2)}: ${role.name}${marker} (hoist=${role.hoist}, mentionable=${role.mentionable})`);
  }

  // ========================================================
  // DONE
  // ========================================================
  console.log("\n══════════════════════════════════════════════════");
  console.log("🚀 BuildLab server security setup complete!");
  console.log("══════════════════════════════════════════════════");

  client.destroy();
});

client.login(TOKEN);