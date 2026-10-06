const db = require("./database");
const { initializeProjectMilestones } = require("./milestones");

/**
 * Generate next sequential PRD ID formatted like BL-PRD-001
 * @returns {string}
 */
function generateNextPrdId() {
  const row = db.prepare("SELECT id FROM projects ORDER BY rowid DESC LIMIT 1").get();
  if (!row || !row.id) {
    return "BL-PRD-001";
  }

  const match = row.id.match(/^BL-PRD-(\d+)$/i);
  if (!match) {
    return "BL-PRD-001";
  }

  const nextNum = parseInt(match[1], 10) + 1;
  return `BL-PRD-${String(nextNum).padStart(3, "0")}`;
}

/**
 * Creates a new PRD submission or updates an existing one if user resubmits
 * @param {object} prdData 
 * @returns {object} The created/updated PRD
 */
function submitPrd(prdData) {
  const now = new Date().toISOString();
  
  // Check if owner already has a project
  const existing = db.prepare("SELECT * FROM projects WHERE owner_id = ?").get(prdData.owner_id);

  if (existing) {
    // If project exists and is in 'Changes Requested' or 'Rejected' (or owner updating), update it
    const stmt = db.prepare(`
      UPDATE projects SET
        title = ?,
        track = ?,
        team_members = ?,
        problem_statement = ?,
        target_users = ?,
        core_features = ?,
        stretch_features = ?,
        tech_stack = ?,
        milestones = ?,
        success_criteria = ?,
        risks_dependencies = ?,
        status = 'Pending',
        status_reason = NULL,
        stage = 'PRD_REVIEW',
        updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      prdData.title,
      prdData.track,
      prdData.team_members || "",
      prdData.problem_statement || "",
      prdData.target_users || "",
      prdData.core_features || "",
      prdData.stretch_features || "",
      prdData.tech_stack || "",
      prdData.milestones || "",
      prdData.success_criteria || "",
      prdData.risks_dependencies || "",
      now,
      existing.id
    );

    initializeProjectMilestones(existing.id, prdData.milestones || "");
    return getPrdById(existing.id);
  }

  const id = generateNextPrdId();
  const stmt = db.prepare(`
    INSERT INTO projects (
      id, title, track, owner_id, team_members,
      problem_statement, target_users, core_features, stretch_features,
      tech_stack, milestones, success_criteria, risks_dependencies,
      status, stage, mentor_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', 'PRD_REVIEW', 'Not Assessed', ?, ?)
  `);

  stmt.run(
    id,
    prdData.title,
    prdData.track,
    prdData.owner_id,
    prdData.team_members || "",
    prdData.problem_statement || "",
    prdData.target_users || "",
    prdData.core_features || "",
    prdData.stretch_features || "",
    prdData.tech_stack || "",
    prdData.milestones || "",
    prdData.success_criteria || "",
    prdData.risks_dependencies || "",
    now,
    now
  );

  initializeProjectMilestones(id, prdData.milestones || "");
  return getPrdById(id);
}

/**
 * Fetch a PRD by its ID
 * @param {string} id 
 * @returns {object|null}
 */
function getPrdById(id) {
  if (!id) return null;
  return db.prepare("SELECT * FROM projects WHERE UPPER(id) = UPPER(?)").get(id.trim());
}

/**
 * Fetch PRD by owner Discord ID
 * @param {string} ownerId 
 * @returns {object|null}
 */
function getPrdByOwnerId(ownerId) {
  return db.prepare("SELECT * FROM projects WHERE owner_id = ?").get(ownerId);
}

/**
 * Fetch all pending PRDs
 * @returns {Array<object>}
 */
function getPendingPrds() {
  return db.prepare("SELECT * FROM projects WHERE status = 'Pending' ORDER BY created_at ASC").all();
}

/**
 * Update PRD status (Approve, Changes Requested, Reject)
 * @param {string} id 
 * @param {'Approved'|'Changes Requested'|'Rejected'|'Pending'} status 
 * @param {string} [reason] 
 * @returns {object|null}
 */
function updatePrdStatus(id, status, reason = null) {
  const prd = getPrdById(id);
  if (!prd) return null;

  const now = new Date().toISOString();
  let stage = prd.stage;
  if (status === "Approved") {
    stage = "DEVELOPMENT";
  } else if (status === "Changes Requested" || status === "Rejected") {
    stage = "PRD_REVIEW";
  }

  db.prepare(`
    UPDATE projects SET
      status = ?,
      status_reason = ?,
      stage = ?,
      updated_at = ?
    WHERE UPPER(id) = UPPER(?)
  `).run(status, reason, stage, now, id.trim());

  // Ensure milestones exist
  initializeProjectMilestones(prd.id, prd.milestones || "");

  return getPrdById(id);
}

/**
 * Assign a mentor to a project
 * @param {string} prdId 
 * @param {string} mentorId 
 * @returns {object|null}
 */
function assignMentor(prdId, mentorId) {
  const prd = getPrdById(prdId);
  if (!prd) return null;

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE projects SET
      mentor_id = ?,
      updated_at = ?
    WHERE UPPER(id) = UPPER(?)
  `).run(mentorId, now, prdId.trim());

  return getPrdById(prdId);
}

/**
 * Connect repository URL to a project
 * @param {string} prdId 
 * @param {string} repoUrl 
 * @returns {object|null}
 */
function setProjectRepo(prdId, repoUrl) {
  const prd = getPrdById(prdId);
  if (!prd) return null;

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE projects SET
      repo_url = ?,
      updated_at = ?
    WHERE UPPER(id) = UPPER(?)
  `).run(repoUrl, now, prdId.trim());

  return getPrdById(prdId);
}

/**
 * Update mentor assessment status for a project
 * @param {string} projectId 
 * @param {string} mentorId 
 * @param {'On Track'|'Needs Attention'|'At Risk'} status 
 * @param {string} [note] 
 * @returns {object|null}
 */
function setMentorStatus(projectId, mentorId, status, note = null) {
  const prd = getPrdById(projectId);
  if (!prd) return null;

  const now = new Date().toISOString();

  // Update in projects table
  db.prepare(`
    UPDATE projects SET
      mentor_status = ?,
      mentor_status_note = ?,
      mentor_status_updated_at = ?,
      updated_at = ?
    WHERE UPPER(id) = UPPER(?)
  `).run(status, note, now, now, projectId.trim());

  // Insert into mentor_reviews log
  db.prepare(`
    INSERT INTO mentor_reviews (project_id, mentor_id, status, note, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(prd.id, mentorId, status, note || "", now);

  return getPrdById(projectId);
}

/**
 * Set project development stage
 * @param {string} projectId 
 * @param {string} stage 
 * @returns {object|null}
 */
function setProjectStage(projectId, stage) {
  const prd = getPrdById(projectId);
  if (!prd) return null;

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE projects SET
      stage = ?,
      updated_at = ?
    WHERE UPPER(id) = UPPER(?)
  `).run(stage, now, projectId.trim());

  return getPrdById(projectId);
}

module.exports = {
  generateNextPrdId,
  submitPrd,
  getPrdById,
  getPrdByOwnerId,
  getPendingPrds,
  updatePrdStatus,
  assignMentor,
  setProjectRepo,
  setMentorStatus,
  setProjectStage,
};
