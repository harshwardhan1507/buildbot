require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const { Client, Collection, GatewayIntentBits } = require("discord.js");
const config = require("./config/config");
const { stopWebhookServer } = require("./services/github");
const { stopReminderService } = require("./services/reminders");
const db = require("./services/database");

if (!config.discord.token || !config.discord.guildId) {
  console.error("❌ Missing DISCORD_TOKEN or GUILD_ID in environment variables.");
  process.exit(1);
}

/**
 * Creates and initializes a Discord Client instance with given intents
 * @param {Array<number>} intents 
 * @returns {Client}
 */
function createBotClient(intents) {
  const client = new Client({ intents });
  client.commands = new Collection();

  // Load commands
  const commandsPath = path.join(__dirname, "commands");
  const commandFiles = fs.readdirSync(commandsPath).filter((f) => f.endsWith(".js"));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ("data" in command && "execute" in command) {
      client.commands.set(command.data.name, command);
    }
  }

  // Load events
  const eventsPath = path.join(__dirname, "events");
  const eventFiles = fs.readdirSync(eventsPath).filter((f) => f.endsWith(".js"));

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args));
    } else {
      client.on(event.name, (...args) => event.execute(...args));
    }
  }

  return client;
}

let activeClient = null;

function handleShutdown(signal) {
  console.log(`\n🛑 Received ${signal}. Shutting down BuildLab Bot gracefully...`);
  stopWebhookServer();
  stopReminderService();
  try {
    db.closeDatabase();
  } catch (err) {
    console.error("❌ Error closing database:", err.message);
  }
  if (activeClient) {
    activeClient.destroy();
  }
  process.exit(0);
}

process.on("SIGINT", () => handleShutdown("SIGINT"));
process.on("SIGTERM", () => handleShutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled Promise Rejection:", reason?.stack || reason);
});

process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error?.stack || error);
});

async function startBot() {
  const allPrivilegedIntents = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ];

  const membersOnlyIntents = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ];

  const standardIntents = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ];

  // 1. Try full privileged intents (GuildMembers + MessageContent)
  try {
    activeClient = createBotClient(allPrivilegedIntents);
    await activeClient.login(config.discord.token);
    return;
  } catch (error) {
    if (!error.message || !error.message.includes("disallowed intents")) {
      console.error("❌ Failed to log in to Discord:", error.message);
      process.exit(1);
    }
  }

  // 2. Try with GuildMembers without MessageContent
  try {
    console.warn(
      "⚠️ Privileged 'MessageContent' intent not enabled in Discord Developer Portal.\n" +
      "   Direct file uploads without bot mention may not be readable.\n" +
      "   Toggle 'Message Content Intent' in Discord Portal to enable file uploads.\n" +
      "   Trying with GuildMembers..."
    );
    if (activeClient) activeClient.destroy();
    activeClient = createBotClient(membersOnlyIntents);
    await activeClient.login(config.discord.token);
    return;
  } catch (error) {
    if (!error.message || !error.message.includes("disallowed intents")) {
      console.error("❌ Failed to log in to Discord:", error.message);
      process.exit(1);
    }
  }

  // 3. Fallback to standard intents
  try {
    console.warn(
      "⚠️ Privileged 'GuildMembers' intent also not enabled in Discord Developer Portal.\n" +
      "   Falling back to standard intents (Commands, PRDs, database, and reminders will function).\n" +
      "   Toggle 'Server Members Intent' and 'Message Content Intent' in Discord Portal for full capabilities."
    );
    if (activeClient) activeClient.destroy();
    activeClient = createBotClient(standardIntents);
    await activeClient.login(config.discord.token);
  } catch (error) {
    console.error("❌ Failed to log in to Discord:", error.message);
    process.exit(1);
  }
}

startBot();

module.exports = { startBot };
