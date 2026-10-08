require("dotenv").config();

const config = {
  discord: {
    token: process.env.DISCORD_TOKEN,
    guildId: process.env.GUILD_ID,
    clientId: process.env.CLIENT_ID || null, // Will default to client.user.id if not set
  },
  github: {
    token: process.env.GITHUB_TOKEN || null,
    org: process.env.GITHUB_ORG || "techspace-srm",
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET || null,
    webhookPort: parseInt(process.env.PORT || process.env.GITHUB_WEBHOOK_PORT || "3000", 10),
    publicUrl: process.env.PUBLIC_URL || null,
    activeDays: parseInt(process.env.GITHUB_ACTIVE_DAYS || "2", 10),
    lowActivityDays: parseInt(process.env.GITHUB_LOW_ACTIVITY_DAYS || "4", 10),
    atRiskDays: parseInt(process.env.GITHUB_AT_RISK_DAYS || "7", 10),
  },
  roles: {
    admin: process.env.ADMIN_ROLE_NAME || "TechSpace Admin",
    team: process.env.TEAM_ROLE_NAME || "BuildLab Team",
    beginner: process.env.BEGINNER_ROLE_NAME || "Beginner",
    intermediate: process.env.INTERMEDIATE_ROLE_NAME || "Intermediate",
    advanced: process.env.ADVANCED_ROLE_NAME || "Advanced",
  },
  roleIds: {
    admin: process.env.ADMIN_ROLE_ID || null,
    team: process.env.TEAM_ROLE_ID || null,
    beginner: process.env.BEGINNER_ROLE_ID || null,
    intermediate: process.env.INTERMEDIATE_ROLE_ID || null,
    advanced: process.env.ADVANCED_ROLE_ID || null,
  },
  trackNames: ["Beginner", "Intermediate", "Advanced"],
  trackTeamSizes: {
    Beginner: { min: 1, max: 1, label: "Solo (1 member)" },
    Intermediate: { min: 2, max: 2, label: "Duo (2 members)" },
    Advanced: { min: 3, max: 4, label: "Squad (3–4 members)" },
  },
  catalogue: {
    defaultCapacity: 3,
    capacities: {
      B01: 3,
      B07: 3,
    },
    knownProblemStatements: {
      B01: { id: "B01", title: "Campus Lost & Found", baseRepo: "campus-lost-and-found", capacity: 3 },
      B07: { id: "B07", title: "Automated File Organizer", baseRepo: "automated-file-organizer", capacity: 3 },
    },
  },
  stages: [
    "PLANNING",
    "PRD_REVIEW",
    "DEVELOPMENT",
    "TESTING",
    "DOCUMENTATION",
    "SUBMISSION",
    "DEMO",
    "COMPLETED",
  ],
  mentorStatuses: [
    "On Track",
    "Needs Attention",
    "At Risk",
    "Not Assessed",
  ],
  channels: {
    announcements: "announcements",
    rules: "rules",
    gettingStarted: "getting-started",
    faq: "faq",
    projectDiscussion: "project-discussion",
    weeklyUpdates: "weekly-updates",
    submissions: "submissions",
    general: "general",
    introductions: "introductions",
    help: "help",
    githubHelp: "github-help",
    debugging: "debugging",
    teamCoordination: "team-coordination",
    mentorHelp: "mentor-help",
    evaluation: "evaluation",
  },
  tickets: {
    categoryName: process.env.TICKET_CATEGORY_NAME || "🎫 TICKETS",
    archiveCategoryName: process.env.TICKET_ARCHIVE_CATEGORY_NAME || "📁 CLOSED TICKETS",
    categories: {
      technical: {
        id: "technical",
        label: "Technical Issue",
        emoji: "🐛",
        description: "Bugs, runtime errors, and unexpected code behaviour",
        guidance:
          "Please describe:\n• What are you trying to build?\n• What is the expected vs actual behaviour?\n• Paste relevant error messages / stack traces\n• Code snippets\n⚠️ *Never share passwords, API keys or .env files!*",
      },
      github: {
        id: "github",
        label: "GitHub Support",
        emoji: "🐙",
        description: "Git commands, branches, PRs, merge conflicts",
        guidance:
          "Please specify:\n• Repository name\n• Git command you ran\n• Error message or conflict details\n• Head & Base branches\n⚠️ *Never share personal access tokens!*",
      },
      prd: {
        id: "prd",
        label: "PRD / Project",
        emoji: "📋",
        description: "Scope, milestones, requirements, and architecture",
        guidance:
          "Please specify:\n• Project Name & PRD ID (e.g. BL-PRD-001)\n• Track (Beginner / Intermediate / Advanced)\n• Specific milestone or requirement question",
      },
      mentor: {
        id: "mentor",
        label: "Mentor Help",
        emoji: "🧑‍🏫",
        description: "1-on-1 mentor guidance and technical blocking issues",
        guidance:
          "Please share:\n• Project Name\n• Current milestone you are working on\n• What exactly is blocking you from progressing?",
      },
      general: {
        id: "general",
        label: "General Doubt",
        emoji: "❓",
        description: "General BuildLab program questions and logistics",
        guidance:
          "Please explain your question or concern clearly. A BuildLab team member will assist you shortly.",
      },
    },
  },
  databasePath: process.env.DATABASE_PATH || "data/buildlab.sqlite",
};

module.exports = config;
