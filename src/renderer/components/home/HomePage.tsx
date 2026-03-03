import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ProfileBar } from './ProfileBar'
import { Timer } from './Timer'
import { SessionControls } from './SessionControls'
import { CurrentActivity } from './CurrentActivity'
import { SessionComplete } from './SessionComplete'
import { WelcomeBanner } from './WelcomeBanner'
import { GoalWidget } from './GoalWidget'
import { FocusModeDock } from './FocusModeDock'
import { OrbBlast } from './OrbBlast'
import { useSessionStore } from '../../stores/sessionStore'
import { useAuthStore } from '../../stores/authStore'
import { MOTION } from '../../lib/motion'
import { useNotificationStore } from '../../stores/notificationStore'

interface HomePageProps {
  onNavigateProfile: () => void
  onNavigateInventory: () => void
  onNavigateFriends?: () => void
}

const APP_LAUNCHED_AT = Date.now()

function formatRecoveryDuration(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function HomePage({ onNavigateProfile, onNavigateInventory, onNavigateFriends }: HomePageProps) {
  const { showComplete, status } = useSessionStore()
  const user = useAuthStore((s) => s.user)
  const pushNotification = useNotificationStore((s) => s.push)
  const [showWelcome, setShowWelcome] = useState(() => !localStorage.getItem('grindly_welcomed'))
  const prevStatusRef = useRef(status)
  const notifiedCheckpointUpdatedAtRef = useRef<number | null>(null)

  useEffect(() => {
    if (status !== 'idle') return
    const api = window.electronAPI
    if (!api?.db?.getCheckpoint) return
    api.db.getCheckpoint().then((cp) => {
      const belongsToPreviousRun = !!cp && cp.updated_at < (APP_LAUNCHED_AT - 5000)
      if (cp && cp.elapsed_seconds >= 60 && belongsToPreviousRun) {
        if (notifiedCheckpointUpdatedAtRef.current === cp.updated_at) return
        notifiedCheckpointUpdatedAtRef.current = cp.updated_at
        let parsedSkillXP: Record<string, number> = {}
        try {
          const raw = cp.session_skill_xp ? JSON.parse(cp.session_skill_xp) : {}
          if (raw && typeof raw === 'object') {
            parsedSkillXP = Object.fromEntries(
              Object.entries(raw as Record<string, unknown>).filter(([, value]) => typeof value === 'number' && value > 0),
            ) as Record<string, number>
          }
        } catch {
          parsedSkillXP = {}
        }
        pushNotification({
          type: 'progression',
          icon: '🌱',
          title: 'Session restored',
          body: `Last run lasted ${formatRecoveryDuration(cp.elapsed_seconds)}. Your progress is safe and ready to claim.`,
          recovery: {
            sessionId: cp.session_id,
            startTime: cp.start_time,
            elapsedSeconds: cp.elapsed_seconds,
            sessionSkillXP: parsedSkillXP,
          },
        })
      }
    }).catch(() => {})
  }, [status, pushNotification])

  useEffect(() => {
    const welcomed = localStorage.getItem('grindly_welcomed')
    if (!welcomed) setShowWelcome(true)
  }, [])

  // Dismiss welcome when GRIND is pressed (status transitions from idle → running)
  useEffect(() => {
    const wasIdle = prevStatusRef.current === 'idle'
    prevStatusRef.current = status

    if (wasIdle && status === 'running' && showWelcome) {
      localStorage.setItem('grindly_welcomed', '1')
      setShowWelcome(false)
    }
  }, [status, showWelcome])

  const welcomeVisible = showWelcome && status === 'idle'

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: MOTION.duration.slow, ease: MOTION.easingSoft }}
      className="relative flex flex-col h-full"
    >
      <OrbBlast />

      <ProfileBar onNavigateProfile={onNavigateProfile} onNavigateInventory={onNavigateInventory} />

      {/* Welcome banner — only for new users, before first grind */}
      <AnimatePresence>
        {welcomeVisible && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3, ease: MOTION.easingSoft }}
            className="flex justify-center px-4 pt-2"
          >
            <WelcomeBanner />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Center zone — Timer + Controls at true screen center */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 gap-6">
        <Timer />

        <div className="flex flex-col items-center gap-5">
          <SessionControls glowPulse={showWelcome && status === 'idle'} />
          <AnimatePresence>
            {status !== 'idle' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: MOTION.duration.verySlow, ease: MOTION.easingSoft }}
                className="flex flex-col items-center gap-3"
              >
                <CurrentActivity />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Bottom zone — Goal + Focus anchored at bottom */}
      <div className="flex flex-col items-center px-4 pb-4 w-full">
        <div className="w-full max-w-xs">
          <GoalWidget trailingAction={<FocusModeDock />} />
        </div>
      </div>

      <AnimatePresence>
        {showComplete && (
          <SessionComplete
            onNavigateInventory={onNavigateInventory}
            onNavigateFriends={onNavigateFriends}
          />
        )}
      </AnimatePresence>

    </motion.div>
  )
}
