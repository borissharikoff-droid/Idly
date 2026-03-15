import { useEffect, useState } from 'react'
import { MessageCircle } from '../../lib/icons'
import type { FriendProfile } from '../../hooks/useFriends'
import { getSkillByName, MAX_TOTAL_SKILL_LEVEL } from '../../lib/skills'
import { playClickSound } from '../../lib/sounds'
import { parseFriendPresence, formatSessionDurationCompact } from '../../lib/friendPresence'
import { AvatarWithFrame } from '../shared/AvatarWithFrame'

interface FriendListProps {
  friends: FriendProfile[]
  onSelectFriend: (profile: FriendProfile) => void
  /** Open chat with this friend (message icon) */
  onMessageFriend?: (profile: FriendProfile) => void
  /** Unread message count per friend id (from that friend to me) */
  unreadByFriendId?: Record<string, number>
}

export function FriendList({ friends, onSelectFriend, onMessageFriend, unreadByFriendId = {} }: FriendListProps) {
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const hasLiveSessions = friends.some((f) => f.is_online && Boolean(parseFriendPresence(f.current_activity).sessionStartMs))
    if (!hasLiveSessions) return
    const t = setInterval(() => setNowMs(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [friends])

  if (friends.length === 0) {
    return (
      <div className="rounded-xl bg-discord-card/80 border border-white/10 p-6 text-center">
        <span className="text-3xl block mb-3">👥</span>
        <p className="text-white font-medium text-sm mb-1">No squad yet</p>
        <p className="text-gray-500 text-xs mb-3">Add your first friend by username to compete and flex stats.</p>
      </div>
    )
  }

  // Sort: online first, then by total skill level desc
  const sorted = [...friends].sort((a, b) => {
    if (a.is_online !== b.is_online) return a.is_online ? -1 : 1
    return (b.total_skill_level ?? 0) - (a.total_skill_level ?? 0)
  })

  const formatLastSeen = (iso: string | null | undefined): string => {
    if (!iso) return 'Last seen recently'
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return 'Last seen recently'
    const now = new Date()
    const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
    if (sameDay) {
      return `Last seen: ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`
    }
    return `Last seen: ${d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}`
  }

  return (
    <div className="space-y-2">
      {sorted.map((f, i) => {
        const { activityLabel, appName, sessionStartMs } = parseFriendPresence(f.current_activity ?? null)
        const isLeveling = f.is_online && activityLabel.startsWith('Leveling ')
        const levelingSkill = isLeveling ? activityLabel.replace('Leveling ', '') : null
        const unread = unreadByFriendId[f.id] ?? 0
        const liveDuration = f.is_online && sessionStartMs ? formatSessionDurationCompact(sessionStartMs, nowMs) : null
        const hasSyncedSkills = f.skills_sync_status === 'synced'
        const totalSkillDisplay = hasSyncedSkills ? `${f.total_skill_level ?? 0}/${MAX_TOTAL_SKILL_LEVEL}` : '--/--'

        return (
          <div
            key={f.id}
            className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
              f.is_online
                ? 'bg-discord-card/90 border-white/10 hover:border-white/20 hover:-translate-y-[1px]'
                : 'bg-discord-card/50 border-white/5 opacity-70 hover:opacity-90 hover:-translate-y-[1px]'
            }`}
          >
            <button
              type="button"
              className="flex items-center gap-3 flex-1 min-w-0 text-left"
              onClick={() => { playClickSound(); onSelectFriend(f) }}
            >
            {/* Avatar with frame + online indicator */}
            <div className="relative shrink-0 overflow-visible">
              <AvatarWithFrame
                avatar={f.avatar_url || '🤖'}
                frameId={f.equipped_frame}
                sizeClass="w-10 h-10"
                textClass="text-lg"
                roundedClass="rounded-full"
                ringInsetClass="-inset-0.5"
                ringOpacity={0.95}
              />
              {/* Online indicator */}
              <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-discord-card ${
                f.is_online ? 'bg-cyber-neon' : 'bg-gray-600'
              }`} />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-sm font-semibold text-white truncate">{f.username || 'Anonymous'}</span>
                <span className="text-[10px] text-cyber-neon font-mono shrink-0" title={hasSyncedSkills ? 'Total skill level' : 'Skill sync pending'}>
                  {totalSkillDisplay}
                </span>
                {f.streak_count > 0 && (
                  <span className="text-[10px] text-orange-400 font-mono shrink-0" title="Streak">🔥{f.streak_count}d</span>
                )}
              </div>

              {/* Status line */}
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  {f.is_online ? (
                    isLeveling ? (() => {
                      const skill = getSkillByName(levelingSkill ?? '')
                      return (
                        <span className="text-[11px] text-gray-400 font-medium flex items-center gap-1.5">
                          {skill?.icon && <span className="text-sm">{skill.icon}</span>}
                          Leveling {levelingSkill}{liveDuration ? ` • ${liveDuration}` : ''}
                        </span>
                      )
                    })() : activityLabel ? (
                      <span className="text-[11px] text-blue-400 truncate">{activityLabel}</span>
                    ) : (
                      <span className="text-[11px] text-gray-400">Online</span>
                    )
                  ) : (
                    <span className="text-[11px] text-gray-600">{formatLastSeen(f.last_seen_at)}</span>
                  )}
                </div>
                {f.is_online && appName && (
                  <span className="text-[10px] text-gray-500 truncate">
                    Playing: {appName}{liveDuration ? ` • session ${liveDuration}` : ''}
                  </span>
                )}
              </div>

            </div>
            </button>

            {/* Message on right */}
            {onMessageFriend && (
              <div className="shrink-0">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onMessageFriend(f) }}
                  className="relative p-1.5 rounded-lg text-gray-400 hover:text-cyber-neon hover:bg-white/5 transition-colors"
                  title="Message"
                >
                  <MessageCircle className="w-[18px] h-[18px]" />
                  {unread > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-1 flex items-center justify-center rounded-full bg-discord-red text-[10px] font-bold text-white">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
