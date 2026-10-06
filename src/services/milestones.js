const db = require("./database");

const STATUS_ICONS = {
  "Not Started": "⬜",
  "In Progress": "🔄",
  Completed: "✅",
  Blocked: "⚠️",
};

/**
 * Generate visual ASCII progress bar
 * @param {number} percentage 
 * @param {number} [totalBlocks=10] 
 * @returns {string} e.g. "██████░░░░ 60%"
 */
function generateProgressBar(percentage, totalBlocks = 10) {
  const clamped = Math.max(0, Math.min(100, percentage));
  const filledBlocks = Math.round((clamped / 100) * totalBlocks);
  const emptyBlocks = totalBlocks - filledBlocks;
  return `${"█".repeat(filledBlocks)}${"░".repeat(emptyBlocks)} ${clamped}%`;
}

/**
 * Parses raw text from PRD submission into discrete milestone items
 * @param {string} rawText 
 * @returns {Array<{ title: string, description: string }>}
 */
function parseMilestonesText(rawText) {
  if (!rawText || !rawText.trim()) {
    return [
      { title: "Project Setup & Environment", description: "Initialize repository, dependencies, and environment" },
      { title: "Core Architecture & Data Layer", description: "Implement fundamental schemas, models, and layout" },
      { title: "Core Features Implementation", description: "Build main functional requirements from approved PRD" },
      { title: "Integration & Testing", description: "Bug fixing, error handling, and end-to-end verification" },
      { title: "Documentation & Demo Polish", description: "README, demo video, and final submission" },
    ];
  }

  // Split lines by newlines, dashes, or numbered lists (e.g. 1. 2. or - or •)
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.toLowerCase().startsWith("milestones:"));

  const parsed = [];
  for (const line of lines) {
    const cleaned = line.replace(/^(\d+[\.\)]|\-|\*|•)\s*/, "").trim();
    if (cleaned.length > 3) {
      parsed.push({ title: cleaned, description: "" });
    }
    if (parsed.length >= 7) break;
  }

  if (parsed.length === 0) {
    return [
      { title: "Project Setup & Environment", description: "Repository and scaffolding" },
      { title: "Core Architecture", description: "Initial build and schemas" },
      { title: "Feature Development", description: "Core features" },
      { title: "Testing & Validation", description: "Refinement" },
      { title: "Documentation & Submission", description: "Final deliverable" },
    ];
  }

  return parsed;
}

/**
 * Initializes milestones in database for a project
 * @param {string} projectId 
 * @param {string} [rawText] 
 * @returns {Array<object>}
 */
function initializeProjectMilestones(projectId, rawText = "") {
  const existing = getProjectMilestones(projectId);
  if (existing.length > 0) return existing;

  const items = parseMilestonesText(rawText);
  const now = new Date().toISOString();

  const insert = db.prepare(`
    INSERT INTO milestones (
      project_id, milestone_index, title, description, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'Not Started', ?, ?)
  `);

  items.forEach((item, index) => {
    insert.run(projectId, index + 1, item.title, item.description, now, now);
  });

  return getProjectMilestones(projectId);
}

/**
 * Fetch all milestones for a project
 * @param {string} projectId 
 * @returns {Array<object>}
 */
function getProjectMilestones(projectId) {
  return db
    .prepare("SELECT * FROM milestones WHERE project_id = ? ORDER BY milestone_index ASC")
    .all(projectId);
}

/**
 * Fetch a single milestone by project and 1-based index
 * @param {string} projectId 
 * @param {number} index 
 * @returns {object|null}
 */
function getMilestoneByIndex(projectId, index) {
  return (
    db
      .prepare("SELECT * FROM milestones WHERE project_id = ? AND milestone_index = ?")
      .get(projectId, index) || null
  );
}

/**
 * Update milestone status
 * @param {string} projectId 
 * @param {number} index 
 * @param {'Not Started'|'In Progress'|'Completed'|'Blocked'} status 
 * @returns {object|null}
 */
function updateMilestoneStatus(projectId, index, status) {
  const milestone = getMilestoneByIndex(projectId, index);
  if (!milestone) return null;

  const now = new Date().toISOString();
  const completedAt = status === "Completed" ? now : null;

  db.prepare(`
    UPDATE milestones SET
      status = ?,
      completed_at = ?,
      updated_at = ?
    WHERE project_id = ? AND milestone_index = ?
  `).run(status, completedAt, now, projectId, index);

  // Update project last activity and stage automatically
  updateProjectProgressStage(projectId);

  return getMilestoneByIndex(projectId, index);
}

/**
 * Calculate completion percentage and progress bar for project
 * @param {string} projectId 
 * @returns {{ total: number, completed: number, inProgress: number, percentage: number, progressBar: string }}
 */
function calculateProjectProgress(projectId) {
  const milestones = getProjectMilestones(projectId);
  const total = milestones.length;

  if (total === 0) {
    return {
      total: 0,
      completed: 0,
      inProgress: 0,
      percentage: 0,
      progressBar: generateProgressBar(0),
    };
  }

  const completed = milestones.filter((m) => m.status === "Completed").length;
  const inProgress = milestones.filter((m) => m.status === "In Progress").length;
  const percentage = Math.round((completed / total) * 100);

  return {
    total,
    completed,
    inProgress,
    percentage,
    progressBar: generateProgressBar(percentage),
  };
}

/**
 * Updates stage of project based on milestones and status
 * @param {string} projectId 
 */
function updateProjectProgressStage(projectId) {
  const progress = calculateProjectProgress(projectId);
  const now = new Date().toISOString();

  let stage = "DEVELOPMENT";
  if (progress.percentage === 0) {
    stage = "DEVELOPMENT";
  } else if (progress.percentage === 100) {
    stage = "SUBMISSION";
  } else if (progress.percentage >= 75) {
    stage = "TESTING";
  } else if (progress.percentage >= 50) {
    stage = "DEVELOPMENT";
  }

  db.prepare(`
    UPDATE projects SET
      stage = COALESCE(?, stage),
      last_activity_at = ?,
      updated_at = ?
    WHERE id = ?
  `).run(stage, now, now, projectId);
}

module.exports = {
  STATUS_ICONS,
  generateProgressBar,
  parseMilestonesText,
  initializeProjectMilestones,
  getProjectMilestones,
  getMilestoneByIndex,
  updateMilestoneStatus,
  calculateProjectProgress,
  updateProjectProgressStage,
};
