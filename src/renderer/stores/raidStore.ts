import { create } from 'zustand'
import {
  createRaid, fetchActiveRaid, submitDailyAttack, checkRaidExpiry,
  createRaidInvite, fetchPendingInvites, acceptRaidInvite, declineRaidInvite,
  grantRaidVictoryLoot, submitHealAction, submitDefendAction, applyPartyHpTick,
  getRaidPhase, updateParticipantSnapshot,
  RAID_TIER_CONFIGS,
  type Raid, type RaidParticipant, type RaidTierId, type TributeItem, type RaidInvite, type CharacterSnapshot,
} from '../services/raidService'
import { useAuthStore } from './authStore'
import { useInventoryStore } from './inventoryStore'
import { usePartyStore } from './partyStore'
import { track } from '../lib/analytics'
import { computePlayerStats } from '../lib/combat'
import { LOOT_ITEMS } from '../lib/loot'
import { supabase } from '../lib/supabase'

function buildCharacterSnapshot(): CharacterSnapshot {
  const inv = useInventoryStore.getState()
  const stats = computePlayerStats(inv.equippedBySlot, inv.permanentStats)
  const gearSlots = ['head', 'body', 'legs', 'ring', 'weapon'] as const
  const equipped = gearSlots
    .filter((slot) => inv.equippedBySlot[slot])
    .map((slot) => {
      const itemId = inv.equippedBySlot[slot]!
      const item = LOOT_ITEMS.find((x) => x.id === itemId)
      if (!item) return null
      return { slot, item_id: itemId, name: item.name, icon: item.icon, rarity: item.rarity }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
  return { atk: stats.atk, hp: stats.hp, hp_regen: stats.hpRegen, def: stats.def, equipped, updated_at: new Date().toISOString() }
}

// Module-level realtime channel for raid_participants — survives re-renders
let _raidChannel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null

function subscribeRaidRealtime(raidId: string, onUpdate: () => void) {
  if (!supabase) return
  if (_raidChannel?.topic === `realtime:raid_participants_${raidId}`) return
  if (_raidChannel) { supabase.removeChannel(_raidChannel); _raidChannel = null }
  _raidChannel = supabase
    .channel(`raid_participants_${raidId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'raid_participants', filter: `raid_id=eq.${raidId}` }, onUpdate)
    .subscribe()
}

function unsubscribeRaidRealtime() {
  if (!supabase || !_raidChannel) return
  supabase.removeChannel(_raidChannel)
  _raidChannel = null
}

export type { RaidInvite }

interface RaidState {
  activeRaid: Raid | null
  participants: RaidParticipant[]
  isLoading: boolean
  error: string | null
  pendingInvites: RaidInvite[]

  fetchRaid: () => Promise<void>
  startRaid: (tier: RaidTierId, tributeItems: TributeItem[]) => Promise<{ ok: boolean; error?: string }>
  attackBoss: (damageDealt: number, wonFight: boolean) => Promise<{ ok: boolean; raidWon: boolean; lootItemId?: string; error?: string }>
  healTank: (items: { item_id: string; quantity: number }[], healAmount: number) => Promise<{ ok: boolean; error?: string }>
  defendToday: () => Promise<{ ok: boolean; error?: string }>
  fetchInvites: () => Promise<void>
  sendInvite: (toUserId: string, toUsername: string) => Promise<{ ok: boolean; error?: string }>
  acceptInvite: (inviteId: string) => Promise<{ ok: boolean; error?: string }>
  declineInvite: (inviteId: string) => Promise<{ ok: boolean }>
  /** Clear error */
  clearError: () => void
  /** Dismiss a completed (won/failed) raid from the UI — persists to localStorage */
  dismissRaid: (raidId: string) => void
}

export const useRaidStore = create<RaidState>()((set, get) => ({
  activeRaid: null,
  participants: [],
  isLoading: false,
  error: null,
  pendingInvites: [],

  clearError: () => set({ error: null }),

  dismissRaid(raidId) {
    try {
      const raw = localStorage.getItem('grindly_dismissed_raids') ?? '[]'
      const ids: string[] = JSON.parse(raw)
      if (!ids.includes(raidId)) {
        ids.push(raidId)
        localStorage.setItem('grindly_dismissed_raids', JSON.stringify(ids))
      }
    } catch { /* ignore */ }
    const { activeRaid } = get()
    if (activeRaid?.status === 'failed') {
      track('raid_fail', { tier: activeRaid.tier, phase: activeRaid.current_phase })
    }
    unsubscribeRaidRealtime()
    set({ activeRaid: null, participants: [] })
  },

  async fetchRaid() {
    const user = useAuthStore.getState().user
    if (!user) return
    set({ isLoading: true, error: null })
    try {
      let { raid, participants } = await fetchActiveRaid(user.id)
      // Skip raids that have been explicitly dismissed by the user
      if (raid && (raid.status === 'won' || raid.status === 'failed')) {
        try {
          const dismissed: string[] = JSON.parse(localStorage.getItem('grindly_dismissed_raids') ?? '[]')
          if (dismissed.includes(raid.id)) { raid = null; participants = [] }
        } catch { /* ignore */ }
      }
      // Check for expiry and apply daily party HP tick
      if (raid?.status === 'active' && raid.ends_at) {
        await checkRaidExpiry(raid.id)
        const phase = getRaidPhase(raid.boss_hp_remaining, raid.boss_hp_max)
        await applyPartyHpTick(raid.id, raid.tier, phase)
        // Re-fetch if it may have expired or ticked
        const refreshed = await fetchActiveRaid(user.id)
        set({ activeRaid: refreshed.raid, participants: refreshed.participants })
        if (refreshed.raid?.status === 'active') {
          subscribeRaidRealtime(refreshed.raid.id, () => get().fetchRaid())
        } else {
          unsubscribeRaidRealtime()
        }
        return
      }
      set({ activeRaid: raid, participants })
      if (raid?.status === 'active') {
        subscribeRaidRealtime(raid.id, () => get().fetchRaid())
      } else {
        unsubscribeRaidRealtime()
      }
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

      // Ensure party state is fresh — partyStore may not have loaded if user
      // went directly Home → Arena without opening the Social tab
      await usePartyStore.getState().fetchParty()

      const myPartyRole = usePartyStore.getState().members.find((m) => m.user_id === user.id)?.role ?? 'dps'
      const snapshot = buildCharacterSnapshot()
      const result = await createRaid(user.id, tier, tributeItems, myPartyRole, snapshot)
      if (!result.ok || !result.raid) {
        // Refund items on failure
        for (const item of tributeItems) {
          inv.addItem(item.item_id, 1)
        }
        return { ok: false, error: result.error ?? 'Failed to create raid' }
      }

      set({ activeRaid: result.raid, participants: [] })

      // Auto-invite all current party members
      const partyMembers = usePartyStore.getState().members
      const raidId = result.raid.id
      await Promise.allSettled(
        partyMembers
          .filter((m) => m.user_id !== user.id)
          .map((m) => createRaidInvite(user.id, m.user_id, tier, raidId)),
      )

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
        // Keep character snapshot fresh each time player acts
        updateParticipantSnapshot(activeRaid.id, user.id, buildCharacterSnapshot()).catch(() => {})
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

      let lootItemId: string | undefined
      if (result.ok && result.raidWon) {
        const raidStartedAt = activeRaid.created_at ? new Date(activeRaid.created_at).getTime() : Date.now()
        const durationSeconds = Math.round((Date.now() - raidStartedAt) / 1000)
        track('raid_complete', { tier: activeRaid.tier, duration_seconds: durationSeconds })
        const dropped = await grantRaidVictoryLoot(activeRaid.tier)
        if (dropped) {
          useInventoryStore.getState().addItem(dropped, 1)
          lootItemId = dropped
        }
      }

      return { ...result, lootItemId }
    } catch (err) {
      return { ok: false, raidWon: false, error: String(err) }
    } finally {
      set({ isLoading: false })
    }
  },

  async healTank(items, healAmount) {
    const user = useAuthStore.getState().user
    const { activeRaid } = get()
    if (!user || !activeRaid) return { ok: false, error: 'No active raid' }
    const result = await submitHealAction(activeRaid.id, user.id, items, healAmount)
    if (result.ok) {
      set((s) => {
        if (!s.activeRaid) return s
        const newHp = Math.min(
          s.activeRaid.party_hp_max ?? 0,
          (s.activeRaid.party_hp ?? 0) + healAmount,
        )
        return { activeRaid: { ...s.activeRaid, party_hp: newHp } }
      })
      await get().fetchRaid()
    }
    return result
  },

  async defendToday() {
    const user = useAuthStore.getState().user
    const { activeRaid } = get()
    if (!user || !activeRaid) return { ok: false, error: 'No active raid' }
    const result = await submitDefendAction(activeRaid.id, user.id)
    if (result.ok) await get().fetchRaid()
    return result
  },

  async fetchInvites() {
    const user = useAuthStore.getState().user
    if (!user) return
    const invites = await fetchPendingInvites(user.id)
    set({ pendingInvites: invites })
  },

  async sendInvite(toUserId, _toUsername) {
    const user = useAuthStore.getState().user
    const { activeRaid } = get()
    if (!user) return { ok: false, error: 'Not logged in' }
    if (!activeRaid) return { ok: false, error: 'No active raid' }
    return createRaidInvite(user.id, toUserId, activeRaid.tier, activeRaid.id)
  },

  async acceptInvite(inviteId) {
    const user = useAuthStore.getState().user
    if (!user) return { ok: false, error: 'Not logged in' }
    // Use party role so Tank/Healer/DPS actions work correctly in the raid
    const myPartyRole = usePartyStore.getState().members.find((m) => m.user_id === user.id)?.role ?? 'dps'
    const snapshot = buildCharacterSnapshot()
    const result = await acceptRaidInvite(inviteId, user.id, myPartyRole, snapshot)
    if (result.ok) {
      set((s) => ({ pendingInvites: s.pendingInvites.filter((i) => i.id !== inviteId) }))
      await get().fetchRaid()
    }
    return result
  },

  async declineInvite(inviteId) {
    const result = await declineRaidInvite(inviteId)
    set((s) => ({ pendingInvites: s.pendingInvites.filter((i) => i.id !== inviteId) }))
    return result
  },
}))
