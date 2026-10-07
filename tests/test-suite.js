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
  assignMentor,
  setMentorStatus,
  validateTeamSize,
  validateRepoUrl,
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
const {
  assignTrackRole,
  findTrackRole,
  validateGuildTrackRoles,
} = require("../src/services/roles");
const interactionCreate = require("../src/events/interactionCreate");

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
  test("Beginner track accepts solo (1 member)", () => {
    const res = validateTeamSize("Beginner", "Solo", { username: "alice" });
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.count, 1);
  });

  test("Beginner track rejects multiple members", () => {
    const res = validateTeamSize("Beginner", "@bob", { username: "alice" });
    assert.strictEqual(res.valid, false);
    assert.ok(res.error.includes("Solo"));
  });

  test("Intermediate track accepts duo (exactly 2 members)", () => {
    const res = validateTeamSize("Intermediate", "@partner", { username: "alice" });
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.count, 2);
  });

  test("Intermediate track rejects solo (1 member) or squad (3+ members)", () => {
    const resSolo = validateTeamSize("Intermediate", "Solo", { username: "alice" });
    assert.strictEqual(resSolo.valid, false);

    const resTrio = validateTeamSize("Intermediate", "@bob, @charlie", { username: "alice" });
    assert.strictEqual(resTrio.valid, false);
  });

  test("Advanced track accepts squad (3 to 4 members)", () => {
    const res3 = validateTeamSize("Advanced", "@bob, @charlie", { username: "alice" });
    assert.strictEqual(res3.valid, true);
    assert.strictEqual(res3.count, 3);

    const res4 = validateTeamSize("Advanced", "@bob, @charlie, @dave", { username: "alice" });
    assert.strictEqual(res4.valid, true);
    assert.strictEqual(res4.count, 4);
  });

  test("Advanced track rejects invalid squad size (<3 or >4 members)", () => {
    const res2 = validateTeamSize("Advanced", "@bob", { username: "alice" });
    assert.strictEqual(res2.valid, false);

    const res5 = validateTeamSize("Advanced", "@b, @c, @d, @e", { username: "alice" });
    assert.strictEqual(res5.valid, false);
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

  // 5. PRD Submission, Idempotence & GitHub Association
  console.log("\n--- [5] PRD Submission & Project Lifecycle ---");
  const testOwnerId = "user_participant_alice";
  let testProjectId = null;

  test("submitPrd creates project proposal and links GitHub repository automatically", () => {
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
    });

    assert.ok(prd);
    assert.ok(prd.id.startsWith("BL-PRD-"));
    assert.strictEqual(prd.title, "Campus Lost & Found");
    assert.strictEqual(prd.track, "Beginner");
    assert.strictEqual(prd.repo_url, "https://github.com/alice/campus-lost-found");
    assert.strictEqual(prd.status, "Pending");
    assert.strictEqual(prd.problem_statement_id, "B01");
    testProjectId = prd.id;
  });

  test("Submitting PRD again updates existing project without creating duplicates", () => {
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

    const totalProjects = db.prepare("SELECT COUNT(*) as count FROM projects").get().count;
    assert.strictEqual(totalProjects, 1, "Must not create duplicate rows");
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
      isChatInputCommand: () => overrides.type !== "button" && overrides.type !== "modalSubmit" && overrides.type !== "selectMenu",
      isButton: () => overrides.type === "button",
      isStringSelectMenu: () => overrides.type === "selectMenu",
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
    assert.ok(resp.embeds[0].data.title.includes("SETUP"));
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

  await asyncTest("Modal modal_prd_step2 compiles proposal preview", async () => {
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
    assert.ok(resp.embeds[0].data.title.includes("PREVIEW"));
  });

  await asyncTest("Button prd_confirm_submit saves proposal and assigns track role", async () => {
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
