const { timeline, getTimeRemaining, ANNOUNCEMENTS } = require("../config/events");
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
 * Key milestones:
 * - REGISTRATION + PRD: 1 day before (07 Oct), day of deadline (08 Oct)
 * - MIDPOINT CHECK-IN: day of checkpoint (16 Oct)
 * - FINAL SUBMISSION: 1 day before (22 Oct), day of final submission (23 Oct)
 * No daily reminders during build phases.
 *
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
      let title = "";
      let description = "";
      let color = COLORS.WARNING;

      if (event.key === "registration_prd_close") {
        if (remaining.days === 1) {
          milestone = "1_day_before";
          title = ANNOUNCEMENTS.REGISTRATION_REMINDER_1DAY.title;
          description = ANNOUNCEMENTS.REGISTRATION_REMINDER_1DAY.description;
        } else if (remaining.days === 0) {
          milestone = "deadline_day";
          title = ANNOUNCEMENTS.REGISTRATION_CLOSING.title;
          description = ANNOUNCEMENTS.REGISTRATION_CLOSING.description;
        }
      } else if (event.key === "midpoint_checkin") {
        if (remaining.days === 0) {
          milestone = "midpoint_day";
          title = ANNOUNCEMENTS.MIDPOINT.title;
          description = ANNOUNCEMENTS.MIDPOINT.description;
          color = COLORS.INFO;
        }
      } else if (event.key === "final_submission") {
        if (remaining.days === 1) {
          milestone = "1_day_before";
          title = ANNOUNCEMENTS.FINAL_SUBMISSION_1DAY.title;
          description = ANNOUNCEMENTS.FINAL_SUBMISSION_1DAY.description;
        } else if (remaining.days === 0) {
          milestone = "final_day";
          title = ANNOUNCEMENTS.FINAL_SUBMISSION.title;
          description = ANNOUNCEMENTS.FINAL_SUBMISSION.description;
          color = COLORS.SUCCESS;
        }
      }

      if (milestone) {
        // Check if this milestone for this event was already sent
        const alreadySent = db.prepare(
          "SELECT id FROM reminder_logs WHERE event_key = ? AND milestone = ?"
        ).get(event.key, milestone);

        if (!alreadySent || forceTest) {
          const embed = createBaseEmbed(title, description, color).addFields(
            { name: "Target Date", value: "2026-10-" + event.date.slice(8, 10) + " (IST)", inline: true },
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
