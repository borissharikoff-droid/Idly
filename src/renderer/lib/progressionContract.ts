import { getStreakMultiplier } from './xp'
import { categoryToSkillId } from './skills'

export type ProgressionReasonCode =
  | 'focus_tick'
  | 'session_complete'
  | 'achievement_unlock'
  | 'streak_bonus'
  | 'skill_milestone'
  | 'reward_claim'

export type RewardDestination = 'global' | 'skill' | 'cosmetic'

export interface RewardGrantPayload {
  destination: RewardDestination
  amount?: number
  skillId?: string
  cosmeticKey?: string
  label: string
}

export interface ProgressionEvent {
  id: string
  createdAt: number
  reasonCode: ProgressionReasonCode
  sourceCategory?: string
  sourceSkill?: string
  durationSeconds?: number
  multiplierApplied?: number
  globalXpDelta: number
  skillXpDelta: Record<string, number>
  rewards: RewardGrantPayload[]
  title: string
  description: string
  icon?: string
}

function roundToInt(value: number): number {
  return Math.max(0, Math.round(value))
}

/**
 * Skill XP follows "time-in-skill". If multiple skills are active in a second,
 * we split the available time equally to keep total skill time bounded by duration.
 */
export function computeSkillXpForCategories(categories: string[], durationSeconds: number): Record<string, number> {
  const active = categories.filter((c) => c && c !== 'idle')
  if (durationSeconds <= 0 || active.length === 0) return {}
  const uniqueSkills = Array.from(new Set(active.map((c) => categoryToSkillId(c))))
  if (uniqueSkills.length === 0) return {}
  const totalSeconds = Math.max(0, Math.floor(durationSeconds))
  const perSkillBase = Math.floor(totalSeconds / uniqueSkills.length)
  const remainder = totalSeconds % uniqueSkills.length
  const out: Record<string, number> = {}
  uniqueSkills.forEach((skillId, idx) => {
    out[skillId] = perSkillBase + (idx < remainder ? 1 : 0)
  })
  if (Object.values(out).every((v) => v <= 0) && totalSeconds > 0) {
    // Preserve at least one awarded second when there is tracked activity.
    out[uniqueSkills[0]] = 1
  }
  return out
}

export function makeProgressionEvent(
  input: Omit<ProgressionEvent, 'id' | 'createdAt'> & { id?: string; createdAt?: number },
): ProgressionEvent {
  return {
    id: input.id ?? crypto.randomUUID(),
    createdAt: input.createdAt ?? Date.now(),
    ...input,
  }
}

export function buildFocusTickEvent(categories: string[], durationSeconds: number): ProgressionEvent {
  const globalXpDelta = 0
  const skillXpDelta = computeSkillXpForCategories(categories, durationSeconds)
  return makeProgressionEvent({
    reasonCode: 'focus_tick',
    sourceCategory: categories[0],
    sourceSkill: categories[0] ? categoryToSkillId(categories[0]) : undefined,
    durationSeconds,
    globalXpDelta,
    skillXpDelta,
    rewards: [],
    title: 'Focus Skill XP',
    description: `Active categories: ${categories.join(' + ')}`,
  })
}

export function buildSessionCompleteEvent(
  categories: string[],
  durationSeconds: number,
  streak: number,
  options: { applyStreakToSkillXp?: boolean } = {},
): ProgressionEvent {
  const streakMultiplier = getStreakMultiplier(streak)
  const skillBase = computeSkillXpForCategories(categories, durationSeconds)
  const skillXpDelta: Record<string, number> = {}
  for (const [skillId, value] of Object.entries(skillBase)) {
    skillXpDelta[skillId] = options.applyStreakToSkillXp ? roundToInt(value * streakMultiplier) : value
  }
  return makeProgressionEvent({
    reasonCode: 'session_complete',
    sourceCategory: categories[0],
    sourceSkill: categories[0] ? categoryToSkillId(categories[0]) : undefined,
    durationSeconds,
    multiplierApplied: streakMultiplier,
    globalXpDelta: 0,
    skillXpDelta,
    rewards: [],
    title: 'Session complete',
    description: `Session skill XP with streak x${streakMultiplier}`,
  })
}
