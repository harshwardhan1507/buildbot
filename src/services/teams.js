const db = require("./database");
const config = require("../config/config");
const { calculateProjectProgress } = require("./milestones");
const { isBuildLabTeam, isTechSpaceAdmin } = require("../utils/permissions");

/**
 * Register or update a user record
 * @param {string} userId 
 * @param {string} username 
 * @param {string|null} [track] 
 */
function upsertUser(userId, username, track = null) {
  const now = new Date().toISOString();
  const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);

  if (existing) {
    db.prepare(`
      UPDATE users SET
        username = ?,
        track = COALESCE(?, track),
        updated_at = ?
      WHERE id = ?
    `).run(username, track, now, userId);
  } else {
    db.prepare(`
      INSERT INTO users (id, username, track, joined_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, username, track, now, now);
  }
}

/**
 * Update user's track in the database
 * @param {string} userId 
 * @param {string} username 
 * @param {string} track 
 */
function setUserTrack(userId, username, track) {
  upsertUser(userId, username, track);
}

/**
 * Get user record
 * @param {string} userId 
 * @returns {object|null}
 */
function getUser(userId) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
}

/**
 * Checks if a member has permission to view a project's detailed dashboard
 * @param {import("discord.js").GuildMember} member 
 * @param {object} project 
 * @returns {boolean}
 */
function canUserViewProject(member, project) {
  if (!member || !project) return false;
  if (isTechSpaceAdmin(member)) return true;
  if (isBuildLabTeam(member)) return true;
  if (project.mentor_id === member.id) return true;
  if (project.owner_id === member.id) return true;

  // Check team_members string for username or user ID mention
  if (project.team_members) {
    const raw = project.team_members.toLowerCase();
    if (
      raw.includes(member.user.username.toLowerCase()) ||
      raw.includes(member.id)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Check if user can modify milestones for a project
 * @param {import("discord.js").GuildMember} member 
 * @param {object} project 
 * @returns {boolean}
 */
function canUserModifyMilestones(member, project) {
  return canUserViewProject(member, project);
}

/**
 * Detects automated risk & attention signals for a project
 * @param {object} project 
 * @returns {Array<string>}
 */
function getProjectSignals(project) {
  const signals = [];
  if (!project) return signals;

  // 1. GitHub activity inactivity signal (> 5 days)
  if (project.last_activity_at) {
    const daysSince = Math.floor(
      (Date.now() - new Date(project.last_activity_at).getTime()) /
        (1000 * 60 * 60 * 24)
    );
    if (daysSince >= 5) {
      signals.push(`⚠️ No repository activity for ${daysSince} days`);
    }
  } else if (project.repo_url) {
    signals.push("⚠️ Repository connected but no activity recorded yet");
  }

  // 2. Low progress signal
  const progress = calculateProjectProgress(project.id);
  if (progress.total > 0 && progress.completed <= 1 && project.stage === "DEVELOPMENT") {
    signals.push("⚠️ Low progress: Only 1 milestone completed so far");
  }

  return signals;
}

/**
 * Get comprehensive team & project summary across tracks with optional filtering
 * @param {{ track?: string, status?: string }} [filters] 
 * @returns {object}
 */
function getDetailedOverview(filters = {}) {
  let projects = db.prepare("SELECT * FROM projects ORDER BY created_at ASC").all();

  if (filters.track) {
    projects = projects.filter(
      (p) => p.track.toLowerCase() === filters.track.toLowerCase()
    );
  }

  if (filters.status) {
    const targetStatus = filters.status.toLowerCase();
    if (targetStatus === "at-risk") {
      projects = projects.filter((p) => p.mentor_status === "At Risk");
    } else if (targetStatus === "attention" || targetStatus === "needs-attention") {
      projects = projects.filter((p) => p.mentor_status === "Needs Attention");
    } else if (targetStatus === "on-track") {
      projects = projects.filter((p) => p.mentor_status === "On Track");
    }
  }

  // Group by track
  const tracksData = {};
  for (const track of config.trackNames) {
    tracksData[track] = {
      track,
      teams: 0,
      onTrack: 0,
      attention: 0,
      atRisk: 0,
      notAssessed: 0,
      totalProgressPercent: 0,
      averageProgress: 0,
    };
  }

  let totalTeams = 0;
  let prdsApproved = 0;
  let inDevelopment = 0;
  let submitted = 0;

  for (const p of projects) {
    const track = p.track;
    if (!tracksData[track]) {
      tracksData[track] = {
        track,
        teams: 0,
        onTrack: 0,
        attention: 0,
        atRisk: 0,
        notAssessed: 0,
        totalProgressPercent: 0,
        averageProgress: 0,
      };
    }

    const tObj = tracksData[track];
    tObj.teams++;
    totalTeams++;

    if (p.mentor_status === "On Track") tObj.onTrack++;
    else if (p.mentor_status === "Needs Attention") tObj.attention++;
    else if (p.mentor_status === "At Risk") tObj.atRisk++;
    else tObj.notAssessed++;

    const prog = calculateProjectProgress(p.id);
    tObj.totalProgressPercent += prog.percentage;

    if (p.status === "Approved") prdsApproved++;
    if (p.stage === "DEVELOPMENT") inDevelopment++;
    if (p.stage === "SUBMISSION" || p.stage === "COMPLETED") submitted++;
  }

  // Calculate averages
  for (const track of Object.keys(tracksData)) {
    const tObj = tracksData[track];
    tObj.averageProgress =
      tObj.teams > 0 ? Math.round(tObj.totalProgressPercent / tObj.teams) : 0;
  }

  return {
    tracks: tracksData,
    totalTeams,
    prdsApproved,
    inDevelopment,
    submitted,
    filteredProjects: projects,
  };
}

/**
 * Backwards compatible summary function
 * @returns {Array<{ track: string, participants: number, projects: number }>}
 */
function getTrackSummary() {
  const summary = [];
  for (const track of config.trackNames) {
    const userCount = db
      .prepare("SELECT COUNT(*) as count FROM users WHERE LOWER(track) = LOWER(?)")
      .get(track).count;
    const projectCount = db
      .prepare("SELECT COUNT(*) as count FROM projects WHERE LOWER(track) = LOWER(?)")
      .get(track).count;
    summary.push({
      track,
      participants: userCount,
      projects: projectCount,
    });
  }
  return summary;
}

/**
 * Get projects assigned to a mentor
 * @param {string} mentorId 
 * @returns {Array<object>}
 */
function getTeamsByMentor(mentorId) {
  return db
    .prepare("SELECT * FROM projects WHERE mentor_id = ? ORDER BY created_at ASC")
    .all(mentorId);
}

/**
 * Get team status by project ID or title
 * @param {string} query 
 * @returns {object|null}
 */
function getTeamStatus(query) {
  if (!query) return null;
  const trimmed = query.trim();

  // Try matching by PRD ID
  let project = db
    .prepare("SELECT * FROM projects WHERE UPPER(id) = UPPER(?)")
    .get(trimmed);
  if (project) return project;

  // Try matching by exact or partial title
  project = db
    .prepare("SELECT * FROM projects WHERE LOWER(title) LIKE LOWER(?) LIMIT 1")
    .get(`%${trimmed}%`);
  return project || null;
}

module.exports = {
  upsertUser,
  setUserTrack,
  getUser,
  canUserViewProject,
  canUserModifyMilestones,
  getProjectSignals,
  getDetailedOverview,
  getTrackSummary,
  getTeamsByMentor,
  getTeamStatus,
};
