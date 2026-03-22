import { motion, AnimatePresence } from 'framer-motion'
import type { PendingRequest } from '../../hooks/useFriends'
import { AvatarWithFrame } from '../shared/AvatarWithFrame'

interface PendingRequestsProps {
  requests: PendingRequest[]
  onAccept: (friendshipId: string) => void
  onReject: (friendshipId: string) => void
}

export function PendingRequests({ requests, onAccept, onReject }: PendingRequestsProps) {
  const incoming = requests.filter((r) => r.direction === 'incoming')
  const outgoing = requests.filter((r) => r.direction === 'outgoing')

  if (requests.length === 0) return null

  return (
    <div className="space-y-3">
      {incoming.length > 0 && (
        <div className="rounded-card bg-surface-2/80 border border-white/10 p-4">
          <p className="text-xs uppercase tracking-wider text-gray-400 font-mono mb-3">
            [ incoming requests — {incoming.length} ]
          </p>
          <AnimatePresence>
            {incoming.map((req) => (
              <motion.div
                key={req.friendship_id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10, height: 0 }}
                className="flex items-center gap-3 py-2"
              >
                <AvatarWithFrame
                  avatar={req.profile.avatar_url || (req.profile.username || '??').toUpperCase().slice(0, 2)}
                  frameId={req.profile.equipped_frame}
                  sizeClass="w-9 h-9"
                  textClass="text-sm font-semibold text-white"
                  roundedClass="rounded-full"
                  ringInsetClass="-inset-0.5"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {req.profile.username || 'Anonymous'}
                  </p>
                  <p className="text-xs text-gray-500">{req.profile.total_skill_level ?? req.profile.level ?? 0} skill lvl</p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => onAccept(req.friendship_id)}
                    className="px-3 py-1.5 rounded bg-accent/20 text-accent text-xs font-semibold hover:bg-accent/30 transition-colors border border-accent/30"
                  >
                    Accept
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => onReject(req.friendship_id)}
                    className="px-3 py-1.5 rounded bg-red-500/20 text-red-500 text-xs font-semibold hover:bg-red-500/30 transition-colors border border-red-500/30"
                  >
                    Reject
                  </motion.button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {outgoing.length > 0 && (
        <div className="rounded-card bg-surface-2/80 border border-white/10 p-4">
          <p className="text-xs uppercase tracking-wider text-gray-400 font-mono mb-3">
            [ sent requests — {outgoing.length} ]
          </p>
          {outgoing.map((req) => (
            <div key={req.friendship_id} className="flex items-center gap-3 py-2">
              <AvatarWithFrame
                avatar={req.profile.avatar_url || (req.profile.username || '??').toUpperCase().slice(0, 2)}
                frameId={req.profile.equipped_frame}
                sizeClass="w-9 h-9"
                textClass="text-sm font-semibold text-white"
                roundedClass="rounded-full"
                ringInsetClass="-inset-0.5"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {req.profile.username || 'Anonymous'}
                </p>
                <p className="text-xs text-gray-500">{req.profile.total_skill_level ?? req.profile.level ?? 0} skill lvl</p>
              </div>
              <span className="text-xs text-gray-500 italic shrink-0">pending</span>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => onReject(req.friendship_id)}
                className="text-gray-500 hover:text-red-500 text-xs shrink-0"
                title="Cancel request"
              >
                ✕
              </motion.button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
