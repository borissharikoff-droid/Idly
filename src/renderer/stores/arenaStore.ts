import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { BOSSES, computeBattleStateAtTime, computePlayerStats, getDailyBossId, type BossDef } from '../lib/combat'
import type { CombatStats } from '../lib/loot'
import { CHEST_DEFS, type ChestType } from '../lib/loot'
import { useAuthStore } from './authStore'
import { useGoldStore } from './goldStore'
import { useInventoryStore } from './inventoryStore'
import { track } from '../lib/analytics'

export interface ActiveBattle {
  bossId: string
  startTime: number
  playerSnapshot: CombatStats
  bossSnapshot: BossDef
  isDaily: boolean
}

export interface ArenaChestDrop { type: ChestType; name: string; icon: string; image?: string }

interface ArenaState {
  activeBattle: ActiveBattle | null
  killCounts: Record<string, number>
  dailyBossClaimedDate: string | null
  resultModal: { victory: boolean; gold: number; goldAlreadyAdded?: boolean; bossName?: string; goldLost?: number; isDaily?: boolean; chest?: ArenaChestDrop | null } | null
  setResultModal: (v: { victory: boolean; gold: number; goldAlreadyAdded?: boolean; bossName?: string; goldLost?: number; isDaily?: boolean; chest?: ArenaChestDrop | null } | null) => void
  recordKill: (bossId: string) => void
  startBattle: (bossId: string) => boolean
  /** Resolves the battle (grants victory gold, applies death penalty). Returns goldLost and optional chest drop. */
  endBattle: () => { goldLost: number; chest: ArenaChestDrop | null }
  /** Same as endBattle but victory gold is claimed later via notification. Returns goldLost and optional chest drop. */
  endBattleWithoutGold: () => { goldLost: number; chest: ArenaChestDrop | null }
  getBattleState: () => ReturnType<typeof computeBattleStateAtTime> | null
  forfeitBattle: () => void
}

/** Fraction of current gold lost on death */
const DEATH_GOLD_PENALTY = 0.10

const STORAGE_KEY = 'grindly_arena_state'

/** On startup, clear any stale completed battle left in persisted state. */
function clearStaleActiveBattle() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    const ab = parsed?.state?.activeBattle
    if (!ab) return
    if (!ab.startTime || ab.startTime <= 0 || ab.startTime > Date.now()) {
      parsed.state.activeBattle = null
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed))
      return
    }
    const elapsed = (Date.now() - ab.startTime) / 1000
    const state = computeBattleStateAtTime(ab.playerSnapshot, ab.bossSnapshot, elapsed)
    if (state.isComplete) {
      parsed.state.activeBattle = null
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed))
    }
  } catch {
    // ignore
  }
}
clearStaleActiveBattle()

export const useArenaStore = create<ArenaState>()(
  persist(
    (set, get) => ({
      activeBattle: null,
      killCounts: {},
      dailyBossClaimedDate: null,
      resultModal: null,
      setResultModal: (v) => set({ resultModal: v }),

      recordKill(bossId: string) {
        set((s) => ({
          killCounts: { ...s.killCounts, [bossId]: (s.killCounts[bossId] ?? 0) + 1 },
        }))
      },

      startBattle(bossId: string) {
        const boss = BOSSES.find((b) => b.id === bossId)
        if (!boss) return false

        const { equippedBySlot, permanentStats } = useInventoryStore.getState()
        const playerSnapshot = computePlayerStats(equippedBySlot, permanentStats)

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
          },
        })
        track('arena_battle_start', { boss_id: bossId, is_daily: isDaily })
        return true
      },

      endBattle() {
        const { activeBattle } = get()
        if (!activeBattle) return { goldLost: 0, chest: null }

        const state = computeBattleStateAtTime(
          activeBattle.playerSnapshot,
          activeBattle.bossSnapshot,
          (Date.now() - activeBattle.startTime) / 1000,
        )
        let goldLost = 0
        let droppedChest: ArenaChestDrop | null = null
        if (state.victory) {
          get().recordKill(activeBattle.bossSnapshot.id)
          const ct = activeBattle.bossSnapshot.rewards.chestTier
          useInventoryStore.getState().addChest(ct, 'session_complete', 100)
          const chest = CHEST_DEFS[ct]
          if (chest) {
            droppedChest = { type: ct, name: chest.name, icon: activeBattle.isDaily ? '⭐' : chest.icon, image: chest.image }
          }
        } else {
          // Death penalty: lose % of current gold
          const currentGold = useGoldStore.getState().gold
          goldLost = Math.floor(currentGold * DEATH_GOLD_PENALTY)
          if (goldLost > 0) {
            useGoldStore.getState().addGold(-goldLost)
            const user = useAuthStore.getState().user
            if (user) useGoldStore.getState().syncToSupabase(user.id)
          }
        }

        set({ activeBattle: null })
        return { goldLost, chest: droppedChest }
      },

      endBattleWithoutGold() {
        const { activeBattle } = get()
        let goldLost = 0
        let droppedChest: ArenaChestDrop | null = null
        if (activeBattle) {
          const state = computeBattleStateAtTime(
            activeBattle.playerSnapshot,
            activeBattle.bossSnapshot,
            (Date.now() - activeBattle.startTime) / 1000,
          )
          if (state.victory) {
            get().recordKill(activeBattle.bossSnapshot.id)
            const ct = activeBattle.bossSnapshot.rewards.chestTier
            useInventoryStore.getState().addChest(ct, 'session_complete', 100)
            const chest = CHEST_DEFS[ct]
            if (chest) droppedChest = { type: ct, name: chest.name, icon: activeBattle.isDaily ? '⭐' : chest.icon, image: chest.image }
          } else {
            const currentGold = useGoldStore.getState().gold
            goldLost = Math.floor(currentGold * DEATH_GOLD_PENALTY)
            if (goldLost > 0) {
              useGoldStore.getState().addGold(-goldLost)
              const user = useAuthStore.getState().user
              if (user) useGoldStore.getState().syncToSupabase(user.id)
            }
          }
        }
        set({ activeBattle: null })
        return { goldLost, chest: droppedChest }
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
        set({ activeBattle: null })
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (s) => ({ activeBattle: s.activeBattle, killCounts: s.killCounts, dailyBossClaimedDate: s.dailyBossClaimedDate }),
    },
  ),
)
