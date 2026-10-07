const config = require("../config/config");
const { setUserTrack } = require("./teams");
const { isBuildLabTeam, isTechSpaceAdmin } = require("../utils/permissions");

/**
 * Maps track string to config key
 * @param {string} track 
 * @returns {'beginner'|'intermediate'|'advanced'|null}
 */
function getTrackKey(track) {
  if (!track) return null;
  const lower = track.toLowerCase();
  if (lower === "beginner") return "beginner";
  if (lower === "intermediate") return "intermediate";
  if (lower === "advanced") return "advanced";
  return null;
}

/**
 * Resolves a track role in the given guild using role ID or role name
 * @param {import("discord.js").Guild} guild 
 * @param {string} track 
 * @returns {import("discord.js").Role|null}
 */
function findTrackRole(guild, track) {
  if (!guild || !guild.roles || !guild.roles.cache) return null;
  const key = getTrackKey(track);
  if (!key) return null;

  const cache = guild.roles.cache;
  const findRole = (predicate) => {
    if (typeof cache.find === "function") return cache.find(predicate);
    if (Array.isArray(cache)) return cache.find(predicate);
    if (typeof cache.values === "function") {
      for (const r of cache.values()) {
        if (predicate(r)) return r;
      }
    }
    return null;
  };

  const getRole = (id) => {
    if (typeof cache.get === "function") return cache.get(id);
    if (Array.isArray(cache)) return cache.find((r) => r.id === id);
    return null;
  };

  // 1. Try role ID if configured
  const configuredId = config.roleIds[key];
  if (configuredId) {
    const roleById = getRole(configuredId);
    if (roleById) return roleById;
  }

  // 2. Fallback to role name
  const configuredName = config.roles[key] || track;
  const roleByName = findRole(
    (r) => r.name && r.name.toLowerCase() === configuredName.toLowerCase()
  );
  if (roleByName) return roleByName;

  // 3. Fallback to raw track name
  return findRole(
    (r) => r.name && r.name.toLowerCase() === track.toLowerCase()
  ) || null;
}

/**
 * Validates configured track roles in the guild at startup or runtime
 * @param {import("discord.js").Guild} guild 
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateGuildTrackRoles(guild) {
  const errors = [];
  if (!guild) {
    errors.push("Guild not provided for role validation.");
    return { valid: false, errors };
  }

  const me = guild.members?.me;
  const botHighestPosition = me?.roles?.highest?.position ?? -1;

  for (const track of config.trackNames) {
    const role = findTrackRole(guild, track);
    if (!role) {
      errors.push(`Track role for '${track}' not found in guild '${guild.name}' (${guild.id}).`);
      continue;
    }

    if (me && botHighestPosition <= role.position) {
      errors.push(
        `Bot role hierarchy warning: Bot highest role (${me.roles.highest.name}) position ${botHighestPosition} is NOT above track role '${role.name}' position ${role.position}. Role assignment will fail!`
      );
    }
  }

  if (errors.length > 0) {
    console.error("❌ [ROLE CONFIGURATION WARNING]:\n  • " + errors.join("\n  • "));
  } else {
    console.log("✅ [ROLE CONFIGURATION]: All track roles verified with valid hierarchy.");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Assigns a track role to a GuildMember while safely removing conflicting track roles
 * and never touching staff or administrative roles.
 * 
 * @param {import("discord.js").GuildMember} member 
 * @param {string} targetTrack - "Beginner" | "Intermediate" | "Advanced"
 * @returns {Promise<{ success: boolean, assignedRole?: import("discord.js").Role, removedRoles: string[], message: string }>}
 */
async function assignTrackRole(member, targetTrack) {
  if (!member || !member.guild) {
    return {
      success: false,
      removedRoles: [],
      message: "Could not resolve server member profile for role assignment.",
    };
  }

  const key = getTrackKey(targetTrack);
  if (!key) {
    return {
      success: false,
      removedRoles: [],
      message: `Invalid track name: ${targetTrack}. Must be Beginner, Intermediate, or Advanced.`,
    };
  }

  const targetRole = findTrackRole(member.guild, targetTrack);
  if (!targetRole) {
    const errorMsg = `Track role for '${targetTrack}' was not found on this server. Please notify an administrator.`;
    console.error(`❌ [ROLE ASSIGNMENT ERROR] ${errorMsg}`);
    return {
      success: false,
      removedRoles: [],
      message: errorMsg,
    };
  }

  // Hierarchy check
  const botMember = member.guild.members?.me;
  if (botMember && botMember.roles?.highest) {
    if (botMember.roles.highest.position <= targetRole.position) {
      const hierarchyErr = `Bot role (${botMember.roles.highest.name}) is below '${targetRole.name}' in server role hierarchy.`;
      console.error(`❌ [ROLE HIERARCHY ERROR] ${hierarchyErr}`);
      return {
        success: false,
        removedRoles: [],
        message: `Role assignment failed: The bot's role must be placed above the ${targetRole.name} role in server role hierarchy (Server Settings -> Roles).`,
      };
    }
  }

  const removedRoles = [];

  const memberHasRoleId = (roleId) => {
    if (!member.roles || !member.roles.cache) return false;
    const cache = member.roles.cache;
    if (typeof cache.has === "function") return cache.has(roleId);
    if (Array.isArray(cache)) return cache.some((r) => r.id === roleId);
    if (typeof cache.values === "function") {
      for (const r of cache.values()) {
        if (r.id === roleId) return true;
      }
    }
    return false;
  };

  // Identify all existing track roles on the member that conflict with targetTrack
  const conflictingTrackRoles = [];
  for (const track of config.trackNames) {
    if (track.toLowerCase() === targetTrack.toLowerCase()) continue;
    const confRole = findTrackRole(member.guild, track);
    if (confRole && memberHasRoleId(confRole.id)) {
      conflictingTrackRoles.push(confRole);
    }
  }

  // Safely remove conflicting track roles
  for (const roleToRemove of conflictingTrackRoles) {
    // Extra safety guard: never remove admin or team roles under any circumstance
    if (
      roleToRemove.name === config.roles.admin ||
      roleToRemove.name === config.roles.team
    ) {
      continue;
    }

    try {
      if (typeof member.roles.remove === "function") {
        await member.roles.remove(roleToRemove, `BuildLab track change to ${targetTrack}`);
      }
      removedRoles.push(roleToRemove.name);
    } catch (err) {
      console.error(`⚠️ Failed to remove conflicting role '${roleToRemove.name}':`, err.message);
    }
  }

  // Add the target track role if not already present
  if (!memberHasRoleId(targetRole.id)) {
    try {
      if (typeof member.roles.add === "function") {
        await member.roles.add(targetRole, `BuildLab track assignment: ${targetTrack}`);
      }
    } catch (err) {
      console.error(`❌ Failed to add track role '${targetRole.name}':`, err.message);
      return {
        success: false,
        removedRoles,
        message: `Could not assign role ${targetRole.name}: ${err.message}`,
      };
    }
  }

  // Update user track in database
  const username = member.user?.username || member.id;
  setUserTrack(member.id, username, targetTrack);

  return {
    success: true,
    assignedRole: targetRole,
    removedRoles,
    message: `Assigned @${targetRole.name}`,
  };
}

module.exports = {
  getTrackKey,
  findTrackRole,
  validateGuildTrackRoles,
  assignTrackRole,
};
