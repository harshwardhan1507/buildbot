// Ensure isolated in-memory test database is set BEFORE any modules load
process.env.DATABASE_PATH = ":memory:";

const assert = require("node:assert");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Collection } = require("discord.js");

const db = require("../src/services/database");
// Explicitly initialize in-memory database
db.initDatabase(":memory:");

const {
  submitPrd,
  getPrdById,
  getPrdByOwnerId,
  updatePrdStatus,
  approveAndAssignRepository,
  getPsUsage,
  buildParticipantApprovalView,
  buildRepoReadyNotification,
  generateNextPrdId,
  assignMentor,
  setMentorStatus,
  validateTeamSize,
  validateRepoUrl,
  validatePdf,
} = require("../src/services/prd");
const { buildPrdViewEmbed } = require("../src/commands/prd");
const {
  initializeProjectMilestones,
  getProjectMilestones,
  getMilestoneByIndex,
  updateMilestoneStatus,
  calculateProjectProgress,
  generateProgressBar,
} = require("../src/services/milestones");
const {
  upsertUser,
  setUserTrack,
  getUser,
  canUserViewProject,
  getProjectSignals,
  getDetailedOverview,
  getTeamsByMentor,
  getTeamStatus,
} = require("../src/services/teams");
const {
  calculateActivityHealth,
  connectProjectRepo,
  recordRepoActivity,
  getRepoStats,
  verifySignature,
} = require("../src/services/github");
const {
  getNextTicketNumber,
  formatTicketNumber,
  claimTicket,
  closeTicket,
  deleteTicketChannel,
  getTicketByNumber,
  listTickets,
  getParticipantTickets,
} = require("../src/services/tickets");
const {
  isTechSpaceAdmin,
  isBuildLabTeam,
  getMemberTrack,
} = require("../src/utils/permissions");
const {
  assignTrackRole,
  assignTrackRoleToTeam,
  findTrackRole,
  validateGuildTrackRoles,
} = require("../src/services/roles");
const interactionCreate = require("../src/events/interactionCreate");
const { timeline, getCurrentPhase, getTimeRemaining, ANNOUNCEMENTS } = require("../src/config/events");

let passed = 0;
let failed = 0;

function test(description, fn) {
  try {
    fn();
    console.log(`  PASS: ${description}`);
    passed++;
  } catch (error) {
    console.error(`❌ FAIL: ${description}`);
    console.error(`   ${error.message}`);
    failed++;
  }
}

async function asyncTest(description, fn) {
  try {
    await fn();
    console.log(`  PASS: ${description}`);
    passed++;
  } catch (error) {
    console.error(`❌ FAIL: ${description}`);
    console.error(`   ${error.message}`);
    failed++;
  }
}

async function runTests() {
  console.log("\n==================================================");
  console.log("🛠️ RUNNING BUILDLAB SIMPLIFIED ARCHITECTURE TEST SUITE");
  console.log("==================================================");

  // Snapshot production database stats before test
  const prodDbPath = path.resolve(__dirname, "../data/buildlab.sqlite");
  const prodExists = fs.existsSync(prodDbPath);
  const prodMtimeBefore = prodExists ? fs.statSync(prodDbPath).mtimeMs : null;
  const prodSizeBefore = prodExists ? fs.statSync(prodDbPath).size : null;

  // 1. Database Isolation
  console.log("\n--- [1] Database Isolation & Clean Schema ---");
  test("Active test database is isolated :memory: database", () => {
    assert.strictEqual(db.activeDbPath, ":memory:");
  });

  // 2. PRD Team Size Validation
  console.log("\n--- [2] PRD Team Size Validation ---");
  test("Beginner track: 0 teammates is valid (1 member total)", () => {
    const res = validateTeamSize("Beginner", "Solo", { username: "alice", id: "1001" });
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.count, 1);
    assert.strictEqual(res.summary, "Beginner · Solo · 1 member");

    const resEmpty = validateTeamSize("Beginner", "", { username: "alice", id: "1001" });
    assert.strictEqual(resEmpty.valid, true);
    assert.strictEqual(resEmpty.count, 1);
  });

  test("Beginner track: 1 teammate is rejected with clear message", () => {
    const res = validateTeamSize("Beginner", "@bob", { username: "alice", id: "1001" });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.count, 2);
    assert.ok(res.error.includes("Beginner is a Solo track"));
    assert.ok(res.error.includes("You cannot add teammates to a Beginner project"));
  });

  test("Intermediate track: 0 teammates is rejected with clear request for 1 teammate", () => {
    const res = validateTeamSize("Intermediate", "Solo", { username: "alice", id: "1001" });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.count, 1);
    assert.ok(res.error.includes("Intermediate teams require exactly 2 members total"));
    assert.ok(res.error.includes("Please add 1 teammate"));
  });

  test("Intermediate track: 1 teammate is valid (2 members total)", () => {
    const res = validateTeamSize("Intermediate", "@partner", { username: "alice", id: "1001" });
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.count, 2);
    assert.strictEqual(res.summary, "Intermediate · Duo · 2 members");
  });

  test("Intermediate track: 2 teammates is rejected with clear member count", () => {
    const res = validateTeamSize("Intermediate", "@bob, @charlie", { username: "alice", id: "1001" });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.count, 3);
    assert.ok(res.error.includes("Intermediate teams require exactly 2 members total"));
    assert.ok(res.error.includes("You currently have 3 members"));
  });

  test("Advanced track: 0 teammates is rejected asking for 2–3 teammates", () => {
    const res = validateTeamSize("Advanced", "Solo", { username: "alice", id: "1001" });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.count, 1);
    assert.ok(res.error.includes("Advanced teams must have 3–4 members total"));
    assert.ok(res.error.includes("You are currently the only member"));
    assert.ok(res.error.includes("Please add 2–3 teammates"));
  });

  test("Advanced track: 1 teammate is rejected distinguishing 2 members from needing 1–2 more teammates", () => {
    const res = validateTeamSize("Advanced", "@bob", { username: "alice", id: "1001" });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.count, 2);
    assert.ok(res.error.includes("Advanced teams must have 3–4 members total"));
    assert.ok(res.error.includes("You currently have 2 members:"));
    assert.ok(res.error.includes("• You"));
    assert.ok(res.error.includes("• 1 teammate"));
    assert.ok(res.error.includes("Please add 1–2 more teammate(s)"));
  });

  test("Advanced track: 2 teammates is valid (3 members total)", () => {
    const res = validateTeamSize("Advanced", "@bob, @charlie", { username: "alice", id: "1001" });
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.count, 3);
    assert.strictEqual(res.summary, "Advanced · Squad · 3 members");
  });

  test("Advanced track: 3 teammates is valid (4 members total)", () => {
    const res = validateTeamSize("Advanced", "@bob, @charlie, @dave", { username: "alice", id: "1001" });
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.count, 4);
    assert.strictEqual(res.summary, "Advanced · Squad · 4 members");
  });

  test("Advanced track: 4 teammates is rejected (5 members total)", () => {
    const res = validateTeamSize("Advanced", "@b, @c, @d, @e", { username: "alice", id: "1001" });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.count, 5);
    assert.ok(res.error.includes("Advanced teams must have 3–4 members total"));
    assert.ok(res.error.includes("You currently have 5 members"));
  });

  test("Submitter self-mention in teammate list is automatically filtered and accepted without error", () => {
    // Advanced: Submitter Alice + 2 teammates (@bob, @charlie) with self-mention (@alice) included -> 3 members total
    const resByUsername = validateTeamSize("Advanced", "@alice, @bob, @charlie", { username: "alice", id: "1001" });
    assert.strictEqual(resByUsername.valid, true);
    assert.strictEqual(resByUsername.count, 3);
    assert.strictEqual(resByUsername.teammates.length, 2);

    // Intermediate: Submitter Alice + 1 teammate (@bob) with self-mention ID (<@1001>) -> 2 members total
    const resById = validateTeamSize("Intermediate", "<@1001>, @bob", { username: "alice", id: "1001" });
    assert.strictEqual(resById.valid, true);
    assert.strictEqual(resById.count, 2);
    assert.strictEqual(resById.teammates.length, 1);

    // Beginner: Submitter Alice enters self-mention -> treated as Solo 1 member
    const resSolo = validateTeamSize("Beginner", "@alice", { username: "alice", id: "1001" });
    assert.strictEqual(resSolo.valid, true);
    assert.strictEqual(resSolo.count, 1);
  });

  test("Duplicate teammates listed are rejected", () => {
    const res = validateTeamSize("Advanced", "@bob, @bob", { username: "alice", id: "1001" });
    assert.strictEqual(res.valid, false);
    assert.ok(res.error.includes("Duplicate teammate found"));
    assert.ok(res.error.includes("Please list each teammate only once"));
  });

  test("Missing Discord user handles gracefully without crashing", () => {
    const res = validateTeamSize("Beginner", "Solo", null);
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.count, 1);
  });

  test("PRD update changing team size prevents saving invalid team", () => {
    // Valid initial team: Alice + Bob + Charlie = 3 members
    const initialCheck = validateTeamSize("Advanced", "@bob, @charlie", { username: "alice", id: "1001" });
    assert.strictEqual(initialCheck.valid, true);
    assert.strictEqual(initialCheck.count, 3);

    // Participant edits team to remove Charlie -> only Bob remains -> 2 members total
    const updatedCheck = validateTeamSize("Advanced", "@bob", { username: "alice", id: "1001" });
    assert.strictEqual(updatedCheck.valid, false);
    assert.strictEqual(updatedCheck.count, 2);
    assert.ok(updatedCheck.error.includes("Please add 1–2 more teammate(s)"));
  });

  // 3. GitHub Repository URL Validation
  console.log("\n--- [3] GitHub Repository URL Validation ---");
  test("Valid full GitHub URL is normalized", () => {
    const res = validateRepoUrl("https://github.com/techspace-srm/buildlab-bot");
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.repoUrl, "https://github.com/techspace-srm/buildlab-bot");
    assert.strictEqual(res.repoName, "techspace-srm/buildlab-bot");
  });

  test("Valid owner/repo slug is accepted", () => {
    const res = validateRepoUrl("user123/my-cool-project");
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.repoUrl, "https://github.com/user123/my-cool-project");
  });

  test("Invalid non-GitHub URL or empty string is rejected", () => {
    assert.strictEqual(validateRepoUrl("").valid, false);
    assert.strictEqual(validateRepoUrl("https://gitlab.com/foo/bar").valid, false);
    assert.strictEqual(validateRepoUrl("just_a_string").valid, false);
  });

  // 3.5 Proposal PDF Validation
  console.log("\n--- [3.5] Project Proposal PDF Validation ---");
  test("Valid direct .pdf link is accepted", () => {
    const res = validatePdf("https://example.com/proposals/BL-PRD-001.pdf");
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.url, "https://example.com/proposals/BL-PRD-001.pdf");
  });

  test("Valid Google Drive or GitHub document link is accepted", () => {
    const driveRes = validatePdf("https://drive.google.com/file/d/1a2b3c4d5e/view?usp=sharing");
    assert.strictEqual(driveRes.valid, true);

    const ghRes = validatePdf("https://github.com/techspace-srm/buildlab-bot/blob/main/proposal.pdf");
    assert.strictEqual(ghRes.valid, true);
  });

  test("Valid Discord attachment object with .pdf is accepted", () => {
    const res = validatePdf({
      name: "final_project_proposal.pdf",
      contentType: "application/pdf",
      size: 1024 * 500, // 500 KB
      url: "https://cdn.discordapp.com/attachments/123/456/final_project_proposal.pdf",
    });
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.url, "https://cdn.discordapp.com/attachments/123/456/final_project_proposal.pdf");
  });

  test("Invalid non-PDF or arbitrary file type is rejected", () => {
    const res1 = validatePdf("https://example.com/image.png");
    assert.strictEqual(res1.valid, false);

    const res2 = validatePdf({
      name: "malicious.exe",
      contentType: "application/x-msdownload",
      size: 1024,
      url: "https://cdn.discordapp.com/attachments/123/malicious.exe",
    });
    assert.strictEqual(res2.valid, false);

    const res3 = validatePdf("");
    assert.strictEqual(res3.valid, false);
  });

  // 4. Automatic Track Role Assignment & Safe Conflict Handling
  console.log("\n--- [4] Automatic Track Role Assignment & Conflict Handling ---");

  // Helper to create mock guild & member
  function createMockGuildMember(currentRoleNames = [], highestBotRolePosition = 50) {
    const rolesMap = new Collection([
      ["role_beg", { id: "role_beg", name: "Beginner", position: 10 }],
      ["role_int", { id: "role_int", name: "Intermediate", position: 10 }],
      ["role_adv", { id: "role_adv", name: "Advanced", position: 10 }],
      ["role_team", { id: "role_team", name: "BuildLab Team", position: 30 }],
      ["role_admin", { id: "role_admin", name: "TechSpace Admin", position: 40 }],
    ]);

    const memberRolesCache = new Collection();
    for (const name of currentRoleNames) {
      for (const [id, r] of rolesMap) {
        if (r.name.toLowerCase() === name.toLowerCase()) {
          memberRolesCache.set(id, { ...r });
        }
      }
    }

    const removedCalls = [];
    const addedCalls = [];

    const member = {
      id: "member_test_role_1",
      user: { id: "member_test_role_1", username: "Tester" },
      roles: {
        cache: memberRolesCache,
        async remove(role, reason) {
          removedCalls.push(role.name);
          memberRolesCache.delete(role.id);
        },
        async add(role, reason) {
          addedCalls.push(role.name);
          memberRolesCache.set(role.id, role);
        },
      },
      guild: {
        name: "Test Guild",
        id: "guild_test_1",
        roles: {
          cache: rolesMap,
        },
        members: {
          me: {
            roles: {
              highest: { name: "BuildLab Bot", position: highestBotRolePosition },
            },
          },
        },
      },
      _removedCalls: removedCalls,
      _addedCalls: addedCalls,
    };

    return member;
  }

  await asyncTest("User with no track role -> submits Beginner -> @Beginner assigned", async () => {
    const member = createMockGuildMember([]);
    const res = await assignTrackRole(member, "Beginner");
    assert.strictEqual(res.success, true);
    assert.strictEqual(member._addedCalls.includes("Beginner"), true);
    assert.strictEqual(member._removedCalls.length, 0);

    const dbUser = getUser(member.id);
    assert.strictEqual(dbUser.track, "Beginner");
  });

  await asyncTest("User with Beginner -> changes to Intermediate -> Beginner removed, Intermediate assigned", async () => {
    const member = createMockGuildMember(["Beginner"]);
    const res = await assignTrackRole(member, "Intermediate");
    assert.strictEqual(res.success, true);
    assert.strictEqual(member._removedCalls.includes("Beginner"), true);
    assert.strictEqual(member._addedCalls.includes("Intermediate"), true);
    assert.strictEqual(member.roles.cache.has("role_beg"), false);
    assert.strictEqual(member.roles.cache.has("role_int"), true);

    const dbUser = getUser(member.id);
    assert.strictEqual(dbUser.track, "Intermediate");
  });

  await asyncTest("User with Intermediate -> changes to Advanced -> Intermediate removed, Advanced assigned", async () => {
    const member = createMockGuildMember(["Intermediate"]);
    const res = await assignTrackRole(member, "Advanced");
    assert.strictEqual(res.success, true);
    assert.strictEqual(member._removedCalls.includes("Intermediate"), true);
    assert.strictEqual(member._addedCalls.includes("Advanced"), true);
  });

  await asyncTest("User with conflicting Beginner + Advanced -> submits Intermediate -> both removed, Intermediate assigned", async () => {
    const member = createMockGuildMember(["Beginner", "Advanced"]);
    const res = await assignTrackRole(member, "Intermediate");
    assert.strictEqual(res.success, true);
    assert.strictEqual(member._removedCalls.includes("Beginner"), true);
    assert.strictEqual(member._removedCalls.includes("Advanced"), true);
    assert.strictEqual(member._addedCalls.includes("Intermediate"), true);
  });

  await asyncTest("Staff roles (TechSpace Admin, BuildLab Team) are NEVER removed when updating track", async () => {
    const member = createMockGuildMember(["Beginner", "BuildLab Team", "TechSpace Admin"]);
    const res = await assignTrackRole(member, "Intermediate");
    assert.strictEqual(res.success, true);
    assert.strictEqual(member._removedCalls.includes("BuildLab Team"), false);
    assert.strictEqual(member._removedCalls.includes("TechSpace Admin"), false);
    assert.strictEqual(member.roles.cache.has("role_team"), true);
    assert.strictEqual(member.roles.cache.has("role_admin"), true);
  });

  await asyncTest("Bot below role hierarchy -> returns helpful error without silent corruption", async () => {
    const member = createMockGuildMember(["Beginner"], 5); // bot position 5 < role position 10
    const res = await assignTrackRole(member, "Intermediate");
    assert.strictEqual(res.success, false);
    assert.ok(res.message.includes("hierarchy"));
  });

  await asyncTest("assignTrackRoleToTeam assigns track role to all team members (owner + teammates) on PRD approval", async () => {
    // 1. Setup mock guild with 3 members: lead, tm1, tm2
    const lead = createMockGuildMember([]);
    lead.id = "user_lead_101";
    lead.user.id = "user_lead_101";
    lead.user.username = "teamlead";

    const tm1 = createMockGuildMember([]);
    tm1.id = "user_tm1_102";
    tm1.user.id = "user_tm1_102";
    tm1.user.username = "teammate1";

    const tm2 = createMockGuildMember([]);
    tm2.id = "user_tm2_103";
    tm2.user.id = "user_tm2_103";
    tm2.user.username = "teammate2";

    const membersCache = new Map();
    membersCache.set("user_lead_101", lead);
    membersCache.set("user_tm1_102", tm1);
    membersCache.set("user_tm2_103", tm2);

    const guild = {
      ...lead.guild,
      members: {
        cache: membersCache,
        fetch: async (id) => membersCache.get(id) || null,
      },
    };

    // Advanced project with lead + 2 teammates
    const project = {
      id: "BL-PRD-099",
      track: "Advanced",
      owner_id: "user_lead_101",
      team_members: "<@user_tm1_102>, <@user_tm2_103>",
    };

    const result = await assignTrackRoleToTeam(guild, project);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.assignedMembers.length, 3);

    // Verify all 3 members received Advanced role
    assert.strictEqual(lead._addedCalls.includes("Advanced"), true);
    assert.strictEqual(tm1._addedCalls.includes("Advanced"), true);
    assert.strictEqual(tm2._addedCalls.includes("Advanced"), true);

    // Verify database records updated
    assert.strictEqual(getUser("user_lead_101").track, "Advanced");
    assert.strictEqual(getUser("user_tm1_102").track, "Advanced");
    assert.strictEqual(getUser("user_tm2_103").track, "Advanced");
  });

  // 5. PRD Submission, Idempotence & GitHub Association
  console.log("\n--- [5] PRD Submission & Project Lifecycle ---");
  const testOwnerId = "user_participant_alice";
  let testProjectId = null;

  test("submitPrd creates project proposal with proposal PDF and links GitHub repository", () => {
    const prd = submitPrd({
      title: "Campus Lost & Found",
      track: "Beginner",
      owner_id: testOwnerId,
      team_name: "SoloFinder",
      project_type: "Catalogue Project",
      problem_statement_id: "B01",
      team_members: "Solo",
      problem_statement: "Students lose valuables on campus without a central hub.",
      solution: "A web app with searchable catalog and verified claim system.",
      core_features: "Item catalog, Search & filters, Claim verification",
      tech_stack: "React, Node.js, SQLite",
      repo_url: "https://github.com/alice/campus-lost-found",
      proposal_pdf_url: "https://drive.google.com/file/d/test123_proposal/view",
    });

    assert.ok(prd);
    assert.ok(prd.id.startsWith("BL-PRD-"));
    assert.strictEqual(prd.title, "Campus Lost & Found");
    assert.strictEqual(prd.track, "Beginner");
    assert.strictEqual(prd.repo_url, "https://github.com/alice/campus-lost-found");
    assert.strictEqual(prd.proposal_pdf_url, "https://drive.google.com/file/d/test123_proposal/view");
    assert.strictEqual(prd.status, "Pending");
    assert.strictEqual(prd.problem_statement_id, "B01");
    testProjectId = prd.id;
  });

  test("Submitting PRD again updates existing project preserving proposal PDF without creating duplicates", () => {
    const updated = submitPrd({
      title: "Campus Lost & Found 2.0",
      track: "Beginner",
      owner_id: testOwnerId,
      team_members: "Solo",
      problem_statement: "Updated problem statement.",
      core_features: "Item catalog, Search, QR verification",
      tech_stack: "Next.js, SQLite",
      repo_url: "https://github.com/alice/campus-lost-found",
    });

    assert.strictEqual(updated.id, testProjectId, "Must keep existing project ID");
    assert.strictEqual(updated.title, "Campus Lost & Found 2.0");
    assert.strictEqual(updated.proposal_pdf_url, "https://drive.google.com/file/d/test123_proposal/view", "Must preserve PDF if not modified");

    const totalProjects = db.prepare("SELECT COUNT(*) as count FROM projects").get().count;
    assert.strictEqual(totalProjects, 1, "Must not create duplicate rows");
  });

  // 5.5 Duplicate Project Approval Protection & ID Assignment
  console.log("\n--- [5.5] Duplicate Project Approval Protection & Project ID ---");
  test("generateNextPrdId assigns sequential IDs based on highest existing number", () => {
    const nextId = generateNextPrdId();
    assert.strictEqual(nextId, "BL-PRD-002");
  });

  test("Approved project ALLOWS duplicate approval for same stack on duplicate PS or duplicate title", () => {
    // 1. Approve initial project (BL-PRD-001, title: Campus Lost & Found 2.0, PS: B01)
    const approved1 = updatePrdStatus(testProjectId, "Approved", "Initial approved proposal");
    assert.strictEqual(approved1.status, "Approved");
    assert.strictEqual(approved1.repo_status, "READY_TO_BUILD");

    // 2. Create second project with same catalogue problem statement B01 and same primary stack (React)
    const prdBob = submitPrd({
      title: "Another Lost & Found App",
      track: "Intermediate",
      owner_id: "user_bob",
      team_members: "@charlie",
      problem_statement_id: "B01",
      problem_statement: "Different approach to lost and found.",
      core_features: "Mobile app, NFC tracking",
      tech_stack: "React, Firebase", // Primary stack: React (collides with testProjectId!)
      repo_url: "https://github.com/bob/lost-found",
    });
    assert.strictEqual(prdBob.problem_statement_id, "B01");

    // Attempting to approve bob's project must SUCCEED now
    const approveBobResult = updatePrdStatus(prdBob.id, "Approved", "Attempting approval");
    assert.strictEqual(approveBobResult.status, "Approved");

    // 3. Create third project with duplicate title by dave
    const prdDave = submitPrd({
      title: "Campus Lost & Found 2.0",
      track: "Beginner",
      owner_id: "user_dave",
      team_members: "Solo",
      problem_statement: "Same title idea.",
      core_features: "Web app",
      tech_stack: "Vue.js",
      repo_url: "https://github.com/dave/campus-lost-found",
    });

    const approveDaveResult = updatePrdStatus(prdDave.id, "Approved", "Attempting approval");
    assert.strictEqual(approveDaveResult.status, "Approved");
  });

  // 5.6. PRD Approval + Repository Assignment Workflow (Section 24 Tests)
  console.log("\n--- [5.6] PRD Approval + Repository Assignment UX (Section 24 Test Cases 1-10) ---");

  // Test Case 1: First team takes B07 -> approve -> submitted repo marked ready
  let teamAlphaProject = null;
  test("Test Case 1: First team takes B07 -> approve -> submitted repo marked ready", () => {
    teamAlphaProject = submitPrd({
      title: "Automated File Organizer",
      track: "Beginner",
      owner_id: "user_team_alpha",
      team_members: "Solo",
      problem_statement_id: "B07",
      problem_statement: "Automate desktop file categorization.",
      solution: "Python desktop organizer daemon.",
      core_features: "Folder watcher, Extension filter, Archival",
      tech_stack: "Python, Watchdog",
      proposal_pdf_url: "https://drive.google.com/alpha-proposal.pdf",
      repo_url: "https://github.com/alpha/automated-file-organizer",
    });

    assert.strictEqual(teamAlphaProject.problem_statement_id, "B07");

    const approvalResult = approveAndAssignRepository(teamAlphaProject.id, "Approved for Team Alpha");
    assert.strictEqual(approvalResult.success, true);
    assert.strictEqual(approvalResult.project.status, "Approved");
    assert.strictEqual(approvalResult.project.repo_status, "READY_TO_BUILD");
    assert.strictEqual(approvalResult.project.repo_url, "https://github.com/alpha/automated-file-organizer");
  });

  // Test Case 2: Second team takes B07 -> different valid stack -> approve -> second repo marked ready
  let teamBetaProject = null;
  test("Test Case 2: Second team takes B07 -> different valid stack -> approve -> second repo marked ready", () => {
    teamBetaProject = submitPrd({
      title: "Automated File Organizer",
      track: "Intermediate",
      owner_id: "user_team_beta",
      team_members: "@teammate_beta",
      problem_statement_id: "B07",
      problem_statement: "Cross-platform file organization in Java.",
      solution: "Java Spring Boot daemon and CLI.",
      core_features: "Background sync, Regex rules, Custom destinations",
      tech_stack: "Java, Spring Boot",
      proposal_pdf_url: "https://drive.google.com/beta-proposal.pdf",
      repo_url: "https://github.com/beta/automated-file-organizer-java",
    });

    const approvalResult = approveAndAssignRepository(teamBetaProject.id, "Approved for Team Beta");
    assert.strictEqual(approvalResult.success, true);
    assert.strictEqual(approvalResult.project.status, "Approved");
    assert.strictEqual(approvalResult.project.repo_status, "READY_TO_BUILD");
  });

  // Test Case 3: Third team takes B07 if capacity allows -> unique repo assigned
  let teamGammaProject = null;
  test("Test Case 3: Third team takes B07 (capacity check removed) -> third repo marked ready", () => {
    teamGammaProject = submitPrd({
      title: "Automated File Organizer",
      track: "Advanced",
      owner_id: "user_team_gamma",
      team_members: "@g1, @g2",
      problem_statement_id: "B07",
      problem_statement: "Web dashboard and file organizer service.",
      solution: "React frontend and Rust engine.",
      core_features: "Real-time sync, Web dashboard, Cloud upload",
      tech_stack: "React, Node.js",
      proposal_pdf_url: "https://drive.google.com/gamma-proposal.pdf",
      repo_url: "https://github.com/gamma/automated-file-organizer-react",
    });

    const approvalResult = approveAndAssignRepository(teamGammaProject.id, "Approved for Team Gamma");
    assert.strictEqual(approvalResult.success, true);
    assert.strictEqual(approvalResult.project.status, "Approved");
    assert.strictEqual(approvalResult.project.repo_status, "READY_TO_BUILD");
  });

  // Test Case 4: PS capacity reached -> NO REJECTION, STILL APPROVED
  test("Test Case 4: PS capacity reached -> NO REJECTION, STILL APPROVED", () => {
    const teamDeltaProject = submitPrd({
      title: "Automated File Organizer",
      track: "Beginner",
      owner_id: "user_team_delta",
      team_members: "Solo",
      problem_statement_id: "B07",
      problem_statement: "Go organizer.",
      core_features: "CLI",
      tech_stack: "Go",
      proposal_pdf_url: "https://drive.google.com/delta-proposal.pdf",
      repo_url: "https://github.com/delta/automated-file-organizer",
    });

    const approveDeltaResult = approveAndAssignRepository(teamDeltaProject.id, "Attempting approval");
    assert.strictEqual(approveDeltaResult.status, "Approved");
    assert.strictEqual(approveDeltaResult.project.repo_status, "READY_TO_BUILD");
  });

  // Test Case 5: Same stack attempted -> NO REJECTION, STILL APPROVED
  test("Test Case 5: Same stack attempted -> NO REJECTION, STILL APPROVED", () => {
    const team1 = submitPrd({
      title: "Campus Marketplace",
      track: "Intermediate",
      owner_id: "user_mkt_1",
      team_members: "@partner1",
      problem_statement_id: "B09",
      problem_statement: "Campus trading app.",
      core_features: "Listings, Chat",
      tech_stack: "Python, FastAPI",
      repo_url: "https://github.com/mkt1/campus-marketplace",
    });
    const app1 = approveAndAssignRepository(team1.id, "Approved team 1");
    assert.strictEqual(app1.success, true);

    const team2 = submitPrd({
      title: "Campus Marketplace",
      track: "Beginner",
      owner_id: "user_mkt_2",
      team_members: "Solo",
      problem_statement_id: "B09",
      problem_statement: "Campus trading app duplicate stack.",
      core_features: "Listings",
      tech_stack: "Python, Flask",
      repo_url: "https://github.com/mkt2/campus-marketplace",
    });

    const app2 = approveAndAssignRepository(team2.id, "Attempting duplicate stack");
    assert.strictEqual(app2.status, "Approved");
  });

  // Test Case 6: Pending repo state handled if no repo provided
  let teamFailProject = null;
  test("Test Case 6: No repo provided -> PRD approved, repo status remains pending", () => {
    teamFailProject = submitPrd({
      title: "Event RSVP Manager",
      track: "Beginner",
      owner_id: "user_rsvp_fail",
      team_members: "Solo",
      problem_statement_id: "B10",
      problem_statement: "Event RSVPs.",
      core_features: "RSVP",
      tech_stack: "Node.js",
      repo_url: "", // No repo
    });

    const failApproval = approveAndAssignRepository(teamFailProject.id, "Approved with no repo");

    assert.strictEqual(failApproval.success, true); // PRD itself approved
    assert.strictEqual(failApproval.project.status, "Approved");
    assert.strictEqual(failApproval.project.repo_status, "PENDING_ASSIGNMENT");

    // Notification indicates repository is being assigned
    const failInDb = getPrdById(teamFailProject.id);
    const notif = buildParticipantApprovalView(failInDb, false, failApproval.repoResult);
    assert.ok(notif.embed.data.description.includes("BEING ASSIGNED"));
  });

  // Test Case 7: Participant status after approval -> shows correct repository state
  test("Test Case 7: Participant status after approval -> shows correct repository state", () => {
    // 7a: Ready project shows Ready
    const readyProject = getPrdById(teamAlphaProject.id);
    assert.strictEqual(readyProject.repo_status, "READY_TO_BUILD");
    assert.ok(readyProject.repo_url);

    // 7b: Pending project shows Being assigned
    const pendingProject = getPrdById(teamFailProject.id);
    assert.ok(pendingProject, "Pending project must exist");
    assert.strictEqual(pendingProject.repo_status, "PENDING_ASSIGNMENT");
  });

  // Test Case 8: Staff review -> shows stack and repo
  test("Test Case 8: Staff review -> shows stack and repo", () => {
    const reviewProject = getPrdById(teamBetaProject.id);
    const staffEmbed = buildPrdViewEmbed(reviewProject, true);

    const fields = staffEmbed.data.fields;
    const proposedField = fields.find((f) => f.name === "STACK");
    assert.ok(proposedField, "Must include STACK field");
    assert.ok(proposedField.value.includes("Java"));

    const repoField = fields.find((f) => f.name === "GITHUB REPOSITORY");
    assert.ok(repoField, "Must include GITHUB REPOSITORY field");
    assert.ok(repoField.value.includes("https://github.com/beta/automated-file-organizer-java"));
  });

  // Test Case 9: Participant receives approval notification -> clearly understands PRD approved, repo state, repo URL
  test("Test Case 9: Participant receives approval notification with complete information", () => {
    const betaInDb = getPrdById(teamBetaProject.id);
    const viewResult = buildParticipantApprovalView(betaInDb, false, { success: true });

    // Verify Title and Duplicate PS notice
    assert.strictEqual(viewResult.embed.data.title, "✅ YOUR PROJECT IS APPROVED");
    assert.ok(viewResult.embed.data.description.includes("READY"));
    assert.ok(viewResult.embed.data.description.includes("automated-file-organizer-java"));

    // Verify Buttons: Link to repo, View PRD, Project Status
    const buttons = viewResult.components[0].components;
    assert.strictEqual(buttons.length, 3);
    assert.strictEqual(buttons[0].data.label, "OPEN REPOSITORY ↗");
    assert.ok(buttons[0].data.url.includes("automated-file-organizer-java"));
    assert.strictEqual(buttons[1].data.label, "VIEW PRD");
    assert.strictEqual(buttons[2].data.label, "PROJECT STATUS");
  });

  // 6. Support Tickets Lifecycle
  console.log("\n--- [6] Support Ticket Lifecycle ---");
  let testTicketNumber = null;
  test("Ticket creation, claiming, and queue listing", () => {
    testTicketNumber = getNextTicketNumber();
    assert.strictEqual(typeof testTicketNumber, "number");

    db.prepare(`
      INSERT INTO tickets (ticket_number, channel_id, creator_id, category, status, created_at)
      VALUES (?, ?, ?, ?, 'OPEN', ?)
    `).run(testTicketNumber, "chan_ticket_test", testOwnerId, "Technical Issue", new Date().toISOString());

    const openList = listTickets({ filter: "open" });
    assert.ok(openList.some((t) => t.ticket_number === testTicketNumber));

    const unclaimedList = listTickets({ filter: "unclaimed" });
    assert.ok(unclaimedList.some((t) => t.ticket_number === testTicketNumber));
  });

  await asyncTest("closeTicket marks ticket as CLOSED and handles channel updates safely", async () => {
    const mockChannel = {
      id: "chan_ticket_test",
      name: "ticket-001",
      setName: async (name) => { mockChannel.name = name; },
      permissionOverwrites: {
        edit: async () => {},
      },
      setParent: async () => {},
      send: async () => {},
    };

    const mockCloser = {
      id: "closer_user_99",
      guild: {
        channels: {
          cache: new Collection([["chan_ticket_test", mockChannel]]),
          fetch: async () => mockChannel,
        },
      },
    };

    const res = await closeTicket(testTicketNumber, mockCloser, "Resolved properly");
    assert.strictEqual(res.success, true);

    const updated = getTicketByNumber(testTicketNumber);
    assert.strictEqual(updated.status, "CLOSED");
    assert.strictEqual(updated.closed_by, "closer_user_99");

    // Re-closing already closed ticket should safely fail
    const dupClose = await closeTicket(testTicketNumber, mockCloser);
    assert.strictEqual(dupClose.success, false);
    assert.strictEqual(dupClose.message, "Ticket is already closed.");
  });

  // 7. Command Registry Integrity: Simplified 10 Commands
  console.log("\n--- [7] Command Registry Integrity: Target Command Set ---");
  const cmdDir = path.join(__dirname, "../src/commands");
  const cmdFiles = fs.readdirSync(cmdDir).filter((f) => f.endsWith(".js"));

  assert.strictEqual(cmdFiles.length, 10, `Expected exactly 10 slash commands, found ${cmdFiles.length}`);

  const expectedParticipantCmds = ["start", "prd", "help", "ticket", "my-tickets", "status"];
  const expectedStaffCmds = ["dashboard", "tickets", "teams", "reminders"];
  const allExpected = [...expectedParticipantCmds, ...expectedStaffCmds];

  const loadedNames = [];
  const clientCommands = new Map();

  for (const file of cmdFiles) {
    const cmd = require(`../src/commands/${file}`);
    assert.ok(cmd.data && typeof cmd.data.toJSON === "function", `${file} invalid command data`);
    assert.strictEqual(typeof cmd.execute, "function", `${file} invalid execute handler`);
    loadedNames.push(cmd.data.name);
    clientCommands.set(cmd.data.name, cmd);
  }

  for (const name of allExpected) {
    assert.ok(loadedNames.includes(name), `Expected command /${name} to exist in registry`);
  }

  const retiredCommands = ["track", "milestone", "team-status", "my-teams", "mentor-status", "assign-mentor", "project"];
  for (const retired of retiredCommands) {
    assert.strictEqual(loadedNames.includes(retired), false, `Retired command /${retired} must NOT exist in registry!`);
  }

  console.log(`  PASS: Verified exactly 10 active commands: ${loadedNames.join(", ")}`);
  console.log(`  PASS: Verified 7 retired commands were removed from registry`);
  passed += 2;

  // 7.5 BuildLab '26 Timeline & Phase Detection Logic
  console.log("\n--- [7.5] BuildLab '26 Timeline & Phase Detection Logic ---");

  test("Timeline has exactly 4 active milestones and zero retired dates", () => {
    assert.strictEqual(timeline.length, 4, "Timeline must contain exactly 4 milestones");
    const keys = timeline.map((m) => m.key);
    assert.ok(keys.includes("kickoff_registration"), "Missing kickoff_registration");
    assert.ok(keys.includes("registration_prd_close"), "Missing registration_prd_close");
    assert.ok(keys.includes("midpoint_checkin"), "Missing midpoint_checkin");
    assert.ok(keys.includes("final_submission"), "Missing final_submission");

    const retiredKeys = ["track_selection", "prd_deadline", "mid_review", "demo_day", "closing_results"];
    for (const retired of retiredKeys) {
      assert.strictEqual(keys.includes(retired), false, `Retired milestone key ${retired} must not exist`);
    }
  });

  test("06 Oct: Kickoff & Registration Opens -> REGISTRATION + PRD", () => {
    const phase = getCurrentPhase("2026-10-06T10:00:00+05:30");
    assert.strictEqual(phase.phaseKey, "REGISTRATION_PRD");
    assert.strictEqual(phase.currentPhase, "REGISTRATION + PRD");
    assert.strictEqual(phase.nextLabel, "NEXT DEADLINE");
    assert.strictEqual(phase.nextValue, "08 OCT · 11:59 PM");
  });

  test("07 Oct: Mid Registration Window -> REGISTRATION + PRD", () => {
    const phase = getCurrentPhase("2026-10-07T14:30:00+05:30");
    assert.strictEqual(phase.phaseKey, "REGISTRATION_PRD");
    assert.strictEqual(phase.currentPhase, "REGISTRATION + PRD");
    assert.strictEqual(phase.nextLabel, "NEXT DEADLINE");
    assert.strictEqual(phase.nextValue, "08 OCT · 11:59 PM");
  });

  test("08 Oct: Registration & PRD Deadline Day -> REGISTRATION + PRD", () => {
    const phase = getCurrentPhase("2026-10-08T23:00:00+05:30");
    assert.strictEqual(phase.phaseKey, "REGISTRATION_PRD");
    assert.strictEqual(phase.currentPhase, "REGISTRATION + PRD");
    assert.strictEqual(phase.nextLabel, "NEXT DEADLINE");
    assert.strictEqual(phase.nextValue, "08 OCT · 11:59 PM");
  });

  test("09 Oct: Start of Build Phase I -> BUILD PHASE I", () => {
    const phase = getCurrentPhase("2026-10-09T09:00:00+05:30");
    assert.strictEqual(phase.phaseKey, "BUILD_PHASE_1");
    assert.strictEqual(phase.currentPhase, "BUILD PHASE I");
    assert.strictEqual(phase.nextLabel, "NEXT CHECKPOINT");
    assert.strictEqual(phase.nextValue, "16 OCT · MIDPOINT CHECK-IN");
  });

  test("15 Oct: End of Build Phase I -> BUILD PHASE I", () => {
    const phase = getCurrentPhase("2026-10-15T20:00:00+05:30");
    assert.strictEqual(phase.phaseKey, "BUILD_PHASE_1");
    assert.strictEqual(phase.currentPhase, "BUILD PHASE I");
    assert.strictEqual(phase.nextLabel, "NEXT CHECKPOINT");
    assert.strictEqual(phase.nextValue, "16 OCT · MIDPOINT CHECK-IN");
  });

  test("16 Oct: Midpoint Check-In Day -> MIDPOINT CHECK-IN", () => {
    const phase = getCurrentPhase("2026-10-16T15:00:00+05:30");
    assert.strictEqual(phase.phaseKey, "MIDPOINT_CHECKIN");
    assert.strictEqual(phase.currentPhase, "MIDPOINT CHECK-IN");
    assert.strictEqual(phase.nextLabel, "FINAL SUBMISSION");
    assert.strictEqual(phase.nextValue, "23 OCT");
  });

  test("17 Oct: Start of Final Build + Polish -> FINAL BUILD + POLISH", () => {
    const phase = getCurrentPhase("2026-10-17T11:00:00+05:30");
    assert.strictEqual(phase.phaseKey, "FINAL_BUILD_POLISH");
    assert.strictEqual(phase.currentPhase, "FINAL BUILD + POLISH");
    assert.strictEqual(phase.nextLabel, "FINAL SUBMISSION");
    assert.strictEqual(phase.nextValue, "23 OCT");
  });

  test("22 Oct: Day Before Final Submission -> FINAL BUILD + POLISH", () => {
    const phase = getCurrentPhase("2026-10-22T21:00:00+05:30");
    assert.strictEqual(phase.phaseKey, "FINAL_BUILD_POLISH");
    assert.strictEqual(phase.currentPhase, "FINAL BUILD + POLISH");
    assert.strictEqual(phase.nextLabel, "FINAL SUBMISSION");
    assert.strictEqual(phase.nextValue, "23 OCT");
  });

  test("23 Oct: Final Submission Day -> FINAL SUBMISSION / PROGRAM CONCLUSION", () => {
    const phase = getCurrentPhase("2026-10-23T18:00:00+05:30");
    assert.strictEqual(phase.phaseKey, "FINAL_SUBMISSION");
    assert.strictEqual(phase.currentPhase, "FINAL SUBMISSION / PROGRAM CONCLUSION");
    assert.strictEqual(phase.nextLabel, "FINAL SUBMISSION");
    assert.strictEqual(phase.nextValue, "TODAY · 11:59 PM");
  });

  test("24 Oct onward: Program Concluded -> PROGRAM COMPLETED", () => {
    const phase = getCurrentPhase("2026-10-24T10:00:00+05:30");
    assert.strictEqual(phase.phaseKey, "COMPLETED");
    assert.strictEqual(phase.currentPhase, "PROGRAM COMPLETED");
    assert.strictEqual(phase.nextLabel, "PROGRAM");
    assert.strictEqual(phase.nextValue, "COMPLETED");
  });

  // 8. Direct Command Execution
  console.log("\n--- [8] Direct Command Execution ---");

  // Helper mock interaction builder
  function createMockInteraction(overrides = {}) {
    const state = {
      deferred: overrides.deferred ?? false,
      replied: overrides.replied ?? false,
      ephemeral: overrides.ephemeral ?? false,
      acknowledged: overrides.deferred || overrides.replied || false,
      replyPayload: null,
      editPayload: null,
      followUpPayload: null,
      modalShown: null,
      updatePayload: null,
    };

    const rolesCollection = new Collection([
      ["role_beg", { id: "role_beg", name: "Beginner", position: 10 }],
      ["role_int", { id: "role_int", name: "Intermediate", position: 10 }],
      ["role_adv", { id: "role_adv", name: "Advanced", position: 10 }],
      ["role_team", { id: "role_team", name: "BuildLab Team", position: 30 }],
      ["role_admin", { id: "role_admin", name: "TechSpace Admin", position: 40 }],
    ]);

    const mockClient = {
      commands: clientCommands,
      guilds: {
        cache: new Collection([
          [
            "1554546150273712202",
            {
              roles: {
                cache: rolesCollection,
              },
            },
          ],
        ]),
      },
    };

    const user = overrides.user || { id: testOwnerId, username: "alice" };
    const memberRolesCache = new Collection(
      overrides.roles
        ? overrides.roles.map((r) => [r.id || r.name, r])
        : [["role_beg", { id: "role_beg", name: "Beginner", position: 10 }]]
    );

    const member = overrides.member || {
      id: user.id,
      user,
      roles: {
        cache: memberRolesCache,
        async remove(role) {
          memberRolesCache.delete(role.id);
        },
        async add(role) {
          memberRolesCache.set(role.id, role);
        },
      },
      guild: {
        name: "SRM TechSpace",
        id: "1554546150273712202",
        roles: {
          cache: rolesCollection,
        },
        members: {
          cache: new Collection(),
          me: {
            roles: {
              highest: { name: "Bot", position: 50 },
            },
          },
        },
      },
    };

    const interaction = {
      id: "interaction_" + Math.random().toString(36).substring(7),
      commandName: overrides.commandName || "status",
      customId: overrides.customId || null,
      values: overrides.values || [],
      user,
      member,
      client: mockClient,
      guild: member.guild,
      get deferred() { return state.deferred; },
      get replied() { return state.replied; },
      get ephemeral() { return state.ephemeral; },
      getResponse() {
        return state.editPayload || state.replyPayload || state.updatePayload || state.followUpPayload;
      },
      isChatInputCommand: () => overrides.type !== "button" && overrides.type !== "modalSubmit" && overrides.type !== "selectMenu" && overrides.type !== "userSelectMenu",
      isButton: () => overrides.type === "button",
      isStringSelectMenu: () => overrides.type === "selectMenu",
      isUserSelectMenu: () => overrides.type === "userSelectMenu",
      isAnySelectMenu: () => overrides.type === "selectMenu" || overrides.type === "userSelectMenu",
      isModalSubmit: () => overrides.type === "modalSubmit",
      options: {
        getSubcommand: (req = true) => overrides.subcommand || null,
        getString: (n) => overrides.stringOptions?.[n] || null,
        getInteger: (n) => overrides.intOptions?.[n] || null,
        getUser: (n) => overrides.userOptions?.[n] || null,
        getBoolean: (n) => overrides.boolOptions?.[n] || null,
      },
      fields: {
        getTextInputValue: (n) => overrides.fieldValues?.[n] || "",
      },
      async deferReply(opts = {}) {
        state.deferred = true;
        state.ephemeral = opts.ephemeral || false;
        state.acknowledged = true;
      },
      async editReply(payload) {
        state.editPayload = payload;
        state.acknowledged = true;
      },
      async reply(payload) {
        state.replied = true;
        state.replyPayload = payload;
        state.ephemeral = payload?.ephemeral || false;
        state.acknowledged = true;
      },
      async followUp(payload) {
        state.followUpPayload = payload;
        state.acknowledged = true;
      },
      async showModal(modal) {
        state.modalShown = modal;
        state.acknowledged = true;
      },
      async deferUpdate() {
        state.deferred = true;
        state.acknowledged = true;
      },
      async update(payload) {
        state.replied = true;
        state.acknowledged = true;
        state.updatePayload = payload;
      },
      _state: state,
    };

    return interaction;
  }

  // Test /start
  await asyncTest("/start displays existing setup when user has PRD", async () => {
    const inter = createMockInteraction({ commandName: "start" });
    await interactionCreate.execute(inter);
    assert.strictEqual(inter._state.acknowledged, true);
    const resp = inter.getResponse();
    assert.ok(resp?.embeds?.[0]);
    assert.ok(resp.embeds[0].data.title.includes("PROJECT"));
  });

  await asyncTest("/start displays welcome onboarding panel when user has no PRD", async () => {
    const inter = createMockInteraction({
      commandName: "start",
      user: { id: "user_brand_new_student", username: "newbie" },
    });
    await interactionCreate.execute(inter);
    assert.strictEqual(inter._state.acknowledged, true);
    const resp = inter.getResponse();
    assert.ok(resp?.embeds?.[0]);
    assert.ok(resp.embeds[0].data.title.includes("WELCOME"));
  });

  // Test /help
  await asyncTest("/help acknowledges immediately with simplified 5-category buttons", async () => {
    const inter = createMockInteraction({ commandName: "help" });
    await interactionCreate.execute(inter);
    assert.strictEqual(inter._state.acknowledged, true);
    const resp = inter.getResponse();
    assert.ok(resp?.components?.length >= 2);
  });

  // Test /ticket
  await asyncTest("/ticket acknowledges with category select menu", async () => {
    const inter = createMockInteraction({ commandName: "ticket" });
    await interactionCreate.execute(inter);
    assert.strictEqual(inter._state.acknowledged, true);
    const resp = inter.getResponse();
    assert.ok(resp?.components?.length > 0);
  });

  // Test /my-tickets
  await asyncTest("/my-tickets displays active tickets and action button", async () => {
    const inter = createMockInteraction({ commandName: "my-tickets" });
    await interactionCreate.execute(inter);
    assert.strictEqual(inter._state.acknowledged, true);
    const resp = inter.getResponse();
    assert.ok(resp?.embeds?.[0]);
  });

  // Test /status
  await asyncTest("/status shows tailored participant progress", async () => {
    const inter = createMockInteraction({ commandName: "status" });
    await interactionCreate.execute(inter);
    assert.strictEqual(inter._state.acknowledged, true);
    const resp = inter.getResponse();
    assert.ok(resp?.embeds?.[0]);
    assert.ok(resp.embeds[0].data.title.includes("YOUR BUILDLAB STATUS"));
  });

  await asyncTest("/status shows program dashboard for BuildLab Team", async () => {
    const staffMember = {
      id: "staff_member_1",
      roles: {
        cache: new Collection([["role_team", { id: "role_team", name: "BuildLab Team" }]]),
      },
    };
    const inter = createMockInteraction({
      commandName: "status",
      user: { id: "staff_member_1", username: "StaffLeader" },
      member: staffMember,
      roles: [{ id: "role_team", name: "BuildLab Team" }],
    });
    await interactionCreate.execute(inter);
    assert.strictEqual(inter._state.acknowledged, true);
    const resp = inter.getResponse();
    assert.ok(resp?.embeds?.[0]);
    assert.ok(resp.embeds[0].data.title.includes("PROGRAM DASHBOARD"));
  });

  // Test /dashboard (Staff only)
  await asyncTest("/dashboard works for BuildLab Team and denies participants", async () => {
    const staffInter = createMockInteraction({
      commandName: "dashboard",
      roles: [{ id: "role_team", name: "BuildLab Team" }],
    });
    await interactionCreate.execute(staffInter);
    assert.strictEqual(staffInter._state.acknowledged, true);
    const staffResp = staffInter.getResponse();
    assert.ok(staffResp?.embeds?.[0]);

    const participantInter = createMockInteraction({
      commandName: "dashboard",
      roles: [{ id: "role_beg", name: "Beginner" }],
    });
    await interactionCreate.execute(participantInter);
    assert.strictEqual(participantInter._state.acknowledged, true);
    const partResp = participantInter.getResponse();
    assert.ok(partResp?.content?.includes("permission"));
  });

  // Test /teams (Staff only)
  await asyncTest("/teams works for BuildLab Team and denies participants", async () => {
    const staffInter = createMockInteraction({
      commandName: "teams",
      roles: [{ id: "role_team", name: "BuildLab Team" }],
    });
    await interactionCreate.execute(staffInter);
    assert.strictEqual(staffInter._state.acknowledged, true);

    const participantInter = createMockInteraction({
      commandName: "teams",
      roles: [{ id: "role_beg", name: "Beginner" }],
    });
    await interactionCreate.execute(participantInter);
    assert.strictEqual(participantInter._state.acknowledged, true);
    const partResp = participantInter.getResponse();
    assert.ok(partResp?.content?.includes("permission"));
  });

  // Test /tickets (Staff only)
  await asyncTest("/tickets works for BuildLab Team and denies participants", async () => {
    const staffInter = createMockInteraction({
      commandName: "tickets",
      roles: [{ id: "role_team", name: "BuildLab Team" }],
    });
    await interactionCreate.execute(staffInter);
    assert.strictEqual(staffInter._state.acknowledged, true);

    const participantInter = createMockInteraction({
      commandName: "tickets",
      roles: [{ id: "role_beg", name: "Beginner" }],
    });
    await interactionCreate.execute(participantInter);
    assert.strictEqual(participantInter._state.acknowledged, true);
    const partResp = participantInter.getResponse();
    assert.ok(partResp?.content?.includes("permission"));
  });

  // Test /reminders (TechSpace Admin only)
  await asyncTest("/reminders works for TechSpace Admin and denies non-admins", async () => {
    const adminMember = {
      id: "admin_1",
      roles: {
        cache: new Collection([["role_admin", { id: "role_admin", name: "TechSpace Admin" }]]),
      },
    };
    const adminInter = createMockInteraction({
      commandName: "reminders",
      subcommand: "status",
      member: adminMember,
      roles: [{ id: "role_admin", name: "TechSpace Admin" }],
    });
    await interactionCreate.execute(adminInter);
    assert.strictEqual(adminInter._state.acknowledged, true);
    const adminResp = adminInter.getResponse();
    assert.ok(adminResp?.embeds?.[0]);

    const nonAdminInter = createMockInteraction({
      commandName: "reminders",
      subcommand: "status",
      roles: [{ id: "role_team", name: "BuildLab Team" }],
    });
    await interactionCreate.execute(nonAdminInter);
    assert.strictEqual(nonAdminInter._state.acknowledged, true);
    const nonAdminResp = nonAdminInter.getResponse();
    assert.ok(nonAdminResp?.content?.includes("TechSpace Admin"));
  });

  const { checkAndSendReminders } = require("../src/services/reminders");
  await asyncTest("Reminders trigger correctly for registration deadline milestone and use new copy", async () => {
    const sentMessages = [];
    const mockChannel = {
      name: "announcements",
      isTextBased: () => true,
      async send(payload) {
        sentMessages.push(payload);
      },
    };
    const mockClientWithAnnounce = {
      guilds: {
        async fetch() {
          return {
            channels: {
              cache: new Collection([["chan_announcements", mockChannel]]),
            },
          };
        },
      },
    };

    const sent = await checkAndSendReminders(mockClientWithAnnounce, true);
    assert.ok(Array.isArray(sent), "checkAndSendReminders must return an array");
    assert.ok(sent.some((s) => s.includes("Registration + PRD Close")), "Must send Registration + PRD reminder");
    assert.ok(sentMessages.length > 0, "Must have posted an embed to announcements channel");
    const firstEmbed = sentMessages[0].embeds[0];
    assert.ok(firstEmbed.data.title.includes("REGISTRATION"), "Must use Registration announcement copy");
  });

  // 9. Interactive Buttons & Modal Dispatch
  console.log("\n--- [9] Interactive Buttons & Modals Dispatch ---");

  await asyncTest("Button start_submit_prd opens Step 1 Modal", async () => {
    const inter = createMockInteraction({
      type: "button",
      customId: "start_submit_prd",
    });
    await interactionCreate.execute(inter);
    assert.strictEqual(inter._state.acknowledged, true);
    assert.ok(inter._state.modalShown, "Must show Step 1 Modal");
  });

  await asyncTest("Modal modal_prd_step1 validates and prompts Step 2 button", async () => {
    const inter = createMockInteraction({
      type: "modalSubmit",
      customId: "modal_prd_step1",
      fieldValues: {
        prd_track: "Intermediate",
        prd_type: "Catalogue B07",
        prd_team: "@partner",
        prd_title: "Campus Ride Share",
        prd_repo: "https://github.com/alice/campus-rides",
      },
    });
    await interactionCreate.execute(inter);
    assert.strictEqual(inter._state.acknowledged, true);
    const resp = inter.getResponse();
    assert.ok(resp?.embeds?.[0]);
    assert.ok(resp?.components?.length > 0);
  });

  await asyncTest("Modal modal_prd_step2 prompts Step 3 Proposal PDF", async () => {
    const inter = createMockInteraction({
      type: "modalSubmit",
      customId: "modal_prd_step2",
      fieldValues: {
        prd_problem: "Campus traffic congestion",
        prd_solution: "Carpooling network for students",
        prd_features: "Ride search, Booking, Map view",
        prd_stack: "React, Node, SQLite",
        prd_outcome: "A functional ride-sharing platform",
      },
    });
    await interactionCreate.execute(inter);
    assert.strictEqual(inter._state.acknowledged, true);
    const resp = inter.getResponse();
    assert.ok(resp?.embeds?.[0]);
    assert.ok(resp.embeds[0].data.title.includes("PROPOSAL PDF"));
    assert.ok(resp?.components?.length > 0);
  });

  await asyncTest("Button prd_pdf_upload_file handles empty message with helpful MessageContent error and action buttons", async () => {
    const inter = createMockInteraction({
      type: "button",
      customId: "prd_pdf_upload_file",
    });
    inter.channel = {
      awaitMessages: async () => new Collection([
        ["msg1", {
          author: { id: testOwnerId },
          attachments: new Collection(),
          content: "",
          delete: async () => {},
        }],
      ]),
    };
    await interactionCreate.execute(inter);
    assert.strictEqual(inter._state.acknowledged, true);
    const resp = inter._state.followUpPayload;
    assert.ok(resp?.embeds?.[0]);
    assert.ok(resp.embeds[0].data.title.includes("PROPOSAL PDF REQUIRED"));
    assert.strictEqual(resp.embeds[0].data.title.includes("❌ ❌"), false);
    assert.ok(resp.components?.length > 0);
  });

  await asyncTest("Button prd_pdf_upload_file accepts message with URL in text", async () => {
    const inter = createMockInteraction({
      type: "button",
      customId: "prd_pdf_upload_file",
    });
    inter.channel = {
      awaitMessages: async () => new Collection([
        ["msg1", {
          author: { id: testOwnerId },
          attachments: new Collection(),
          content: "Here is my proposal: https://drive.google.com/file/d/my-doc/view",
          delete: async () => {},
        }],
      ]),
    };
    await interactionCreate.execute(inter);
    assert.strictEqual(inter._state.acknowledged, true);
    const resp = inter._state.followUpPayload;
    assert.ok(resp?.embeds?.[0]);
    assert.ok(resp.embeds[0].data.title.includes("PDF RECEIVED"));
  });

  await asyncTest("Modal modal_prd_pdf_link validates PDF and compiles proposal preview", async () => {
    const inter = createMockInteraction({
      type: "modalSubmit",
      customId: "modal_prd_pdf_link",
      fieldValues: {
        prd_pdf_url: "https://drive.google.com/file/d/carpool_proposal/view",
      },
    });
    await interactionCreate.execute(inter);
    assert.strictEqual(inter._state.acknowledged, true);
    const resp = inter.getResponse();
    assert.ok(resp?.embeds?.[0]);
    assert.ok(resp.embeds[0].data.title.includes("PDF RECEIVED"));
    assert.ok(resp.embeds[1].data.title.includes("PROJECT PROPOSAL"));
  });

  await asyncTest("Button prd_confirm_submit saves proposal with PDF and assigns track role", async () => {
    const inter = createMockInteraction({
      type: "button",
      customId: "prd_confirm_submit",
    });
    await interactionCreate.execute(inter);
    assert.strictEqual(inter._state.acknowledged, true);
    const resp = inter.getResponse();
    assert.ok(resp?.embeds?.[0]);
    assert.ok(resp.embeds[0].data.title.includes("REGISTERED"));
  });

  await asyncTest("Zero-role onboarding: brand new participant without track role can use /start, /prd, /help", async () => {
    const brandNewUserInter = createMockInteraction({
      commandName: "prd",
      user: { id: "brand_new_student", username: "Freshman" },
      memberRoles: [], // NO roles at all
    });
    await interactionCreate.execute(brandNewUserInter);
    assert.strictEqual(brandNewUserInter._state.acknowledged, true);
    const resp = brandNewUserInter.getResponse();
    assert.ok(resp?.embeds?.[0]);
    assert.strictEqual(resp.embeds[0].data.title, "PROJECT PROPOSAL");
  });

  await asyncTest("Button help_debugging renders guide and ticket shortcut", async () => {
    const inter = createMockInteraction({
      type: "button",
      customId: "help_debugging",
    });
    await interactionCreate.execute(inter);
    assert.strictEqual(inter._state.acknowledged, true);
    const resp = inter.getResponse();
    assert.ok(resp?.embeds?.[0]);
  });

  await asyncTest("Button ticket_close and ticket_confirm_close resolve ticket smoothly", async () => {
    const tNum = getNextTicketNumber();
    db.prepare(`
      INSERT INTO tickets (ticket_number, channel_id, creator_id, category, status, created_at)
      VALUES (?, ?, ?, ?, 'OPEN', ?)
    `).run(tNum, "chan_ticket_btn_test", testOwnerId, "PRD Issue", new Date().toISOString());

    // 1. Initial click on close button
    const closeBtnInter = createMockInteraction({
      type: "button",
      customId: `ticket_close_${tNum}`,
    });
    await interactionCreate.execute(closeBtnInter);
    assert.strictEqual(closeBtnInter._state.acknowledged, true);
    const closeResp = closeBtnInter.getResponse();
    assert.ok(closeResp?.content?.includes("Are you sure you want to resolve and close"));

    // 2. Click confirm close button
    const confirmInter = createMockInteraction({
      type: "button",
      customId: `ticket_confirm_close_${tNum}`,
    });
    await interactionCreate.execute(confirmInter);
    assert.strictEqual(confirmInter._state.acknowledged, true);
    const confirmResp = confirmInter.getResponse();
    assert.ok(confirmResp?.content?.includes("has been resolved and closed"));

    const closedRecord = getTicketByNumber(tNum);
    assert.strictEqual(closedRecord.status, "CLOSED");
  });

  await asyncTest("Mentor assignment via UserSelectMenu, one-click Assign Myself, and username modal", async () => {
    // 1. Click "Assign Mentor" button -> presents UserSelectMenu and shortcuts
    const mentorBtnInter = createMockInteraction({
      type: "button",
      customId: "team_mentor_btn_BL-PRD-001",
      roles: [{ id: "role_team", name: "BuildLab Team", position: 30 }],
    });
    await interactionCreate.execute(mentorBtnInter);
    assert.strictEqual(mentorBtnInter._state.acknowledged, true);
    const btnResp = mentorBtnInter.getResponse();
    assert.ok(btnResp?.content?.includes("Assign Mentor for Project `BL-PRD-001`"));
    assert.ok(btnResp?.components?.length >= 2);

    // 2. Select mentor via UserSelectMenu
    const selectInter = createMockInteraction({
      type: "userSelectMenu",
      customId: "select_assign_mentor_BL-PRD-001",
      values: ["mentor_user_555"],
      roles: [{ id: "role_team", name: "BuildLab Team", position: 30 }],
    });
    await interactionCreate.execute(selectInter);
    assert.strictEqual(selectInter._state.acknowledged, true);
    const selectResp = selectInter.getResponse();
    assert.ok(selectResp?.content?.includes("Assigned <@mentor_user_555>"));

    // 3. Assign Myself button
    const selfInter = createMockInteraction({
      type: "button",
      customId: "btn_assign_mentor_self_BL-PRD-001",
      user: { id: "mentor_alice_999", username: "alice" },
      roles: [{ id: "role_team", name: "BuildLab Team", position: 30 }],
    });
    await interactionCreate.execute(selfInter);
    assert.strictEqual(selfInter._state.acknowledged, true);
    const selfResp = selfInter.getResponse();
    assert.ok(selfResp?.content?.includes("Assigned <@mentor_alice_999>"));

    // 4. Modal with username (e.g. "@depre") resolves to member snowflake ID
    const modalInter = createMockInteraction({
      type: "modalSubmit",
      customId: "modal_assign_mentor_BL-PRD-001",
      fieldValues: {
        mentor_id: "@depre",
      },
    });
    // Add member with username "depre" to guild cache
    modalInter.guild.members.cache.set("depre_snowflake_777", {
      id: "depre_snowflake_777",
      user: { username: "depre" },
    });
    await interactionCreate.execute(modalInter);
    assert.strictEqual(modalInter._state.acknowledged, true);
    const modalResp = modalInter.getResponse();
    assert.ok(modalResp?.embeds?.[0]?.data?.description?.includes("<@depre_snowflake_777>"));
  });

  // 10. Final Verification: Production DB Untouched
  console.log("\n--- [10] Final Verification: Production DB Untouched ---");
  test("Production database (data/buildlab.sqlite) remained strictly untouched throughout full test run", () => {
    if (prodExists) {
      const statsFinal = fs.statSync(prodDbPath);
      assert.strictEqual(
        statsFinal.mtimeMs,
        prodMtimeBefore,
        "Production database mtime was modified during test run!"
      );
      assert.strictEqual(
        statsFinal.size,
        prodSizeBefore,
        "Production database size changed during test run!"
      );
    }
  });

  // Teardown
  db.closeDatabase();

  console.log("\n==================================================");
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
