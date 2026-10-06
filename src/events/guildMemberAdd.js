const { Events } = require("discord.js");
const config = require("../config/config");
const { upsertUser } = require("../services/teams");
const { createBaseEmbed, COLORS } = require("../utils/embeds");

module.exports = {
  name: Events.GuildMemberAdd,
  /**
   * @param {import("discord.js").GuildMember} member 
   */
  async execute(member) {
    try {
      // Record user in database
      upsertUser(member.id, member.user.username);

      const guild = member.guild;
      const targetChannel = guild.channels.cache.find(
        (c) => c.name === config.channels.introductions
      ) || guild.channels.cache.find(
        (c) => c.name === config.channels.general
      );

      if (!targetChannel || !targetChannel.isTextBased()) {
        console.warn(`⚠️ Could not find introductions channel to welcome ${member.user.tag}`);
        return;
      }

      // Fetch channel mentions
      const rulesChannel = guild.channels.cache.find((c) => c.name === config.channels.rules);
      const gettingStartedChannel = guild.channels.cache.find((c) => c.name === config.channels.gettingStarted);
      const introChannel = guild.channels.cache.find((c) => c.name === config.channels.introductions);

      const rulesMention = rulesChannel ? `<#${rulesChannel.id}>` : "#rules";
      const gettingStartedMention = gettingStartedChannel ? `<#${gettingStartedChannel.id}>` : "#getting-started";
      const introMention = introChannel ? `<#${introChannel.id}>` : "#introductions";

      const embed = createBaseEmbed(
        "🚀 Welcome to TechSpace BuildLab ’26!",
        `Welcome to the program, <@${member.id}>!\n\n**Start here:**\n` +
        `1. Read ${rulesMention}\n` +
        `2. Check ${gettingStartedMention}\n` +
        `3. Introduce yourself in ${introMention}\n` +
        `4. Choose your track using \`/track\`\n` +
        `5. Join the BuildLab workflow\n\n` +
        `**Need help?**\n` +
        `Use \`/help\` at any time to get guidance.`,
        COLORS.DEFAULT
      );

      await targetChannel.send({
        content: `Welcome <@${member.id}>! 👋`,
        embeds: [embed],
      });

      console.log(`👋 Welcomed ${member.user.tag} in #${targetChannel.name}`);
    } catch (error) {
      console.error("❌ Error sending welcome message:", error.message);
    }
  },
};
