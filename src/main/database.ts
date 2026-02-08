import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'

const userDataPath = app.getPath('userData')
const dbPath = path.join(userDataPath, 'grinder.sqlite')

let db: Database.Database | null = null

function getDb(): Database.Database {
  if (!db) {
    db = new Database(dbPath)
    // Enable foreign key enforcement
    db.pragma('foreign_keys = ON')
    db.exec(`
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
      CREATE TABLE IF NOT EXISTS goals (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        target_seconds INTEGER NOT NULL,
        target_category TEXT,
        period TEXT NOT NULL,
        start_date TEXT NOT NULL,
        completed_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS skill_xp_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        skill_id TEXT NOT NULL,
        xp_delta INTEGER NOT NULL,
        recorded_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_skill_xp_log_skill ON skill_xp_log(skill_id, recorded_at);
      CREATE TABLE IF NOT EXISTS session_checkpoint (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        start_time INTEGER NOT NULL,
        elapsed_seconds INTEGER NOT NULL,
        paused_accumulated INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );
    `)
    // Migration: add keystrokes column if missing (for existing databases)
    try {
      const cols = db.pragma('table_info(activities)') as { name: string }[]
      if (!cols.find((c) => c.name === 'keystrokes')) {
        db.exec('ALTER TABLE activities ADD COLUMN keystrokes INTEGER NOT NULL DEFAULT 0')
      }
    } catch { /* ignore */ }
  }
  return db
}

/** Graceful shutdown: close the database connection */
export function closeDatabase(): void {
  if (db) {
    try { db.close() } catch { /* ignore */ }
    db = null
  }
}

/** Format a Date to local YYYY-MM-DD string (timezone-safe). */
function toLocalDateStr(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export interface SessionRow {
  id: string
  start_time: number
  end_time: number
  duration_seconds: number
  summary: string | null
}

export interface ActivityRow {
  id: number
  session_id: string
  app_name: string | null
  window_title: string | null
  category: string | null
  start_time: number
  end_time: number
  keystrokes: number
}

export function getDatabaseApi() {
  const database = getDb()
  return {
    getSessions(limit = 50): SessionRow[] {
      const stmt = database.prepare('SELECT * FROM sessions ORDER BY start_time DESC LIMIT ?')
      return stmt.all(limit) as SessionRow[]
    },
    getSessionById(id: string): SessionRow | undefined {
      const stmt = database.prepare('SELECT * FROM sessions WHERE id = ?')
      return stmt.get(id) as SessionRow | undefined
    },
    getActivitiesBySessionId(sessionId: string): ActivityRow[] {
      const stmt = database.prepare('SELECT * FROM activities WHERE session_id = ? ORDER BY start_time')
      return stmt.all(sessionId) as ActivityRow[]
    },
    saveSession(session: { id: string; startTime: number; endTime: number; durationSeconds: number; summary?: unknown }) {
      const stmt = database.prepare(
        'INSERT OR REPLACE INTO sessions (id, start_time, end_time, duration_seconds, summary) VALUES (?, ?, ?, ?, ?)'
      )
      stmt.run(
        session.id,
        session.startTime,
        session.endTime,
        session.durationSeconds,
        session.summary ? JSON.stringify(session.summary) : null
      )
    },
    saveActivities(sessionId: string, activities: { appName: string; windowTitle: string; category: string; startTime: number; endTime: number; keystrokes?: number }[]) {
      const stmt = database.prepare(
        'INSERT INTO activities (session_id, app_name, window_title, category, start_time, end_time, keystrokes) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      const run = database.transaction(() => {
        for (const a of activities) {
          stmt.run(sessionId, a.appName, a.windowTitle, a.category, a.startTime, a.endTime, a.keystrokes ?? 0)
        }
      })
      run()
    },
    getStreak(): number {
      const sessions = database.prepare(
        'SELECT DISTINCT date(start_time / 1000, \'unixepoch\', \'localtime\') as d FROM sessions ORDER BY d DESC LIMIT 365'
      ).all() as { d: string }[]
      let streak = 0
      for (let i = 0; i < sessions.length; i++) {
        const expected = new Date()
        expected.setDate(expected.getDate() - i)
        // Use local date string instead of UTC toISOString() to match SQL's 'localtime'
        const expectedStr = toLocalDateStr(expected)
        if (sessions[i].d === expectedStr) streak++
        else break
      }
      return streak
    },
    getUserStats(): { totalSessions: number; totalSeconds: number } {
      const row = database.prepare('SELECT COUNT(*) as c, COALESCE(SUM(duration_seconds), 0) as s FROM sessions').get() as { c: number; s: number }
      return { totalSessions: row.c, totalSeconds: row.s }
    },
    getSessionAnalysis(sessionId: string): string | null {
      const row = database.prepare('SELECT analysis_text FROM session_analysis WHERE session_id = ?').get(sessionId) as { analysis_text: string } | undefined
      return row?.analysis_text ?? null
    },
    saveSessionAnalysis(sessionId: string, analysisText: string) {
      database.prepare('INSERT OR REPLACE INTO session_analysis (session_id, analysis_text, created_at) VALUES (?, ?, ?)').run(sessionId, analysisText, Date.now())
    },
    getLocalStat(key: string): string | null {
      const row = database.prepare('SELECT value FROM local_stats WHERE key = ?').get(key) as { value: string } | undefined
      return row?.value ?? null
    },
    setLocalStat(key: string, value: string) {
      database.prepare('INSERT OR REPLACE INTO local_stats (key, value) VALUES (?, ?)').run(key, value)
    },
    getUnlockedAchievements(): string[] {
      const rows = database.prepare('SELECT achievement_id FROM achievements_unlocked ORDER BY unlocked_at DESC').all() as { achievement_id: string }[]
      return rows.map((r) => r.achievement_id)
    },
    unlockAchievement(achievementId: string) {
      database.prepare('INSERT OR IGNORE INTO achievements_unlocked (achievement_id, unlocked_at) VALUES (?, ?)').run(achievementId, Date.now())
    },

    /** Aggregate app usage across all sessions (or since a timestamp) */
    getAppUsageStats(sinceMs?: number): { app_name: string; category: string; total_ms: number }[] {
      const since = sinceMs || 0
      return database.prepare(`
        SELECT app_name, category, SUM(end_time - start_time) as total_ms
        FROM activities
        WHERE start_time >= ? AND app_name IS NOT NULL
        GROUP BY app_name
        ORDER BY total_ms DESC
      `).all(since) as { app_name: string; category: string; total_ms: number }[]
    },

    /** Aggregate category usage across all sessions */
    getCategoryStats(sinceMs?: number): { category: string; total_ms: number }[] {
      const since = sinceMs || 0
      return database.prepare(`
        SELECT category, SUM(end_time - start_time) as total_ms
        FROM activities
        WHERE start_time >= ?
        GROUP BY category
        ORDER BY total_ms DESC
      `).all(since) as { category: string; total_ms: number }[]
    },

    /** Get total unique app switches (context switches / alt-tabs) */
    getContextSwitchCount(sinceMs?: number): number {
      const since = sinceMs || 0
      const rows = database.prepare(`
        SELECT app_name FROM activities
        WHERE start_time >= ?
        ORDER BY start_time
      `).all(since) as { app_name: string }[]
      let switches = 0
      for (let i = 1; i < rows.length; i++) {
        if (rows[i].app_name !== rows[i - 1].app_name) switches++
      }
      return switches
    },

    /** Get session count for a time period */
    getSessionCount(sinceMs?: number): number {
      const since = sinceMs || 0
      const row = database.prepare('SELECT COUNT(*) as c FROM sessions WHERE start_time >= ?').get(since) as { c: number }
      return row.c
    },

    /** Get total grind seconds for a time period */
    getTotalSeconds(sinceMs?: number): number {
      const since = sinceMs || 0
      const row = database.prepare('SELECT COALESCE(SUM(duration_seconds), 0) as s FROM sessions WHERE start_time >= ?').get(since) as { s: number }
      return row.s
    },

    /** Aggregate window title stats grouped by app (top titles per app) */
    getWindowTitleStats(sinceMs?: number): { app_name: string; window_title: string; category: string; total_ms: number }[] {
      const since = sinceMs || 0
      return database.prepare(`
        SELECT app_name, window_title, category, SUM(end_time - start_time) as total_ms
        FROM activities
        WHERE start_time >= ? AND app_name IS NOT NULL AND window_title IS NOT NULL AND window_title != ''
        GROUP BY app_name, window_title
        ORDER BY total_ms DESC
      `).all(since) as { app_name: string; window_title: string; category: string; total_ms: number }[]
    },

    /** Hourly distribution — time by hour of day */
    getHourlyDistribution(sinceMs?: number): { hour: number; total_ms: number }[] {
      const since = sinceMs || 0
      return database.prepare(`
        SELECT CAST(strftime('%H', start_time / 1000, 'unixepoch', 'localtime') AS INTEGER) as hour,
               SUM(end_time - start_time) as total_ms
        FROM activities
        WHERE start_time >= ?
        GROUP BY hour
        ORDER BY hour
      `).all(since) as { hour: number; total_ms: number }[]
    },

    /** Total keystrokes for a time period */
    getTotalKeystrokes(sinceMs?: number): number {
      const since = sinceMs || 0
      const row = database.prepare('SELECT COALESCE(SUM(keystrokes), 0) as k FROM activities WHERE start_time >= ?').get(since) as { k: number }
      return row.k
    },

    /** Keystrokes grouped by app */
    getKeystrokesByApp(sinceMs?: number): { app_name: string; keystrokes: number }[] {
      const since = sinceMs || 0
      return database.prepare(`
        SELECT app_name, SUM(keystrokes) as keystrokes
        FROM activities
        WHERE start_time >= ? AND app_name IS NOT NULL
        GROUP BY app_name
        ORDER BY keystrokes DESC
      `).all(since) as { app_name: string; keystrokes: number }[]
    },

    getSkillXP(skillId: string): number {
      const row = database.prepare('SELECT total_xp FROM skill_xp WHERE skill_id = ?').get(skillId) as { total_xp: number } | undefined
      return row?.total_xp ?? 0
    },
    addSkillXP(skillId: string, amount: number): void {
      const now = Date.now()
      database.prepare(
        'INSERT INTO skill_xp (skill_id, total_xp, updated_at) VALUES (?, ?, ?) ON CONFLICT(skill_id) DO UPDATE SET total_xp = total_xp + ?, updated_at = ?'
      ).run(skillId, amount, now, amount, now)
    },
    getAllSkillXP(): { skill_id: string; total_xp: number }[] {
      return database.prepare('SELECT skill_id, total_xp FROM skill_xp ORDER BY total_xp DESC').all() as { skill_id: string; total_xp: number }[]
    },

    // ── Goals ──
    getActiveGoals(): { id: string; type: string; target_seconds: number; target_category: string | null; period: string; start_date: string; completed_at: number | null }[] {
      return database.prepare('SELECT * FROM goals WHERE completed_at IS NULL ORDER BY start_date DESC').all() as { id: string; type: string; target_seconds: number; target_category: string | null; period: string; start_date: string; completed_at: number | null }[]
    },
    getAllGoals(): { id: string; type: string; target_seconds: number; target_category: string | null; period: string; start_date: string; completed_at: number | null }[] {
      return database.prepare('SELECT * FROM goals ORDER BY start_date DESC').all() as { id: string; type: string; target_seconds: number; target_category: string | null; period: string; start_date: string; completed_at: number | null }[]
    },
    createGoal(goal: { id: string; type: string; target_seconds: number; target_category: string | null; period: string; start_date: string }) {
      database.prepare(
        'INSERT OR REPLACE INTO goals (id, type, target_seconds, target_category, period, start_date) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(goal.id, goal.type, goal.target_seconds, goal.target_category, goal.period, goal.start_date)
    },
    completeGoal(id: string) {
      database.prepare('UPDATE goals SET completed_at = ? WHERE id = ?').run(Date.now(), id)
    },
    updateGoal(goal: { id: string; target_seconds: number; target_category: string | null; period: string }) {
      database.prepare(
        'UPDATE goals SET target_seconds = ?, target_category = ?, period = ?, type = ? WHERE id = ?'
      ).run(goal.target_seconds, goal.target_category, goal.period, goal.target_category ? 'category' : 'total', goal.id)
    },
    deleteGoal(id: string) {
      database.prepare('DELETE FROM goals WHERE id = ?').run(id)
    },
    /** Get goal progress — total seconds for a category or all, since start of period */
    getGoalProgress(goal: { target_category: string | null; period: string; start_date: string }): number {
      let sinceMs: number
      const now = new Date()
      if (goal.period === 'daily') {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        sinceMs = today.getTime()
      } else if (goal.period === 'weekly') {
        const dayOfWeek = now.getDay() || 7 // Mon=1
        const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek + 1)
        sinceMs = monday.getTime()
      } else {
        sinceMs = new Date(goal.start_date).getTime()
      }
      if (goal.target_category) {
        const row = database.prepare(
          'SELECT COALESCE(SUM(end_time - start_time), 0) / 1000 as s FROM activities WHERE start_time >= ? AND category = ?'
        ).get(sinceMs, goal.target_category) as { s: number }
        return row.s
      }
      const row = database.prepare(
        'SELECT COALESCE(SUM(duration_seconds), 0) as s FROM sessions WHERE start_time >= ?'
      ).get(sinceMs) as { s: number }
      return row.s
    },

    // ── Trends ──
    getDailyTotals(sinceDaysAgo: number): { date: string; total_seconds: number; total_keystrokes: number; sessions_count: number }[] {
      const since = new Date()
      since.setDate(since.getDate() - sinceDaysAgo)
      since.setHours(0, 0, 0, 0)
      const sinceMs = since.getTime()
      return database.prepare(`
        SELECT 
          date(start_time / 1000, 'unixepoch', 'localtime') as date,
          COALESCE(SUM(duration_seconds), 0) as total_seconds,
          0 as total_keystrokes,
          COUNT(*) as sessions_count
        FROM sessions
        WHERE start_time >= ?
        GROUP BY date
        ORDER BY date
      `).all(sinceMs) as { date: string; total_seconds: number; total_keystrokes: number; sessions_count: number }[]
    },

    // ── Skill XP Log ──
    addSkillXPLog(skillId: string, xpDelta: number): void {
      database.prepare('INSERT INTO skill_xp_log (skill_id, xp_delta, recorded_at) VALUES (?, ?, ?)').run(skillId, xpDelta, Date.now())
    },
    getSkillXPHistory(skillId: string): { date: string; xp: number }[] {
      return database.prepare(`
        SELECT date(recorded_at / 1000, 'unixepoch', 'localtime') as date, SUM(xp_delta) as xp
        FROM skill_xp_log
        WHERE skill_id = ?
        GROUP BY date
        ORDER BY date
      `).all(skillId) as { date: string; xp: number }[]
    },

    // ── Session Checkpoint (crash recovery) ──
    saveCheckpoint(data: { sessionId: string; startTime: number; elapsedSeconds: number; pausedAccumulated: number }): void {
      database.prepare(
        'INSERT OR REPLACE INTO session_checkpoint (id, session_id, start_time, elapsed_seconds, paused_accumulated, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run('current', data.sessionId, data.startTime, data.elapsedSeconds, data.pausedAccumulated, Date.now())
    },
    getCheckpoint(): { session_id: string; start_time: number; elapsed_seconds: number; paused_accumulated: number; updated_at: number } | null {
      const row = database.prepare('SELECT * FROM session_checkpoint WHERE id = ?').get('current') as {
        session_id: string; start_time: number; elapsed_seconds: number; paused_accumulated: number; updated_at: number
      } | undefined
      return row ?? null
    },
    clearCheckpoint(): void {
      database.prepare('DELETE FROM session_checkpoint WHERE id = ?').run('current')
    },
  }
}
