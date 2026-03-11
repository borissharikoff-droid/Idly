import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { ensureInventoryHydrated, useInventoryStore } from '../../stores/inventoryStore'
import { FRAMES } from '../../lib/cosmetics'
import { computeTotalSkillLevelFromLevels, normalizeSkillId, skillLevelFromXP } from '../../lib/skills'
import { LeaderboardSkeleton } from './LeaderboardSkeleton'
import { AvatarWithFrame } from '../shared/AvatarWithFrame'
import { LOOT_ITEMS, getItemPower, normalizeEquippedLoot, type LootSlot } from '../../lib/loot'

interface LeaderboardRow {
  id: string
  username: string | null
  avatar_url: string | null
  total_seconds: number
  total_skill_level: number
  streak_count: number
  equipped_badges?: string[]
  equipped_frame?: string | null
  equipped_loot?: Partial<Record<LootSlot, string>>
  persona_id?: string | null
  skills_sync_status?: 'synced' | 'pending'
}

const MEDALS = ['🥇', '🥈', '🥉']

type SortKey = 'skill' | 'streak' | 'grind' | 'item_power'

const FRAME_RARITY_SCORE: Record<string, number> = {
  Rare: 150,
  Epic: 220,
  Legendary: 320,
}

const BADGE_SCORE = 30

function computeFlexScore(row: LeaderboardRow, equippedLootOverride?: Partial<Record<LootSlot, string>>): number {
  let score = 0
  const loot = equippedLootOverride ?? normalizeEquippedLoot(row.equipped_loot) ?? {}
  for (const itemId of Object.values(loot)) {
    if (!itemId) continue
    const item = LOOT_ITEMS.find((x) => x.id === itemId)
    if (item) score += getItemPower(item)
  }
  if (row.equipped_frame) {
    const frame = FRAMES.find((f) => f.id === row.equipped_frame)
    if (frame) score += FRAME_RARITY_SCORE[frame.rarity] ?? 0
  }
  score += (row.equipped_badges?.length ?? 0) * BADGE_SCORE
  return score
}

interface LeaderboardProps {
  onSelectUser?: (userId: string) => void
}

export function Leaderboard({ onSelectUser }: LeaderboardProps) {
  const { user } = useAuthStore()
  const equippedBySlot = useInventoryStore((s) => s.equippedBySlot)
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<SortKey>('skill')

  useEffect(() => {
    ensureInventoryHydrated()
  }, [])

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

        const skillsByUser = new Map<string, Map<string, { skill_id: string; level: number; prestige_count: number }>>()
        try {
          const { data: skillsRows } = await supabase.from('user_skills').select('user_id, skill_id, level, total_xp, prestige_count').in('user_id', ids)
          for (const row of skillsRows || []) {
            const r = row as { user_id: string; skill_id: string; level: number | null; total_xp?: number | null; prestige_count?: number | null }
            const userSkillMap = skillsByUser.get(r.user_id) || new Map<string, { skill_id: string; level: number; prestige_count: number }>()
            const skill_id = normalizeSkillId(r.skill_id)
            const level = Math.max(r.level ?? 0, skillLevelFromXP(r.total_xp ?? 0))
            const prestige_count = Math.max(0, r.prestige_count ?? 0)
            const prev = userSkillMap.get(skill_id)
            userSkillMap.set(skill_id, {
              skill_id,
              level: Math.max(prev?.level ?? 0, level),
              prestige_count: Math.max(prev?.prestige_count ?? 0, prestige_count),
            })
            skillsByUser.set(r.user_id, userSkillMap)
          }
        } catch {
          // user_skills may not exist
        }

        const list: LeaderboardRow[] = (profiles || []).map((p) => {
          const allSkills = Array.from((skillsByUser.get(p.id) || new Map()).values())
          const baseLevel = allSkills.length > 0
            ? computeTotalSkillLevelFromLevels(allSkills)
            : (p.level ?? 0)
          // Add prestige bonus: each prestige = +99 bonus levels for that skill
          const prestigeBonus = allSkills.reduce((sum, s) => sum + (s.prestige_count ?? 0) * 99, 0)
          const total_skill_level = baseLevel + prestigeBonus
          return {
            id: p.id,
            username: p.username,
            avatar_url: p.avatar_url,
            total_seconds: byUser[p.id] || 0,
            total_skill_level,
            streak_count: p.streak_count || 0,
            equipped_badges: p.equipped_badges || [],
            equipped_frame: p.equipped_frame || null,
            equipped_loot: normalizeEquippedLoot(p.equipped_loot),
            persona_id: p.persona_id ?? null,
            skills_sync_status: allSkills.length > 0 ? 'synced' : 'pending',
          }
        })
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

  /** For current user, use local equipped loot (source of truth); for others use profile data from Supabase */
  const getEffectiveEquippedLoot = useMemo(() => {
    return (row: LeaderboardRow) =>
      row.id === user?.id && Object.keys(equippedBySlot).length > 0
        ? (equippedBySlot as Partial<Record<LootSlot, string>>)
        : normalizeEquippedLoot(row.equipped_loot)
  }, [user?.id, equippedBySlot])

  const sortFns: Record<SortKey, (a: LeaderboardRow, b: LeaderboardRow) => number> = useMemo(() => ({
    skill: (a, b) => b.total_skill_level - a.total_skill_level,
    streak: (a, b) => b.streak_count - a.streak_count,
    grind: (a, b) => b.total_seconds - a.total_seconds,
    item_power: (a, b) => computeFlexScore(b, getEffectiveEquippedLoot(b)) - computeFlexScore(a, getEffectiveEquippedLoot(a)),
  }), [getEffectiveEquippedLoot])
  const sortedRows = useMemo(() => [...rows].sort(sortFns[sortBy]), [rows, sortBy, sortFns])

  if (!supabase || !user) return null
  if (loading) return <LeaderboardSkeleton />

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl bg-discord-card/80 border border-white/10 p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-mono">Leaderboard</p>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortKey)}
          title={sortBy === 'item_power' ? 'Gear Score: gear IP + frame rarity + badges' : undefined}
          className="text-[10px] font-mono bg-discord-darker/80 border border-white/10 rounded-md px-2 py-1 text-gray-300 focus:outline-none focus:ring-1 focus:ring-cyber-neon/50"
        >
          <option value="skill">Skill</option>
          <option value="streak">Streak</option>
          <option value="grind">Grind</option>
          <option value="item_power">Gear Score</option>
        </select>
      </div>
      <div className="space-y-1.5">
        {sortedRows.map((r, i) => {
          const isMe = r.id === user.id

          return (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => { if (!isMe && onSelectUser) onSelectUser(r.id) }}
              className={`flex items-center gap-2.5 py-2 px-3 rounded-xl transition-colors ${
                isMe ? 'bg-cyber-neon/5 border border-cyber-neon/20' : 'hover:bg-white/[0.04] cursor-pointer'
              }`}
            >
              {/* Rank */}
              <span className="text-sm w-6 shrink-0 text-center">
                {i < 3 ? MEDALS[i] : <span className="text-gray-600 font-mono text-xs">#{i + 1}</span>}
              </span>

              {/* Avatar with frame */}
              <div className="overflow-visible shrink-0">
                <AvatarWithFrame
                avatar={r.avatar_url || '🤖'}
                frameId={r.equipped_frame}
                sizeClass="w-8 h-8"
                textClass="text-sm"
                roundedClass="rounded-full"
                ringInsetClass="-inset-0.5"
                ringOpacity={0.95}
              />
              </div>

              {/* Name + badges */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs font-semibold truncate ${isMe ? 'text-cyber-neon' : 'text-white'}`}>
                    {r.username || 'Anonymous'}
                    {isMe && <span className="text-gray-500 ml-1">(you)</span>}
                  </span>
                  <span className="text-[9px] text-gray-500 font-mono shrink-0" title="Total skill level">
                    {r.total_skill_level}
                  </span>
                </div>
                {r.streak_count > 0 && (
                  <span className="text-[9px] text-orange-400/70 font-mono">🔥 {r.streak_count}d streak</span>
                )}
              </div>

              {/* Primary stat + Item Power */}
              <div className="shrink-0 text-right">
                <p className="text-xs text-cyber-neon font-mono font-bold">
                  {sortBy === 'skill' && r.total_skill_level}
                  {sortBy === 'streak' && (r.streak_count > 0 ? `🔥 ${r.streak_count}` : '—')}
                  {sortBy === 'grind' && formatDuration(r.total_seconds)}
                  {sortBy === 'item_power' && computeFlexScore(r, getEffectiveEquippedLoot(r))}
                </p>
                {sortBy !== 'item_power' && (
                  <p className="text-[9px] text-gray-600 font-mono" title="Gear Score (gear IP + frame + badges)">
                    ✨{computeFlexScore(r, getEffectiveEquippedLoot(r))}
                  </p>
                )}
                {sortBy === 'item_power' && (
                  <p className="text-[9px] text-gray-600 font-mono">{formatDuration(r.total_seconds)}</p>
                )}
              </div>
            </motion.div>
          )
        })}
        {sortedRows.length === 0 && (
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
