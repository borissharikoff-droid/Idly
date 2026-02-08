import { motion } from 'framer-motion'

interface StreakOverlayProps {
  streak: number
  onClose: () => void
}

export function StreakOverlay({ streak, onClose }: StreakOverlayProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.88, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="text-center px-12 py-8"
      >
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="text-cyber-neon font-mono text-4xl font-bold mb-2"
        >
          {streak} Day Streak!
        </motion.p>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.3 }}
          className="text-white text-lg mb-6"
        >
          Keep grinding.
        </motion.p>
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.3 }}
          whileTap={{ scale: 0.96 }}
          onClick={onClose}
          className="px-6 py-2 rounded-xl bg-discord-accent text-white font-semibold transition-colors hover:bg-discord-accent/80"
        >
          Continue
        </motion.button>
      </motion.div>
    </motion.div>
  )
}
