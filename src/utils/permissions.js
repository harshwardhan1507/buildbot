const config = require("../config/config");

function hasRole(member, roleName) {
  if (!member || !member.roles || !member.roles.cache) return false;
  const cache = member.roles.cache;
  if (typeof cache.some === "function") {
    return cache.some((r) => r.name.toLowerCase() === roleName.toLowerCase());
  }
  if (Array.isArray(cache)) {
    return cache.some((r) => r.name.toLowerCase() === roleName.toLowerCase());
  }
  if (typeof cache.values === "function") {
    for (const r of cache.values()) {
      if (r.name && r.name.toLowerCase() === roleName.toLowerCase()) return true;
    }
  }
  return false;
}

/**
 * Checks if a GuildMember has the TechSpace Admin role
 * @param {import("discord.js").GuildMember} member 
 * @returns {boolean}
 */
function isTechSpaceAdmin(member) {
  return hasRole(member, config.roles.admin);
}

/**
 * Checks if a GuildMember has the BuildLab Team or TechSpace Admin role
 * @param {import("discord.js").GuildMember} member 
 * @returns {boolean}
 */
function isBuildLabTeam(member) {
  return hasRole(member, config.roles.team) || hasRole(member, config.roles.admin);
}

/**
 * Checks if a member has a specific track role
 * @param {import("discord.js").GuildMember} member 
 * @returns {string|null} Track name if member has one, otherwise null
 */
function getMemberTrack(member) {
  if (!member || !member.roles || !member.roles.cache) return null;
  for (const track of config.trackNames) {
    if (hasRole(member, track)) {
      return track;
    }
  }
  return null;
}

/**
 * Returns a standardized error message for permission denial
 * @param {string} requiredRole 
 * @returns {string}
 */
function getPermissionDeniedMessage(requiredRole = "BuildLab Team") {
  return `❌ You don't have permission to use this command. This action requires the **${requiredRole}** role.`;
}

module.exports = {
  isTechSpaceAdmin,
  isBuildLabTeam,
  getMemberTrack,
  getPermissionDeniedMessage,
};
