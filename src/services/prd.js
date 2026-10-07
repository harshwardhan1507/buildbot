const path = require("node:path");
const db = require("./database");
const { initializeProjectMilestones } = require("./milestones");
const { connectProjectRepo } = require("./github");
const config = require("../config/config");

/**
 * Validates proposal PDF file or web URL
 * @param {string|object} pdfInput 
 * @returns {{ valid: boolean, url?: string, fileName?: string, error?: string }}
 */
function validatePdf(pdfInput) {
  if (!pdfInput) {
    return {
      valid: false,
      error: "Completed Project Proposal PDF is required.",
    };
  }

  // Handle Discord Attachment object
  if (typeof pdfInput === "object" && pdfInput.url) {
    const fileName = (pdfInput.name || "").toLowerCase();
    const contentType = (pdfInput.contentType || "").toLowerCase();
    const size = pdfInput.size || 0;

    const isPdf = fileName.endsWith(".pdf") || contentType.includes("application/pdf");
    if (!isPdf) {
      return {
        valid: false,
        error: "Uploaded file must be a PDF document (`.pdf`). Please upload a valid Project Proposal PDF.",
      };
    }

    if (size > 25 * 1024 * 1024) {
      return {
        valid: false,
        error: "PDF file size exceeds 25MB limit. Please upload a compressed or smaller PDF.",
      };
    }

    return {
      valid: true,
      url: pdfInput.url,
      fileName: pdfInput.name || "proposal.pdf",
    };
  }

  if (typeof pdfInput === "string") {
    const trimmed = pdfInput.trim();
    if (!trimmed) {
      return {
        valid: false,
        error: "Completed Project Proposal PDF is required.",
      };
    }

    const isUrl = /^https?:\/\//i.test(trimmed);
    const isFilePath = trimmed.toLowerCase().endsWith(".pdf");

    if (!isUrl && !isFilePath) {
      return {
        valid: false,
        error: "Please provide a valid web URL or file path to your Proposal PDF (e.g. Google Drive link or direct .pdf link).",
      };
    }

    const lower = trimmed.toLowerCase();
    const isPdfExt = lower.includes(".pdf");
    const isDocHost =
      lower.includes("drive.google.com") ||
      lower.includes("docs.google.com") ||
      lower.includes("dropbox.com") ||
      lower.includes("github.com") ||
      lower.includes("notion.site") ||
      lower.includes("notion.so") ||
      lower.includes("onedrive.live.com") ||
      lower.includes("1drv.ms");

    if (!isPdfExt && !isDocHost) {
      return {
        valid: false,
        error: "URL must link to a `.pdf` document or a valid document share link (e.g. Google Drive, Dropbox, or GitHub).",
      };
    }

    return {
      valid: true,
      url: trimmed,
      fileName: path.basename(trimmed.split("?")[0]) || "proposal.pdf",
    };
  }

  return {
    valid: false,
    error: "Invalid proposal PDF format provided.",
  };
}

/**
 * Validates and normalizes GitHub repository URL or slug
 * @param {string} repoInput 
 * @returns {{ valid: boolean, repoUrl?: string, repoName?: string, error?: string }}
 */
function validateRepoUrl(repoInput) {
  if (!repoInput || typeof repoInput !== "string") {
    return {
      valid: false,
      error: "GitHub repository URL is required.",
    };
  }

  const trimmed = repoInput.trim();
  // Strip protocol and domain if present
  const clean = trimmed
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/\/$/, "");

  const parts = clean.split("/").filter(Boolean);
  if (parts.length !== 2) {
    return {
      valid: false,
      error: "Please enter a valid GitHub repository URL (e.g. https://github.com/username/project-name or username/project-name).",
    };
  }

  const [owner, repo] = parts;
  // GitHub username and repo naming rules (alphanumeric, hyphens, underscores, dots)
  const validOwner = /^[a-zA-Z0-9_\-\.]+$/.test(owner);
  const validRepo = /^[a-zA-Z0-9_\-\.]+$/.test(repo);

  if (!validOwner || !validRepo) {
    return {
      valid: false,
      error: "GitHub username or repository name contains invalid characters.",
    };
  }

  const repoName = `${owner}/${repo}`;
  const repoUrl = `https://github.com/${repoName}`;

  return {
    valid: true,
    repoUrl,
    repoName,
  };
}

/**
 * Validates team members string against track team size requirements
 * Beginner: 1 member (Solo)
 * Intermediate: 2 members (Duo)
 * Advanced: 3–4 members (Squad)
 * 
 * @param {string} track 
 * @param {string} teamMembersInput 
 * @param {object} [ownerUser] 
 * @returns {{ valid: boolean, count: number, members: string[], error?: string }}
 */
function validateTeamSize(track, teamMembersInput, ownerUser = null) {
  const normTrack = track ? track.charAt(0).toUpperCase() + track.slice(1).toLowerCase() : "";
  const sizeConfig = config.trackTeamSizes[normTrack];

  if (!sizeConfig) {
    return {
      valid: false,
      count: 0,
      members: [],
      error: `Invalid track '${track}'. Must be Beginner, Intermediate, or Advanced.`,
    };
  }

  // Parse member tokens from input: commas, pipes, spaces, @mentions
  const rawInput = teamMembersInput ? teamMembersInput.trim() : "";
  let memberTokens = [];

  if (rawInput) {
    memberTokens = rawInput
      .split(/[,|\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.toLowerCase().startsWith("solo"));
  }

  // Ensure owner is accounted for
  const ownerTag = ownerUser?.username ? `@${ownerUser.username}` : (ownerUser?.id ? `<@${ownerUser.id}>` : "Owner");
  
  // Deduplicate and filter out redundant self-mentions
  const uniqueTeammates = [];
  for (const m of memberTokens) {
    const clean = m.toLowerCase();
    const isOwner =
      ownerUser &&
      (clean === ownerUser.username?.toLowerCase() ||
        clean === `@${ownerUser.username?.toLowerCase()}` ||
        clean === ownerUser.id ||
        clean === `<@${ownerUser.id}>`);

    if (!isOwner && !uniqueTeammates.some((u) => u.toLowerCase() === clean)) {
      uniqueTeammates.push(m);
    }
  }

  // Total members = owner (1) + additional teammates
  const totalCount = 1 + uniqueTeammates.length;

  if (normTrack === "Beginner") {
    if (totalCount !== 1) {
      return {
        valid: false,
        count: totalCount,
        members: [ownerTag, ...uniqueTeammates],
        error: "Beginner is a **Solo track** (exactly 1 member). If you are building with teammates, please choose **Intermediate** (Duo) or **Advanced** (Squad).",
      };
    }
  } else if (normTrack === "Intermediate") {
    if (totalCount !== 2) {
      return {
        valid: false,
        count: totalCount,
        members: [ownerTag, ...uniqueTeammates],
        error: `Intermediate is a **Duo track** (exactly 2 members). You currently have ${totalCount} member(s). Please list 1 teammate (e.g. \`@teammate\`).`,
      };
    }
  } else if (normTrack === "Advanced") {
    if (totalCount < 3 || totalCount > 4) {
      return {
        valid: false,
        count: totalCount,
        members: [ownerTag, ...uniqueTeammates],
        error: `Advanced is a **Squad track** (3 to 4 members). You currently have ${totalCount} member(s). Please list 2 or 3 teammates.`,
      };
    }
  }

  return {
    valid: true,
    count: totalCount,
    members: [ownerTag, ...uniqueTeammates],
  };
}

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
  
  // Normalize track
  const track = prdData.track
    ? prdData.track.charAt(0).toUpperCase() + prdData.track.slice(1).toLowerCase()
    : "Beginner";

  // Check if owner already has a project
  const existing = db.prepare("SELECT * FROM projects WHERE owner_id = ?").get(prdData.owner_id);

  if (existing) {
    // If project exists, update it cleanly preserving existing ID
    const stmt = db.prepare(`
      UPDATE projects SET
        title = ?,
        track = ?,
        team_name = COALESCE(?, team_name),
        project_type = COALESCE(?, project_type),
        problem_statement_id = COALESCE(?, problem_statement_id),
        team_members = ?,
        problem_statement = ?,
        solution = COALESCE(?, solution),
        target_users = ?,
        core_features = ?,
        stretch_features = ?,
        tech_stack = ?,
        learning_goals = COALESCE(?, learning_goals),
        biggest_challenge = COALESCE(?, biggest_challenge),
        final_outcome = COALESCE(?, final_outcome),
        milestones = ?,
        success_criteria = ?,
        risks_dependencies = ?,
        repo_url = COALESCE(?, repo_url),
        proposal_pdf_url = COALESCE(?, proposal_pdf_url),
        status = 'Pending',
        status_reason = NULL,
        stage = 'PRD_REVIEW',
        updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      prdData.title,
      track,
      prdData.team_name || null,
      prdData.project_type || null,
      prdData.problem_statement_id || null,
      prdData.team_members || "",
      prdData.problem_statement || "",
      prdData.solution || null,
      prdData.target_users || "",
      prdData.core_features || "",
      prdData.stretch_features || "",
      prdData.tech_stack || "",
      prdData.learning_goals || null,
      prdData.biggest_challenge || null,
      prdData.final_outcome || null,
      prdData.milestones || "",
      prdData.success_criteria || "",
      prdData.risks_dependencies || "",
      prdData.repo_url || null,
      prdData.proposal_pdf_url || null,
      now,
      existing.id
    );

    initializeProjectMilestones(existing.id, prdData.milestones || "");

    if (prdData.repo_url) {
      try {
        connectProjectRepo(existing.id, prdData.repo_url);
      } catch (err) {
        console.warn(`Failed to connect repo on PRD update: ${err.message}`);
      }
    }

    return getPrdById(existing.id);
  }

  const id = generateNextPrdId();
  const stmt = db.prepare(`
    INSERT INTO projects (
      id, title, track, owner_id, team_name, project_type, problem_statement_id,
      team_members, problem_statement, solution, target_users, core_features, stretch_features,
      tech_stack, learning_goals, biggest_challenge, final_outcome, milestones, success_criteria, risks_dependencies,
      repo_url, proposal_pdf_url, status, stage, mentor_status, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, 'Pending', 'PRD_REVIEW', 'Not Assessed', ?, ?
    )
  `);

  stmt.run(
    id,
    prdData.title,
    track,
    prdData.owner_id,
    prdData.team_name || null,
    prdData.project_type || null,
    prdData.problem_statement_id || null,
    prdData.team_members || "",
    prdData.problem_statement || "",
    prdData.solution || null,
    prdData.target_users || "",
    prdData.core_features || "",
    prdData.stretch_features || "",
    prdData.tech_stack || "",
    prdData.learning_goals || null,
    prdData.biggest_challenge || null,
    prdData.final_outcome || null,
    prdData.milestones || "",
    prdData.success_criteria || "",
    prdData.risks_dependencies || "",
    prdData.repo_url || null,
    prdData.proposal_pdf_url || null,
    now,
    now
  );

  initializeProjectMilestones(id, prdData.milestones || "");

  if (prdData.repo_url) {
    try {
      connectProjectRepo(id, prdData.repo_url);
    } catch (err) {
      console.warn(`Failed to connect repo on PRD create: ${err.message}`);
    }
  }

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

  return connectProjectRepo(prd.id, repoUrl);
}

/**
 * Sets human mentor evaluation status for a project
 * @param {string} prdId 
 * @param {string} mentorId 
 * @param {'On Track'|'Needs Attention'|'At Risk'} mentorStatus 
 * @param {string} [note] 
 * @returns {object|null}
 */
function setMentorStatus(prdId, mentorId, mentorStatus, note = null) {
  const prd = getPrdById(prdId);
  if (!prd) return null;

  const now = new Date().toISOString();

  db.prepare(`
    UPDATE projects SET
      mentor_status = ?,
      mentor_status_note = ?,
      mentor_status_updated_at = ?,
      updated_at = ?
    WHERE UPPER(id) = UPPER(?)
  `).run(mentorStatus, note, now, now, prdId.trim());

  // Record history log in mentor_reviews
  db.prepare(`
    INSERT INTO mentor_reviews (project_id, mentor_id, status, note, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(prdId.trim(), mentorId, mentorStatus, note, now);

  return getPrdById(prdId);
}

module.exports = {
  validateRepoUrl,
  validateTeamSize,
  validatePdf,
  generateNextPrdId,
  submitPrd,
  getPrdById,
  getPrdByOwnerId,
  getPendingPrds,
  updatePrdStatus,
  assignMentor,
  setProjectRepo,
  setMentorStatus,
};
