require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionFlagsBits,
} = require("discord.js");

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !GUILD_ID) {
  console.error("❌ Missing DISCORD_TOKEN or GUILD_ID in .env");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// ==================================================
// CHANNEL GUIDES
// ==================================================

const guides = {
  announcements: {
    title: "📢 BuildLab Announcements",
    description:
      "Official updates from the TechSpace BuildLab team.",
    fields: [
      {
        name: "Use this channel for",
        value:
          "• Schedule changes\n• Deadlines\n• Important instructions\n• Program-wide updates",
      },
      {
        name: "Questions",
        value: "For questions, use the appropriate support channel.",
      },
    ],
  },

  rules: {
    title: "📜 BuildLab Rules",
    description:
      "Please read this before starting your project.",
    fields: [
      {
        name: "Key Rules",
        value:
          "• Follow your approved PRD.\n" +
          "• Submit original work or properly credit third-party work.\n" +
          "• Use GitHub for project development and submissions.\n" +
          "• Keep communication respectful.\n" +
          "• Never share private credentials, API keys or secrets.\n" +
          "• AI tools are allowed, but you remain responsible for your work.\n" +
          "• Ask for help when you're stuck.",
      },
      {
        name: "Questions",
        value: "Questions about rules → #help",
      },
    ],
  },

  "getting-started": {
    title: "🚀 Start Here",
    description:
      "Your starting point for TechSpace BuildLab ’26.",
    fields: [
      {
        name: "Your BuildLab Journey",
        value:
          "**01** Join Discord + GitHub\n" +
          "**02** Complete the entry task\n" +
          "**03** Choose your track\n" +
          "**04** Form your team if applicable\n" +
          "**05** Prepare your PRD\n" +
          "**06** Get mentor approval\n" +
          "**07** Create your project repository\n" +
          "**08** Build → Commit → PR → Review\n" +
          "**09** Submit your final project\n" +
          "**10** Demo your project",
      },
      {
        name: "Need Help?",
        value: "Not sure what to do next? Ask in #help.",
      },
    ],
  },

  faq: {
    title: "❓ Frequently Asked Questions",
    description:
      "Common questions about BuildLab will be answered here.",
    fields: [
      {
        name: "Before asking",
        value:
          "1. Search this channel.\n" +
          "2. Check #getting-started.\n" +
          "3. If you still can't find the answer, ask in #help.",
      },
      {
        name: "Keep this channel useful",
        value:
          "The BuildLab team will continuously add useful answers here.",
      },
    ],
  },

  "project-discussion": {
    title: "💡 Project Discussion",
    description:
      "Use this channel to discuss project ideas, scope and technical direction.",
    fields: [
      {
        name: "Good Questions",
        value:
          "• Is this project suitable for my track?\n" +
          "• Is this feature too large for two weeks?\n" +
          "• Which technology should I use?\n" +
          "• Can I modify my approved scope?",
      },
      {
        name: "How to Ask",
        value:
          "**Project:** Campus Expense Tracker\n" +
          "**Track:** Intermediate\n" +
          "**Problem:** Authentication may be too large for the core scope.\n" +
          "**Question:** Should authentication be Core or Stretch?",
      },
    ],
  },

  "weekly-updates": {
    title: "📅 Weekly Updates",
    description:
      "Track-wide progress updates and important checkpoints.",
    fields: [
      {
        name: "Use this channel for",
        value:
          "• Progress updates\n• Milestone questions\n• Deadline clarification",
      },
      {
        name: "Technical Problems",
        value: "For technical debugging → #debugging",
      },
    ],
  },

  submissions: {
    title: "📦 Submissions",
    description:
      "Use this channel for required BuildLab deliverables.",
    fields: [
      {
        name: "Before Submitting",
        value:
          "• PRD approved\n" +
          "• GitHub repository updated\n" +
          "• README completed\n" +
          "• Core requirements completed\n" +
          "• Documentation added\n" +
          "• Demo ready",
      },
      {
        name: "Submission Format",
        value:
          "Follow the submission format provided by the BuildLab team.",
      },
    ],
  },

  general: {
    title: "💬 General",
    description:
      "The general BuildLab community space.",
    fields: [
      {
        name: "Talk About",
        value:
          "• BuildLab\n• Development\n• Project ideas\n• Tech\n• Interesting resources\n• Community discussions",
      },
      {
        name: "Need Technical Help?",
        value: "#help → General help\n#debugging → Technical bugs\n#github-help → Git/GitHub",
      },
    ],
  },

  introductions: {
    title: "👋 Introduce Yourself",
    description:
      "Tell the community a little about yourself.",
    fields: [
      {
        name: "Share",
        value:
          "**Name:**\n" +
          "**Year:**\n" +
          "**Track:**\n" +
          "**Tech you're interested in:**\n" +
          "**What you're building:**\n" +
          "**Something you're learning:**",
      },
      {
        name: "Keep It Simple",
        value: "Keep it short and meet your fellow builders.",
      },
    ],
  },

  help: {
    title: "🆘 General Help",
    description:
      "Ask here when you're not sure where your problem belongs.",
    fields: [
      {
        name: "Good Questions",
        value:
          "• I'm stuck and don't know what's wrong.\n" +
          "• Which channel should I ask this in?\n" +
          "• I don't understand the submission process.\n" +
          "• I need help choosing between two approaches.",
      },
      {
        name: "How to Ask a Good Question",
        value:
          "**1.** What are you trying to do?\n" +
          "**2.** What have you tried?\n" +
          "**3.** What happened?\n" +
          "**4.** What did you expect?\n" +
          "**5.** What have you already checked?",
      },
      {
        name: "Avoid",
        value:
          "❌ \"It doesn't work\"\n\n" +
          "Give enough context for someone to actually help you.",
      },
    ],
  },

  "github-help": {
    title: "🐙 GitHub Help",
    description:
      "Use this channel for Git and GitHub problems.",
    fields: [
      {
        name: "Ask About",
        value:
          "• Git commands\n" +
          "• Branches\n" +
          "• Commits\n" +
          "• Pull Requests\n" +
          "• Merge conflicts\n" +
          "• Repository setup\n" +
          "• GitHub Actions\n" +
          "• GitHub permissions",
      },
      {
        name: "Example",
        value:
          "**Problem:** `git push` gives an error\n" +
          "**Repository:** `your-repo`\n" +
          "**Command:** `git push origin main`\n" +
          "**Error:** Paste the error here",
      },
      {
        name: "⚠️ Security",
        value:
          "Never post passwords, API keys, tokens or `.env` contents.",
      },
    ],
  },

  debugging: {
    title: "🐛 Debugging",
    description:
      "Use this channel for technical bugs and errors.",
    fields: [
      {
        name: "Before Asking",
        value:
          "1. Explain what you're trying to build.\n" +
          "2. Describe the expected behaviour.\n" +
          "3. Describe what actually happens.\n" +
          "4. Include the relevant error message.\n" +
          "5. Include the smallest relevant code/config snippet.",
      },
      {
        name: "Example",
        value:
          "**Problem:** API request returns 401\n" +
          "**Expected:** User data is returned\n" +
          "**Actual:** Server returns `401 Unauthorized`\n" +
          "**Tried:** Checked endpoint and request headers\n" +
          "**Error:** Paste error here",
      },
      {
        name: "⚠️ Security",
        value:
          "Never share secrets, API keys, passwords or tokens.",
      },
    ],
  },

  beginner: {
    title: "🔵 Beginner Track",
    description:
      "This channel is for participants working in the Beginner track.",
    fields: [
      {
        name: "Use This Channel For",
        value:
          "• Track-specific questions\n" +
          "• Beginner project discussions\n" +
          "• Track announcements\n" +
          "• Peer help",
      },
      {
        name: "Need More Help?",
        value:
          "#help → General questions\n" +
          "#debugging → Technical bugs\n" +
          "#github-help → GitHub",
      },
    ],
  },

  intermediate: {
    title: "🟣 Intermediate Track",
    description:
      "This channel is for participants working in the Intermediate track.",
    fields: [
      {
        name: "Discuss",
        value:
          "• Project architecture\n" +
          "• Feature implementation\n" +
          "• Team collaboration\n" +
          "• Technical decisions\n" +
          "• Track-specific questions",
      },
      {
        name: "Need More Help?",
        value:
          "#debugging → Technical bugs\n#github-help → GitHub",
      },
    ],
  },

  advanced: {
    title: "🔴 Advanced Track",
    description:
      "This channel is for participants working in the Advanced track.",
    fields: [
      {
        name: "Discuss",
        value:
          "• Architecture\n" +
          "• System design\n" +
          "• Complex implementation decisions\n" +
          "• Performance\n" +
          "• Advanced technical problems",
      },
      {
        name: "Need More Help?",
        value:
          "#debugging → Technical bugs\n#github-help → GitHub",
      },
    ],
  },

  "team-coordination": {
    title: "🛠️ Team Coordination",
    description:
      "Internal coordination for the BuildLab Team.",
    fields: [
      {
        name: "Use For",
        value:
          "• Mentor assignments\n" +
          "• Participant issues\n" +
          "• Schedule coordination\n" +
          "• Internal decisions\n" +
          "• Operational updates",
      },
    ],
  },

  "mentor-help": {
    title: "🧑‍🏫 Mentor Help",
    description:
      "Internal mentor discussion.",
    fields: [
      {
        name: "Use For",
        value:
          "• Difficult technical questions\n" +
          "• PRD decisions\n" +
          "• Scope concerns\n" +
          "• Escalated participant problems\n" +
          "• Mentor-to-mentor assistance",
      },
    ],
  },

  evaluation: {
    title: "📊 Evaluation",
    description:
      "Internal evaluation workspace.",
    fields: [
      {
        name: "Use For",
        value:
          "• Evaluation criteria\n" +
          "• Project reviews\n" +
          "• Scores\n" +
          "• Demo observations\n" +
          "• Final results",
      },
    ],
  },
};

// ==================================================
// SEND GUIDE
// ==================================================

async function postGuide(channel, guide) {
  const messages = await channel.messages.fetch({ limit: 20 });

  // Prevent duplicate guides
  const alreadyPosted = messages.some(
    (message) =>
      message.author.id === client.user.id &&
      message.embeds.length > 0 &&
      message.embeds[0].title === guide.title
  );

  if (alreadyPosted) {
    console.log(`↪️ Guide already exists: #${channel.name}`);
    return;
  }

  const embed = {
    title: guide.title,
    description: guide.description,
    fields: guide.fields,
    footer: {
      text: "TechSpace BuildLab ’26 • Learn by Building",
    },
  };

  const message = await channel.send({
    embeds: [embed],
  });

  const canPin = channel.permissionsFor(client.user)?.has(
    PermissionFlagsBits.ManageMessages
  );

  if (canPin) {
    await message.pin();
    console.log(`📌 Guide posted and pinned: #${channel.name}`);
  } else {
    console.log(
      `⚠️ Guide posted without pin: #${channel.name} (missing Manage Messages permission)`
    );
  }
}

// ==================================================
// BOT READY
// ==================================================

client.once("clientReady", async () => {
  try {
    console.log(`✅ Logged in as ${client.user.tag}`);

    const guild = await client.guilds.fetch(GUILD_ID);

    console.log(`📡 Loading: ${guild.name}`);

    for (const [channelName, guide] of Object.entries(guides)) {
      const channel = guild.channels.cache.find(
        (channel) =>
          channel.name === channelName &&
          channel.type === ChannelType.GuildText
      );

      if (!channel) {
        console.log(`⚠️ Channel not found: #${channelName}`);
        continue;
      }

      await postGuide(channel, guide);
    }

    console.log("");
    console.log("🚀 All channel guides are ready!");
    console.log("📌 Guides have been pinned.");
    
    client.destroy();
  } catch (error) {
    console.error("❌ Setup failed:");
    console.error(error);
    client.destroy();
  }
});

client.login(TOKEN);