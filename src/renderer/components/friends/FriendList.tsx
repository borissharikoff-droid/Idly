import { motion } from 'framer-motion'
import type { FriendProfile } from '../../hooks/useFriends'
import { getSkillById, MAX_TOTAL_SKILL_LEVEL } from '../../lib/skills'
import { FRAMES, BADGES } from '../../lib/cosmetics'

interface FriendListProps {
  friends: FriendProfile[]
  onSelectFriend: (profile: FriendProfile) => void
}

export function FriendList({ friends, onSelectFriend }: FriendListProps) {
  if (friends.length === 0) {
    return (
      <div className="rounded-xl bg-discord-card/80 border border-white/10 p-6 text-center text-gray-500">
        <span className="text-2xl block mb-2">👥</span>
        <p className="text-sm">No squad yet. Add someone by username to compete.</p>
      </div>
    )
  }

  // Sort: online first, then by level desc
  const sorted = [...friends].sort((a, b) => {
    if (a.is_online !== b.is_online) return a.is_online ? -1 : 1
    return (b.level || 1) - (a.level || 1)
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

        return (
          <motion.button
            key={f.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelectFriend(f)}
            className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
              f.is_online
                ? 'bg-discord-card/90 border-white/10 hover:border-white/20'
                : 'bg-discord-card/50 border-white/5 opacity-70 hover:opacity-90'
            }`}
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
                {/* Level */}
                <span className="text-[10px] text-cyber-neon font-mono shrink-0">Lv.{f.level || 1}</span>
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
                    isLeveling ? (
                      <span className="text-[11px] text-gray-400 font-medium">
                        Leveling {levelingSkill}
                      </span>
                    ) : activityLabel ? (
                      <span className="text-[11px] text-blue-400 truncate">{activityLabel}</span>
                    ) : (
                      <span className="text-[11px] text-gray-400">Online</span>
                    )
                  ) : (
                    <span className="text-[11px] text-gray-600">Offline</span>
                  )}
                </div>
                {f.is_online && appName && (
                  <span className="text-[10px] text-gray-500 truncate">в {appName}</span>
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

            {/* Total skill lvl + streak + XP on right */}
            <div className="shrink-0 text-right flex flex-col items-end gap-0.5">
              <div className="text-[10px] text-gray-400 font-mono">
                {(f.total_skill_level ?? 0)}/{MAX_TOTAL_SKILL_LEVEL}
              </div>
              {f.streak_count > 0 && (
                <div className="text-[10px] text-orange-400 font-mono">
                  🔥 {f.streak_count}d
                </div>
              )}
              <div className="text-[9px] text-gray-600 font-mono">
                {f.xp || 0} XP
              </div>
            </div>
          </motion.button>
        )
      })}
    </div>
  )
}
