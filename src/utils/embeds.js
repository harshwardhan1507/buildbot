const { EmbedBuilder } = require("discord.js");

const COLORS = {
  DEFAULT: 0x5865f2,
  SUCCESS: 0x57f287,
  WARNING: 0xfee75c,
  ERROR: 0xed4245,
  INFO: 0x9b59b6,
  BEGINNER: 0x3498db,
  INTERMEDIATE: 0x9b59b6,
  ADVANCED: 0xe74c3c,
};

const FOOTER_TEXT = "TechSpace BuildLab ’26 • Learn by Building";

/**
 * Creates a base embed with standard footer and color
 * @param {string} title 
 * @param {string} [description] 
 * @param {number} [color] 
 * @returns {EmbedBuilder}
 */
function createBaseEmbed(title, description = "", color = COLORS.DEFAULT) {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .setFooter({ text: FOOTER_TEXT })
    .setTimestamp();

  if (description) {
    embed.setDescription(description);
  }

  return embed;
}

/**
 * Creates a standard success embed
 * @param {string} title 
 * @param {string} description 
 * @returns {EmbedBuilder}
 */
function createSuccessEmbed(title, description) {
  return createBaseEmbed(`✅ ${title}`, description, COLORS.SUCCESS);
}

/**
 * Creates a standard warning embed
 * @param {string} title 
 * @param {string} description 
 * @returns {EmbedBuilder}
 */
function createWarningEmbed(title, description) {
  return createBaseEmbed(`⚠️ ${title}`, description, COLORS.WARNING);
}

/**
 * Creates a standard error embed
 * @param {string} title 
 * @param {string} description 
 * @returns {EmbedBuilder}
 */
function createErrorEmbed(title, description) {
  return createBaseEmbed(`❌ ${title}`, description, COLORS.ERROR);
}

/**
 * Creates a standard info embed
 * @param {string} title 
 * @param {string} description 
 * @returns {EmbedBuilder}
 */
function createInfoEmbed(title, description) {
  return createBaseEmbed(`ℹ️ ${title}`, description, COLORS.INFO);
}

module.exports = {
  COLORS,
  FOOTER_TEXT,
  createBaseEmbed,
  createSuccessEmbed,
  createWarningEmbed,
  createErrorEmbed,
  createInfoEmbed,
};
