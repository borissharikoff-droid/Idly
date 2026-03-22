import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePartyStore } from '../../stores/partyStore'
import { useAuthStore } from '../../stores/authStore'
import { useRaidStore } from '../../stores/raidStore'
import { ROLE_ICONS, ROLE_LABELS, ROLE_COLORS, type PartyRole } from '../../services/partyService'
import { AvatarWithFrame } from '../shared/AvatarWithFrame'
import { MAX_TOTAL_SKILL_LEVEL } from '../../lib/skills'
import { useToastStore } from '../../stores/toastStore'
import { playClickSound } from '../../lib/sounds'
import type { FriendProfile } from '../../hooks/useFriends'
import { PartyMemberCtxMenu, type CtxTarget } from '../party/PartyMemberCtxMenu'

const ROLES: PartyRole[] = ['tank', 'healer', 'dps']

interface Props {
  friends: FriendProfile[]
  onClose: () => void
  onViewProfile?: (friend: FriendProfile) => void
  onMessageFriend?: (userId: string) => void
}

export function PartyPanel({ friends, onClose, onViewProfile, onMessageFriend }: Props) {
  const user = useAuthStore((s) => s.user)
  const party = usePartyStore((s) => s.party)
  const members = usePartyStore((s) => s.members)
  const pendingInvites = usePartyStore((s) => s.pendingInvites)
  const createParty = usePartyStore((s) => s.createParty)
  const disbandParty = usePartyStore((s) => s.disbandParty)
  const leaveParty = usePartyStore((s) => s.leaveParty)
  const sendInvite = usePartyStore((s) => s.sendInvite)
  const setMyRole = usePartyStore((s) => s.setMyRole)
  const acceptInvite = usePartyStore((s) => s.acceptInvite)
  const declineInvite = usePartyStore((s) => s.declineInvite)
  const pushToast = useToastStore((s) => s.push)

  const [inviting, setInviting] = useState<string | null>(null)
  const [invited, setInvited] = useState<Set<string>>(new Set())
  const [isCreating, setIsCreating] = useState(false)
  const [ctxTarget, setCtxTarget] = useState<CtxTarget | null>(null)
  const [ctxMessageUserId, setCtxMessageUserId] = useState<string | null>(null)

  const friendIds = useMemo(() => new Set(friends.map((f) => f.id)), [friends])

  const inActiveRaid = useRaidStore((s) => s.activeRaid?.status === 'active')
  const isLeader = party?.leader_id === user?.id
  const memberIds = useMemo(() => new Set(members.map((m) => m.user_id)), [members])

  const handleCreate = async () => {
    setIsCreating(true)
    playClickSound()
    const result = await createParty()
    setIsCreating(false)
    if (!result.ok) pushToast({ kind: 'generic', message: result.error ?? 'Failed to create party', type: 'error' })
  }

  const handleInvite = async (friendId: string) => {
    setInviting(friendId)
    playClickSound()
    const result = await sendInvite(friendId)
    if (result.ok) {
      setInvited((prev) => new Set([...prev, friendId]))
    } else {
      pushToast({ kind: 'generic', message: result.error ?? 'Invite failed', type: 'error' })
    }
    setInviting(null)
  }

  const handleLeaveOrDisband = async () => {
    playClickSound()
    if (isLeader) {
      await disbandParty()
      pushToast({ kind: 'generic', message: 'Party disbanded', type: 'success' })
    } else {
      await leaveParty()
      pushToast({ kind: 'generic', message: 'Left party', type: 'success' })
    }
    onClose()
  }

  // — No party yet —
  if (!party) {
    return (
      <div className="space-y-4">
        {/* Pending invites */}
        <AnimatePresence>
          {pendingInvites.map((inv) => (
            <motion.div
              key={inv.id}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded border border-accent/20 bg-accent/5"
            >
              <span className="text-base shrink-0">👥</span>
              <div className="flex-1 min-w-0">
                <p className="text-caption text-white truncate">
                  {inv.from_username ?? 'Someone'} invited you to a party
                </p>
              </div>
              <button
                type="button"
                onClick={() => acceptInvite(inv.id, inv.party_id)}
                className="text-micro font-mono px-2 py-1 rounded border border-accent/40 text-accent bg-accent/10 hover:bg-accent/20 transition-colors"
              >
                Join
              </button>
              <button
                type="button"
                onClick={() => declineInvite(inv.id)}
                className="text-micro font-mono px-2 py-1 rounded border border-white/10 text-gray-500 hover:text-gray-300 transition-colors"
              >
                Decline
              </button>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Benefits + create */}
        <div className="rounded-card border border-white/[0.06] bg-white/[0.02] overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-white/[0.05]">
            <p className="text-caption font-bold text-white mb-3">Party Perks</p>
            <div className="space-y-2">
              {([
                ['⚔', '+5% XP', 'Bonus XP for all skills while in a party with 2+ members'],
                ['🛡', 'Raid Roles', 'Tank absorbs boss damage · Healer restores party HP · DPS attacks'],
                ['👥', 'Shared Raids', 'Coordinate multi-day boss raids with your party'],
              ] as const).map(([icon, label, desc]) => (
                <div key={label} className="flex items-start gap-2.5">
                  <span className="text-base leading-none mt-0.5">{icon}</span>
                  <div>
                    <p className="text-micro font-semibold text-white leading-none mb-0.5">{label}</p>
                    <p className="text-micro text-gray-500 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="px-4 py-3 text-center">
            <button
              type="button"
              onClick={handleCreate}
              disabled={isCreating}
              className="w-full py-2 rounded border border-accent/40 text-accent text-caption font-bold bg-accent/10 hover:bg-accent/20 transition-colors disabled:opacity-40"
            >
              {isCreating ? 'Creating...' : '+ Create Party'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // — Active party —
  return (
    <div className="space-y-3">
      {/* Raid lock banner */}
      {inActiveRaid && (
        <div className="flex items-center gap-2 px-3 py-2 rounded border border-amber-500/20 bg-amber-500/05 text-amber-400">
          <span className="text-base shrink-0">⚔️</span>
          <p className="text-micro font-mono leading-relaxed">
            Raid in progress — party locked.<br />
            <span className="text-gray-500">Can't leave, kick, or change roles until raid ends.</span>
          </p>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div>
          <p className="text-xs font-bold text-white">Your Party</p>
          <p className="text-micro font-mono text-gray-500">{members.length}/5 members · +5% XP active</p>
        </div>
        <button
          type="button"
          onClick={inActiveRaid ? undefined : handleLeaveOrDisband}
          disabled={inActiveRaid}
          title={inActiveRaid ? 'Cannot leave party during an active raid' : undefined}
          className="text-micro font-mono px-2 py-1 rounded border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {isLeader ? 'Disband' : 'Leave'}
        </button>
      </div>

      {/* Member list */}
      <div className="rounded-card border border-white/[0.06] overflow-hidden">
        {members.map((m, idx) => {
          const isMe = m.user_id === user?.id
          const roleColor = ROLE_COLORS[m.role]
          const friendEntry = friends.find((f) => f.id === m.user_id)
          return (
            <div
              key={m.user_id}
              className="flex items-center gap-2.5 px-3 py-2 select-none"
              style={{
                borderTop: idx > 0 ? '1px solid rgba(255,255,255,0.04)' : undefined,
                background: isMe ? `${roleColor}06` : undefined,
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                setCtxTarget({ x: e.clientX, y: e.clientY, userId: m.user_id, username: m.username, isSelf: isMe, isFriend: friendIds.has(m.user_id) })
                setCtxMessageUserId(m.user_id)
              }}
            >
              {/* Avatar — clickable for non-self members */}
              <button
                type="button"
                disabled={isMe || !friendEntry || !onViewProfile}
                onClick={() => friendEntry && onViewProfile?.(friendEntry)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-caption font-mono shrink-0 transition-opacity disabled:cursor-default"
                style={{ background: `${roleColor}18`, color: roleColor, border: `1px solid ${roleColor}30` }}
                title={isMe ? undefined : (m.username ?? undefined)}
              >
                {(m.username ?? '?')[0].toUpperCase()}
              </button>

              {/* Name + leader badge */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-caption text-white truncate">
                    {isMe ? 'You' : (m.username ?? 'Unknown')}
                  </p>
                  {m.user_id === party.leader_id && (
                    <span className="text-[7px] font-mono px-1 py-0.5 rounded border border-amber-500/30 text-amber-400 bg-amber-500/10">
                      LEADER
                    </span>
                  )}
                </div>
              </div>

              {/* Role selector (only for yourself) or role badge for others */}
              {isMe ? (
                <div className="flex items-center gap-1 shrink-0" title={inActiveRaid ? 'Role locked during active raid' : undefined}>
                  {ROLES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={inActiveRaid ? undefined : () => { playClickSound(); setMyRole(r) }}
                      disabled={inActiveRaid}
                      className="w-6 h-6 rounded flex items-center justify-center text-caption transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{
                        background: m.role === r ? `${ROLE_COLORS[r]}25` : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${m.role === r ? `${ROLE_COLORS[r]}50` : 'rgba(255,255,255,0.08)'}`,
                      }}
                      title={inActiveRaid ? 'Role locked during active raid' : ROLE_LABELS[r]}
                    >
                      {ROLE_ICONS[r]}
                    </button>
                  ))}
                </div>
              ) : (
                <div
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded-md border shrink-0"
                  style={{ borderColor: `${roleColor}30`, background: `${roleColor}10` }}
                >
                  <span className="text-micro">{ROLE_ICONS[m.role]}</span>
                  <span className="text-micro font-mono" style={{ color: roleColor }}>{ROLE_LABELS[m.role]}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Role legend */}
      <div className="flex gap-2 px-1 flex-wrap">
        {ROLES.map((r) => (
          <div key={r} className="flex items-center gap-1">
            <span className="text-micro">{ROLE_ICONS[r]}</span>
            <span className="text-micro font-mono text-gray-600">{ROLE_LABELS[r]}</span>
          </div>
        ))}
        <span className="text-micro font-mono text-gray-700 ml-auto">determines raid actions</span>
      </div>

      {/* Invite friends */}
      {members.length < 5 && friends.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-micro uppercase tracking-wider font-mono text-gray-600 px-1">Invite Friends</p>
          {friends
            .filter((f) => !memberIds.has(f.id) && f.id !== user?.id)
            .map((f) => {
              const alreadyInvited = invited.has(f.id)
              const hasSyncedSkills = f.skills_sync_status === 'synced'
              const skillDisplay = hasSyncedSkills ? `${f.total_skill_level ?? 0}/${MAX_TOTAL_SKILL_LEVEL}` : '--/--'
              return (
                <div key={f.id} className="flex items-center gap-2.5 px-3 py-2 rounded bg-white/[0.025] border border-white/[0.05] hover:border-white/10 transition-colors">
                  {/* Avatar with frame + online dot */}
                  <button
                    type="button"
                    onClick={() => onViewProfile?.(f)}
                    disabled={!onViewProfile}
                    className="relative shrink-0 disabled:cursor-default"
                  >
                    <AvatarWithFrame
                      avatar={f.avatar_url || '🤖'}
                      frameId={f.equipped_frame ?? null}
                      sizeClass="w-8 h-8"
                      textClass="text-base"
                      roundedClass="rounded-full"
                      ringInsetClass="-inset-0.5"
                    />
                    <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface-0 ${f.is_online ? 'bg-accent' : 'bg-gray-600'}`} />
                  </button>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-caption font-semibold text-white truncate">{f.username ?? 'Unknown'}</span>
                      {f.guild_tag && (
                        <span className="text-micro px-1 py-[1px] rounded font-bold border border-amber-500/40 bg-amber-500/10 text-amber-400 shrink-0">[{f.guild_tag}]</span>
                      )}
                      <span className="text-micro text-accent font-mono shrink-0">{skillDisplay}</span>
                    </div>
                    <p className="text-micro text-gray-500 font-mono">{f.is_online ? 'Online' : 'Offline'}</p>
                  </div>

                  {alreadyInvited ? (
                    <span className="text-micro font-mono text-gray-500 shrink-0">Invited</span>
                  ) : (
                    <button
                      type="button"
                      disabled={inviting === f.id}
                      onClick={() => handleInvite(f.id)}
                      className="text-micro font-mono px-2.5 py-1 rounded border border-accent/30 text-accent bg-accent/8 hover:bg-accent/15 transition-colors disabled:opacity-40 shrink-0"
                    >
                      {inviting === f.id ? '...' : 'Invite'}
                    </button>
                  )}
                </div>
              )
            })
          }
        </div>
      )}

      <PartyMemberCtxMenu
        target={ctxTarget}
        onClose={() => { setCtxTarget(null); setCtxMessageUserId(null) }}
        onMessage={ctxMessageUserId && friendIds.has(ctxMessageUserId) && onMessageFriend
          ? () => onMessageFriend(ctxMessageUserId)
          : undefined}
      />
    </div>
  )
}
