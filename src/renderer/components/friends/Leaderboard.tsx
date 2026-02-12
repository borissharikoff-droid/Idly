import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { FRAMES, BADGES } from '../../lib/cosmetics'
import { getPersonaById } from '../../lib/persona'
import { computeTotalSkillLevelFromLevels, normalizeSkillId, skillLevelFromXP } from '../../lib/skills'
import { LeaderboardSkeleton } from './LeaderboardSkeleton'

interface LeaderboardRow {
  id: string
  username: string | null
  avatar_url: string | null
  total_seconds: number
  total_skill_level: number
  streak_count: number
  equipped_badges?: string[]
  equipped_frame?: string | null
  persona_id?: string | null
}

const MEDALS = ['🥇', '🥈', '🥉']

export function Leaderboard() {
  const { user } = useAuthStore()
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase || !user) {
      setLoading(false)
      return
    }
    ;(async () => {
      try {
        const { data: fs } = await supabase
          .from('friendships')
          .select('user_id, friend_id')
          .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
          .eq('status', 'accepted')
        const ids = (fs || []).map((f) => (f.user_id === user.id ? f.friend_id : f.user_id))
        ids.push(user.id)

        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('*')
          .in('id', ids)

        if (profilesError) {
          console.warn('Leaderboard profiles error:', profilesError.message)
        }

        // Fetch session totals and user_skills for total skill level
        const byUser: Record<string, number> = {}
        try {
          const { data: sums } = await supabase
            .from('session_summaries')
            .select('user_id, duration_seconds')
            .in('user_id', ids)
          ;(sums || []).forEach((s) => {
            byUser[s.user_id] = (byUser[s.user_id] || 0) + s.duration_seconds
          })
        } catch {
          // session_summaries table may not exist yet
        }

        const skillsByUser = new Map<string, Map<string, { skill_id: string; level: number }>>()
        try {
          const { data: skillsRows } = await supabase.from('user_skills').select('user_id, skill_id, level, total_xp').in('user_id', ids)
          for (const row of skillsRows || []) {
            const r = row as { user_id: string; skill_id: string; level: number | null; total_xp?: number | null }
            const userSkillMap = skillsByUser.get(r.user_id) || new Map<string, { skill_id: string; level: number }>()
            const skill_id = normalizeSkillId(r.skill_id)
            const level = Math.max(r.level ?? 0, skillLevelFromXP(r.total_xp ?? 0))
            const prev = userSkillMap.get(skill_id)
            userSkillMap.set(skill_id, { skill_id, level: Math.max(prev?.level ?? 0, level) })
            skillsByUser.set(r.user_id, userSkillMap)
          }
        } catch {
          // user_skills may not exist
        }

        const list: LeaderboardRow[] = (profiles || []).map((p) => {
          const allSkills = Array.from((skillsByUser.get(p.id) || new Map()).values())
          const total_skill_level = allSkills.length > 0
            ? computeTotalSkillLevelFromLevels(allSkills)
            : (p.level ?? 0)
          return {
            id: p.id,
            username: p.username,
            avatar_url: p.avatar_url,
            total_seconds: byUser[p.id] || 0,
            total_skill_level,
            streak_count: p.streak_count || 0,
            equipped_badges: p.equipped_badges || [],
            equipped_frame: p.equipped_frame || null,
            persona_id: p.persona_id ?? null,
          }
        })
        list.sort((a, b) => b.total_skill_level - a.total_skill_level)
        setRows(list)
      } catch (err) {
        console.warn('Leaderboard fetch error:', err)
      }
      setLoading(false)
    })()
  }, [user])

  const formatDuration = (s: number) => {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }

  if (!supabase || !user) return null
  if (loading) return <LeaderboardSkeleton />

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl bg-discord-card/80 border border-white/10 p-4"
    >
      <p className="text-[10px] uppercase tracking-wider text-gray-500 font-mono mb-3">Leaderboard</p>
      <div className="space-y-1.5">
        {rows.map((r, i) => {
          const isMe = r.id === user.id
          const frame = FRAMES.find(fr => fr.id === r.equipped_frame)
          const badges = (r.equipped_badges || [])
            .map(bId => BADGES.find(b => b.id === bId))
            .filter(Boolean)
          const persona = getPersonaById(r.persona_id ?? null)

          return (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`flex items-center gap-2.5 py-2 px-3 rounded-xl transition-colors ${
                isMe ? 'bg-cyber-neon/5 border border-cyber-neon/20' : 'hover:bg-white/[0.02]'
              }`}
            >
              {/* Rank */}
              <span className="text-sm w-6 shrink-0 text-center">
                {i < 3 ? MEDALS[i] : <span className="text-gray-600 font-mono text-xs">#{i + 1}</span>}
              </span>

              {/* Avatar with frame */}
              <div className="relative shrink-0">
                {frame && (
                  <div
                    className="absolute -inset-0.5 rounded-full"
                    style={{ background: frame.gradient, opacity: 0.6 }}
                  />
                )}
                <div
                  className={`relative w-8 h-8 rounded-full flex items-center justify-center text-sm bg-discord-darker ${
                    frame ? 'border-[1.5px]' : 'border border-white/10'
                  }`}
                  style={frame ? { borderColor: frame.color } : undefined}
                >
                  {r.avatar_url || '🤖'}
                </div>
              </div>

              {/* Name + badges */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs font-semibold truncate ${isMe ? 'text-cyber-neon' : 'text-white'}`}>
                    {r.username || 'Anonymous'}
                    {isMe && <span className="text-gray-500 ml-1">(you)</span>}
                  </span>
                  <span className="text-[9px] text-gray-500 font-mono shrink-0" title="Total skill level">{r.total_skill_level}</span>
                  {persona && (
                    <span className="text-[9px] shrink-0" title={persona.label}>{persona.emoji}</span>
                  )}
                  {badges.slice(0, 2).map(badge => badge && (
                    <span
                      key={badge.id}
                      className="text-[8px] shrink-0"
                      title={badge.name}
                    >
                      {badge.icon}
                    </span>
                  ))}
                </div>
                {r.streak_count > 0 && (
                  <span className="text-[9px] text-orange-400/70 font-mono">🔥 {r.streak_count}d streak</span>
                )}
              </div>

              {/* Total skill level + grind time */}
              <div className="shrink-0 text-right">
                <p className="text-xs text-cyber-neon font-mono font-bold">{r.total_skill_level}</p>
                <p className="text-[9px] text-gray-600 font-mono">{formatDuration(r.total_seconds)}</p>
              </div>
            </motion.div>
          )
        })}
        {rows.length === 0 && (
          <div className="py-4 text-center">
            <span className="text-2xl block mb-2">🏆</span>
            <p className="text-gray-500 text-sm">No data yet.</p>
            <p className="text-gray-600 text-xs mt-1">Add friends and start grinding to populate the leaderboard.</p>
          </div>
        )}
      </div>
    </motion.div>
  )
}
