import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useSessionStore } from '../../stores/sessionStore'
import { useNotificationStore } from '../../stores/notificationStore'
import { playClickSound } from '../../lib/sounds'
import { MOTION } from '../../lib/motion'

function formatShort(seconds: number): string {
  const safe = Math.max(0, seconds)
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function FocusModeDock() {
  const {
    focusModeActive,
    focusModeEndsAt,
    elapsedSeconds,
    status,
    start,
    enableFocusMode,
    disableFocusMode,
  } = useSessionStore()
  const pushNotification = useNotificationStore((s) => s.push)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const hasElectron = typeof window !== 'undefined' && !!window.electronAPI

  const remainingSeconds = useMemo(() => {
    if (!focusModeActive || !focusModeEndsAt) return 0
    return Math.max(0, Math.ceil((focusModeEndsAt - Date.now()) / 1000))
  }, [focusModeActive, focusModeEndsAt, status, elapsedSeconds])

  const handlePick = async (hours: number) => {
    playClickSound()
    const durationMs = Math.max(1, hours) * 60 * 60 * 1000
    try {
      if (status === 'idle') {
        await start({ focusDurationMs: durationMs })
      } else {
        await enableFocusMode(durationMs)
      }
      setOpen(false)
    } catch (err) {
      pushNotification({
        type: 'progression',
        icon: '⚠️',
        title: 'Focus mode',
        body: err instanceof Error ? err.message : 'Failed to start focus mode',
      })
    }
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const [dropdownPos, setDropdownPos] = useState({ left: 0, top: 0, openUp: false })
  useLayoutEffect(() => {
    if (!open || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const openUp = spaceBelow < 80
    setDropdownPos({
      left: rect.left + rect.width / 2,
      top: openUp ? rect.top - 8 : rect.bottom + 8,
      openUp,
    })
  }, [open])

  const dropdownContent = open && (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 6, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 4, scale: 0.98 }}
        transition={{ duration: MOTION.duration.base, ease: MOTION.easingSoft }}
        className="fixed z-50 inline-flex items-center gap-1.5 rounded-card border border-white/10 bg-surface-2/95 backdrop-blur-sm px-2 py-1.5 shadow-xl"
        style={{
          left: dropdownPos.left,
          top: dropdownPos.openUp ? undefined : dropdownPos.top,
          bottom: dropdownPos.openUp ? (window.innerHeight - dropdownPos.top) : undefined,
          transform: 'translateX(-50%)',
        }}
      >
        {[1, 2, 3].map((hours) => (
          <button
            key={hours}
            onClick={() => { handlePick(hours).catch(() => {}) }}
            className="text-caption font-mono py-1.5 px-2.5 rounded border border-white/10 text-gray-300 hover:text-accent hover:border-accent/40 hover:bg-accent/8 transition-colors duration-200"
          >
            {hours}h
          </button>
        ))}

        {focusModeActive && (
          <button
            onClick={() => {
              playClickSound()
              disableFocusMode().catch(() => {})
              setOpen(false)
            }}
            className="text-caption font-mono py-1.5 px-2.5 rounded border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-colors duration-200"
          >
            off
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  )

  return (
    <div ref={containerRef} className="relative inline-flex items-center overflow-visible">
      <div className="flex items-center gap-1.5">
        {focusModeActive && (
          <button
            onClick={() => {
              playClickSound()
              disableFocusMode().catch(() => {})
            }}
            title="Cancel focus mode"
            className="text-caption font-mono py-1.5 px-2 rounded border border-white/10 text-gray-400 hover:text-white hover:border-white/20 hover:bg-white/5 transition-colors duration-200"
          >
            off
          </button>
        )}
        <button
          onClick={() => {
            playClickSound()
            setOpen((v) => !v)
          }}
          title={
            focusModeActive
              ? 'Focus mode is active'
              : !hasElectron
                ? 'Focus mode requires the desktop app (Electron)'
                : 'Enable Focus mode — blocks Windows notifications'
          }
          className={`text-xs py-2 px-3 rounded-lg border transition-all duration-150 ${
            focusModeActive
              ? 'border-accent/45 text-accent bg-accent/8'
              : 'border-white/10 text-gray-500 hover:text-gray-300 hover:border-white/20 hover:bg-white/[0.03]'
          }`}
        >
          {focusModeActive ? `⏱ ${formatShort(remainingSeconds)}` : '+ focus'}
        </button>
      </div>

      {typeof document !== 'undefined' && createPortal(dropdownContent, document.body)}
    </div>
  )
}
