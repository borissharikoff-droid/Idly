import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSessionStore } from '../../stores/sessionStore'
import { getSkillById } from '../../lib/skills'
import { playLevelUpSound, playClickSound } from '../../lib/sounds'
import { getSkillQuote } from '../../lib/levelUpQuotes'
import { getSkillMilestoneReward } from '../../lib/xp'
import { PixelConfetti } from './PixelConfetti'
import { useNotificationStore } from '../../stores/notificationStore'
import { MOTION } from '../../lib/motion'

const AUTO_CLOSE_MS = 10_000

export function SkillLevelUpModal() {
  const { pendingSkillLevelUpSkill, dismissSkillLevelUp, currentActivity, progressionEvents } = useSessionStore()
  const [progress, setProgress] = useState(100)

  const skillId = pendingSkillLevelUpSkill?.skillId ?? ''
  const level = pendingSkillLevelUpSkill?.level ?? 0
  const skill = getSkillById(skillId) ?? null

  useEffect(() => {
    if (pendingSkillLevelUpSkill) {
      playLevelUpSound()
    }
  }, [pendingSkillLevelUpSkill])

  useEffect(() => {
    if (!pendingSkillLevelUpSkill || !skill) return
    setProgress(100)
    const started = Date.now()
    const timer = setInterval(() => {
      const elapsed = Date.now() - started
      const left = Math.max(0, 100 - (elapsed / AUTO_CLOSE_MS) * 100)
      setProgress(left)
      if (left <= 0) {
        clearInterval(timer)
        const live = useSessionStore.getState().pendingSkillLevelUpSkill
        if (live && live.skillId === skillId && live.level === level) {
          useNotificationStore.getState().push({
            type: 'progression',
            icon: '⬆️',
            title: `${skill.name} leveled up!`,
            body: `Reached LVL ${level}. Check Skills when you're back.`,
          })
          useSessionStore.getState().dismissSkillLevelUp()
        }
      }
    }, 80)
    return () => clearInterval(timer)
  }, [pendingSkillLevelUpSkill, skillId, level, skill?.name])

  const quote = useMemo(
    () => (skillId ? getSkillQuote(skillId) : ''),
    [skillId, level],
  )
  const milestoneLoot = skillId ? getSkillMilestoneReward(skillId, level) : null
  const appName = currentActivity?.appName || null
  const reason = useMemo(
    () => skillId ? progressionEvents.find((e) => e.reasonCode === 'focus_tick' && e.skillXpDelta[skillId] && e.skillXpDelta[skillId] > 0) : undefined,
    [progressionEvents, skillId],
  )

  const handleContinue = () => {
    playClickSound()
    dismissSkillLevelUp()
  }

  if (!pendingSkillLevelUpSkill || !skill) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[115] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      >
        <PixelConfetti originX={0.5} originY={0.45} accentColor={skill.color} duration={2.2} />
        <motion.div
          initial={{ scale: 0.86, y: 16, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.92, y: 10, opacity: 0 }}
          transition={MOTION.spring.pop}
          className="w-[320px] rounded-card border border-accent/30 bg-surface-2 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-5 text-center">
            <div
              className="w-20 h-20 mx-auto rounded border bg-surface-0/60 flex items-center justify-center text-4xl"
              style={{ borderColor: `${skill.color}50`, boxShadow: `0 0 12px ${skill.color}30` }}
            >
              {skill.icon}
            </div>
            <p className="text-micro text-accent font-mono uppercase tracking-wider mt-3">Loot drop</p>
            <p className="text-white font-semibold text-lg mt-1">{skill.name} LVL {level}</p>
            <p className="text-caption text-gray-400 mt-1">
              {milestoneLoot ? `Unlocked: ${milestoneLoot}` : `You leveled up!`}
            </p>
            {quote && (
              <p className="text-micro text-gray-500 italic mt-2">&ldquo;{quote}&rdquo;</p>
            )}
            {appName && appName !== 'Grindly' && (
              <p className="text-micro text-gray-600 font-mono mt-1">via {appName}</p>
            )}
            {reason && skillId && reason.skillXpDelta[skillId] && (
              <p className="text-micro text-gray-500 font-mono mt-2">+{Math.round(reason.skillXpDelta[skillId])} XP earned</p>
            )}
            <div className="mt-4">
              <button
                type="button"
                onClick={handleContinue}
                className="w-full py-2 rounded border border-accent/35 bg-accent/15 text-accent text-sm font-semibold hover:bg-accent/25 transition-colors"
              >
                Continue
              </button>
            </div>
          </div>
          <div className="h-1 bg-surface-0/60">
            <div className="h-full bg-accent/70 transition-[width] duration-100" style={{ width: `${progress}%` }} />
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
