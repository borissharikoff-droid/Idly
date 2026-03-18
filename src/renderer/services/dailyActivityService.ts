import type { ChestType } from '../lib/loot'

// ── Daily Quests ──────────────────────────────────────────────────────────────

export type DailyActivityId =
  | 'focus_minutes'
  | 'no_afk_session'
  | 'skill_xp_developer'
  | 'arena_dungeon'
  | 'harvest_crop'
  | 'craft_item'

export interface DailyActivityDef {
  id: DailyActivityId
  title: string
  description: string
  target: number
  rewardChest: ChestType
  icon: string
}

interface DailyState {
  date: string
  progress: Record<string, number>
  claimed: Record<string, boolean>
  allBonusClaimed: boolean
}

const DAILY_KEY = 'grindly_daily_activity_v2'

export const DAILY_ACTIVITY_DEFS: DailyActivityDef[] = [
  {
    id: 'focus_minutes',
    title: 'Focus Sprint',
    description: 'Accumulate 45 min of focused grind.',
    target: 45 * 60,
    rewardChest: 'common_chest',
    icon: '🎯',
  },
  {
    id: 'no_afk_session',
    title: 'No AFK Run',
    description: 'Finish a session without AFK pause.',
    target: 1,
    rewardChest: 'rare_chest',
    icon: '🔥',
  },
  {
    id: 'skill_xp_developer',
    title: 'Code Push',
    description: 'Earn 900 Developer XP in a day.',
    target: 900,
    rewardChest: 'epic_chest',
    icon: '💻',
  },
  {
    id: 'arena_dungeon',
    title: 'Dungeon Run',
    description: 'Complete 1 arena dungeon.',
    target: 1,
    rewardChest: 'rare_chest',
    icon: '⚔️',
  },
  {
    id: 'harvest_crop',
    title: 'Green Thumb',
    description: 'Harvest 2 crops from your farm.',
    target: 2,
    rewardChest: 'common_chest',
    icon: '🌾',
  },
  {
    id: 'craft_item',
    title: 'Artisan Work',
    description: 'Complete 1 crafting job.',
    target: 1,
    rewardChest: 'common_chest',
    icon: '⚒️',
  },
]

// ── Weekly Quests ─────────────────────────────────────────────────────────────

export type WeeklyActivityId = 'weekly_grind' | 'weekly_dungeons' | 'weekly_harvests' | 'weekly_crafts' | 'weekly_cooks' | 'weekly_skill_xp'

export interface WeeklyActivityDef {
  id: WeeklyActivityId
  title: string
  description: string
  target: number
  rewardChest: ChestType
  icon: string
}

interface WeeklyState {
  weekKey: string
  progress: Record<string, number>
  claimed: Record<string, boolean>
}

const WEEKLY_KEY = 'grindly_weekly_activity_v1'

export const WEEKLY_ACTIVITY_DEFS: WeeklyActivityDef[] = [
  {
    id: 'weekly_grind',
    title: 'Grind Master',
    description: 'Grind for 3 hours this week.',
    target: 3 * 3600,
    rewardChest: 'epic_chest',
    icon: '⏱',
  },
  {
    id: 'weekly_dungeons',
    title: 'Arena Champion',
    description: 'Complete 5 dungeon runs this week.',
    target: 5,
    rewardChest: 'epic_chest',
    icon: '🏆',
  },
  {
    id: 'weekly_harvests',
    title: 'Farm Baron',
    description: 'Harvest 15 crops this week.',
    target: 15,
    rewardChest: 'rare_chest',
    icon: '🌿',
  },
  {
    id: 'weekly_crafts',
    title: 'Master Crafter',
    description: 'Craft 5 items this week.',
    target: 5,
    rewardChest: 'rare_chest',
    icon: '⚒️',
  },
  {
    id: 'weekly_cooks',
    title: 'Gourmet',
    description: 'Cook 5 meals this week.',
    target: 5,
    rewardChest: 'rare_chest',
    icon: '🍳',
  },
  {
    id: 'weekly_skill_xp',
    title: 'XP Hunter',
    description: 'Earn 10,000 skill XP this week.',
    target: 10000,
    rewardChest: 'epic_chest',
    icon: '⚡',
  },
]

// ── Streak ────────────────────────────────────────────────────────────────────

interface StreakState {
  currentStreak: number
  lastCompletedDate: string
  bestStreak?: number
}

const STREAK_KEY = 'grindly_quest_streak_v1'

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayKey(): string {
  return new Date().toLocaleDateString('sv-SE')
}

function weekKey(): string {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1) // Monday start
  const monday = new Date(now)
  monday.setDate(diff)
  return monday.toLocaleDateString('sv-SE')
}

function yesterdayKey(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toLocaleDateString('sv-SE')
}

// ── Daily State ───────────────────────────────────────────────────────────────

function defaultDailyState(): DailyState {
  const progress: Record<string, number> = {}
  const claimed: Record<string, boolean> = {}
  for (const def of DAILY_ACTIVITY_DEFS) {
    progress[def.id] = 0
    claimed[def.id] = false
  }
  return { date: todayKey(), progress, claimed, allBonusClaimed: false }
}

function loadDailyState(): DailyState {
  try {
    const raw = localStorage.getItem(DAILY_KEY)
    if (!raw) return defaultDailyState()
    const parsed = JSON.parse(raw) as DailyState
    if (!parsed || parsed.date !== todayKey()) {
      // Day changed — check if yesterday had all claimed for streak
      if (parsed?.date) updateStreakOnDayChange(parsed)
      return defaultDailyState()
    }
    return parsed
  } catch {
    return defaultDailyState()
  }
}

function saveDailyState(state: DailyState): void {
  try { localStorage.setItem(DAILY_KEY, JSON.stringify(state)) } catch { /* ignore */ }
}

// Migrate from v1 key on first load
;(function migrateV1() {
  try {
    const v1 = localStorage.getItem('grindly_daily_activity_v1')
    if (!v1) return
    const parsed = JSON.parse(v1)
    if (parsed?.date === todayKey()) {
      const state = defaultDailyState()
      // Copy over existing progress/claims
      for (const key of Object.keys(parsed.progress ?? {})) {
        if (key in state.progress) state.progress[key] = parsed.progress[key]
      }
      for (const key of Object.keys(parsed.claimed ?? {})) {
        if (key in state.claimed) state.claimed[key] = parsed.claimed[key]
      }
      saveDailyState(state)
    }
    localStorage.removeItem('grindly_daily_activity_v1')
  } catch { /* ignore */ }
})()

// ── Weekly State ──────────────────────────────────────────────────────────────

function defaultWeeklyState(): WeeklyState {
  const progress: Record<string, number> = {}
  const claimed: Record<string, boolean> = {}
  for (const def of WEEKLY_ACTIVITY_DEFS) {
    progress[def.id] = 0
    claimed[def.id] = false
  }
  return { weekKey: weekKey(), progress, claimed }
}

function loadWeeklyState(): WeeklyState {
  try {
    const raw = localStorage.getItem(WEEKLY_KEY)
    if (!raw) return defaultWeeklyState()
    const parsed = JSON.parse(raw) as WeeklyState
    if (!parsed || parsed.weekKey !== weekKey()) return defaultWeeklyState()
    return parsed
  } catch {
    return defaultWeeklyState()
  }
}

function saveWeeklyState(state: WeeklyState): void {
  try { localStorage.setItem(WEEKLY_KEY, JSON.stringify(state)) } catch { /* ignore */ }
}

// ── Streak State ──────────────────────────────────────────────────────────────

function loadStreak(): StreakState {
  try {
    const raw = localStorage.getItem(STREAK_KEY)
    if (!raw) return { currentStreak: 0, lastCompletedDate: '' }
    return JSON.parse(raw) as StreakState
  } catch {
    return { currentStreak: 0, lastCompletedDate: '' }
  }
}

function saveStreak(state: StreakState): void {
  try { localStorage.setItem(STREAK_KEY, JSON.stringify(state)) } catch { /* ignore */ }
}

function updateStreakOnDayChange(prevDailyState: DailyState): void {
  const allClaimed = DAILY_ACTIVITY_DEFS.every((d) => prevDailyState.claimed[d.id])
  if (!allClaimed) return
  const streak = loadStreak()
  if (streak.lastCompletedDate === prevDailyState.date) return // already counted
  if (prevDailyState.date === yesterdayKey() || streak.currentStreak === 0) {
    streak.currentStreak++
  } else {
    streak.currentStreak = 1
  }
  streak.lastCompletedDate = prevDailyState.date
  if (streak.currentStreak > (streak.bestStreak ?? 0)) streak.bestStreak = streak.currentStreak
  saveStreak(streak)
}

// ── Public API: Daily ─────────────────────────────────────────────────────────

export function getDailyActivities() {
  const state = loadDailyState()
  return DAILY_ACTIVITY_DEFS.map((def) => {
    const progress = Math.max(0, state.progress[def.id] ?? 0)
    const completed = progress >= def.target
    const claimed = !!state.claimed[def.id]
    return { ...def, progress, completed, claimed }
  })
}

export function isDailyAllBonusClaimed(): boolean {
  const state = loadDailyState()
  return state.allBonusClaimed
}

export function isDailyAllCompleted(): boolean {
  const state = loadDailyState()
  return DAILY_ACTIVITY_DEFS.every((d) => (state.progress[d.id] ?? 0) >= d.target)
}

export function claimDailyAllBonus(): ChestType | null {
  const state = loadDailyState()
  if (state.allBonusClaimed) return null
  if (!DAILY_ACTIVITY_DEFS.every((d) => state.claimed[d.id])) return null
  state.allBonusClaimed = true
  saveDailyState(state)
  // Update streak for today
  const streak = loadStreak()
  if (streak.lastCompletedDate !== todayKey()) {
    if (streak.lastCompletedDate === yesterdayKey() || streak.currentStreak === 0) {
      streak.currentStreak++
    } else {
      streak.currentStreak = 1
    }
    streak.lastCompletedDate = todayKey()
    if (streak.currentStreak > (streak.bestStreak ?? 0)) streak.bestStreak = streak.currentStreak
    saveStreak(streak)
  }
  return 'legendary_chest'
}

export function getBestStreak(): number {
  const state = loadStreak()
  return state.bestStreak ?? state.currentStreak
}

export function recordFocusSeconds(seconds: number): void {
  if (seconds <= 0) return
  const state = loadDailyState()
  state.progress.focus_minutes = (state.progress.focus_minutes ?? 0) + Math.floor(seconds)
  saveDailyState(state)
  // Also record to weekly
  const ws = loadWeeklyState()
  ws.progress.weekly_grind = (ws.progress.weekly_grind ?? 0) + Math.floor(seconds)
  saveWeeklyState(ws)
}

export function recordDeveloperXp(xp: number): void {
  if (xp <= 0) return
  const state = loadDailyState()
  state.progress.skill_xp_developer = (state.progress.skill_xp_developer ?? 0) + Math.floor(xp)
  saveDailyState(state)
}

export function recordSessionWithoutAfk(success: boolean): void {
  if (!success) return
  const state = loadDailyState()
  state.progress.no_afk_session = Math.max(state.progress.no_afk_session ?? 0, 1)
  saveDailyState(state)
}

export function recordDungeonComplete(): void {
  const state = loadDailyState()
  state.progress.arena_dungeon = (state.progress.arena_dungeon ?? 0) + 1
  saveDailyState(state)
  const ws = loadWeeklyState()
  ws.progress.weekly_dungeons = (ws.progress.weekly_dungeons ?? 0) + 1
  saveWeeklyState(ws)
}

export function recordHarvest(count: number = 1): void {
  if (count <= 0) return
  const state = loadDailyState()
  state.progress.harvest_crop = (state.progress.harvest_crop ?? 0) + count
  saveDailyState(state)
  const ws = loadWeeklyState()
  ws.progress.weekly_harvests = (ws.progress.weekly_harvests ?? 0) + count
  saveWeeklyState(ws)
}

export function recordCraftComplete(): void {
  const state = loadDailyState()
  state.progress.craft_item = (state.progress.craft_item ?? 0) + 1
  saveDailyState(state)
  const ws = loadWeeklyState()
  ws.progress.weekly_crafts = (ws.progress.weekly_crafts ?? 0) + 1
  saveWeeklyState(ws)
}

export function recordCookComplete(): void {
  const ws = loadWeeklyState()
  ws.progress.weekly_cooks = (ws.progress.weekly_cooks ?? 0) + 1
  saveWeeklyState(ws)
}

export function recordWeeklySkillXP(xp: number): void {
  if (xp <= 0) return
  const ws = loadWeeklyState()
  ws.progress.weekly_skill_xp = (ws.progress.weekly_skill_xp ?? 0) + Math.floor(xp)
  saveWeeklyState(ws)
}

export function claimDailyActivity(activityId: DailyActivityId): ChestType | null {
  const state = loadDailyState()
  const def = DAILY_ACTIVITY_DEFS.find((x) => x.id === activityId)
  if (!def) return null
  const progress = state.progress[activityId] ?? 0
  if (progress < def.target) return null
  if (state.claimed[activityId]) return null
  state.claimed[activityId] = true
  saveDailyState(state)
  return def.rewardChest
}

// ── Public API: Weekly ────────────────────────────────────────────────────────

export function getWeeklyActivities() {
  const state = loadWeeklyState()
  return WEEKLY_ACTIVITY_DEFS.map((def) => {
    const progress = Math.max(0, state.progress[def.id] ?? 0)
    const completed = progress >= def.target
    const claimed = !!state.claimed[def.id]
    return { ...def, progress, completed, claimed }
  })
}

export function claimWeeklyActivity(activityId: WeeklyActivityId): ChestType | null {
  const state = loadWeeklyState()
  const def = WEEKLY_ACTIVITY_DEFS.find((x) => x.id === activityId)
  if (!def) return null
  const progress = state.progress[activityId] ?? 0
  if (progress < def.target) return null
  if (state.claimed[activityId]) return null
  state.claimed[activityId] = true
  saveWeeklyState(state)
  return def.rewardChest
}

// ── Public API: Streak ────────────────────────────────────────────────────────

export function getQuestStreak(): number {
  const streak = loadStreak()
  // Check if streak is still alive (completed yesterday or today)
  if (streak.lastCompletedDate !== todayKey() && streak.lastCompletedDate !== yesterdayKey()) {
    return 0
  }
  return streak.currentStreak
}
