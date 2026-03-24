import { create } from 'zustand'
import { playSessionStartSound, playSessionStopSound, playSessionCompleteSound, playPauseSound, playResumeSound } from '../lib/sounds'
import { saveSessionElectron, saveSessionBrowser } from '../services/sessionSaver'
import { computeAndSaveSkillXPElectron, computeAndSaveSkillXPBrowser } from '../services/skillXPService'
import { processAchievementsElectron } from '../services/achievementService'
import { syncSkillsToSupabase, syncSessionToSupabase } from '../services/supabaseSync'
import { useAlertStore } from './alertStore'
import { useSkillSyncStore } from './skillSyncStore'
import { getAchievementById, LevelReward } from '../lib/xp'
import { skillLevelFromXP, getGrindlyLevel, computeGrindlyBonuses } from '../lib/skills'
import { appendProgressionHistory } from '../lib/progressionHistory'
import { buildFocusTickEvent, computeSkillXpForCategories, makeProgressionEvent, type ProgressionEvent } from '../lib/progressionContract'
import { routeNotification } from '../services/notificationRouter'
import { generateSessionCoach, type SessionCoachSummary } from '../lib/sessionCoach'
import { publishSocialFeedEvent } from '../services/socialFeed'
import { ensureInventoryHydrated, useInventoryStore } from './inventoryStore'
import { recordDeveloperXp, recordFocusSeconds, recordSessionWithoutAfk, recordWeeklySkillXP } from '../services/dailyActivityService'
import { useChestDropStore } from './chestDropStore'
import { getEquippedPerkRuntime } from '../lib/loot'
import { track } from '../lib/analytics'
import { getGuildXpMultiplier } from '../lib/guildBuffs'
import { useGuildStore } from './guildStore'
import { getPartyXpMultiplier } from '../lib/partyBuffs'
import { usePartyStore } from './partyStore'

type SessionStatus = 'idle' | 'running' | 'paused'

interface ActivitySnapshot {
  appName: string
  windowTitle: string
  category: string
  /** All active categories (foreground + background, e.g. ['games', 'music']) */
  categories?: string[]
  timestamp: number
}

export interface SkillXPGain {
  skillId: string
  xp: number
  levelBefore: number
  levelAfter: number
  totalXpAfter: number
}

interface SessionStore {
  status: SessionStatus
  elapsedSeconds: number
  currentActivity: ActivitySnapshot | null
  showComplete: boolean
  lastSessionSummary: { durationFormatted: string; coach?: SessionCoachSummary } | null
  sessionId: string | null
  sessionStartTime: number | null
  newAchievements: { id: string; name: string; description: string; xpReward: number }[]
  /** XP gained per skill this session (for SessionComplete UI) */
  skillXPGains: SkillXPGain[]
  /** Whether the session is paused due to AFK */
  isAfkPaused: boolean
  /** Becomes true if AFK pause happened at least once in this session */
  wasAfkPausedThisSession: boolean
  /** True when system is idle (no input), regardless of whether a session is running */
  isSystemIdle: boolean
  /** Focus Mode currently active for this session */
  focusModeActive: boolean
  /** Focus Mode end timestamp in ms (null = inactive) */
  focusModeEndsAt: number | null
  /** Focus Mode selected duration in ms */
  focusModeDurationMs: number | null
  /** True when OS-level focus toggles were applied */
  focusModeOsApplied: boolean
  /** Streak multiplier for this session (1.0 - 2.0) */
  streakMultiplier: number
  /** Total skill XP earned this session */
  sessionSkillXPEarned: number
  /** Pending level-up info to show modal */
  pendingLevelUp: { level: number; rewards: LevelReward[] } | null
  /** Captured progression reason events in latest session */
  progressionEvents: ProgressionEvent[]
  /** All rewards unlocked during this session */
  sessionRewards: LevelReward[]
  /** XP per skill this session (for live display during grind; 1 per second in current category) */
  sessionSkillXP: Record<string, number>
  /** Skill XP at session start (for level-up detection and live display) */
  skillXPAtStart: Record<string, number>
  /** Skill levels we've already shown level-up for this session */
  skillLevelNotified: Record<string, number>
  /** Pending skill level-up to show modal */
  pendingSkillLevelUpSkill: { skillId: string; level: number } | null
  dismissSkillLevelUp: () => void
  tick: () => void
  start: (options?: { focusDurationMs?: number }) => Promise<void>
  stop: () => Promise<void>
  pause: () => void
  resume: () => void
  setCurrentActivity: (a: ActivitySnapshot | null) => void
  setShowComplete: (v: boolean) => void
  setLastSessionSummary: (s: { durationFormatted: string; coach?: SessionCoachSummary } | null) => void
  presentRecoveryComplete: (payload: { sessionId: string; startTime: number; elapsedSeconds: number; sessionSkillXP?: Record<string, number> }) => Promise<void>
  dismissComplete: () => void
  dismissLevelUp: () => void
  checkStreakOnMount: () => Promise<number>
  /** Returns true if streak was already shown this session (module-level flag) */
  isStreakDone: () => boolean
  /** Marks streak as shown for this session */
  markStreakDone: () => void
  /** True when user is on home (grind) tab — live XP only ticks and shows popups there */
  isGrindPageActive: boolean
  setGrindPageActive: (v: boolean) => void
  enableFocusMode: (durationMs: number) => Promise<void>
  disableFocusMode: () => Promise<void>
}

let tickInterval: ReturnType<typeof setInterval> | null = null
let xpTickInterval: ReturnType<typeof setInterval> | null = null
let checkpointInterval: ReturnType<typeof setInterval> | null = null
let pausedAccumulated = 0 // ms accumulated while paused
/** Module-level flag — survives React remounts, only resets on full app restart */
let _streakDoneThisSession = false
let pauseStartedAt = 0    // timestamp when current pause started
let lastXpTickTime = 0    // timestamp of last XP tick
let lastStableActivityAt = 0

function isTransientUnknownActivity(a: ActivitySnapshot | null): boolean {
  if (!a) return true
  if (a.appName === 'Unknown') return true
  if (a.windowTitle === 'Searching 4 window...') return true
  return false
}

// ── AFK auto-pause listener setup ──
let afkUnsubscribe: (() => void) | null = null

// ── Checkpoint autosave (crash recovery) ──
function startCheckpointSaving() {
  stopCheckpointSaving()
  checkpointInterval = setInterval(() => {
    const { sessionId, sessionStartTime, elapsedSeconds, status, sessionSkillXP } = useSessionStore.getState()
    if (status !== 'idle' && sessionId && sessionStartTime && window.electronAPI?.db?.saveCheckpoint) {
      window.electronAPI.db.saveCheckpoint({
        sessionId,
        startTime: sessionStartTime,
        elapsedSeconds,
        pausedAccumulated,
        sessionSkillXP,
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

export function setupAfkListener() {
  if (afkUnsubscribe) return
  const api = typeof window !== 'undefined' ? window.electronAPI : null
  if (!api?.tracker?.onIdleChange) return
  afkUnsubscribe = api.tracker.onIdleChange((idle: boolean) => {
    useSessionStore.setState({ isSystemIdle: idle })
    const { status } = useSessionStore.getState()
    if (idle && status === 'running') {
      useSessionStore.getState().pause()
      useSessionStore.setState({ isAfkPaused: true, wasAfkPausedThisSession: true })
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
    for (const a of newAch) {
      routeNotification({
        type: 'progression_achievement',
        icon: '🏅',
        title: 'Achievement unlocked',
        body: `${a.name} — ${a.description}`,
        dedupeKey: `achievement:${a.id}`,
        desktop: true,
      }, api).catch(() => {})
    }
  } else {
    playSessionCompleteSound()
  }
}

function sendStreakNotification(api: NonNullable<Window['electronAPI']>): void {
  if (!api.db?.getStreak) return
  api.db.getStreak().then((streak: number) => {
    if (streak > 0 && streak % 7 === 0) {
      routeNotification({
        type: 'progression_achievement',
        icon: '🔥',
        title: 'Streak milestone',
        body: `You're on a ${streak}-day streak! Keep going!`,
        dedupeKey: `streak-milestone:${streak}`,
        desktop: true,
      }, api).catch(() => {})
    }
  })
}

// ── Real-Time XP Tick Constants ──
const XP_TICK_INTERVAL_MS = 30_000

// ── Progression Tick Functions (skill-only model) ──
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

    // All active categories give XP; idle does not
    const cats = (currentActivity?.categories || [currentActivity?.category || 'other']).filter((c: string) => c !== 'idle')
    if (cats.length === 0) return
    const event = buildFocusTickEvent(cats, tickDurationMs / 1000)
    // Apply guild XP buff (+5% if in guild)
    const guildXpMult = getGuildXpMultiplier(useGuildStore.getState().hallLevel)
    if (guildXpMult !== 1) {
      for (const key of Object.keys(event.skillXpDelta) as (keyof typeof event.skillXpDelta)[]) {
        event.skillXpDelta[key] = Math.round((event.skillXpDelta[key] ?? 0) * guildXpMult)
      }
    }
    // Apply party XP buff (+5% if in active party with 2+ members)
    const partyXpMult = getPartyXpMultiplier(usePartyStore.getState().members.length >= 2)
    if (partyXpMult !== 1) {
      for (const key of Object.keys(event.skillXpDelta) as (keyof typeof event.skillXpDelta)[]) {
        event.skillXpDelta[key] = Math.round((event.skillXpDelta[key] ?? 0) * partyXpMult)
      }
    }
    const totalSkillDelta = Object.values(event.skillXpDelta).reduce((sum, value) => sum + value, 0)
    if (totalSkillDelta <= 0) return
    recordFocusSeconds(Math.floor(tickDurationMs / 1000))
    recordDeveloperXp(event.skillXpDelta.developer ?? 0)
    recordWeeklySkillXP(totalSkillDelta)
    const reasonEvent = makeProgressionEvent({
      ...event,
      title: 'Focus Skill XP',
      description: `+${totalSkillDelta} skill XP from ${cats.join(' + ')}`,
    })
    appendProgressionHistory(reasonEvent)
    useSessionStore.setState({
      progressionEvents: [reasonEvent, ...useSessionStore.getState().progressionEvents].slice(0, 80),
    })

    ensureInventoryHydrated()
    const focusCategory = cats.includes('coding') ? 'coding' : cats[0]
    const reward = useInventoryStore.getState().rollSkillGrindDrop(
      { source: 'skill_grind', focusCategory },
      Math.floor(tickDurationMs / 1000),
    )
    if (reward) {
      useChestDropStore.getState().enqueue(reward.id, reward.chestType)
    }

    // First-chest guarantee: new users get a guaranteed chest ~8s after starting first session
    if (elapsedSeconds >= 8 && localStorage.getItem('grindly_first_chest_pending') === '1') {
      localStorage.removeItem('grindly_first_chest_pending')
      const result = useInventoryStore.getState().rollSessionChestDrop({ source: 'skill_grind', focusCategory })
      useChestDropStore.getState().enqueue(result.rewardId, result.chestType)
    }
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
  wasAfkPausedThisSession: false,
  isSystemIdle: false,
  focusModeActive: false,
  focusModeEndsAt: null,
  focusModeDurationMs: null,
  focusModeOsApplied: false,
  streakMultiplier: 1.0,
  sessionSkillXPEarned: 0,
  pendingLevelUp: null,
  progressionEvents: [],
  sessionRewards: [],
  sessionSkillXP: {},
  skillXPAtStart: {},
  skillLevelNotified: {},
  pendingSkillLevelUpSkill: null,
  isGrindPageActive: true,
  setGrindPageActive: (v) => set({ isGrindPageActive: v }),
  async enableFocusMode(durationMs: number) {
    const safeDuration = Math.max(30_000, durationMs)
    const endsAt = Date.now() + safeDuration
    set({
      focusModeActive: true,
      focusModeEndsAt: endsAt,
      focusModeDurationMs: safeDuration,
      focusModeOsApplied: false,
    })
    const api = typeof window !== 'undefined' ? window.electronAPI : null
    if (!api?.focus?.enable) return
    try {
      await api.focus.enable(safeDuration)
      const statusInfo = await api.focus.status?.()
      set({ focusModeOsApplied: Boolean(statusInfo?.osApplied ?? false) })
    } catch {
      set({ focusModeOsApplied: false })
    }
  },
  async disableFocusMode() {
    const api = typeof window !== 'undefined' ? window.electronAPI : null
    await api?.focus?.disable?.().catch(() => {})
    set({
      focusModeActive: false,
      focusModeEndsAt: null,
      focusModeDurationMs: null,
      focusModeOsApplied: false,
    })
  },

  tick() {
    const { sessionStartTime, status, currentActivity, sessionSkillXP, skillXPAtStart, skillLevelNotified } = get()
    if (!sessionStartTime) return
    const elapsed = Math.floor((Date.now() - sessionStartTime - pausedAccumulated) / 1000)
    const updates: {
      elapsedSeconds: number
      sessionSkillXP?: Record<string, number>
      pendingSkillLevelUpSkill?: { skillId: string; level: number } | null
      skillLevelNotified?: Record<string, number>
    } = { elapsedSeconds: Math.max(0, elapsed) }
    if (status === 'running' && currentActivity) {
      const now = Date.now()
      const { focusModeActive, focusModeEndsAt } = get()
      if (focusModeActive && focusModeEndsAt && now >= focusModeEndsAt) {
        set({ focusModeActive: false, focusModeEndsAt: null, focusModeDurationMs: null, focusModeOsApplied: false })
        window.electronAPI?.focus?.disable?.().catch(() => {})
      }
      // Tick XP for ALL active categories (foreground + background)
      const cats = (currentActivity.categories || [currentActivity.category]).filter((c: string) => c !== 'idle')
      if (cats.length > 0) {
        const newSessionXP = { ...sessionSkillXP }
        let newNotified = skillLevelNotified
        // Only queue a new level-up if the modal is not already showing
        const { pendingSkillLevelUpSkill: currentPending } = get()
        const skillDelta = computeSkillXpForCategories(cats, 1)
        const perk = getEquippedPerkRuntime(useInventoryStore.getState().equippedBySlot)
        const activeFocusMultiplier = get().focusModeActive ? perk.focusBoostMultiplier : 1
        const grindlyXpMult = computeGrindlyBonuses(getGrindlyLevel()).xpMultiplier
        for (const [skillId, delta] of Object.entries(skillDelta)) {
          if (delta <= 0) continue
          const adjustedDelta = Math.max(1, Math.floor(delta * activeFocusMultiplier * grindlyXpMult))
          newSessionXP[skillId] = (newSessionXP[skillId] ?? 0) + adjustedDelta
          const baseXP = skillXPAtStart[skillId] ?? 0
          const currentXP = baseXP + (newSessionXP[skillId] ?? 0)
          const currentLevel = skillLevelFromXP(currentXP)
          const notifiedLevel = newNotified[skillId] ?? skillLevelFromXP(baseXP)
          if (currentLevel > notifiedLevel) {
            newNotified = { ...newNotified, [skillId]: currentLevel }
            track('level_up', { skill_id: skillId, new_level: currentLevel })
            // Only set pending if no modal is currently open
            if (!currentPending) {
              updates.pendingSkillLevelUpSkill = { skillId, level: currentLevel }
              publishSocialFeedEvent('skill_level_up', {
                skillId,
                level: currentLevel,
              }, { dedupeKey: `skill:${skillId}:${currentLevel}` }).catch(() => {})
            }
          }
        }
        updates.sessionSkillXP = newSessionXP
        if (newNotified !== skillLevelNotified) updates.skillLevelNotified = newNotified
      }
    }
    set(updates)
  },

  async start(options) {
    // Clear any stale intervals from a previous session that wasn't cleanly stopped
    if (tickInterval) { clearInterval(tickInterval); tickInterval = null }
    stopXpTicking()
    stopCheckpointSaving()

    const sessionId = crypto.randomUUID()
    const sessionStartTime = Date.now()
    pausedAccumulated = 0
    pauseStartedAt = 0

    const api = typeof window !== 'undefined' ? window.electronAPI : null

    const prev = get()
    const requestedFocusDurationMs = options?.focusDurationMs && options.focusDurationMs > 0
      ? options.focusDurationMs
      : null
    const preserveExistingFocus =
      !requestedFocusDurationMs &&
      prev.focusModeActive &&
      !!prev.focusModeEndsAt &&
      prev.focusModeEndsAt > Date.now()
    const focusDurationMs = requestedFocusDurationMs ?? (preserveExistingFocus ? prev.focusModeDurationMs : null)
    const focusModeEndsAt = requestedFocusDurationMs
      ? Date.now() + requestedFocusDurationMs
      : (preserveExistingFocus ? prev.focusModeEndsAt : null)
    ensureInventoryHydrated()
    const initialPerkRuntime = getEquippedPerkRuntime(useInventoryStore.getState().equippedBySlot)
    const streakShieldEvent = initialPerkRuntime.streakShield
      ? makeProgressionEvent({
          reasonCode: 'focus_tick',
          title: 'Streak shield equipped',
          description: 'Your equipped loadout includes streak protection.',
          icon: '🛡️',
          skillXpDelta: {},
          globalXpDelta: 0,
          rewards: [],
        })
      : null

    // Set status to 'running' immediately so the UI unlocks — don't block on IPC
    set({
      status: 'running',
      elapsedSeconds: 0,
      sessionId,
      sessionStartTime,
      isAfkPaused: false,
      wasAfkPausedThisSession: false,
      focusModeActive: Boolean(focusDurationMs),
      focusModeEndsAt,
      focusModeDurationMs: focusDurationMs,
      focusModeOsApplied: preserveExistingFocus ? prev.focusModeOsApplied : false,
      sessionSkillXPEarned: 0,
      pendingLevelUp: null,
      progressionEvents: streakShieldEvent ? [streakShieldEvent] : [],
      sessionRewards: [],
      sessionSkillXP: {},
      skillXPAtStart: {},
      skillLevelNotified: {},
      pendingSkillLevelUpSkill: null,
    })

    // Load skillXPAtStart asynchronously after UI is unblocked
    Promise.resolve().then(async () => {
      let skillXPAtStart: Record<string, number> = {}
      try {
        if (api?.db?.getAllSkillXP) {
          const rows = (await api.db.getAllSkillXP()) as { skill_id: string; total_xp: number }[]
          skillXPAtStart = Object.fromEntries((rows || []).map((r) => [r.skill_id, r.total_xp]))
        } else if (typeof localStorage !== 'undefined') {
          try {
            const stored = JSON.parse(localStorage.getItem('grindly_skill_xp') || '{}') as Record<string, number>
            skillXPAtStart = { ...stored }
          } catch { /* ignore */ }
        }
      } catch { /* fallback: empty */ }
      if (get().sessionId === sessionId) {
        set({ skillXPAtStart })
      }
    })
    track('session_start')

    // ── Comeback reward: 3+ days gap since last session ──────────────────────
    Promise.resolve().then(async () => {
      if (!api?.db?.getSessions) return
      const todayKey = new Date().toISOString().slice(0, 10)
      const lastComebackDate = localStorage.getItem('grindly_last_comeback_date')
      if (lastComebackDate === todayKey) return // already triggered today
      try {
        const lastSessions = (await api.db.getSessions(1)) as { end_time: number }[]
        if (lastSessions && lastSessions.length > 0) {
          const gapMs = Date.now() - lastSessions[0].end_time
          const threeDaysMs = 3 * 24 * 60 * 60 * 1000
          if (gapMs > threeDaysMs) {
            localStorage.setItem('grindly_last_comeback_date', todayKey)
            ensureInventoryHydrated()
            useInventoryStore.getState().addChest('rare_chest', 'comeback')
            routeNotification({
              type: 'progression_info',
              icon: '⚔️',
              title: 'Welcome back!',
              body: `You were away for ${Math.floor(gapMs / 86_400_000)} days. Here's a Rare Chest for returning.`,
              dedupeKey: `comeback:${todayKey}`,
            }, api)
          }
        }
      } catch { /* ignore — non-critical */ }
    })
    // ─────────────────────────────────────────────────────────────────────────

    if (api) {
      api.tracker.start()
      // AFK uses fixed 3 min threshold; passive activities (reading, learning) get extended automatically
      if (requestedFocusDurationMs && api.focus?.enable) {
        api.focus.enable(requestedFocusDurationMs)
          .then(async () => {
            const statusInfo = await api.focus?.status?.().catch(() => null)
            set({ focusModeOsApplied: Boolean(statusInfo?.osApplied ?? false) })
          })
          .catch(() => {
            set({ focusModeOsApplied: false })
          })
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
    // Clean up AFK listener so re-starting doesn't accumulate duplicate listeners
    afkUnsubscribe?.()
    afkUnsubscribe = null
    playSessionStopSound()
    const { sessionId, sessionStartTime, elapsedSeconds, wasAfkPausedThisSession, focusModeActive, focusModeOsApplied } = get()
    const api = typeof window !== 'undefined' ? window.electronAPI : null
    if ((focusModeActive || focusModeOsApplied) && api?.focus?.disable) {
      await api.focus.disable().catch(() => {})
    }
    set({ status: 'idle', pendingSkillLevelUpSkill: null })
    track('session_end', { duration_seconds: elapsedSeconds })
    const endTime = Date.now()

    // Clear checkpoint since session is ending normally.
    // We do it twice (start + end) to avoid race with an in-flight autosave tick.
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

      // Sync skills to Supabase with explicit status state
      useSkillSyncStore.getState().setSyncState({ status: 'syncing' })
      syncSkillsToSupabase(api, { maxAttempts: 3 })
        .then((result) => {
          if (result.ok) {
            useSkillSyncStore.getState().setSyncState({ status: 'success', at: result.lastSkillSyncAt })
            return
          }
          useSkillSyncStore.getState().setSyncState({
            status: 'error',
            error: result.error ?? 'Skill sync failed',
          })
        })
        .catch((err) => {
          useSkillSyncStore.getState().setSyncState({
            status: 'error',
            error: err instanceof Error ? err.message : String(err),
          })
        })

      // Achievements & XP
      const result = await processAchievementsElectron(api, sessionId)
      if (result) {
        set({
          streakMultiplier: result.streakMultiplier,
          sessionSkillXPEarned: result.sessionSkillXPEarned,
          progressionEvents: [...result.progressionEvents, ...get().progressionEvents].slice(0, 80),
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
    recordSessionWithoutAfk(!wasAfkPausedThisSession && elapsedSeconds >= 20 * 60)

    const durationFormatted = formatDuration(get().elapsedSeconds)
    const coach = api && sessionId && sessionStartTime
      ? generateSessionCoach((await api.db.getActivitiesBySessionId(sessionId) as Array<{
          category: string
          app_name?: string
          appName?: string
          start_time?: number
          end_time?: number
          startTime?: number
          endTime?: number
        }> || []).map((a) => ({
          category: a.category,
          appName: (a.app_name || a.appName || ''),
          startTime: a.start_time ?? a.startTime ?? sessionStartTime,
          endTime: a.end_time ?? a.endTime ?? endTime,
        })))
      : null

    // Achievement alerts & sounds
    showAchievementAlerts(get().newAchievements, api)

    // Streak notification
    if (api) sendStreakNotification(api)

    set({
      showComplete: true,
      lastSessionSummary: { durationFormatted, ...(coach ? { coach } : {}) },
      sessionId: null,
      sessionStartTime: null,
      focusModeActive: false,
      focusModeEndsAt: null,
      focusModeDurationMs: null,
      focusModeOsApplied: false,
    })
    api?.db?.clearCheckpoint?.().catch(() => { })

    // Show window on session end if enabled
    if (api?.window?.show && localStorage.getItem('grindly_show_window_on_session_end') !== 'false') {
      api.window.show().catch(() => {})
    }
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
    if (tickInterval) { clearInterval(tickInterval); tickInterval = null }
    tickInterval = setInterval(() => get().tick(), 1000)
    startXpTicking()
  },

  setCurrentActivity(a) {
    const now = Date.now()
    const status = get().status

    // Smooth tracker jitter: briefly keep last known activity instead of
    // instantly switching to Unknown/Searching between regular updates.
    if (isTransientUnknownActivity(a) && status === 'running') {
      if (now - lastStableActivityAt < 2200) return
    } else if (a && a.appName !== 'Window detector error') {
      lastStableActivityAt = now
    }

    set({ currentActivity: a })
  },

  setShowComplete(v) {
    set({ showComplete: v })
  },

  setLastSessionSummary(s) {
    set({ lastSessionSummary: s })
  },

  async presentRecoveryComplete(payload) {
    const api = typeof window !== 'undefined' ? window.electronAPI : null
    const rawSkillXP = payload.sessionSkillXP || {}
    const normalizedSkillXP = Object.fromEntries(
      Object.entries(rawSkillXP).filter(([skillId, xp]) => typeof skillId === 'string' && Number.isFinite(xp) && xp > 0),
    ) as Record<string, number>

    const elapsedSeconds = Math.max(0, Math.floor(payload.elapsedSeconds || 0))
    const endTime = payload.startTime + elapsedSeconds * 1000

    if (api?.db?.saveSession) {
      try {
        await api.db.saveSession({
          id: payload.sessionId,
          startTime: payload.startTime,
          endTime,
          durationSeconds: elapsedSeconds,
          summary: { recovered: true },
        })
      } catch { /* session may already exist if checkpoint was from a partial save */ }
    }

    let baseSkillXP: Record<string, number> = {}
    if (api?.db?.getAllSkillXP) {
      try {
        const rows = await api.db.getAllSkillXP()
        baseSkillXP = Object.fromEntries((rows || []).map((r) => [r.skill_id, r.total_xp]))
      } catch {
        baseSkillXP = {}
      }
    }

    const gains: SkillXPGain[] = []
    for (const [skillId, xpRaw] of Object.entries(normalizedSkillXP)) {
      const xp = Math.max(1, Math.floor(xpRaw))
      const beforeXp = baseSkillXP[skillId] ?? 0
      const afterXp = beforeXp + xp
      gains.push({
        skillId,
        xp,
        levelBefore: skillLevelFromXP(beforeXp),
        levelAfter: skillLevelFromXP(afterXp),
        totalXpAfter: afterXp,
      })
      if (api?.db?.addSkillXP) {
        await api.db.addSkillXP(skillId, xp).catch(() => {})
      }
      if (api?.db?.addSkillXPLog) {
        await api.db.addSkillXPLog(skillId, xp).catch(() => {})
      }
    }

    const totalSkillXP = gains.reduce((sum, g) => sum + g.xp, 0)
    playSessionCompleteSound()
    set({
      showComplete: true,
      lastSessionSummary: { durationFormatted: formatDuration(elapsedSeconds) },
      skillXPGains: gains,
      sessionSkillXPEarned: totalSkillXP,
      streakMultiplier: 1.0,
      newAchievements: [],
      progressionEvents: [],
      sessionRewards: [],
    })
  },

  dismissComplete() {
    set({ showComplete: false, lastSessionSummary: null, newAchievements: [], skillXPGains: [], streakMultiplier: 1.0, sessionSkillXPEarned: 0, pendingLevelUp: null, progressionEvents: [], sessionRewards: [] })
  },

  dismissLevelUp() {
    set({ pendingLevelUp: null })
  },

  dismissSkillLevelUp() {
    set({ pendingSkillLevelUpSkill: null })
  },

  async checkStreakOnMount(): Promise<number> {
    if (typeof window !== 'undefined' && window.electronAPI?.db?.getStreak) {
      const streak = await window.electronAPI.db.getStreak()
      return streak ?? 0
    }
    return 0
  },

  isStreakDone() {
    return _streakDoneThisSession
  },

  markStreakDone() {
    _streakDoneThisSession = true
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
        restoreSkillXP: (rows: { skill_id: string; total_xp: number }[]) => Promise<void>
        forceSetSkillXP?: (rows: { skill_id: string; total_xp: number }[]) => Promise<void>
        // Grind Tasks
        getTasks: () => Promise<{ id: string; text: string; done: boolean; created_at: number }[]>
        createTask: (task: { id: string; text: string }) => Promise<void>
        toggleTask: (id: string) => Promise<void>
        updateTaskText: (id: string, text: string) => Promise<void>
        deleteTask: (id: string) => Promise<void>
        clearDoneTasks: () => Promise<void>
        // Sessions (paginated)
        getSessionsPage: (limit: number, offset: number, sinceMs: number) => Promise<unknown[]>
        // Extended stats
        getDistractionMetrics: (sinceMs?: number) => Promise<unknown>
        getFocusBlocks: (sinceMs: number, minMinutes: number) => Promise<unknown[]>
        getSiteUsageStats: (sinceMs?: number) => Promise<unknown[]>
        getCategoryTrends: (days: number) => Promise<unknown[]>
        getPeriodComparison: (currentSinceMs: number, currentUntilMs: number, previousSinceMs: number, previousUntilMs: number) => Promise<unknown>
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
        saveCheckpoint: (data: {
          sessionId: string
          startTime: number
          elapsedSeconds: number
          pausedAccumulated: number
          sessionSkillXP?: Record<string, number>
        }) => Promise<void>
        getCheckpoint: () => Promise<{
          session_id: string
          start_time: number
          elapsed_seconds: number
          paused_accumulated: number
          updated_at: number
          session_skill_xp: string | null
        } | null>
        clearCheckpoint: () => Promise<void>
      }
      ai: {
        analyzeSession: (sessionId: string) => Promise<string>
        analyzeOverview: (data: unknown) => Promise<string>
        refineActivityLabels: (items: { app_name: string; window_title: string; current_category: string }[]) => Promise<{ app_name: string; window_title: string; refined_category: string; confidence: number; reason: string }[]>
      }
      settings: {
        getAutoLaunch: () => Promise<boolean>
        setAutoLaunch: (enabled: boolean) => Promise<void>
      }
      notify: {
        show: (title: string, body: string) => Promise<void>
        onSmart?: (cb: (payload: { title: string; body: string }) => void) => () => void
      }
      data: {
        exportSessions: (format: 'csv' | 'json') => Promise<string | null>
      }
      updater: {
        onStatus: (cb: (info: { status: string; version?: string }) => void) => () => void
        install: () => Promise<void>
      }
      focus?: {
        enable: (durationMs: number) => Promise<void>
        disable: () => Promise<void>
        status: () => Promise<{ active: boolean; endsAt: number | null; osApplied: boolean }>
      }
      discord?: {
        update: (data: unknown) => Promise<void>
      }
      admin?: {
        pickImageFile: () => Promise<string | null>
      }
      window?: {
        flashFrame: () => Promise<void>
        setBadgeCount: (count: number) => Promise<void>
        show: () => Promise<void>
        setAlwaysOnTop: (enabled: boolean) => Promise<void>
        getAlwaysOnTop: () => Promise<boolean>
      }
    }
  }
}
