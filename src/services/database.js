const { DatabaseSync } = require("node:sqlite");
const path = require("node:path");
const fs = require("node:fs");
const config = require("../config/config");

let activeDb = null;
let activeDbPath = null;

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT,
    track TEXT,
    joined_at TEXT,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    track TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    team_name TEXT,
    project_type TEXT,
    problem_statement_id TEXT,
    team_members TEXT,
    problem_statement TEXT,
    solution TEXT,
    target_users TEXT,
    core_features TEXT,
    stretch_features TEXT,
    tech_stack TEXT,
    learning_goals TEXT,
    biggest_challenge TEXT,
    final_outcome TEXT,
    milestones TEXT,
    success_criteria TEXT,
    risks_dependencies TEXT,
    status TEXT DEFAULT 'Pending',
    status_reason TEXT,
    mentor_id TEXT,
    repo_url TEXT,
    proposal_pdf_url TEXT,
    stage TEXT DEFAULT 'PLANNING',
    mentor_status TEXT DEFAULT 'Not Assessed',
    mentor_status_note TEXT,
    mentor_status_updated_at TEXT,
    last_activity_at TEXT,
    created_at TEXT,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS milestones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    milestone_index INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'Not Started',
    due_date TEXT,
    completed_at TEXT,
    created_at TEXT,
    updated_at TEXT,
    UNIQUE(project_id, milestone_index)
  );

  CREATE TABLE IF NOT EXISTS mentor_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    mentor_id TEXT NOT NULL,
    status TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS github_stats (
    repo_name TEXT PRIMARY KEY,
    project_id TEXT,
    commits_count INTEGER DEFAULT 0,
    commits_last_7_days INTEGER DEFAULT 0,
    open_prs INTEGER DEFAULT 0,
    merged_prs INTEGER DEFAULT 0,
    open_issues INTEGER DEFAULT 0,
    closed_issues INTEGER DEFAULT 0,
    reviews_count INTEGER DEFAULT 0,
    last_activity_at TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_number INTEGER UNIQUE NOT NULL,
    channel_id TEXT UNIQUE NOT NULL,
    creator_id TEXT NOT NULL,
    category TEXT NOT NULL,
    status TEXT DEFAULT 'OPEN',
    claimed_by TEXT,
    created_at TEXT NOT NULL,
    claimed_at TEXT,
    first_response_at TEXT,
    closed_at TEXT,
    closed_by TEXT,
    resolution TEXT
  );

  CREATE TABLE IF NOT EXISTS reminder_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_key TEXT NOT NULL,
    milestone TEXT NOT NULL,
    sent_at TEXT NOT NULL,
    UNIQUE(event_key, milestone)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

/**
 * Initializes schema and pragmas on a given DatabaseSync instance
 * @param {DatabaseSync} dbInstance 
 * @param {boolean} isMemory 
 */
function applySchemaAndMigrations(dbInstance, isMemory = false) {
  if (!isMemory) {
    dbInstance.exec("PRAGMA journal_mode = WAL;");
  }
  dbInstance.exec("PRAGMA foreign_keys = ON;");
  dbInstance.exec(SCHEMA_SQL);

  // Column migrations for projects table
  const tableInfo = dbInstance.prepare("PRAGMA table_info(projects)").all();
  const existingColumns = new Set(tableInfo.map((col) => col.name));

  const newColumns = [
    { name: "stage", type: "TEXT DEFAULT 'PLANNING'" },
    { name: "mentor_status", type: "TEXT DEFAULT 'Not Assessed'" },
    { name: "mentor_status_note", type: "TEXT" },
    { name: "mentor_status_updated_at", type: "TEXT" },
    { name: "last_activity_at", type: "TEXT" },
    { name: "team_name", type: "TEXT" },
    { name: "project_type", type: "TEXT" },
    { name: "problem_statement_id", type: "TEXT" },
    { name: "solution", type: "TEXT" },
    { name: "learning_goals", type: "TEXT" },
    { name: "biggest_challenge", type: "TEXT" },
    { name: "final_outcome", type: "TEXT" },
    { name: "proposal_pdf_url", type: "TEXT" },
  ];

  for (const col of newColumns) {
    if (!existingColumns.has(col.name)) {
      try {
        dbInstance.exec(`ALTER TABLE projects ADD COLUMN ${col.name} ${col.type};`);
      } catch {
        // Ignore if already added
      }
    }
  }

  // Set default settings if not exists
  const checkReminderSetting = dbInstance
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get("reminders_enabled");
  if (!checkReminderSetting) {
    dbInstance
      .prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
      .run("reminders_enabled", "true");
  }
}

/**
 * Initialize or connect to a database
 * @param {string} [customPath] Path to sqlite file or ':memory:'
 * @returns {DatabaseSync}
 */
function initDatabase(customPath = null) {
  if (activeDb) {
    // If already active with the same path, return it
    if (!customPath || customPath === activeDbPath) {
      return activeDb;
    }
    // Close previous if switching path
    closeDatabase();
  }

  const targetPath =
    customPath || process.env.DATABASE_PATH || config.databasePath || "data/buildlab.sqlite";
  const isMemory = targetPath === ":memory:";

  if (!isMemory) {
    const resolved = path.resolve(targetPath);
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    activeDb = new DatabaseSync(resolved);
    activeDbPath = resolved;
  } else {
    activeDb = new DatabaseSync(":memory:");
    activeDbPath = ":memory:";
  }

  applySchemaAndMigrations(activeDb, isMemory);
  return activeDb;
}

/**
 * Get active database instance, initializing if not present
 * @returns {DatabaseSync}
 */
function getDatabase() {
  if (!activeDb) {
    return initDatabase();
  }
  return activeDb;
}

/**
 * Explicitly inject or switch to a database instance
 * @param {DatabaseSync} dbInstance 
 * @param {string} [label]
 */
function setDatabase(dbInstance, label = "custom") {
  if (activeDb && activeDb !== dbInstance) {
    closeDatabase();
  }
  activeDb = dbInstance;
  activeDbPath = label;
  applySchemaAndMigrations(activeDb, label === ":memory:");
}

/**
 * Close active database connection cleanly
 */
function closeDatabase() {
  if (activeDb) {
    try {
      activeDb.close();
    } catch {
      // Ignore if already closed
    }
    activeDb = null;
    activeDbPath = null;
  }
}

/**
 * Cleans all tables in the active database (useful for resetting)
 */
function cleanTables() {
  const db = getDatabase();
  db.exec(`
    DELETE FROM users;
    DELETE FROM projects;
    DELETE FROM milestones;
    DELETE FROM mentor_reviews;
    DELETE FROM github_stats;
    DELETE FROM tickets;
    DELETE FROM reminder_logs;
    DELETE FROM settings;
    INSERT INTO settings (key, value) VALUES ('reminders_enabled', 'true');
  `);
}

/**
 * Transparent proxy allowing `db.prepare`, `db.exec`, etc. to route to the active database
 */
const dbProxy = new Proxy(
  {},
  {
    get(target, prop) {
      // Expose management methods directly on the proxy
      if (prop === "initDatabase") return initDatabase;
      if (prop === "getDatabase") return getDatabase;
      if (prop === "setDatabase") return setDatabase;
      if (prop === "closeDatabase") return closeDatabase;
      if (prop === "cleanTables") return cleanTables;
      if (prop === "activeDbPath") return activeDbPath;

      const currentDb = getDatabase();
      const val = currentDb[prop];
      if (typeof val === "function") {
        return val.bind(currentDb);
      }
      return val;
    },
  }
);

module.exports = dbProxy;
