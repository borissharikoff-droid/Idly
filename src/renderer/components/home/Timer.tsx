import { AnimatePresence, motion } from 'framer-motion'
import { useSessionStore } from '../../stores/sessionStore'
import { MOTION } from '../../lib/motion'

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h, m, s].map((n) => n.toString().padStart(2, '0')).join(':')
}

export function Timer() {
  const elapsed = useSessionStore((s) => s.elapsedSeconds)
  const status = useSessionStore((s) => s.status)
  const focusModeActive = useSessionStore((s) => s.focusModeActive)
  const focusModeEndsAt = useSessionStore((s) => s.focusModeEndsAt)
  const streakMultiplier = useSessionStore((s) => s.streakMultiplier)
  const focusRemainingSeconds = focusModeActive && focusModeEndsAt
    ? Math.max(0, Math.ceil((focusModeEndsAt - Date.now()) / 1000))
    : 0

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: MOTION.duration.slow, ease: MOTION.easingSoft }}
      className="text-center"
    >
      <motion.div
        layout
        className={`font-mono text-6xl font-bold tabular-nums tracking-wider transition-colors duration-300 select-none ${
          status === 'running'
            ? 'text-cyber-neon animate-timer-glow'
            : status === 'paused'
              ? 'text-yellow-400'
              : 'text-white/25'
        }`}
      >
        {formatTime(elapsed)}
      </motion.div>
      <AnimatePresence>
        {focusModeActive && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: MOTION.duration.base, ease: MOTION.easingSoft }}
            className="mt-3 flex justify-center"
          >
            <span className="text-xs font-bold tracking-wider px-3 py-1 rounded-full bg-cyber-neon/15 text-cyber-neon border border-cyber-neon/30">
              FOCUS {formatTime(focusRemainingSeconds)}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {status === 'running' && streakMultiplier > 1 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: MOTION.duration.base, ease: MOTION.easingSoft }}
            className="mt-2 flex justify-center"
          >
            <span className="text-xs font-bold tracking-wider px-3 py-1 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/30">
              🔥 ×{streakMultiplier.toFixed(1)} XP
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
