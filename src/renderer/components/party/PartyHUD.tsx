import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePartyStore, subscribePartyInvitesRealtime, unsubscribePartyInvitesRealtime } from '../../stores/partyStore'
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
            className="w-[260px] rounded-2xl bg-[#0d1117] border border-cyber-neon/30 shadow-[0_0_32px_rgba(0,255,136,0.15)] overflow-hidden"
          >
            {/* Header */}
            <div className="px-5 pt-5 pb-3 text-center">
              <p className="text-2xl mb-2">👥</p>
              <p className="text-[13px] font-bold text-white">Party Invite</p>
              <p className="text-[11px] text-gray-400 mt-1">
                <span className="text-cyber-neon font-semibold">{invite.from_username ?? 'Someone'}</span>
                {' '}invited you to join their party
              </p>
            </div>

            {/* Buttons */}
            <div className="flex border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => { playClickSound(); declineInvite(invite.id) }}
                className="flex-1 py-3 text-[11px] font-mono text-gray-500 hover:text-gray-300 hover:bg-white/[0.04] transition-colors border-r border-white/[0.06]"
              >
                Decline
              </button>
              <button
                type="button"
                onClick={() => { playClickSound(); acceptInvite(invite.id, invite.party_id) }}
                className="flex-1 py-3 text-[11px] font-bold text-cyber-neon hover:bg-cyber-neon/10 transition-colors"
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

/** Global overlay — only the invite modal. Party members are shown in ProfileBar. */
export function PartyHUD() {
  const user = useAuthStore((s) => s.user)
  const fetchParty = usePartyStore((s) => s.fetchParty)
  const fetchInvites = usePartyStore((s) => s.fetchInvites)

  useEffect(() => {
    if (!user) return
    fetchParty()
    fetchInvites()
    // Real-time: show invite popup the moment someone sends us a party invite
    subscribePartyInvitesRealtime(user.id, () => fetchInvites())
    // Polling fallback in case Realtime misses an event
    const poll = setInterval(() => fetchInvites(), 15_000)
    return () => {
      unsubscribePartyInvitesRealtime()
      clearInterval(poll)
    }
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  return <PartyInviteOverlay />
}
