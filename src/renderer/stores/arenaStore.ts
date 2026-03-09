import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  BOSSES, ZONES, BOSS_WARRIOR_XP,
  computeBattleStateAtTime, computeBattleOutcome, computePlayerStats, computeWarriorBonuses,
  getDailyBossId, canAffordEntry,
  type BossDef, type MobDef,
} from '../lib/combat'
import type { CombatStats } from '../lib/loot'
import { CHEST_DEFS, LOOT_ITEMS, rollBossChestTier, type BonusMaterial, type ChestType, type LootSlot } from '../lib/loot'
import { PLANT_COMBAT_BUFFS, grantWarriorXP } from '../lib/farming'
import { skillLevelFromXP, getGrindlyLevel, computeGrindlyBonuses } from '../lib/skills'
import { useAuthStore } from './authStore'
import { useGoldStore } from './goldStore'
import { useInventoryStore } from './inventoryStore'
import { track } from '../lib/analytics'

export interface ActiveBattle {
  bossId: string
  startTime: number
  playerSnapshot: CombatStats
  bossSnapshot: BossDef | MobDef
  isDaily: boolean
  isMob?: boolean
  mobDef?: MobDef
  dungeonZoneId?: string
}

export interface ActiveDungeon {
  zoneId: string
  mobIndex: number   // 0–2 = mobs, 3 = boss
  goldEarned: number // accumulated gold from mob kills
  startedAt: number  // wall-clock timestamp when dungeon started
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
  resultModal: { victory: boolean; gold: number; goldAlreadyAdded?: boolean; bossName?: string; goldLost?: number; isDaily?: boolean; chest?: ArenaChestDrop | null; lostItemName?: string; lostItemIcon?: string; materialDrop?: { id: string; name: string; icon: string; qty: number } | null; warriorXP?: number } | null
  setResultModal: (v: { victory: boolean; gold: number; goldAlreadyAdded?: boolean; bossName?: string; goldLost?: number; isDaily?: boolean; chest?: ArenaChestDrop | null; lostItemName?: string; lostItemIcon?: string; materialDrop?: { id: string; name: string; icon: string; qty: number } | null; warriorXP?: number } | null) => void
  recordKill: (id: string) => void
  startBattle: (bossId: string) => boolean
  startDungeon: (zoneId: string, consumablePlantId?: string | null) => boolean
  advanceDungeon: (startTimeOverride?: number) => void
  forfeitDungeon: () => void
  /** Resolves the battle (grants victory gold, applies death penalty). Returns goldLost, optional chest drop, material drop, and optional lost item. */
  endBattle: () => { goldLost: number; chest: ArenaChestDrop | null; lostItem: { name: string; icon: string } | null; materialDrop: { id: string; name: string; icon: string; qty: number } | null; dungeonGold: number; warriorXP: number }
  /** Same as endBattle but victory gold is claimed later via notification. Returns goldLost, optional chest drop, and optional lost item. */
  endBattleWithoutGold: () => { goldLost: number; chest: ArenaChestDrop | null; lostItem: { name: string; icon: string } | null }
  getBattleState: () => ReturnType<typeof computeBattleStateAtTime> | null
  forfeitBattle: () => void
  autoRunDungeon: (zoneId: string, passCount: number) => AutoRunResult
}

/** Fraction of current gold lost on death */
const DEATH_GOLD_PENALTY = 0.10

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

function rollMaterial(mob: MobDef): { id: string; qty: number } | null {
  if (!mob.materialDropId || !mob.materialDropChance) return null
  if (Math.random() >= mob.materialDropChance) return null
  return { id: mob.materialDropId, qty: mob.materialDropQty ?? 1 }
}

function randomGold(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}

/** Destroy one random equipped item on dungeon death. Returns name+icon of the lost item, or null if nothing equipped. */
function loseRandomEquippedItem(): { name: string; icon: string } | null {
  const inv = useInventoryStore.getState()
  const slots = Object.keys(inv.equippedBySlot) as LootSlot[]
  if (slots.length === 0) return null
  const slot = slots[Math.floor(Math.random() * slots.length)]
  const itemId = inv.equippedBySlot[slot]
  if (!itemId) return null
  const itemDef = LOOT_ITEMS.find((x) => x.id === itemId)
  inv.unequipSlot(slot as LootSlot) // force-unequip first
  const qty = inv.items[itemId] ?? 1
  inv.deleteItem(itemId, qty)        // delete ALL copies — item is destroyed
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
  passesUsed: number
}

export const useArenaStore = create<ArenaState>()(
  persist(
    (set, get) => ({
      activeBattle: null,
      activeDungeon: null,
      clearedZones: [],
      killCounts: {},
      dailyBossClaimedDate: null,
      resultModal: null,

      setResultModal: (v) => set({ resultModal: v }),

      recordKill(id: string) {
        set((s) => ({
          killCounts: { ...s.killCounts, [id]: (s.killCounts[id] ?? 0) + 1 },
        }))
      },

      startBattle(bossId: string) {
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

        set({
          activeBattle: {
            bossId,
            startTime: Date.now(),
            playerSnapshot,
            bossSnapshot,
            isDaily,
            isMob: false,
          },
        })
        track('arena_battle_start', { boss_id: bossId, is_daily: isDaily })
        return true
      },

      startDungeon(zoneId: string, consumablePlantId?: string | null) {
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
        let consumableBuff = { atk: 0, hp: 0, hpRegen: 0 }
        if (consumablePlantId) {
          const buff = PLANT_COMBAT_BUFFS[consumablePlantId]
          if (buff) {
            consumableBuff = buff
            // Consume the plant
            inv.deleteItem(consumablePlantId, 1)
          }
        }

        const additionalBonuses = {
          atk: warriorBonuses.atk + grindlyBonuses.atk + consumableBuff.atk,
          hp: warriorBonuses.hp + grindlyBonuses.hp + consumableBuff.hp,
          hpRegen: warriorBonuses.hpRegen + grindlyBonuses.hpRegen + consumableBuff.hpRegen,
        }
        const playerSnapshot = computePlayerStats(equippedBySlot, permanentStats, additionalBonuses)

        const mob = zone.mobs[0]
        set({
          activeDungeon: { zoneId, mobIndex: 0, goldEarned: 0, startedAt: Date.now() },
          activeBattle: {
            bossId: mob.id,
            startTime: Date.now(),
            playerSnapshot,
            bossSnapshot: mob as unknown as BossDef,
            isDaily: false,
            isMob: true,
            mobDef: mob,
            dungeonZoneId: zoneId,
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
        })

        if (nextIndex < 3) {
          // Next mob
          const mob = zone.mobs[nextIndex]
          set({
            activeDungeon: { ...activeDungeon, mobIndex: nextIndex },
            activeBattle: {
              bossId: mob.id,
              startTime: startTimeOverride ?? Date.now(),
              playerSnapshot,
              bossSnapshot: mob as unknown as BossDef,
              isDaily: false,
              isMob: true,
              mobDef: mob,
              dungeonZoneId: activeDungeon.zoneId,
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
              playerSnapshot,
              bossSnapshot: boss,
              isDaily: false,
              isMob: false,
              dungeonZoneId: activeDungeon.zoneId,
            },
          })
        }
      },

      forfeitDungeon() {
        set({ activeBattle: null, activeDungeon: null })
      },

      endBattle() {
        const { activeBattle, activeDungeon } = get()
        if (!activeBattle) return { goldLost: 0, chest: null, lostItem: null, materialDrop: null, dungeonGold: 0, warriorXP: 0 }

        const fightElapsed = (Date.now() - activeBattle.startTime) / 1000
        const state = computeBattleStateAtTime(
          activeBattle.playerSnapshot,
          activeBattle.bossSnapshot,
          fightElapsed,
        )
        let goldLost = 0
        let droppedChest: ArenaChestDrop | null = null
        let lostItem: { name: string; icon: string } | null = null
        let matDrop: { id: string; name: string; icon: string; qty: number } | null = null
        let dungeonGold = 0
        let warriorXP = 0

        if (activeBattle.isMob && activeBattle.mobDef) {
          // Mob battle
          const mob = activeBattle.mobDef
          if (state.victory) {
            get().recordKill(mob.id)
            const gold = randomGold(mob.goldMin, mob.goldMax)
            useGoldStore.getState().addGold(gold)
            const user = useAuthStore.getState().user
            if (user) useGoldStore.getState().syncToSupabase(user.id)

            void grantWarriorXP(mob.xpReward)
            warriorXP = mob.xpReward

            const materialDrop = rollMaterial(mob)
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
            set({ activeBattle: null, activeDungeon: null })
          }
        } else {
          // Boss battle
          if (state.victory) {
            get().recordKill(activeBattle.bossSnapshot.id)
            const bossForChest = activeBattle.bossSnapshot as BossDef
            if (bossForChest.rewards?.chestTier) {
              const rolledTier = rollBossChestTier(bossForChest.rewards.chestTier)
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

            // Grant boss-exclusive material drop
            if (bossForChest.materialDropId) {
              const qty = bossForChest.materialDropQty ?? 1
              useInventoryStore.getState().addItem(bossForChest.materialDropId, qty)
              const matItem = LOOT_ITEMS.find((i) => i.id === bossForChest.materialDropId)
              matDrop = { id: bossForChest.materialDropId, name: matItem?.name ?? bossForChest.materialDropId, icon: matItem?.icon ?? '📦', qty }
            }

            // If this was the dungeon boss, mark zone cleared and grant accumulated gold
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
              set((s) => ({
                activeBattle: null,
                activeDungeon: null,
                clearedZones: s.clearedZones.includes(activeBattle.dungeonZoneId!)
                  ? s.clearedZones
                  : [...s.clearedZones, activeBattle.dungeonZoneId!],
              }))
            } else {
              set({ activeBattle: null })
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
            }
            set({ activeBattle: null, activeDungeon: null })
          }
        }

        return { goldLost, chest: droppedChest, lostItem, materialDrop: matDrop, dungeonGold, warriorXP }
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

        return computeBattleStateAtTime(
          activeBattle.playerSnapshot,
          activeBattle.bossSnapshot,
          elapsedSeconds,
        )
      },

      forfeitBattle() {
        set({ activeBattle: null, activeDungeon: null })
      },

      autoRunDungeon(zoneId: string, passCount: number): AutoRunResult {
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
        let runsCompleted = 0
        let failed = false
        let failedAt: string | undefined
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
          })

          // Fight 3 mobs
          for (let m = 0; m < 3 && !failed; m++) {
            const mob = zone.mobs[m]
            const outcome = computeBattleOutcome(playerSnapshot, mob as unknown as BossDef)
            if (outcome.willWin) {
              const gold = randomGold(mob.goldMin, mob.goldMax)
              totalGold += gold
              void grantWarriorXP(mob.xpReward)
              const drop = rollMaterial(mob)
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
              loseRandomEquippedItem()
            }
          }

          if (failed) break

          // Fight boss
          const bossOutcome = computeBattleOutcome(playerSnapshot, zone.boss)
          if (bossOutcome.willWin) {
            get().recordKill(zone.boss.id)
            const rolledTier = rollBossChestTier(zone.boss.rewards.chestTier)
            if (rolledTier) {
              useInventoryStore.getState().addChest(rolledTier, 'session_complete', 100)
              chests.push(rolledTier)
            }
            const bossWarriorXP = BOSS_WARRIOR_XP[zone.boss.id] ?? 0
            if (bossWarriorXP > 0) {
              void grantWarriorXP(bossWarriorXP)
              totalWarriorXP += bossWarriorXP
            }
            if (zone.boss.materialDropId) {
              const qty = zone.boss.materialDropQty ?? 1
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
          } else {
            failed = true
            failedAt = zone.boss.name
            const currentGold = useGoldStore.getState().gold
            const goldLost = Math.floor(currentGold * DEATH_GOLD_PENALTY)
            if (goldLost > 0) useGoldStore.getState().addGold(-goldLost)
            totalGold -= goldLost
            loseRandomEquippedItem()
          }
        }

        // Add accumulated gold
        if (totalGold > 0) {
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
          chestResults: [],
          failed,
          failedAt,
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
      }),
    },
  ),
)
