import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { skillLevelFromXP } from '../../lib/skills'
import type { FriendProfile } from '../../hooks/useFriends'
import { AvatarWithFrame } from '../shared/AvatarWithFrame'
import { BackButton } from '../shared/BackButton'

interface CompareProps {
  friend: FriendProfile
  onBack: () => void
}

interface UserStats {
  totalSkillLevel: number
  streak: number
  totalGrindSeconds: number
  totalSessions: number
  achievementCount: number
  avatar: string
  username: string
  frameId: string | null
}

function StatRow({ label, myVal, theirVal, suffix, higherIsBetter = true }: {
  label: string
  myVal: number
  theirVal: number
  suffix?: string
  higherIsBetter?: boolean
}) {
  const iWin = higherIsBetter ? myVal > theirVal : myVal < theirVal
  const theyWin = higherIsBetter ? theirVal > myVal : theirVal < myVal
  const tie = myVal === theirVal

  return (
    <div className="flex items-center gap-2 py-2">
      <div className={`flex-1 text-right font-mono text-sm font-bold ${iWin ? 'text-cyber-neon' : tie ? 'text-white' : 'text-gray-500'}`}>
        {myVal.toLocaleString()}{suffix || ''}
        {iWin && <span className="ml-1 text-[10px]">✓</span>}
      </div>
      <div className="w-24 text-center">
        <span className="text-[10px] text-gray-400 font-mono uppercase tracking-wider">{label}</span>
      </div>
      <div className={`flex-1 text-left font-mono text-sm font-bold ${theyWin ? 'text-cyber-neon' : tie ? 'text-white' : 'text-gray-500'}`}>
        {theyWin && <span className="mr-1 text-[10px]">✓</span>}
        {theirVal.toLocaleString()}{suffix || ''}
      </div>
    </div>
  )
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function FriendCompare({ friend, onBack }: CompareProps) {
  const { user } = useAuthStore()
  const [me, setMe] = useState<UserStats | null>(null)
  const [them, setThem] = useState<UserStats | null>(null)

  useEffect(() => {
    loadStats()
  }, [friend.id])

  async function loadStats() {
    if (!supabase || !user) return

    // Load my profile from Supabase
    const { data: myProfile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    // My sessions
    const { data: mySessions } = await supabase.from('session_summaries')
      .select('duration_seconds')
      .eq('user_id', user.id)
    // My achievements
    const { data: myAch } = await supabase.from('user_achievements')
      .select('achievement_id')
      .eq('user_id', user.id)

    const api = window.electronAPI
    let myTotalSkillLevel = 0
    let localStreak = 0
    if (api?.db?.getAllSkillXP) {
      const rows = (await api.db.getAllSkillXP()) as { skill_id: string; total_xp: number }[]
      myTotalSkillLevel = (rows || []).reduce((s, r) => s + skillLevelFromXP(r.total_xp), 0)
    }
    if (api?.db?.getStreak) {
      localStreak = await api.db.getStreak()
    }

    const myTotalSeconds = (mySessions || []).reduce((s, r) => s + (r as { duration_seconds: number }).duration_seconds, 0)

    setMe({
      totalSkillLevel: myTotalSkillLevel,
      streak: localStreak || myProfile?.streak_count || 0,
      totalGrindSeconds: myTotalSeconds,
      totalSessions: (mySessions || []).length,
      achievementCount: (myAch || []).length,
      avatar: myProfile?.avatar_url || '🤖',
      username: myProfile?.username || 'You',
      frameId: myProfile?.equipped_frame || null,
    })

    // Friend sessions
    const { data: friendSessions } = await supabase.from('session_summaries')
      .select('duration_seconds')
      .eq('user_id', friend.id)
    // Friend achievements
    const { data: friendAch } = await supabase.from('user_achievements')
      .select('achievement_id')
      .eq('user_id', friend.id)

    const friendTotalSeconds = (friendSessions || []).reduce((s, r) => s + (r as { duration_seconds: number }).duration_seconds, 0)

    setThem({
      totalSkillLevel: friend.total_skill_level ?? 0,
      streak: friend.streak_count || 0,
      totalGrindSeconds: friendTotalSeconds,
      totalSessions: (friendSessions || []).length,
      achievementCount: (friendAch || []).length,
      avatar: friend.avatar_url || '🤖',
      username: friend.username || 'Friend',
      frameId: friend.equipped_frame || null,
    })
  }

  if (!me || !them) {
    return (
      <div className="space-y-3">
        <BackButton onClick={onBack} />
        <p className="text-gray-500 text-sm text-center py-8">Loading comparison...</p>
      </div>
    )
  }

  // Score: who wins more categories
  const comparisons = [
    { my: me.totalSkillLevel, their: them.totalSkillLevel },
    { my: me.streak, their: them.streak },
    { my: me.totalGrindSeconds, their: them.totalGrindSeconds },
    { my: me.totalSessions, their: them.totalSessions },
    { my: me.achievementCount, their: them.achievementCount },
  ]
  const myScore = comparisons.filter(c => c.my > c.their).length
  const theirScore = comparisons.filter(c => c.their > c.my).length

  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-3"
    >
      <BackButton onClick={onBack} />

      {/* Header: You vs Friend */}
      <div className="rounded-2xl bg-discord-card/80 border border-white/10 p-4">
        <div className="flex items-center justify-between">
          {/* My avatar */}
          <div className="flex flex-col items-center gap-1.5">
            <AvatarWithFrame
              avatar={me.avatar}
              frameId={me.frameId}
              sizeClass="w-12 h-12"
              textClass="text-2xl"
              roundedClass="rounded-lg"
              ringInsetClass="-inset-0.5"
            />
            <span className="text-xs text-white font-medium truncate max-w-[80px]">{me.username}</span>
          </div>

          {/* Score */}
          <div className="text-center">
            <div className="flex items-center gap-2">
              <span className={`text-2xl font-mono font-bold ${myScore > theirScore ? 'text-cyber-neon' : 'text-gray-500'}`}>{myScore}</span>
              <span className="text-gray-600 text-xs">vs</span>
              <span className={`text-2xl font-mono font-bold ${theirScore > myScore ? 'text-cyber-neon' : 'text-gray-500'}`}>{theirScore}</span>
            </div>
            <p className="text-[10px] text-gray-600 font-mono mt-0.5">CATEGORIES WON</p>
          </div>

          {/* Friend avatar */}
          <div className="flex flex-col items-center gap-1.5">
            <AvatarWithFrame
              avatar={them.avatar}
              frameId={them.frameId}
              sizeClass="w-12 h-12"
              textClass="text-2xl"
              roundedClass="rounded-lg"
              ringInsetClass="-inset-0.5"
            />
            <span className="text-xs text-white font-medium truncate max-w-[80px]">{them.username}</span>
          </div>
        </div>
      </div>

      {/* Detailed comparisons */}
      <div className="rounded-2xl bg-discord-card/80 border border-white/10 p-4 divide-y divide-white/5">
        <StatRow label="Total skill lvl" myVal={me.totalSkillLevel} theirVal={them.totalSkillLevel} />
        <StatRow label="Streak" myVal={me.streak} theirVal={them.streak} suffix="d" />
        <div className="flex items-center gap-2 py-2">
          <div className={`flex-1 text-right font-mono text-sm font-bold ${me.totalGrindSeconds > them.totalGrindSeconds ? 'text-cyber-neon' : me.totalGrindSeconds === them.totalGrindSeconds ? 'text-white' : 'text-gray-500'}`}>
            {formatDuration(me.totalGrindSeconds)}
            {me.totalGrindSeconds > them.totalGrindSeconds && <span className="ml-1 text-[10px]">✓</span>}
          </div>
          <div className="w-24 text-center">
            <span className="text-[10px] text-gray-400 font-mono uppercase tracking-wider">Grind Time</span>
          </div>
          <div className={`flex-1 text-left font-mono text-sm font-bold ${them.totalGrindSeconds > me.totalGrindSeconds ? 'text-cyber-neon' : me.totalGrindSeconds === them.totalGrindSeconds ? 'text-white' : 'text-gray-500'}`}>
            {them.totalGrindSeconds > me.totalGrindSeconds && <span className="mr-1 text-[10px]">✓</span>}
            {formatDuration(them.totalGrindSeconds)}
          </div>
        </div>
        <StatRow label="Sessions" myVal={me.totalSessions} theirVal={them.totalSessions} />
        <StatRow label="Achievements" myVal={me.achievementCount} theirVal={them.achievementCount} />
      </div>

      {/* Verdict */}
      <div className="rounded-xl bg-discord-card/80 border border-white/10 p-3 text-center">
        {myScore > theirScore ? (
          <p className="text-sm text-cyber-neon font-bold">🏆 You're ahead! Keep grinding!</p>
        ) : theirScore > myScore ? (
          <p className="text-sm text-orange-400 font-bold">💪 Time to catch up! Grind harder!</p>
        ) : (
          <p className="text-sm text-white font-bold">⚔️ Perfectly matched! Who grinds next?</p>
        )}
      </div>
    </motion.div>
  )
}
