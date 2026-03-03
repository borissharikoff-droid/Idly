import { create } from 'zustand'
import type { AchievementDef } from '../lib/xp'
import { grantRewardPayloads, mapAchievementToRewardPayloads } from '../services/rewardGrant'
import { CHEST_DEFS, estimateChestDropRate } from '../lib/loot'
import { useNotificationStore } from './notificationStore'
import { ensureInventoryHydrated, useInventoryStore } from './inventoryStore'

export interface AlertItem {
  id: string
  type: 'achievement' | 'social' | 'loot'
  achievement: AchievementDef
  claimed: boolean
}

interface AlertStore {
  queue: AlertItem[]
  currentAlert: AlertItem | null
  push: (achievement: AchievementDef) => void
  showNext: () => void
  claimCurrent: () => Promise<void>
  dismissCurrent: () => void
}

export const useAlertStore = create<AlertStore>((set, get) => ({
  queue: [],
  currentAlert: null,

  push(achievement) {
    const item: AlertItem = {
      id: crypto.randomUUID(),
      type: achievement.category === 'social' ? 'social' : 'achievement',
      achievement,
      claimed: false,
    }
    const { currentAlert } = get()
    if (!currentAlert) {
      set({ currentAlert: item })
    } else {
      set((s) => ({ queue: [...s.queue, item] }))
    }
  },

  showNext() {
    const { queue } = get()
    if (queue.length > 0) {
      const [next, ...rest] = queue
      set({ currentAlert: next, queue: rest })
    } else {
      set({ currentAlert: null })
    }
  },

  async claimCurrent() {
    const { currentAlert } = get()
    if (currentAlert?.achievement) {
      const payloads = mapAchievementToRewardPayloads(currentAlert.achievement)
      await grantRewardPayloads(payloads, window.electronAPI || null)
      ensureInventoryHydrated()
      const chestType = currentAlert.achievement.category === 'skill' ? 'rare_chest' : 'common_chest'
      const estimated = estimateChestDropRate(chestType, { source: 'achievement_claim' })
      useInventoryStore.getState().addChest(chestType, 'achievement_claim', estimated)
      const chest = CHEST_DEFS[chestType]
      if (chest) {
        useNotificationStore.getState().push({
          type: 'progression',
          icon: chest.icon,
          title: `Chest earned: ${chest.name}`,
          body: `Added to Inbox • drop rate ~${estimated}%`,
        })
      }
    }
    set((s) => ({
      currentAlert: s.currentAlert ? { ...s.currentAlert, claimed: true } : null,
    }))
    // Auto-advance to next alert after a short display delay
    setTimeout(() => get().showNext(), 1200)
  },

  dismissCurrent() {
    get().showNext()
  },
}))
