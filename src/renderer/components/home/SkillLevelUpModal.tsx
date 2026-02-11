import { motion, AnimatePresence } from 'framer-motion'
import { useSessionStore } from '../../stores/sessionStore'
import { getSkillById } from '../../lib/skills'
import { playSessionCompleteSound, playClickSound } from '../../lib/sounds'
import { getSkillQuote } from '../../lib/levelUpQuotes'
import { getSkillMilestoneReward } from '../../lib/xp'
import { PixelConfetti } from './PixelConfetti'
import { useEffect, useMemo } from 'react'

export function SkillLevelUpModal() {
  const { pendingSkillLevelUpSkill, dismissSkillLevelUp, currentActivity } = useSessionStore()

  useEffect(() => {
    if (pendingSkillLevelUpSkill) {
      playSessionCompleteSound()
    }
  }, [pendingSkillLevelUpSkill])

  // ESC to dismiss
  useEffect(() => {
    if (!pendingSkillLevelUpSkill) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        dismissSkillLevelUp()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [pendingSkillLevelUpSkill, dismissSkillLevelUp])

  if (!pendingSkillLevelUpSkill) return null

  const { skillId, level } = pendingSkillLevelUpSkill
  const skill = getSkillById(skillId)
  if (!skill) return null

  // Stable quote — computed once per level-up, not on every re-render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const quote = useMemo(() => getSkillQuote(skillId), [skillId, level])
  const milestoneLoot = getSkillMilestoneReward(skillId, level)
  const appName = currentActivity?.appName || null

  const handleContinue = () => {
    playClickSound()
    dismissSkillLevelUp()
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
        onClick={handleContinue}
      >
        <PixelConfetti originX={0.5} originY={0.45} accentColor={skill.color} duration={2.2} />
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: 'spring', damping: 22, stiffness: 280 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-[280px] rounded-2xl bg-discord-card border overflow-hidden relative"
          style={{ borderColor: `${skill.color}50`, boxShadow: `0 0 32px ${skill.color}20` }}
        >
          <div className="px-5 pt-5 pb-4 text-center">
            <p className="text-[10px] text-gray-400 font-mono uppercase tracking-wider mb-1">Skill level up</p>
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl mx-auto mb-2"
              style={{ backgroundColor: `${skill.color}20`, border: `2px solid ${skill.color}40` }}
            >
              {skill.icon}
            </div>
            <p className="text-white font-semibold text-sm mb-0.5">{skill.name}</p>
            <p className="text-2xl font-black font-mono mb-1" style={{ color: skill.color }}>
              Lv.{level}
            </p>
            {appName && appName !== 'Idly' && (
              <p className="text-[10px] text-gray-500 font-mono mb-2">via {appName}</p>
            )}
            <p className="text-gray-300 text-xs italic mb-3">&ldquo;{quote}&rdquo;</p>
            {milestoneLoot && (
              <p className="text-[10px] text-gray-400 font-mono uppercase tracking-wider mb-2 px-2 py-1.5 rounded-lg bg-white/5 border border-white/10">
                Unlocked: {milestoneLoot}
              </p>
            )}
            <button
              type="button"
              onClick={handleContinue}
              className="mt-3 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 active:scale-95"
              style={{ backgroundColor: `${skill.color}25`, color: skill.color, border: `1px solid ${skill.color}40` }}
            >
              Continue
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
