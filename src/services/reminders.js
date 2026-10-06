const { timeline, getTimeRemaining } = require("../config/events");
const db = require("./database");
const config = require("../config/config");
const { createBaseEmbed, COLORS } = require("../utils/embeds");

let intervalTimer = null;

/**
 * Check if automated reminders are enabled
 * @returns {boolean}
 */
function areRemindersEnabled() {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get("reminders_enabled");
  return row ? row.value === "true" : true;
}

/**
 * Toggle automated reminders on or off
 * @param {boolean} enabled 
 */
function setRemindersEnabled(enabled) {
  const val = enabled ? "true" : "false";
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("reminders_enabled", val);
}

/**
 * Checks all milestones and sends any due reminders
 * @param {import("discord.js").Client} client 
 * @param {boolean} [forceTest=false] 
 * @returns {Promise<Array<string>>} List of sent notifications
 */
async function checkAndSendReminders(client, forceTest = false) {
  if (!forceTest && !areRemindersEnabled()) {
    return [];
  }

  const sent = [];

  try {
    const guild = await client.guilds.fetch(config.discord.guildId);
    if (!guild) return sent;

    const channel = guild.channels.cache.find(
      (c) => c.name === config.channels.announcements || c.name === config.channels.projectDiscussion
    );
    if (!channel || !channel.isTextBased()) return sent;

    for (const event of timeline) {
      const remaining = getTimeRemaining(event.date);
      if (remaining.past) continue;

      let milestone = null;
      let alertMessage = "";

      if (remaining.days === 3) {
        milestone = "3_days";
        alertMessage = `📦 **${event.title}** is in **3 days**!`;
      } else if (remaining.days === 1) {
        milestone = "1_day";
        alertMessage = `⏰ **${event.title}** is **tomorrow**!`;
      } else if (remaining.days === 0 && remaining.hours > 0) {
        milestone = "today";
        alertMessage = `🚀 **${event.title}** is **today** (${remaining.formatted})!`;
      }

      if (milestone) {
        // Check if this milestone for this event was already sent
        const alreadySent = db.prepare(
          "SELECT id FROM reminder_logs WHERE event_key = ? AND milestone = ?"
        ).get(event.key, milestone);

        if (!alreadySent || forceTest) {
          const embed = createBaseEmbed("⏰ BuildLab Deadline Reminder", "", COLORS.WARNING)
            .setDescription(`${alertMessage}\n\n**Description:** ${event.description}`)
            .addFields(
              { name: "Milestone", value: event.title, inline: true },
              { name: "Time Remaining", value: remaining.formatted, inline: true }
            );

          await channel.send({ embeds: [embed] });

          if (!forceTest) {
            db.prepare(
              "INSERT OR REPLACE INTO reminder_logs (event_key, milestone, sent_at) VALUES (?, ?, ?)"
            ).run(event.key, milestone, new Date().toISOString());
          }

          sent.push(`${event.title} (${milestone})`);
        }
      }
    }
  } catch (error) {
    console.error("❌ Error running reminder check:", error.message);
  }

  return sent;
}

/**
 * Starts the reminder checking interval (every 30 minutes)
 * @param {import("discord.js").Client} client 
 */
function startReminderService(client) {
  if (intervalTimer) return;

  // Run initial check after 10 seconds
  setTimeout(() => {
    checkAndSendReminders(client).catch(() => {});
  }, 10000);

  // Then check every 30 minutes
  intervalTimer = setInterval(() => {
    checkAndSendReminders(client).catch(() => {});
  }, 30 * 60 * 1000);

  console.log("⏰ BuildLab Reminder service initialized (interval: 30m)");
}

/**
 * Stops the reminder service
 */
function stopReminderService() {
  if (intervalTimer) {
    clearInterval(intervalTimer);
    intervalTimer = null;
  }
}

module.exports = {
  areRemindersEnabled,
  setRemindersEnabled,
  checkAndSendReminders,
  startReminderService,
  stopReminderService,
};
