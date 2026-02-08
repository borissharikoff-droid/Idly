import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSessionStore } from '../../stores/sessionStore'
import { playClickSound } from '../../lib/sounds'

interface SessionControlsProps {
  glowPulse?: boolean
}

export function SessionControls({ glowPulse }: SessionControlsProps) {
  const { status, elapsedSeconds, start, stop, pause, resume } = useSessionStore()
  const isRunning = status === 'running'
  const isPaused = status === 'paused'
  const isActive = isRunning || isPaused
  const [confirmState, setConfirmState] = useState<'none' | 'discard' | 'confirm'>('none')

  const handleStartStop = () => {
    if (isActive) {
      playClickSound()
      if (elapsedSeconds < 30) {
        setConfirmState('discard')
        return
      }
      setConfirmState('confirm')
    } else {
      start()
      playClickSound()
    }
  }

  const handleConfirmStop = () => {
    playClickSound()
    setConfirmState('none')
    stop()
  }

  const handleCancel = () => {
    playClickSound()
    setConfirmState('none')
  }

  const handlePauseResume = () => {
    playClickSound()
    if (isPaused) resume()
    else pause()
  }

  return (
    <div className="relative flex flex-col items-center">
      {/* Confirmation dialog — absolute, doesn't push buttons */}
      <AnimatePresence>
        {confirmState !== 'none' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full mb-3 rounded-xl bg-discord-card border border-white/10 p-4 w-72 z-10"
          >
            <p className="text-sm text-white font-semibold text-center mb-1">
              {confirmState === 'discard' ? 'Session under 30s' : 'Stop grinding?'}
            </p>
            <p className="text-xs text-gray-400 text-center mb-3">
              {confirmState === 'discard'
                ? 'This session is too short to save. Discard it?'
                : 'End this grind session and save progress?'}
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleCancel}
                className="flex-1 py-2 rounded-lg bg-discord-darker border border-white/10 text-sm text-gray-400 font-medium hover:bg-discord-darker/80 transition-colors active:scale-95"
              >
                Continue
              </button>
              <button
                onClick={handleConfirmStop}
                className="flex-1 py-2 rounded-lg bg-discord-red text-white text-sm font-bold hover:bg-red-600 transition-colors active:scale-95"
              >
                I'm done
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main controls — centered */}
      <div className="flex items-center justify-center gap-6">
        <div className="relative">
          {glowPulse && (
            <div className="absolute -inset-2 rounded-[20px] animate-glow-pulse pointer-events-none" />
          )}
          <button
            onClick={handleStartStop}
            className={`relative min-w-[120px] px-8 py-3 rounded-2xl font-bold text-sm transition-colors duration-150 active:scale-[0.93] ${
              isActive
                ? 'bg-discord-red text-white hover:bg-red-600'
                : 'bg-cyber-neon text-discord-darker shadow-glow hover:shadow-[0_0_30px_rgba(0,255,136,0.5)]'
            }`}
          >
            {isActive ? 'STOP' : 'GRIND'}
          </button>
        </div>
        {isActive && (
          <button
            onClick={handlePauseResume}
            className="py-3 px-5 rounded-2xl font-bold text-sm bg-discord-card text-white border border-white/10 hover:bg-discord-cardHover active:scale-95 whitespace-nowrap transition-colors duration-150"
          >
            {isPaused ? 'RESUME' : 'PAUSE'}
          </button>
        )}
      </div>
    </div>
  )
}
