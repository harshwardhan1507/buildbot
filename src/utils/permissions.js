const config = require("../config/config");

/**
 * Checks if a GuildMember has the TechSpace Admin role
 * @param {import("discord.js").GuildMember} member 
 * @returns {boolean}
 */
function isTechSpaceAdmin(member) {
  if (!member || !member.roles) return false;
  return member.roles.cache.some((role) => role.name === config.roles.admin);
}

/**
 * Checks if a GuildMember has the BuildLab Team or TechSpace Admin role
 * @param {import("discord.js").GuildMember} member 
 * @returns {boolean}
 */
function isBuildLabTeam(member) {
  if (!member || !member.roles) return false;
  return member.roles.cache.some(
    (role) => role.name === config.roles.team || role.name === config.roles.admin
  );
}

/**
 * Checks if a member has a specific track role
 * @param {import("discord.js").GuildMember} member 
 * @returns {string|null} Track name if member has one, otherwise null
 */
function getMemberTrack(member) {
  if (!member || !member.roles) return null;
  for (const track of config.trackNames) {
    if (member.roles.cache.some((r) => r.name.toLowerCase() === track.toLowerCase())) {
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
