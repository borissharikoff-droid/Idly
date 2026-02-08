import { create } from 'zustand'
import { playSessionStartSound, playSessionStopSound, playSessionCompleteSound, playPauseSound, playResumeSound } from '../lib/sounds'
import { saveSessionElectron, saveSessionBrowser } from '../services/sessionSaver'
import { computeAndSaveSkillXPElectron, computeAndSaveSkillXPBrowser } from '../services/skillXPService'
import { processAchievementsElectron } from '../services/achievementService'
import { syncSkillsToSupabase, syncSessionToSupabase } from '../services/supabaseSync'
import { useAlertStore } from './alertStore'
import { getAchievementById, levelFromTotalXP, getRewardsInRange, LevelReward } from '../lib/xp'

type SessionStatus = 'idle' | 'running' | 'paused'

interface ActivitySnapshot {
  appName: string
  windowTitle: string
  category: string
  timestamp: number
}

export interface SkillXPGain {
  skillId: string
  xp: number
  levelBefore: number
  levelAfter: number
}

interface SessionStore {
  status: SessionStatus
  elapsedSeconds: number
  currentActivity: ActivitySnapshot | null
  showComplete: boolean
  lastSessionSummary: { durationFormatted: string } | null
  sessionId: string | null
  sessionStartTime: number | null
  newAchievements: { id: string; name: string; description: string; xpReward: number }[]
  /** XP gained per skill this session (for SessionComplete UI) */
  skillXPGains: SkillXPGain[]
  /** Whether the session is paused due to AFK */
  isAfkPaused: boolean
  /** Streak multiplier for this session (1.0 - 2.0) */
  streakMultiplier: number
  /** Total XP earned this session (with multiplier applied) */
  sessionXPEarned: number
  /** Live XP accumulated this session (for real-time display) */
  liveXP: number
  /** Queue of floating +XP popups */
  xpPopups: { id: string; amount: number }[]
  /** Level at start of session (for level-up detection) */
  levelBefore: number
  /** Pending level-up info to show modal */
  pendingLevelUp: { level: number; rewards: LevelReward[] } | null
  /** All rewards unlocked during this session */
  sessionRewards: LevelReward[]
  tick: () => void
  start: () => void
  stop: () => void
  pause: () => void
  resume: () => void
  setCurrentActivity: (a: ActivitySnapshot | null) => void
  setShowComplete: (v: boolean) => void
  setLastSessionSummary: (s: { durationFormatted: string } | null) => void
  dismissComplete: () => void
  dismissLevelUp: () => void
  checkStreakOnMount: () => Promise<number>
  /** True when user is on home (grind) tab — live XP only ticks and shows popups there */
  isGrindPageActive: boolean
  setGrindPageActive: (v: boolean) => void
}

let tickInterval: ReturnType<typeof setInterval> | null = null
let xpTickInterval: ReturnType<typeof setInterval> | null = null
let checkpointInterval: ReturnType<typeof setInterval> | null = null
let pausedAccumulated = 0 // ms accumulated while paused
let pauseStartedAt = 0    // timestamp when current pause started
let lastXpTickTime = 0    // timestamp of last XP tick

// ── AFK auto-pause listener setup ──
let afkUnsubscribe: (() => void) | null = null

// ── Checkpoint autosave (crash recovery) ──
function startCheckpointSaving() {
  stopCheckpointSaving()
  checkpointInterval = setInterval(() => {
    const { sessionId, sessionStartTime, elapsedSeconds, status } = useSessionStore.getState()
    if (status !== 'idle' && sessionId && sessionStartTime && window.electronAPI?.db?.saveCheckpoint) {
      window.electronAPI.db.saveCheckpoint({
        sessionId,
        startTime: sessionStartTime,
        elapsedSeconds,
        pausedAccumulated,
      }).catch(() => { })
    }
  }, 30_000) // every 30 seconds
}

function stopCheckpointSaving() {
  if (checkpointInterval) {
    clearInterval(checkpointInterval)
    checkpointInterval = null
  }
}

function setupAfkListener() {
  if (afkUnsubscribe) return
  const api = typeof window !== 'undefined' ? window.electronAPI : null
  if (!api?.tracker?.onIdleChange) return
  afkUnsubscribe = api.tracker.onIdleChange((idle: boolean) => {
    const afkEnabled = typeof localStorage !== 'undefined' && localStorage.getItem('grinder_afk_enabled') !== 'false'
    if (!afkEnabled) return
    const { status } = useSessionStore.getState()
    if (idle && status === 'running') {
      useSessionStore.getState().pause()
      useSessionStore.setState({ isAfkPaused: true })
    } else if (!idle && useSessionStore.getState().isAfkPaused) {
      useSessionStore.getState().resume()
      useSessionStore.setState({ isAfkPaused: false })
    }
  })
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return [h, m, s].map((n) => n.toString().padStart(2, '0')).join(':')
}

function showAchievementAlerts(
  newAch: { id: string; name: string; description: string; xpReward: number }[],
  api: Window['electronAPI'] | null,
): void {
  if (newAch.length > 0) {
    // Push each achievement to the alert store for loot drop display
    for (const a of newAch) {
      const def = getAchievementById(a.id)
      if (def) useAlertStore.getState().push(def)
    }
    // Native notifications
    const notifEnabled = localStorage.getItem('grinder_notifications_enabled') !== 'false'
    if (notifEnabled && api?.notify) {
      for (const a of newAch) {
        api.notify.show('Achievement Unlocked!', `${a.name} — ${a.description}`)
      }
    }
  } else {
    playSessionCompleteSound()
  }
}

function sendStreakNotification(api: NonNullable<Window['electronAPI']>): void {
  const notifEnabled = localStorage.getItem('grinder_notifications_enabled') !== 'false'
  if (!notifEnabled || !api.db?.getStreak || !api.notify) return
  api.db.getStreak().then((streak: number) => {
    if (streak > 0 && streak % 7 === 0) {
      api.notify.show('Streak Milestone!', `You're on a ${streak}-day streak! Keep going!`)
    }
  })
}

// ── Real-Time XP Tick Constants ──
// XP per minute by category (same as computeSessionXP but for ticks)
const CATEGORY_XP_RATE: Record<string, number> = {
  coding: 2,
  design: 1.5,
  creative: 1.2,
  learning: 1.2,
  music: 0.5,
  games: 0.3,
  social: 0.5,
  browsing: 0.8,
  other: 0.5,
}

const XP_TICK_INTERVAL_MS = 30_000 // 30 seconds

// ── XP Tick Functions ──
function startXpTicking() {
  stopXpTicking()
  lastXpTickTime = Date.now()

  xpTickInterval = setInterval(async () => {
    const { status, currentActivity, elapsedSeconds, sessionStartTime, isGrindPageActive } = useSessionStore.getState()
    if (status !== 'running' || !sessionStartTime) return
    if (!isGrindPageActive) return

    // Skip XP ticks for very short sessions (under 10s)
    if (elapsedSeconds < 10) return

    const now = Date.now()
    const tickDurationMs = now - lastXpTickTime
    lastXpTickTime = now

    // Calculate XP for this tick
    const category = currentActivity?.category || 'other'
    const rate = CATEGORY_XP_RATE[category] ?? 0.5
    const xpEarned = Math.round((tickDurationMs / 60_000) * rate)

    if (xpEarned <= 0) return

    // Get current total XP to check for level up
    const api = window.electronAPI
    let prevTotalXP = 0
    if (api?.db?.getLocalStat) {
      const xpStr = await api.db.getLocalStat('total_xp')
      prevTotalXP = parseInt(xpStr || '0', 10)
    }
    const prevLevel = levelFromTotalXP(prevTotalXP)

    // Update live XP in store
    const { liveXP, sessionRewards } = useSessionStore.getState()
    const newLiveXP = liveXP + xpEarned
    const newTotalXP = prevTotalXP + xpEarned
    const newLevel = levelFromTotalXP(newTotalXP)

    // Save incremental XP to DB
    if (api?.db?.setLocalStat) {
      await api.db.setLocalStat('total_xp', String(newTotalXP))
    }

    // Add popup — on grind page show reduced amount for pixel display ("кратно меньше")
    const popupId = crypto.randomUUID()
    const popupAmount = Math.max(1, Math.floor(xpEarned / 4))
    const newPopup = { id: popupId, amount: popupAmount }

    // Check for level up
    if (newLevel > prevLevel) {
      const rewards = getRewardsInRange(prevLevel, newLevel)
      useSessionStore.setState({
        liveXP: newLiveXP,
        xpPopups: [...useSessionStore.getState().xpPopups, newPopup],
        pendingLevelUp: { level: newLevel, rewards },
        sessionRewards: [...sessionRewards, ...rewards],
      })
    } else {
      useSessionStore.setState({
        liveXP: newLiveXP,
        xpPopups: [...useSessionStore.getState().xpPopups, newPopup],
      })
    }

    // Auto-remove popup after 2 seconds
    setTimeout(() => {
      useSessionStore.setState({
        xpPopups: useSessionStore.getState().xpPopups.filter(p => p.id !== popupId),
      })
    }, 2000)
  }, XP_TICK_INTERVAL_MS)
}

function stopXpTicking() {
  if (xpTickInterval) {
    clearInterval(xpTickInterval)
    xpTickInterval = null
  }
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  status: 'idle',
  elapsedSeconds: 0,
  currentActivity: null,
  showComplete: false,
  lastSessionSummary: null,
  sessionId: null,
  sessionStartTime: null,
  newAchievements: [],
  skillXPGains: [],
  isAfkPaused: false,
  streakMultiplier: 1.0,
  sessionXPEarned: 0,
  liveXP: 0,
  xpPopups: [],
  levelBefore: 1,
  pendingLevelUp: null,
  sessionRewards: [],
  isGrindPageActive: true,
  setGrindPageActive: (v) => set({ isGrindPageActive: v }),

  tick() {
    const { sessionStartTime } = get()
    if (!sessionStartTime) return
    const elapsed = Math.floor((Date.now() - sessionStartTime - pausedAccumulated) / 1000)
    set({ elapsedSeconds: Math.max(0, elapsed) })
  },

  async start() {
    const sessionId = crypto.randomUUID()
    const sessionStartTime = Date.now()
    pausedAccumulated = 0
    pauseStartedAt = 0

    // Get current level for level-up detection
    let levelBefore = 1
    const api = typeof window !== 'undefined' ? window.electronAPI : null
    if (api?.db?.getLocalStat) {
      const xpStr = await api.db.getLocalStat('total_xp')
      const totalXP = parseInt(xpStr || '0', 10)
      levelBefore = levelFromTotalXP(totalXP)
    }

    set({ status: 'running', elapsedSeconds: 0, sessionId, sessionStartTime, isAfkPaused: false, liveXP: 0, xpPopups: [], levelBefore, pendingLevelUp: null, sessionRewards: [] })
    if (api) {
      api.tracker.start()
      // Apply AFK threshold from settings
      const savedAfk = localStorage.getItem('grinder_afk_timeout_min')
      const afkMin = savedAfk ? parseInt(savedAfk, 10) : 3
      if (api.tracker.setAfkThreshold) {
        api.tracker.setAfkThreshold(afkMin * 60 * 1000)
      }
    }
    setupAfkListener()
    playSessionStartSound()
    tickInterval = setInterval(() => get().tick(), 1000)
    startCheckpointSaving()
    startXpTicking()
  },

  async stop() {
    if (tickInterval) {
      clearInterval(tickInterval)
      tickInterval = null
    }
    // If currently paused, account for the last pause interval
    if (pauseStartedAt > 0) {
      pausedAccumulated += Date.now() - pauseStartedAt
      pauseStartedAt = 0
    }
    stopCheckpointSaving()
    stopXpTicking()
    playSessionStopSound()
    const { sessionId, sessionStartTime, elapsedSeconds } = get()
    set({ status: 'idle' })
    const api = typeof window !== 'undefined' ? window.electronAPI : null
    const endTime = Date.now()

    // Clear checkpoint since session is ending normally
    api?.db?.clearCheckpoint?.().catch(() => { })

    if (api && sessionId && sessionStartTime) {
      // ── Electron mode ──
      const { segments } = await saveSessionElectron(api, sessionId, sessionStartTime, endTime, elapsedSeconds)

      // Skill XP
      const skillXPGains = await computeAndSaveSkillXPElectron(
        api,
        segments.map((a) => ({ category: a.category, startTime: a.startTime, endTime: a.endTime })),
      )
      set({ skillXPGains })

      // Sync skills to Supabase (fire-and-forget)
      syncSkillsToSupabase(api).catch(() => { })

      // Achievements & XP
      const result = await processAchievementsElectron(api, sessionId)
      if (result) {
        set({
          streakMultiplier: result.streakMultiplier,
          sessionXPEarned: result.sessionXPEarned,
        })
        if (result.newAchievements.length > 0) {
          set({
            newAchievements: result.newAchievements.map(({ def }) => ({
              id: def.id,
              name: def.name,
              description: def.description,
              xpReward: def.xpReward,
            })),
          })
        }
      }
    } else if (sessionId && sessionStartTime) {
      // ── Browser mode ──
      try {
        saveSessionBrowser(sessionId, sessionStartTime, endTime, elapsedSeconds)
        const skillXPGains = computeAndSaveSkillXPBrowser(sessionStartTime, endTime)
        set({ skillXPGains })
      } catch { /* ignore */ }
    }

    // Sync session summary to Supabase (fire-and-forget, both modes)
    if (sessionId && sessionStartTime) {
      syncSessionToSupabase(sessionStartTime, endTime, elapsedSeconds).catch(() => { })
    }

    const durationFormatted = formatDuration(get().elapsedSeconds)

    // Achievement alerts & sounds
    showAchievementAlerts(get().newAchievements, api)

    // Streak notification
    if (api) sendStreakNotification(api)

    set({
      showComplete: true,
      lastSessionSummary: { durationFormatted },
      sessionId: null,
      sessionStartTime: null,
    })
  },

  pause() {
    set({ status: 'paused' })
    pauseStartedAt = Date.now()
    if (tickInterval) {
      clearInterval(tickInterval)
      tickInterval = null
    }
    stopXpTicking()
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.tracker.pause()
    }
    playPauseSound()
  },

  resume() {
    if (pauseStartedAt > 0) {
      pausedAccumulated += Date.now() - pauseStartedAt
      pauseStartedAt = 0
    }
    set({ status: 'running', isAfkPaused: false })
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.tracker.resume()
    }
    playResumeSound()
    tickInterval = setInterval(() => get().tick(), 1000)
    startXpTicking()
  },

  setCurrentActivity(a) {
    set({ currentActivity: a })
  },

  setShowComplete(v) {
    set({ showComplete: v })
  },

  setLastSessionSummary(s) {
    set({ lastSessionSummary: s })
  },

  dismissComplete() {
    set({ showComplete: false, lastSessionSummary: null, newAchievements: [], skillXPGains: [], streakMultiplier: 1.0, sessionXPEarned: 0, liveXP: 0, xpPopups: [], levelBefore: 1, pendingLevelUp: null, sessionRewards: [] })
  },

  dismissLevelUp() {
    set({ pendingLevelUp: null })
  },

  setGrindPageActive(v: boolean) {
    set({ isGrindPageActive: v })
  },

  async checkStreakOnMount(): Promise<number> {
    if (typeof window !== 'undefined' && window.electronAPI?.db?.getStreak) {
      const streak = await window.electronAPI.db.getStreak()
      return streak ?? 0
    }
    return 0
  },
}))

declare global {
  interface Window {
    electronAPI?: {
      tracker: {
        start: () => Promise<void>
        stop: () => Promise<void>
        pause: () => Promise<void>
        resume: () => Promise<void>
        getCurrentActivity: () => Promise<ActivitySnapshot | null>
        onActivityUpdate: (cb: (a: ActivitySnapshot) => void) => () => void
        onIdleChange: (cb: (idle: boolean) => void) => () => void
        setAfkThreshold: (ms: number) => Promise<void>
      }
      db: {
        getSessions: (limit?: number) => Promise<unknown[]>
        getSessionById: (id: string) => Promise<unknown>
        getActivitiesBySessionId: (sessionId: string) => Promise<unknown[]>
        saveSession: (session: unknown) => Promise<void>
        saveActivities: (sessionId: string, activities: unknown[]) => Promise<void>
        getStreak: () => Promise<number>
        getUserStats: () => Promise<{ totalSessions: number; totalSeconds: number }>
        getSessionAnalysis: (sessionId: string) => Promise<string | null>
        getLocalStat: (key: string) => Promise<string | null>
        setLocalStat: (key: string, value: string) => Promise<void>
        getUnlockedAchievements: () => Promise<string[]>
        unlockAchievement: (achievementId: string) => Promise<void>
        getAppUsageStats: (sinceMs?: number) => Promise<{ app_name: string; category: string; total_ms: number }[]>
        getCategoryStats: (sinceMs?: number) => Promise<{ category: string; total_ms: number }[]>
        getContextSwitchCount: (sinceMs?: number) => Promise<number>
        getSessionCount: (sinceMs?: number) => Promise<number>
        getTotalSeconds: (sinceMs?: number) => Promise<number>
        getWindowTitleStats: (sinceMs?: number) => Promise<{ app_name: string; window_title: string; category: string; total_ms: number }[]>
        getHourlyDistribution: (sinceMs?: number) => Promise<{ hour: number; total_ms: number }[]>
        getTotalKeystrokes: (sinceMs?: number) => Promise<number>
        getKeystrokesByApp: (sinceMs?: number) => Promise<{ app_name: string; keystrokes: number }[]>
        getSkillXP: (skillId: string) => Promise<number>
        addSkillXP: (skillId: string, amount: number) => Promise<void>
        getAllSkillXP: () => Promise<{ skill_id: string; total_xp: number }[]>
        // Goals
        getActiveGoals: () => Promise<{ id: string; type: string; target_seconds: number; target_category: string | null; period: string; start_date: string; completed_at: number | null }[]>
        getAllGoals: () => Promise<{ id: string; type: string; target_seconds: number; target_category: string | null; period: string; start_date: string; completed_at: number | null }[]>
        createGoal: (goal: { id: string; type: string; target_seconds: number; target_category: string | null; period: string; start_date: string }) => Promise<void>
        completeGoal: (id: string) => Promise<void>
        updateGoal: (goal: { id: string; target_seconds: number; target_category: string | null; period: string }) => Promise<void>
        deleteGoal: (id: string) => Promise<void>
        getGoalProgress: (goal: { target_category: string | null; period: string; start_date: string }) => Promise<number>
        // Trends
        getDailyTotals: (days: number) => Promise<{ date: string; total_seconds: number; total_keystrokes: number; sessions_count: number }[]>
        // Skill XP Log
        addSkillXPLog: (skillId: string, xpDelta: number) => Promise<void>
        getSkillXPHistory: (skillId: string) => Promise<{ date: string; xp: number }[]>
        // Session Checkpoint (crash recovery)
        saveCheckpoint: (data: { sessionId: string; startTime: number; elapsedSeconds: number; pausedAccumulated: number }) => Promise<void>
        getCheckpoint: () => Promise<{ session_id: string; start_time: number; elapsed_seconds: number; paused_accumulated: number; updated_at: number } | null>
        clearCheckpoint: () => Promise<void>
      }
      ai: {
        analyzeSession: (sessionId: string) => Promise<string>
        analyzeOverview: (data: unknown) => Promise<string>
      }
      settings: {
        getAutoLaunch: () => Promise<boolean>
        setAutoLaunch: (enabled: boolean) => Promise<void>
      }
      notify: {
        show: (title: string, body: string) => Promise<void>
      }
      data: {
        exportSessions: (format: 'csv' | 'json') => Promise<string | null>
      }
      updater: {
        onStatus: (cb: (info: { status: string; version?: string }) => void) => () => void
        install: () => Promise<void>
      }
    }
  }
}
