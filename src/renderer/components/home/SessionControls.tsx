import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSessionStore } from '../../stores/sessionStore'
import { playClickSound } from '../../lib/sounds'
import { MOTION } from '../../lib/motion'

interface SessionControlsProps {
  glowPulse?: boolean
}

export function SessionControls({ glowPulse }: SessionControlsProps) {
  const { status, elapsedSeconds, start, stop, pause, resume } = useSessionStore()
  const isRunning = status === 'running'
  const isPaused = status === 'paused'
  const isActive = isRunning || isPaused
  const [confirmState, setConfirmState] = useState<'none' | 'discard' | 'confirm'>('none')
  const [showStartFx, setShowStartFx] = useState(false)
  const fxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (fxTimerRef.current) clearTimeout(fxTimerRef.current)
    }
  }, [])

  const handleStartStop = () => {
    if (isActive) {
      playClickSound()
      if (elapsedSeconds < 30) {
        setConfirmState('discard')
        return
      }
      setConfirmState('confirm')
    } else {
      setShowStartFx(true)
      if (fxTimerRef.current) clearTimeout(fxTimerRef.current)
      fxTimerRef.current = setTimeout(() => setShowStartFx(false), 1150)
      playClickSound()
      start().catch(() => {})
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
    <div className="relative flex flex-col items-center w-full">
      {/* Full-screen flash on grind start */}
      <AnimatePresence>
        {showStartFx && (
          <motion.div
            key="start-flash"
            initial={{ opacity: 0.18 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.1, ease: 'easeOut' }}
            className="fixed inset-0 z-[60] pointer-events-none"
            style={{ background: 'radial-gradient(ellipse at 50% 60%, rgba(0,255,136,0.22) 0%, transparent 68%)' }}
          />
        )}
      </AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: MOTION.duration.slow, ease: MOTION.easingSoft }}
        className="w-full flex justify-center"
      >
        <AnimatePresence mode="wait" initial={false}>
          {confirmState !== 'none' ? (
            <motion.div
              key="confirm-card"
              initial={{ opacity: 0, scale: 0.985 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.985 }}
              transition={{ duration: MOTION.duration.base, ease: MOTION.easingSoft }}
              className="fixed inset-0 z-[400] flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,0.55)' }}
            >
            <div className="w-full max-w-[320px] rounded-card p-3.5 border border-white/10 bg-surface-2/90 shadow-lg mx-4">
              <div className="text-center mb-2">
                <span className="text-2xl">{confirmState === 'discard' ? '🗑️' : '🛑'}</span>
              </div>
              <p className="text-sm font-semibold text-center mb-1 text-white">
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
                  className="flex-1 py-2.5 rounded border border-white/15 bg-white/5 text-sm text-white font-medium hover:bg-white/10 transition-colors"
                >
                  Continue
                </button>
                <button
                  onClick={handleConfirmStop}
                  className="flex-1 py-2.5 rounded bg-red-500 text-white text-sm font-semibold hover:bg-red-500 transition-colors"
                >
                  {confirmState === 'discard' ? 'Discard' : 'Stop'}
                </button>
              </div>
            </div>
            </motion.div>
          ) : (
            <motion.div
              key="main-controls"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: MOTION.duration.base, ease: MOTION.easingSoft }}
              className="flex flex-col items-center gap-3"
            >
              {/* GRIND button — idle state */}
              {!isActive && (
                <div className="relative">
                  <AnimatePresence>
                    {showStartFx && (
                      <>
                        <motion.div
                          key="start-fx-ring-1"
                          initial={{ opacity: 0.3, scale: 0.82 }}
                          animate={{ opacity: 0, scale: 1.22 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.9, ease: MOTION.easingSoft }}
                          className="absolute -inset-2.5 rounded border border-accent/40 pointer-events-none"
                        />
                        <motion.div
                          key="start-fx-ring-2"
                          initial={{ opacity: 0.18, scale: 0.88 }}
                          animate={{ opacity: 0, scale: 1.34 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 1.05, ease: MOTION.easingSoft, delay: 0.08 }}
                          className="absolute -inset-3.5 rounded border border-accent/25 pointer-events-none"
                        />
                      </>
                    )}
                  </AnimatePresence>
                  {glowPulse && (
                    <div className="absolute -inset-2 rounded animate-glow-pulse pointer-events-none" />
                  )}
                  <motion.button
                    onClick={handleStartStop}
                    whileHover={MOTION.interactive.hover}
                    whileTap={MOTION.interactive.tap}
                    transition={{ duration: MOTION.duration.base, ease: MOTION.easingSoft }}
                    className="relative min-w-[200px] px-12 py-4 rounded font-bold text-base tracking-widest transition-colors duration-200 bg-accent text-white hover:shadow-[0_0_30px_rgba(88,101,242,0.5)]"
                  >
                    GRIND
                  </motion.button>
                </div>
              )}

              {/* PAUSE + STOP — active state */}
              {isActive && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.97 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className="flex items-center gap-2.5"
                >
                  {/* Pause / Resume */}
                  <motion.button
                    onClick={handlePauseResume}
                    whileHover={MOTION.interactive.hover}
                    whileTap={MOTION.interactive.tap}
                    className={`px-8 py-3.5 rounded font-semibold text-sm tracking-wide transition-all duration-150 ${
                      isPaused
                        ? 'bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25'
                        : 'bg-white/6 border border-white/12 text-gray-300 hover:bg-white/10 hover:border-white/20'
                    }`}
                  >
                    {isPaused ? 'RESUME' : 'PAUSE'}
                  </motion.button>

                  {/* Stop */}
                  <motion.button
                    onClick={handleStartStop}
                    whileHover={MOTION.interactive.hover}
                    whileTap={MOTION.interactive.tap}
                    className="px-8 py-3.5 rounded font-semibold text-sm tracking-wide bg-red-500/12 border border-red-500/30 text-red-400 hover:bg-red-500/22 hover:border-red-500/50 transition-all duration-150"
                  >
                    STOP
                  </motion.button>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
