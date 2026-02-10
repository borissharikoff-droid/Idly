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
  const [starting, setStarting] = useState(false)

  const handleStartStop = async () => {
    if (isActive) {
      playClickSound()
      if (elapsedSeconds < 30) {
        setConfirmState('discard')
        return
      }
      setConfirmState('confirm')
    } else {
      setStarting(true)
      playClickSound()
      try {
        await start()
      } finally {
        setTimeout(() => setStarting(false), 600)
      }
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
            className="absolute bottom-full mb-3 rounded-2xl p-4 w-72 z-10 shadow-xl border border-amber-500/25 bg-gradient-to-b from-[#2a2520] to-[#1e1e2e]"
          >
            <p className="text-sm font-semibold text-center mb-1 text-amber-200">
              {confirmState === 'discard' ? 'Session under 30s' : 'Stop grinding?'}
            </p>
            <p className="text-xs text-gray-400 text-center mb-4">
              {confirmState === 'discard'
                ? 'This session is too short to save. Discard it?'
                : 'End this grind session and save progress?'}
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleCancel}
                className="flex-1 py-2.5 rounded-xl border-2 border-white/20 bg-white/5 text-sm text-white font-medium hover:bg-white/10 hover:border-white/30 transition-all active:scale-95"
              >
                Continue
              </button>
              <button
                onClick={handleConfirmStop}
                className="flex-1 py-2.5 rounded-xl bg-discord-red text-white text-sm font-bold hover:bg-red-500 shadow-[0_0_16px_rgba(237,66,69,0.4)] transition-all active:scale-95"
              >
                {confirmState === 'discard' ? 'Discard' : "I'm done"}
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
            disabled={starting}
            className={`relative min-w-[120px] px-8 py-3 rounded-2xl font-bold text-sm transition-colors duration-150 active:scale-[0.93] ${
              starting
                ? 'bg-cyber-neon/60 text-discord-darker cursor-wait'
                : isActive
                  ? 'bg-discord-red text-white hover:bg-red-600'
                  : 'bg-cyber-neon text-discord-darker shadow-glow hover:shadow-[0_0_30px_rgba(0,255,136,0.5)]'
            }`}
          >
            {starting ? 'Starting...' : isActive ? 'STOP' : 'GRIND'}
          </button>
        </div>
        {isActive && (
          <button
            onClick={handlePauseResume}
            className="py-3 px-5 rounded-2xl font-bold text-sm whitespace-nowrap transition-all duration-150 active:scale-95 border-2 border-[#5865F2]/50 bg-[#5865F2]/15 text-white hover:bg-[#5865F2]/25 hover:border-[#5865F2]/70 hover:shadow-[0_0_20px_rgba(88,101,242,0.2)]"
          >
            {isPaused ? 'RESUME' : 'PAUSE'}
          </button>
        )}
      </div>
    </div>
  )
}
