import { create } from 'zustand'
import {
  fetchMyGuild, fetchGuildMembers, fetchGuildActivityLog,
  fetchPendingInvites, sendGuildInvite, respondToInvite as apiRespondToInvite,
  setGuildTaxRate,
  createGuild as apiCreateGuild, joinGuild as apiJoinGuild,
  leaveGuild as apiLeaveGuild, depositGold as apiDepositGold, joinGuild,
  kickMember as apiKickMember, promoteMember as apiPromoteMember, demoteMember as apiDemoteMember,
  fetchHallContributions, donateToHall as apiDonateToHall,
  startHallBuild as apiStartHallBuild, completeHallUpgrade as apiCompleteHallUpgrade,
  type Guild, type GuildMember, type GuildActivityLogEntry, type GuildInvite,
} from '../services/guildService'
import { useGoldStore } from './goldStore'
import { useAuthStore } from './authStore'
import { supabase } from '../lib/supabase'
import { track } from '../lib/analytics'

interface GuildRaidGoal { current: number; target: number }
interface GuildRaid {
  id: string
  status: 'active' | 'completed' | 'failed'
  goals: Partial<Record<string, GuildRaidGoal>>
}

interface GuildState {
  myGuild: Guild | null
  membership: GuildMember | null
  members: GuildMember[]
  activityLog: GuildActivityLogEntry[]
  pendingInvites: GuildInvite[]
  activeRaid: GuildRaid | null
  isLoading: boolean
  error: string | null
  /** Current hall level (0 = not in guild, 1+ = hall level) */
  hallLevel: number
  /** Aggregated material donations for the current upgrade in progress */
  hallContributions: Record<string, number>
  hallBuildStartedAt: string | null
  hallBuildTargetLevel: number | null

  fetchMyGuild: () => Promise<void>
  createGuild: (name: string, tag: string, description?: string) => Promise<{ ok: boolean; error?: string }>
  joinGuild: (guildId: string) => Promise<{ ok: boolean; error?: string }>
  leaveGuild: () => Promise<{ ok: boolean; error?: string }>
  depositGold: (amount: number) => Promise<{ ok: boolean; error?: string }>
  sendInvite: (inviteeId: string) => Promise<{ ok: boolean; error?: string }>
  respondToInvite: (inviteId: string, response: 'accepted' | 'declined') => Promise<{ ok: boolean; error?: string }>
  updateTaxRate: (rate: number) => Promise<{ ok: boolean; error?: string }>
  kickMember: (memberId: string) => Promise<{ ok: boolean; error?: string }>
  promoteMember: (memberId: string) => Promise<{ ok: boolean; error?: string }>
  demoteMember: (memberId: string) => Promise<{ ok: boolean; error?: string }>
  launchRaid: (raidType: string) => Promise<{ ok: boolean; error?: string }>
  incrementRaidProgress: (type: string, delta: number) => void
  /** Donate materials from inventory to the guild hall. Starts build if threshold reached. */
  donateToHall: (items: Array<{ id: string; qty: number }>) => Promise<{ ok: boolean; buildStarted?: boolean; error?: string }>
  /** Complete the hall upgrade after timer has elapsed. */
  completeHallUpgrade: () => Promise<{ ok: boolean; error?: string }>
  /** Refresh just hall data (contributions). */
  fetchHallData: () => Promise<void>
}

export const useGuildStore = create<GuildState>()((set, get) => ({
  myGuild: null,
  membership: null,
  members: [],
  activityLog: [],
  pendingInvites: [],
  activeRaid: null,
  isLoading: false,
  error: null,
  hallLevel: 0,
  hallContributions: {},
  hallBuildStartedAt: null,
  hallBuildTargetLevel: null,

  async fetchMyGuild() {
    const user = useAuthStore.getState().user
    if (!user) return
    set({ isLoading: true, error: null })
    try {
      const [{ guild, membership }, pendingInvites] = await Promise.all([
        fetchMyGuild(user.id),
        fetchPendingInvites(user.id),
      ])
      set({
        myGuild: guild,
        membership,
        pendingInvites,
        hallLevel: guild ? (guild.hall_level ?? 1) : 0,
        hallBuildStartedAt: guild?.hall_build_started_at ?? null,
        hallBuildTargetLevel: guild?.hall_build_target_level ?? null,
      })
      if (guild) {
        const [members, activityLog, contributions] = await Promise.all([
          fetchGuildMembers(guild.id),
          fetchGuildActivityLog(guild.id),
          fetchHallContributions(guild.id),
        ])
        set({ members, activityLog, hallContributions: contributions })
      }
    } catch (err) {
      set({ error: String(err) })
    } finally {
      set({ isLoading: false })
    }
  },

  async createGuild(name, tag, description) {
    const user = useAuthStore.getState().user
    if (!user) return { ok: false, error: 'Not logged in' }
    const gold = useGoldStore.getState().gold
    if (gold < 500) return { ok: false, error: 'Not enough gold (500 🪙 required)' }
    set({ isLoading: true, error: null })
    try {
      const result = await apiCreateGuild(user.id, name, tag, description)
      if (result.ok && result.guild) {
        useGoldStore.getState().addGold(-500)
        if (supabase) useGoldStore.getState().syncToSupabase(user.id)
        track('guild_create', {})
        set({ myGuild: result.guild, membership: { id: '', guild_id: result.guild.id, user_id: user.id, role: 'owner', joined_at: new Date().toISOString(), contribution_gold: 0 }, members: [], activityLog: [] })
        await get().fetchMyGuild()
      }
      return result.ok ? { ok: true } : { ok: false, error: result.error }
    } catch (err) {
      return { ok: false, error: String(err) }
    } finally {
      set({ isLoading: false })
    }
  },

  async joinGuild(guildId) {
    const user = useAuthStore.getState().user
    if (!user) return { ok: false, error: 'Not logged in' }
    if (get().myGuild) return { ok: false, error: 'Already in a guild' }
    set({ isLoading: true, error: null })
    try {
      const result = await apiJoinGuild(user.id, guildId)
      if (result.ok) {
        track('guild_join', {})
        await get().fetchMyGuild()
      }
      return result
    } catch (err) {
      return { ok: false, error: String(err) }
    } finally {
      set({ isLoading: false })
    }
  },

  async leaveGuild() {
    const user = useAuthStore.getState().user
    const { myGuild } = get()
    if (!user || !myGuild) return { ok: false, error: 'Not in a guild' }
    set({ isLoading: true, error: null })
    try {
      const result = await apiLeaveGuild(user.id, myGuild.id)
      if (result.ok) {
        track('guild_leave', {})
        set({ myGuild: null, membership: null, members: [], activityLog: [], hallLevel: 0, hallContributions: {}, hallBuildStartedAt: null, hallBuildTargetLevel: null })
      }
      return result
    } catch (err) {
      return { ok: false, error: String(err) }
    } finally {
      set({ isLoading: false })
    }
  },

  async sendInvite(inviteeId) {
    const user = useAuthStore.getState().user
    const { myGuild, membership } = get()
    if (!user || !myGuild) return { ok: false, error: 'Not in a guild' }
    if (!membership || !['owner', 'officer'].includes(membership.role)) return { ok: false, error: 'Need officer+ role' }
    return sendGuildInvite(myGuild.id, user.id, inviteeId)
  },

  async respondToInvite(inviteId, response) {
    const user = useAuthStore.getState().user
    if (!user) return { ok: false, error: 'Not logged in' }
    // Find the invite BEFORE filtering it out
    const invite = get().pendingInvites.find((i) => i.id === inviteId)
    const result = await apiRespondToInvite(inviteId, response)
    if (result.ok) {
      set((s) => ({ pendingInvites: s.pendingInvites.filter((i) => i.id !== inviteId) }))
      if (response === 'accepted' && invite) {
        track('guild_join', {})
        await joinGuild(user.id, invite.guild_id)
        await get().fetchMyGuild()
      }
    }
    return result
  },

  async launchRaid(_raidType) {
    // Guild async raids — not yet wired to backend
    return { ok: false, error: 'Guild raids coming soon' }
  },

  incrementRaidProgress(type, delta) {
    const { activeRaid } = get()
    if (!activeRaid || activeRaid.status !== 'active' || !activeRaid.goals[type] || delta <= 0) return
    set((s) => {
      if (!s.activeRaid) return s
      const goals = { ...s.activeRaid.goals }
      if (!goals[type]) return s
      goals[type] = { ...goals[type]!, current: goals[type]!.current + delta }
      const allDone = Object.values(goals).every((g) => g && g.current >= g.target)
      return { activeRaid: { ...s.activeRaid, goals, status: allDone ? 'completed' : 'active' } }
    })
  },

  async updateTaxRate(rate) {
    const { myGuild } = get()
    if (!myGuild) return { ok: false, error: 'Not in a guild' }
    const result = await setGuildTaxRate(myGuild.id, rate)
    if (result.ok) set((s) => s.myGuild ? { myGuild: { ...s.myGuild!, tax_rate_pct: Math.max(0, Math.min(15, rate)) } } : s)
    return result
  },

  async depositGold(amount) {
    const user = useAuthStore.getState().user
    const { myGuild } = get()
    if (!user || !myGuild) return { ok: false, error: 'Not in a guild' }
    const currentGold = useGoldStore.getState().gold
    if (currentGold < amount) return { ok: false, error: 'Not enough gold' }

    set({ isLoading: true, error: null })
    try {
      // Deduct from local gold
      useGoldStore.getState().addGold(-amount)
      if (supabase) useGoldStore.getState().syncToSupabase(user.id)

      const result = await apiDepositGold(user.id, myGuild.id, amount)
      if (result.ok) {
        // Refresh guild data
        await get().fetchMyGuild()
      } else {
        // Refund on failure
        useGoldStore.getState().addGold(amount)
      }
      return result
    } catch (err) {
      useGoldStore.getState().addGold(amount) // refund
      return { ok: false, error: String(err) }
    } finally {
      set({ isLoading: false })
    }
  },

  async kickMember(memberId) {
    const { myGuild, membership } = get()
    if (!myGuild) return { ok: false, error: 'Not in a guild' }
    if (!membership || !['owner', 'officer'].includes(membership.role)) return { ok: false, error: 'Insufficient permissions' }
    const result = await apiKickMember(myGuild.id, memberId)
    if (result.ok) {
      set((s) => ({ members: s.members.filter((m) => m.user_id !== memberId) }))
    }
    return result
  },

  async promoteMember(memberId) {
    const { myGuild, membership } = get()
    if (!myGuild) return { ok: false, error: 'Not in a guild' }
    if (membership?.role !== 'owner') return { ok: false, error: 'Only owner can promote' }
    const result = await apiPromoteMember(myGuild.id, memberId)
    if (result.ok) {
      set((s) => ({ members: s.members.map((m) => m.user_id === memberId ? { ...m, role: 'officer' as const } : m) }))
    }
    return result
  },

  async demoteMember(memberId) {
    const { myGuild, membership } = get()
    if (!myGuild) return { ok: false, error: 'Not in a guild' }
    if (membership?.role !== 'owner') return { ok: false, error: 'Only owner can demote' }
    const result = await apiDemoteMember(myGuild.id, memberId)
    if (result.ok) {
      set((s) => ({ members: s.members.map((m) => m.user_id === memberId ? { ...m, role: 'member' as const } : m) }))
    }
    return result
  },

  async fetchHallData() {
    const { myGuild } = get()
    if (!myGuild) return
    const contributions = await fetchHallContributions(myGuild.id)
    set({ hallContributions: contributions })
  },

  async donateToHall(items) {
    const { myGuild, hallLevel, hallContributions, hallBuildStartedAt } = get()
    const user = useAuthStore.getState().user
    if (!user || !myGuild) return { ok: false, error: 'Not in a guild' }

    // If items provided: remove from inventory and persist
    let newContribs = { ...hallContributions }
    if (items.length > 0) {
      const { useInventoryStore } = await import('./inventoryStore')
      for (const item of items) {
        if (item.qty > 0) useInventoryStore.getState().deleteItem(item.id, item.qty)
      }

      const apiResult = await apiDonateToHall(myGuild.id, items)
      if (!apiResult.ok) {
        // Refund on failure
        const { useInventoryStore: inv } = await import('./inventoryStore')
        for (const item of items) {
          if (item.qty > 0) inv.getState().addItem(item.id, item.qty)
        }
        return apiResult
      }

      // Update local contributions
      for (const item of items) {
        newContribs[item.id] = (newContribs[item.id] ?? 0) + item.qty
      }
      set({ hallContributions: newContribs })

      // Fire-and-forget activity log
      supabase?.from('guild_activity_log').insert({
        guild_id: myGuild.id,
        user_id: user.id,
        event_type: 'hall_donate',
        payload: { items, summary: items.map((i) => `${i.qty}× ${i.id}`).join(', ') },
      })
    }

    // Check if build is already in progress
    if (hallBuildStartedAt) return { ok: true }

    // Check if all materials for next level are satisfied
    const { GUILD_HALL_LEVELS } = await import('../lib/guildBuffs')
    const nextLevelDef = GUILD_HALL_LEVELS[hallLevel] // hallLevel is 1-indexed, array is 0-indexed
    if (!nextLevelDef || nextLevelDef.level <= hallLevel) return { ok: true }

    const allMet = nextLevelDef.materials.every(
      (mat) => (newContribs[mat.id] ?? 0) >= mat.qty,
    )
    if (!allMet) return { ok: true }

    // Threshold crossed — attempt to pay gold and start build
    const { useGoldStore: gs } = await import('./goldStore')
    const currentGold = gs.getState().gold
    if (currentGold < nextLevelDef.goldCost && nextLevelDef.goldCost > 0) {
      return { ok: true, buildStarted: false }
    }

    if (nextLevelDef.goldCost > 0) {
      gs.getState().addGold(-nextLevelDef.goldCost)
      gs.getState().syncToSupabase(user.id).catch(() => {})
    }

    const buildResult = await apiStartHallBuild(myGuild.id, nextLevelDef.level)
    if (buildResult.ok) {
      const now = new Date().toISOString()
      set({
        hallBuildStartedAt: now,
        hallBuildTargetLevel: nextLevelDef.level,
        myGuild: { ...myGuild, hall_build_started_at: now, hall_build_target_level: nextLevelDef.level },
      })
      supabase?.from('guild_activity_log').insert({
        guild_id: myGuild.id,
        user_id: user.id,
        event_type: 'hall_upgrade_started',
        payload: { target_level: nextLevelDef.level, gold_paid: nextLevelDef.goldCost },
      })
      return { ok: true, buildStarted: true }
    } else {
      if (nextLevelDef.goldCost > 0) {
        gs.getState().addGold(nextLevelDef.goldCost)
      }
      return { ok: false, error: buildResult.error }
    }
  },

  async completeHallUpgrade() {
    const { myGuild, hallBuildStartedAt, hallBuildTargetLevel } = get()
    const user = useAuthStore.getState().user
    if (!user || !myGuild) return { ok: false, error: 'Not in a guild' }
    if (!hallBuildStartedAt || !hallBuildTargetLevel) return { ok: false, error: 'No build in progress' }

    // Check that time has elapsed
    const { GUILD_HALL_LEVELS } = await import('../lib/guildBuffs')
    // buildDef = the level we're upgrading TO (materials consumed are its requirements)
    const buildDef = GUILD_HALL_LEVELS[hallBuildTargetLevel - 1]
    const durationMs = buildDef?.buildDurationMs ?? 0
    const elapsed = Date.now() - new Date(hallBuildStartedAt).getTime()
    if (elapsed < durationMs) return { ok: false, error: 'Build not ready yet' }

    // Get item IDs to reset (the materials that were required for this upgrade)
    const itemsToReset = (buildDef?.materials ?? []).map((m) => m.id)

    const result = await apiCompleteHallUpgrade(myGuild.id, hallBuildTargetLevel, itemsToReset)
    if (!result.ok) return result

    // Reset local contributions for completed level items
    const newContribs = { ...get().hallContributions }
    for (const id of itemsToReset) {
      newContribs[id] = 0
    }

    set({
      hallLevel: hallBuildTargetLevel,
      hallBuildStartedAt: null,
      hallBuildTargetLevel: null,
      hallContributions: newContribs,
      myGuild: {
        ...myGuild,
        hall_level: hallBuildTargetLevel,
        hall_build_started_at: null,
        hall_build_target_level: null,
      },
    })

    // Log completion (fire-and-forget)
    void supabase?.from('guild_activity_log').insert({
      guild_id: myGuild.id,
      user_id: user.id,
      event_type: 'hall_upgrade_complete',
      payload: { new_level: hallBuildTargetLevel },
    })

    return { ok: true }
  },
}))
