import { useState, useEffect, useRef } from 'react'
import { X } from '../../lib/icons'
import { motion, AnimatePresence } from 'framer-motion'
import { useMessageToastStore } from '../../stores/messageToastStore'
import type { MessageToast } from '../../stores/messageToastStore'
import { MOTION } from '../../lib/motion'

const BANNER_DURATION_MS = 5000

interface MessageBannerProps {
  onNavigateToChat: (friendId: string) => void
}

export function MessageBanner({ onNavigateToChat }: MessageBannerProps) {
  const queue = useMessageToastStore((s) => s.queue)
  const shift = useMessageToastStore((s) => s.shift)
  const [visible, setVisible] = useState<MessageToast | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startedAtRef = useRef(0)
  const remainingMsRef = useRef(BANNER_DURATION_MS)
  const pausedRef = useRef(false)

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  useEffect(() => {
    if (!visible && queue.length > 0) {
      setVisible(queue[0])
      remainingMsRef.current = BANNER_DURATION_MS
      clearTimer()
      startedAtRef.current = Date.now()
      timerRef.current = setTimeout(() => {
        shift()
        setVisible(null)
      }, remainingMsRef.current)
    }
  }, [queue.length, visible])

  useEffect(() => {
    return clearTimer
  }, [])

  const handleDismiss = () => {
    clearTimer()
    remainingMsRef.current = BANNER_DURATION_MS
    shift()
    setVisible(null)
  }

  const pause = () => {
    if (!visible || pausedRef.current) return
    pausedRef.current = true
    if (startedAtRef.current > 0) {
      const elapsed = Date.now() - startedAtRef.current
      remainingMsRef.current = Math.max(300, remainingMsRef.current - elapsed)
    }
    clearTimer()
  }

  const resume = () => {
    if (!visible || !pausedRef.current) return
    pausedRef.current = false
    clearTimer()
    startedAtRef.current = Date.now()
    timerRef.current = setTimeout(() => {
      shift()
      setVisible(null)
      remainingMsRef.current = BANNER_DURATION_MS
    }, remainingMsRef.current)
  }

  const handleClick = () => {
    if (visible) {
      onNavigateToChat(visible.senderId)
      handleDismiss()
    }
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ ...MOTION.entry.prominent, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -MOTION.entry.prominent.y, scale: 0.98 }}
          transition={{ duration: MOTION.duration.base, ease: MOTION.easing }}
          className="fixed top-2 left-1/2 -translate-x-1/2 z-[100] w-[min(92vw,390px)]"
        >
          <div
            role="button"
            tabIndex={0}
            onClick={handleClick}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') handleClick()
            }}
            onMouseEnter={pause}
            onMouseLeave={resume}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-card bg-surface-2/95 border border-white/15 shadow-xl backdrop-blur hover:bg-surface-2 transition-colors text-left cursor-pointer"
          >
            <div className="w-8 h-8 rounded-full bg-white/10 border border-white/10 flex items-center justify-center shrink-0 text-sm overflow-hidden">
              {visible.senderAvatar?.startsWith('http') ? (
                <img src={visible.senderAvatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <span>{visible.senderAvatar || '💬'}</span>
              )}
            </div>
            <div className="flex-1 min-w-0 overflow-hidden">
              <p className="text-caption text-gray-400 leading-tight">New message</p>
              <p className="text-xs font-medium text-white line-clamp-2 break-words">
                {(visible.senderName.length > 25 ? `${visible.senderName.slice(0, 25)}…` : visible.senderName)}: {visible.preview}
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                handleDismiss()
              }}
              className="shrink-0 w-6 h-6 rounded flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Dismiss"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
