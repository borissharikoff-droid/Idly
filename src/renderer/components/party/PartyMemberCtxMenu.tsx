import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePartyStore } from '../../stores/partyStore'
import { useAuthStore } from '../../stores/authStore'
import { useRaidStore } from '../../stores/raidStore'
import { sendFriendRequest } from '../../services/partyService'
import { useToastStore } from '../../stores/toastStore'
import { playClickSound } from '../../lib/sounds'

export interface CtxTarget {
  x: number
  y: number
  userId: string
  username: string | null
  isSelf: boolean
  isFriend: boolean
}

interface Props {
  target: CtxTarget | null
  onClose: () => void
  onMessage?: () => void
}

export function PartyMemberCtxMenu({ target, onClose, onMessage }: Props) {
  const user = useAuthStore((s) => s.user)
  const party = usePartyStore((s) => s.party)
  const leaveParty = usePartyStore((s) => s.leaveParty)
  const kickMember = usePartyStore((s) => s.kickMember)
  const makeLeader = usePartyStore((s) => s.makeLeader)
  const pushToast = useToastStore((s) => s.push)
  const menuRef = useRef<HTMLDivElement>(null)

  const inActiveRaid = useRaidStore((s) => s.activeRaid?.status === 'active')
  const isLeader = party?.leader_id === user?.id

  useEffect(() => {
    if (!target) return
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    const closeKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', closeKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', closeKey)
    }
  }, [target, onClose])

  const act = async (fn: () => Promise<{ ok: boolean; error?: string }>, successMsg: string) => {
    onClose()
    playClickSound()
    const result = await fn()
    if (!result.ok) pushToast({ kind: 'generic', message: result.error ?? 'Action failed', type: 'error' })
    else pushToast({ kind: 'generic', message: successMsg, type: 'success' })
  }

  const handleLeave = async () => {
    onClose()
    playClickSound()
    await leaveParty()
    pushToast({ kind: 'generic', message: 'Left party', type: 'success' })
  }
  const handleKick = () => act(() => kickMember(target!.userId), `Kicked ${target?.username ?? 'player'}`)
  const handleMakeLeader = () => act(() => makeLeader(target!.userId), `${target?.username ?? 'Player'} is now leader`)
  const handleAddFriend = async () => {
    if (!user || !target) return
    onClose()
    playClickSound()
    const result = await sendFriendRequest(user.id, target.userId)
    pushToast({ kind: 'generic', message: result.ok ? 'Friend request sent!' : (result.error ?? 'Failed'), type: result.ok ? 'success' : 'error' })
  }
  const handleMessage = () => {
    onClose()
    playClickSound()
    onMessage?.()
  }

  // Clamp menu position to stay inside window
  const menuW = 162
  const menuH = 140
  const x = target ? Math.min(target.x, window.innerWidth - menuW - 8) : 0
  const y = target ? Math.min(target.y, window.innerHeight - menuH - 8) : 0

  return (
    <AnimatePresence>
      {target && (
        <motion.div
          ref={menuRef}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.08 }}
          className="fixed z-[60] min-w-[140px] rounded-lg bg-[#0d1117] border border-white/10 shadow-2xl overflow-hidden"
          style={{ top: y, left: x }}
        >
          {/* Title */}
          <div className="px-2.5 py-1 border-b border-white/[0.06]">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider truncate">
              {target.isSelf ? 'You' : (target.username ?? 'Player')}
            </p>
          </div>

          {target.isSelf ? (
            <button
              type="button"
              onClick={inActiveRaid ? undefined : handleLeave}
              disabled={inActiveRaid}
              title={inActiveRaid ? 'Cannot leave during active raid' : undefined}
              className="w-full text-left px-2.5 py-1.5 text-[10px] font-mono text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {inActiveRaid ? '🔒 Leave party' : 'Leave party'}
            </button>
          ) : (
            <>
              {target.isFriend && onMessage && (
                <button
                  type="button"
                  onClick={handleMessage}
                  className="w-full text-left px-2.5 py-1.5 text-[10px] font-mono text-indigo-300 hover:bg-indigo-500/10 transition-colors"
                >
                  Message
                </button>
              )}
              {isLeader && (
                <button
                  type="button"
                  onClick={inActiveRaid ? undefined : handleKick}
                  disabled={inActiveRaid}
                  title={inActiveRaid ? 'Cannot kick during active raid' : undefined}
                  className="w-full text-left px-2.5 py-1.5 text-[10px] font-mono text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {inActiveRaid ? '🔒 Kick' : 'Kick'}
                </button>
              )}
              {isLeader && (
                <button
                  type="button"
                  onClick={inActiveRaid ? undefined : handleMakeLeader}
                  disabled={inActiveRaid}
                  title={inActiveRaid ? 'Cannot transfer leadership during active raid' : undefined}
                  className="w-full text-left px-2.5 py-1.5 text-[10px] font-mono text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {inActiveRaid ? '🔒 Make leader' : 'Make leader'}
                </button>
              )}
              {!target.isFriend && (
                <button
                  type="button"
                  onClick={handleAddFriend}
                  className="w-full text-left px-2.5 py-1.5 text-[10px] font-mono text-cyber-neon hover:bg-cyber-neon/10 transition-colors"
                >
                  Add friend
                </button>
              )}
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
