// ─── Weekly Challenge Store ───────────────────────────────────────────────────
//
// Generates 4 weekly challenges (craft / farm / cook / kill) seeded by ISO week.
// Progress is tracked here; stores and hooks call increment functions.
// Rewards are claimed once per challenge per week.
// Resets on Monday 00:00 UTC.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ChestType } from '../lib/loot'
import { useInventoryStore } from './inventoryStore'
import { useGoldStore } from './goldStore'
import { useAuthStore } from './authStore'

export type WeeklyBountyType = 'craft' | 'farm' | 'cook' | 'kill'

export interface WeeklyBountyDef {
  id: string
  type: WeeklyBountyType
  description: string
  targetCount: number
  goldReward: number
  chestReward?: ChestType
}

export interface ActiveWeeklyBounty extends WeeklyBountyDef {
  progress: number
  claimed: boolean
}

// ── Templates ────────────────────────────────────────────────────────────────

const CRAFT_WEEKLY: Omit<WeeklyBountyDef, 'id'>[] = [
  { type: 'craft', description: 'Craft 20 items',       targetCount: 20, goldReward: 1500, chestReward: 'epic_chest' },
  { type: 'craft', description: 'Craft 50 items',       targetCount: 50, goldReward: 3000, chestReward: 'legendary_chest' },
  { type: 'craft', description: 'Craft 5 gear items',   targetCount: 5,  goldReward: 600,  chestReward: 'rare_chest' },
  { type: 'craft', description: 'Craft 10 items',       targetCount: 10, goldReward: 800,  chestReward: 'rare_chest' },
]

const FARM_WEEKLY: Omit<WeeklyBountyDef, 'id'>[] = [
  { type: 'farm', description: 'Harvest 20 crops',  targetCount: 20, goldReward: 1200, chestReward: 'epic_chest' },
  { type: 'farm', description: 'Harvest 50 crops',  targetCount: 50, goldReward: 2500, chestReward: 'legendary_chest' },
  { type: 'farm', description: 'Harvest 10 crops',  targetCount: 10, goldReward: 700,  chestReward: 'rare_chest' },
  { type: 'farm', description: 'Harvest 30 crops',  targetCount: 30, goldReward: 1800, chestReward: 'epic_chest' },
]

const COOK_WEEKLY: Omit<WeeklyBountyDef, 'id'>[] = [
  { type: 'cook', description: 'Cook 10 dishes',   targetCount: 10, goldReward: 1000, chestReward: 'epic_chest' },
  { type: 'cook', description: 'Cook 20 dishes',   targetCount: 20, goldReward: 2000, chestReward: 'legendary_chest' },
  { type: 'cook', description: 'Cook 5 dishes',    targetCount: 5,  goldReward: 500,  chestReward: 'rare_chest' },
  { type: 'cook', description: 'Cook 15 dishes',   targetCount: 15, goldReward: 1400, chestReward: 'epic_chest' },
]

const KILL_WEEKLY: Omit<WeeklyBountyDef, 'id'>[] = [
  { type: 'kill', description: 'Defeat 30 enemies',        targetCount: 30,  goldReward: 1500, chestReward: 'epic_chest' },
  { type: 'kill', description: 'Defeat 100 enemies',       targetCount: 100, goldReward: 3500, chestReward: 'legendary_chest' },
  { type: 'kill', description: 'Defeat 10 dungeon bosses', targetCount: 10,  goldReward: 2000, chestReward: 'legendary_chest' },
  { type: 'kill', description: 'Defeat 50 enemies',        targetCount: 50,  goldReward: 2200, chestReward: 'epic_chest' },
]

// ── ISO week helpers ──────────────────────────────────────────────────────────

export function isoWeekKey(d: Date = new Date()): string {
  const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  const startOfWeek1 = new Date(jan4)
  startOfWeek1.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7))
  const diff = d.getTime() - startOfWeek1.getTime()
  const week = Math.floor(diff / (7 * 86400 * 1000)) + 1
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

function weekSeed(weekKey: string): number {
  let h = 0
  for (const c of weekKey) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0
  return h >>> 0
}

function seededRandom(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (Math.imul(s ^ (s >>> 16), 0x45d9f3b) ^ (s >>> 11)) | 1
    return (s >>> 0) / 0x100000000
  }
}

function generateWeekBounties(weekKey: string): ActiveWeeklyBounty[] {
  const rng = seededRandom(weekSeed(weekKey))
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)]
  return [
    { id: 'weekly_craft', ...pick(CRAFT_WEEKLY), progress: 0, claimed: false },
    { id: 'weekly_farm',  ...pick(FARM_WEEKLY),  progress: 0, claimed: false },
    { id: 'weekly_cook',  ...pick(COOK_WEEKLY),  progress: 0, claimed: false },
    { id: 'weekly_kill',  ...pick(KILL_WEEKLY),  progress: 0, claimed: false },
  ]
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface WeeklyState {
  weekKey: string
  bounties: ActiveWeeklyBounty[]
  ensureThisWeek: () => void
  incrementCraft: (count?: number) => void
  incrementFarm: (count?: number) => void
  incrementCook: (count?: number) => void
  incrementKill: (count?: number) => void
  claimWeekly: (bountyId: string) => void
}

export const useWeeklyStore = create<WeeklyState>()(
  persist(
    (set, get) => ({
      weekKey: '',
      bounties: [],

      ensureThisWeek() {
        const week = isoWeekKey()
        if (get().weekKey !== week) {
          set({ weekKey: week, bounties: generateWeekBounties(week) })
        }
      },

      incrementCraft(count = 1) {
        get().ensureThisWeek()
        set((s) => ({
          bounties: s.bounties.map((b) =>
            b.type === 'craft' && !b.claimed
              ? { ...b, progress: Math.min(b.progress + count, b.targetCount) }
              : b,
          ),
        }))
      },

      incrementFarm(count = 1) {
        get().ensureThisWeek()
        set((s) => ({
          bounties: s.bounties.map((b) =>
            b.type === 'farm' && !b.claimed
              ? { ...b, progress: Math.min(b.progress + count, b.targetCount) }
              : b,
          ),
        }))
      },

      incrementCook(count = 1) {
        get().ensureThisWeek()
        set((s) => ({
          bounties: s.bounties.map((b) =>
            b.type === 'cook' && !b.claimed
              ? { ...b, progress: Math.min(b.progress + count, b.targetCount) }
              : b,
          ),
        }))
      },

      incrementKill(count = 1) {
        get().ensureThisWeek()
        set((s) => ({
          bounties: s.bounties.map((b) =>
            b.type === 'kill' && !b.claimed
              ? { ...b, progress: Math.min(b.progress + count, b.targetCount) }
              : b,
          ),
        }))
      },

      claimWeekly(bountyId: string) {
        const { bounties } = get()
        const bounty = bounties.find((b) => b.id === bountyId)
        if (!bounty || bounty.claimed || bounty.progress < bounty.targetCount) return

        // Mark claimed first to prevent duplicate grants on crash/restart
        set((s) => ({
          bounties: s.bounties.map((b) =>
            b.id === bountyId ? { ...b, claimed: true } : b,
          ),
        }))

        if (bounty.goldReward > 0) {
          useGoldStore.getState().addGold(bounty.goldReward)
          const user = useAuthStore.getState().user
          if (user) useGoldStore.getState().syncToSupabase(user.id)
        }

        if (bounty.chestReward) {
          useInventoryStore.getState().addChest(bounty.chestReward, 'bounty_reward', 100)
        }
      },
    }),
    {
      name: 'grindly_weekly',
      partialize: (s) => ({ weekKey: s.weekKey, bounties: s.bounties }),
    },
  ),
)
