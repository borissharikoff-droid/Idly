/**
 * SkillXPService — computes skill XP from activity segments and persists to DB / localStorage.
 */

import { computeSessionSkillXP, skillLevelFromXP, getGrindlyLevel, computeGrindlyBonuses, getPrestigeXpMultiplier } from '../lib/skills'
import type { SkillXPGain } from '../stores/sessionStore'
import { getEquippedPerkRuntime } from '../lib/loot'
import { ensureInventoryHydrated, useInventoryStore } from '../stores/inventoryStore'

interface SegmentForXP {
  category: string
  startTime: number
  endTime: number
}

/** Compute and save skill XP in Electron mode (SQLite). Returns gains list. */
export async function computeAndSaveSkillXPElectron(
  api: NonNullable<Window['electronAPI']>,
  segments: SegmentForXP[],
): Promise<SkillXPGain[]> {
  const gainsMap = computeSessionSkillXP(segments)
  ensureInventoryHydrated()
  const equipped = useInventoryStore.getState().equippedBySlot
  const perk = getEquippedPerkRuntime(equipped)
  const skillXPGains: SkillXPGain[] = []

  if (!api.db.addSkillXP || !api.db.getSkillXP) return skillXPGains

  const grindlyXpMult = computeGrindlyBonuses(getGrindlyLevel()).xpMultiplier
  for (const [skillId, xp] of Object.entries(gainsMap)) {
    if (xp <= 0) continue
    const prestigeMult = getPrestigeXpMultiplier(skillId)
    const multiplier = (perk.skillXpMultiplierBySkill[skillId] ?? 1) * (perk.globalXpMultiplier ?? 1) * grindlyXpMult * prestigeMult
    const adjustedXp = Math.max(1, Math.floor(xp * multiplier))
    const before = await api.db.getSkillXP(skillId)
    const levelBefore = skillLevelFromXP(before)
    await api.db.addSkillXP(skillId, adjustedXp)
    const after = before + adjustedXp
    const levelAfter = skillLevelFromXP(after)
    skillXPGains.push({ skillId, xp: adjustedXp, levelBefore, levelAfter, totalXpAfter: after })
    // Log to skill_xp_log for trends
    if (api.db.addSkillXPLog) {
      api.db.addSkillXPLog(skillId, adjustedXp).catch(() => {})
    }
  }

  return skillXPGains
}

/** Compute and save skill XP in Browser mode (localStorage). Returns gains list. */
export function computeAndSaveSkillXPBrowser(
  sessionStartTime: number,
  endTime: number,
): SkillXPGain[] {
  const segs: SegmentForXP[] = [{ category: 'browsing', startTime: sessionStartTime, endTime }]
  const gainsMap = computeSessionSkillXP(segs)
  ensureInventoryHydrated()
  const equipped = useInventoryStore.getState().equippedBySlot
  const perk = getEquippedPerkRuntime(equipped)
  const stored = JSON.parse(localStorage.getItem('grindly_skill_xp') || '{}') as Record<string, number>
  const gains: SkillXPGain[] = []

  const grindlyXpMult = computeGrindlyBonuses(getGrindlyLevel()).xpMultiplier
  for (const [skillId, xp] of Object.entries(gainsMap)) {
    if (xp <= 0) continue
    const prestigeMult = getPrestigeXpMultiplier(skillId)
    const multiplier = (perk.skillXpMultiplierBySkill[skillId] ?? 1) * (perk.globalXpMultiplier ?? 1) * grindlyXpMult * prestigeMult
    const adjustedXp = Math.max(1, Math.floor(xp * multiplier))
    const before = stored[skillId] ?? 0
    const levelBefore = skillLevelFromXP(before)
    stored[skillId] = before + adjustedXp
    gains.push({ skillId, xp: adjustedXp, levelBefore, levelAfter: skillLevelFromXP(stored[skillId]), totalXpAfter: stored[skillId] })
  }

  localStorage.setItem('grindly_skill_xp', JSON.stringify(stored))
  return gains
}
