import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNotificationStore } from '../../stores/notificationStore'

function timeAgo(ts: number): string {
  const sec = Math.floor(Math.max(0, Date.now() - ts) / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}

interface NotificationPanelProps {
  open: boolean
  onClose: () => void
  bellRef?: React.RefObject<HTMLButtonElement | null>
}

export function NotificationPanel({ open, onClose, bellRef }: NotificationPanelProps) {
  const { items, markAllRead, clear } = useNotificationStore()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) markAllRead()
  }, [open, markAllRead])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (bellRef?.current?.contains(e.target as Node)) return
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onClose, bellRef])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, y: -8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.96 }}
          transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="absolute top-full right-0 mt-1.5 w-[260px] max-h-[360px] rounded-xl bg-discord-card border border-white/10 shadow-xl z-50 overflow-hidden flex flex-col"
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
            <span className="text-xs font-semibold text-white">Notifications</span>
            {items.length > 0 && (
              <button onClick={clear} className="text-[10px] text-gray-500 hover:text-gray-300">Clear all</button>
            )}
          </div>
          <div className="flex-1 overflow-auto">
            {items.length === 0 ? (
              <div className="py-8 text-center">
                <span className="text-gray-600 text-xs">No notifications yet</span>
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  className="px-3 py-2 flex items-start gap-2 hover:bg-white/[0.02] border-b border-white/[0.03] last:border-0"
                >
                  <span className="text-sm shrink-0 mt-0.5">{item.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-white leading-snug">{item.title}</p>
                    <p className="text-[10px] text-gray-500 leading-snug mt-0.5">{item.body}</p>
                  </div>
                  <span className="text-[9px] text-gray-600 font-mono shrink-0 mt-0.5">{timeAgo(item.timestamp)}</span>
                </div>
              ))
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
