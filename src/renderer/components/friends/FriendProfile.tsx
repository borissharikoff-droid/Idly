import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import type { FriendProfile as FriendProfileType } from '../../hooks/useFriends'
import { normalizeEquippedLoot, type LootSlot } from '../../lib/loot'
import { CharacterPanel } from '../character/CharacterPanel'
import { SKILLS, computeTotalSkillLevelFromLevels, MAX_TOTAL_SKILL_LEVEL, normalizeSkillId, skillLevelFromXP, skillXPProgress, computeGrindlyBonuses } from '../../lib/skills'
import { computeWarriorBonuses } from '../../lib/combat'
import { ACHIEVEMENTS, checkSkillAchievements } from '../../lib/xp'
import { MOTION } from '../../lib/motion'
import { formatSessionDurationCompact, parseFriendPresence } from '../../lib/friendPresence'
import { PageHeader } from '../shared/PageHeader'
import { fetchUserPublicProgressHistory, type SocialFeedEvent } from '../../services/socialFeed'
import { AvatarWithFrame } from '../shared/AvatarWithFrame'

interface FriendProfileProps {
  profile: FriendProfileType
  onBack: () => void
  onCompare?: () => void
  onMessage?: () => void
  onRemove?: () => void
  onRetrySync?: () => void
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

function mapAllSkillsToRows(profile: FriendProfileType): FriendSkillRow[] {
  const byId = new Map((profile.all_skills || []).map((s) => [s.skill_id, s]))
  return SKILLS.map((skill) => {
    const row = byId.get(skill.id)
    return {
      skill_id: skill.id,
      level: Math.max(0, row?.level ?? 0),
      total_xp: row?.total_xp ?? 0,
    }
  })
}

function formatDuration(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${sec}s`
}

export function FriendProfile({ profile, onBack, onMessage, onRetrySync }: FriendProfileProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [totalGrindSeconds, setTotalGrindSeconds] = useState(0)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [achievements, setAchievements] = useState<string[]>([])
  const [totalSessionsCount, setTotalSessionsCount] = useState(0)
  const [friendCount, setFriendCount] = useState(0)
  const [hasMarathonSession, setHasMarathonSession] = useState(false)
  const [publicProgressEvents, setPublicProgressEvents] = useState<SocialFeedEvent[]>([])
  const [allSkills, setAllSkills] = useState<FriendSkillRow[]>(() => {
    if (profile.all_skills && profile.all_skills.some((s) => s.level > 0)) {
      return mapAllSkillsToRows(profile)
    }
    return []
  })
  const [profileCosmetics, setProfileCosmetics] = useState<{
    equipped_loot?: Partial<Record<LootSlot, string>>
    equipped_badges?: string[]
    equipped_frame?: string | null
    status_title?: string | null
    permanent_stats?: { atk: number; hp: number; hpRegen: number; def: number }
  } | null>(null)

  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    setLoadingProfile(true)
    setProfileCosmetics(null)

    ;(async () => {
      try {
        const [
          sessionsRes,
          totalsRes,
          achievementsRes,
          sessionsCountRes,
          maxDurationRes,
          friendsRes,
          skillsRes,
          profileRes,
        ] = await Promise.all([
          supabase
            .from('session_summaries')
            .select('id, duration_seconds, start_time')
            .eq('user_id', profile.id)
            .order('start_time', { ascending: false })
            .limit(3),
          supabase.from('session_summaries').select('duration_seconds').eq('user_id', profile.id),
          supabase.from('user_achievements').select('achievement_id').eq('user_id', profile.id),
          supabase.from('session_summaries').select('id', { count: 'exact', head: true }).eq('user_id', profile.id),
          supabase
            .from('session_summaries')
            .select('duration_seconds')
            .eq('user_id', profile.id)
            .order('duration_seconds', { ascending: false })
            .limit(1),
          supabase
            .from('friendships')
            .select('id')
            .eq('status', 'accepted')
            .or(`user_id.eq.${profile.id},friend_id.eq.${profile.id}`),
          supabase.from('user_skills').select('skill_id, level, total_xp').eq('user_id', profile.id),
          supabase
            .from('profiles')
            .select('equipped_loot, equipped_badges, equipped_frame, status_title, permanent_stats')
            .eq('id', profile.id)
            .single(),
        ])

        if (cancelled) return

        setSessions((sessionsRes.data as SessionSummary[]) || [])
        const total = ((totalsRes.data as { duration_seconds: number }[]) || []).reduce((sum, row) => sum + (row.duration_seconds || 0), 0)
        setTotalGrindSeconds(total)
        setAchievements(((achievementsRes.data || []) as { achievement_id: string }[]).map((r) => r.achievement_id))
        setTotalSessionsCount(sessionsCountRes.count || 0)
        const maxDur = (maxDurationRes.data?.[0] as { duration_seconds?: number } | undefined)?.duration_seconds ?? 0
        setHasMarathonSession(maxDur >= 7200)
        setFriendCount((friendsRes.data || []).length)

        let rows = (skillsRes.data as FriendSkillRow[]) || []
        if (((skillsRes as { error?: { message?: string } }).error) && rows.length === 0) {
          // Backward-compatible fallback for deployments where total_xp is absent.
          const fallbackSkillsRes = await supabase
            .from('user_skills')
            .select('skill_id, level')
            .eq('user_id', profile.id)
          rows = ((fallbackSkillsRes.data as Array<{ skill_id: string; level: number }>) || []).map((r) => ({
            skill_id: r.skill_id,
            level: r.level ?? 0,
            total_xp: 0,
          }))
        }
        if (profileRes?.data && !cancelled) {
          const p = profileRes.data as Record<string, unknown>
          const ps = p.permanent_stats as { atk?: number; hp?: number; hpRegen?: number; def?: number } | null
          setProfileCosmetics({
            equipped_loot: normalizeEquippedLoot(p.equipped_loot),
            equipped_badges: Array.isArray(p.equipped_badges) ? (p.equipped_badges as string[]) : [],
            equipped_frame: (p.equipped_frame as string | null) ?? null,
            status_title: (p.status_title as string | null) ?? null,
            permanent_stats: ps ? { atk: ps.atk ?? 0, hp: ps.hp ?? 0, hpRegen: ps.hpRegen ?? 0, def: ps.def ?? 0 } : undefined,
          })
        }
        // Seed merged map from profile.all_skills (from useFriends batch query)
        // so any skills missing from the per-profile query still have a baseline.
        const merged = new Map<string, FriendSkillRow>()
        for (const base of (profile.all_skills || [])) {
          const skill_id = normalizeSkillId(base.skill_id)
          const total_xp = base.total_xp ?? 0
          const levelFromXp = skillLevelFromXP(total_xp)
          const level = Math.max(base.level ?? 0, levelFromXp)
          if (level > 0 || total_xp > 0) {
            merged.set(skill_id, { skill_id, level, total_xp })
          }
        }
        // Merge fresh per-profile user_skills rows (always take max)
        for (const raw of rows) {
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
        if (merged.size > 0) {
          setAllSkills(Array.from(merged.values()))
        }
      } catch {
        if (!cancelled) setAchievements([])
      } finally {
        if (!cancelled) setLoadingProfile(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [profile.id])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const rows = await fetchUserPublicProgressHistory(profile.id, 12)
      if (!cancelled) setPublicProgressEvents(rows)
    })()
    return () => {
      cancelled = true
    }
  }, [profile.id])

  const effectiveFrame = profileCosmetics?.equipped_frame ?? profile.equipped_frame
  const fromCosmetics = normalizeEquippedLoot(profileCosmetics?.equipped_loot)
  const fromProfile = normalizeEquippedLoot(profile.equipped_loot)
  const effectiveEquippedLoot = Object.keys(fromCosmetics).length > 0 ? fromCosmetics : fromProfile
  const equippedLootBySlot = effectiveEquippedLoot
  const { activityLabel, appName, sessionStartMs } = parseFriendPresence(profile.current_activity ?? null)
  const isLeveling = profile.is_online && activityLabel.startsWith('Leveling ')
  const levelingSkill = isLeveling ? activityLabel.replace('Leveling ', '') : null
  const liveDuration = profile.is_online && sessionStartMs ? formatSessionDurationCompact(sessionStartMs) : null
  const totalSkillLevel = allSkills.length > 0
    ? computeTotalSkillLevelFromLevels(allSkills.map(s => ({ skill_id: s.skill_id, level: s.level })))
    : (profile.total_skill_level ?? 0)
  const hasConfirmedSkillRows = allSkills.length > 0
  const hasProfileSkillRows = !!profile.all_skills && profile.all_skills.some((s) => s.level > 0)
  const isSkillBreakdownPending = !hasConfirmedSkillRows && !hasProfileSkillRows
  const mergedSkillRows: FriendSkillRow[] = hasConfirmedSkillRows
    ? allSkills
    : (hasProfileSkillRows
      ? mapAllSkillsToRows(profile)
      : SKILLS.map((skillDef) => ({ skill_id: skillDef.id, level: 0, total_xp: 0 })))
  const fallbackAchievementIds = useMemo(() => {
    const ids = new Set<string>()
    if (totalSessionsCount >= 1) ids.add('first_session')
    if (totalSessionsCount >= 10) ids.add('ten_sessions')
    if (totalSessionsCount >= 50) ids.add('fifty_sessions')
    if (hasMarathonSession) ids.add('marathon')
    if ((profile.streak_count || 0) >= 2) ids.add('streak_2')
    if ((profile.streak_count || 0) >= 7) ids.add('streak_7')
    if ((profile.streak_count || 0) >= 14) ids.add('streak_14')
    if ((profile.streak_count || 0) >= 30) ids.add('streak_30')
    if (friendCount >= 1) ids.add('first_friend')
    if (friendCount >= 5) ids.add('five_friends')
    if (friendCount >= 10) ids.add('social_butterfly')

    const skillLevels: Record<string, number> = {}
    for (const row of mergedSkillRows) skillLevels[row.skill_id] = row.level
    const skillAch = checkSkillAchievements(skillLevels, Array.from(ids))
    for (const a of skillAch) ids.add(a.id)
    return Array.from(ids)
  }, [totalSessionsCount, hasMarathonSession, profile.streak_count, friendCount, mergedSkillRows])

  const unlockedIdsForDisplay = achievements.length > 0 ? achievements : fallbackAchievementIds
  const unlockedAchievements = ACHIEVEMENTS.filter(a => unlockedIdsForDisplay.includes(a.id))
  if (loadingProfile) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: MOTION.duration.fast, ease: MOTION.easing }} className="space-y-3 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="h-4 w-14 rounded bg-white/10" />
          <div className="h-8 w-52 rounded-full bg-white/10" />
        </div>
        <div className="rounded-2xl border border-white/10 bg-discord-card/70 p-5">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl bg-white/10" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 rounded bg-white/10" />
              <div className="h-3 w-20 rounded bg-white/10" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="h-16 rounded-xl bg-white/10 border border-white/5" />
          <div className="h-16 rounded-xl bg-white/10 border border-white/5" />
          <div className="h-16 rounded-xl bg-white/10 border border-white/5" />
        </div>
        <div className="h-56 rounded-xl bg-white/10 border border-white/5" />
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={MOTION.subPage.initial}
      animate={MOTION.subPage.animate}
      exit={MOTION.subPage.exit}
      transition={{ duration: MOTION.duration.base, ease: MOTION.easing }}
      className="space-y-3 pb-2"
    >
      <PageHeader
        title={profile.username || 'Friend'}
        onBack={onBack}
      />
      {/* Profile Hero */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{
          borderColor: profile.is_online ? 'rgba(0,255,135,0.12)' : 'rgba(255,255,255,0.10)',
          background: profile.is_online
            ? 'linear-gradient(135deg, rgba(0,255,135,0.04) 0%, rgba(30,32,40,0.95) 40%)'
            : 'linear-gradient(135deg, rgba(30,32,40,0.95) 0%, rgba(25,27,35,0.95) 100%)',
        }}
      >
        <div className="p-3.5">
          <div className="flex items-center gap-3">
            <div className="relative shrink-0 overflow-visible">
              <AvatarWithFrame
                avatar={profile.avatar_url || '🤖'}
                frameId={effectiveFrame}
                sizeClass="w-14 h-14"
                textClass="text-2xl"
                roundedClass="rounded-xl"
                ringInsetClass="-inset-0.5"
              />
              <span className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-discord-card ${profile.is_online ? 'bg-cyber-neon' : 'bg-gray-600'}`} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-white font-bold text-[15px] truncate">{profile.username || 'Anonymous'}</h3>
                <span className="grindly-badge text-cyber-neon border-cyber-neon/30 bg-cyber-neon/10 text-[10px]" title="Total skill level">
                  {totalSkillLevel}/{MAX_TOTAL_SKILL_LEVEL}
                </span>
              </div>
              <p className="text-[11px] mt-1 text-gray-400">
                {profile.is_online
                  ? (isLeveling
                    ? `Leveling ${levelingSkill}${liveDuration ? ` · ${liveDuration}` : ''}`
                    : activityLabel || 'Online')
                  : 'Offline'}
                {profile.is_online && appName && ` · ${appName}`}
              </p>
            </div>
            {onMessage && (
              <motion.button
                type="button"
                onClick={onMessage}
                whileTap={MOTION.interactive.tap}
                className="shrink-0 self-start p-2 rounded-lg border border-cyber-neon/30 text-cyber-neon bg-cyber-neon/10 hover:bg-cyber-neon/20 transition-colors"
                title="Message"
                aria-label="Message"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </motion.button>
            )}
          </div>
        </div>
        {/* Stats strip integrated into hero */}
        <div className="grid grid-cols-4 border-t border-white/[0.06]">
          {[
            { value: String(totalSkillLevel), label: 'Level', color: '#00ff87' },
            { value: profile.streak_count > 0 ? `${profile.streak_count}d` : '—', label: 'Streak', color: '#fb923c' },
            { value: formatDuration(totalGrindSeconds), label: 'Grind', color: '#e2e8f0' },
            { value: String(totalSessionsCount), label: 'Sessions', color: '#94a3b8' },
          ].map(({ value, label, color }, i) => (
            <div key={label} className={`text-center py-2.5 ${i > 0 ? 'border-l border-white/[0.06]' : ''}`}>
              <p className="text-[13px] font-mono font-bold leading-none" style={{ color }}>{value}</p>
              <p className="text-[8px] font-mono text-gray-500 uppercase tracking-wider mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Gear */}
      <div className="rounded-xl border border-white/[0.09] bg-discord-card/80 p-3">
        {(() => {
          // Compute warrior + grindly bonuses from friend's skill data
          const skillMap = new Map(allSkills.map((s) => [s.skill_id, s]))
          const warriorLevel = skillMap.get('warrior')?.level ?? 0
          const grindlyLevel = skillMap.get('grindly')?.level ?? 0
          const wb = computeWarriorBonuses(warriorLevel)
          const gb = computeGrindlyBonuses(grindlyLevel)
          const combinedBonuses = {
            atk: wb.atk + gb.atk,
            hp: wb.hp + gb.hp,
            hpRegen: wb.hpRegen + gb.hpRegen,
            def: wb.def + gb.def,
          }
          return (
            <CharacterPanel
              equippedBySlot={equippedLootBySlot as Partial<Record<LootSlot, string>>}
              permanentStats={profileCosmetics?.permanent_stats}
              warriorBonuses={combinedBonuses}
            />
          )
        })()}
      </div>

      {/* Skills — compact bars */}
      <div className="rounded-xl bg-discord-card/80 border border-white/10 p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 font-mono font-semibold">Skills</p>
          <div className="flex items-center gap-2">
            {!hasConfirmedSkillRows && !hasProfileSkillRows && (
              <span className="text-[10px] text-amber-400/90 font-mono">Sync pending</span>
            )}
            {!hasConfirmedSkillRows && onRetrySync && (
              <button type="button" onClick={onRetrySync} className="text-[10px] px-2 py-0.5 rounded-md border border-white/15 text-gray-300 hover:text-white hover:bg-white/5 transition-colors">Retry</button>
            )}
          </div>
        </div>
        <div className="space-y-[3px]">
          {(() => {
            const skillMap = new Map(mergedSkillRows.map((s) => [s.skill_id, s]))
            return SKILLS.map((skillDef) => {
              const data = skillMap.get(skillDef.id)
              const level = Math.max(0, data?.level ?? 0)
              const totalXp = data?.total_xp ?? 0
              const hasRealXp = hasConfirmedSkillRows && totalXp > 0
              const unknownSkill = isSkillBreakdownPending
              const xpProg = hasRealXp ? skillXPProgress(totalXp) : null
              const pct = unknownSkill ? 0 : xpProg && xpProg.needed > 0
                ? Math.min(100, (xpProg.current / xpProg.needed) * 100)
                : (hasConfirmedSkillRows ? Math.min(100, (level / 99) * 100) : 0)
              const xpTitle = hasRealXp
                ? `${skillDef.name}: ${formatXp(totalXp)} XP`
                : unknownSkill
                  ? `${skillDef.name}: pending sync`
                  : `${skillDef.name}: LVL ${level}`
              const isActive = levelingSkill === skillDef.name
              return (
                <div key={skillDef.id} title={xpTitle} className={`flex items-center gap-2 px-2 py-[5px] rounded-lg transition-colors ${isActive ? 'bg-cyber-neon/[0.04]' : ''}`}>
                  <span className="text-[13px] leading-none shrink-0 w-5 text-center">{skillDef.icon}</span>
                  <span className={`text-[11px] w-[70px] shrink-0 truncate ${isActive ? 'text-white font-semibold' : 'text-gray-400'}`}>{skillDef.name}</span>
                  <div className="flex-1 h-[10px] rounded bg-black/25 overflow-hidden relative">
                    <div
                      className="absolute inset-y-0 left-0 rounded transition-all duration-500"
                      style={{
                        width: `${pct}%`,
                        background: `linear-gradient(90deg, ${skillDef.color}40, ${skillDef.color}88)`,
                        boxShadow: isActive ? `0 0 6px ${skillDef.color}44` : 'none',
                      }}
                    />
                  </div>
                  <span className="text-[11px] font-mono font-bold tabular-nums w-5 text-right shrink-0" style={{ color: unknownSkill ? '#4b5563' : skillDef.color }}>
                    {unknownSkill ? '--' : level}
                  </span>
                </div>
              )
            })
          })()}
        </div>
      </div>

      {/* Achievements */}
      <div className="rounded-xl bg-discord-card/80 border border-white/10 p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 font-mono font-semibold">Achievements</p>
          <span className="text-[10px] text-gray-500 font-mono">{unlockedIdsForDisplay.length}/{ACHIEVEMENTS.length}</span>
        </div>
        {/* Progress bar */}
        <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden mb-2.5">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(unlockedIdsForDisplay.length / ACHIEVEMENTS.length) * 100}%`, background: 'linear-gradient(90deg, #a78bfa, #00ff87)' }} />
        </div>
        {unlockedAchievements.length > 0 ? (
          <>
            {/* Last 3 featured */}
            <div className="space-y-1">
              {unlockedAchievements.slice(-3).reverse().map(a => (
                <div key={a.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-discord-darker/30">
                  <span className="text-base shrink-0">{a.icon}</span>
                  <div className="min-w-0 flex-1">
                    <span className="text-[11px] font-semibold text-white">{a.name}</span>
                    <span className="text-[10px] text-gray-500 ml-1.5">{a.description}</span>
                  </div>
                </div>
              ))}
            </div>
            {/* Rest as icons */}
            {unlockedAchievements.length > 3 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {unlockedAchievements.slice(0, -3).map(a => (
                  <span key={a.id} className="w-7 h-7 rounded-md bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-xs" title={`${a.name}: ${a.description}`}>
                    {a.icon}
                  </span>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-gray-600">No achievements yet</p>
        )}
      </div>

      {/* Activity Insights — sessions + progression feed */}
      {(sessions.length > 0 || publicProgressEvents.length > 0) && (
        <div className="rounded-xl bg-discord-card/80 border border-white/10 p-3 space-y-3">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 font-mono font-semibold">Activity</p>

          {/* Recent sessions with bars */}
          {sessions.length > 0 && (() => {
            const maxDur = Math.max(...sessions.map(s => s.duration_seconds), 1)
            return (
              <div className="space-y-1">
                {sessions.map((s) => {
                  const pct = Math.max(8, (s.duration_seconds / maxDur) * 100)
                  return (
                    <div key={s.id} className="flex items-center gap-2.5 py-0.5">
                      <span className="text-[10px] text-gray-500 font-mono w-[50px] shrink-0">
                        {new Date(s.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                      <div className="flex-1 h-2 rounded-sm bg-black/20 overflow-hidden">
                        <div className="h-full rounded-sm" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, rgba(0,255,135,0.3), rgba(0,255,135,0.08))' }} />
                      </div>
                      <span className="text-[11px] text-cyber-neon font-mono font-bold w-[44px] text-right shrink-0">{formatDuration(s.duration_seconds)}</span>
                    </div>
                  )
                })}
              </div>
            )
          })()}

          {/* Progression feed */}
          {publicProgressEvents.length > 0 && (
            <>
              {sessions.length > 0 && <div className="border-t border-white/[0.05]" />}
              <div className="space-y-1">
                {publicProgressEvents.slice(0, 6).map((event) => {
                  const icon = event.event_type === 'skill_level_up' ? '⬆'
                    : event.event_type === 'achievement_unlocked' ? '🏆'
                    : event.event_type === 'streak_milestone' ? '🔥'
                    : event.event_type === 'loot_drop' ? '✦'
                    : event.event_type === 'legendary_unlock' ? '⭐'
                    : event.event_type === 'session_milestone' ? '📊'
                    : '·'
                  const p = event.payload as Record<string, unknown>
                  const label = event.event_type === 'skill_level_up'
                    ? `${p.skill || 'Skill'} reached level ${p.level ?? '?'}`
                    : event.event_type === 'achievement_unlocked'
                    ? `Unlocked: ${p.name || p.achievement_id || 'Achievement'}`
                    : event.event_type === 'streak_milestone'
                    ? `${p.days ?? '?'} day streak`
                    : event.event_type === 'loot_drop' || event.event_type === 'legendary_unlock'
                    ? `Got ${p.item_name || p.name || 'item'}`
                    : event.event_type === 'session_milestone'
                    ? `${p.count ?? '?'} sessions completed`
                    : event.event_type.split('_').join(' ')
                  const ago = (() => {
                    const ms = Date.now() - new Date(event.created_at).getTime()
                    const mins = Math.floor(ms / 60000)
                    if (mins < 60) return `${mins}m`
                    const hrs = Math.floor(mins / 60)
                    if (hrs < 24) return `${hrs}h`
                    const days = Math.floor(hrs / 24)
                    return `${days}d`
                  })()
                  return (
                    <div key={event.id} className="flex items-center gap-2 py-1 px-1">
                      <span className="text-[11px] shrink-0 w-4 text-center">{icon}</span>
                      <span className="text-[11px] text-gray-300 flex-1 min-w-0 truncate">{label}</span>
                      <span className="text-[9px] text-gray-600 font-mono shrink-0">{ago}</span>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}
    </motion.div>
  )
}
