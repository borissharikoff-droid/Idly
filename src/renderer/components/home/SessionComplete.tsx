import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useSessionStore } from '../../stores/sessionStore'
import { ConfettiEffect } from '../animations/ConfettiEffect'
import { playClickSound } from '../../lib/sounds'
import { getSkillById } from '../../lib/skills'

const AUTO_DISMISS_MS = 8000

export function SessionComplete() {
  const { lastSessionSummary, skillXPGains, streakMultiplier, sessionXPEarned, levelBefore, sessionRewards, liveXP, dismissComplete } = useSessionStore()
  const [progress, setProgress] = useState(100)

  useEffect(() => {
    const start = Date.now()
    const interval = setInterval(() => {
      const elapsed = Date.now() - start
      const remaining = Math.max(0, 100 - (elapsed / AUTO_DISMISS_MS) * 100)
      setProgress(remaining)
      if (remaining <= 0) {
        clearInterval(interval)
        dismissComplete()
      }
    }, 50)
    return () => clearInterval(interval)
  }, [dismissComplete])

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
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={handleDismiss}
      >
        <motion.div
          initial={{ scale: 0.85, opacity: 0, y: 16 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 8 }}
          transition={{ type: 'spring', damping: 24, stiffness: 280, mass: 0.8 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-[280px] rounded-2xl bg-discord-card border border-cyber-neon/30 shadow-glow overflow-hidden"
        >
          <div className="px-5 pt-5 pb-3 text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
              className="text-3xl mb-2"
            >
              🎉
            </motion.div>
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
                {/* Levels gained */}
                {levelBefore > 0 && liveXP > 0 && (() => {
                  // Calculate current level from liveXP
                  const levelsGained = sessionRewards.length > 0 ? sessionRewards.filter(r => r.title).length : 0
                  if (levelsGained > 0) {
                    return (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.4 }}
                        className="text-[10px] text-cyber-neon font-medium"
                      >
                        +{levelsGained} level{levelsGained > 1 ? 's' : ''} gained!
                      </motion.div>
                    )
                  }
                  return null
                })()}
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

            {skillXPGains.length > 0 && (
              <div className="mt-3 space-y-2 text-left">
                {skillXPGains.map((g) => {
                  const skill = getSkillById(g.skillId)
                  if (!skill) return null
                  const leveledUp = g.levelAfter > g.levelBefore
                  return (
                    <motion.div
                      key={g.skillId}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`rounded-lg px-2.5 py-2 border ${leveledUp ? 'bg-cyber-neon/10 border-cyber-neon/40 shadow-[0_0_12px_rgba(0,255,136,0.2)]' : 'bg-discord-dark/50 border-white/10'
                        }`}
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
            )}

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
