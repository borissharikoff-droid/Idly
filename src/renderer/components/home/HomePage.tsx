import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ProfileBar } from './ProfileBar'
import { Timer } from './Timer'
import { SessionControls } from './SessionControls'
import { CurrentActivity } from './CurrentActivity'
import { SessionComplete } from './SessionComplete'
import { MotivationBanner } from './MotivationBanner'
import { WelcomeBanner } from './WelcomeBanner'
import { GoalWidget } from './GoalWidget'
import { useSessionStore } from '../../stores/sessionStore'

interface HomePageProps {
  onNavigateProfile: () => void
}

function formatRecoveryDuration(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function HomePage({ onNavigateProfile }: HomePageProps) {
  const { showComplete, status } = useSessionStore()
  const [showWelcome, setShowWelcome] = useState(false)
  const [checkpoint, setCheckpoint] = useState<{ elapsed_seconds: number; updated_at: number } | null>(null)

  // Check for crash recovery checkpoint on mount
  useEffect(() => {
    const api = window.electronAPI
    if (!api?.db?.getCheckpoint) return
    api.db.getCheckpoint().then((cp) => {
      if (cp && cp.elapsed_seconds >= 60) {
        setCheckpoint({ elapsed_seconds: cp.elapsed_seconds, updated_at: cp.updated_at })
      }
    }).catch(() => {})
  }, [])

  const dismissCheckpoint = () => {
    setCheckpoint(null)
    window.electronAPI?.db?.clearCheckpoint?.().catch(() => {})
  }

  useEffect(() => {
    const welcomed = localStorage.getItem('idly_welcomed')
    if (!welcomed) setShowWelcome(true)
  }, [])

  useEffect(() => {
    if (status === 'running' && showWelcome) {
      const t = setTimeout(() => {
        localStorage.setItem('idly_welcomed', '1')
        setShowWelcome(false)
      }, 600)
      return () => clearTimeout(t)
    }
  }, [status, showWelcome])

  const handleDismissWelcome = () => {
    localStorage.setItem('idly_welcomed', '1')
    setShowWelcome(false)
  }

  return (
    <div className="flex flex-col h-full">
      <ProfileBar onNavigateProfile={onNavigateProfile} />

      <div className="flex-1 flex flex-col items-center justify-center pb-4 px-4 gap-6">
        {/* Crash recovery banner */}
        {checkpoint && status === 'idle' && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-xs rounded-xl bg-discord-card border border-yellow-500/25 p-3 text-center"
          >
            <p className="text-xs text-yellow-400 font-medium mb-0.5">
              Session recovered ({formatRecoveryDuration(checkpoint.elapsed_seconds)})
            </p>
            <p className="text-[10px] text-gray-400 mb-2">
              App closed unexpectedly. Your progress was saved.
            </p>
            <button
              onClick={dismissCheckpoint}
              className="text-[10px] px-4 py-1 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 hover:bg-yellow-500/20 transition-colors"
            >
              Ok
            </button>
          </motion.div>
        )}

        {showWelcome && status === 'idle' ? (
          <WelcomeBanner onDismiss={handleDismissWelcome} />
        ) : (
          <MotivationBanner isRunning={status !== 'idle'} />
        )}

        {/* Timer */}
        <Timer />

        {/* Controls + activity */}
        <div className="flex flex-col items-center gap-5">
          <SessionControls glowPulse={showWelcome && status === 'idle'} />
          <AnimatePresence>
            {status !== 'idle' && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="flex flex-col items-center gap-3"
              >
                <CurrentActivity />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Goal */}
        <div className="flex flex-col items-center w-full max-w-xs">
          <GoalWidget />
        </div>
      </div>

      <AnimatePresence>
        {showComplete && <SessionComplete />}
      </AnimatePresence>

    </div>
  )
}
