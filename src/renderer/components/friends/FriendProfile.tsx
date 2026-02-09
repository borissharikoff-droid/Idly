import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import type { FriendProfile as FriendProfileType } from '../../hooks/useFriends'
import { FRAMES, BADGES } from '../../lib/cosmetics'
import { getSkillById, getSkillByName } from '../../lib/skills'
import { ACHIEVEMENTS, xpProgressInLevel } from '../../lib/xp'

interface FriendProfileProps {
  profile: FriendProfileType
  onBack: () => void
  onCompare?: () => void
}

interface SessionSummary {
  id: string
  duration_seconds: number
  start_time: string
}

export function FriendProfile({ profile, onBack, onCompare }: FriendProfileProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [achievements, setAchievements] = useState<string[]>([])

  useEffect(() => {
    if (!supabase) return
    supabase
      .from('session_summaries')
      .select('id, duration_seconds, start_time')
      .eq('user_id', profile.id)
      .order('start_time', { ascending: false })
      .limit(10)
      .then(({ data }) => setSessions((data as SessionSummary[]) || []))
    supabase
      .from('user_achievements')
      .select('achievement_id')
      .eq('user_id', profile.id)
      .then(({ data }) => setAchievements((data || []).map((r) => (r as { achievement_id: string }).achievement_id)))
  }, [profile.id])

  const formatDuration = (s: number) => {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }

  const totalGrindSeconds = sessions.reduce((s, sess) => s + sess.duration_seconds, 0)
  const frame = FRAMES.find(fr => fr.id === profile.equipped_frame)
  const badges = (profile.equipped_badges || [])
    .map(bId => BADGES.find(b => b.id === bId))
    .filter(Boolean)
  const parseActivity = (raw: string | null) => {
    if (!raw) return { activityLabel: '', appName: null as string | null }
    const sep = ' · '
    const idx = raw.indexOf(sep)
    if (idx >= 0) return { activityLabel: raw.slice(0, idx).trim(), appName: raw.slice(idx + sep.length).trim() || null }
    return { activityLabel: raw, appName: null as string | null }
  }
  const { activityLabel, appName } = parseActivity(profile.current_activity ?? null)
  const isLeveling = profile.is_online && activityLabel.startsWith('Leveling ')
  const levelingSkill = isLeveling ? activityLabel.replace('Leveling ', '') : null
  const { current, needed } = xpProgressInLevel(profile.xp || 0)
  const xpPct = Math.min(100, (current / needed) * 100)

  // Unlocked achievements details
  const unlockedAchievements = ACHIEVEMENTS.filter(a => achievements.includes(a.id))

  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-3"
    >
      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors text-sm">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          <span className="font-mono text-xs">Back</span>
        </button>
        {onCompare && (
          <button
            onClick={onCompare}
            className="text-xs px-3 py-1 rounded-full border border-cyber-neon/30 text-cyber-neon bg-cyber-neon/10 hover:bg-cyber-neon/20 transition-colors font-medium"
          >
            ⚔️ Compare
          </button>
        )}
      </div>

      {/* Profile Card */}
      <div className="rounded-2xl bg-gradient-to-br from-discord-card/90 to-discord-card/60 border border-white/10 p-5 relative overflow-hidden">
        {/* Subtle background pattern */}
        <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: 'repeating-linear-gradient(0deg, white 0px, transparent 1px, transparent 20px), repeating-linear-gradient(90deg, white 0px, transparent 1px, transparent 20px)' }} />

        <div className="relative flex items-center gap-4">
          {/* Avatar with frame */}
          <div className="relative shrink-0">
            {frame && (
              <div
                className="absolute -inset-2 rounded-2xl"
                style={{ background: frame.gradient, opacity: 0.7 }}
              />
            )}
            <div
              className={`relative w-16 h-16 rounded-xl flex items-center justify-center text-3xl bg-discord-darker ${
                frame ? 'border-2' : 'border border-white/10'
              }`}
              style={frame ? { borderColor: frame.color } : undefined}
            >
              {profile.avatar_url || '🤖'}
            </div>
            {/* Online indicator */}
            <span className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-discord-card ${
              profile.is_online ? 'bg-cyber-neon' : 'bg-gray-600'
            }`} />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-white font-bold text-base truncate">{profile.username || 'Anonymous'}</span>
              <span className="text-cyber-neon font-mono text-xs">Lv.{profile.level || 1}</span>
            </div>

            {/* Badges row */}
            {badges.length > 0 && (
              <div className="flex items-center gap-1 mb-1.5">
                {badges.map(badge => badge && (
                  <span
                    key={badge.id}
                    className="text-[9px] px-1.5 py-0.5 rounded-md border font-medium"
                    style={{ borderColor: `${badge.color}40`, backgroundColor: `${badge.color}15`, color: badge.color }}
                  >
                    {badge.icon} {badge.label}
                  </span>
                ))}
              </div>
            )}

            {/* Status */}
            <div className="flex flex-col gap-0.5 mb-1.5">
              <div className="flex items-center gap-1.5">
                {profile.is_online ? (
                  isLeveling ? (() => {
                    const skill = getSkillByName(levelingSkill ?? '')
                    return (
                      <span className="text-[11px] text-cyber-neon font-medium flex items-center gap-1.5">
                        {skill?.icon && <span className="text-sm">{skill.icon}</span>}
                        Leveling {levelingSkill}
                      </span>
                    )
                  })() : activityLabel ? (
                    <span className="text-[11px] text-blue-400">{activityLabel}</span>
                  ) : (
                    <span className="text-[11px] text-cyber-neon">Online</span>
                  )
                ) : (
                  <span className="text-[11px] text-gray-600">Offline</span>
                )}
              </div>
              {profile.is_online && appName && (
                <span className="text-[10px] text-gray-500">в {appName}</span>
              )}
            </div>

            {/* XP bar */}
            <div>
              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${xpPct}%` }}
                  transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                  className="h-full rounded-full bg-gradient-to-r from-cyber-neon to-discord-accent"
                />
              </div>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-[9px] text-gray-600 font-mono">{current}/{needed} XP</span>
                <span className="text-[9px] text-gray-600 font-mono">{profile.xp || 0} total</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-discord-card/80 border border-white/5 p-2.5 text-center">
          <p className="text-[10px] text-gray-500 font-mono uppercase">Level</p>
          <p className="text-lg font-mono font-bold text-cyber-neon">{profile.level || 1}</p>
        </div>
        <div className="rounded-xl bg-discord-card/80 border border-white/5 p-2.5 text-center">
          <p className="text-[10px] text-gray-500 font-mono uppercase">Streak</p>
          <p className="text-lg font-mono font-bold text-orange-400">
            {profile.streak_count > 0 ? `🔥${profile.streak_count}` : '—'}
          </p>
        </div>
        <div className="rounded-xl bg-discord-card/80 border border-white/5 p-2.5 text-center">
          <p className="text-[10px] text-gray-500 font-mono uppercase">Grind Time</p>
          <p className="text-lg font-mono font-bold text-white">{formatDuration(totalGrindSeconds)}</p>
        </div>
      </div>

      {/* Skills */}
      {profile.top_skills && profile.top_skills.length > 0 && (
        <div className="rounded-xl bg-discord-card/80 border border-white/10 p-4 space-y-2.5">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-mono">Skills</p>
          {profile.top_skills.map((s) => {
            const skill = getSkillById(s.skill_id)
            if (!skill) return null
            const isActive = levelingSkill === skill.name
            return (
              <div
                key={s.skill_id}
                className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
                  isActive ? 'bg-cyber-neon/5 border border-cyber-neon/20' : ''
                }`}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0"
                  style={{ backgroundColor: `${skill.color}15`, border: `1px solid ${skill.color}30` }}
                >
                  {skill.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[12px] font-semibold text-white">{skill.name}</span>
                    {isActive && (
                      <span
                        className="text-[8px] font-mono font-bold px-1 py-0.5 rounded uppercase"
                        style={{ backgroundColor: `${skill.color}20`, color: skill.color }}
                      >
                        active
                      </span>
                    )}
                  </div>
                  <div className="h-1 rounded-full bg-white/[0.04] overflow-hidden">
                    <div className="h-full rounded-full" style={{ backgroundColor: skill.color, width: `${Math.min(100, (s.level / 99) * 100)}%` }} />
                  </div>
                </div>
                <div
                  className="w-9 h-9 rounded-lg flex flex-col items-center justify-center shrink-0"
                  style={{ backgroundColor: `${skill.color}10`, border: `1px solid ${skill.color}20` }}
                >
                  <span className="text-[8px] text-gray-500 font-mono leading-none">LV</span>
                  <span className="text-sm font-mono font-bold leading-tight" style={{ color: skill.color }}>{s.level}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Achievements */}
      <div className="rounded-xl bg-discord-card/80 border border-white/10 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-mono">Achievements</p>
          <span className="text-[10px] text-gray-600 font-mono">{achievements.length}/{ACHIEVEMENTS.length}</span>
        </div>
        {unlockedAchievements.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {unlockedAchievements.map(a => (
              <span
                key={a.id}
                className="text-sm px-2 py-1 rounded-lg bg-cyber-neon/10 border border-cyber-neon/20"
                title={`${a.name}: ${a.description}`}
              >
                {a.icon}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-gray-600">No achievements yet</p>
        )}
      </div>

      {/* Frame showcase */}
      {frame && (
        <div className="rounded-xl bg-discord-card/80 border border-white/10 p-4">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-mono mb-2">Equipped Frame</p>
          <div className="flex items-center gap-3">
            <div className="relative w-12 h-12">
              <div
                className="absolute -inset-1 rounded-xl"
                style={{ background: frame.gradient, opacity: 0.8 }}
              />
              <div
                className="relative w-12 h-12 rounded-lg bg-discord-darker flex items-center justify-center text-xl border-2"
                style={{ borderColor: frame.color }}
              >
                {profile.avatar_url || '🤖'}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-white">{frame.name}</p>
              <p className="text-[10px] font-mono" style={{ color: frame.color }}>{frame.rarity}</p>
            </div>
          </div>
        </div>
      )}

      {/* Recent Sessions */}
      <div className="rounded-xl bg-discord-card/80 border border-white/10 p-4 space-y-2">
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-mono">Recent Sessions</p>
        {sessions.length > 0 ? (
          <div className="space-y-1">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between py-1">
                <span className="text-[11px] text-gray-400">
                  {new Date(s.start_time).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="text-[11px] text-cyber-neon font-mono font-medium">{formatDuration(s.duration_seconds)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-gray-600">No sessions yet</p>
        )}
      </div>
    </motion.div>
  )
}
