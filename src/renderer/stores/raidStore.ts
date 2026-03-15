import { create } from 'zustand'
import {
  createRaid, fetchActiveRaid, joinRaid, submitDailyAttack, checkRaidExpiry,
  RAID_TIER_CONFIGS,
  type Raid, type RaidParticipant, type RaidTierId, type TributeItem,
} from '../services/raidService'
import { useAuthStore } from './authStore'
import { useInventoryStore } from './inventoryStore'

interface RaidState {
  activeRaid: Raid | null
  participants: RaidParticipant[]
  isLoading: boolean
  error: string | null

  fetchRaid: () => Promise<void>
  startRaid: (tier: RaidTierId, tributeItems: TributeItem[]) => Promise<{ ok: boolean; error?: string }>
  attackBoss: (damageDealt: number, wonFight: boolean) => Promise<{ ok: boolean; raidWon: boolean; error?: string }>
  /** Clear error */
  clearError: () => void
}

export const useRaidStore = create<RaidState>()((set, get) => ({
  activeRaid: null,
  participants: [],
  isLoading: false,
  error: null,

  clearError: () => set({ error: null }),

  async fetchRaid() {
    const user = useAuthStore.getState().user
    if (!user) return
    set({ isLoading: true, error: null })
    try {
      const { raid, participants } = await fetchActiveRaid(user.id)
      // Check for expiry
      if (raid?.status === 'active' && raid.ends_at) {
        await checkRaidExpiry(raid.id)
        // Re-fetch if it may have expired
        if (new Date(raid.ends_at) < new Date()) {
          const refreshed = await fetchActiveRaid(user.id)
          set({ activeRaid: refreshed.raid, participants: refreshed.participants })
          return
        }
      }
      set({ activeRaid: raid, participants })
    } catch (err) {
      set({ error: String(err) })
    } finally {
      set({ isLoading: false })
    }
  },

  async startRaid(tier, tributeItems) {
    const user = useAuthStore.getState().user
    if (!user) return { ok: false, error: 'Not logged in' }
    if (get().activeRaid) return { ok: false, error: 'Already in an active raid' }

    const cfg = RAID_TIER_CONFIGS[tier]

    // Validate tribute items count
    if (tributeItems.length < cfg.tribute_count) {
      return { ok: false, error: `Need ${cfg.tribute_count} tribute items` }
    }

    set({ isLoading: true, error: null })
    try {
      // Remove tribute items from inventory
      const inv = useInventoryStore.getState()
      for (const item of tributeItems) {
        inv.deleteItem(item.item_id, 1)
      }

      const result = await createRaid(user.id, tier, tributeItems)
      if (!result.ok || !result.raid) {
        // Refund items on failure
        for (const item of tributeItems) {
          inv.addItem(item.item_id, 1)
        }
        return { ok: false, error: result.error ?? 'Failed to create raid' }
      }

      set({ activeRaid: result.raid, participants: [] })
      // Refresh to get participant rows
      await get().fetchRaid()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err) }
    } finally {
      set({ isLoading: false })
    }
  },

  async attackBoss(damageDealt, wonFight) {
    const user = useAuthStore.getState().user
    const { activeRaid } = get()
    if (!user || !activeRaid) return { ok: false, raidWon: false, error: 'No active raid' }
    if (activeRaid.status !== 'active') return { ok: false, raidWon: false, error: 'Raid is not active' }

    set({ isLoading: true })
    try {
      const result = await submitDailyAttack(activeRaid.id, user.id, damageDealt, wonFight)

      if (result.ok) {
        // Optimistic update to local boss HP
        set((s) => {
          if (!s.activeRaid) return s
          const newHp = Math.max(0, s.activeRaid.boss_hp_remaining - (wonFight ? damageDealt : 0))
          const newStatus = result.raidWon ? 'won' : s.activeRaid.status
          return {
            activeRaid: { ...s.activeRaid, boss_hp_remaining: newHp, status: newStatus },
          }
        })
        // Refresh participants to get updated attack log
        await get().fetchRaid()
      }

      return result
    } catch (err) {
      return { ok: false, raidWon: false, error: String(err) }
    } finally {
      set({ isLoading: false })
    }
  },
}))
