import { useEffect, useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { useSessionStore } from '../../stores/sessionStore'
import { useAlertStore } from '../../stores/alertStore'
import { ConfettiEffect } from '../animations/ConfettiEffect'
import { playClickSound } from '../../lib/sounds'
import { getSkillById } from '../../lib/skills'

const AUTO_DISMISS_MS = 12000

export function SessionComplete() {
  const { lastSessionSummary, skillXPGains, streakMultiplier, sessionXPEarned, sessionRewards, liveXP, dismissComplete } = useSessionStore()
  const hasLootOpen = useAlertStore((s) => s.currentAlert !== null)
  const [progress, setProgress] = useState(100)
  const [skillPage, setSkillPage] = useState(0)
  const elapsedRef = useRef(0)

  // Pause auto-dismiss while loot drop is open
  useEffect(() => {
    const interval = setInterval(() => {
      if (hasLootOpen) return // pause timer while claiming rewards
      elapsedRef.current += 50
      const remaining = Math.max(0, 100 - (elapsedRef.current / AUTO_DISMISS_MS) * 100)
      setProgress(remaining)
      if (remaining <= 0) {
        clearInterval(interval)
        dismissComplete()
      }
    }, 50)
    return () => clearInterval(interval)
  }, [dismissComplete, hasLootOpen])

  const handleDismiss = () => {
    playClickSound()
    dismissComplete()
  }

  return (
    <>
      <ConfettiEffect />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
        onClick={handleDismiss}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-[280px] rounded-2xl bg-discord-card border border-cyber-neon/30 shadow-glow overflow-hidden"
        >
          <div className="px-5 pt-5 pb-3 text-center">
            <div className="text-3xl mb-2">🎉</div>
            <h3 className="text-base font-bold text-cyber-neon mb-0.5">GG, grind complete!</h3>
            {lastSessionSummary && (
              <p className="text-white text-lg font-mono font-bold">
                {lastSessionSummary.durationFormatted}
              </p>
            )}

            {/* Streak bonus + XP earned */}
            {(sessionXPEarned > 0 || liveXP > 0) && (
              <div className="flex flex-col items-center gap-1 mt-1">
                <div className="flex items-center justify-center gap-2">
                  <span className="text-xs font-mono text-cyber-neon">+{sessionXPEarned || liveXP} XP</span>
                  {streakMultiplier > 1 && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.3, type: 'spring', stiffness: 300 }}
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30"
                    >
                      🔥 x{streakMultiplier} streak
                    </motion.span>
                  )}
                </div>
              </div>
            )}

            {/* Rewards unlocked */}
            {sessionRewards.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="mt-2 flex flex-wrap justify-center gap-1"
              >
                {sessionRewards.map((reward, i) => (
                  <span
                    key={i}
                    className="text-[9px] px-1.5 py-0.5 rounded-md bg-cyber-neon/10 border border-cyber-neon/20 text-cyber-neon"
                  >
                    {reward.avatar && reward.avatar}{' '}{reward.title && `"${reward.title}"`}
                  </span>
                ))}
              </motion.div>
            )}

            {skillXPGains.length > 0 && (() => {
              const SKILLS_PER_PAGE = 3
              const totalPages = Math.ceil(skillXPGains.length / SKILLS_PER_PAGE)
              const pageSkills = skillXPGains.slice(skillPage * SKILLS_PER_PAGE, (skillPage + 1) * SKILLS_PER_PAGE)

              return (
                <div className="mt-3 text-left">
                  <div className="space-y-2">
                    {pageSkills.map((g) => {
                      const skill = getSkillById(g.skillId)
                      if (!skill) return null
                      const leveledUp = g.levelAfter > g.levelBefore
                      return (
                        <motion.div
                          key={g.skillId}
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          className={`rounded-lg px-2.5 py-2 border ${leveledUp ? 'bg-cyber-neon/10 border-cyber-neon/40 shadow-[0_0_12px_rgba(0,255,136,0.2)]' : 'bg-discord-dark/50 border-white/10'}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-lg">{skill.icon}</span>
                            <span className="text-white text-xs font-medium truncate flex-1">{skill.name}</span>
                            <span className="text-cyber-neon text-xs font-mono shrink-0">+{g.xp} XP</span>
                          </div>
                          {leveledUp && (
                            <p className="text-[10px] text-cyber-neon font-mono mt-0.5">
                              Lv.{g.levelBefore} → Lv.{g.levelAfter}
                            </p>
                          )}
                          <div className="h-1 rounded-full bg-discord-darker overflow-hidden mt-1.5">
                            <div
                              className="h-full rounded-full transition-all duration-300"
                              style={{ width: '100%', backgroundColor: skill.color }}
                            />
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-3 mt-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); setSkillPage((p) => Math.max(0, p - 1)) }}
                        disabled={skillPage === 0}
                        className="w-7 h-7 rounded-lg bg-discord-dark/60 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-default transition-colors"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                      </button>
                      <span className="text-[10px] font-mono text-gray-500">{skillPage + 1}/{totalPages}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setSkillPage((p) => Math.min(totalPages - 1, p + 1)) }}
                        disabled={skillPage === totalPages - 1}
                        className="w-7 h-7 rounded-lg bg-discord-dark/60 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-default transition-colors"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                      </button>
                    </div>
                  )}
                </div>
              )
            })()}

            <button
              onClick={handleDismiss}
              className="mt-4 px-6 py-2 rounded-xl bg-cyber-neon/15 border border-cyber-neon/30 text-cyber-neon text-xs font-bold active:scale-95 transition-all hover:bg-cyber-neon/25"
            >
              ✓ nice
            </button>
          </div>
          <div className="h-1 bg-discord-darker/50">
            <div
              className="h-full bg-cyber-neon/60 transition-[width] duration-100"
              style={{ width: `${progress}%` }}
            />
          </div>
        </motion.div>
      </motion.div>
    </>
  )
}
