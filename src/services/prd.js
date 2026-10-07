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
/**
 * Normalizes member token (strips mentions, @, whitespace, and lowercases)
 * @param {string} token 
 * @returns {string}
 */
function cleanMemberToken(token) {
  if (!token) return "";
  return token
    .replace(/^<@!?([a-zA-Z0-9_\-]+)>$/, "$1")
    .replace(/^@/, "")
    .toLowerCase()
    .trim();
}

/**
 * Parses teammate tokens from user input, handling commas, pipes, newlines,
 * spaces between mentions, and filtering out keywords like "solo", "none", "n/a".
 * @param {string} input 
 * @returns {string[]}
 */
function parseTeammateTokens(input) {
  if (!input || typeof input !== "string") return [];
  const trimmed = input.trim();
  if (!trimmed) return [];

  const lower = trimmed.toLowerCase();
  if (lower === "solo" || lower === "none" || lower === "n/a" || lower === "-") {
    return [];
  }

  const rawParts = trimmed.split(/[,|\n]+/);
  const tokens = [];

  for (const part of rawParts) {
    const p = part.trim();
    if (!p) continue;
    const pLower = p.toLowerCase();
    if (pLower === "solo" || pLower === "none" || pLower === "n/a" || pLower === "-") continue;

    // Check if multiple mentions exist without commas (e.g. "<@111> <@222>" or "@bob @charlie")
    const mentionMatches = p.match(/<@!?\d+>|@[\w.-]+/g);
    if (mentionMatches && mentionMatches.length > 1 && !p.includes(",")) {
      for (const m of mentionMatches) {
        tokens.push(m.trim());
      }
    } else {
      tokens.push(p);
    }
  }

  return tokens;
}

/**
 * Checks if a member token refers to the submitter/owner
 * @param {string} token 
 * @param {object} [ownerUser] 
 * @returns {boolean}
 */
function isSubmitterToken(token, ownerUser) {
  if (!ownerUser) return false;
  const clean = cleanMemberToken(token);
  if (!clean) return false;

  if (ownerUser.id && clean === ownerUser.id.toLowerCase()) return true;
  if (ownerUser.username && clean === ownerUser.username.toLowerCase()) return true;
  if (ownerUser.tag && clean === ownerUser.tag.toLowerCase()) return true;
  return false;
}

/**
 * Centralized BuildLab Team Size & Member Validator
 * 
 * Rules:
 * - Submitter is automatically 1 member of the team.
 * - TOTAL MEMBERS = 1 (submitter) + teammates.length.
 * - Beginner: Exactly 1 total member (submitter only, 0 teammates).
 * - Intermediate: Exactly 2 total members (submitter + 1 teammate).
 * - Advanced: 3–4 total members (submitter + 2 or 3 teammates).
 * 
 * Deduplication:
 * - Submitter must never appear in the teammate list.
 * - Duplicate teammates are strictly rejected.
 * 
 * @param {string} track 
 * @param {string} teamMembersInput 
 * @param {object} [ownerUser] - Submitting Discord user or member object
 * @returns {{ valid: boolean, count: number, members: string[], teammates: string[], summary?: string, error?: string }}
 */
function validateTeamSize(track, teamMembersInput, ownerUser = null) {
  const normTrack = track ? track.charAt(0).toUpperCase() + track.slice(1).toLowerCase() : "";
  const sizeConfig = config.trackTeamSizes[normTrack];

  if (!sizeConfig) {
    return {
      valid: false,
      count: 0,
      members: [],
      teammates: [],
      error: `Invalid track '${track}'. Must be Beginner, Intermediate, or Advanced.`,
    };
  }

  const teammateTokens = parseTeammateTokens(teamMembersInput);

  // 1. Deduplication Check: Submitter must never be in teammate list
  if (ownerUser) {
    for (const token of teammateTokens) {
      if (isSubmitterToken(token, ownerUser)) {
        return {
          valid: false,
          count: 1 + teammateTokens.length,
          members: [],
          teammates: teammateTokens,
          error: "You are already included as the team lead.\n\nPlease select your teammates instead.",
        };
      }
    }
  }

  // 2. Deduplication Check: No duplicate teammates
  const seenTeammates = new Set();
  for (const token of teammateTokens) {
    const clean = cleanMemberToken(token);
    if (seenTeammates.has(clean)) {
      return {
        valid: false,
        count: 1 + teammateTokens.length,
        members: [],
        teammates: teammateTokens,
        error: `Duplicate teammate found: \`${token}\`.\n\nPlease list each teammate only once.`,
      };
    }
    seenTeammates.add(clean);
  }

  // 3. Total Team Calculation
  // The submitter is automatically 1 member of the team
  const teammatesCount = teammateTokens.length;
  const totalCount = 1 + teammatesCount;

  const ownerTag = ownerUser?.username
    ? `@${ownerUser.username}`
    : (ownerUser?.id ? `<@${ownerUser.id}>` : "You");
  const allMembers = [ownerTag, ...teammateTokens];

  // 4. Track-specific validation
  if (normTrack === "Beginner") {
    if (totalCount === 1) {
      return {
        valid: true,
        count: 1,
        members: allMembers,
        teammates: teammateTokens,
        summary: "Beginner · Solo · 1 member",
      };
    }
    return {
      valid: false,
      count: totalCount,
      members: allMembers,
      teammates: teammateTokens,
      error: "Beginner is a Solo track.\n\nYou cannot add teammates to a Beginner project.",
    };
  }

  if (normTrack === "Intermediate") {
    if (totalCount === 2) {
      return {
        valid: true,
        count: 2,
        members: allMembers,
        teammates: teammateTokens,
        summary: "Intermediate · Duo · 2 members",
      };
    }

    if (teammatesCount === 0) {
      return {
        valid: false,
        count: 1,
        members: allMembers,
        teammates: teammateTokens,
        error: "Intermediate teams require exactly 2 members total.\n\nPlease add 1 teammate.",
      };
    }

    return {
      valid: false,
      count: totalCount,
      members: allMembers,
      teammates: teammateTokens,
      error: `Intermediate teams require exactly 2 members total.\n\nYou currently have ${totalCount} members.`,
    };
  }

  if (normTrack === "Advanced") {
    if (totalCount >= 3 && totalCount <= 4) {
      return {
        valid: true,
        count: totalCount,
        members: allMembers,
        teammates: teammateTokens,
        summary: `Advanced · Squad · ${totalCount} members`,
      };
    }

    if (teammatesCount === 0) {
      return {
        valid: false,
        count: 1,
        members: allMembers,
        teammates: teammateTokens,
        error: "Advanced teams must have 3–4 members total.\n\nYou are currently the only member.\n\nPlease add 2–3 teammates.",
      };
    }

    if (teammatesCount === 1) {
      return {
        valid: false,
        count: 2,
        members: allMembers,
        teammates: teammateTokens,
        error: "Advanced teams must have 3–4 members total.\n\nYou currently have 2 members:\n• You\n• 1 teammate\n\nPlease add 1–2 more teammate(s).",
      };
    }

    return {
      valid: false,
      count: totalCount,
      members: allMembers,
      teammates: teammateTokens,
      error: `Advanced teams must have 3–4 members total.\n\nYou currently have ${totalCount} members.`,
    };
  }

  return {
    valid: false,
    count: totalCount,
    members: allMembers,
    teammates: teammateTokens,
    error: `Invalid configuration for track ${track}.`,
  };
}

/**
 * Generate next sequential PRD ID formatted like BL-PRD-001 based on highest existing ID
 * @returns {string}
 */
function generateNextPrdId() {
  const rows = db.prepare("SELECT id FROM projects").all();
  let maxNum = 0;
  for (const row of rows) {
    if (!row.id) continue;
    const match = row.id.match(/^BL-PRD-(\d+)$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }
  const nextNum = maxNum + 1;
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
 * Checks if another project with the same problem statement, title, or owner is already approved.
 * @param {string} prdId 
 * @returns {{ isDuplicate: boolean, conflict?: object, reason?: string }}
 */
function checkDuplicateApprovedProject(prdId) {
  const prd = getPrdById(prdId);
  if (!prd) return { isDuplicate: false };

  const approvedProjects = db.prepare("SELECT * FROM projects WHERE status = 'Approved'").all();

  for (const approved of approvedProjects) {
    if (approved.id.toUpperCase() === prd.id.toUpperCase()) continue;

    // 1. Same Catalogue Problem Statement ID
    if (
      prd.problem_statement_id &&
      approved.problem_statement_id &&
      prd.problem_statement_id.trim().toUpperCase() === approved.problem_statement_id.trim().toUpperCase()
    ) {
      return {
        isDuplicate: true,
        conflict: approved,
        reason: `Problem statement '${prd.problem_statement_id.trim().toUpperCase()}' is already approved for project '${approved.title}' (\`${approved.id}\`).`,
      };
    }

    // 2. Same Project Title (case-insensitive)
    if (
      prd.title &&
      approved.title &&
      prd.title.trim().toLowerCase() === approved.title.trim().toLowerCase()
    ) {
      return {
        isDuplicate: true,
        conflict: approved,
        reason: `A project with the title '${prd.title.trim()}' is already approved (\`${approved.id}\`).`,
      };
    }

    // 3. Same Owner (User cannot have multiple approved projects)
    if (prd.owner_id && approved.owner_id && prd.owner_id === approved.owner_id) {
      return {
        isDuplicate: true,
        conflict: approved,
        reason: `Owner <@${prd.owner_id}> already has an approved project ('${approved.title}' - \`${approved.id}\`).`,
      };
    }
  }

  return { isDuplicate: false };
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

  if (status === "Approved") {
    const dupCheck = checkDuplicateApprovedProject(id);
    if (dupCheck.isDuplicate) {
      return {
        error: `Cannot approve duplicate project: ${dupCheck.reason}`,
        duplicate: true,
        conflict: dupCheck.conflict,
        project: prd,
      };
    }
  }

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
  parseTeammateTokens,
  cleanMemberToken,
  isSubmitterToken,
  validatePdf,
  generateNextPrdId,
  submitPrd,
  getPrdById,
  getPrdByOwnerId,
  getPendingPrds,
  updatePrdStatus,
  checkDuplicateApprovedProject,
  assignMentor,
  setProjectRepo,
  setMentorStatus,
};
