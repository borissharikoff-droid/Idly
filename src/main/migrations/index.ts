import type Database from 'better-sqlite3'

/**
 * Numbered migrations. Each entry is [name, sql].
 * Add new migrations at the end — never edit or reorder existing ones.
 */
const MIGRATIONS: [string, string][] = [
  ['001_initial', `
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      start_time INTEGER NOT NULL,
      end_time INTEGER NOT NULL,
      duration_seconds INTEGER NOT NULL,
      summary TEXT
    );
    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      app_name TEXT,
      window_title TEXT,
      category TEXT,
      start_time INTEGER NOT NULL,
      end_time INTEGER NOT NULL,
      keystrokes INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );
    CREATE INDEX IF NOT EXISTS idx_activities_session ON activities(session_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_start ON sessions(start_time);
    CREATE TABLE IF NOT EXISTS session_analysis (
      session_id TEXT PRIMARY KEY,
      analysis_text TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );
    CREATE TABLE IF NOT EXISTS local_stats (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS achievements_unlocked (
      achievement_id TEXT PRIMARY KEY,
      unlocked_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS skill_xp (
      skill_id TEXT PRIMARY KEY,
      total_xp INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
  `],

  ['002_goals', `
    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      target_seconds INTEGER NOT NULL,
      target_category TEXT,
      period TEXT NOT NULL,
      start_date TEXT NOT NULL,
      completed_at INTEGER
    );
  `],

  ['003_skill_xp_log', `
    CREATE TABLE IF NOT EXISTS skill_xp_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      skill_id TEXT NOT NULL,
      xp_delta INTEGER NOT NULL,
      recorded_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_skill_xp_log_skill ON skill_xp_log(skill_id, recorded_at);
  `],

  ['004_grind_tasks', `
    CREATE TABLE IF NOT EXISTS grind_tasks (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
  `],

  ['005_session_checkpoint', `
    CREATE TABLE IF NOT EXISTS session_checkpoint (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      start_time INTEGER NOT NULL,
      elapsed_seconds INTEGER NOT NULL,
      paused_accumulated INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
  `],
  ['006_checkpoint_skill_xp', `
    ALTER TABLE session_checkpoint ADD COLUMN session_skill_xp TEXT;
  `],
  ['007_skill_prestige', `
    ALTER TABLE skill_xp ADD COLUMN prestige_count INTEGER NOT NULL DEFAULT 0;
  `],
]

/**
 * Run all pending migrations in order.
 * Tracks applied migrations in a `schema_migrations` table.
 */
export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at INTEGER NOT NULL
    )
  `)

  const applied = new Set(
    (db.prepare('SELECT name FROM schema_migrations').all() as { name: string }[])
      .map((r) => r.name)
  )

  for (const [name, sql] of MIGRATIONS) {
    if (applied.has(name)) continue
    db.exec(sql)
    db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(name, Date.now())
  }

  // Legacy migration: add keystrokes column if missing (for databases created before migration system)
  try {
    const cols = db.pragma('table_info(activities)') as { name: string }[]
    if (!cols.find((c) => c.name === 'keystrokes')) {
      db.exec('ALTER TABLE activities ADD COLUMN keystrokes INTEGER NOT NULL DEFAULT 0')
    }
  } catch { /* ignore */ }
}
