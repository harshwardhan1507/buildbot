const http = require("node:http");
const crypto = require("node:crypto");
const config = require("../config/config");
const db = require("./database");
const { createBaseEmbed, COLORS } = require("../utils/embeds");

let serverInstance = null;

/**
 * Verify GitHub webhook HMAC SHA256 signature
 * @param {string} payload 
 * @param {string} signatureHeader 
 * @param {string} secret 
 * @returns {boolean}
 */
function verifySignature(payload, signatureHeader, secret) {
  if (!secret) return true; // If no secret is configured, allow in development
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;

  const expectedSignature = `sha256=${crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex")}`;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

/**
 * Calculate Activity Health based on last activity timestamp
 * @param {string|null} lastActivityAt 
 * @returns {{ status: 'Active'|'Low Activity'|'No Recent Activity', icon: string, daysAgo: number }}
 */
function calculateActivityHealth(lastActivityAt) {
  if (!lastActivityAt) {
    return { status: "No Recent Activity", icon: "🔴", daysAgo: 99 };
  }

  const diffMs = Date.now() - new Date(lastActivityAt).getTime();
  const daysAgo = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (daysAgo <= config.github.activeDays) {
    return { status: "Active", icon: "🟢", daysAgo };
  } else if (daysAgo <= config.github.lowActivityDays) {
    return { status: "Low Activity", icon: "🟡", daysAgo };
  } else {
    return { status: "No Recent Activity", icon: "🔴", daysAgo };
  }
}

/**
 * Get or initialize GitHub stats for a repository
 * @param {string} repoName 
 * @returns {object}
 */
function getRepoStats(repoName) {
  if (!repoName) return null;
  const cleanName = repoName.replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, "");

  let row = db.prepare("SELECT * FROM github_stats WHERE LOWER(repo_name) = LOWER(?)").get(cleanName);
  if (!row) {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO github_stats (
        repo_name, commits_count, commits_last_7_days, open_prs, merged_prs,
        open_issues, closed_issues, reviews_count, last_activity_at, updated_at
      ) VALUES (?, 0, 0, 0, 0, 0, 0, 0, ?, ?)
    `).run(cleanName, now, now);
    row = db.prepare("SELECT * FROM github_stats WHERE LOWER(repo_name) = LOWER(?)").get(cleanName);
  }
  return row;
}

/**
 * Record repository activity event into github_stats
 * @param {string} repoName 
 * @param {string} eventType 
 * @param {object} [data] 
 */
function recordRepoActivity(repoName, eventType, data = {}) {
  const cleanName = repoName.replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, "");
  getRepoStats(cleanName); // Ensure exists

  const now = new Date().toISOString();

  if (eventType === "push") {
    const commitCount = data.commits?.length || 1;
    db.prepare(`
      UPDATE github_stats SET
        commits_count = commits_count + ?,
        commits_last_7_days = commits_last_7_days + ?,
        last_activity_at = ?,
        updated_at = ?
      WHERE LOWER(repo_name) = LOWER(?)
    `).run(commitCount, commitCount, now, now, cleanName);
  } else if (eventType === "pull_request") {
    if (data.action === "opened") {
      db.prepare(`
        UPDATE github_stats SET
          open_prs = open_prs + 1,
          last_activity_at = ?,
          updated_at = ?
        WHERE LOWER(repo_name) = LOWER(?)
      `).run(now, now, cleanName);
    } else if (data.action === "closed" && data.pull_request?.merged) {
      db.prepare(`
        UPDATE github_stats SET
          open_prs = MAX(0, open_prs - 1),
          merged_prs = merged_prs + 1,
          last_activity_at = ?,
          updated_at = ?
        WHERE LOWER(repo_name) = LOWER(?)
      `).run(now, now, cleanName);
    }
  } else if (eventType === "issues") {
    if (data.action === "opened") {
      db.prepare(`
        UPDATE github_stats SET
          open_issues = open_issues + 1,
          last_activity_at = ?,
          updated_at = ?
        WHERE LOWER(repo_name) = LOWER(?)
      `).run(now, now, cleanName);
    } else if (data.action === "closed") {
      db.prepare(`
        UPDATE github_stats SET
          open_issues = MAX(0, open_issues - 1),
          closed_issues = closed_issues + 1,
          last_activity_at = ?,
          updated_at = ?
        WHERE LOWER(repo_name) = LOWER(?)
      `).run(now, now, cleanName);
    }
  }

  // Also update linked project's last_activity_at
  db.prepare(`
    UPDATE projects SET
      last_activity_at = ?
    WHERE LOWER(repo_url) LIKE LOWER(?)
  `).run(now, `%${cleanName}%`);
}

/**
 * Connect a project to a GitHub repository
 * @param {string} projectId 
 * @param {string} repoInput 
 * @returns {object|null}
 */
function connectProjectRepo(projectId, repoInput) {
  const cleanName = repoInput.replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, "");
  const fullUrl = `https://github.com/${cleanName}`;
  const now = new Date().toISOString();

  // Link in projects table
  db.prepare(`
    UPDATE projects SET
      repo_url = ?,
      last_activity_at = ?,
      updated_at = ?
    WHERE UPPER(id) = UPPER(?)
  `).run(fullUrl, now, now, projectId.trim());

  // Ensure github_stats record exists and is linked
  const stats = getRepoStats(cleanName);
  db.prepare(`
    UPDATE github_stats SET
      project_id = ?
    WHERE LOWER(repo_name) = LOWER(?)
  `).run(projectId.trim(), cleanName);

  return { projectId, repoUrl: fullUrl, repoName: cleanName };
}

/**
 * Dispatches GitHub webhook event to appropriate Discord channel and updates stats
 * @param {import("discord.js").Client} client 
 * @param {string} eventName 
 * @param {object} payload 
 */
async function handleWebhookEvent(client, eventName, payload) {
  try {
    const repo = payload.repository?.full_name || "Unknown Repo";

    // Record stats in database
    recordRepoActivity(repo, eventName, payload);

    const guild = await client.guilds.fetch(config.discord.guildId);
    if (!guild) return;

    const channel = guild.channels.cache.find(
      (c) => c.name === config.channels.projectDiscussion
    );
    if (!channel || !channel.isTextBased()) return;

    if (eventName === "pull_request") {
      const action = payload.action;
      const pr = payload.pull_request;

      if (action === "opened") {
        const embed = createBaseEmbed("🔀 Pull Request Opened", "", COLORS.DEFAULT)
          .addFields(
            { name: "Repository", value: `\`${repo}\``, inline: false },
            { name: "PR", value: `[#${pr.number} — ${pr.title}](${pr.html_url})`, inline: false },
            { name: "Author", value: pr.user?.login || "Unknown", inline: true },
            { name: "Branch", value: `\`${pr.head.ref}\` ➔ \`${pr.base.ref}\``, inline: true }
          );

        await channel.send({ embeds: [embed] });
      } else if (action === "closed" && pr.merged) {
        const mergedBy = pr.merged_by?.login || "Mentor";
        const embed = createBaseEmbed("✅ Pull Request Merged", "", COLORS.SUCCESS)
          .addFields(
            { name: "Repository", value: `\`${repo}\``, inline: false },
            { name: "PR", value: `[#${pr.number} — ${pr.title}](${pr.html_url})`, inline: false },
            { name: "Merged By", value: mergedBy, inline: true },
            { name: "Branch", value: `\`${pr.head.ref}\` ➔ \`${pr.base.ref}\``, inline: true }
          );

        await channel.send({ embeds: [embed] });
      }
    } else if (eventName === "issues") {
      const action = payload.action;
      const issue = payload.issue;

      if (action === "opened") {
        const embed = createBaseEmbed("🐛 New Issue Created", "", COLORS.WARNING)
          .addFields(
            { name: "Repository", value: `\`${repo}\``, inline: false },
            { name: "Issue", value: `[#${issue.number} — ${issue.title}](${issue.html_url})`, inline: false },
            { name: "Author", value: issue.user?.login || "Unknown", inline: true }
          );

        await channel.send({ embeds: [embed] });
      }
    }
  } catch (error) {
    console.error("❌ Error handling GitHub webhook event:", error.message);
  }
}

/**
 * Starts the GitHub webhook HTTP server
 * @param {import("discord.js").Client} client 
 */
function startWebhookServer(client) {
  if (serverInstance) return;

  const port = config.github.webhookPort;

  serverInstance = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/api/github/webhook") {
      let body = "";

      req.on("data", (chunk) => {
        body += chunk.toString();
        if (body.length > 1e6) {
          req.socket.destroy();
        }
      });

      req.on("end", async () => {
        const signature = req.headers["x-hub-signature-256"];
        const eventName = req.headers["x-github-event"];

        if (!verifySignature(body, signature, config.github.webhookSecret)) {
          res.writeHead(401, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "Invalid signature" }));
        }

        try {
          const payload = JSON.parse(body);
          await handleWebhookEvent(client, eventName, payload);
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ status: "ok" }));
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "Invalid JSON payload" }));
        }
      });
    } else if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "healthy", service: "buildlab-bot-github" }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  serverInstance.on("error", (err) => {
    console.error("❌ GitHub Webhook server error:", err.message);
  });

  serverInstance.listen(port, "0.0.0.0", () => {
    console.log(`🐙 GitHub Webhook server listening on port ${port} (0.0.0.0)`);
  });
}

/**
 * Stops the GitHub webhook HTTP server
 */
function stopWebhookServer() {
  if (serverInstance) {
    serverInstance.close();
    serverInstance = null;
  }
}

const KNOWN_STACKS = [
  { name: "Python", regex: /\b(python|django|fastapi|flask)\b/i },
  { name: "Java", regex: /\b(java|spring|springboot)\b/i },
  { name: "React", regex: /\b(react|reactjs|nextjs|next\.js)\b/i },
  { name: "Node.js", regex: /\b(node|nodejs|node\.js|express)\b/i },
  { name: "Go", regex: /\b(golang|go)\b/i },
  { name: "Rust", regex: /\b(rust)\b/i },
  { name: "Flutter", regex: /\b(flutter|dart)\b/i },
  { name: "Kotlin", regex: /\b(kotlin|android)\b/i },
  { name: "Swift", regex: /\b(swift|ios)\b/i },
  { name: "C++", regex: /\b(c\+\+|cpp)\b/i },
  { name: "C#", regex: /\b(c#|csharp|\.net)\b/i },
  { name: "TypeScript", regex: /\b(typescript|ts)\b/i },
  { name: "Vue", regex: /\b(vue|vuejs|nuxt)\b/i },
  { name: "Angular", regex: /\b(angular)\b/i },
  { name: "PHP", regex: /\b(php|laravel)\b/i },
  { name: "Ruby", regex: /\b(ruby|rails)\b/i },
];

function extractPrimaryStack(techStack) {
  if (!techStack || typeof techStack !== "string") return "General";
  const trimmed = techStack.trim();
  for (const item of KNOWN_STACKS) {
    if (item.regex.test(trimmed)) {
      return item.name;
    }
  }
  const firstToken = trimmed.split(/[,/|;\s]+/)[0];
  if (!firstToken) return "General";
  return firstToken.charAt(0).toUpperCase() + firstToken.slice(1).toLowerCase();
}

function normalizeStack(stack) {
  if (!stack || typeof stack !== "string") return "general";
  const cleaned = stack.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (cleaned === "nodejs" || cleaned === "node") return "node";
  if (cleaned === "reactjs" || cleaned === "react") return "react";
  if (cleaned === "vuejs" || cleaned === "vue") return "vue";
  return cleaned;
}

function generateDeterministicRepoName(title, psId, primaryStack) {
  let baseRepo = "";
  if (psId && config.catalogue?.knownProblemStatements?.[psId]?.baseRepo) {
    baseRepo = config.catalogue.knownProblemStatements[psId].baseRepo;
  } else if (title) {
    baseRepo = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  } else if (psId) {
    baseRepo = `project-${psId.toLowerCase()}`;
  } else {
    baseRepo = "buildlab-project";
  }

  const normStack = normalizeStack(primaryStack);
  if (normStack && normStack !== "general") {
    if (!baseRepo.endsWith(`-${normStack}`)) {
      return `${baseRepo}-${normStack}`;
    }
  }
  return baseRepo;
}

function createOrAssignTeamRepo(project, options = {}) {
  const org = options.org || config.github.org || "techspace-srm";
  const primaryStack = project.primary_stack || extractPrimaryStack(project.tech_stack);

  if (options.simulateFailure) {
    return {
      success: false,
      primaryStack,
      repoStatus: "PENDING_ASSIGNMENT",
      error: options.failureReason || "Repository preparation failed on GitHub",
    };
  }

  // If already ready and linked
  if (project.repo_url && project.repo_status === "READY_TO_BUILD") {
    const cleanName = project.repo_url.replace(/^https?:\/\/github\.com\//i, "").replace(/\/$/, "");
    return {
      success: true,
      repoUrl: project.repo_url,
      repoName: cleanName,
      primaryStack,
      assignmentType: project.repo_assignment_type || "CONNECTED",
      repoStatus: "READY_TO_BUILD",
    };
  }

  const repoSlug = generateDeterministicRepoName(
    project.title,
    project.problem_statement_id,
    primaryStack
  );
  const targetRepoName = `${org}/${repoSlug}`;
  const targetRepoUrl = `https://github.com/${targetRepoName}`;

  // Check no OTHER project is already linked to this repo
  const otherProject = db.prepare(
    "SELECT id, title FROM projects WHERE id != ? AND (LOWER(repo_url) = LOWER(?) OR LOWER(repo_name) = LOWER(?))"
  ).get(project.id, targetRepoUrl, targetRepoName);

  if (otherProject) {
    return {
      success: false,
      primaryStack,
      repoStatus: "PENDING_ASSIGNMENT",
      error: `Repository ${targetRepoName} is already assigned to project '${otherProject.title}' (${otherProject.id}).`,
    };
  }

  let assignmentType = options.existingRepoFound ? "CONNECTED" : (options.created ? "CREATED" : "ASSIGNED");

  // Connect repo to database
  connectProjectRepo(project.id, targetRepoUrl);

  return {
    success: true,
    repoUrl: targetRepoUrl,
    repoName: targetRepoName,
    primaryStack,
    assignmentType,
    repoStatus: "READY_TO_BUILD",
  };
}

module.exports = {
  verifySignature,
  calculateActivityHealth,
  getRepoStats,
  recordRepoActivity,
  connectProjectRepo,
  handleWebhookEvent,
  startWebhookServer,
  stopWebhookServer,
  KNOWN_STACKS,
  extractPrimaryStack,
  normalizeStack,
  generateDeterministicRepoName,
  createOrAssignTeamRepo,
};
