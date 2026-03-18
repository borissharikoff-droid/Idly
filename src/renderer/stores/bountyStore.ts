// ─── Daily Bounty Store ───────────────────────────────────────────────────────
//
// Generates 3 daily bounties (craft / farm / cook) seeded by today's date.
// Progress is tracked here; hooks in craftingStore, farmStore, cookingStore
// call the increment functions when actions complete.
// Rewards are claimed once per bounty per day.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ChestType } from '../lib/loot'
import { useInventoryStore } from './inventoryStore'
import { useGoldStore } from './goldStore'
import { useAuthStore } from './authStore'

export type BountyType = 'craft' | 'farm' | 'cook'

export interface BountyDef {
  id: string
  type: BountyType
  description: string
  /** Number of actions required to complete this bounty. */
  targetCount: number
  goldReward: number
  chestReward?: ChestType
}

export interface ActiveBounty extends BountyDef {
  progress: number
  claimed: boolean
}

// ── Bounty templates by type ─────────────────────────────────────────────────

const CRAFT_BOUNTIES: Omit<BountyDef, 'id'>[] = [
  { type: 'craft', description: 'Craft 3 items',       targetCount: 3,  goldReward: 150  },
  { type: 'craft', description: 'Craft 5 items',       targetCount: 5,  goldReward: 250, chestReward: 'common_chest' },
  { type: 'craft', description: 'Craft 10 items',      targetCount: 10, goldReward: 500, chestReward: 'rare_chest' },
  { type: 'craft', description: 'Craft an Iron Bar',   targetCount: 1,  goldReward: 80   },
  { type: 'craft', description: 'Craft 2 intermediates', targetCount: 2, goldReward: 120 },
]

const FARM_BOUNTIES: Omit<BountyDef, 'id'>[] = [
  { type: 'farm', description: 'Harvest 3 crops',        targetCount: 3,  goldReward: 120 },
  { type: 'farm', description: 'Harvest 5 crops',        targetCount: 5,  goldReward: 200, chestReward: 'common_chest' },
  { type: 'farm', description: 'Harvest 8 crops',        targetCount: 8,  goldReward: 400, chestReward: 'rare_chest' },
  { type: 'farm', description: 'Harvest a rare+ crop',   targetCount: 1,  goldReward: 180 },
  { type: 'farm', description: 'Plant and harvest twice', targetCount: 2, goldReward: 150 },
]

const COOK_BOUNTIES: Omit<BountyDef, 'id'>[] = [
  { type: 'cook', description: 'Cook 1 dish',          targetCount: 1, goldReward: 100 },
  { type: 'cook', description: 'Cook 3 dishes',        targetCount: 3, goldReward: 200, chestReward: 'common_chest' },
  { type: 'cook', description: 'Cook 5 dishes',        targetCount: 5, goldReward: 350, chestReward: 'rare_chest' },
  { type: 'cook', description: 'Cook a rare+ meal',    targetCount: 1, goldReward: 150 },
  { type: 'cook', description: 'Cook 2 epic+ meals',   targetCount: 2, goldReward: 300, chestReward: 'common_chest' },
]

/** Seeded PRNG for deterministic daily bounty selection. */
function seededRandom(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (Math.imul(s ^ (s >>> 16), 0x45d9f3b) ^ (s >>> 11)) | 1
    return ((s >>> 0) / 0x100000000)
  }
}

function todaySeed(): number {
  const d = new Date()
  const str = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`
  let h = 0
  for (const c of str) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0
  return h >>> 0
}

function todayKey(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`
}

/** Generate today's 3 bounties from templates using today's seed. */
function generateTodayBounties(): ActiveBounty[] {
  const rng = seededRandom(todaySeed())
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)]
  return [
    { id: 'bounty_craft', ...pick(CRAFT_BOUNTIES), progress: 0, claimed: false },
    { id: 'bounty_farm',  ...pick(FARM_BOUNTIES),  progress: 0, claimed: false },
    { id: 'bounty_cook',  ...pick(COOK_BOUNTIES),  progress: 0, claimed: false },
  ]
}

interface BountyState {
  dateKey: string
  bounties: ActiveBounty[]
  /** Ensure bounties are fresh for today. Called lazily. */
  ensureToday: () => void
  incrementCraft: (count?: number) => void
  incrementFarm: (count?: number) => void
  incrementCook: (count?: number) => void
  claimBounty: (bountyId: string) => void
}

export const useBountyStore = create<BountyState>()(
  persist(
    (set, get) => ({
      dateKey: '',
      bounties: [],

      ensureToday() {
        const today = todayKey()
        if (get().dateKey !== today) {
          set({ dateKey: today, bounties: generateTodayBounties() })
        }
      },

      incrementCraft(count = 1) {
        get().ensureToday()
        set((s) => ({
          bounties: s.bounties.map((b) =>
            b.type === 'craft' && !b.claimed
              ? { ...b, progress: Math.min(b.progress + count, b.targetCount) }
              : b,
          ),
        }))
      },

      incrementFarm(count = 1) {
        get().ensureToday()
        set((s) => ({
          bounties: s.bounties.map((b) =>
            b.type === 'farm' && !b.claimed
              ? { ...b, progress: Math.min(b.progress + count, b.targetCount) }
              : b,
          ),
        }))
      },

      incrementCook(count = 1) {
        get().ensureToday()
        set((s) => ({
          bounties: s.bounties.map((b) =>
            b.type === 'cook' && !b.claimed
              ? { ...b, progress: Math.min(b.progress + count, b.targetCount) }
              : b,
          ),
        }))
      },

      claimBounty(bountyId: string) {
        const { bounties } = get()
        const bounty = bounties.find((b) => b.id === bountyId)
        if (!bounty || bounty.claimed || bounty.progress < bounty.targetCount) return

        // Grant gold reward
        if (bounty.goldReward > 0) {
          useGoldStore.getState().addGold(bounty.goldReward)
          const user = useAuthStore.getState().user
          if (user) useGoldStore.getState().syncToSupabase(user.id)
        }

        // Grant chest reward
        if (bounty.chestReward) {
          useInventoryStore.getState().addChest(bounty.chestReward, 'bounty_reward', 100)
        }

        set((s) => ({
          bounties: s.bounties.map((b) =>
            b.id === bountyId ? { ...b, claimed: true } : b,
          ),
        }))
      },
    }),
    {
      name: 'grindly_bounties',
      partialize: (s) => ({ dateKey: s.dateKey, bounties: s.bounties }),
    },
  ),
)
