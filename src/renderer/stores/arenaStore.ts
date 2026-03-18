import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  BOSSES, ZONES, BOSS_WARRIOR_XP,
  computeBattleStateAtTime, computeBattleOutcome, computePlayerStats, computeWarriorBonuses,
  computeBattleStateAtTimeWithFood, simulateBattleWithFood,
  getDailyBossId, canAffordEntry,
  type BossDef, type MobDef, type FoodLoadout,
} from '../lib/combat'
import type { CombatStats } from '../lib/loot'
import { CHEST_DEFS, LOOT_ITEMS, rollBossChestTier, type BonusMaterial, type ChestType, type LootSlot } from '../lib/loot'
import { PLANT_COMBAT_BUFFS, grantWarriorXP } from '../lib/farming'
import { getHotZoneId, HOT_CHEST_TIER_UP } from '../lib/hotZone'
import { FOOD_ITEM_MAP } from '../lib/cooking'
import { skillLevelFromXP, getGrindlyLevel, computeGrindlyBonuses } from '../lib/skills'
import { useAuthStore } from './authStore'
import { useGoldStore } from './goldStore'
import { useInventoryStore } from './inventoryStore'
import { track } from '../lib/analytics'
import { recordDungeonComplete } from '../services/dailyActivityService'
import { useAchievementStatsStore } from './achievementStatsStore'
import { useWeeklyStore } from './weeklyStore'
import { applyGuildTax } from '../services/guildService'
import { useGuildStore } from './guildStore'
import { getGuildGoldMultiplier } from '../lib/guildBuffs'

export interface ActiveBattle {
  bossId: string
  startTime: number
  /** Seed for deterministic dynamic damage PRNG. */
  battleSeed: number
  playerSnapshot: CombatStats
  bossSnapshot: BossDef | MobDef
  isDaily: boolean
  isMob?: boolean
  mobDef?: MobDef
  dungeonZoneId?: string
  foodLoadout?: FoodLoadout
}

export interface ActiveDungeon {
  zoneId: string
  mobIndex: number   // 0–2 = mobs, 3 = boss
  goldEarned: number // accumulated gold from mob kills
  startedAt: number  // wall-clock timestamp when dungeon started
  foodLoadout?: FoodLoadout
}

export interface ArenaChestDrop {
  type: ChestType; name: string; icon: string; image?: string
}

interface ArenaState {
  activeBattle: ActiveBattle | null
  activeDungeon: ActiveDungeon | null
  clearedZones: string[]
  killCounts: Record<string, number>
  dailyBossClaimedDate: string | null
  /** Whether auto-farm is currently running (persisted so ArenaPage stays mounted) */
  isAutoRunning: boolean
  setAutoRunning: (v: boolean) => void
  resultModal: { chestType: ChestType | null; itemId: string | null; goldDropped: number; bonusMaterials: BonusMaterial[]; warriorXP: number; pendingGold: number } | null
  setResultModal: (v: { chestType: ChestType | null; itemId: string | null; goldDropped: number; bonusMaterials: BonusMaterial[]; warriorXP: number; pendingGold: number } | null) => void
  recordKill: (id: string) => void
  startBattle: (bossId: string, foodLoadout?: FoodLoadout) => boolean
  startDungeon: (zoneId: string, consumablePlantId?: string | null, foodLoadout?: FoodLoadout) => boolean
  advanceDungeon: (startTimeOverride?: number) => void
  forfeitDungeon: () => void
  /** Resolves the battle (grants victory gold, applies death penalty). Returns goldLost, optional chest drop, material drop, and optional lost item. */
  endBattle: () => { goldLost: number; chest: ArenaChestDrop | null; lostItem: { name: string; icon: string; insuranceUsed?: boolean } | null; materialDrop: { id: string; name: string; icon: string; qty: number } | null; dungeonGold: number; warriorXP: number; insuranceUsed: boolean }
  /** Same as endBattle but victory gold is claimed later via notification. Returns goldLost, optional chest drop, and optional lost item. */
  endBattleWithoutGold: () => { goldLost: number; chest: ArenaChestDrop | null; lostItem: { name: string; icon: string } | null }
  getBattleState: () => ReturnType<typeof computeBattleStateAtTime> | null
  forfeitBattle: () => void
  autoRunDungeon: (zoneId: string, passCount: number, foodLoadout?: FoodLoadout) => AutoRunResult
}

/** Fraction of current gold lost on death */
const DEATH_GOLD_PENALTY = 0.08

/** Chance to lose an equipped item on death (12%) */
export const ITEM_LOSS_CHANCE = 0.12

const STORAGE_KEY = 'grindly_arena_state'

/** Read warrior level from localStorage */
function getWarriorLevel(): number {
  try {
    const stored = JSON.parse(localStorage.getItem('grindly_skill_xp') || '{}') as Record<string, number>
    return skillLevelFromXP(stored['warrior'] ?? 0)
  } catch {
    return 0
  }
}

/** On startup, clear any truly invalid battles left in persisted state. */
function clearStaleActiveBattle() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    const ab = parsed?.state?.activeBattle
    if (!ab) return
    // Backfill battleSeed for persisted battles from before dynamic damage
    if (ab && !ab.battleSeed) {
      ab.battleSeed = (ab.startTime ^ 0x9E3779B9) >>> 0
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed))
    }
    // Only clear truly invalid battles (bad timestamps) — completed battles are
    // kept so useArenaBattleTick can resolve them and grant rewards on next open
    if (!ab.startTime || ab.startTime <= 0 || ab.startTime > Date.now()) {
      parsed.state.activeBattle = null
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed))
    }
  } catch {
    // ignore
  }
}
clearStaleActiveBattle()

function rollMaterial(mob: MobDef, dropMultiplier = 1): { id: string; qty: number } | null {
  if (!mob.materialDropId || !mob.materialDropChance) return null
  const chance = Math.min(1, mob.materialDropChance * dropMultiplier)
  if (Math.random() >= chance) return null
  const qty = mob.materialDropQty ?? 1
  return { id: mob.materialDropId, qty: dropMultiplier > 1 ? qty * 2 : qty }
}

function randomGold(min: number, max: number, goldMultiplier = 1): number {
  const base = min + Math.floor(Math.random() * (max - min + 1))
  return Math.round(base * goldMultiplier)
}

/** Compute combined gold multiplier from food loadout. Returns 1 if no food bonus. */
function getFoodGoldMultiplier(foodLoadout: FoodLoadout | undefined): number {
  if (!foodLoadout) return 1
  let pct = 0
  for (const slot of foodLoadout) {
    if (!slot) continue
    const def = FOOD_ITEM_MAP[slot.foodId]
    if (def?.effect?.goldBonusPct) pct += def.effect.goldBonusPct
  }
  return 1 + pct / 100
}

/** Compute combined drop bonus multiplier from food loadout. Returns 1 if no bonus. */
function getFoodDropMultiplier(foodLoadout: FoodLoadout | undefined): number {
  if (!foodLoadout) return 1
  let pct = 0
  for (const slot of foodLoadout) {
    if (!slot) continue
    const def = FOOD_ITEM_MAP[slot.foodId]
    if (def?.effect?.dropBonusPct) pct += def.effect.dropBonusPct
  }
  return 1 + pct / 100
}

/** Generate a battle seed from timestamp + random bits for dynamic damage PRNG. */
function makeBattleSeed(): number {
  return (Date.now() ^ (Math.random() * 0xFFFFFFFF)) >>> 0
}

/** Roll item loss on dungeon death. Returns name+icon of the lost item, or null if roll missed or nothing equipped.
 *  If the player owns a death_insurance consumable, it is consumed instead and no item is lost.
 *  Also returns `insuranceUsed` flag so UI can show feedback. */
function loseRandomEquippedItem(): { name: string; icon: string; insuranceUsed?: boolean } | null {
  if (Math.random() > ITEM_LOSS_CHANCE) return null
  const inv = useInventoryStore.getState()
  // Death Insurance: auto-consume to prevent item loss
  if ((inv.items['death_insurance'] ?? 0) > 0) {
    inv.deleteItem('death_insurance', 1)
    return { name: '', icon: '', insuranceUsed: true }
  }
  const slots = Object.keys(inv.equippedBySlot) as LootSlot[]
  if (slots.length === 0) return null
  const slot = slots[Math.floor(Math.random() * slots.length)]
  const itemId = inv.equippedBySlot[slot]
  if (!itemId) return null
  const itemDef = LOOT_ITEMS.find((x) => x.id === itemId)
  inv.unequipSlot(slot as LootSlot) // force-unequip first
  inv.deleteItem(itemId, 1)          // destroy only 1 copy
  return itemDef ? { name: itemDef.name, icon: itemDef.icon } : { name: itemId, icon: '📦' }
}

export interface AutoRunChestResult {
  chestType: ChestType
  itemId: string | null
  goldDropped: number
  bonusMaterials: BonusMaterial[]
}

export interface AutoRunResult {
  runsCompleted: number
  totalGold: number
  totalWarriorXP: number
  materials: { id: string; name: string; icon: string; qty: number }[]
  chests: ChestType[]
  chestResults: AutoRunChestResult[]
  failed: boolean
  failedAt?: string
  lostItem?: { name: string; icon: string } | null
  passesUsed: number
  foodUsed?: Array<{ foodId: string; qty: number }>
}

export const useArenaStore = create<ArenaState>()(
  persist(
    (set, get) => ({
      activeBattle: null,
      activeDungeon: null,
      clearedZones: [],
      killCounts: {},
      dailyBossClaimedDate: null,
      isAutoRunning: false,
      resultModal: null,

      setAutoRunning: (v) => set({ isAutoRunning: v }),
      setResultModal: (v) => set({ resultModal: v }),

      recordKill(id: string) {
        set((s) => ({
          killCounts: { ...s.killCounts, [id]: (s.killCounts[id] ?? 0) + 1 },
        }))
      },

      startBattle(bossId: string, foodLoadout?: FoodLoadout) {
        const boss = BOSSES.find((b) => b.id === bossId)
        if (!boss) return false

        const { equippedBySlot, permanentStats } = useInventoryStore.getState()
        const warriorLevel = getWarriorLevel()
        const warriorBonuses = computeWarriorBonuses(warriorLevel)
        const grindlyBonuses = computeGrindlyBonuses(getGrindlyLevel())
        const playerSnapshot = computePlayerStats(equippedBySlot, permanentStats, {
          atk: warriorBonuses.atk + grindlyBonuses.atk,
          hp: warriorBonuses.hp + grindlyBonuses.hp,
          hpRegen: warriorBonuses.hpRegen + grindlyBonuses.hpRegen,
          def: warriorBonuses.def + grindlyBonuses.def,
        })

        const { dailyBossClaimedDate } = get()
        const today = new Date().toLocaleDateString('sv-SE')
        const isDaily = getDailyBossId() === bossId && dailyBossClaimedDate !== today

        const CHEST_TIER_UP: Record<ChestType, ChestType> = {
          common_chest: 'rare_chest',
          rare_chest: 'epic_chest',
          epic_chest: 'legendary_chest',
          legendary_chest: 'legendary_chest',
        }
        const bossSnapshot = isDaily
          ? { ...boss, rewards: { chestTier: CHEST_TIER_UP[boss.rewards.chestTier] } }
          : boss

        // Snapshot food loadout (consume from inventory at battle resolution, not at start)
        const snapshotFood = foodLoadout?.filter(Boolean).length ? foodLoadout : undefined

        set({
          activeBattle: {
            bossId,
            startTime: Date.now(),
            battleSeed: makeBattleSeed(),
            playerSnapshot,
            bossSnapshot,
            isDaily,
            isMob: false,
            foodLoadout: snapshotFood,
          },
        })
        track('arena_battle_start', { boss_id: bossId, is_daily: isDaily })
        return true
      },

      startDungeon(zoneId: string, consumablePlantId?: string | null, foodLoadout?: FoodLoadout) {
        const zone = ZONES.find((z) => z.id === zoneId)
        if (!zone) return false

        const inv = useInventoryStore.getState()

        // Check & consume entry cost
        if (zone.entryCost && zone.entryCost.length > 0) {
          if (!canAffordEntry(zone, inv.items)) return false
          for (const c of zone.entryCost) {
            inv.deleteItem(c.itemId, c.quantity)
          }
        }

        const { equippedBySlot, permanentStats } = inv
        const warriorLevel = getWarriorLevel()
        const warriorBonuses = computeWarriorBonuses(warriorLevel)
        const grindlyBonuses = computeGrindlyBonuses(getGrindlyLevel())

        // Apply plant buff if provided
        let consumableBuff = { atk: 0, hp: 0, hpRegen: 0, def: 0 }
        if (consumablePlantId) {
          const buff = PLANT_COMBAT_BUFFS[consumablePlantId]
          if (buff) {
            consumableBuff = { atk: buff.atk, hp: buff.hp, hpRegen: buff.hpRegen, def: buff.def ?? 0 }
            // Consume the plant
            inv.deleteItem(consumablePlantId, 1)
          }
        }

        const additionalBonuses = {
          atk: warriorBonuses.atk + grindlyBonuses.atk + consumableBuff.atk,
          hp: warriorBonuses.hp + grindlyBonuses.hp + consumableBuff.hp,
          hpRegen: warriorBonuses.hpRegen + grindlyBonuses.hpRegen + consumableBuff.hpRegen,
          def: warriorBonuses.def + grindlyBonuses.def + consumableBuff.def,
        }
        const playerSnapshot = computePlayerStats(equippedBySlot, permanentStats, additionalBonuses)

        // Snapshot food loadout (consume from inventory at battle resolution, not at start)
        const snapshotFood = foodLoadout?.filter(Boolean).length ? foodLoadout : undefined

        const mob = zone.mobs[0]
        set({
          activeDungeon: { zoneId, mobIndex: 0, goldEarned: 0, startedAt: Date.now(), foodLoadout: snapshotFood },
          activeBattle: {
            bossId: mob.id,
            startTime: Date.now(),
            battleSeed: makeBattleSeed(),
            playerSnapshot,
            bossSnapshot: mob as unknown as BossDef,
            isDaily: false,
            isMob: true,
            mobDef: mob,
            dungeonZoneId: zoneId,
            foodLoadout: snapshotFood,
          },
        })
        track('arena_dungeon_start', { zone_id: zoneId })
        return true
      },

      advanceDungeon(startTimeOverride?: number) {
        const { activeDungeon } = get()
        if (!activeDungeon) return

        const zone = ZONES.find((z) => z.id === activeDungeon.zoneId)
        if (!zone) return

        const nextIndex = activeDungeon.mobIndex + 1
        const { equippedBySlot, permanentStats } = useInventoryStore.getState()
        const warriorLevel = getWarriorLevel()
        const warriorBonuses = computeWarriorBonuses(warriorLevel)
        const grindlyBonuses = computeGrindlyBonuses(getGrindlyLevel())
        const playerSnapshot = computePlayerStats(equippedBySlot, permanentStats, {
          atk: warriorBonuses.atk + grindlyBonuses.atk,
          hp: warriorBonuses.hp + grindlyBonuses.hp,
          hpRegen: warriorBonuses.hpRegen + grindlyBonuses.hpRegen,
          def: warriorBonuses.def + grindlyBonuses.def,
        })

        // Preserve food loadout from dungeon (persists across mob→mob→boss)
        const carryFood = activeDungeon.foodLoadout

        if (nextIndex < 3) {
          // Next mob
          const mob = zone.mobs[nextIndex]
          set({
            activeDungeon: { ...activeDungeon, mobIndex: nextIndex },
            activeBattle: {
              bossId: mob.id,
              startTime: startTimeOverride ?? Date.now(),
              battleSeed: makeBattleSeed(),
              playerSnapshot,
              bossSnapshot: mob as unknown as BossDef,
              isDaily: false,
              isMob: true,
              mobDef: mob,
              dungeonZoneId: activeDungeon.zoneId,
              foodLoadout: carryFood,
            },
          })
        } else {
          // Start boss fight
          const boss = zone.boss
          set({
            activeDungeon: { ...activeDungeon, mobIndex: 3 },
            activeBattle: {
              bossId: boss.id,
              startTime: startTimeOverride ?? Date.now(),
              battleSeed: makeBattleSeed(),
              playerSnapshot,
              bossSnapshot: boss,
              isDaily: false,
              isMob: false,
              dungeonZoneId: activeDungeon.zoneId,
              foodLoadout: carryFood,
            },
          })
        }
      },

      forfeitDungeon() {
        set({ activeBattle: null, activeDungeon: null })
      },

      endBattle() {
        const { activeBattle, activeDungeon } = get()
        if (!activeBattle) return { goldLost: 0, chest: null, lostItem: null, materialDrop: null, dungeonGold: 0, warriorXP: 0, insuranceUsed: false }

        const fightElapsed = (Date.now() - activeBattle.startTime) / 1000
        let state: ReturnType<typeof computeBattleStateAtTime>
        let foodConsumed: Array<{ foodId: string; qty: number }> = []

        if (activeBattle.foodLoadout?.some(Boolean)) {
          // Use time-based food simulation (respects actual elapsed wall-clock time)
          const foodState = computeBattleStateAtTimeWithFood(
            activeBattle.playerSnapshot,
            activeBattle.bossSnapshot,
            activeBattle.foodLoadout,
            fightElapsed,
            0.5,
            activeBattle.battleSeed,
          )
          state = foodState
          // Count consumed food from events + compute from simulation
          const consumed: Record<string, number> = {}
          for (const ev of foodState.foodEvents) {
            consumed[ev.foodId] = (consumed[ev.foodId] ?? 0) + 1
          }
          foodConsumed = Object.entries(consumed).map(([foodId, qty]) => ({ foodId, qty }))
          // Consume used food from inventory
          for (const fc of foodConsumed) {
            useInventoryStore.getState().deleteItem(fc.foodId, fc.qty)
          }
        } else {
          state = computeBattleStateAtTime(
            activeBattle.playerSnapshot,
            activeBattle.bossSnapshot,
            fightElapsed,
            activeBattle.battleSeed,
          )
        }
        let goldLost = 0
        let droppedChest: ArenaChestDrop | null = null
        let lostItem: { name: string; icon: string; insuranceUsed?: boolean } | null = null
        let matDrop: { id: string; name: string; icon: string; qty: number } | null = null
        let dungeonGold = 0
        let warriorXP = 0
        let insuranceUsed = false

        if (activeBattle.isMob && activeBattle.mobDef) {
          // Mob battle
          const mob = activeBattle.mobDef
          if (state.victory) {
            get().recordKill(mob.id)
            useWeeklyStore.getState().incrementKill()
            const hotZoneId = getHotZoneId()
            const isHotZone = activeBattle.dungeonZoneId === hotZoneId
            const goldMult = (isHotZone ? 2 : 1) * getFoodGoldMultiplier(activeBattle.foodLoadout) * getGuildGoldMultiplier(useGuildStore.getState().hallLevel)
            const dropMult = (isHotZone ? 2 : 1) * getFoodDropMultiplier(activeBattle.foodLoadout)
            const gold = randomGold(mob.goldMin, mob.goldMax, goldMult)
            const user = useAuthStore.getState().user
            // Guild tax (fire-and-forget)
            import('./guildStore').then(({ useGuildStore }) => {
              const gs = useGuildStore.getState()
              const taxPct = gs.myGuild?.tax_rate_pct ?? 0
              if (taxPct > 0 && user && gs.myGuild) {
                applyGuildTax(user.id, gs.myGuild.id, gold, taxPct).then((taxed) => {
                  if (taxed > 0) useGoldStore.getState().addGold(-taxed)
                }).catch(() => {})
              }
            }).catch(() => {})
            useGoldStore.getState().addGold(gold)
            if (user) useGoldStore.getState().syncToSupabase(user.id)

            void grantWarriorXP(mob.xpReward)
            warriorXP = mob.xpReward

            const materialDrop = rollMaterial(mob, dropMult)
            if (materialDrop) {
              useInventoryStore.getState().addItem(materialDrop.id, materialDrop.qty)
              const matItem = LOOT_ITEMS.find((x) => x.id === materialDrop.id)
              matDrop = { id: materialDrop.id, name: matItem?.name ?? materialDrop.id, icon: matItem?.icon ?? '📦', qty: materialDrop.qty }
            }

            if (activeDungeon) {
              set((s) => ({
                activeBattle: null,
                activeDungeon: s.activeDungeon
                  ? { ...s.activeDungeon, goldEarned: (s.activeDungeon.goldEarned) + gold }
                  : null,
              }))
            } else {
              set({ activeBattle: null })
            }
          } else {
            // Mob defeat: 10% gold penalty + item loss + dungeon reset
            const currentGold = useGoldStore.getState().gold
            goldLost = Math.floor(currentGold * DEATH_GOLD_PENALTY)
            if (goldLost > 0) {
              useGoldStore.getState().addGold(-goldLost)
              const user = useAuthStore.getState().user
              if (user) useGoldStore.getState().syncToSupabase(user.id)
            }
            lostItem = loseRandomEquippedItem()
            if (lostItem?.insuranceUsed) { insuranceUsed = true; lostItem = null }
            track('dungeon_death', { zone_id: activeBattle.dungeonZoneId ?? activeDungeon?.zoneId ?? null, gold_lost: goldLost })
            set({ activeBattle: null, activeDungeon: null })
          }
        } else {
          // Boss battle
          if (state.victory) {
            get().recordKill(activeBattle.bossSnapshot.id)
            useWeeklyStore.getState().incrementKill()
            const bossForChest = activeBattle.bossSnapshot as BossDef
            const hotZoneId2 = getHotZoneId()
            const isBossHotZone = activeBattle.dungeonZoneId === hotZoneId2
            const bossDropMult = (isBossHotZone ? 2 : 1) * getFoodDropMultiplier(activeBattle.foodLoadout)
            if (bossForChest.rewards?.chestTier) {
              const baseTier = isBossHotZone
                ? (HOT_CHEST_TIER_UP[bossForChest.rewards.chestTier] as ChestType ?? bossForChest.rewards.chestTier)
                : bossForChest.rewards.chestTier
              const rolledTier = rollBossChestTier(baseTier)
              if (rolledTier) {
                // Add rolled chest to inventory
                useInventoryStore.getState().addChest(rolledTier, 'session_complete', 100)
                const chest = CHEST_DEFS[rolledTier]
                if (chest) {
                  droppedChest = {
                    type: rolledTier, name: chest.name,
                    icon: activeBattle.isDaily ? '⭐' : chest.icon, image: chest.image,
                  }
                }
              }
            }
            // Grant warrior XP for boss kill
            const bossWarriorXP = BOSS_WARRIOR_XP[activeBattle.bossSnapshot.id] ?? 0
            if (bossWarriorXP > 0) {
              void grantWarriorXP(bossWarriorXP)
              warriorXP = bossWarriorXP
            }

            // Grant boss-exclusive material drop (doubled on hot zone)
            if (bossForChest.materialDropId) {
              const qty = Math.round((bossForChest.materialDropQty ?? 1) * (isBossHotZone ? 2 : 1))
              useInventoryStore.getState().addItem(bossForChest.materialDropId, qty)
              const matItem = LOOT_ITEMS.find((i) => i.id === bossForChest.materialDropId)
              matDrop = { id: bossForChest.materialDropId, name: matItem?.name ?? bossForChest.materialDropId, icon: matItem?.icon ?? '📦', qty }
            }
            void bossDropMult // used above for chest tier

            // If this was the dungeon boss, mark zone cleared and grant accumulated gold
            // Mark daily boss as claimed
            if (activeBattle.isDaily) {
              const today = new Date().toLocaleDateString('sv-SE')
              set({ dailyBossClaimedDate: today })
            }

            if (activeBattle.dungeonZoneId) {
              const { activeDungeon: dungeonSnap } = get()
              if (dungeonSnap) {
                dungeonGold = dungeonSnap.goldEarned
                if (dungeonGold > 0) {
                  useGoldStore.getState().addGold(dungeonGold)
                  const user = useAuthStore.getState().user
                  if (user) useGoldStore.getState().syncToSupabase(user.id)
                }
              }
              const dungeonZoneForTrack = activeBattle.dungeonZoneId!
              set((s) => ({
                activeBattle: null,
                activeDungeon: null,
                clearedZones: s.clearedZones.includes(activeBattle.dungeonZoneId!)
                  ? s.clearedZones
                  : [...s.clearedZones, activeBattle.dungeonZoneId!],
              }))
              recordDungeonComplete()
              useAchievementStatsStore.getState().incrementDungeonCompletions()
              track('dungeon_complete', { zone_id: dungeonZoneForTrack, total_gold: dungeonGold, rooms_cleared: 4 })
              track('boss_kill', { zone_id: dungeonZoneForTrack, boss_id: activeBattle.bossSnapshot.id, gold_earned: dungeonGold })
            } else {
              set({ activeBattle: null })
              track('boss_kill', { zone_id: null, boss_id: activeBattle.bossSnapshot.id, gold_earned: 0 })
            }
          } else {
            // Death penalty + item loss on dungeon death
            const currentGold = useGoldStore.getState().gold
            goldLost = Math.floor(currentGold * DEATH_GOLD_PENALTY)
            if (goldLost > 0) {
              useGoldStore.getState().addGold(-goldLost)
              const user = useAuthStore.getState().user
              if (user) useGoldStore.getState().syncToSupabase(user.id)
            }
            if (activeBattle.dungeonZoneId) {
              lostItem = loseRandomEquippedItem()
              if (lostItem?.insuranceUsed) { insuranceUsed = true; lostItem = null }
              track('dungeon_death', { zone_id: activeBattle.dungeonZoneId, gold_lost: goldLost })
            }
            set({ activeBattle: null, activeDungeon: null })
          }
        }

        return { goldLost, chest: droppedChest, lostItem, materialDrop: matDrop, dungeonGold, warriorXP, insuranceUsed }
      },

      endBattleWithoutGold() {
        const { activeBattle } = get()
        let goldLost = 0
        let droppedChest: ArenaChestDrop | null = null
        let lostItem: { name: string; icon: string } | null = null
        if (activeBattle) {
          const fightElapsed = (Date.now() - activeBattle.startTime) / 1000
          const state = computeBattleStateAtTime(
            activeBattle.playerSnapshot,
            activeBattle.bossSnapshot,
            fightElapsed,
            activeBattle.battleSeed,
          )
          if (state.victory) {
            get().recordKill(activeBattle.bossSnapshot.id)
            const bossForChest = activeBattle.bossSnapshot as BossDef
            if (bossForChest.rewards?.chestTier) {
              const rolledTier = rollBossChestTier(bossForChest.rewards.chestTier)
              if (rolledTier) {
                useInventoryStore.getState().addChest(rolledTier, 'session_complete', 100)
                const chest = CHEST_DEFS[rolledTier]
                if (chest) droppedChest = { type: rolledTier, name: chest.name, icon: activeBattle.isDaily ? '⭐' : chest.icon, image: chest.image }
              }
            }
            const bossWarriorXP = BOSS_WARRIOR_XP[activeBattle.bossSnapshot.id] ?? 0
            if (bossWarriorXP > 0) void grantWarriorXP(bossWarriorXP)
            // Boss-exclusive material drop
            if (bossForChest.materialDropId) {
              useInventoryStore.getState().addItem(bossForChest.materialDropId, bossForChest.materialDropQty ?? 1)
            }
            // Grant accumulated dungeon gold (mob gold) — same as endBattle
            if (activeBattle.dungeonZoneId) {
              const { activeDungeon: dungeonSnap } = get()
              if (dungeonSnap && dungeonSnap.goldEarned > 0) {
                useGoldStore.getState().addGold(dungeonSnap.goldEarned)
                const user = useAuthStore.getState().user
                if (user) useGoldStore.getState().syncToSupabase(user.id)
              }
              // Mark zone as cleared
              set((s) => ({
                activeBattle: null,
                activeDungeon: null,
                clearedZones: s.clearedZones.includes(activeBattle.dungeonZoneId!)
                  ? s.clearedZones
                  : [...s.clearedZones, activeBattle.dungeonZoneId!],
              }))
              recordDungeonComplete()
              useAchievementStatsStore.getState().incrementDungeonCompletions()
              return { goldLost, chest: droppedChest, lostItem }
            }
          } else {
            const currentGold = useGoldStore.getState().gold
            goldLost = Math.floor(currentGold * DEATH_GOLD_PENALTY)
            if (goldLost > 0) {
              useGoldStore.getState().addGold(-goldLost)
              const user = useAuthStore.getState().user
              if (user) useGoldStore.getState().syncToSupabase(user.id)
            }
            if (activeBattle.dungeonZoneId) {
              lostItem = loseRandomEquippedItem()
            }
          }
        }
        set({ activeBattle: null, activeDungeon: null })
        return { goldLost, chest: droppedChest, lostItem }
      },

      getBattleState() {
        const { activeBattle } = get()
        if (!activeBattle) return null

        const elapsedSeconds = (Date.now() - activeBattle.startTime) / 1000

        if (activeBattle.foodLoadout?.some(Boolean)) {
          return computeBattleStateAtTimeWithFood(
            activeBattle.playerSnapshot,
            activeBattle.bossSnapshot,
            activeBattle.foodLoadout,
            elapsedSeconds,
            0.5,
            activeBattle.battleSeed,
          )
        }

        return computeBattleStateAtTime(
          activeBattle.playerSnapshot,
          activeBattle.bossSnapshot,
          elapsedSeconds,
          activeBattle.battleSeed,
        )
      },

      forfeitBattle() {
        set({ activeBattle: null, activeDungeon: null })
      },

      autoRunDungeon(zoneId: string, passCount: number, foodLoadout?: FoodLoadout): AutoRunResult {
        const zone = ZONES.find((z) => z.id === zoneId)
        if (!zone) return { runsCompleted: 0, totalGold: 0, totalWarriorXP: 0, materials: [], chests: [], chestResults: [], failed: false, passesUsed: 0 }

        const inv = useInventoryStore.getState()
        const passes = inv.items['dungeon_pass'] ?? 0
        const actualRuns = Math.min(passCount, passes)
        if (actualRuns <= 0) return { runsCompleted: 0, totalGold: 0, totalWarriorXP: 0, materials: [], chests: [], chestResults: [], failed: false, passesUsed: 0 }

        let totalGold = 0
        let totalWarriorXP = 0
        const materialMap: Record<string, { name: string; icon: string; qty: number }> = {}
        const chests: ChestType[] = []
        const chestResults: AutoRunChestResult[] = []
        let runsCompleted = 0
        let failed = false
        let failedAt: string | undefined
        let lostItem: { name: string; icon: string } | null | undefined
        let passesUsed = 0

        for (let i = 0; i < actualRuns && !failed; i++) {
          const freshInv = useInventoryStore.getState()
          // Check entry cost
          if (!canAffordEntry(zone, freshInv.items)) break

          // Consume entry cost
          for (const c of zone.entryCost ?? []) {
            useInventoryStore.getState().deleteItem(c.itemId, c.quantity)
          }

          // Consume 1 pass
          useInventoryStore.getState().deleteItem('dungeon_pass', 1)
          passesUsed++

          // Compute player stats
          const { equippedBySlot, permanentStats } = useInventoryStore.getState()
          const warriorLevel = getWarriorLevel()
          const warriorBonuses = computeWarriorBonuses(warriorLevel)
          const grindlyBonuses = computeGrindlyBonuses(getGrindlyLevel())
          const playerSnapshot = computePlayerStats(equippedBySlot, permanentStats, {
            atk: warriorBonuses.atk + grindlyBonuses.atk,
            hp: warriorBonuses.hp + grindlyBonuses.hp,
            hpRegen: warriorBonuses.hpRegen + grindlyBonuses.hpRegen,
            def: warriorBonuses.def + grindlyBonuses.def,
          })

          // Clone food loadout for this run (quantities deplete per run)
          const runFood = foodLoadout?.map(s => s ? { ...s } : null)

          // Hot zone + food multipliers for this run
          const autoHotZone = getHotZoneId() === zoneId
          const autoGoldMult = (autoHotZone ? 2 : 1) * getFoodGoldMultiplier(foodLoadout)
          const autoDropMult = (autoHotZone ? 2 : 1) * getFoodDropMultiplier(foodLoadout)

          // Fight 3 mobs
          for (let m = 0; m < 3 && !failed; m++) {
            const mob = zone.mobs[m]
            let outcome: { willWin: boolean; foodConsumed?: Array<{ foodId: string; qty: number }> }
            if (runFood?.some(Boolean)) {
              const r = simulateBattleWithFood(playerSnapshot, mob as unknown as BossDef, runFood, 0.5, makeBattleSeed())
              outcome = { willWin: r.willWin, foodConsumed: r.foodConsumed }
              // Deplete food from runFood slots
              for (const fc of r.foodConsumed) {
                for (const slot of runFood) {
                  if (slot && slot.foodId === fc.foodId) { slot.qty -= fc.qty; break }
                }
                useInventoryStore.getState().deleteItem(fc.foodId, fc.qty)
              }
            } else {
              outcome = computeBattleOutcome(playerSnapshot, mob as unknown as BossDef)
            }
            if (outcome.willWin) {
              const gold = randomGold(mob.goldMin, mob.goldMax, autoGoldMult)
              totalGold += gold
              void grantWarriorXP(mob.xpReward)
              totalWarriorXP += mob.xpReward
              const drop = rollMaterial(mob, autoDropMult)
              if (drop) {
                useInventoryStore.getState().addItem(drop.id, drop.qty)
                const matItem = LOOT_ITEMS.find((x) => x.id === drop.id)
                if (materialMap[drop.id]) {
                  materialMap[drop.id].qty += drop.qty
                } else {
                  materialMap[drop.id] = { name: matItem?.name ?? drop.id, icon: matItem?.icon ?? '📦', qty: drop.qty }
                }
              }
            } else {
              failed = true
              failedAt = mob.name
              // Death penalty
              const currentGold = useGoldStore.getState().gold
              const goldLost = Math.floor(currentGold * DEATH_GOLD_PENALTY)
              if (goldLost > 0) useGoldStore.getState().addGold(-goldLost)
              totalGold -= goldLost
              const lostResult = loseRandomEquippedItem()
              if (lostResult?.insuranceUsed) {
                lostItem = { name: 'Death Insurance consumed', icon: '🛡️' }
              } else {
                lostItem = lostResult
              }
            }
          }

          if (failed) break

          // Fight boss
          let bossOutcome: { willWin: boolean; foodConsumed?: Array<{ foodId: string; qty: number }> }
          if (runFood?.some(Boolean)) {
            const r = simulateBattleWithFood(playerSnapshot, zone.boss, runFood, 0.5, makeBattleSeed())
            bossOutcome = { willWin: r.willWin, foodConsumed: r.foodConsumed }
            for (const fc of r.foodConsumed) {
              useInventoryStore.getState().deleteItem(fc.foodId, fc.qty)
            }
          } else {
            bossOutcome = computeBattleOutcome(playerSnapshot, zone.boss)
          }
          if (bossOutcome.willWin) {
            get().recordKill(zone.boss.id)
            const autoBaseTier = autoHotZone
              ? (HOT_CHEST_TIER_UP[zone.boss.rewards.chestTier] as ChestType ?? zone.boss.rewards.chestTier)
              : zone.boss.rewards.chestTier
            const rolledTier = rollBossChestTier(autoBaseTier)
            if (rolledTier) {
              useInventoryStore.getState().addChest(rolledTier, 'session_complete', 100)
              chests.push(rolledTier)
              // Open the chest immediately and record result
              const freshInv2 = useInventoryStore.getState()
              const pending = freshInv2.pendingRewards.find((r) => !r.claimed && r.chestType === rolledTier)
              if (pending) freshInv2.claimPendingReward(pending.id)
              const opened = useInventoryStore.getState().openChestAndGrantItem(rolledTier, { source: 'session_complete', focusCategory: null })
              if (opened) {
                if (opened.goldDropped) totalGold += opened.goldDropped
                chestResults.push({ chestType: rolledTier, itemId: opened.itemId, goldDropped: opened.goldDropped, bonusMaterials: opened.bonusMaterials })
              }
            }
            const bossWarriorXP = BOSS_WARRIOR_XP[zone.boss.id] ?? 0
            if (bossWarriorXP > 0) {
              void grantWarriorXP(bossWarriorXP)
              totalWarriorXP += bossWarriorXP
            }
            if (zone.boss.materialDropId) {
              const qty = Math.round((zone.boss.materialDropQty ?? 1) * (autoHotZone ? 2 : 1))
              useInventoryStore.getState().addItem(zone.boss.materialDropId, qty)
              const matItem = LOOT_ITEMS.find((x) => x.id === zone.boss.materialDropId)
              if (materialMap[zone.boss.materialDropId]) {
                materialMap[zone.boss.materialDropId].qty += qty
              } else {
                materialMap[zone.boss.materialDropId] = { name: matItem?.name ?? zone.boss.materialDropId, icon: matItem?.icon ?? '📦', qty }
              }
            }
            set((s) => ({
              clearedZones: s.clearedZones.includes(zoneId) ? s.clearedZones : [...s.clearedZones, zoneId],
            }))
            runsCompleted++
            recordDungeonComplete()
            useAchievementStatsStore.getState().incrementDungeonCompletions()
            track('dungeon_complete', { zone_id: zoneId, total_gold: totalGold, rooms_cleared: 4 })
            track('boss_kill', { zone_id: zoneId, boss_id: zone.boss.id, gold_earned: totalGold })
          } else {
            failed = true
            failedAt = zone.boss.name
            const currentGold = useGoldStore.getState().gold
            const goldLost = Math.floor(currentGold * DEATH_GOLD_PENALTY)
            if (goldLost > 0) useGoldStore.getState().addGold(-goldLost)
            totalGold -= goldLost
            track('dungeon_death', { zone_id: zoneId, gold_lost: goldLost })
            const bossLostResult = loseRandomEquippedItem()
            if (bossLostResult?.insuranceUsed) {
              lostItem = { name: 'Death Insurance consumed', icon: '🛡️' }
            } else {
              lostItem = bossLostResult
            }
          }
        }

        // Auto-farm gold tax: 12% removed to curb late-game inflation
        if (totalGold > 0) {
          totalGold = Math.floor(totalGold * 0.88)
          useGoldStore.getState().addGold(totalGold)
          const user = useAuthStore.getState().user
          if (user) useGoldStore.getState().syncToSupabase(user.id)
        }

        return {
          runsCompleted,
          totalGold: Math.max(0, totalGold),
          totalWarriorXP,
          materials: Object.entries(materialMap).map(([id, m]) => ({ id, ...m })),
          chests,
          chestResults,
          failed,
          failedAt,
          lostItem,
          passesUsed,
        }
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (s) => ({
        activeBattle: s.activeBattle,
        activeDungeon: s.activeDungeon,
        clearedZones: s.clearedZones,
        killCounts: s.killCounts,
        dailyBossClaimedDate: s.dailyBossClaimedDate,
        isAutoRunning: s.isAutoRunning,
      }),
    },
  ),
)
