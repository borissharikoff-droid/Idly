import { create } from 'zustand'
import {
  createParty as createPartyDb,
  fetchActiveParty,
  disbandParty as disbandPartyDb,
  leaveParty as leavePartyDb,
  sendPartyInvite,
  fetchPendingPartyInvites,
  acceptPartyInvite,
  declinePartyInvite,
  updateMemberRole,
  kickPartyMember,
  transferPartyLeadership,
  type Party, type PartyMember, type PartyInvite, type PartyRole,
} from '../services/partyService'
import { updateRaidParticipantRole } from '../services/raidService'
import { useAuthStore } from './authStore'
import { useRaidStore } from './raidStore'
import { supabase } from '../lib/supabase'

// Module-level realtime channels — survive re-renders
let _partyChannel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null
let _inviteChannel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null

function subscribePartyRealtime(partyId: string, onUpdate: () => void) {
  if (!supabase) return
  if (_partyChannel?.topic === `realtime:party_members_${partyId}`) return
  if (_partyChannel) { supabase.removeChannel(_partyChannel); _partyChannel = null }
  _partyChannel = supabase
    .channel(`party_members_${partyId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'party_members', filter: `party_id=eq.${partyId}` }, onUpdate)
    .subscribe()
}

function unsubscribePartyRealtime() {
  if (!supabase || !_partyChannel) return
  supabase.removeChannel(_partyChannel)
  _partyChannel = null
}

/** Subscribe to incoming party invites for a user — shows popup in real-time */
export function subscribePartyInvitesRealtime(userId: string, onNewInvite: () => void) {
  if (!supabase) return
  if (_inviteChannel?.topic === `realtime:party_invites_${userId}`) return
  if (_inviteChannel) { supabase.removeChannel(_inviteChannel); _inviteChannel = null }
  _inviteChannel = supabase
    .channel(`party_invites_${userId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'party_invites', filter: `to_user_id=eq.${userId}` }, onNewInvite)
    .subscribe()
}

export function unsubscribePartyInvitesRealtime() {
  if (!supabase || !_inviteChannel) return
  supabase.removeChannel(_inviteChannel)
  _inviteChannel = null
}

export type { Party, PartyMember, PartyInvite, PartyRole }

interface PartyState {
  party: Party | null
  members: PartyMember[]
  pendingInvites: PartyInvite[]
  isLoading: boolean

  fetchParty: () => Promise<void>
  createParty: () => Promise<{ ok: boolean; error?: string }>
  disbandParty: () => Promise<void>
  leaveParty: () => Promise<void>
  sendInvite: (toUserId: string) => Promise<{ ok: boolean; error?: string }>
  fetchInvites: () => Promise<void>
  acceptInvite: (inviteId: string, partyId: string) => Promise<{ ok: boolean }>
  declineInvite: (inviteId: string) => Promise<void>
  setMyRole: (role: PartyRole) => Promise<void>
  kickMember: (userId: string) => Promise<{ ok: boolean; error?: string }>
  makeLeader: (userId: string) => Promise<{ ok: boolean; error?: string }>
}

export const usePartyStore = create<PartyState>()((set, get) => ({
  party: null,
  members: [],
  pendingInvites: [],
  isLoading: false,

  async fetchParty() {
    const user = useAuthStore.getState().user
    if (!user) return
    set({ isLoading: true })
    try {
      const { party, members } = await fetchActiveParty(user.id)
      set({ party, members })
      if (party?.status === 'active') {
        subscribePartyRealtime(party.id, () => get().fetchParty())
      } else {
        unsubscribePartyRealtime()
      }
    } catch { /* ignore */ } finally {
      set({ isLoading: false })
    }
  },

  async createParty() {
    const user = useAuthStore.getState().user
    if (!user) return { ok: false, error: 'Not logged in' }
    const result = await createPartyDb(user.id)
    if (result.ok && result.party) {
      set({ party: result.party })
      await get().fetchParty()
    }
    return result.ok ? { ok: true } : { ok: false, error: result.error }
  },

  async disbandParty() {
    const { party } = get()
    if (!party) return
    if (useRaidStore.getState().activeRaid?.status === 'active') return
    await disbandPartyDb(party.id)
    unsubscribePartyRealtime()
    set({ party: null, members: [] })
  },

  async leaveParty() {
    const user = useAuthStore.getState().user
    const { party } = get()
    if (!user || !party) return
    if (useRaidStore.getState().activeRaid?.status === 'active') return
    await leavePartyDb(party.id, user.id)
    unsubscribePartyRealtime()
    set({ party: null, members: [] })
  },

  async sendInvite(toUserId) {
    const user = useAuthStore.getState().user
    if (!user) return { ok: false, error: 'Not logged in' }
    let { party } = get()
    // Auto-create a party if the user doesn't have one yet
    if (!party) {
      const created = await get().createParty()
      if (!created.ok) return { ok: false, error: created.error ?? 'Failed to create party' }
      party = get().party
    }
    if (!party) return { ok: false, error: 'Failed to create party' }
    return sendPartyInvite(party.id, user.id, toUserId)
  },

  async fetchInvites() {
    const user = useAuthStore.getState().user
    if (!user) return
    const invites = await fetchPendingPartyInvites(user.id)
    set({ pendingInvites: invites })
  },

  async acceptInvite(inviteId, partyId) {
    const user = useAuthStore.getState().user
    if (!user) return { ok: false }
    const result = await acceptPartyInvite(inviteId, user.id, partyId)
    if (result.ok) {
      set((s) => ({ pendingInvites: s.pendingInvites.filter((i) => i.id !== inviteId) }))
      await get().fetchParty()
    }
    return { ok: result.ok }
  },

  async declineInvite(inviteId) {
    await declinePartyInvite(inviteId)
    set((s) => ({ pendingInvites: s.pendingInvites.filter((i) => i.id !== inviteId) }))
  },

  async setMyRole(role) {
    const user = useAuthStore.getState().user
    const { party } = get()
    if (!user || !party) return
    if (useRaidStore.getState().activeRaid?.status === 'active') return
    await updateMemberRole(party.id, user.id, role)
    set((s) => ({
      members: s.members.map((m) => m.user_id === user.id ? { ...m, role } : m),
    }))
    // Keep raid_participants.role in sync if user is in an active raid
    const activeRaid = useRaidStore.getState().activeRaid
    if (activeRaid?.status === 'active') {
      await updateRaidParticipantRole(activeRaid.id, user.id, role)
    }
  },

  async kickMember(userId) {
    const { party } = get()
    if (!party) return { ok: false, error: 'Not in a party' }
    if (useRaidStore.getState().activeRaid?.status === 'active') return { ok: false, error: 'Cannot kick during active raid' }
    const result = await kickPartyMember(party.id, userId)
    if (result.ok) {
      const remaining = get().members.filter((m) => m.user_id !== userId)
      if (remaining.length <= 1) {
        // Last member — disband the party
        await disbandPartyDb(party.id)
        set({ party: null, members: [] })
      } else {
        set({ members: remaining })
      }
    }
    return result
  },

  async makeLeader(userId) {
    const { party } = get()
    if (!party) return { ok: false, error: 'Not in a party' }
    const result = await transferPartyLeadership(party.id, userId)
    if (result.ok) {
      set((s) => s.party ? { party: { ...s.party, leader_id: userId } } : s)
    }
    return result
  },
}))
