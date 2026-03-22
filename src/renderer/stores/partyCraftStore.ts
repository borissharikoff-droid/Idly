import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import {
  createPartyCraftSession, joinPartyCraftSession,
  completePartyCraftSession, cancelPartyCraftSession,
  fetchActivePartyCraftSession,
  type PartyCraftSession,
} from '../services/partyCraftService'
import { useAuthStore } from './authStore'

export type { PartyCraftSession }

let _craftChannel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null

interface PartyCraftState {
  session: PartyCraftSession | null

  /** Subscribe to realtime updates for a party's craft session. Call when party becomes active. */
  subscribeRealtime: (partyId: string) => void
  unsubscribeRealtime: () => void

  /** Fetch current active session for a party (called on mount / reconnect). */
  fetchSession: (partyId: string) => Promise<void>

  /** Initiator: start a party craft. Returns the party speed multiplier applied. */
  initiateSession: (
    partyId: string,
    recipeId: string,
    outputItemId: string,
    partySize: number,
    totalXp: number,
  ) => Promise<{ ok: boolean; speedMult: number }>

  /** Helper: join an active craft session. */
  joinSession: (sessionId: string) => Promise<void>

  /** Initiator: called when the craft job finishes — distributes XP to helpers. */
  completeSession: (sessionId: string) => Promise<void>

  /** Cancel the active session (initiator left / app closing). */
  cancelSession: () => Promise<void>

  /** Clear session locally (e.g. after done/cancelled arrives via realtime). */
  clearSession: () => void
}

export const usePartyCraftStore = create<PartyCraftState>()((set, get) => ({
  session: null,

  subscribeRealtime(partyId) {
    if (!supabase) return
    if (_craftChannel?.topic === `realtime:party_craft_${partyId}`) return
    if (_craftChannel) { supabase.removeChannel(_craftChannel); _craftChannel = null }
    _craftChannel = supabase
      .channel(`party_craft_${partyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'party_craft_sessions', filter: `party_id=eq.${partyId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as PartyCraftSession | null
          if (!row) return
          if (row.status === 'crafting') {
            set({ session: row })
          } else {
            // done or cancelled — clear
            set({ session: null })
          }
        },
      )
      .subscribe()
  },

  unsubscribeRealtime() {
    if (!supabase || !_craftChannel) return
    supabase.removeChannel(_craftChannel)
    _craftChannel = null
  },

  async fetchSession(partyId) {
    const session = await fetchActivePartyCraftSession(partyId)
    set({ session })
  },

  async initiateSession(partyId, recipeId, outputItemId, partySize, totalXp) {
    const user = useAuthStore.getState().user
    if (!user) return { ok: false, speedMult: 1 }
    const result = await createPartyCraftSession(partyId, recipeId, outputItemId, user.id, partySize, totalXp)
    if (result.ok && result.session) {
      set({ session: result.session })
    }
    const speedMult = 1 / Math.max(1, partySize)
    return { ok: result.ok, speedMult }
  },

  async joinSession(sessionId) {
    const user = useAuthStore.getState().user
    if (!user) return
    await joinPartyCraftSession(sessionId, user.id)
    // Optimistic update
    set((s) => s.session?.id === sessionId && s.session
      ? { session: { ...s.session, helpers: [...new Set([...s.session.helpers, user.id])] } }
      : s
    )
  },

  async completeSession(sessionId) {
    await completePartyCraftSession(sessionId)
    set({ session: null })
  },

  async cancelSession() {
    const { session } = get()
    if (!session) return
    await cancelPartyCraftSession(session.id)
    set({ session: null })
  },

  clearSession() {
    set({ session: null })
  },
}))
