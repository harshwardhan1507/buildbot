/**
 * BuildLab '26 Timeline & Milestone Configuration
 * All dates can be adjusted here without modifying command code.
 */

// Timeline dates (ISO 8601 strings in IST: +05:30)
const timeline = [
  {
    key: "kickoff_registration",
    title: "Program Kickoff + Registration Opens",
    date: "2026-10-06T00:00:00+05:30",
    description: "Program introduction, onboarding, track selection, project selection / own idea, and GitHub + Discord onboarding.",
  },
  {
    key: "registration_prd_close",
    title: "Registration + PRD Close",
    date: "2026-10-08T23:59:59+05:30",
    description: "Registration and PRD submissions close at 11:59 PM. Submit proposal PDF and GitHub repository.",
  },
  {
    key: "midpoint_checkin",
    title: "Midpoint Check-In",
    date: "2026-10-16T23:59:59+05:30",
    description: "Review project progress, identify blockers, and get mentor feedback. Progress check, not a formal submission deadline.",
  },
  {
    key: "final_submission",
    title: "Final Submission + Program Conclusion",
    date: "2026-10-23T23:59:59+05:30",
    description: "Final project submission and completion of BuildLab ’26.",
  },
];

/**
 * Returns IST date breakdown
 * @param {string|Date} [dateInput]
 */
function getISTDateComponents(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(d);
  const partMap = {};
  for (const p of parts) {
    partMap[p.type] = p.value;
  }
  return {
    year: parseInt(partMap.year, 10),
    month: parseInt(partMap.month, 10),
    day: parseInt(partMap.day, 10),
    hour: parseInt(partMap.hour, 10),
    minute: parseInt(partMap.minute, 10),
    second: parseInt(partMap.second, 10),
    dateString: `${partMap.year}-${partMap.month}-${partMap.day}`,
  };
}

/**
 * Evaluates current program phase based on IST calendar date
 * @param {string|Date} [dateInput]
 * @returns {{ phaseKey: string, currentPhase: string, nextLabel: string|null, nextValue: string|null, description: string }}
 */
function getCurrentPhase(dateInput = new Date()) {
  const { year, month, day } = getISTDateComponents(dateInput);

  // 24 OCT onward (or after Oct 2026): PROGRAM COMPLETED
  if (year > 2026 || (year === 2026 && month > 10) || (year === 2026 && month === 10 && day >= 24)) {
    return {
      phaseKey: "COMPLETED",
      currentPhase: "PROGRAM COMPLETED",
      nextLabel: "PROGRAM",
      nextValue: "COMPLETED",
      description: "BuildLab ’26 has concluded.",
    };
  }

  // 06–08 OCT: REGISTRATION + PRD (also active if before kickoff in Oct 2026)
  if (year === 2026 && month === 10 && day <= 8) {
    return {
      phaseKey: "REGISTRATION_PRD",
      currentPhase: "REGISTRATION + PRD",
      nextLabel: "NEXT DEADLINE",
      nextValue: "08 OCT · 11:59 PM",
      description: "Register, choose track, prepare proposal & PRD, upload PDF and connect GitHub.",
    };
  }

  // 09–15 OCT: BUILD PHASE I
  if (year === 2026 && month === 10 && day >= 9 && day <= 15) {
    return {
      phaseKey: "BUILD_PHASE_1",
      currentPhase: "BUILD PHASE I",
      nextLabel: "NEXT CHECKPOINT",
      nextValue: "16 OCT · MIDPOINT CHECK-IN",
      description: "Project development, learning, Core scope implementation, and mentor support.",
    };
  }

  // 16 OCT: MIDPOINT CHECK-IN
  if (year === 2026 && month === 10 && day === 16) {
    return {
      phaseKey: "MIDPOINT_CHECKIN",
      currentPhase: "MIDPOINT CHECK-IN",
      nextLabel: "FINAL SUBMISSION",
      nextValue: "23 OCT",
      description: "Review project progress, identify blockers, and get mentor feedback. Progress checkpoint.",
    };
  }

  // 17–22 OCT: FINAL BUILD + POLISH
  if (year === 2026 && month === 10 && day >= 17 && day <= 22) {
    return {
      phaseKey: "FINAL_BUILD_POLISH",
      currentPhase: "FINAL BUILD + POLISH",
      nextLabel: "FINAL SUBMISSION",
      nextValue: "23 OCT",
      description: "Complete Core scope, add Stretch features where possible, test, document, and refine.",
    };
  }

  // 23 OCT: FINAL SUBMISSION / PROGRAM CONCLUSION
  if (year === 2026 && month === 10 && day === 23) {
    return {
      phaseKey: "FINAL_SUBMISSION",
      currentPhase: "FINAL SUBMISSION / PROGRAM CONCLUSION",
      nextLabel: "FINAL SUBMISSION",
      nextValue: "TODAY · 11:59 PM",
      description: "Final project submission and completion of BuildLab ’26.",
    };
  }

  return {
    phaseKey: "COMPLETED",
    currentPhase: "PROGRAM COMPLETED",
    nextLabel: "PROGRAM",
    nextValue: "COMPLETED",
    description: "BuildLab ’26 has concluded.",
  };
}

/**
 * Standard Announcement Copy
 */
const ANNOUNCEMENTS = {
  REGISTRATION: {
    title: "🚀 BUILDLAB ’26 REGISTRATION IS OPEN",
    description:
      "Choose a project from the catalogue or bring your own idea,\n" +
      "select your track, complete your proposal and submit your PRD.\n\n" +
      "Registration + PRD submissions close:\n" +
      "**08 OCT · 11:59 PM**",
  },
  REGISTRATION_CLOSING: {
    title: "⏰ REGISTRATION CLOSES TONIGHT",
    description:
      "Registration and PRD submissions for BuildLab ’26 close at\n" +
      "11:59 PM today.\n\n" +
      "Make sure your proposal PDF and GitHub repository are ready.",
  },
  REGISTRATION_REMINDER_1DAY: {
    title: "⏰ REGISTRATION + PRD CLOSING SOON",
    description:
      "Registration and PRD submissions for BuildLab ’26 close tomorrow,\n" +
      "**08 OCT at 11:59 PM**.\n\n" +
      "Make sure your proposal PDF and GitHub repository are ready.",
  },
  BUILD_PHASE: {
    title: "🔨 BUILD PHASE IS LIVE",
    description:
      "Registration is closed.\n" +
      "Now it's time to build.\n\n" +
      "Work on your Core scope, learn what you need and use GitHub +\n" +
      "Discord throughout the build.",
  },
  MIDPOINT: {
    title: "🔎 MIDPOINT CHECK-IN",
    description:
      "Take a look at your progress, identify blockers and get guidance\n" +
      "from mentors.\n\n" +
      "This is a progress check, not a new submission deadline.",
  },
  FINAL_SUBMISSION_1DAY: {
    title: "🏁 FINAL SUBMISSION TOMORROW",
    description:
      "Tomorrow, 23 October is the final day of BuildLab ’26.\n\n" +
      "Finish your project, polish your build and make sure your required\n" +
      "submission materials are ready.",
  },
  FINAL_SUBMISSION: {
    title: "🏁 FINAL SUBMISSION",
    description:
      "23 October is the final day of BuildLab ’26.\n\n" +
      "Finish your project, polish your build and make sure your required\n" +
      "submission materials are ready.",
  },
};

/**
 * Returns formatted time remaining for a date
 * @param {string|Date} targetDate 
 * @param {string|Date} [fromDate]
 * @returns {{ past: boolean, days: number, hours: number, minutes: number, formatted: string }}
 */
function getTimeRemaining(targetDate, fromDate = null) {
  const target = new Date(targetDate).getTime();
  const now = fromDate ? new Date(fromDate).getTime() : Date.now();
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
  getCurrentPhase,
  getTimeRemaining,
  ANNOUNCEMENTS,
};
