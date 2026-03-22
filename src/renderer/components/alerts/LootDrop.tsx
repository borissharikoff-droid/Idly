import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAlertStore } from '../../stores/alertStore'
import { playAchievementSound, playClickSound } from '../../lib/sounds'
import { MOTION } from '../../lib/motion'
import { defaultSkillForAchievement } from '../../services/rewardGrant'
import { getSkillById } from '../../lib/skills'
import { ACHIEVEMENT_COSMETIC_UNLOCKS, FRAMES, BADGES } from '../../lib/cosmetics'

const AUTO_DISMISS_MS = 12000

// Color accent per achievement category
const CATEGORY_ACCENT: Record<string, string> = {
  social:   '#60a5fa', // blue
  skill:    '#a78bfa', // purple
  arena:    '#f87171', // red
  default:  '#fbbf24', // gold
}

function getAccent(category: string) {
  return CATEGORY_ACCENT[category] ?? CATEGORY_ACCENT.default
}

function getCosmeticLabel(achievementId: string): string | null {
  const unlock = ACHIEVEMENT_COSMETIC_UNLOCKS[achievementId]
  if (!unlock) return null
  const parts: string[] = []
  if (unlock.frameId) {
    const f = FRAMES.find((x) => x.id === unlock.frameId)
    if (f) parts.push(`${f.name} frame`)
  }
  if (unlock.badgeId) {
    const b = BADGES.find((x) => x.id === unlock.badgeId)
    if (b) parts.push(`${b.icon} ${b.name} badge`)
  }
  if (unlock.avatarEmoji) parts.push(`${unlock.avatarEmoji} avatar`)
  return parts.length > 0 ? parts.join(' · ') : null
}

export function LootDrop() {
  const { currentAlert, claimCurrent, dismissCurrent } = useAlertStore()
  const [progress, setProgress] = useState(100)
  const [showReward, setShowReward] = useState(false)
  const alertId = currentAlert?.id ?? null

  useEffect(() => {
    if (alertId) {
      setProgress(100)
      setShowReward(false)
      playAchievementSound()
    }
  }, [alertId])

  useEffect(() => {
    if (!alertId) return
    const start = Date.now()
    const interval = setInterval(() => {
      const elapsed = Date.now() - start
      const remaining = Math.max(0, 100 - (elapsed / AUTO_DISMISS_MS) * 100)
      setProgress(remaining)
      if (remaining <= 0) {
        clearInterval(interval)
        dismissCurrent()
      }
    }, 50)
    return () => clearInterval(interval)
  }, [alertId, dismissCurrent])

  const handleClaim = async () => {
    playClickSound()
    await claimCurrent()
    setShowReward(true)
  }

  const handleDone = () => {
    playClickSound()
    dismissCurrent()
  }

  if (!currentAlert) return null

  const { achievement } = currentAlert
  const accent = getAccent(achievement.category)
  const skill = getSkillById(defaultSkillForAchievement(achievement))
  const cosmeticUnlock = ACHIEVEMENT_COSMETIC_UNLOCKS[achievement.id] ?? null
  const cosmeticFrame = cosmeticUnlock?.frameId ? FRAMES.find((f) => f.id === cosmeticUnlock.frameId) : null
  const cosmeticBadge = cosmeticUnlock?.badgeId ? BADGES.find((b) => b.id === cosmeticUnlock.badgeId) : null
  const cosmeticLabel = getCosmeticLabel(achievement.id)
  const chestType = achievement.category === 'skill' ? 'Rare' : 'Common'
  const chestIcon = achievement.category === 'skill' ? '💎' : '📦'

  return (
    <AnimatePresence>
      {currentAlert && (
        <motion.div
          key={currentAlert.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}
          onClick={handleDone}
        >
          <motion.div
            initial={{ scale: 0.82, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.88, opacity: 0, y: 12 }}
            transition={MOTION.spring.pop}
            onClick={(e) => e.stopPropagation()}
            className="relative w-[280px] rounded-2xl overflow-hidden shadow-2xl"
            style={{
              background: 'linear-gradient(160deg, #0f0f1c 0%, #12121f 100%)',
              border: `1px solid ${accent}30`,
              boxShadow: `0 0 60px ${accent}18, 0 24px 48px rgba(0,0,0,0.6)`,
            }}
          >
            {/* Glow halo behind icon */}
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 rounded-full pointer-events-none"
              style={{ background: `radial-gradient(circle, ${accent}22 0%, transparent 70%)`, top: -16 }}
            />

            {/* Top accent line */}
            <div className="h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />

            {/* Icon */}
            <div className="flex justify-center pt-7 pb-2">
              <motion.div
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ ...MOTION.spring.soft, delay: 0.08 }}
                className="relative"
              >
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
                  style={{
                    background: `linear-gradient(145deg, ${accent}28, ${accent}10)`,
                    border: `1px solid ${accent}40`,
                    boxShadow: `0 0 24px ${accent}30`,
                  }}
                >
                  {achievement.icon}
                </div>
              </motion.div>
            </div>

            {/* Category label */}
            <p className="text-center text-micro uppercase tracking-[2.5px] font-mono mb-1" style={{ color: `${accent}99` }}>
              {achievement.category === 'social' ? 'Social Achievement' : 'Achievement Unlocked'}
            </p>

            {/* Title + description */}
            <div className="text-center px-6 pb-4">
              <h3 className="text-[17px] font-bold text-white leading-snug">
                {achievement.name}
              </h3>
              <p className="text-caption text-gray-500 mt-1 leading-relaxed">
                {achievement.description}
              </p>
            </div>

            {/* XP row */}
            <div className="flex justify-center mb-4">
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-full"
                style={{ background: `${accent}14`, border: `1px solid ${accent}30` }}
              >
                <span className="text-body font-bold font-mono" style={{ color: accent }}>+{achievement.xpReward} XP</span>
                {skill && (
                  <>
                    <span className="w-px h-3.5 bg-white/10" />
                    <span className="text-caption text-gray-400">{skill.icon} {skill.name}</span>
                  </>
                )}
              </div>
            </div>

            {/* Reward area */}
            <div className="px-4 pb-4 space-y-2">
              <AnimatePresence mode="wait">
                {!showReward ? (
                  <motion.div key="pre" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
                    {/* Cosmetic unlocks */}
                    {cosmeticUnlock && (
                      <div className="flex flex-wrap gap-1.5">
                        {cosmeticFrame && (
                          <span className="text-micro font-mono px-2.5 py-1 rounded-lg"
                            style={{ background: `${cosmeticFrame.color}12`, border: `1px solid ${cosmeticFrame.color}35`, color: cosmeticFrame.color }}>
                            🖼 {cosmeticFrame.name} frame
                          </span>
                        )}
                        {cosmeticBadge && (
                          <span className="text-micro font-mono px-2.5 py-1 rounded-lg"
                            style={{ background: `${cosmeticBadge.color}12`, border: `1px solid ${cosmeticBadge.color}35`, color: cosmeticBadge.color }}>
                            {cosmeticBadge.icon} {cosmeticBadge.name}
                          </span>
                        )}
                        {cosmeticUnlock.avatarEmoji && (
                          <span className="text-micro font-mono px-2.5 py-1 rounded-lg bg-white/[0.05] border border-white/10 text-gray-300">
                            {cosmeticUnlock.avatarEmoji} avatar
                          </span>
                        )}
                      </div>
                    )}
                    {/* Chest reward */}
                    {achievement.reward && (
                      <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08]">
                        <span className="text-xl">{chestIcon}</span>
                        <div className="flex-1">
                          <p className="text-caption font-semibold text-gray-200">+1 {chestType} Chest</p>
                          <p className="text-micro text-gray-600 font-mono">Claim to add to inventory</p>
                        </div>
                      </div>
                    )}
                  </motion.div>
                ) : (
                  <motion.div key="post" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={MOTION.spring.soft} className="space-y-2">
                    {cosmeticLabel && (
                      <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl" style={{ background: `${accent}0e`, border: `1px solid ${accent}28` }}>
                        <span className="text-xl">{achievement.reward?.value}</span>
                        <div className="flex-1">
                          <p className="text-caption font-semibold text-white leading-tight">{cosmeticLabel}</p>
                          <p className="text-micro text-gray-500 font-mono mt-0.5">Profile → Cosmetics</p>
                        </div>
                        <span className="text-micro font-mono px-1.5 py-0.5 rounded" style={{ background: `${accent}20`, color: accent }}>NEW</span>
                      </div>
                    )}
                    {achievement.reward && (
                      <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08]">
                        <span className="text-lg">{chestIcon}</span>
                        <p className="text-caption text-gray-300 font-mono">+1 {chestType} Chest added</p>
                        <span className="ml-auto text-micro font-mono text-green-400">✓</span>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Action button */}
            <div className="px-4 pb-5">
              {achievement.reward && !showReward ? (
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleClaim}
                  className="w-full py-2.5 rounded-xl text-body font-bold tracking-wide transition-all"
                  style={{
                    background: `linear-gradient(135deg, ${accent}40, ${accent}25)`,
                    border: `1px solid ${accent}55`,
                    color: accent,
                    boxShadow: `0 0 20px ${accent}18`,
                  }}
                >
                  Claim reward
                </motion.button>
              ) : (
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleDone}
                  className="w-full py-2.5 rounded-xl text-body font-semibold text-gray-500 border border-white/[0.08] bg-white/[0.04] transition-all hover:bg-white/[0.07] hover:text-gray-300"
                >
                  Nice!
                </motion.button>
              )}
            </div>

            {/* Auto-dismiss bar */}
            <div className="h-[2px] bg-white/[0.04]">
              <div
                className="h-full transition-[width] duration-100"
                style={{ width: `${progress}%`, background: `${accent}55` }}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
