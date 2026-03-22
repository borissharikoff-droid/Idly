import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ACHIEVEMENTS, getAchievementProgress, type AchievementProgressContext } from '../../lib/xp'
import { skillLevelFromXP } from '../../lib/skills'
import { ACHIEVEMENT_COSMETIC_UNLOCKS, FRAMES, BADGES } from '../../lib/cosmetics'

const CAT_META: Record<string, { label: string; icon: string }> = {
  grind:   { label: 'Grind',   icon: '\u26A1' },
  streak:  { label: 'Streak',  icon: '\uD83D\uDD25' },
  social:  { label: 'Social',  icon: '\uD83E\uDD1D' },
  special: { label: 'Special', icon: '\u2728' },
  skill:   { label: 'Skills',  icon: '\u26A1' },
}

export function Achievements() {
  const [unlockedIds, setUnlockedIds] = useState<string[]>([])
  const [progressCtx, setProgressCtx] = useState<AchievementProgressContext>({
    totalSessions: 0, streakCount: 0, friendCount: 0, skillLevels: {},
  })

  useEffect(() => {
    const api = window.electronAPI
    if (api?.db?.getUnlockedAchievements) {
      api.db.getUnlockedAchievements().then(setUnlockedIds)
    }
    const load = async () => {
      let totalSessions = 0, streakCount = 0, friendCount = 0
      const skillLevels: Record<string, number> = {}
      try {
        if (api?.db?.getSessions) { const s = await api.db.getSessions() as unknown[]; totalSessions = s.length }
        if (api?.db?.getStreak) streakCount = await api.db.getStreak()
        if (api?.db?.getAllSkillXP) {
          const rows = await api.db.getAllSkillXP() as { skill_id: string; total_xp: number }[]
          for (const r of rows) skillLevels[r.skill_id] = skillLevelFromXP(r.total_xp)
        }
      } catch { /* ignore */ }
      try {
        const stored = localStorage.getItem('grindly_friends_count')
        if (stored) friendCount = parseInt(stored, 10) || 0
      } catch { /* ignore */ }
      setProgressCtx({ totalSessions, streakCount, friendCount, skillLevels })
    }
    load()
  }, [])

  const unlockedCount = ACHIEVEMENTS.filter((a) => unlockedIds.includes(a.id)).length
  const categories = ['grind', 'streak', 'social', 'special', 'skill'] as const

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-card bg-surface-2/80 border border-white/10 p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-gray-400 font-mono">[ achievements ]</p>
        <span className="text-micro font-mono text-gray-500">{unlockedCount}/{ACHIEVEMENTS.length}</span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent/70 to-yellow-400/70 transition-all duration-700"
          style={{ width: `${(unlockedCount / ACHIEVEMENTS.length) * 100}%` }}
        />
      </div>

      {categories.map((cat) => {
        const items = ACHIEVEMENTS.filter((a) => a.category === cat)
        if (items.length === 0) return null
        const meta = CAT_META[cat]
        const catUnlocked = items.filter((a) => unlockedIds.includes(a.id)).length
        return (
          <div key={cat} className="space-y-1.5">
            <div className="flex items-center gap-2 px-0.5">
              <span className="text-micro text-gray-500 font-mono uppercase tracking-wider">
                {meta.icon} {meta.label}
              </span>
              <span className="text-micro text-gray-600 font-mono">{catUnlocked}/{items.length}</span>
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {items.map((a) => {
                const unlocked = unlockedIds.includes(a.id)
                const progress = getAchievementProgress(a.id, progressCtx)
                const pct = progress ? Math.min(100, (progress.current / progress.target) * 100) : (unlocked ? 100 : 0)
                const cosmetic = ACHIEVEMENT_COSMETIC_UNLOCKS[a.id]
                return (
                  <motion.div
                    key={a.id}
                    whileHover={{ scale: 1.01 }}
                    className={`rounded border p-2.5 transition-all ${
                      unlocked
                        ? 'border-accent/30 bg-accent/5'
                        : 'border-white/5 bg-surface-0/40'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`w-7 h-7 rounded flex items-center justify-center shrink-0 ${
                        unlocked ? 'bg-accent/15' : 'bg-surface-0/80'
                      }`}>
                        <span className="text-sm leading-none">{unlocked ? a.icon : '\uD83D\uDD12'}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className={`text-caption font-medium truncate ${unlocked ? 'text-white' : 'text-gray-400'}`}>
                            {a.name}
                          </span>
                          <span className={`text-micro font-mono shrink-0 ${unlocked ? 'text-accent/60' : 'text-gray-600'}`}>
                            +{a.xpReward}xp
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-micro truncate ${unlocked ? 'text-gray-400' : 'text-gray-600'}`}>
                            {a.description}
                          </span>
                          {cosmetic && <CosmeticMini cosmetic={cosmetic} unlocked={unlocked} />}
                        </div>
                      </div>
                    </div>
                    {!unlocked && progress && (
                      <div className="mt-1.5 h-1 rounded-full bg-white/5 overflow-hidden">
                        <div className="h-full rounded-full bg-accent/40 transition-all duration-500" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </motion.div>
                )
              })}
            </div>
          </div>
        )
      })}
    </motion.div>
  )
}

function CosmeticMini({ cosmetic, unlocked }: { cosmetic: { badgeId?: string; frameId?: string; avatarEmoji?: string }; unlocked: boolean }) {
  const opacity = unlocked ? '' : 'opacity-50'
  const parts: React.ReactNode[] = []

  if (cosmetic.frameId) {
    const frame = FRAMES.find((f) => f.id === cosmetic.frameId)
    if (frame) {
      const rarityColor = frame.rarity === 'Legendary' ? '#FFD700' : frame.rarity === 'Epic' ? '#C084FC' : '#4FC3F7'
      parts.push(
        <span key="frame" className={`text-micro font-mono ${opacity}`} style={{ color: rarityColor }}>
          {frame.name}
        </span>
      )
    }
  }
  if (cosmetic.badgeId) {
    const badge = BADGES.find((b) => b.id === cosmetic.badgeId)
    if (badge) {
      parts.push(
        <span key="badge" className={`text-micro px-1 rounded font-medium border ${opacity}`}
          style={{ borderColor: `${badge.color}30`, backgroundColor: `${badge.color}10`, color: badge.color }}>
          {badge.icon}
        </span>
      )
    }
  }
  if (cosmetic.avatarEmoji) {
    parts.push(
      <span key="avatar" className={`text-xs leading-none ${opacity}`}>{cosmetic.avatarEmoji}</span>
    )
  }

  if (parts.length === 0) return null
  return <span className="inline-flex items-center gap-1 shrink-0">{parts}</span>
}
