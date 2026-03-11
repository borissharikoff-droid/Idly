import { create } from 'zustand'

const STORAGE_KEY = 'grindly_achievement_stats'

interface AchievementStatsState {
  totalHarvests: number
  totalCrafts: number
  totalCooks: number
  totalDungeonCompletions: number
  maxGoldEver: number
  uniqueSeedsPlanted: string[]

  hydrate: () => void
  incrementHarvests: (count?: number) => void
  incrementCrafts: () => void
  incrementCooks: () => void
  incrementDungeonCompletions: () => void
  updateMaxGold: (currentGold: number) => void
  addUniqueSeed: (seedId: string) => void
}

function save(state: AchievementStatsState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      totalHarvests: state.totalHarvests,
      totalCrafts: state.totalCrafts,
      totalCooks: state.totalCooks,
      totalDungeonCompletions: state.totalDungeonCompletions,
      maxGoldEver: state.maxGoldEver,
      uniqueSeedsPlanted: state.uniqueSeedsPlanted,
    }))
  } catch { /* ignore */ }
}

function load(): Partial<AchievementStatsState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Partial<AchievementStatsState>
  } catch {
    return {}
  }
}

export const useAchievementStatsStore = create<AchievementStatsState>((set, get) => ({
  totalHarvests: 0,
  totalCrafts: 0,
  totalCooks: 0,
  totalDungeonCompletions: 0,
  maxGoldEver: 0,
  uniqueSeedsPlanted: [],

  hydrate() {
    const snap = load()
    set((s) => ({
      ...s,
      totalHarvests: snap.totalHarvests ?? s.totalHarvests,
      totalCrafts: snap.totalCrafts ?? s.totalCrafts,
      totalCooks: snap.totalCooks ?? s.totalCooks,
      totalDungeonCompletions: snap.totalDungeonCompletions ?? s.totalDungeonCompletions,
      maxGoldEver: snap.maxGoldEver ?? s.maxGoldEver,
      uniqueSeedsPlanted: snap.uniqueSeedsPlanted ?? s.uniqueSeedsPlanted,
    }))
  },

  incrementHarvests(count = 1) {
    set((s) => {
      const next = { ...s, totalHarvests: s.totalHarvests + count }
      save(next)
      return next
    })
  },

  incrementCrafts() {
    set((s) => {
      const next = { ...s, totalCrafts: s.totalCrafts + 1 }
      save(next)
      return next
    })
  },

  incrementCooks() {
    set((s) => {
      const next = { ...s, totalCooks: s.totalCooks + 1 }
      save(next)
      return next
    })
  },

  incrementDungeonCompletions() {
    set((s) => {
      const next = { ...s, totalDungeonCompletions: s.totalDungeonCompletions + 1 }
      save(next)
      return next
    })
  },

  updateMaxGold(currentGold: number) {
    const { maxGoldEver } = get()
    if (currentGold > maxGoldEver) {
      set((s) => {
        const next = { ...s, maxGoldEver: currentGold }
        save(next)
        return next
      })
    }
  },

  addUniqueSeed(seedId: string) {
    const { uniqueSeedsPlanted } = get()
    if (uniqueSeedsPlanted.includes(seedId)) return
    set((s) => {
      const next = { ...s, uniqueSeedsPlanted: [...s.uniqueSeedsPlanted, seedId] }
      save(next)
      return next
    })
  },
}))
