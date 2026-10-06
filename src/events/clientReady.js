const { Events, REST, Routes } = require("discord.js");
const config = require("../config/config");
const { startReminderService } = require("../services/reminders");
const { startWebhookServer } = require("../services/github");

module.exports = {
  name: Events.ClientReady,
  once: true,
  /**
   * @param {import("discord.js").Client} client 
   */
  async execute(client) {
    console.log(`✅ Logged in as ${client.user.tag}`);

    // Register / Sync guild slash commands
    try {
      const commandsData = [];
      for (const [, command] of client.commands) {
        commandsData.push(command.data.toJSON());
      }

      const rest = new REST({ version: "10" }).setToken(config.discord.token);
      console.log(`📡 Syncing ${commandsData.length} slash commands to guild ${config.discord.guildId}...`);

      await rest.put(
        Routes.applicationGuildCommands(client.user.id, config.discord.guildId),
        { body: commandsData }
      );

      console.log("✅ Slash commands successfully registered with Discord API!");
    } catch (error) {
      console.error("❌ Failed to register slash commands:", error.message);
    }

    // Start background services
    try {
      startReminderService(client);
    } catch (e) {
      console.error("❌ Failed to start reminder service:", e.message);
    }

    try {
      startWebhookServer(client);
    } catch (e) {
      console.error("❌ Failed to start GitHub webhook server:", e.message);
    }
  },
};
