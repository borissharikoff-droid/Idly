import { motion } from 'framer-motion'
import type { FriendProfile } from '../../hooks/useFriends'
import { getSkillById, getSkillByName, MAX_TOTAL_SKILL_LEVEL } from '../../lib/skills'
import { FRAMES, BADGES } from '../../lib/cosmetics'
import { getPersonaById } from '../../lib/persona'
import { playClickSound } from '../../lib/sounds'

interface FriendListProps {
  friends: FriendProfile[]
  onSelectFriend: (profile: FriendProfile) => void
  /** Open chat with this friend (message icon) */
  onMessageFriend?: (profile: FriendProfile) => void
  /** Unread message count per friend id (from that friend to me) */
  unreadByFriendId?: Record<string, number>
}

export function FriendList({ friends, onSelectFriend, onMessageFriend, unreadByFriendId = {} }: FriendListProps) {
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

  const parseActivity = (raw: string | null): { activityLabel: string; appName: string | null } => {
    if (!raw) return { activityLabel: '', appName: null }
    const sep = ' · '
    const idx = raw.indexOf(sep)
    if (idx >= 0) {
      return { activityLabel: raw.slice(0, idx).trim(), appName: raw.slice(idx + sep.length).trim() || null }
    }
    return { activityLabel: raw, appName: null }
  }

  return (
    <div className="space-y-2">
      {sorted.map((f, i) => {
        const frame = FRAMES.find(fr => fr.id === f.equipped_frame)
        const badges = (f.equipped_badges || [])
          .map(bId => BADGES.find(b => b.id === bId))
          .filter(Boolean)
        const { activityLabel, appName } = parseActivity(f.current_activity ?? null)
        const isLeveling = f.is_online && activityLabel.startsWith('Leveling ')
        const levelingSkill = isLeveling ? activityLabel.replace('Leveling ', '') : null
        const persona = getPersonaById(f.persona_id ?? null)
        const unread = unreadByFriendId[f.id] ?? 0

        return (
          <motion.div
            key={f.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
            className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
              f.is_online
                ? 'bg-discord-card/90 border-white/10 hover:border-white/20'
                : 'bg-discord-card/50 border-white/5 opacity-70 hover:opacity-90'
            }`}
          >
            <button
              type="button"
              className="flex items-center gap-3 flex-1 min-w-0 text-left"
              onClick={() => { playClickSound(); onSelectFriend(f) }}
            >
            {/* Avatar with frame + online indicator */}
            <div className="relative shrink-0">
              {frame && (
                <div
                  className="absolute -inset-1 rounded-full"
                  style={{ background: frame.gradient, opacity: 0.7 }}
                />
              )}
              <div
                className={`relative w-10 h-10 rounded-full flex items-center justify-center text-lg bg-discord-darker ${
                  frame ? 'border-2' : 'border border-white/10'
                }`}
                style={frame ? { borderColor: frame.color } : undefined}
              >
                {f.avatar_url || '🤖'}
              </div>
              {/* Online indicator */}
              <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-discord-card ${
                f.is_online ? 'bg-cyber-neon' : 'bg-gray-600'
              }`} />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-sm font-semibold text-white truncate">{f.username || 'Anonymous'}</span>
                <span className="text-[10px] text-cyber-neon font-mono shrink-0" title="Total skill level">{(f.total_skill_level ?? 0)}/{MAX_TOTAL_SKILL_LEVEL}</span>
                {f.streak_count > 0 && (
                  <span className="text-[10px] text-orange-400 font-mono shrink-0" title="Streak">🔥{f.streak_count}d</span>
                )}
                {persona && (
                  <span className="text-[9px] px-1 py-0.5 rounded border border-white/10 bg-discord-darker/80 text-gray-400 shrink-0" title={persona.label}>
                    {persona.emoji}
                  </span>
                )}
                {/* Equipped badges */}
                {badges.map(badge => badge && (
                  <span
                    key={badge.id}
                    className="text-[9px] px-1 py-0.5 rounded border shrink-0"
                    style={{ borderColor: `${badge.color}30`, backgroundColor: `${badge.color}10`, color: badge.color }}
                    title={badge.name}
                  >
                    {badge.icon}
                  </span>
                ))}
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
                          Leveling {levelingSkill}
                        </span>
                      )
                    })() : activityLabel ? (
                      <span className="text-[11px] text-blue-400 truncate">{activityLabel}</span>
                    ) : (
                      <span className="text-[11px] text-gray-400">Online</span>
                    )
                  ) : (
                    <span className="text-[11px] text-gray-600">Offline</span>
                  )}
                </div>
                {f.is_online && appName && (
                  <span className="text-[10px] text-gray-500 truncate">in {appName}</span>
                )}
              </div>

              {/* Top skills */}
              {f.top_skills && f.top_skills.length > 0 && (
                <div className="flex gap-1 mt-1 flex-wrap">
                  {f.top_skills.map((s) => {
                    const skill = getSkillById(s.skill_id)
                    if (!skill) return null
                    return (
                      <span
                        key={s.skill_id}
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px]"
                        style={{ backgroundColor: `${skill.color}15`, color: skill.color, border: `1px solid ${skill.color}25` }}
                        title={`${skill.name} Lv.${s.level}`}
                      >
                        <span>{skill.icon}</span>
                        <span className="font-mono">{s.level}</span>
                      </span>
                    )
                  })}
                </div>
              )}
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
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  {unread > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-1 flex items-center justify-center rounded-full bg-discord-red text-[10px] font-bold text-white">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </button>
              </div>
            )}
          </motion.div>
        )
      })}
    </div>
  )
}
