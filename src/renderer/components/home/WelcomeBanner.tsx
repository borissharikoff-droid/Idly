import { useState } from 'react'
import { motion } from 'framer-motion'

interface WelcomeBannerProps {
  onDismiss: () => void
}

export function WelcomeBanner({ onDismiss }: WelcomeBannerProps) {
  const [visible, setVisible] = useState(true)

  const handleDismiss = () => {
    setVisible(false)
    setTimeout(onDismiss, 300)
  }

  return (
    <motion.div
      initial={false}
      animate={visible ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: -10, scale: 0.97 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-xs text-center"
    >
      <div className="rounded-2xl bg-discord-card/90 border border-cyber-neon/20 px-5 py-4 relative overflow-hidden">
        {/* Glow background */}
        <div className="absolute inset-0 bg-gradient-to-b from-cyber-neon/5 to-transparent pointer-events-none" />

        <div className="relative">
          <div className="text-3xl mb-2">👋</div>

          <h2 className="text-white font-bold text-base mb-1">
            Welcome to the grind
          </h2>

          <p className="text-gray-400 text-xs leading-relaxed mb-3">
            Track your focus. Compete with friends.
            <br />
            Every minute counts — let's get it.
          </p>

          <div className="flex items-center justify-center gap-1.5 text-cyber-neon text-xs font-mono">
            <motion.span
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
            >
              ▼
            </motion.span>
            <span>hit GRIND to start</span>
            <motion.span
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
            >
              ▼
            </motion.span>
          </div>
        </div>

        <button
          onClick={handleDismiss}
          className="absolute top-2 right-2 text-gray-600 hover:text-gray-400 transition-colors text-xs w-5 h-5 flex items-center justify-center"
        >
          ✕
        </button>
      </div>
    </motion.div>
  )
}
