// Ensure isolated in-memory test database is set BEFORE any modules load
process.env.DATABASE_PATH = ":memory:";

const assert = require("node:assert");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const db = require("../src/services/database");
// Explicitly initialize in-memory database
db.initDatabase(":memory:");

const {
  submitPrd,
  getPrdById,
  getPrdByOwnerId,
  updatePrdStatus,
  assignMentor,
  setMentorStatus,
} = require("../src/services/prd");
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
  listTickets,
  getParticipantTickets,
} = require("../src/services/tickets");
const {
  isTechSpaceAdmin,
  isBuildLabTeam,
  getMemberTrack,
} = require("../src/utils/permissions");
const interactionCreate = require("../src/events/interactionCreate");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(`   ${err.message}`);
    failed++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(`   ${err.message}`);
    failed++;
  }
}

async function runTests() {
  console.log("\n==================================================");
  console.log("🛠️ RUNNING BUILDLAB ISOLATED TEST SUITE");
  console.log("==================================================\n");

  const prodDbPath = path.resolve("data/buildlab.sqlite");
  const prodExists = fs.existsSync(prodDbPath);
  let prodMtimeBefore = null;
  let prodSizeBefore = null;
  if (prodExists) {
    const stats = fs.statSync(prodDbPath);
    prodMtimeBefore = stats.mtimeMs;
    prodSizeBefore = stats.size;
  }

  // 1. Database Architecture & Isolation
  console.log("--- [1] Database Isolation & Injection ---");
  test("Active test database is isolated :memory: database", () => {
    assert.strictEqual(db.activeDbPath, ":memory:");
  });

  test("Database layer supports custom file-based injection (tests/test.sqlite)", () => {
    const testFileDbPath = path.resolve("tests/test.sqlite");
    if (fs.existsSync(testFileDbPath)) {
      fs.unlinkSync(testFileDbPath);
    }

    // Switch to file-based test db
    db.initDatabase(testFileDbPath);
    assert.strictEqual(db.activeDbPath, testFileDbPath);

    // Write a sample test record in test db
    db.prepare("INSERT INTO users (id, username, track) VALUES (?, ?, ?)").run("file_user_1", "FileUser", "Beginner");
    const userRow = db.prepare("SELECT * FROM users WHERE id = ?").get("file_user_1");
    assert.strictEqual(userRow.username, "FileUser");

    // Close and clean up file test database
    db.closeDatabase();
    if (fs.existsSync(testFileDbPath)) {
      fs.unlinkSync(testFileDbPath);
    }
    // Also remove WAL / SHM files if created
    if (fs.existsSync(`${testFileDbPath}-wal`)) fs.unlinkSync(`${testFileDbPath}-wal`);
    if (fs.existsSync(`${testFileDbPath}-shm`)) fs.unlinkSync(`${testFileDbPath}-shm`);

    // Restore :memory: database for remaining test suite
    db.initDatabase(":memory:");
    assert.strictEqual(db.activeDbPath, ":memory:");
  });

  // 2. Roles & Multi-User Privacy Matrix
  console.log("\n--- [2] Role-Based Access & Privacy Matrix ---");
  const participantA = { id: "user_participant_a", user: { username: "Alice" }, roles: { cache: [{ name: "Beginner" }] } };
  const participantB = { id: "user_participant_b", user: { username: "Bob" }, roles: { cache: [{ name: "Beginner" }] } };
  const mentorUser = { id: "user_mentor_harsh", user: { username: "Harsh" }, roles: { cache: [{ name: "BuildLab Team" }] } };
  const teamMember = { id: "user_team_coord", user: { username: "Coordinator" }, roles: { cache: [{ name: "BuildLab Team" }] } };
  const adminUser = { id: "user_admin_techspace", user: { username: "TechSpaceAdmin" }, roles: { cache: [{ name: "TechSpace Admin" }] } };

  const testProjectA = {
    id: "BL-PRD-010",
    title: "Campus AI Assistant",
    owner_id: "user_participant_a",
    team_members: "@Alice, @PartnerAlex",
    mentor_id: "user_mentor_harsh",
  };

  test("Participant A can view own project", () => {
    assert.strictEqual(canUserViewProject(participantA, testProjectA), true);
  });

  test("Participant B CANNOT view Participant A's private project", () => {
    assert.strictEqual(canUserViewProject(participantB, testProjectA), false);
  });

  test("Assigned Mentor can view project", () => {
    assert.strictEqual(canUserViewProject(mentorUser, testProjectA), true);
  });

  test("BuildLab Team member can view project", () => {
    assert.strictEqual(canUserViewProject(teamMember, testProjectA), true);
  });

  test("TechSpace Admin can view project", () => {
    assert.strictEqual(canUserViewProject(adminUser, testProjectA), true);
  });

  // 3. PRD Milestones & Progress Calculation
  console.log("\n--- [3] PRD Milestones & Real Progress ---");
  let testProjectId = "BL-PRD-020";

  test("submitPrd automatically initializes trackable milestones", () => {
    const prd = submitPrd({
      title: "Campus Smart Ride",
      track: "Intermediate",
      owner_id: "owner_rider_1",
      team_members: "@Rider1, @Rider2",
      milestones: "1. Setup & DB Schema\n2. User Authentication\n3. Ride Booking Core\n4. Map Routing\n5. Final UI & Demo",
    });
    testProjectId = prd.id;

    const milestones = getProjectMilestones(testProjectId);
    assert.strictEqual(milestones.length, 5);
    assert.strictEqual(milestones[0].title, "Setup & DB Schema");
    assert.strictEqual(milestones[0].status, "Not Started");
  });

  test("calculateProjectProgress accurately reflects completed milestones (not commits)", () => {
    let progress = calculateProjectProgress(testProjectId);
    assert.strictEqual(progress.percentage, 0);
    assert.strictEqual(progress.completed, 0);

    // Complete milestone 1 and 2
    updateMilestoneStatus(testProjectId, 1, "Completed");
    updateMilestoneStatus(testProjectId, 2, "Completed");

    // 2 of 5 completed -> 40%
    progress = calculateProjectProgress(testProjectId);
    assert.strictEqual(progress.completed, 2);
    assert.strictEqual(progress.percentage, 40);
    assert.ok(progress.progressBar.includes("40%"));

    // Complete remaining
    updateMilestoneStatus(testProjectId, 3, "Completed");
    updateMilestoneStatus(testProjectId, 4, "Completed");
    updateMilestoneStatus(testProjectId, 5, "Completed");

    progress = calculateProjectProgress(testProjectId);
    assert.strictEqual(progress.percentage, 100);
  });

  test("generateProgressBar renders visual blocks", () => {
    const bar = generateProgressBar(60, 10);
    assert.strictEqual(bar, "██████░░░░ 60%");
  });

  // 4. Human Assessment: Mentor Status
  console.log("\n--- [4] Human Assessment (Mentor Status) ---");
  test("setMentorStatus updates project status and records review log", () => {
    setMentorStatus(
      testProjectId,
      mentorUser.id,
      "Needs Attention",
      "API backend latency needs optimization before demo"
    );

    const project = getPrdById(testProjectId);
    assert.strictEqual(project.mentor_status, "Needs Attention");
    assert.strictEqual(project.mentor_status_note, "API backend latency needs optimization before demo");

    const reviewRow = db
      .prepare("SELECT * FROM mentor_reviews WHERE project_id = ? ORDER BY id DESC LIMIT 1")
      .get(testProjectId);
    assert.strictEqual(reviewRow.status, "Needs Attention");
    assert.strictEqual(reviewRow.mentor_id, mentorUser.id);
  });

  // 5. GitHub Activity & Signals
  console.log("\n--- [5] GitHub Activity Health & Attention Signals ---");
  test("calculateActivityHealth respects configurable thresholds", () => {
    const active = calculateActivityHealth(new Date().toISOString());
    assert.strictEqual(active.status, "Active");

    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const low = calculateActivityHealth(threeDaysAgo);
    assert.strictEqual(low.status, "Low Activity");

    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const noRecent = calculateActivityHealth(tenDaysAgo);
    assert.strictEqual(noRecent.status, "No Recent Activity");
  });

  test("connectProjectRepo links repository and tracks webhook activity", () => {
    connectProjectRepo(testProjectId, "techspace-srm/campus-smart-ride");
    const project = getPrdById(testProjectId);
    assert.ok(project.repo_url.includes("campus-smart-ride"));

    recordRepoActivity("techspace-srm/campus-smart-ride", "push", { commits: [1, 2, 3] });
    const stats = getRepoStats("techspace-srm/campus-smart-ride");
    assert.ok(stats.commits_count >= 3);
  });

  test("getProjectSignals flags inactivity warning without corrupting completion %", () => {
    const mockInactiveProject = {
      id: "MOCK-1",
      last_activity_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
      repo_url: "https://github.com/techspace-srm/mock-app",
      stage: "DEVELOPMENT",
    };
    const signals = getProjectSignals(mockInactiveProject);
    assert.ok(signals.some((s) => s.includes("No repository activity for 6 days")));
  });

  // 6. Support Ticket Lifecycle
  console.log("\n--- [6] BuildLab Support Ticket System ---");
  let testTicketNumber = 0;

  test("getNextTicketNumber increments sequentially in memory", () => {
    testTicketNumber = getNextTicketNumber();
    assert.ok(testTicketNumber > 0);
    const formatted = formatTicketNumber(testTicketNumber);
    assert.strictEqual(formatted.length, 4);
  });

  test("ticket creation, claiming, and resolution lifecycle in test database", () => {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO tickets (
        ticket_number, channel_id, creator_id, category, status, created_at
      ) VALUES (?, ?, ?, ?, 'OPEN', ?)
    `).run(testTicketNumber, "chan_ticket_test_123", participantA.id, "Technical Issue", now);

    const userTickets = getParticipantTickets(participantA.id);
    assert.ok(userTickets.some((t) => t.ticket_number === testTicketNumber));

    const claimRes = claimTicket(testTicketNumber, mentorUser);
    assert.strictEqual(claimRes.success, true);
    assert.strictEqual(claimRes.ticket.status, "IN_PROGRESS");
    assert.strictEqual(claimRes.ticket.claimed_by, mentorUser.id);

    const anotherMentor = { id: "another_mentor_99" };
    const doubleClaim = claimTicket(testTicketNumber, anotherMentor);
    assert.strictEqual(doubleClaim.success, false);

    const openTickets = listTickets({ filter: "open" });
    assert.ok(openTickets.some((t) => t.ticket_number === testTicketNumber));
  });

  // 7. Verify Production DB Integrity
  console.log("\n--- [7] Verification: Production DB Untouched ---");
  test("npm test did not modify or touch data/buildlab.sqlite", () => {
    if (prodExists) {
      const statsAfter = fs.statSync(prodDbPath);
      assert.strictEqual(
        statsAfter.mtimeMs,
        prodMtimeBefore,
        "Production database mtime was modified during npm test!"
      );
      assert.strictEqual(
        statsAfter.size,
        prodSizeBefore,
        "Production database size changed during npm test!"
      );
    }
  });

  // 8. Command Registry Integrity
  console.log("\n--- [8] Command Registry Integrity ---");
  const cmdFiles = fs
    .readdirSync(path.join(__dirname, "../src/commands"))
    .filter((f) => f.endsWith(".js"));
  assert.strictEqual(cmdFiles.length, 15, `Expected 15 commands, found ${cmdFiles.length}`);

  for (const file of cmdFiles) {
    const cmd = require(`../src/commands/${file}`);
    assert.ok(cmd.data && typeof cmd.data.toJSON === "function", `${file} invalid command data`);
    assert.strictEqual(typeof cmd.execute, "function", `${file} invalid execute handler`);
  }
  console.log(`  PASS: Verified all ${cmdFiles.length} slash commands`);

  // 9. Status Command Execution & Deferral
  // 9. Status Command Direct Execution & Deferral
  console.log("\n--- [9] Status Command Execution & Deferral ---");
  const statusCmd = require("../src/commands/status");
  let directDeferred = false;
  let directEdited = false;
  let directEmbedReceived = null;

  const mockDirectInteraction = {
    deferred: false,
    replied: false,
    async deferReply() {
      directDeferred = true;
      this.deferred = true;
    },
    async editReply(payload) {
      directEdited = true;
      directEmbedReceived = payload.embeds?.[0];
    },
    async reply(payload) {
      directEmbedReceived = payload.embeds?.[0];
    },
  };

  try {
    await statusCmd.execute(mockDirectInteraction);
    assert.strictEqual(directDeferred, true, "status command MUST deferReply to prevent 3s Discord timeout");
    assert.strictEqual(directEdited, true, "status command MUST editReply when deferred");
    assert.ok(directEmbedReceived, "status command must return an embed");
    console.log("  PASS: /status command defers immediately and renders dashboard embed");
    passed++;
  } catch (err) {
    console.error("❌ FAIL: /status command defers immediately and renders dashboard embed");
    console.error(`   ${err.message}`);
    failed++;
  }

  // 10. Comprehensive Interaction Dispatch & Lifecycle Suite
  console.log("\n--- [10] Comprehensive Interaction Dispatch & Immediate Acknowledgment ---");

  // Build command registry for test client
  const clientCommands = new Map();
  for (const file of cmdFiles) {
    const cmd = require(`../src/commands/${file}`);
    if (cmd.data && cmd.execute) {
      clientCommands.set(cmd.data.name, cmd);
    }
  }

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

    const mockClient = {
      commands: clientCommands,
      guilds: {
        fetch: async () => ({
          channels: {
            cache: {
              find: () => ({ isTextBased: () => true, send: async () => {} }),
              get: () => ({
                setName: async () => {},
                permissionOverwrites: { edit: async () => {} },
                setParent: async () => {},
                send: async () => {},
              }),
            },
            create: async () => ({
              id: "chan_mock_new",
              name: "mock-channel",
              send: async () => {},
              isTextBased: () => true,
            }),
          },
          roles: {
            cache: [
              { id: "role_beginner", name: "Beginner" },
              { id: "role_intermediate", name: "Intermediate" },
              { id: "role_advanced", name: "Advanced" },
              { id: "role_team", name: "BuildLab Team" },
              { id: "role_admin", name: "TechSpace Admin" },
            ],
          },
        }),
      },
    };

    const interaction = {
      id: "test_interaction_" + Math.random().toString(36).substring(7),
      commandName: overrides.commandName || "status",
      customId: overrides.customId || null,
      values: overrides.values || [],
      client: mockClient,
      guild: {
        id: "1554546150273712202",
        roles: {
          everyone: { id: "1554546150273712202" },
          cache: [
            { id: "role_beginner", name: "Beginner" },
            { id: "role_intermediate", name: "Intermediate" },
            { id: "role_advanced", name: "Advanced" },
            { id: "role_team", name: "BuildLab Team" },
            { id: "role_admin", name: "TechSpace Admin" },
          ],
        },
        channels: {
          cache: {
            find: () => ({ isTextBased: () => true, send: async () => {} }),
            get: () => ({
              setName: async () => {},
              permissionOverwrites: { edit: async () => {} },
              setParent: async () => {},
              send: async () => {},
            }),
          },
          create: async () => ({
            id: "chan_mock_new",
            name: "mock-channel",
            send: async () => {},
            isTextBased: () => true,
          }),
        },
      },
      member: overrides.member || {
        id: "user_team_coord",
        user: { id: "user_team_coord", username: "Coordinator" },
        roles: {
          cache: [
            { id: "role_team", name: "BuildLab Team" },
          ],
          remove: async () => {},
          add: async () => {},
        },
      },
      user: overrides.user || {
        id: "user_team_coord",
        username: "Coordinator",
        tag: "Coordinator#0001",
      },
      options: {
        getString: (name) => (overrides.stringOptions ? overrides.stringOptions[name] : null),
        getSubcommand: () => overrides.subcommand || null,
        getUser: (name) => (overrides.userOptions ? overrides.userOptions[name] : null),
        getInteger: (name) => (overrides.integerOptions ? overrides.integerOptions[name] : null),
        getBoolean: (name) => (overrides.booleanOptions ? overrides.booleanOptions[name] : null),
      },
      fields: {
        getTextInputValue: (name) => (overrides.fieldValues ? overrides.fieldValues[name] || "" : ""),
      },
      isChatInputCommand: () => overrides.type ? overrides.type === "chatInput" : true,
      isButton: () => overrides.type === "button",
      isStringSelectMenu: () => overrides.type === "selectMenu",
      isModalSubmit: () => overrides.type === "modalSubmit",
      get deferred() { return state.deferred; },
      set deferred(val) { state.deferred = val; },
      get replied() { return state.replied; },
      set replied(val) { state.replied = val; },
      async deferReply(opts = {}) {
        if (state.deferred || state.replied) throw new Error("Interaction already acknowledged");
        state.deferred = true;
        state.acknowledged = true;
        state.ephemeral = Boolean(opts.ephemeral);
      },
      async reply(payload) {
        if (state.deferred || state.replied) throw new Error("Interaction already acknowledged");
        state.replied = true;
        state.acknowledged = true;
        state.replyPayload = payload;
        state.ephemeral = Boolean(payload?.ephemeral);
      },
      async editReply(payload) {
        if (!state.deferred && !state.replied) throw new Error("Interaction not acknowledged");
        state.editPayload = payload;
        state.acknowledged = true;
      },
      async followUp(payload) {
        if (!state.deferred && !state.replied) throw new Error("Interaction not acknowledged");
        state.followUpPayload = payload;
        state.acknowledged = true;
      },
      async showModal(modal) {
        if (state.deferred || state.replied) throw new Error("Interaction already acknowledged");
        state.acknowledged = true;
        state.modalShown = modal;
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

  // 1. /status via interactionCreate
  await asyncTest("/status acknowledges immediately through interactionCreate", async () => {
    const inter = createMockInteraction({ commandName: "status" });
    await interactionCreate.execute(inter);
    assert.strictEqual(inter._state.acknowledged, true, "/status must acknowledge");
    assert.strictEqual(inter._state.deferred, true, "/status must be deferred");
    assert.ok(inter._state.editPayload?.embeds?.[0], "/status must return dashboard embed in editReply");
  });

  // 2. /ticket via interactionCreate
  await asyncTest("/ticket acknowledges immediately and provides category select menu", async () => {
    const inter = createMockInteraction({ commandName: "ticket" });
    await interactionCreate.execute(inter);
    assert.strictEqual(inter._state.acknowledged, true, "/ticket must acknowledge");
    assert.strictEqual(inter._state.deferred, true, "/ticket must defer ephemeral");
    assert.strictEqual(inter._state.ephemeral, true, "/ticket must be ephemeral");
    assert.ok(inter._state.editPayload?.components?.length > 0, "/ticket must provide components");
  });

  // 3. /help via interactionCreate
  await asyncTest("/help acknowledges immediately with category buttons", async () => {
    const inter = createMockInteraction({ commandName: "help" });
    await interactionCreate.execute(inter);
    assert.strictEqual(inter._state.acknowledged, true, "/help must acknowledge");
    assert.strictEqual(inter._state.deferred, true, "/help must defer");
    assert.ok(inter._state.editPayload?.components?.length > 0, "/help must include action buttons");
  });

  // 4. /track via interactionCreate
  await asyncTest("/track acknowledges immediately with ephemeral and updates track", async () => {
    const inter = createMockInteraction({
      commandName: "track",
      stringOptions: { name: "Intermediate" },
    });
    await interactionCreate.execute(inter);
    assert.strictEqual(inter._state.acknowledged, true, "/track must acknowledge");
    assert.strictEqual(inter._state.deferred, true, "/track must defer");
    assert.strictEqual(inter._state.ephemeral, true, "/track must be ephemeral");
    assert.ok(inter._state.editPayload?.embeds?.length > 0, "/track must return embed");
  });

  // 5. /prd submit via interactionCreate
  await asyncTest("/prd submit displays modal immediately without prior deferral", async () => {
    const inter = createMockInteraction({
      commandName: "prd",
      subcommand: "submit",
    });
    await interactionCreate.execute(inter);
    assert.strictEqual(inter._state.acknowledged, true, "/prd submit must acknowledge");
    assert.strictEqual(inter._state.deferred, false, "/prd submit MUST NOT defer before modal");
    assert.ok(inter._state.modalShown, "/prd submit must display ModalBuilder");
  });

  // 6. /team-status via interactionCreate
  await asyncTest("/team-status acknowledges immediately and renders interactive dashboard", async () => {
    const inter = createMockInteraction({
      commandName: "team-status",
      stringOptions: { query: testProjectId },
    });
    await interactionCreate.execute(inter);
    assert.strictEqual(inter._state.acknowledged, true, "/team-status must acknowledge");
    assert.strictEqual(inter._state.deferred, true, "/team-status must defer");
    assert.ok(inter._state.editPayload?.embeds?.length > 0, "/team-status must return embed");
    assert.ok(inter._state.editPayload?.components?.length > 0, "/team-status must include buttons");
  });

  // 7. /teams via interactionCreate
  await asyncTest("/teams acknowledges immediately with track overview", async () => {
    const inter = createMockInteraction({ commandName: "teams" });
    await interactionCreate.execute(inter);
    assert.strictEqual(inter._state.acknowledged, true, "/teams must acknowledge");
    assert.strictEqual(inter._state.deferred, true, "/teams must defer");
    assert.ok(inter._state.editPayload?.embeds?.length > 0, "/teams must return overview embed");
  });

  // 8. /my-teams via interactionCreate
  await asyncTest("/my-teams acknowledges immediately with mentor projects", async () => {
    const inter = createMockInteraction({
      commandName: "my-teams",
      user: mentorUser,
      member: mentorUser,
    });
    await interactionCreate.execute(inter);
    assert.strictEqual(inter._state.acknowledged, true, "/my-teams must acknowledge");
    assert.strictEqual(inter._state.deferred, true, "/my-teams must defer");
    assert.ok(inter._state.editPayload?.embeds?.length > 0, "/my-teams must return embed");
  });

  // 9. /milestone via interactionCreate
  await asyncTest("/milestone acknowledges immediately and lists milestones", async () => {
    const inter = createMockInteraction({
      commandName: "milestone",
      subcommand: "list",
      stringOptions: { project_id: testProjectId },
    });
    await interactionCreate.execute(inter);
    assert.strictEqual(inter._state.acknowledged, true, "/milestone must acknowledge");
    assert.strictEqual(inter._state.deferred, true, "/milestone must defer");
    assert.ok(inter._state.editPayload?.embeds?.length > 0, "/milestone must return embed");
  });

  // 10. /project via interactionCreate
  await asyncTest("/project connect-repo acknowledges immediately", async () => {
    const inter = createMockInteraction({
      commandName: "project",
      subcommand: "connect-repo",
      stringOptions: { project_id: testProjectId, repository: "techspace-srm/auto-test-repo" },
    });
    await interactionCreate.execute(inter);
    assert.strictEqual(inter._state.acknowledged, true, "/project must acknowledge");
    assert.strictEqual(inter._state.deferred, true, "/project must defer");
    assert.ok(inter._state.editPayload?.embeds?.length > 0, "/project must return embed");
  });

  // 11. /mentor-status via interactionCreate
  await asyncTest("/mentor-status acknowledges immediately and updates assessment", async () => {
    const inter = createMockInteraction({
      commandName: "mentor-status",
      stringOptions: { project_id: testProjectId, status: "on-track", note: "Auto-test verified" },
    });
    await interactionCreate.execute(inter);
    assert.strictEqual(inter._state.acknowledged, true, "/mentor-status must acknowledge");
    assert.strictEqual(inter._state.deferred, true, "/mentor-status must defer");
    assert.ok(inter._state.editPayload?.embeds?.length > 0, "/mentor-status must return embed");
  });

  // 12. /assign-mentor via interactionCreate
  await asyncTest("/assign-mentor acknowledges immediately and assigns mentor", async () => {
    const inter = createMockInteraction({
      commandName: "assign-mentor",
      stringOptions: { project_id: testProjectId },
      userOptions: { mentor: { id: "mentor_assigned_99" } },
    });
    await interactionCreate.execute(inter);
    assert.strictEqual(inter._state.acknowledged, true, "/assign-mentor must acknowledge");
    assert.strictEqual(inter._state.deferred, true, "/assign-mentor must defer");
    assert.ok(inter._state.editPayload?.embeds?.length > 0, "/assign-mentor must return embed");
  });

  // 13. /tickets via interactionCreate
  await asyncTest("/tickets acknowledges immediately with ephemeral queue", async () => {
    const inter = createMockInteraction({ commandName: "tickets" });
    await interactionCreate.execute(inter);
    assert.strictEqual(inter._state.acknowledged, true, "/tickets must acknowledge");
    assert.strictEqual(inter._state.deferred, true, "/tickets must defer");
    assert.strictEqual(inter._state.ephemeral, true, "/tickets must be ephemeral");
    assert.ok(inter._state.editPayload?.embeds?.length > 0, "/tickets must return embed");
  });

  // 14. /my-tickets via interactionCreate
  await asyncTest("/my-tickets acknowledges immediately with ephemeral user list", async () => {
    const inter = createMockInteraction({
      commandName: "my-tickets",
      user: participantA,
      member: participantA,
    });
    await interactionCreate.execute(inter);
    assert.strictEqual(inter._state.acknowledged, true, "/my-tickets must acknowledge");
    assert.strictEqual(inter._state.deferred, true, "/my-tickets must defer");
    assert.strictEqual(inter._state.ephemeral, true, "/my-tickets must be ephemeral");
    assert.ok(inter._state.editPayload?.embeds?.length > 0, "/my-tickets must return embed");
  });

  // 15. /reminders via interactionCreate
  await asyncTest("/reminders status acknowledges immediately with ephemeral status", async () => {
    const inter = createMockInteraction({
      commandName: "reminders",
      subcommand: "status",
    });
    await interactionCreate.execute(inter);
    assert.strictEqual(inter._state.acknowledged, true, "/reminders must acknowledge");
    assert.strictEqual(inter._state.deferred, true, "/reminders must defer");
    assert.strictEqual(inter._state.ephemeral, true, "/reminders must be ephemeral");
    assert.ok(inter._state.editPayload?.embeds?.length > 0, "/reminders must return embed");
  });

  // 16. Invalid Command
  await asyncTest("Invalid command acknowledges immediately with ephemeral error embed", async () => {
    const inter = createMockInteraction({ commandName: "unknown_test_cmd" });
    await interactionCreate.execute(inter);
    assert.strictEqual(inter._state.acknowledged, true, "Unknown command must still be acknowledged");
    assert.strictEqual(inter._state.replied, true, "Must respond to unknown command");
    assert.strictEqual(inter._state.ephemeral, true, "Error must be ephemeral");
    assert.ok(inter._state.replyPayload?.embeds?.[0], "Must return an error embed");
  });

  // 17. Command throws an exception
  await asyncTest("Command throwing exception is caught and acknowledged safely", async () => {
    const crashingCmd = {
      data: { name: "crash-test", toJSON: () => ({ name: "crash-test" }) },
      async execute() {
        throw new Error("Simulated unhandled exception inside command");
      },
    };
    clientCommands.set("crash-test", crashingCmd);

    const inter = createMockInteraction({ commandName: "crash-test" });
    await interactionCreate.execute(inter);
    assert.strictEqual(inter._state.acknowledged, true, "Crashing command must still be acknowledged");
    assert.ok(inter._state.replyPayload?.embeds?.[0], "Must return error embed on crash");
    clientCommands.delete("crash-test");
  });

  // 18. Database failure simulation
  await asyncTest("Command database failure is caught and returns error embed", async () => {
    const dbErrCmd = {
      data: { name: "db-err-test", toJSON: () => ({ name: "db-err-test" }) },
      async execute(interaction) {
        if (!interaction.deferred) await interaction.deferReply();
        throw new Error("SQLITE_BUSY: database is locked");
      },
    };
    clientCommands.set("db-err-test", dbErrCmd);

    const inter = createMockInteraction({ commandName: "db-err-test" });
    await interactionCreate.execute(inter);
    assert.strictEqual(inter._state.acknowledged, true, "DB failure must be acknowledged");
    assert.strictEqual(inter._state.deferred, true, "Was deferred");
    assert.ok(inter._state.editPayload?.embeds?.[0], "Must editReply with error embed");
    clientCommands.delete("db-err-test");
  });

  // 19. Already-deferred interaction
  await asyncTest("Already-deferred interaction safely uses editReply without throwing", async () => {
    const inter = createMockInteraction({
      commandName: "status",
      deferred: true,
    });
    await interactionCreate.execute(inter);
    assert.strictEqual(inter._state.acknowledged, true);
    assert.ok(inter._state.editPayload?.embeds?.[0], "Must edit existing deferred reply");
  });

  // 20. Already-replied interaction
  await asyncTest("Already-replied interaction safely uses followUp without throwing", async () => {
    const inter = createMockInteraction({
      commandName: "status",
      replied: true,
    });
    await interactionCreate.execute(inter);
    assert.strictEqual(inter._state.acknowledged, true);
    assert.ok(inter._state.followUpPayload?.embeds?.[0], "Must send followUp if already replied");
  });

  // 21. Button interaction (help category)
  await asyncTest("Button interaction (help_debugging) acknowledges and renders guide", async () => {
    const inter = createMockInteraction({
      type: "button",
      customId: "help_debugging",
    });
    await interactionCreate.execute(inter);
    assert.strictEqual(inter._state.acknowledged, true, "Button must be acknowledged");
    assert.strictEqual(inter._state.deferred, true, "Button defers ephemeral");
    assert.ok(inter._state.editPayload?.embeds?.[0], "Button returns info embed");
  });

  // 22. Button interaction (ticket claim)
  await asyncTest("Button interaction (ticket_claim_) acknowledges and updates ticket", async () => {
    const inter = createMockInteraction({
      type: "button",
      customId: `ticket_claim_${testTicketNumber}`,
      member: mentorUser,
      user: mentorUser,
    });
    await interactionCreate.execute(inter);
    assert.strictEqual(inter._state.acknowledged, true, "Ticket claim button must be acknowledged");
    assert.ok(inter._state.editPayload?.embeds?.[0] || inter._state.replyPayload?.embeds?.[0]);
  });

  // 23. Modal submission (modal_prd_submit)
  await asyncTest("Modal submission (modal_prd_submit) acknowledges and saves PRD", async () => {
    const inter = createMockInteraction({
      type: "modalSubmit",
      customId: "modal_prd_submit",
      user: participantB,
      member: participantB,
      fieldValues: {
        prd_title: "Campus Smart Scooter",
        prd_team: "Beginner | @bob",
        prd_problem: "Campus transportation difficulty",
        prd_features: "GPS tracking, QR unlock",
        prd_tech: "Node.js, SQLite, React",
      },
    });
    await interactionCreate.execute(inter);
    assert.strictEqual(inter._state.acknowledged, true, "Modal submission must be acknowledged");
    assert.strictEqual(inter._state.deferred, true, "Modal submission defers immediately");
    assert.ok(inter._state.editPayload?.embeds?.[0], "Modal submission returns confirmation embed");

    const savedPrd = getPrdByOwnerId(participantB.id);
    assert.ok(savedPrd, "PRD must be saved to database");
    assert.strictEqual(savedPrd.title, "Campus Smart Scooter");
  });

  // 24. String Select Menu interaction (ticket_select_category)
  await asyncTest("Select menu interaction (ticket_select_category) creates ticket channel", async () => {
    const inter = createMockInteraction({
      type: "selectMenu",
      customId: "ticket_select_category",
      values: ["technical"],
      user: participantA,
    });
    await interactionCreate.execute(inter);
    assert.strictEqual(inter._state.acknowledged, true, "Select menu must be acknowledged");
    assert.strictEqual(inter._state.deferred, true, "Select menu defers ephemeral");
    assert.ok(inter._state.editPayload?.embeds?.[0], "Returns ticket created embed");
  });

  // 25. String Select Menu interaction (select_my_team)
  await asyncTest("Select menu interaction (select_my_team) safely executes without options TypeError", async () => {
    const inter = createMockInteraction({
      type: "selectMenu",
      customId: "select_my_team",
      values: [testProjectId],
      user: mentorUser,
      member: mentorUser,
    });
    await interactionCreate.execute(inter);
    assert.strictEqual(inter._state.acknowledged, true, "select_my_team must be acknowledged");
    assert.ok(inter._state.editPayload?.embeds?.[0] || inter._state.replyPayload?.embeds?.[0]);
  });

  // 26. Final Production DB Integrity Check
  console.log("\n--- [11] Final Verification: Production DB Untouched ---");
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

  // Teardown: close database
  db.closeDatabase();

  console.log("\n==================================================");
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
