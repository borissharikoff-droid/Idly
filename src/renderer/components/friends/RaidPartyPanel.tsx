import { useState } from 'react'
import { useRaidStore } from '../../stores/raidStore'
import { useAuthStore } from '../../stores/authStore'
import { RAID_TIER_CONFIGS } from '../../services/raidService'
import type { FriendProfile } from '../../hooks/useFriends'

interface Props {
  friends: FriendProfile[]
}

export function RaidPartyPanel({ friends }: Props) {
  const activeRaid = useRaidStore((s) => s.activeRaid)
  const participants = useRaidStore((s) => s.participants)
  const sendInvite = useRaidStore((s) => s.sendInvite)
  const user = useAuthStore((s) => s.user)
  const [sending, setSending] = useState<string | null>(null)
  const [sent, setSent] = useState<Set<string>>(new Set())

  if (!activeRaid) return null
  const cfg = RAID_TIER_CONFIGS[activeRaid.tier]
  const participantIds = new Set(participants.map((p) => p.user_id))

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: `${cfg.color}28`, background: `${cfg.color}06` }}>
      <div className="px-4 py-3 border-b" style={{ borderColor: `${cfg.color}15` }}>
        <p className="text-[12px] font-bold text-white">{cfg.icon} Active Raid Party</p>
        <p className="text-[10px] text-gray-500 font-mono mt-0.5">{cfg.name} — invite friends to join</p>
      </div>
      <div className="p-3 space-y-1.5">
        {friends.length === 0 && (
          <p className="text-[10px] text-gray-600 font-mono text-center py-2">No friends to invite.</p>
        )}
        {friends.map((f) => {
          const alreadyIn = participantIds.has(f.id)
          const alreadySent = sent.has(f.id)
          const isMe = f.id === user?.id
          if (isMe) return null
          return (
            <div key={f.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl bg-white/[0.03]">
              <div className="w-6 h-6 rounded-full bg-white/[0.08] flex items-center justify-center text-[10px] text-gray-400 shrink-0 font-mono">
                {(f.username ?? '?')[0].toUpperCase()}
              </div>
              <p className="flex-1 text-[11px] text-white truncate">{f.username ?? 'Unknown'}</p>
              {alreadyIn ? (
                <span className="text-[10px] text-green-400 font-mono shrink-0">In party</span>
              ) : alreadySent ? (
                <span className="text-[10px] text-gray-500 font-mono shrink-0">Invited</span>
              ) : (
                <button
                  type="button"
                  disabled={sending === f.id}
                  onClick={async () => {
                    setSending(f.id)
                    await sendInvite(f.id, f.username ?? '')
                    setSent((prev) => new Set([...prev, f.id]))
                    setSending(null)
                  }}
                  className="text-[10px] font-mono px-2.5 py-1 rounded-lg border transition-colors"
                  style={{ borderColor: `${cfg.color}40`, color: cfg.color, background: `${cfg.color}10` }}
                >
                  {sending === f.id ? '...' : 'Invite'}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
