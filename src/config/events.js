/**
 * BuildLab '26 Timeline & Milestone Configuration
 * All dates can be adjusted here without modifying command code.
 */

// Timeline dates (ISO 8601 strings)
// Current local year is 2026
const timeline = [
  {
    key: "program_start",
    title: "Program Kickoff",
    date: "2026-10-01T10:00:00+05:30",
    description: "Welcome address and entry task completion.",
  },
  {
    key: "track_selection",
    title: "Track Selection Deadline",
    date: "2026-10-04T23:59:59+05:30",
    description: "Deadline to choose Beginner, Intermediate, or Advanced track.",
  },
  {
    key: "prd_deadline",
    title: "PRD Submission Deadline",
    date: "2026-10-08T23:59:59+05:30",
    description: "Deadline to submit Project Requirements Document for review.",
  },
  {
    key: "mid_review",
    title: "Mid-Program Review",
    date: "2026-10-15T18:00:00+05:30",
    description: "Core architecture check-in with mentors.",
  },
  {
    key: "final_submission",
    title: "Final Submission Deadline",
    date: "2026-10-22T23:59:59+05:30",
    description: "Submit repository, documentation, and working build.",
  },
  {
    key: "demo_day",
    title: "BuildLab Demo Day",
    date: "2026-10-24T14:00:00+05:30",
    description: "Live demonstration and evaluation by mentors & judges.",
  },
  {
    key: "closing_results",
    title: "Closing & Results",
    date: "2026-10-25T18:00:00+05:30",
    description: "Awards, certificates, and closing ceremony.",
  },
];

/**
 * Returns formatted time remaining for a date
 * @param {string|Date} targetDate 
 * @returns {{ past: boolean, days: number, hours: number, minutes: number, formatted: string }}
 */
function getTimeRemaining(targetDate) {
  const target = new Date(targetDate).getTime();
  const now = Date.now();
  const diff = target - now;

  if (diff <= 0) {
    return { past: true, days: 0, hours: 0, minutes: 0, formatted: "Ended" };
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);

  let formatted = "";
  if (days > 0) {
    formatted = `${days} day${days > 1 ? "s" : ""} remaining`;
  } else if (hours > 0) {
    formatted = `${hours} hour${hours > 1 ? "s" : ""} remaining`;
  } else {
    formatted = `${minutes} minute${minutes > 1 ? "s" : ""} remaining`;
  }

  return { past: false, days, hours, minutes, formatted };
}

module.exports = {
  timeline,
  getTimeRemaining,
};
