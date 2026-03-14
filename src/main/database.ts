import Database from 'better-sqlite3'
import path from 'path'
import { copyFileSync, existsSync } from 'fs'
import { app } from 'electron'
import { runMigrations } from './migrations'

const userDataPath = app.getPath('userData')
const dbPath = path.join(userDataPath, 'grindly.sqlite')
const legacyDbPath = path.join(userDataPath, 'idly.sqlite')

let db: Database.Database | null = null

function getDb(): Database.Database {
  if (!db) {
    // One-time migration after rebrand: carry over existing local DB.
    if (!existsSync(dbPath) && existsSync(legacyDbPath)) {
      try { copyFileSync(legacyDbPath, dbPath) } catch { /* ignore */ }
    }
    db = new Database(dbPath)
    db.pragma('foreign_keys = ON')
    runMigrations(db)
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

interface PeriodTotals {
  total_seconds: number
  sessions_count: number
  total_keystrokes: number
}

export function getDatabaseApi() {
  const database = getDb()
  const isFocusCategory = (category: string) => ['coding', 'design', 'creative', 'learning'].includes(category)
  const isDistractionCategory = (category: string) => ['social', 'games', 'other'].includes(category)
  const extractDomain = (title: string): string | null => {
    const hostLike = title.match(/\b([a-z0-9-]+\.)+[a-z]{2,}\b/i)?.[0]
    if (!hostLike) return null
    const host = hostLike.toLowerCase().replace(/^www\./, '')
    // Ignore common app/file noise that looks like a domain.
    if (host.endsWith('.exe') || host.endsWith('.dll')) return null
    return host
  }
  const getPeriodTotals = (fromMs: number, toMs: number): PeriodTotals => {
    const sessionRow = database.prepare(`
      SELECT COALESCE(SUM(duration_seconds), 0) as total_seconds, COUNT(*) as sessions_count
      FROM sessions
      WHERE start_time >= ? AND start_time < ?
    `).get(fromMs, toMs) as { total_seconds: number; sessions_count: number }
    const keysRow = database.prepare(`
      SELECT COALESCE(SUM(keystrokes), 0) as total_keystrokes
      FROM activities
      WHERE start_time >= ? AND start_time < ?
    `).get(fromMs, toMs) as { total_keystrokes: number }
    return {
      total_seconds: sessionRow.total_seconds,
      sessions_count: sessionRow.sessions_count,
      total_keystrokes: keysRow.total_keystrokes,
    }
  }

  return {
    getSessions(limit = 50): SessionRow[] {
      const stmt = database.prepare('SELECT * FROM sessions ORDER BY start_time DESC LIMIT ?')
      return stmt.all(limit) as SessionRow[]
    },
    getSessionsPage(limit = 25, offset = 0, sinceMs = 0): SessionRow[] {
      const stmt = database.prepare('SELECT * FROM sessions WHERE start_time >= ? ORDER BY start_time DESC LIMIT ? OFFSET ?')
      return stmt.all(sinceMs, limit, offset) as SessionRow[]
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
        GROUP BY app_name, category
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
        GROUP BY app_name, window_title, category
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
    resetSkillXP(skillId: string): void {
      const now = Date.now()
      database.prepare(
        'UPDATE skill_xp SET total_xp = 0, updated_at = ? WHERE skill_id = ?'
      ).run(now, skillId)
    },
    getAllSkillXP(): { skill_id: string; total_xp: number }[] {
      return database.prepare('SELECT skill_id, total_xp FROM skill_xp ORDER BY total_xp DESC').all() as { skill_id: string; total_xp: number }[]
    },
    restoreSkillXPFromCloud(rows: { skill_id: string; total_xp: number }[]): void {
      const stmt = database.prepare(
        'INSERT INTO skill_xp (skill_id, total_xp, updated_at) VALUES (?, ?, ?) ON CONFLICT(skill_id) DO UPDATE SET total_xp = MAX(skill_xp.total_xp, excluded.total_xp), updated_at = excluded.updated_at'
      )
      const now = Date.now()
      for (const row of rows) {
        stmt.run(row.skill_id, row.total_xp, now)
      }
    },
    /** Force-set skill XP to an exact value (admin overrides — can reduce XP). */
    forceSetSkillXP(rows: { skill_id: string; total_xp: number }[]): void {
      const stmt = database.prepare(
        'INSERT INTO skill_xp (skill_id, total_xp, updated_at) VALUES (?, ?, ?) ON CONFLICT(skill_id) DO UPDATE SET total_xp = ?, updated_at = ?'
      )
      const now = Date.now()
      for (const row of rows) {
        stmt.run(row.skill_id, row.total_xp, now, row.total_xp, now)
      }
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
          day as date,
          COALESCE(SUM(duration_seconds), 0) as total_seconds,
          COALESCE((
            SELECT SUM(a.keystrokes)
            FROM activities a
            WHERE date(a.start_time / 1000, 'unixepoch', 'localtime') = day
          ), 0) as total_keystrokes,
          COUNT(*) as sessions_count
        FROM (
          SELECT
            duration_seconds,
            date(start_time / 1000, 'unixepoch', 'localtime') as day
          FROM sessions
          WHERE start_time >= ?
        )
        GROUP BY day
        ORDER BY day
      `).all(sinceMs) as { date: string; total_seconds: number; total_keystrokes: number; sessions_count: number }[]
    },

    getSiteUsageStats(sinceMs?: number): { domain: string; total_ms: number; sample_title: string }[] {
      const since = sinceMs || 0
      const rows = database.prepare(`
        SELECT window_title, start_time, end_time
        FROM activities
        WHERE start_time >= ?
          AND window_title IS NOT NULL
          AND window_title != ''
        ORDER BY start_time DESC
      `).all(since) as { window_title: string; start_time: number; end_time: number }[]

      const domainMap = new Map<string, { totalMs: number; sampleTitle: string }>()
      for (const row of rows) {
        const domain = extractDomain(row.window_title)
        if (!domain) continue
        const durationMs = Math.max(0, row.end_time - row.start_time)
        const existing = domainMap.get(domain)
        if (!existing) {
          domainMap.set(domain, { totalMs: durationMs, sampleTitle: row.window_title })
          continue
        }
        existing.totalMs += durationMs
      }

      return Array.from(domainMap.entries())
        .map(([domain, data]) => ({
          domain,
          total_ms: data.totalMs,
          sample_title: data.sampleTitle,
        }))
        .sort((a, b) => b.total_ms - a.total_ms)
        .slice(0, 100)
    },

    getFocusBlocks(sinceMs?: number, minMinutes = 20): { start_time: number; end_time: number; total_seconds: number; dominant_app: string; categories: string[] }[] {
      const since = sinceMs || 0
      const minSeconds = Math.max(5, minMinutes) * 60
      const rows = database.prepare(`
        SELECT app_name, category, start_time, end_time
        FROM activities
        WHERE start_time >= ?
        ORDER BY start_time ASC
      `).all(since) as { app_name: string | null; category: string | null; start_time: number; end_time: number }[]

      const blocks: { start_time: number; end_time: number; total_seconds: number; dominant_app: string; categories: string[] }[] = []
      let current: {
        startTime: number
        endTime: number
        totalSeconds: number
        appDurations: Map<string, number>
        categories: Set<string>
      } | null = null

      for (const row of rows) {
        const category = row.category || 'other'
        const durationSeconds = Math.max(0, row.end_time - row.start_time) / 1000
        if (!isFocusCategory(category)) {
          if (current && current.totalSeconds >= minSeconds) {
            const dominantApp = Array.from(current.appDurations.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown'
            blocks.push({
              start_time: current.startTime,
              end_time: current.endTime,
              total_seconds: Math.round(current.totalSeconds),
              dominant_app: dominantApp,
              categories: Array.from(current.categories),
            })
          }
          current = null
          continue
        }

        if (!current || row.start_time - current.endTime > 120000) {
          if (current && current.totalSeconds >= minSeconds) {
            const dominantApp = Array.from(current.appDurations.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown'
            blocks.push({
              start_time: current.startTime,
              end_time: current.endTime,
              total_seconds: Math.round(current.totalSeconds),
              dominant_app: dominantApp,
              categories: Array.from(current.categories),
            })
          }
          current = {
            startTime: row.start_time,
            endTime: row.end_time,
            totalSeconds: durationSeconds,
            appDurations: new Map<string, number>(),
            categories: new Set<string>(),
          }
        } else {
          current.endTime = row.end_time
          current.totalSeconds += durationSeconds
        }

        const appName = row.app_name || 'Unknown'
        current.appDurations.set(appName, (current.appDurations.get(appName) || 0) + durationSeconds)
        current.categories.add(category)
      }

      if (current && current.totalSeconds >= minSeconds) {
        const dominantApp = Array.from(current.appDurations.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown'
        blocks.push({
          start_time: current.startTime,
          end_time: current.endTime,
          total_seconds: Math.round(current.totalSeconds),
          dominant_app: dominantApp,
          categories: Array.from(current.categories),
        })
      }

      return blocks.sort((a, b) => b.total_seconds - a.total_seconds).slice(0, 20)
    },

    getDistractionMetrics(sinceMs?: number): {
      distraction_seconds: number
      focus_seconds: number
      distraction_switches: number
      longest_focus_minutes: number
      top_distractions: { app_name: string; total_seconds: number }[]
    } {
      const since = sinceMs || 0
      const rows = database.prepare(`
        SELECT app_name, category, start_time, end_time
        FROM activities
        WHERE start_time >= ?
        ORDER BY start_time ASC
      `).all(since) as { app_name: string | null; category: string | null; start_time: number; end_time: number }[]

      let distractionSeconds = 0
      let focusSeconds = 0
      let distractionSwitches = 0
      let maxFocusStreak = 0
      let currentFocusStreak = 0
      const appDistractionTotals = new Map<string, number>()
      let prevWasFocus = false

      for (const row of rows) {
        const category = row.category || 'other'
        const seconds = Math.max(0, row.end_time - row.start_time) / 1000
        const appName = row.app_name || 'Unknown'
        const isFocus = isFocusCategory(category)
        const isDistraction = isDistractionCategory(category)

        if (isFocus) {
          focusSeconds += seconds
          currentFocusStreak += seconds
          if (currentFocusStreak > maxFocusStreak) maxFocusStreak = currentFocusStreak
          prevWasFocus = true
          continue
        }

        if (isDistraction) {
          distractionSeconds += seconds
          appDistractionTotals.set(appName, (appDistractionTotals.get(appName) || 0) + seconds)
          if (prevWasFocus) distractionSwitches++
        }

        currentFocusStreak = 0
        prevWasFocus = false
      }

      const topDistractions = Array.from(appDistractionTotals.entries())
        .map(([app_name, total_seconds]) => ({ app_name, total_seconds: Math.round(total_seconds) }))
        .sort((a, b) => b.total_seconds - a.total_seconds)
        .slice(0, 6)

      return {
        distraction_seconds: Math.round(distractionSeconds),
        focus_seconds: Math.round(focusSeconds),
        distraction_switches: distractionSwitches,
        longest_focus_minutes: Math.round(maxFocusStreak / 60),
        top_distractions: topDistractions,
      }
    },

    getCategoryTrends(days = 14): { date: string; category: string; total_seconds: number }[] {
      const since = new Date()
      since.setDate(since.getDate() - Math.max(1, days))
      since.setHours(0, 0, 0, 0)
      const sinceMs = since.getTime()
      return database.prepare(`
        SELECT
          date(start_time / 1000, 'unixepoch', 'localtime') as date,
          category,
          CAST(COALESCE(SUM(end_time - start_time), 0) / 1000 AS INTEGER) as total_seconds
        FROM activities
        WHERE start_time >= ?
        GROUP BY date, category
        ORDER BY date ASC
      `).all(sinceMs) as { date: string; category: string; total_seconds: number }[]
    },

    getPeriodComparison(currentSinceMs: number, currentUntilMs: number, previousSinceMs: number, previousUntilMs: number): {
      current: PeriodTotals
      previous: PeriodTotals
    } {
      return {
        current: getPeriodTotals(currentSinceMs, currentUntilMs),
        previous: getPeriodTotals(previousSinceMs, previousUntilMs),
      }
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
    saveCheckpoint(data: {
      sessionId: string
      startTime: number
      elapsedSeconds: number
      pausedAccumulated: number
      sessionSkillXP?: Record<string, number>
    }): void {
      database.prepare(
        'INSERT OR REPLACE INTO session_checkpoint (id, session_id, start_time, elapsed_seconds, paused_accumulated, updated_at, session_skill_xp) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(
        'current',
        data.sessionId,
        data.startTime,
        data.elapsedSeconds,
        data.pausedAccumulated,
        Date.now(),
        data.sessionSkillXP ? JSON.stringify(data.sessionSkillXP) : null,
      )
    },
    getCheckpoint(): {
      session_id: string
      start_time: number
      elapsed_seconds: number
      paused_accumulated: number
      updated_at: number
      session_skill_xp: string | null
    } | null {
      const row = database.prepare('SELECT * FROM session_checkpoint WHERE id = ?').get('current') as {
        session_id: string
        start_time: number
        elapsed_seconds: number
        paused_accumulated: number
        updated_at: number
        session_skill_xp: string | null
      } | undefined
      return row ?? null
    },
    clearCheckpoint(): void {
      database.prepare('DELETE FROM session_checkpoint WHERE id = ?').run('current')
    },

    // ── Grind Tasks (checklist goals) ──
    getTasks(): { id: string; text: string; done: number; created_at: number }[] {
      return database.prepare('SELECT * FROM grind_tasks ORDER BY done ASC, created_at DESC').all() as { id: string; text: string; done: number; created_at: number }[]
    },
    createTask(task: { id: string; text: string }): void {
      database.prepare('INSERT INTO grind_tasks (id, text, done, created_at) VALUES (?, ?, 0, ?)').run(task.id, task.text, Date.now())
    },
    toggleTask(id: string): void {
      database.prepare('UPDATE grind_tasks SET done = CASE WHEN done = 0 THEN 1 ELSE 0 END WHERE id = ?').run(id)
    },
    updateTaskText(id: string, text: string): void {
      database.prepare('UPDATE grind_tasks SET text = ? WHERE id = ?').run(text, id)
    },
    deleteTask(id: string): void {
      database.prepare('DELETE FROM grind_tasks WHERE id = ?').run(id)
    },
    clearDoneTasks(): void {
      database.prepare('DELETE FROM grind_tasks WHERE done = 1').run()
    },
  }
}
