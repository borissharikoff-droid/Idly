import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useToastStore, type Toast } from '../../stores/toastStore'
import { useArenaStore } from '../../stores/arenaStore'
import { useNotificationStore } from '../../stores/notificationStore'
import { LOOT_ITEMS } from '../../lib/loot'
import { playClickSound } from '../../lib/sounds'

function formatShort(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return Math.floor(n).toString()
}

// ─── accent color per kind ───────────────────────────────────────────────────
function accentFor(t: Toast): string {
  switch (t.data.kind) {
    case 'arena_boss':     return t.data.victory ? '#fbbf24' : '#f87171'
    case 'mob_kill':       return '#22c55e'
    case 'craft_complete': return '#f97316'
    case 'friend_online':  return '#22c55e'
    case 'friend_message': return '#60a5fa'
  }
}

// ─── Single toast item ───────────────────────────────────────────────────────
function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [pct, setPct] = useState(100)
  const setResultModal = useArenaStore((s) => s.setResultModal)
  const dismissNotif = useNotificationStore((s) => s.dismiss)

  useEffect(() => {
    const tick = () => {
      const elapsed = Date.now() - toast.createdAt
      setPct(Math.max(0, 100 - (elapsed / toast.ttlMs) * 100))
    }
    tick()
    const id = setInterval(tick, 60)
    return () => clearInterval(id)
  }, [toast.createdAt, toast.ttlMs])

  const accent = accentFor(toast)
  const d = toast.data

  const icon = (() => {
    if (d.kind === 'arena_boss')     return d.victory ? '🏆' : '💀'
    if (d.kind === 'mob_kill')       return '⚔️'
    if (d.kind === 'craft_complete') return d.itemIcon
    if (d.kind === 'friend_online')  return '🟢'
    if (d.kind === 'friend_message') return '💬'
  })()

  const title = (() => {
    if (d.kind === 'arena_boss')     return d.victory ? `${d.bossName} slain!` : `Fell vs ${d.bossName}`
    if (d.kind === 'mob_kill')       return `${d.mobName} slain!`
    if (d.kind === 'craft_complete') return `${d.itemName} crafted!`
    if (d.kind === 'friend_online')  return `${d.friendName} is online`
    if (d.kind === 'friend_message') return `${d.friendName}`
  })()

  const body = (() => {
    if (d.kind === 'arena_boss' && d.victory && d.gold > 0) return `+${d.gold} 🪙`
    if (d.kind === 'mob_kill') {
      const matDef = d.material ? LOOT_ITEMS.find((x) => x.id === d.material) : null
      const parts = [`+${d.gold}🪙`, `+${formatShort(d.xp)} ⚔ XP`]
      if (matDef) parts.push(`${matDef.icon} ${matDef.name}`)
      return parts.join('  ·  ')
    }
    if (d.kind === 'craft_complete') {
      const parts = [`×${d.qty}`]
      if (d.xp > 0) parts.push(`+${formatShort(d.xp)} craft XP`)
      return parts.join('  ·  ')
    }
    if (d.kind === 'friend_message') return d.messagePreview ?? 'sent a message'
    return null
  })()

  const canClaim = d.kind === 'arena_boss' && d.victory

  const handleClaim = () => {
    playClickSound()
    if (d.kind === 'arena_boss') {
      dismissNotif(d.notificationId)
      setResultModal({ victory: true, gold: d.gold, goldAlreadyAdded: false, bossName: d.bossName })
    }
    onDismiss()
  }

  return (
    <div
      className="rounded-xl overflow-hidden shadow-2xl"
      style={{
        background: 'rgba(16,16,26,0.97)',
        border: `1px solid ${accent}35`,
        backdropFilter: 'blur(12px)',
        minWidth: 240,
        maxWidth: 300,
      }}
    >
      {/* top accent line */}
      <div className="h-px" style={{ background: `linear-gradient(90deg, transparent, ${accent}70, transparent)` }} />

      <div className="px-3.5 pt-2.5 pb-2 flex items-center gap-2.5">
        <span className="text-lg leading-none shrink-0">{icon}</span>

        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-white leading-tight truncate">{title}</p>
          {body && (
            <p className="text-[10px] font-mono mt-0.5 truncate" style={{ color: `${accent}cc` }}>
              {body}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {canClaim && (
            <button
              type="button"
              onClick={handleClaim}
              className="text-[10px] font-bold px-2 py-0.5 rounded-md transition-colors"
              style={{ color: accent, background: `${accent}20`, border: `1px solid ${accent}40` }}
            >
              Claim
            </button>
          )}
          <button
            type="button"
            onClick={() => { playClickSound(); onDismiss() }}
            className="text-[10px] text-gray-500 hover:text-gray-300 p-0.5 transition-colors"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      </div>

      {/* TTL bar */}
      <div className="h-[2px]" style={{ background: 'rgba(255,255,255,0.07)' }}>
        <div
          className="h-full transition-[width] duration-[60ms]"
          style={{ width: `${pct}%`, background: `${accent}80` }}
        />
      </div>
    </div>
  )
}

// ─── Stack ───────────────────────────────────────────────────────────────────
export function ToastStack() {
  const { toasts, dismiss } = useToastStore()

  return (
    <div className="fixed top-10 left-1/2 -translate-x-1/2 z-[80] flex flex-col items-center gap-2 pointer-events-none">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: -14, scale: 0.93 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            className="pointer-events-auto"
          >
            <ToastItem toast={t} onDismiss={() => dismiss(t.id)} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
