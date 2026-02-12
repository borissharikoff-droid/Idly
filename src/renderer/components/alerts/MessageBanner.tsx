import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useMessageToastStore } from '../../stores/messageToastStore'
import type { MessageToast } from '../../stores/messageToastStore'

const BANNER_DURATION_MS = 5000

interface MessageBannerProps {
  onNavigateToChat: (friendId: string) => void
}

export function MessageBanner({ onNavigateToChat }: MessageBannerProps) {
  const queue = useMessageToastStore((s) => s.queue)
  const shift = useMessageToastStore((s) => s.shift)
  const [visible, setVisible] = useState<MessageToast | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  useEffect(() => {
    if (!visible && queue.length > 0) {
      setVisible(queue[0])
      clearTimer()
      timerRef.current = setTimeout(() => {
        shift()
        setVisible(null)
      }, BANNER_DURATION_MS)
    }
  }, [queue.length, visible])

  useEffect(() => {
    return clearTimer
  }, [])

  const handleDismiss = () => {
    clearTimer()
    shift()
    setVisible(null)
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
          initial={{ opacity: 0, y: -12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.98 }}
          transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
          className="fixed top-2 left-1/2 -translate-x-1/2 z-[100] w-[min(92vw,390px)]"
        >
          <div
            role="button"
            tabIndex={0}
            onClick={handleClick}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') handleClick()
            }}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-discord-card/95 border border-white/15 shadow-xl backdrop-blur hover:bg-discord-card transition-colors text-left cursor-pointer"
          >
            <div className="w-8 h-8 rounded-full bg-white/10 border border-white/10 flex items-center justify-center shrink-0 text-sm overflow-hidden">
              {visible.senderAvatar?.startsWith('http') ? (
                <img src={visible.senderAvatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <span>{visible.senderAvatar || '💬'}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-gray-400 leading-tight">New message</p>
              <p className="text-[12px] font-medium text-white truncate">
                {visible.senderName}: {visible.preview}
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
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
