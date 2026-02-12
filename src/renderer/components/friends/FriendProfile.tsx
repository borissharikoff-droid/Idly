import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import type { FriendProfile as FriendProfileType } from '../../hooks/useFriends'
import { FRAMES, BADGES } from '../../lib/cosmetics'
import { getSkillById, getSkillByName, SKILLS, computeTotalSkillLevelFromLevels, MAX_TOTAL_SKILL_LEVEL, normalizeSkillId, skillLevelFromXP, skillXPProgress } from '../../lib/skills'
import { getPersonaById } from '../../lib/persona'
import { ACHIEVEMENTS } from '../../lib/xp'

interface FriendProfileProps {
  profile: FriendProfileType
  onBack: () => void
  onCompare?: () => void
  onMessage?: () => void
  onRemove?: () => void
}

interface SessionSummary {
  id: string
  duration_seconds: number
  start_time: string
}

interface FriendSkillRow {
  skill_id: string
  level: number
  total_xp: number
}

function formatXp(xp: number): string {
  return Math.max(0, Math.floor(xp)).toLocaleString()
}

function estimateSkillLevels(total: number, activeSkillName: string | null): FriendSkillRow[] {
  if (total <= 0) return []
  const rows = new Map<string, FriendSkillRow>()
  const activeSkillId = activeSkillName ? getSkillByName(activeSkillName)?.id ?? null : null

  // First point goes to the currently active skill (if any).
  let remaining = total
  if (activeSkillId && remaining > 0) {
    rows.set(activeSkillId, { skill_id: activeSkillId, level: 1, total_xp: 0 })
    remaining--
  }

  // Then give baseline 1 per other skills while we still have points.
  for (const skill of SKILLS.filter((s) => s.id !== activeSkillId)) {
    if (remaining <= 0) break
    rows.set(skill.id, { skill_id: skill.id, level: 1, total_xp: 0 })
    remaining--
  }

  // Put remaining points into active skill (or researcher fallback).
  if (remaining > 0) {
    const targetId = activeSkillId ?? 'researcher'
    const current = rows.get(targetId) || { skill_id: targetId, level: 0, total_xp: 0 }
    rows.set(targetId, { ...current, level: current.level + remaining })
  }

  return Array.from(rows.values())
}

export function FriendProfile({ profile, onBack, onCompare, onMessage, onRemove }: FriendProfileProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [totalGrindSeconds, setTotalGrindSeconds] = useState(0)
  const [achievements, setAchievements] = useState<string[]>([])
  const [allSkills, setAllSkills] = useState<FriendSkillRow[]>([])
  const [confirmRemove, setConfirmRemove] = useState(false)

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
      .from('session_summaries')
      .select('duration_seconds')
      .eq('user_id', profile.id)
      .then(({ data }) => {
        const total = ((data as { duration_seconds: number }[]) || []).reduce((sum, row) => sum + (row.duration_seconds || 0), 0)
        setTotalGrindSeconds(total)
      })
    supabase
      .from('user_achievements')
      .select('achievement_id')
      .eq('user_id', profile.id)
      .then(({ data }) => setAchievements((data || []).map((r) => (r as { achievement_id: string }).achievement_id)))
    supabase
      .from('user_skills')
      .select('skill_id, level, total_xp')
      .eq('user_id', profile.id)
      .then(({ data }) => {
        const merged = new Map<string, FriendSkillRow>()
        for (const raw of ((data as FriendSkillRow[]) || [])) {
          const skill_id = normalizeSkillId(raw.skill_id)
          const total_xp = raw.total_xp ?? 0
          const levelFromXp = skillLevelFromXP(total_xp)
          const level = Math.max(raw.level ?? 0, levelFromXp)
          const prev = merged.get(skill_id)
          if (!prev) {
            merged.set(skill_id, { skill_id, level, total_xp })
          } else {
            merged.set(skill_id, {
              skill_id,
              level: Math.max(prev.level, level),
              total_xp: Math.max(prev.total_xp ?? 0, total_xp),
            })
          }
        }
        setAllSkills(Array.from(merged.values()))
      })
  }, [profile.id])

  const formatDuration = (s: number) => {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = Math.floor(s % 60)
    if (h > 0) return `${h}h ${m}m`
    if (m > 0) return `${m}m`
    return `${sec}s`
  }
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
  const totalSkillLevel = allSkills.length > 0
    ? computeTotalSkillLevelFromLevels(allSkills.map(s => ({ skill_id: s.skill_id, level: s.level })))
    : (profile.total_skill_level ?? 0)
  const mergedSkillRows: FriendSkillRow[] = allSkills.length > 0
    ? allSkills
    : (profile.top_skills && profile.top_skills.length > 0
      ? profile.top_skills.map((s) => ({ skill_id: s.skill_id, level: s.level, total_xp: 0 }))
      : estimateSkillLevels(totalSkillLevel, levelingSkill))
  const persona = getPersonaById(profile.persona_id ?? null)

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
        <div className="flex items-center gap-2">
          {onMessage && (
            <button
              onClick={onMessage}
              className="text-xs px-3 py-1 rounded-full border border-cyber-neon/30 text-cyber-neon bg-cyber-neon/10 hover:bg-cyber-neon/20 transition-colors font-medium"
            >
              💬 Message
            </button>
          )}
          {onCompare && (
            <button
              onClick={onCompare}
              className="text-xs px-3 py-1 rounded-full border border-cyber-neon/30 text-cyber-neon bg-cyber-neon/10 hover:bg-cyber-neon/20 transition-colors font-medium"
            >
              ⚔️ Compare
            </button>
          )}
          {onRemove && !confirmRemove && (
            <button
              onClick={() => setConfirmRemove(true)}
              className="text-xs px-2 py-1 rounded-full border border-red-500/30 text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors"
              title="Remove friend"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Remove confirmation */}
      <AnimatePresence>
        {confirmRemove && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -6, scale: 0.98, marginBottom: -16 }}
            animate={{ opacity: 1, height: 'auto', y: 0, scale: 1, marginBottom: 0 }}
            exit={{ opacity: 0, height: 0, y: -6, scale: 0.98, marginBottom: -16 }}
            transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 flex items-center justify-between overflow-hidden"
          >
            <span className="text-xs text-red-400">Remove {profile.username || 'this friend'}?</span>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmRemove(false)}
                className="text-[10px] px-3 py-1 rounded-lg bg-white/5 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { setConfirmRemove(false); onRemove?.() }}
                className="text-[10px] px-3 py-1 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors font-medium"
              >
                Remove
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
              <span className="text-cyber-neon font-mono text-xs" title="Total skill level">{totalSkillLevel}/{MAX_TOTAL_SKILL_LEVEL}</span>
              {persona && (
                <span className="text-xs px-1.5 py-0.5 rounded border border-white/10 bg-discord-darker/80 text-gray-400" title={persona.description}>
                  {persona.emoji} {persona.label}
                </span>
              )}
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
                <span className="text-[10px] text-gray-500">in {appName}</span>
              )}
            </div>

            </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-discord-card/80 border border-white/5 p-2.5 text-center">
          <p className="text-[10px] text-gray-500 font-mono uppercase">Skill lvl</p>
          <p className="text-lg font-mono font-bold text-cyber-neon">{totalSkillLevel}</p>
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

      {/* All Skills */}
      <div className="rounded-xl bg-discord-card/80 border border-white/10 p-4 space-y-2.5">
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-mono">Skills</p>
        {(() => {
          const skillMap = new Map(mergedSkillRows.map((s) => [s.skill_id, s]))
          return SKILLS.map((skillDef) => {
            const data = skillMap.get(skillDef.id)
            const level = Math.max(1, data?.level ?? 0)
            const totalXp = data?.total_xp ?? 0
            const hasRealXp = allSkills.length > 0 && totalXp > 0
            const xpProg = hasRealXp ? skillXPProgress(totalXp) : null
            const pct = xpProg && xpProg.needed > 0
              ? Math.min(100, (xpProg.current / xpProg.needed) * 100)
              : Math.min(100, (level / 99) * 100)
            const xpTitle = hasRealXp
              ? `${skillDef.name}: ${formatXp(totalXp)} XP`
              : `${skillDef.name}: XP sync pending`
            const isActive = levelingSkill === skillDef.name
            return (
              <div
                key={skillDef.id}
                className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
                  isActive ? 'bg-cyber-neon/5 border border-cyber-neon/20' : ''
                }`}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0"
                  style={{ backgroundColor: `${skillDef.color}15`, border: `1px solid ${skillDef.color}30` }}
                >
                  {skillDef.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[12px] font-semibold text-white">{skillDef.name}</span>
                    {isActive && (
                      <span
                        className="text-[8px] font-mono font-bold px-1 py-0.5 rounded uppercase"
                        style={{ backgroundColor: `${skillDef.color}20`, color: skillDef.color }}
                      >
                        active
                      </span>
                    )}
                  </div>
                  <div className="h-1 rounded-full bg-white/[0.04] overflow-hidden" title={xpTitle}>
                    <div className="h-full rounded-full" style={{ backgroundColor: skillDef.color, width: `${pct}%` }} />
                  </div>
                </div>
                <div
                  className="w-9 h-9 rounded-lg flex flex-col items-center justify-center shrink-0"
                  style={{ backgroundColor: `${skillDef.color}10`, border: `1px solid ${skillDef.color}20` }}
                >
                  <span className="text-[8px] text-gray-500 font-mono leading-none">LV</span>
                  <span className="text-[10px] font-mono font-bold leading-tight" style={{ color: skillDef.color }}>{level}/99</span>
                </div>
              </div>
            )
          })
        })()}
        {allSkills.length === 0 && (
          <p className="text-[11px] text-gray-500">
            Showing synced top skills only. Full skill breakdown updates after friend sync.
          </p>
        )}
      </div>

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
