import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAlertStore } from '../../stores/alertStore'
import { playAchievementSound, playClickSound } from '../../lib/sounds'

const AUTO_DISMISS_MS = 12000

export function LootDrop() {
  const { currentAlert, claimCurrent, dismissCurrent } = useAlertStore()
  const [progress, setProgress] = useState(100)
  const [showReward, setShowReward] = useState(false)
  const alertId = currentAlert?.id ?? null

  // Reset state on new alert
  useEffect(() => {
    if (alertId) {
      setProgress(100)
      setShowReward(false)
      playAchievementSound()
    }
  }, [alertId])

  // Auto-dismiss countdown
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

  const handleClaim = () => {
    playClickSound()
    claimCurrent()
    setShowReward(true)
  }

  const handleDone = () => {
    playClickSound()
    dismissCurrent()
  }

  return (
    <AnimatePresence>
      {currentAlert && (
        <motion.div
          key={currentAlert.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center"
          onClick={handleDone}
        >
          <motion.div
            initial={{ scale: 0.6, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.6, opacity: 0, y: 30 }}
            transition={{ type: 'spring', damping: 18, stiffness: 250 }}
            onClick={(e) => e.stopPropagation()}
            className="w-[280px] rounded-2xl bg-discord-card border border-cyber-neon/30 shadow-[0_0_40px_rgba(0,255,136,0.2)] overflow-hidden"
          >
            {/* Header glow */}
            <div className="relative bg-gradient-to-b from-cyber-neon/10 to-transparent px-6 pt-6 pb-4 text-center">
              <div className="absolute top-4 left-1/2 -translate-x-1/2 w-24 h-24 bg-cyber-neon/10 rounded-full blur-2xl" />

              <motion.div
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.15, type: 'spring', stiffness: 200 }}
                className="relative text-5xl mb-3"
              >
                {currentAlert.achievement.icon}
              </motion.div>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.25 }}
                className="text-[10px] uppercase tracking-[3px] text-cyber-neon/80 font-mono mb-1"
              >
                {currentAlert.achievement.category === 'social' ? 'social achievement' : 'achievement unlocked'}
              </motion.p>

              <motion.h3
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-lg font-bold text-white"
              >
                {currentAlert.achievement.name}
              </motion.h3>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-gray-400 text-xs mt-1"
              >
                {currentAlert.achievement.description}
              </motion.p>
            </div>

            {/* Content */}
            <div className="px-6 pt-1 pb-4 min-h-[120px] flex flex-col">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="flex items-center justify-center mb-2 shrink-0"
              >
                <span className="text-cyber-neon font-mono text-sm font-bold">+{currentAlert.achievement.xpReward} XP</span>
              </motion.div>

              <div className="flex-1 min-h-0 flex items-center justify-center">
                {currentAlert.achievement.reward && !showReward && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                    className="w-full rounded-xl bg-discord-darker/80 border border-white/10 p-3 text-center"
                  >
                    <div className="flex items-center justify-center gap-2">
                      <motion.span
                        animate={{ rotate: [0, 10, -10, 0] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                        className="text-xl"
                      >
                        🎁
                      </motion.span>
                      <span className="text-xs text-gray-400 font-mono">reward available</span>
                    </div>
                  </motion.div>
                )}

                {showReward && currentAlert.achievement.reward && (
                  <motion.div
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 200 }}
                    className="w-full rounded-xl bg-gradient-to-b from-cyber-neon/10 to-discord-darker/80 border border-cyber-neon/20 p-4 text-center"
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: [0, 1.3, 1] }}
                      transition={{ duration: 0.5 }}
                      className="text-4xl mb-2"
                    >
                      {currentAlert.achievement.reward.value}
                    </motion.div>
                    <p className="text-white text-xs font-medium">{currentAlert.achievement.reward.label}</p>
                    <p className="text-gray-500 text-[10px] mt-1 font-mono">
                      {currentAlert.achievement.reward.type === 'avatar' ? 'now in Settings → avatar' : 'equipped'}
                    </p>
                  </motion.div>
                )}

                {!currentAlert.achievement.reward && <div className="w-full" />}
              </div>
            </div>

            {/* Fixed action bar — Claim and Nice in exact same spot */}
            <div className="px-6 pb-5 pt-0 h-[44px] flex items-center">
              {currentAlert.achievement.reward && !showReward ? (
                <button
                  onClick={handleClaim}
                  className="w-full py-2.5 rounded-xl bg-cyber-neon text-discord-darker font-bold text-sm active:scale-95 transition-all hover:shadow-glow"
                >
                  CLAIM
                </button>
              ) : (
                <button
                  onClick={handleDone}
                  className="w-full py-2.5 rounded-xl bg-cyber-neon/15 border border-cyber-neon/30 text-cyber-neon text-xs font-bold active:scale-95 transition-all hover:bg-cyber-neon/25"
                >
                  ✓ nice
                </button>
              )}
            </div>

            {/* Progress bar */}
            <div className="h-1 bg-discord-darker/50">
              <div
                className="h-full bg-cyber-neon/60 transition-[width] duration-100"
                style={{ width: `${progress}%` }}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
