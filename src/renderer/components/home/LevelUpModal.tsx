import { motion, AnimatePresence } from 'framer-motion'
import { useSessionStore } from '../../stores/sessionStore'
import { playSessionCompleteSound, playClickSound } from '../../lib/sounds'
import { getGlobalLevelQuote } from '../../lib/levelUpQuotes'
import { PixelConfetti } from './PixelConfetti'
import { useEffect } from 'react'

export function LevelUpModal() {
  const { pendingLevelUp, dismissLevelUp } = useSessionStore()

  useEffect(() => {
    if (pendingLevelUp) {
      playSessionCompleteSound()
    }
  }, [pendingLevelUp])

  if (!pendingLevelUp) return null

  const { level, rewards } = pendingLevelUp
  const quote = getGlobalLevelQuote()

  const handleContinue = () => {
    playClickSound()
    dismissLevelUp()
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={handleContinue}
      >
        <PixelConfetti originX={0.5} originY={0.45} accentColor="#00ff88" duration={2.2} />
        <motion.div
          initial={{ scale: 0.7, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 10 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-[280px] rounded-2xl bg-discord-card border border-cyber-neon/40 shadow-[0_0_40px_rgba(0,255,136,0.3)] overflow-hidden relative"
        >
          <div className="absolute inset-0 bg-gradient-to-b from-cyber-neon/10 to-transparent pointer-events-none" />

          <div className="relative px-6 pt-6 pb-4 text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
              className="mb-2"
            >
              <span className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyber-neon to-discord-accent animate-pulse">
                LEVEL UP!
              </span>
            </motion.div>

            <motion.div
              initial={{ scale: 0, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
              className="text-5xl font-black text-cyber-neon mb-2 drop-shadow-[0_0_20px_rgba(0,255,136,0.8)]"
            >
              Lv.{level}
            </motion.div>

            <p className="text-gray-300 text-xs italic mb-4">&ldquo;{quote}&rdquo;</p>

            {rewards.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="space-y-2 mt-2"
              >
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">Rewards Unlocked</p>
                {rewards.map((reward, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + i * 0.1 }}
                    className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-cyber-neon/10 border border-cyber-neon/20"
                  >
                    {reward.avatar && <span className="text-lg">{reward.avatar}</span>}
                    {reward.title && (
                      <span className="text-cyber-neon font-bold text-sm">&quot;{reward.title}&quot; title</span>
                    )}
                  </motion.div>
                ))}
              </motion.div>
            )}

            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              onClick={handleContinue}
              className="mt-5 px-8 py-2.5 rounded-xl bg-cyber-neon/20 border border-cyber-neon/40 text-cyber-neon text-sm font-bold active:scale-95 transition-all hover:bg-cyber-neon/30 hover:shadow-[0_0_20px_rgba(0,255,136,0.3)]"
            >
              Continue Grinding
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
