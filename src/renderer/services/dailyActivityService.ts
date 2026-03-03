import type { ChestType } from '../lib/loot'

export type DailyActivityId = 'focus_minutes' | 'no_afk_session' | 'skill_xp_developer'

export interface DailyActivityDef {
  id: DailyActivityId
  title: string
  description: string
  target: number
  rewardChest: ChestType
}

interface DailyState {
  date: string
  progress: Record<DailyActivityId, number>
  claimed: Record<DailyActivityId, boolean>
}

const KEY = 'grindly_daily_activity_v1'

export const DAILY_ACTIVITY_DEFS: DailyActivityDef[] = [
  {
    id: 'focus_minutes',
    title: 'Focus Sprint',
    description: 'Accumulate 45 minutes of focused grind.',
    target: 45 * 60,
    rewardChest: 'common_chest',
  },
  {
    id: 'no_afk_session',
    title: 'No AFK Run',
    description: 'Finish one session without AFK pause.',
    target: 1,
    rewardChest: 'rare_chest',
  },
  {
    id: 'skill_xp_developer',
    title: 'Code Push',
    description: 'Earn 900 Developer XP in a day.',
    target: 900,
    rewardChest: 'epic_chest',
  },
]

function todayKey(): string {
  return new Date().toLocaleDateString('sv-SE')
}

function defaultState(): DailyState {
  return {
    date: todayKey(),
    progress: {
      focus_minutes: 0,
      no_afk_session: 0,
      skill_xp_developer: 0,
    },
    claimed: {
      focus_minutes: false,
      no_afk_session: false,
      skill_xp_developer: false,
    },
  }
}

function loadState(): DailyState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultState()
    const parsed = JSON.parse(raw) as DailyState
    if (!parsed || parsed.date !== todayKey()) return defaultState()
    return parsed
  } catch {
    return defaultState()
  }
}

function saveState(state: DailyState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // ignore storage failures
  }
}

export function getDailyActivities() {
  const state = loadState()
  return DAILY_ACTIVITY_DEFS.map((def) => {
    const progress = Math.max(0, state.progress[def.id] ?? 0)
    const completed = progress >= def.target
    const claimed = !!state.claimed[def.id]
    return {
      ...def,
      progress,
      completed,
      claimed,
    }
  })
}

export function recordFocusSeconds(seconds: number): void {
  if (seconds <= 0) return
  const state = loadState()
  state.progress.focus_minutes += Math.floor(seconds)
  saveState(state)
}

export function recordDeveloperXp(xp: number): void {
  if (xp <= 0) return
  const state = loadState()
  state.progress.skill_xp_developer += Math.floor(xp)
  saveState(state)
}

export function recordSessionWithoutAfk(success: boolean): void {
  if (!success) return
  const state = loadState()
  state.progress.no_afk_session = Math.max(state.progress.no_afk_session, 1)
  saveState(state)
}

export function claimDailyActivity(activityId: DailyActivityId): ChestType | null {
  const state = loadState()
  const def = DAILY_ACTIVITY_DEFS.find((x) => x.id === activityId)
  if (!def) return null
  const progress = state.progress[activityId] ?? 0
  if (progress < def.target) return null
  if (state.claimed[activityId]) return null
  state.claimed[activityId] = true
  saveState(state)
  return def.rewardChest
}
