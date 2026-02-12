/**
 * Skills leveling: 99 levels, ~1000 hours (3.6M seconds) to max per skill.
 * 1 XP per second of tracked activity in the mapped category.
 */

const MAX_LEVEL = 99
const MAX_XP = 3_600_000 // 1000 hours in seconds
const CURVE_EXPONENT = 2.2

/** Cumulative XP required to reach level L. Level 0 = 0 XP, level 1 = 1+ XP. */
function xpForLevel(L: number): number {
  if (L <= 0) return 0
  if (L === 1) return 1
  if (L >= MAX_LEVEL) return MAX_XP
  return Math.floor(Math.pow(L / MAX_LEVEL, CURVE_EXPONENT) * MAX_XP)
}

export interface SkillDef {
  id: string
  name: string
  icon: string
  color: string
  /** Tracker category that feeds this skill */
  category: string
}

export const SKILLS: SkillDef[] = [
  { id: 'developer', name: 'Developer', icon: '💻', color: '#00ff88', category: 'coding' },
  { id: 'designer', name: 'Designer', icon: '🎨', color: '#ff6b9d', category: 'design' },
  { id: 'gamer', name: 'Gamer', icon: '🎮', color: '#5865F2', category: 'games' },
  { id: 'communicator', name: 'Communicator', icon: '💬', color: '#57F287', category: 'social' },
  { id: 'researcher', name: 'Researcher', icon: '🔬', color: '#faa61a', category: 'browsing' },
  { id: 'creator', name: 'Creator', icon: '🎬', color: '#eb459e', category: 'creative' },
  { id: 'learner', name: 'Learner', icon: '📚', color: '#00d4ff', category: 'learning' },
  { id: 'listener', name: 'Listener', icon: '🎵', color: '#1db954', category: 'music' },
]

/** Max total skill level (all skills at 99). */
export const MAX_TOTAL_SKILL_LEVEL = SKILLS.length * 99

/** Category from tracker -> skill id. "other" falls back to researcher. */
const CATEGORY_TO_SKILL: Record<string, string> = {
  coding: 'developer',
  design: 'designer',
  games: 'gamer',
  social: 'communicator',
  browsing: 'researcher',
  creative: 'creator',
  learning: 'learner',
  music: 'listener',
  other: 'researcher',
}

export function categoryToSkillId(category: string): string {
  return CATEGORY_TO_SKILL[category] ?? 'researcher'
}

/**
 * Normalize skill id from Supabase/user data.
 * Supports:
 * - canonical ids: developer, communicator, etc.
 * - legacy category ids: coding, social, etc.
 * - skill names: "Developer", "Communicator", etc.
 */
export function normalizeSkillId(raw: string): string {
  if (!raw) return 'researcher'
  const value = String(raw).trim().toLowerCase()
  if (SKILLS.some((s) => s.id === value)) return value
  if (CATEGORY_TO_SKILL[value]) return CATEGORY_TO_SKILL[value]
  const byName = SKILLS.find((s) => s.name.toLowerCase() === value)
  return byName?.id ?? 'researcher'
}

export function getSkillById(skillId: string): SkillDef | undefined {
  return SKILLS.find((s) => s.id === skillId)
}

export function getSkillByName(name: string): SkillDef | undefined {
  if (!name || typeof name !== 'string') return undefined
  const n = name.trim()
  return SKILLS.find((s) => s.name.toLowerCase() === n.toLowerCase())
}

/** Level (0–99) from total XP. 0 = no progress, 1–99 = leveled. */
export function skillLevelFromXP(xp: number): number {
  if (xp <= 0) return 0
  if (xp >= MAX_XP) return MAX_LEVEL
  let level = 0
  while (level < MAX_LEVEL && xpForLevel(level + 1) <= xp) {
    level++
  }
  return level
}

/** Progress within current level: { current, needed } in XP. */
export function skillXPProgress(xp: number): { current: number; needed: number } {
  const level = skillLevelFromXP(xp)
  const xpAtLevel = xpForLevel(level)
  const xpForNext = level >= MAX_LEVEL ? xpAtLevel : xpForLevel(level + 1)
  const needed = xpForNext - xpAtLevel
  const current = xp - xpAtLevel
  return { current, needed }
}

/**
 * Compute total skill level = sum of each skill's level.
 * Unleveled (0 XP or missing) = 0. Example: listener 5 + designer 10 = 15/792.
 */
export function computeTotalSkillLevel(rows: { skill_id: string; total_xp: number }[]): number {
  const xpMap = new Map(rows.map((r) => [normalizeSkillId(r.skill_id), r.total_xp]))
  return SKILLS.reduce((sum, s) => sum + skillLevelFromXP(xpMap.get(s.id) ?? 0), 0)
}

/**
 * Compute total skill level from pre-computed levels (e.g. from user_skills table).
 * Sum of levels; missing/unleveled = 0.
 */
export function computeTotalSkillLevelFromLevels(skills: { skill_id: string; level: number }[]): number {
  const levelMap = new Map(skills.map((s) => [normalizeSkillId(s.skill_id), s.level]))
  return SKILLS.reduce((sum, s) => sum + (levelMap.get(s.id) ?? 0), 0)
}

/** Total hours for display. */
export function skillHoursFromXP(xp: number): number {
  return Math.floor(xp / 3600 * 10) / 10
}

/** Format XP (seconds) as "Xh Ym" or "Xm" if under 1h. */
export function formatSkillTime(xp: number): string {
  const totalMin = Math.floor(xp / 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  return `${m}m`
}

export interface ActivitySegmentForXP {
  category: string
  startTime: number
  endTime: number
}

/**
 * Compute XP gained per skill from activity segments (1 XP per second per segment).
 * Only selected (focused) app windows count; idle/unknown segments are skipped.
 */
export function computeSessionSkillXP(
  activities: ActivitySegmentForXP[]
): Record<string, number> {
  const bySkill: Record<string, number> = {}
  for (const a of activities) {
    if (a.category === 'idle') continue
    const skillId = categoryToSkillId(a.category)
    const seconds = Math.max(0, Math.floor((a.endTime - a.startTime) / 1000))
    bySkill[skillId] = (bySkill[skillId] ?? 0) + seconds
  }
  return bySkill
}
