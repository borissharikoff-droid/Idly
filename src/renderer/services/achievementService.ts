/**
 * AchievementService — checks for new achievements after a session,
 * computes explicit rewards, and returns progression events for UI/history.
 */

import { checkNewAchievements, checkSkillAchievements, checkGameAchievements, getStreakMultiplier, type AchievementDef } from '../lib/xp'
import { skillLevelFromXP } from '../lib/skills'
import { appendProgressionHistory } from '../lib/progressionHistory'
import { buildSessionCompleteEvent, makeProgressionEvent, type ProgressionEvent, type RewardGrantPayload } from '../lib/progressionContract'
import { buildRewardEvent, grantAchievementCosmetics, grantRewardPayloads, mapAchievementToRewardPayloads } from './rewardGrant'
import { getEquippedBadges, getEquippedFrame } from '../lib/cosmetics'
import { syncAchievementsToSupabase, syncCosmeticsToSupabase, syncSkillXpEventsToSupabase } from './supabaseSync'
import { publishSocialFeedEvent } from './socialFeed'
import { CHEST_DEFS } from '../lib/loot'
import { useNotificationStore } from '../stores/notificationStore'
import { ensureInventoryHydrated, useInventoryStore } from '../stores/inventoryStore'
import { rollSessionMaterialDrops } from '../lib/crafting'
import { useGoldStore } from '../stores/goldStore'
import { useAuthStore } from '../stores/authStore'
import { useAchievementStatsStore } from '../stores/achievementStatsStore'
import { useArenaStore } from '../stores/arenaStore'

export interface AchievementResult {
  streakMultiplier: number
  sessionSkillXPEarned: number
  newAchievements: { id: string; def: AchievementDef }[]
  progressionEvents: ProgressionEvent[]
}

/**
 * Check achievements, compute XP with streak multiplier, unlock cosmetics.
 * Returns the result with updated XP and new achievements.
 */
export async function processAchievementsElectron(
  api: NonNullable<Window['electronAPI']>,
  sessionId: string,
): Promise<AchievementResult | null> {
  const [sessionRow, activitiesRows, streak, userStats, unlocked] = await Promise.all([
    api.db.getSessionById(sessionId),
    api.db.getActivitiesBySessionId(sessionId),
    api.db.getStreak(),
    api.db.getUserStats(),
    api.db.getUnlockedAchievements(),
  ])

  const session = sessionRow as { duration_seconds: number; start_time: number } | null
  const acts = (activitiesRows || []) as { category: string | null; start_time: number; end_time: number }[]

  if (!session || !api.db.unlockAchievement) {
    return null
  }

  // Build canonical session-complete progression event
  const nonIdleCategories = acts
    .map((a) => a.category || 'other')
    .filter((category) => category !== 'idle')
  const sessionEvent = buildSessionCompleteEvent(nonIdleCategories, session.duration_seconds, streak, {
    applyStreakToSkillXp: false,
  })

  const streakMult = getStreakMultiplier(streak)
  const sessionSkillXP = Object.values(sessionEvent.skillXpDelta).reduce((sum, xp) => sum + xp, 0)
  const progressionEvents: ProgressionEvent[] = [
    makeProgressionEvent({
      ...sessionEvent,
      title: 'Session complete',
      description: `Base progression from ${session.duration_seconds}s`,
    }),
  ]

  // Check session-based achievements
  const newAchievementList = checkNewAchievements(session, acts, streak, userStats.totalSessions, unlocked)
  const rewardPayloads: RewardGrantPayload[] = []
  const syncedAchievementIds: string[] = []
  for (const { id, def } of newAchievementList) {
    await api.db.unlockAchievement(id).catch(() => {})
    syncedAchievementIds.push(id)
    rewardPayloads.push(...mapAchievementToRewardPayloads(def))
    grantAchievementCosmetics(id)
  }

  // Check skill-based achievements
  const updatedUnlocked = [...unlocked, ...newAchievementList.map(({ id }) => id)]
  if (api.db.getAllSkillXP) {
    const allRows = (await api.db.getAllSkillXP()) as { skill_id: string; total_xp: number }[]
    const skillLevels: Record<string, number> = {}
    for (const row of allRows) {
      skillLevels[row.skill_id] = skillLevelFromXP(row.total_xp)
    }
    const skillAch = checkSkillAchievements(skillLevels, updatedUnlocked)
    for (const { id, def } of skillAch) {
      await api.db.unlockAchievement(id).catch(() => {})
      syncedAchievementIds.push(id)
      rewardPayloads.push(...mapAchievementToRewardPayloads(def))
      grantAchievementCosmetics(id)
    }
    newAchievementList.push(...skillAch)
  }

  // Check game achievements (farming, crafting, cooking, arena, gold)
  const allUnlocked = [...updatedUnlocked, ...newAchievementList.map(({ id }) => id)]
  const achStats = useAchievementStatsStore.getState()
  const arenaState = useArenaStore.getState()
  const inv = useInventoryStore.getState()
  const totalMobKills = Object.values(arenaState.killCounts).reduce((s, v) => s + v, 0)
  const gameAch = checkGameAchievements({
    totalHarvests: achStats.totalHarvests,
    totalCrafts: achStats.totalCrafts,
    totalCooks: achStats.totalCooks,
    totalDungeonCompletions: achStats.totalDungeonCompletions,
    totalMobKills,
    maxGoldEver: achStats.maxGoldEver,
    uniqueSeedsPlanted: achStats.uniqueSeedsPlanted.length,
    clearedZoneCount: arenaState.clearedZones.length,
    hasDragonfireBlade: (inv.items['craft_dragonfire_blade'] ?? 0) > 0,
    hasCookedMythic: (inv.items['food_void_feast'] ?? 0) > 0 || (inv.items['food_dragon_roast'] ?? 0) > 0,
    hasVoidBlossom: (inv.items['void_blossom'] ?? 0) > 0,
    hasDragonKill: (arenaState.killCounts['dragon'] ?? 0) > 0,
  }, allUnlocked)
  for (const { id, def } of gameAch) {
    await api.db.unlockAchievement(id).catch(() => {})
    syncedAchievementIds.push(id)
    rewardPayloads.push(...mapAchievementToRewardPayloads(def))
    grantAchievementCosmetics(id)
  }
  newAchievementList.push(...gameAch)

  const immediateSkillRewards = rewardPayloads.filter((p) => p.destination === 'skill')
  if (immediateSkillRewards.length > 0) {
    await grantRewardPayloads(immediateSkillRewards, api)
  }
  for (const payload of rewardPayloads) {
    // Global XP destination is deprecated; keep payload for compatibility visuals only.
    if (payload.destination === 'global') continue
  }

  const categoryCounts = new Map<string, number>()
  for (const category of nonIdleCategories) {
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1)
  }
  const topCategory = Array.from(categoryCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  ensureInventoryHydrated()

  // ── Session gold reward (duration-gated, streak-boosted) ──────────────────
  const durationMin = session.duration_seconds / 60
  let sessionGold = 0
  if (durationMin >= 180) sessionGold = 120 + Math.floor(Math.random() * 81)       // 120-200
  else if (durationMin >= 120) sessionGold = 60 + Math.floor(Math.random() * 61)    // 60-120
  else if (durationMin >= 60) sessionGold = 25 + Math.floor(Math.random() * 36)     // 25-60
  else if (durationMin >= 30) sessionGold = 10 + Math.floor(Math.random() * 16)     // 10-25
  if (sessionGold > 0) {
    sessionGold = Math.floor(sessionGold * streakMult)
    useGoldStore.getState().addGold(sessionGold)
    const user = useAuthStore.getState().user
    if (user) useGoldStore.getState().syncToSupabase(user.id).catch(() => {})
    useNotificationStore.getState().push({
      type: 'progression',
      icon: '💰',
      title: `+${sessionGold} gold`,
      body: streakMult > 1 ? `Streak bonus ×${streakMult}` : 'Session reward',
    })
  }

  // ── Session chest drop (8% base + 2% per hour, cap 20%) ──────────────────
  const durationHoursForChest = session.duration_seconds / 3600
  const sessionChestChance = Math.min(0.20, 0.08 + Math.floor(durationHoursForChest) * 0.02)
  if (Math.random() < sessionChestChance) {
    const context = { source: 'session_complete' as const, focusCategory: topCategory }
    const { chestType, estimatedDropRate } = useInventoryStore.getState().rollSessionChestDrop(context)
    const chest = CHEST_DEFS[chestType]
    if (chest) {
      useNotificationStore.getState().push({
        type: 'progression',
        icon: chest.icon,
        title: `Session drop: ${chest.name}`,
        body: `Sent to Inbox • drop rate ~${estimatedDropRate}%`,
      })
    }
  }

  // Session crafting material drops — duration-gated supply for the crafting loop
  const durationHours = session.duration_seconds / 3600
  const clearedZones = useArenaStore.getState().clearedZones
  const materialDrops = rollSessionMaterialDrops(topCategory, durationHours, clearedZones)
  if (materialDrops.length > 0) {
    const inv = useInventoryStore.getState()
    for (const drop of materialDrops) {
      inv.addItem(drop.id, drop.qty)
    }
    useNotificationStore.getState().push({
      type: 'progression',
      icon: '⚒️',
      title: 'Crafting materials found',
      body: materialDrops.map((d) => `${d.qty}× ${d.name}`).join(', '),
    })
  }

  for (const ach of newAchievementList) {
    const rewards = mapAchievementToRewardPayloads(ach.def)
    const rewardEvent = buildRewardEvent({
      reasonCode: 'achievement_unlock',
      sourceCategory: ach.def.category,
      sourceSkill: ach.def.category === 'skill' ? ach.def.reward?.value : undefined,
      globalXpDelta: rewards
        .filter((r) => r.destination === 'global')
        .reduce((sum, r) => sum + (r.amount ?? 0), 0),
      skillXpDelta: rewards
        .filter((r) => r.destination === 'skill')
        .reduce<Record<string, number>>((acc, r) => {
          if (!r.skillId || !r.amount) return acc
          acc[r.skillId] = (acc[r.skillId] ?? 0) + r.amount
          return acc
        }, {}),
      rewards,
      title: `Achievement: ${ach.def.name}`,
      description: ach.def.description,
    })
    progressionEvents.push(rewardEvent)
    publishSocialFeedEvent('achievement_unlocked', {
      achievementId: ach.id,
      achievementName: ach.def.name,
      category: ach.def.category,
    }, { dedupeKey: `achievement:${ach.id}` }).catch(() => {})
  }

  for (const event of progressionEvents) appendProgressionHistory(event)

  // Best-effort cloud sync for achievements + cosmetics
  if (syncedAchievementIds.length > 0) {
    syncAchievementsToSupabase(Array.from(new Set(syncedAchievementIds))).catch(() => {})
  }
  syncSkillXpEventsToSupabase(
    Object.entries(sessionEvent.skillXpDelta).map(([skillId, xpDelta]) => ({
      skillId,
      xpDelta,
      source: 'session_complete',
      happenedAt: new Date().toISOString(),
    })),
  ).catch(() => {})
  syncCosmeticsToSupabase(getEquippedBadges(), getEquippedFrame()).catch(() => {})

  return {
    streakMultiplier: streakMult,
    sessionSkillXPEarned: sessionSkillXP,
    newAchievements: newAchievementList,
    progressionEvents,
  }
}
