require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const { REST, Routes } = require("discord.js");
const config = require("./config/config");

if (!config.discord.token || !config.discord.guildId) {
  console.error("❌ Missing DISCORD_TOKEN or GUILD_ID in environment variables.");
  process.exit(1);
}

const commands = [];
const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith(".js"));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ("data" in command && "execute" in command) {
    commands.push(command.data.toJSON());
  }
}

const rest = new REST({ version: "10" }).setToken(config.discord.token);

(async () => {
  try {
    console.log(`Started refreshing ${commands.length} application (/) commands.`);

    // Fetch the client ID from token if not explicitly provided
    const userResponse = await rest.get(Routes.user());
    const clientId = userResponse.id;

    console.log(`🤖 Using Client ID: ${clientId} for Guild ID: ${config.discord.guildId}`);

    const data = await rest.put(
      Routes.applicationGuildCommands(clientId, config.discord.guildId),
      { body: commands }
    );

    console.log(`✅ Successfully reloaded ${data.length} application (/) commands into guild!`);
  } catch (error) {
    console.error("❌ Error deploying commands:", error);
  }
})();
