import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePartyStore, subscribePartyInvitesRealtime, unsubscribePartyInvitesRealtime } from '../../stores/partyStore'
import { usePartyCraftStore } from '../../stores/partyCraftStore'
import { useAuthStore } from '../../stores/authStore'
import { playClickSound } from '../../lib/sounds'

function PartyInviteOverlay() {
  const pendingInvites = usePartyStore((s) => s.pendingInvites)
  const acceptInvite = usePartyStore((s) => s.acceptInvite)
  const declineInvite = usePartyStore((s) => s.declineInvite)

  const invite = pendingInvites[0] ?? null

  return (
    <AnimatePresence>
      {invite && (
        <motion.div
          key={invite.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.85, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 8 }}
            transition={{ type: 'spring', damping: 22, stiffness: 320 }}
            className="w-[260px] rounded-card bg-surface-0 border border-accent/30 shadow-[0_0_32px_rgba(0,255,136,0.15)] overflow-hidden"
          >
            {/* Header */}
            <div className="px-5 pt-5 pb-3 text-center">
              <p className="text-2xl mb-2">👥</p>
              <p className="text-body font-bold text-white">Party Invite</p>
              <p className="text-caption text-gray-400 mt-1">
                <span className="text-accent font-semibold">{invite.from_username ?? 'Someone'}</span>
                {' '}invited you to join their party
              </p>
            </div>

            {/* Buttons */}
            <div className="flex border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => { playClickSound(); declineInvite(invite.id) }}
                className="flex-1 py-3 text-caption font-mono text-gray-500 hover:text-gray-300 hover:bg-white/[0.04] transition-colors border-r border-white/[0.06]"
              >
                Decline
              </button>
              <button
                type="button"
                onClick={() => { playClickSound(); acceptInvite(invite.id, invite.party_id) }}
                className="flex-1 py-3 text-caption font-bold text-accent hover:bg-accent/10 transition-colors"
              >
                Accept
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Global overlay — invite modal + party craft subscription. */
export function PartyHUD() {
  const user = useAuthStore((s) => s.user)
  const fetchParty = usePartyStore((s) => s.fetchParty)
  const fetchInvites = usePartyStore((s) => s.fetchInvites)
  const partyId = usePartyStore((s) => s.party?.id ?? null)
  const { subscribeRealtime, unsubscribeRealtime, fetchSession } = usePartyCraftStore()

  useEffect(() => {
    if (!user) return
    fetchParty()
    fetchInvites()
    subscribePartyInvitesRealtime(user.id, () => fetchInvites())
    const invitePoll = setInterval(() => fetchInvites(), 2_000)
    const partyPoll  = setInterval(() => fetchParty(),   5_000)
    return () => {
      unsubscribePartyInvitesRealtime()
      clearInterval(invitePoll)
      clearInterval(partyPoll)
    }
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to party craft realtime whenever party changes
  useEffect(() => {
    if (!partyId) { unsubscribeRealtime(); return }
    subscribeRealtime(partyId)
    fetchSession(partyId).catch(() => {})
  }, [partyId]) // eslint-disable-line react-hooks/exhaustive-deps

  return <PartyInviteOverlay />
}
