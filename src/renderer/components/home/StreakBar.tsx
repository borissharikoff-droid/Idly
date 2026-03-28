/**
 * StreakBar — visible, anxiety-inducing streak display.
 *
 * States:
 *   streak=0, no session today   → grey "Start your streak"
 *   streak>0, session done today → accent "N day streak ✓"
 *   streak>0, after 20:00, no session today → orange "Streak at risk — N days"
 *   streak>0, before 20:00, no session today → orange "🔥 N day streak" (neutral)
 */

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle } from '../../lib/icons'

interface StreakBarProps {
  /** Changes each new session — triggers streak refresh */
  sessionVersion?: string
}

export function StreakBar({ sessionVersion }: StreakBarProps) {
  const [streak, setStreak] = useState(0)
  const [sessionToday, setSessionToday] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  useEffect(() => {
    const api = window.electronAPI
    if (!api?.db) return

    Promise.all([
      api.db.getStreak().catch(() => 0) as Promise<number>,
      api.db.getSessionCount((() => {
        const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime()
      })()).catch(() => 0) as Promise<number>,
    ]).then(([s, todayCount]) => {
      setStreak(s ?? 0)
      setSessionToday((todayCount ?? 0) > 0)
      setLoaded(true)
    })
  }, [sessionVersion])

  if (!loaded) return null

  const hour = new Date().getHours()
  const atRisk = streak > 0 && !sessionToday && hour >= 20
  const noStreak = streak === 0 && !sessionToday

  // Only render the at-risk warning — the "no streak" placeholder is noise
  if (!atRisk) return null

  let label: string
  let borderClass: string
  let textClass: string
  let bgClass: string

  if (atRisk) {
    label = `Streak at risk — ${streak} day${streak !== 1 ? 's' : ''}`
    borderClass = 'border-orange-500/30'
    bgClass = 'bg-orange-500/[0.06]'
    textClass = 'text-orange-400'
  } else {
    label = 'Start your streak today'
    borderClass = 'border-white/[0.06]'
    bgClass = 'bg-white/[0.02]'
    textClass = 'text-gray-600'
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`mx-4 px-3 py-1.5 rounded border flex items-center gap-2 ${bgClass} ${borderClass}`}
    >
      {atRisk && (
        <motion.span
          animate={{ opacity: [1, 0.4, 1] }}
          transition={{ duration: 1.2, repeat: Infinity }}
          className="flex items-center"
          aria-hidden
        >
          <AlertTriangle className="w-3.5 h-3.5" />
        </motion.span>
      )}
      <span className={`text-xs font-mono ${textClass}`}>{label}</span>
    </motion.div>
  )
}
