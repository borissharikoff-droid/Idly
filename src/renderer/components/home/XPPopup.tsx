import { motion, AnimatePresence } from 'framer-motion'
import { useSessionStore } from '../../stores/sessionStore'

export function XPPopup() {
  const xpPopups = useSessionStore((s) => s.xpPopups)

  return (
    <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-24 pointer-events-none z-40">
      <AnimatePresence>
        {xpPopups.map((popup, index) => (
          <motion.div
            key={popup.id}
            initial={{ opacity: 0, scale: 0.3, y: 0 }}
            animate={{
              opacity: 1,
              scale: 1,
              y: -20 - index * 28,
              transition: { type: 'spring', stiffness: 400, damping: 18 },
            }}
            exit={{
              opacity: 0,
              scale: 0.8,
              y: -50 - index * 28,
              transition: { duration: 0.25 },
            }}
            className="absolute left-1/2 -translate-x-1/2"
          >
            <div
              className="px-4 py-2 rounded-none border-4 border-cyber-neon bg-[#0d1117] animate-xp-popup-glow"
              style={{
                fontFamily: '"Press Start 2P", monospace',
                imageRendering: 'pixelated',
              }}
            >
              <span className="text-cyber-neon text-xs tracking-wide drop-shadow-[0_0_6px_rgba(0,255,136,0.9)]">
                +{popup.amount} XP
              </span>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
