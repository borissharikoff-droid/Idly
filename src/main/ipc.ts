import { ipcMain, app, dialog, shell } from 'electron'
import { createBadgeImage } from './badgeOverlay'
import path from 'path'
import fs from 'fs'
import { getTrackerApi } from './tracker'
import { getDatabaseApi } from './database'
import { analyzeSession, analyzeOverview } from './deepseek'
import type { OverviewData } from './deepseek'
import {
  saveSessionSchema,
  saveActivitiesSchema,
  goalSchema,
  updateGoalSchema,
  goalProgressSchema,
  stringId,
  optionalSinceMs,
  optionalLimit,
  positiveInt,
  nonNegativeInt,
  localStatKey,
  localStatValue,
} from './validation'
import { IPC_CHANNELS } from '../shared/ipcChannels'

let notificationSender: ((title: string, body: string) => void) | null = null
export function setNotificationSender(fn: (title: string, body: string) => void) {
  notificationSender = fn
}

// Rate-limiting state for AI overview
let lastOverviewCallMs = 0
const OVERVIEW_COOLDOWN_MS = 10_000 // 10 seconds

export function registerIpcHandlers() {
  const tracker = getTrackerApi()
  const db = getDatabaseApi()

  ipcMain.handle(IPC_CHANNELS.tracker.start, () => tracker.start())
  ipcMain.handle(IPC_CHANNELS.tracker.stop, () => tracker.stop())
  ipcMain.handle(IPC_CHANNELS.tracker.pause, () => tracker.pause())
  ipcMain.handle(IPC_CHANNELS.tracker.resume, () => tracker.resume())
  ipcMain.handle(IPC_CHANNELS.tracker.getCurrentActivity, () => tracker.getCurrentActivity())
  ipcMain.handle(IPC_CHANNELS.tracker.setAfkThreshold, (_, ms: unknown) => {
    const parsed = nonNegativeInt.parse(ms)
    tracker.setAfkThreshold(parsed)
  })
  tracker.onActivityUpdate((activity) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.tracker.activityUpdate, activity)
    }
  })
  tracker.onIdleChange((idle) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.tracker.idleChange, idle)
    }
  })

  ipcMain.handle(IPC_CHANNELS.db.getSessions, (_, limit?: unknown) => {
    const parsed = optionalLimit.parse(limit)
    return db.getSessions(parsed)
  })
  ipcMain.handle(IPC_CHANNELS.db.getSessionById, (_, id: unknown) => {
    return db.getSessionById(stringId.parse(id))
  })
  ipcMain.handle(IPC_CHANNELS.db.getActivitiesBySessionId, (_, sessionId: unknown) => {
    return db.getActivitiesBySessionId(stringId.parse(sessionId))
  })
  ipcMain.handle(IPC_CHANNELS.db.saveSession, (_, session: unknown) => {
    const parsed = saveSessionSchema.parse(session)
    return db.saveSession(parsed)
  })
  ipcMain.handle(IPC_CHANNELS.db.saveActivities, (_, sessionId: unknown, activities: unknown) => {
    const parsed = saveActivitiesSchema.parse({ sessionId, activities })
    return db.saveActivities(parsed.sessionId, parsed.activities)
  })
  ipcMain.handle(IPC_CHANNELS.db.getStreak, () => db.getStreak())
  ipcMain.handle(IPC_CHANNELS.db.getUserStats, () => db.getUserStats())
  ipcMain.handle(IPC_CHANNELS.db.getSessionAnalysis, (_, sessionId: unknown) => {
    return db.getSessionAnalysis(stringId.parse(sessionId))
  })
  ipcMain.handle(IPC_CHANNELS.db.getLocalStat, (_, key: unknown) => {
    return db.getLocalStat(localStatKey.parse(key))
  })
  ipcMain.handle(IPC_CHANNELS.db.setLocalStat, (_, key: unknown, value: unknown) => {
    return db.setLocalStat(localStatKey.parse(key), localStatValue.parse(value))
  })
  ipcMain.handle(IPC_CHANNELS.db.getUnlockedAchievements, () => db.getUnlockedAchievements())
  ipcMain.handle(IPC_CHANNELS.db.unlockAchievement, (_, achievementId: unknown) => {
    return db.unlockAchievement(stringId.parse(achievementId))
  })
  ipcMain.handle(IPC_CHANNELS.db.getAppUsageStats, (_, sinceMs?: unknown) => {
    return db.getAppUsageStats(optionalSinceMs.parse(sinceMs))
  })
  ipcMain.handle(IPC_CHANNELS.db.getCategoryStats, (_, sinceMs?: unknown) => {
    return db.getCategoryStats(optionalSinceMs.parse(sinceMs))
  })
  ipcMain.handle(IPC_CHANNELS.db.getContextSwitchCount, (_, sinceMs?: unknown) => {
    return db.getContextSwitchCount(optionalSinceMs.parse(sinceMs))
  })
  ipcMain.handle(IPC_CHANNELS.db.getSessionCount, (_, sinceMs?: unknown) => {
    return db.getSessionCount(optionalSinceMs.parse(sinceMs))
  })
  ipcMain.handle(IPC_CHANNELS.db.getTotalSeconds, (_, sinceMs?: unknown) => {
    return db.getTotalSeconds(optionalSinceMs.parse(sinceMs))
  })
  ipcMain.handle(IPC_CHANNELS.db.getWindowTitleStats, (_, sinceMs?: unknown) => {
    return db.getWindowTitleStats(optionalSinceMs.parse(sinceMs))
  })
  ipcMain.handle(IPC_CHANNELS.db.getHourlyDistribution, (_, sinceMs?: unknown) => {
    return db.getHourlyDistribution(optionalSinceMs.parse(sinceMs))
  })
  ipcMain.handle(IPC_CHANNELS.db.getTotalKeystrokes, (_, sinceMs?: unknown) => {
    return db.getTotalKeystrokes(optionalSinceMs.parse(sinceMs))
  })
  ipcMain.handle(IPC_CHANNELS.db.getKeystrokesByApp, (_, sinceMs?: unknown) => {
    return db.getKeystrokesByApp(optionalSinceMs.parse(sinceMs))
  })
  ipcMain.handle(IPC_CHANNELS.db.getSkillXP, (_, skillId: unknown) => {
    return db.getSkillXP(stringId.parse(skillId))
  })
  ipcMain.handle(IPC_CHANNELS.db.addSkillXP, (_, skillId: unknown, amount: unknown) => {
    return db.addSkillXP(stringId.parse(skillId), nonNegativeInt.parse(amount))
  })
  ipcMain.handle(IPC_CHANNELS.db.getAllSkillXP, () => db.getAllSkillXP())

  // Goals
  ipcMain.handle(IPC_CHANNELS.db.getActiveGoals, () => db.getActiveGoals())
  ipcMain.handle(IPC_CHANNELS.db.getAllGoals, () => db.getAllGoals())
  ipcMain.handle(IPC_CHANNELS.db.createGoal, (_, goal: unknown) => {
    return db.createGoal(goalSchema.parse(goal))
  })
  ipcMain.handle(IPC_CHANNELS.db.completeGoal, (_, id: unknown) => {
    return db.completeGoal(stringId.parse(id))
  })
  ipcMain.handle(IPC_CHANNELS.db.updateGoal, (_, goal: unknown) => {
    return db.updateGoal(updateGoalSchema.parse(goal))
  })
  ipcMain.handle(IPC_CHANNELS.db.deleteGoal, (_, id: unknown) => {
    return db.deleteGoal(stringId.parse(id))
  })
  ipcMain.handle(IPC_CHANNELS.db.getGoalProgress, (_, goal: unknown) => {
    return db.getGoalProgress(goalProgressSchema.parse(goal))
  })

  // Grind Tasks
  ipcMain.handle(IPC_CHANNELS.db.getTasks, () => db.getTasks())
  ipcMain.handle(IPC_CHANNELS.db.createTask, (_, task: unknown) => {
    const parsed = task as { id: string; text: string }
    if (!parsed.id || !parsed.text) throw new Error('Invalid task')
    return db.createTask(parsed)
  })
  ipcMain.handle(IPC_CHANNELS.db.toggleTask, (_, id: unknown) => db.toggleTask(stringId.parse(id)))
  ipcMain.handle(IPC_CHANNELS.db.updateTaskText, (_, id: unknown, text: unknown) => {
    const parsedId = stringId.parse(id)
    if (typeof text !== 'string' || !text.trim()) throw new Error('Invalid text')
    return db.updateTaskText(parsedId, (text as string).trim())
  })
  ipcMain.handle(IPC_CHANNELS.db.deleteTask, (_, id: unknown) => db.deleteTask(stringId.parse(id)))
  ipcMain.handle(IPC_CHANNELS.db.clearDoneTasks, () => db.clearDoneTasks())

  // Trends
  ipcMain.handle(IPC_CHANNELS.db.getDailyTotals, (_, days: unknown) => {
    return db.getDailyTotals(positiveInt.parse(days))
  })

  // Skill XP Log
  ipcMain.handle(IPC_CHANNELS.db.addSkillXPLog, (_, skillId: unknown, xpDelta: unknown) => {
    return db.addSkillXPLog(stringId.parse(skillId), nonNegativeInt.parse(xpDelta))
  })
  ipcMain.handle(IPC_CHANNELS.db.getSkillXPHistory, (_, skillId: unknown) => {
    return db.getSkillXPHistory(stringId.parse(skillId))
  })

  // Session Checkpoint (crash recovery)
  ipcMain.handle(IPC_CHANNELS.db.saveCheckpoint, (_, data: unknown) => {
    const parsed = data as { sessionId: string; startTime: number; elapsedSeconds: number; pausedAccumulated: number }
    if (!parsed || typeof parsed.sessionId !== 'string') throw new Error('Invalid checkpoint data')
    return db.saveCheckpoint(parsed)
  })
  ipcMain.handle(IPC_CHANNELS.db.getCheckpoint, () => db.getCheckpoint())
  ipcMain.handle(IPC_CHANNELS.db.clearCheckpoint, () => db.clearCheckpoint())

  ipcMain.handle(IPC_CHANNELS.ai.analyzeSession, async (_, sessionId: unknown) => {
    const id = stringId.parse(sessionId)
    const session = db.getSessionById(id)
    if (!session) throw new Error('Session not found')
    const existing = db.getSessionAnalysis(id)
    if (existing) return existing
    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set in .env')
    const activities = db.getActivitiesBySessionId(id)
    // Count context switches for this session
    let contextSwitches = 0
    for (let i = 1; i < activities.length; i++) {
      if (activities[i].app_name !== activities[i - 1].app_name) contextSwitches++
    }
    // Total keystrokes for this session
    const totalKeys = activities.reduce((s, a) => s + (a.keystrokes || 0), 0)
    const text = await analyzeSession(activities, session.duration_seconds, apiKey, contextSwitches, totalKeys)
    db.saveSessionAnalysis(id, text)
    return text
  })

  ipcMain.handle(IPC_CHANNELS.ai.analyzeOverview, async (_, overviewData: OverviewData) => {
    // Rate limiting: prevent rapid repeated calls
    const now = Date.now()
    if (now - lastOverviewCallMs < OVERVIEW_COOLDOWN_MS) {
      throw new Error('Please wait a few seconds before requesting another analysis.')
    }
    lastOverviewCallMs = now

    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set in .env')
    return analyzeOverview(overviewData, apiKey)
  })

  // ── Auto-launch ──
  ipcMain.handle(IPC_CHANNELS.settings.getAutoLaunch, () => {
    return app.getLoginItemSettings().openAtLogin
  })
  ipcMain.handle(IPC_CHANNELS.settings.setAutoLaunch, (_, enabled: unknown) => {
    if (typeof enabled !== 'boolean') throw new Error('enabled must be boolean')
    app.setLoginItemSettings({ openAtLogin: enabled })
  })

  // ── Native notifications ──
  ipcMain.handle(IPC_CHANNELS.notify.show, (_, title: unknown, body: unknown) => {
    if (typeof title !== 'string' || typeof body !== 'string') throw new Error('title and body must be strings')
    if (title.length > 256 || body.length > 1024) throw new Error('title/body too long')
    if (notificationSender) notificationSender(title, body)
  })

  // ── Data export ──
  ipcMain.handle(IPC_CHANNELS.data.exportSessions, async (_, format: unknown) => {
    if (format !== 'csv' && format !== 'json') throw new Error('format must be csv or json')

    const sessions = db.getSessions(9999)
    if (sessions.length === 0) return null

    const allData = sessions.map((s) => {
      const activities = db.getActivitiesBySessionId(s.id)
      return {
        session_id: s.id,
        start_time: new Date(s.start_time).toISOString(),
        end_time: new Date(s.end_time).toISOString(),
        duration_seconds: s.duration_seconds,
        activities: activities.map((a) => ({
          app_name: a.app_name,
          window_title: a.window_title,
          category: a.category,
          start_time: new Date(a.start_time).toISOString(),
          end_time: new Date(a.end_time).toISOString(),
        })),
      }
    })

    const ext = format === 'csv' ? 'csv' : 'json'
    const defaultPath = path.join(app.getPath('documents'), `idly-export.${ext}`)

    const { filePath } = await dialog.showSaveDialog({
      title: 'Export Sessions',
      defaultPath,
      filters: format === 'csv'
        ? [{ name: 'CSV Files', extensions: ['csv'] }]
        : [{ name: 'JSON Files', extensions: ['json'] }],
    })

    if (!filePath) return null

    if (format === 'json') {
      fs.writeFileSync(filePath, JSON.stringify(allData, null, 2), 'utf-8')
    } else {
      // CSV format — flatten sessions + activities
      const lines: string[] = [
        'session_id,session_start,session_end,duration_seconds,app_name,window_title,category,activity_start,activity_end',
      ]
      for (const s of allData) {
        if (s.activities.length === 0) {
          lines.push(`"${s.session_id}","${s.start_time}","${s.end_time}",${s.duration_seconds},"","","","",""`)
        } else {
          for (const a of s.activities) {
            const esc = (v: string | null) => `"${(v || '').replace(/"/g, '""')}"`
            lines.push(
              `"${s.session_id}","${s.start_time}","${s.end_time}",${s.duration_seconds},${esc(a.app_name)},${esc(a.window_title)},${esc(a.category)},"${a.start_time}","${a.end_time}"`
            )
          }
        }
      }
      fs.writeFileSync(filePath, lines.join('\n'), 'utf-8')
    }

    return filePath
  })

  const logsDir = () => path.join(app.getPath('userData'), 'logs')
  ipcMain.handle(IPC_CHANNELS.data.getLogsPath, () => logsDir())
  ipcMain.handle(IPC_CHANNELS.data.openLogsFolder, async () => {
    const dir = logsDir()
    try {
      await shell.openPath(dir)
    } catch {
      await shell.showItemInFolder(path.join(dir, 'main.log'))
    }
  })

  // ── Auto-updater: restart to apply update ────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.updater.install, () => {
    const { autoUpdater } = require('electron-updater')
    autoUpdater.quitAndInstall(false, true)
  })

  // ── Window: flash + taskbar badge (Windows overlay) ───────────────────────
  ipcMain.handle('window:flashFrame', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.flashFrame(true)
    }
  })
  ipcMain.handle('window:setBadgeCount', async (_: unknown, count: number) => {
    const n = typeof count === 'number' ? Math.max(0, Math.floor(count)) : 0
    if (process.platform === 'darwin' && app.dock) {
      app.dock.setBadge(n > 0 ? String(n) : '')
    } else if (process.platform === 'win32' && mainWindow && !mainWindow.isDestroyed()) {
      if (n === 0) {
        mainWindow.setOverlayIcon(null, '')
      } else {
        const img = await createBadgeImage(n)
        if (img) mainWindow.setOverlayIcon(img, `${n} unread`)
      }
    }
  })
}

let mainWindow: Electron.BrowserWindow | null = null
export function setMainWindow(win: Electron.BrowserWindow | null) {
  mainWindow = win
}
