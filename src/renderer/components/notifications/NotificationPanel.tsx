import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNotificationStore, NotificationType, Notification } from '../../stores/notificationStore'

const TYPE_SECTIONS: { type: NotificationType; label: string }[] = [
  { type: 'update', label: 'Updates' },
  { type: 'friend_online', label: 'Friends' },
  { type: 'friend_levelup', label: 'Friends' },
  { type: 'achievement', label: 'Achievements' },
  { type: 'system', label: 'System' },
]

function timeAgo(ts: number): string {
  const diff = Math.max(0, Date.now() - ts)
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const d = Math.floor(hr / 24)
  return `${d}d ago`
}

function groupBySection(items: Notification[]) {
  const groups = new Map<string, Notification[]>()
  for (const item of items) {
    const section = TYPE_SECTIONS.find((s) => s.type === item.type)
    const label = section?.label ?? 'Other'
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label)!.push(item)
  }
  return groups
}

interface NotificationPanelProps {
  open: boolean
  onClose: () => void
  bellRef?: { current: HTMLButtonElement | null }
}

export function NotificationPanel({ open, onClose, bellRef }: NotificationPanelProps) {
  const { items, markAllRead, clear } = useNotificationStore()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    markAllRead()
  }, [open, markAllRead])

  // Close on outside click (ignore bell button — toggle handles that)
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (bellRef?.current?.contains(target)) return
      if (panelRef.current && !panelRef.current.contains(target)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onClose, bellRef])

  // Close on ESC
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const groups = groupBySection(items)

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
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
            <span className="text-xs font-semibold text-white">Notifications</span>
            {items.length > 0 && (
              <button
                onClick={clear}
                className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
              >
                Clear all
              </button>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto">
            {items.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.15 }}
                className="py-8 text-center"
              >
                <span className="text-gray-600 text-xs">No notifications yet</span>
              </motion.div>
            ) : (
              Array.from(groups.entries()).map(([label, groupItems]) => (
                <div key={label}>
                  <div className="px-3 pt-2.5 pb-1">
                    <span className="text-[9px] font-mono text-gray-500 uppercase tracking-wider">{label}</span>
                  </div>
                  <AnimatePresence initial={false}>
                    {groupItems.map((item) => (
                      <motion.div
                        key={item.id}
                        layout
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20, height: 0, marginTop: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0, overflow: 'hidden' }}
                        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                        className={`px-3 py-2 flex items-start gap-2 hover:bg-white/[0.02] transition-colors ${
                          !item.read ? 'bg-white/[0.02]' : ''
                        }`}
                      >
                        <span className="text-sm shrink-0 mt-0.5">{item.icon}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] text-white leading-snug">{item.title}</p>
                          <p className="text-[10px] text-gray-500 leading-snug mt-0.5">{item.body}</p>
                        </div>
                        <span className="text-[9px] text-gray-600 font-mono shrink-0 mt-0.5">
                          {timeAgo(item.timestamp)}
                        </span>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              ))
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
