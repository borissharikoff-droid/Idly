/**
 * Skills leveling: 99 levels, ~1000 hours (3.6M seconds) to max per skill.
 * 1 XP per second of tracked activity in the mapped category.
 *
 * Early levels (1-25) use a flattened curve for faster progression and retention.
 * Levels 26+ use the original exponential curve.
 */

const MAX_LEVEL = 99
const MAX_XP = 3_600_000 // 1000 hours in seconds
const CURVE_EXPONENT = 2.2

/** XP at L10 (end of triangular segment). */
const XP_AT_L10 = 120 * 10 * 11 / 2 // 6600

/** XP at L25 from original curve (bridge to L26+). */
const XP_AT_L25 = Math.floor(Math.pow(25 / MAX_LEVEL, CURVE_EXPONENT) * MAX_XP)

/** Cumulative XP required to reach level L. Level 0 = 0 XP. */
function xpForLevel(L: number): number {
  if (L <= 0) return 0
  if (L >= MAX_LEVEL) return MAX_XP

  if (L <= 10) {
    return 120 * L * (L + 1) / 2
  }
  if (L <= 25) {
    const t = (L - 10) / 15
    return Math.floor(XP_AT_L10 + (XP_AT_L25 - XP_AT_L10) * Math.pow(t, 1.3))
  }
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
  { id: 'farmer', name: 'Farmer', icon: '🌾', color: '#84cc16', category: 'farming' },
  { id: 'warrior', name: 'Warrior', icon: '⚔️', color: '#EF4444', category: 'warrior' },
  { id: 'crafter', name: 'Crafter', icon: '⚒️', color: '#f97316', category: 'crafting' },
  { id: 'chef', name: 'Cooking', icon: '🍳', color: '#fb923c', category: 'cooking' },
  { id: 'grindly', name: 'Grindly', icon: '🏠', color: '#c084fc', category: 'grindly' },
]

/** Max total skill level (all skills at 99). */
export const MAX_TOTAL_SKILL_LEVEL = SKILLS.length * 99

/**
 * Activity verb used in friend status lines, keyed by skill id.
 * - Skills with a meaningful app context include the appName after the verb.
 * - Skills where the appName adds no value (researcher, farmer, warrior, etc.)
 *   should be displayed without appName by the calling component.
 */
export const SKILL_ACTIVITY_VERB: Record<string, string> = {
  developer:    'Coding in',
  designer:     'Designing in',
  gamer:        'Playing',
  communicator: 'Chatting on',
  researcher:   'Browsing',    // appName is just a browser — not shown
  creator:      'Creating in',
  learner:      'Studying',
  listener:     'Listening to',
  farmer:       'Farming in',
  warrior:      'Fighting in',
  crafter:      'Crafting in',
  chef:         'Cooking in',
  grindly:      'On',
}

/** Skills whose appName ("Grindly", "Chrome"…) adds no useful context for friends. */
const SKILLS_SKIP_APPNAME = new Set(['researcher', 'farmer', 'warrior', 'crafter', 'chef', 'grindly'])

/**
 * Returns the formatted activity line shown below the skill status:
 *   e.g. "Playing World of Warcraft", "Coding in VS Code", "Browsing"
 * Pass `appName = null` or the actual app display name.
 */
export function getSkillActivityLine(skillId: string | null | undefined, appName: string | null): string {
  const id = skillId ?? ''
  const verb = SKILL_ACTIVITY_VERB[id] ?? 'Using'
  if (!appName || SKILLS_SKIP_APPNAME.has(id)) return verb
  return `${verb} ${appName}`
}

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
  farming: 'farmer',
  warrior:  'warrior',
  crafting: 'crafter',
  cooking:  'chef',
  grindly:  'grindly',
  other:    'researcher',
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

/** Precomputed XP thresholds for each level (index = level). */
const XP_THRESHOLDS: readonly number[] = Array.from({ length: MAX_LEVEL + 1 }, (_, i) => xpForLevel(i))

/** Level (0–99) from total XP. 0 = no progress, 1–99 = leveled. Binary search O(log n). */
export function skillLevelFromXP(xp: number): number {
  if (xp <= 0) return 0
  if (xp >= MAX_XP) return MAX_LEVEL
  let lo = 0
  let hi = MAX_LEVEL
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (XP_THRESHOLDS[mid] <= xp) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** Progress within current level: { current, needed } in XP. */
export function skillXPProgress(xp: number): { current: number; needed: number } {
  const level = skillLevelFromXP(xp)
  const xpAtLevel = xpForLevel(level)
  if (level >= MAX_LEVEL) return { current: xpForLevel(MAX_LEVEL), needed: xpForLevel(MAX_LEVEL) }
  const xpForNext = xpForLevel(level + 1)
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

// ── Grindly skill bonuses (cumulative thresholds) ───────────────────────────

export interface GrindlyBonuses {
  /** Multiplier for all skill XP (e.g. 1.15 = +15%) */
  xpMultiplier: number
  /** Multiplier for craft time (e.g. 0.85 = -15% time) */
  craftSpeedMultiplier: number
  /** Flat bonus ATK for combat */
  atk: number
  /** Flat bonus HP for combat */
  hp: number
  /** Flat bonus HP regen for combat */
  hpRegen: number
  /** Flat bonus DEF for combat */
  def: number
}

export const GRINDLY_PERK_TABLE: { level: number; label: string }[] = [
  { level: 5,  label: '+3% All Skill XP' },
  { level: 10, label: '-5% Craft Time' },
  { level: 15, label: '+3% All Skill XP' },
  { level: 20, label: '+1 ATK, +5 HP' },
  { level: 25, label: '+4% All Skill XP' },
  { level: 30, label: '-5% Craft Time' },
  { level: 35, label: '+5 HP, +1 HP Regen' },
  { level: 40, label: '+5% All Skill XP' },
  { level: 45, label: '+1 ATK' },
  { level: 50, label: '-5% Craft Time' },
  { level: 55, label: '+5% All Skill XP' },
  { level: 60, label: '+2 ATK, +10 HP, +2 DEF' },
  { level: 65, label: '-5% Craft Time' },
  { level: 70, label: '+5% All Skill XP' },
  { level: 75, label: '+2 ATK, +10 HP, +1 HP Regen' },
  { level: 80, label: '-5% Craft Time' },
  { level: 85, label: '+5% All Skill XP' },
  { level: 90, label: '+2 ATK, +10 HP, +1 HP Regen, +3 DEF' },
  { level: 95, label: '-5% Craft Time' },
  { level: 99, label: '+5% XP, +2 ATK, +10 HP, +1 HP Regen' },
]

export function computeGrindlyBonuses(level: number): GrindlyBonuses {
  let xpPct = 0, craftPct = 0, atk = 0, hp = 0, hpRegen = 0, def = 0

  if (level >= 5)  xpPct += 3
  if (level >= 10) craftPct += 5
  if (level >= 15) xpPct += 3
  if (level >= 20) { atk += 1; hp += 5 }
  if (level >= 25) xpPct += 4
  if (level >= 30) craftPct += 5
  if (level >= 35) { hp += 5; hpRegen += 1 }
  if (level >= 40) xpPct += 5
  if (level >= 45) atk += 1
  if (level >= 50) craftPct += 5
  if (level >= 55) xpPct += 5
  if (level >= 60) { atk += 2; hp += 10; def += 2 }
  if (level >= 65) craftPct += 5
  if (level >= 70) xpPct += 5
  if (level >= 75) { atk += 2; hp += 10; hpRegen += 1 }
  if (level >= 80) craftPct += 5
  if (level >= 85) xpPct += 5
  if (level >= 90) { atk += 2; hp += 10; hpRegen += 1; def += 3 }
  if (level >= 95) craftPct += 5
  if (level >= 99) { xpPct += 5; atk += 2; hp += 10; hpRegen += 1 }

  return {
    xpMultiplier: 1 + xpPct / 100,
    craftSpeedMultiplier: 1 - craftPct / 100,
    atk,     // Max: +10
    hp,      // Max: +50
    hpRegen, // Max: +4
    def,     // Max: +5
  }
}

/** Get current Grindly skill level from localStorage (safe for any context). */
export function getGrindlyLevel(): number {
  try {
    const stored = JSON.parse(localStorage.getItem('grindly_skill_xp') || '{}') as Record<string, number>
    return skillLevelFromXP(stored['grindly'] ?? 0)
  } catch {
    return 0
  }
}

// ── Prestige System ──────────────────────────────────────────────────────────

const PRESTIGE_STORAGE_KEY = 'grindly_prestige'
const MAX_PRESTIGE = 5
/** XP bonus per prestige tier (+5% per prestige, stacks up to +25%) */
const PRESTIGE_XP_BONUS_PER_TIER = 0.05

export interface PrestigeTier {
  tier: number
  label: string
  borderColor: string
  reward?: { type: 'badge' | 'profile_frame' | 'avatar' | 'title'; value: string; label: string }
}

export const PRESTIGE_TIERS: PrestigeTier[] = [
  { tier: 1, label: 'Bronze', borderColor: '#cd7f32', reward: { type: 'badge', value: '🥉', label: 'Bronze prestige badge' } },
  { tier: 2, label: 'Silver', borderColor: '#c0c0c0', reward: { type: 'badge', value: '🥈', label: 'Silver prestige badge' } },
  { tier: 3, label: 'Gold', borderColor: '#ffd700', reward: { type: 'profile_frame', value: 'prestige_gold', label: 'Gold prestige frame' } },
  { tier: 4, label: 'Diamond', borderColor: '#b9f2ff', reward: { type: 'avatar', value: '💠', label: 'Diamond prestige avatar' } },
  { tier: 5, label: 'Void', borderColor: '#9333ea', reward: { type: 'title', value: 'Transcendent', label: 'Transcendent title' } },
]

/** Get all prestige counts from localStorage. */
export function getPrestigeCounts(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(PRESTIGE_STORAGE_KEY) || '{}') as Record<string, number>
  } catch {
    return {}
  }
}

/** Get prestige count for a specific skill. */
export function getPrestigeCount(skillId: string): number {
  return getPrestigeCounts()[skillId] ?? 0
}

/** Whether a skill can be prestiged (level 99, under max prestige). */
export function canPrestige(skillId: string, currentXp: number): boolean {
  const level = skillLevelFromXP(currentXp)
  const prestige = getPrestigeCount(skillId)
  return level >= MAX_LEVEL && prestige < MAX_PRESTIGE
}

/** Prestige a skill: reset XP to 0, increment prestige counter. Returns new prestige tier or null if not allowed. */
export function prestigeSkill(skillId: string): PrestigeTier | null {
  const counts = getPrestigeCounts()
  const current = counts[skillId] ?? 0
  if (current >= MAX_PRESTIGE) return null

  // Check current level
  try {
    const stored = JSON.parse(localStorage.getItem('grindly_skill_xp') || '{}') as Record<string, number>
    const level = skillLevelFromXP(stored[skillId] ?? 0)
    if (level < MAX_LEVEL) return null

    // Reset skill XP to 0 in localStorage
    stored[skillId] = 0
    localStorage.setItem('grindly_skill_xp', JSON.stringify(stored))
  } catch {
    return null
  }

  // Reset skill XP in SQLite (Electron mode)
  const api = (window as Window & typeof globalThis & { electronAPI?: { db?: { resetSkillXP?: (id: string) => Promise<void> } } }).electronAPI
  if (api?.db?.resetSkillXP) {
    api.db.resetSkillXP(skillId).catch(() => {})
  }

  // Increment prestige count
  const newTier = current + 1
  counts[skillId] = newTier
  localStorage.setItem(PRESTIGE_STORAGE_KEY, JSON.stringify(counts))

  return PRESTIGE_TIERS[newTier - 1] ?? null
}

/** Get the prestige XP multiplier for a skill (e.g. 1.04 for 2 prestiges). */
export function getPrestigeXpMultiplier(skillId: string): number {
  const count = getPrestigeCount(skillId)
  return 1 + count * PRESTIGE_XP_BONUS_PER_TIER
}

/** Get the prestige tier info for a skill, or null if not prestiged. */
export function getPrestigeTier(skillId: string): PrestigeTier | null {
  const count = getPrestigeCount(skillId)
  if (count <= 0) return null
  return PRESTIGE_TIERS[count - 1] ?? null
}

/**
 * Compute total skill level including prestige bonus for leaderboard.
 * Each prestige counts as 99 bonus levels.
 */
export function computeTotalSkillLevelWithPrestige(rows: { skill_id: string; total_xp: number }[]): number {
  const xpMap = new Map(rows.map((r) => [normalizeSkillId(r.skill_id), r.total_xp]))
  const prestiges = getPrestigeCounts()
  return SKILLS.reduce((sum, s) => {
    const level = skillLevelFromXP(xpMap.get(s.id) ?? 0)
    const prestigeBonus = (prestiges[s.id] ?? 0) * MAX_LEVEL
    return sum + level + prestigeBonus
  }, 0)
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
