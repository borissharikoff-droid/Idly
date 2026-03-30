import { useEffect, useState, type ReactNode } from 'react'
import { fmt } from '../../lib/format'
import { motion, AnimatePresence } from 'framer-motion'
import { useToastStore, type Toast } from '../../stores/toastStore'
import { useArenaStore } from '../../stores/arenaStore'
import { useNotificationStore } from '../../stores/notificationStore'
import { LOOT_ITEMS, type BonusMaterial, type ChestType } from '../../lib/loot'
import { useInventoryStore } from '../../stores/inventoryStore'
import { playClickSound } from '../../lib/sounds'
import type { TabId } from '../../App'
import { Trophy, Skull, Sword, MessageCircle, Tag, ShoppingCart, Check, X as XIcon } from '../../lib/icons'

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
    case 'cook_complete':  return '#fb923c'
    case 'friend_online':  return '#22c55e'
    case 'friend_message':      return '#60a5fa'
    case 'marketplace_listed': return '#fbbf24'
    case 'marketplace_sold':   return '#22c55e'
    case 'crop_rot':       return '#a0674a'
    case 'generic':        return t.data.kind === 'generic' && t.data.type === 'success' ? '#22c55e' : '#f87171'
    default:               return '#6b7280'
  }
}

function tabForToast(d: Toast['data']): TabId | null {
  if (d.kind === 'arena_boss' || d.kind === 'mob_kill') return 'arena'
  if (d.kind === 'craft_complete') return 'craft'
  if (d.kind === 'cook_complete') return 'cooking'
  if (d.kind === 'friend_online' || d.kind === 'friend_message') return 'friends'
  if (d.kind === 'marketplace_listed' || d.kind === 'marketplace_sold') return 'marketplace'
  return null
}

// ─── Single toast item ───────────────────────────────────────────────────────
function ToastItem({ toast, onDismiss, onNavigate }: { toast: Toast; onDismiss: () => void; onNavigate?: (tab: TabId) => void }) {
  const [pct, setPct] = useState(100)
  const setResultModal = useArenaStore((s) => s.setResultModal)
  const dismissNotif = useNotificationStore((s) => s.dismiss)
  const openChestAndGrantItem = useInventoryStore((s) => s.openChestAndGrantItem)

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

  const icon = ((): ReactNode => {
    if (d.kind === 'arena_boss')          return d.victory ? <Trophy className="w-4 h-4" style={{ color: '#FACC15' }} /> : <Skull className="w-4 h-4" style={{ color: '#f87171' }} />
    if (d.kind === 'mob_kill')            return <Sword className="w-4 h-4" style={{ color: '#f87171' }} />
    if (d.kind === 'craft_complete')      return <span className="text-lg leading-none">{d.itemIcon}</span>
    if (d.kind === 'cook_complete')       return <span className="text-lg leading-none">{d.itemIcon}</span>
    if (d.kind === 'friend_online')       return <div className="w-2.5 h-2.5 rounded-full bg-green-500 ring-2 ring-green-500/30" />
    if (d.kind === 'friend_message')      return <MessageCircle className="w-4 h-4" style={{ color: '#57F287' }} />
    if (d.kind === 'marketplace_listed')  return <Tag className="w-4 h-4" style={{ color: '#FB923C' }} />
    if (d.kind === 'marketplace_sold')    return <ShoppingCart className="w-4 h-4" style={{ color: '#22c55e' }} />
    if (d.kind === 'crop_rot')            return <span className="text-lg leading-none">🥀</span>
    if (d.kind === 'generic')             return d.type === 'success' ? <Check className="w-4 h-4 text-accent" /> : <XIcon className="w-4 h-4 text-red-400" />
  })()

  const title = (() => {
    if (d.kind === 'arena_boss')     return d.victory ? `${d.bossName} slain!` : `Fell vs ${d.bossName}`
    if (d.kind === 'mob_kill')       return `${d.mobName} slain!`
    if (d.kind === 'craft_complete') return `${d.itemName} crafted!`
    if (d.kind === 'cook_complete')  return d.qty > 0 ? `${d.itemName} cooked!` : `${d.itemName} done!`
    if (d.kind === 'friend_online')  return `${d.friendName} is online`
    if (d.kind === 'friend_message')      return `${d.friendName}`
    if (d.kind === 'marketplace_listed') return 'Listed on marketplace'
    if (d.kind === 'marketplace_sold')   return 'Item sold!'
    if (d.kind === 'crop_rot')           return 'Crop rotted!'
    if (d.kind === 'generic')            return d.message
  })()

  const body = (() => {
    if (d.kind === 'arena_boss' && d.victory && d.gold > 0) return `+${fmt(d.gold)} 🪙`
    if (d.kind === 'mob_kill') {
      const matDef = d.material ? LOOT_ITEMS.find((x) => x.id === d.material) : null
      const parts = [`+${fmt(d.gold)}🪙`, `+${formatShort(d.xp)} ⚔ XP`]
      if (matDef) parts.push(`${matDef.icon} ${matDef.name}`)
      return parts.join('  ·  ')
    }
    if (d.kind === 'craft_complete') {
      const parts = [`×${d.qty}`]
      if (d.xp > 0) parts.push(`+${formatShort(d.xp)} craft XP`)
      return parts.join('  ·  ')
    }
    if (d.kind === 'cook_complete') {
      const parts = [`×${d.qty}`]
      if (d.xp > 0) parts.push(`+${formatShort(d.xp)} chef XP`)
      return parts.join('  ·  ')
    }
    if (d.kind === 'friend_message') return d.messagePreview ?? 'sent a message'
    if (d.kind === 'marketplace_listed') return `${d.itemName}${d.qty > 1 ? ` ×${d.qty}` : ''} — ${d.priceGold * d.qty} 🪙`
    if (d.kind === 'marketplace_sold')   return `${d.itemName}${d.qty > 1 ? ` ×${d.qty}` : ''} — +${d.totalGold} 🪙`
    if (d.kind === 'crop_rot') return d.count === 1 ? 'A crop has rotted! +1 wilted plant' : `${d.count} crops rotted! +${d.count} wilted plants`
    if (d.kind === 'generic') return null
    return null
  })()

  const canClaim = d.kind === 'arena_boss' && d.victory

  const handleClaim = () => {
    playClickSound()
    if (d.kind === 'arena_boss') {
      dismissNotif(d.notificationId)
      const matBonuses: BonusMaterial[] = d.materialDrop ? [{ itemId: d.materialDrop.id, qty: d.materialDrop.qty }] : []
      if (d.chest) {
        const result = openChestAndGrantItem(d.chest.type as ChestType, { source: 'session_complete', focusCategory: null })
        // Always open the modal — even if openChestAndGrantItem returned null (empty pool edge case)
        setResultModal({
          chestType: result ? d.chest.type as ChestType : null,
          itemId: result?.itemId ?? null,
          goldDropped: (result?.goldDropped ?? 0) + d.gold,
          bonusMaterials: result ? [...matBonuses, ...result.bonusMaterials] : matBonuses,
          warriorXP: d.warriorXP ?? 0,
          pendingGold: 0,
        })
      } else {
        setResultModal({
          chestType: null,
          itemId: null,
          goldDropped: d.gold,
          bonusMaterials: matBonuses,
          warriorXP: d.warriorXP ?? 0,
          pendingGold: 0,
        })
      }
    }
    onDismiss()
  }

  return (
    <div
      className="rounded-card overflow-hidden shadow-2xl"
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
        <button
          type="button"
          className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
          onClick={() => {
            const tab = tabForToast(d)
            if (tab && onNavigate) { playClickSound(); onNavigate(tab); onDismiss() }
          }}
        >
          <span className="shrink-0 flex items-center justify-center w-5 h-5">{icon}</span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-white leading-tight truncate">{title}</p>
            {body && (
              <p className="text-micro font-mono mt-0.5 truncate" style={{ color: `${accent}cc` }}>
                {body}
              </p>
            )}
          </div>
        </button>

        <div className="flex items-center gap-1 shrink-0">
          {canClaim && (
            <button
              type="button"
              onClick={handleClaim}
              className="text-micro font-bold px-2 py-0.5 rounded-md transition-colors"
              style={{ color: accent, background: `${accent}20`, border: `1px solid ${accent}40` }}
            >
              Claim
            </button>
          )}
          <button
            type="button"
            onClick={() => { playClickSound(); onDismiss() }}
            className="text-micro text-gray-500 hover:text-gray-300 p-0.5 transition-colors"
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
export function ToastStack({ onNavigate }: { onNavigate?: (tab: TabId) => void } = {}) {
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
            <ToastItem toast={t} onDismiss={() => dismiss(t.id)} onNavigate={onNavigate} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
