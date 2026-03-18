import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNotificationStore, type NotificationType } from '../../stores/notificationStore'
import { useSessionStore } from '../../stores/sessionStore'
import { useArenaStore } from '../../stores/arenaStore'
import { useInventoryStore } from '../../stores/inventoryStore'
import { useFarmStore } from '../../stores/farmStore'
import { useNavigationStore } from '../../stores/navigationStore'
import { useAuthStore } from '../../stores/authStore'
import { LOOT_ITEMS, RARITY_COLORS, type BonusMaterial, type ChestType, type LootRarity } from '../../lib/loot'
import { ChestOpenModal } from '../animations/ChestOpenModal'
import { supabase } from '../../lib/supabase'
import { playClickSound } from '../../lib/sounds'
import { getLatestPatch } from '../../lib/changelog'
import { WhatsNewModal } from '../WhatsNewModal'
import type { TabId } from '../../App'

function tabForNotifType(type: NotificationType, title?: string): TabId | null {
  switch (type) {
    case 'arena_result': return 'arena'
    case 'marketplace_sale': return 'marketplace'
    case 'friend_levelup': return 'friends'
    case 'progression':
      // Chest/loot notifications → inventory; skill/xp notifications → skills
      if (title && (title.toLowerCase().includes('chest') || title.toLowerCase().includes('inbox') || title.toLowerCase().includes('loot') || title.toLowerCase().includes('drop'))) return 'inventory'
      return 'skills'
    default: return null
  }
}

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
  const { items, markAllRead, clear, dismiss } = useNotificationStore()
  const setResultModal = useArenaStore((s) => s.setResultModal)
  const globalNavigate = useNavigationStore((s) => s.navigateTo)
  const presentRecoveryComplete = useSessionStore((s) => s.presentRecoveryComplete)
  const claimPendingReward = useInventoryStore((s) => s.claimPendingReward)
  const openChestAndGrantItem = useInventoryStore((s) => s.openChestAndGrantItem)
  const user = useAuthStore((s) => s.user)
  const [filter, setFilter] = useState<'all' | 'update' | 'friend_levelup' | 'progression' | 'arena_result' | 'marketplace_sale' | 'poll'>('all')
  const [openedChest, setOpenedChest] = useState<{ chestType: ChestType; itemId: string; goldDropped?: number; bonusMaterials?: import('../../lib/loot').BonusMaterial[] } | null>(null)
  const [votingId, setVotingId] = useState<string | null>(null)
  const [votedPolls, setVotedPolls] = useState<Set<string>>(new Set())
  const [patchModalOpen, setPatchModalOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const filteredItems = items.filter((i) => {
    if (filter === 'all') return true
    if (filter === 'update') return i.type === 'update' || i.type === 'patch_notes'
    return i.type === filter
  })

  const openedItem = useMemo(
    () => (openedChest ? (LOOT_ITEMS.find((x) => x.id === openedChest.itemId) ?? null) : null),
    [openedChest],
  )

  const handleOpenChest = (notifId: string, rewardId: string, chestType: string) => {
    playClickSound()
    claimPendingReward(rewardId)
    const result = openChestAndGrantItem(chestType as ChestType, { source: 'session_complete' })
    useFarmStore.getState().rollSeedDrop(chestType as ChestType)
    dismiss(notifId)
    if (result && result.itemId) setOpenedChest({ chestType: chestType as ChestType, itemId: result.itemId, goldDropped: result.goldDropped, bonusMaterials: result.bonusMaterials })
  }

  useEffect(() => {
    if (open) markAllRead()
  }, [open, markAllRead])

  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (bellRef?.current?.contains(e.target as Node)) return
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onCloseRef.current()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, bellRef])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); onCloseRef.current() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  return (
    <>
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, y: -6, scale: 0.94, transformOrigin: 'top right' }}
          animate={{ opacity: 1, y: 0, scale: 1, transformOrigin: 'top right' }}
          exit={{ opacity: 0, y: -8, scale: 0.95, transformOrigin: 'top right' }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className="absolute top-full right-0 mt-1.5 w-[260px] max-h-[360px] rounded-xl bg-discord-card border border-white/10 shadow-xl z-50 overflow-hidden flex flex-col"
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
            <span className="text-xs font-semibold text-white">Notifications</span>
            {items.length > 0 && (
              <button onClick={clear} className="text-[10px] text-gray-500 hover:text-gray-300">Clear all</button>
            )}
          </div>
          <div className="px-3 py-1.5 border-b border-white/[0.06] flex items-center gap-1.5 flex-wrap">
            {(['all', 'update', 'friend_levelup', 'progression', 'arena_result', 'marketplace_sale', 'poll'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                  filter === t
                    ? 'border-cyber-neon/40 text-cyber-neon bg-cyber-neon/10'
                    : 'border-white/10 text-gray-500 hover:text-gray-300'
                }`}
              >
                {t === 'all' ? 'All' : t === 'update' ? 'Updates' : t === 'friend_levelup' ? 'Friends' : t === 'arena_result' ? 'Arena' : t === 'marketplace_sale' ? 'Market' : t === 'poll' ? 'Polls' : 'Progress'}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-auto">
            {filteredItems.length === 0 ? (
              <div className="py-8 text-center">
                <span className="text-gray-600 text-xs block">No notifications for this filter.</span>
                {items.length > 0 && (
                  <button
                    onClick={() => setFilter('all')}
                    className="mt-2 text-[10px] px-2.5 py-1 rounded border border-white/15 text-gray-300 hover:bg-white/5 transition-colors"
                  >
                    Show all
                  </button>
                )}
              </div>
            ) : (
              filteredItems.map((item) => (
                item.arenaResult ? (() => {
                  const ar = item.arenaResult!
                  const accent = ar.victory ? '#39ff14' : '#ef4444'
                  const accentBg = ar.victory ? 'rgba(57,255,20,0.07)' : 'rgba(239,68,68,0.07)'
                  const accentBorder = ar.victory ? 'rgba(57,255,20,0.22)' : 'rgba(239,68,68,0.22)'
                  const iconBg = ar.victory ? 'rgba(57,255,20,0.12)' : 'rgba(239,68,68,0.12)'
                  return (
                    <div key={item.id} className="px-2.5 py-1.5 border-b border-white/[0.03] last:border-0">
                      <div
                        className="rounded-xl px-3 py-2 cursor-pointer"
                        style={{ border: `1px solid ${accentBorder}`, background: accentBg }}
                        onClick={() => { if (globalNavigate) { playClickSound(); globalNavigate('arena'); onClose() } }}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: iconBg, border: `1px solid ${accentBorder}` }}>
                            {ar.chest?.image ? (
                              <img src={ar.chest.image} alt="" className="w-6 h-6 object-contain" style={{ imageRendering: 'pixelated' }} draggable={false} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                            ) : (
                              <span className="text-sm leading-none">{ar.chest?.icon ?? item.icon}</span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-1">
                              <p className="text-[11px] font-semibold text-white truncate">{item.title}</p>
                              <span className="text-[10px] text-gray-500 font-mono shrink-0">{timeAgo(item.timestamp)}</span>
                            </div>
                            <p className="text-[10px] leading-snug mt-0.5 truncate" style={{ color: accent }}>{item.body}</p>
                          </div>
                          {ar.victory && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                playClickSound()
                                const matBonuses: BonusMaterial[] = ar.materialDrop ? [{ itemId: ar.materialDrop.id, qty: ar.materialDrop.qty }] : []
                                if (ar.chest) {
                                  const result = openChestAndGrantItem(ar.chest.type as ChestType, { source: 'session_complete', focusCategory: null })
                                  if (result) {
                                    setResultModal({ chestType: ar.chest.type as ChestType, itemId: result.itemId, goldDropped: result.goldDropped + ar.gold, bonusMaterials: [...matBonuses, ...result.bonusMaterials], warriorXP: ar.warriorXP ?? 0, pendingGold: 0 })
                                  }
                                } else {
                                  setResultModal({ chestType: null, itemId: null, goldDropped: ar.gold, bonusMaterials: matBonuses, warriorXP: ar.warriorXP ?? 0, pendingGold: 0 })
                                }
                                dismiss(item.id)
                                onClose()
                              }}
                              className="shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors"
                              style={{ color: accent, background: `${accent}20`, border: `1px solid ${accentBorder}` }}
                            >
                              Claim
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })()
                : item.recovery ? (
                  <div key={item.id} className="px-2.5 py-1.5 border-b border-white/[0.03] last:border-0">
                    <div className="rounded-xl border border-cyber-neon/20 bg-cyber-neon/[0.06] px-3 py-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-cyber-neon/12 border border-cyber-neon/25">
                          <span className="text-sm leading-none">{item.icon}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-1">
                            <p className="text-[11px] font-semibold text-white truncate">{item.title}</p>
                            <span className="text-[10px] text-gray-500 font-mono shrink-0">{timeAgo(item.timestamp)}</span>
                          </div>
                          <p className="text-[10px] text-gray-400 truncate mt-0.5">{item.body}</p>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            playClickSound()
                            await presentRecoveryComplete({
                              sessionId: item.recovery?.sessionId ?? crypto.randomUUID(),
                              startTime: item.recovery?.startTime ?? Date.now(),
                              elapsedSeconds: item.recovery?.elapsedSeconds ?? 0,
                              sessionSkillXP: item.recovery?.sessionSkillXP || {},
                            })
                            window.electronAPI?.db?.clearCheckpoint?.().catch(() => {})
                            dismiss(item.id)
                          }}
                          className="shrink-0 px-2.5 py-1 rounded-lg bg-cyber-neon/15 border border-cyber-neon/35 text-cyber-neon text-[11px] font-semibold hover:bg-cyber-neon/25 transition-colors"
                        >
                          Claim
                        </button>
                      </div>
                    </div>
                  </div>
                ) : item.chestReward ? (() => {
                  const cr = item.chestReward
                  const rTheme = RARITY_COLORS[(cr.chestRarity as LootRarity) ?? 'common'] ?? RARITY_COLORS.common
                  return (
                    <div key={item.id} className="px-2.5 py-1.5 border-b border-white/[0.03] last:border-0">
                      <div
                        className="rounded-xl px-3 py-2"
                        style={{ border: `1px solid ${rTheme.border}`, background: `${rTheme.color}0a` }}
                      >
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                            style={{ background: `${rTheme.color}15`, border: `1px solid ${rTheme.border}` }}
                          >
                            {cr.chestImage ? (
                              <img
                                src={cr.chestImage}
                                alt=""
                                className="w-6 h-6 object-contain"
                                style={{ imageRendering: 'pixelated' }}
                                draggable={false}
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                              />
                            ) : (
                              <span className="text-sm leading-none">{item.icon}</span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-1">
                              <p className="text-[11px] font-semibold text-white truncate">{item.title}</p>
                              <span className="text-[10px] text-gray-500 font-mono shrink-0">{timeAgo(item.timestamp)}</span>
                            </div>
                            <p className="text-[10px] mt-0.5 truncate" style={{ color: rTheme.color }}>{cr.chestRarity ? `${cr.chestRarity.charAt(0).toUpperCase() + cr.chestRarity.slice(1)} bag` : item.body}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleOpenChest(item.id, cr.rewardId, cr.chestType)}
                            className="shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors"
                            style={{ color: rTheme.color, background: `${rTheme.color}20`, border: `1px solid ${rTheme.border}` }}
                          >
                            Open
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })()
                : item.poll ? (
                  <div key={item.id} className="px-2.5 py-1.5 border-b border-white/[0.03] last:border-0">
                    <div className="rounded-xl border border-purple-400/20 bg-purple-400/[0.06] px-3 py-2">
                      <div className="flex items-center gap-2.5 mb-2">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-purple-400/12 border border-purple-400/25">
                          <span className="text-sm leading-none">{item.icon}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-1">
                            <p className="text-[11px] font-semibold text-white truncate">{item.title}</p>
                            <span className="text-[10px] text-gray-500 font-mono shrink-0">{timeAgo(item.timestamp)}</span>
                          </div>
                          {item.body && <p className="text-[10px] text-gray-400 truncate mt-0.5">{item.body}</p>}
                        </div>
                      </div>
                      {votedPolls.has(item.poll.pollId) ? (
                        <p className="text-[10px] text-green-400 font-semibold text-center py-1">Voted!</p>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {item.poll.options.map((opt) => (
                            <button
                              key={opt.id}
                              disabled={votingId === item.poll!.pollId}
                              onClick={async () => {
                                if (!user) return
                                playClickSound()
                                setVotingId(item.poll!.pollId)
                                const { error } = await supabase.from('poll_votes').insert({
                                  poll_id: item.poll!.pollId,
                                  option_id: opt.id,
                                  user_id: user.id,
                                })
                                setVotingId(null)
                                if (!error) {
                                  setVotedPolls((prev) => new Set(prev).add(item.poll!.pollId))
                                }
                              }}
                              className="w-full text-left px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] text-[11px] text-gray-300 hover:border-purple-400/40 hover:bg-purple-400/10 transition-all"
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : item.patchVersion ? (
                  <div key={item.id} className="px-2.5 py-1.5 border-b border-white/[0.03] last:border-0">
                    <div className="rounded-xl border border-green-400/20 bg-green-400/[0.06] px-3 py-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-green-400/12 border border-green-400/25">
                          <span className="text-sm leading-none">{item.icon}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-1">
                            <p className="text-[11px] font-semibold text-white truncate">{item.title}</p>
                            <span className="text-[10px] text-gray-500 font-mono shrink-0">{timeAgo(item.timestamp)}</span>
                          </div>
                          <p className="text-[10px] text-gray-400 truncate mt-0.5">{item.body}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => { playClickSound(); setPatchModalOpen(true) }}
                          className="shrink-0 px-2.5 py-1 rounded-lg bg-green-400/15 border border-green-400/35 text-green-400 text-[11px] font-semibold hover:bg-green-400/25 transition-colors"
                        >
                          View
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    key={item.id}
                    className="px-2.5 py-1.5 flex items-center gap-2.5 hover:bg-white/[0.02] border-b border-white/[0.03] last:border-0 cursor-pointer"
                    onClick={() => {
                      const tab = tabForNotifType(item.type, item.title)
                      if (tab && globalNavigate) { playClickSound(); globalNavigate(tab); onClose() }
                    }}
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-white/[0.05] border border-white/[0.08]">
                      <span className="text-sm leading-none">{item.icon}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-1">
                        <p className="text-[11px] font-semibold text-white truncate">{item.title}</p>
                        <span className="text-[10px] text-gray-600 font-mono shrink-0">{timeAgo(item.timestamp)}</span>
                      </div>
                      {item.body && <p className="text-[10px] text-gray-500 truncate mt-0.5">{item.body}</p>}
                    </div>
                  </div>
                )
              ))
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>

    <ChestOpenModal
      open={Boolean(openedChest)}
      chestType={openedChest?.chestType ?? null}
      item={openedItem}
      goldDropped={openedChest?.goldDropped}
      bonusMaterials={openedChest?.bonusMaterials}
      onClose={() => setOpenedChest(null)}
    />
    <WhatsNewModal patch={getLatestPatch()} open={patchModalOpen} onClose={() => setPatchModalOpen(false)} />
    </>
  )
}
