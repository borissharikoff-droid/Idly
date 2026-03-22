import { useState, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useSessionStore } from '../../stores/sessionStore'
import { categoryToSkillId, getSkillById } from '../../lib/skills'
import { MOTION } from '../../lib/motion'

export function CurrentActivity() {
  const currentActivity = useSessionStore((s) => s.currentActivity)
  const sessionSkillXP = useSessionStore((s) => s.sessionSkillXP)
  const status = useSessionStore((s) => s.status)
  const [logsPath, setLogsPath] = useState<string | null>(null)
  const [displayActivity, setDisplayActivity] = useState<typeof currentActivity>(null)
  const [isDetecting, setIsDetecting] = useState(true)
  const clearRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const api = typeof window !== 'undefined' ? (window as unknown as { electronAPI?: { _preloadError?: boolean; _message?: string; data?: { getLogsPath?: () => Promise<string>; openLogsFolder?: () => Promise<unknown> } } }).electronAPI : undefined

  useEffect(() => {
    if (!api?.data?.getLogsPath) return
    api.data.getLogsPath().then(setLogsPath).catch(() => {})
  }, [api])

  useEffect(() => {
    return () => {
      if (clearRef.current) clearTimeout(clearRef.current)
    }
  }, [])

  useEffect(() => {
    const unknown = !currentActivity || currentActivity.appName === 'Unknown' || currentActivity.windowTitle === 'Searching 4 window...'
    const detectorError = currentActivity?.appName === 'Window detector error'

    if (clearRef.current) {
      clearTimeout(clearRef.current)
      clearRef.current = null
    }

    if (detectorError) {
      setDisplayActivity(currentActivity)
      setIsDetecting(false)
      return
    }

    if (!unknown && currentActivity) {
      setDisplayActivity(currentActivity)
      setIsDetecting(false)
      return
    }

    setIsDetecting(true)
    // Keep last known good activity a bit longer to prevent visual flicker.
    clearRef.current = setTimeout(() => setDisplayActivity(null), 2300)
  }, [currentActivity])
  const isPreloadError = api && '_preloadError' in api && api._preloadError
  const isBrowser = typeof window === 'undefined' || !api || (!('tracker' in api) && !isPreloadError)

  if (isPreloadError && api) {
    return (
      <div className="w-full max-w-sm rounded-card px-4 py-3 border border-amber-500/30 bg-amber-950/30">
        <p className="text-amber-400 text-sm font-medium">Loading error</p>
        <p className="text-gray-400 text-xs mt-1 break-words">{(api as { _message?: string })._message || 'Preload failed'}</p>
      </div>
    )
  }

  if (isBrowser) {
    return (
      <div className="w-full max-w-sm rounded-card px-4 py-3 border border-sky-400/25 bg-gradient-to-r from-sky-950/40 to-sky-900/20 shadow-[0_0_20px_rgba(56,189,248,0.08)]">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">🌐</span>
          <div className="flex-1 min-w-0">
            <p className="text-sky-200 text-sm font-medium">Browser Mode</p>
            <p className="text-sky-400/70 text-xs">window detection works in desktop app</p>
          </div>
        </div>
      </div>
    )
  }

  const isDetectorError = displayActivity?.appName === 'Window detector error'

  const openLogs = () => api?.data?.openLogsFolder?.()

  if (isDetectorError && displayActivity) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.99, filter: 'blur(4px)' }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
        transition={{ duration: MOTION.duration.slow, ease: MOTION.easingSoft }}
        className="w-full max-w-sm rounded-card bg-amber-950/30 border border-amber-500/30 px-4 py-3"
      >
        <p className="text-amber-400 text-sm font-medium">Window detector error</p>
        <p className="text-gray-400 text-xs mt-1 break-words">{displayActivity.windowTitle}</p>
        <p className="text-gray-500 text-caption mt-2">Check the logs folder or try running the app as administrator.</p>
        {logsPath && <p className="text-gray-500 text-caption mt-1.5 font-mono truncate" title={logsPath}>{logsPath}</p>}
        {api?.data?.openLogsFolder && <button type="button" onClick={openLogs} className="mt-2 text-xs text-accent hover:underline">Open logs folder</button>}
      </motion.div>
    )
  }

  if (!displayActivity) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8, filter: 'blur(3px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: MOTION.duration.slow, ease: MOTION.easingSoft }}
        className="w-full max-w-sm rounded-card bg-surface-2/60 border border-white/5 px-4 py-3 text-center"
      >
        <p className="text-gray-500 text-xs font-mono">Detecting active window...</p>
      </motion.div>
    )
  }

  const skillId = categoryToSkillId(displayActivity.category)
  const skill = getSkillById(skillId)
  const skillLabel = skill ? skill.name : 'Grinding'
  const xpThisSession = status === 'running' ? (sessionSkillXP[skillId] ?? 0) : 0
  const title = displayActivity.windowTitle
    ? displayActivity.windowTitle.slice(0, 35) + (displayActivity.windowTitle.length > 35 ? '...' : '')
    : ''
  const activityTitle = `Leveling ${skillLabel}`
  const activitySubtitle = `${displayActivity.appName}${title ? ` · ${title}` : ''}`

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.99, filter: 'blur(5px)' }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
      transition={{ duration: MOTION.duration.verySlow, ease: MOTION.easingSoft }}
      className="w-full max-w-sm rounded-card bg-surface-2/90 border border-accent/20 px-4 py-3 shadow-[0_0_16px_rgba(88,101,242,0.06)]"
    >
      <div className="flex items-center gap-2.5">
        <motion.span
          layout="position"
          transition={{ duration: MOTION.duration.base, ease: MOTION.easingSoft }}
          className="text-lg"
        >
          {skill?.icon ?? '📱'}
        </motion.span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <motion.p
              layout="position"
              transition={{ duration: MOTION.duration.base, ease: MOTION.easingSoft }}
              className="text-accent text-sm font-medium truncate"
            >
              {activityTitle}
            </motion.p>
            {xpThisSession > 0 && (
              <motion.span
                key={xpThisSession}
                layout
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: MOTION.duration.base, ease: MOTION.easingSoft }}
                className="text-caption font-mono text-gray-400"
              >
                +{xpThisSession} XP
              </motion.span>
            )}
            <AnimatePresence>
              {isDetecting && (
                <motion.span
                  key="detecting-pill"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: MOTION.duration.base, ease: MOTION.easingSoft }}
                  className="text-micro px-1.5 py-0.5 rounded-full border border-white/10 text-gray-400 bg-white/[0.03]"
                >
                  updating...
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <motion.p
            layout="position"
            transition={{ duration: MOTION.duration.base, ease: MOTION.easingSoft }}
            className="text-gray-400 text-xs truncate"
          >
            {activitySubtitle}
          </motion.p>
        </div>
      </div>
    </motion.div>
  )
}
