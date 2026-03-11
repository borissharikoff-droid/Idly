import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNotificationStore, type NotificationType } from '../../stores/notificationStore'
import { useSessionStore } from '../../stores/sessionStore'
import { useArenaStore } from '../../stores/arenaStore'
import { useInventoryStore } from '../../stores/inventoryStore'
import { useFarmStore } from '../../stores/farmStore'
import { useNavigationStore } from '../../stores/navigationStore'
import { useAuthStore } from '../../stores/authStore'
import { LOOT_ITEMS, type BonusMaterial, type ChestType } from '../../lib/loot'
import { ChestOpenModal } from '../animations/ChestOpenModal'
import { supabase } from '../../lib/supabase'
import { playClickSound } from '../../lib/sounds'
import { getLatestPatch } from '../../lib/changelog'
import { WhatsNewModal } from '../WhatsNewModal'
import type { TabId } from '../../App'

function tabForNotifType(type: NotificationType): TabId | null {
  switch (type) {
    case 'arena_result': return 'arena'
    case 'marketplace_sale': return 'marketplace'
    case 'friend_levelup': return 'friends'
    case 'progression': return 'skills'
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
    if (result) setOpenedChest({ chestType: chestType as ChestType, itemId: result.itemId, goldDropped: result.goldDropped, bonusMaterials: result.bonusMaterials })
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
          exit={{ opacity: 0, y: -12, scale: 0.5, transformOrigin: 'top right' }}
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
                item.arenaResult ? (
                  <div key={item.id} className="px-3 py-2 border-b border-white/[0.03] last:border-0">
                    <div className={`rounded-2xl border px-3 py-2.5 cursor-pointer ${item.arenaResult.victory ? 'border-cyber-neon/25 bg-gradient-to-r from-cyber-neon/10 via-cyber-neon/5 to-discord-card/80' : 'border-red-500/25 bg-gradient-to-r from-red-500/10 via-red-500/5 to-discord-card/80'}`}
                      onClick={() => { if (globalNavigate) { playClickSound(); globalNavigate('arena'); onClose() } }}
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-base shrink-0 mt-0.5">{item.icon}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-[12px] font-semibold text-white leading-snug">{item.title}</p>
                            <span className="text-[9px] text-gray-500 font-mono shrink-0 mt-0.5">{timeAgo(item.timestamp)}</span>
                          </div>
                          <p className="text-[10px] text-gray-200 leading-snug mt-0.5">{item.body}</p>
                        </div>
                        {item.arenaResult.victory && (
                          <button
                            type="button"
                            onClick={() => {
                              playClickSound()
                              const ar = item.arenaResult!
                              const matBonuses: BonusMaterial[] = ar.materialDrop ? [{ itemId: ar.materialDrop.id, qty: ar.materialDrop.qty }] : []
                              if (ar.chest) {
                                const result = openChestAndGrantItem(ar.chest.type as ChestType, { source: 'session_complete', focusCategory: null })
                                if (result) {
                                  setResultModal({
                                    chestType: ar.chest.type as ChestType,
                                    itemId: result.itemId,
                                    goldDropped: result.goldDropped + ar.gold,
                                    bonusMaterials: [...matBonuses, ...result.bonusMaterials],
                                    warriorXP: ar.warriorXP ?? 0,
                                    pendingGold: 0,
                                  })
                                }
                              } else {
                                setResultModal({
                                  chestType: null,
                                  itemId: null,
                                  goldDropped: ar.gold,
                                  bonusMaterials: matBonuses,
                                  warriorXP: ar.warriorXP ?? 0,
                                  pendingGold: 0,
                                })
                              }
                              dismiss(item.id)
                              onClose()
                            }}
                            className="shrink-0 px-2.5 py-1 rounded-lg bg-cyber-neon/20 border border-cyber-neon/40 text-cyber-neon text-xs font-semibold hover:bg-cyber-neon/30 transition-colors"
                          >
                            Claim
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ) : item.recovery ? (
                  <div key={item.id} className="px-3 py-2 border-b border-white/[0.03] last:border-0">
                    <div className="rounded-xl border border-cyber-neon/20 bg-cyber-neon/[0.05] px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-base shrink-0">{item.icon}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] text-white leading-snug">{item.title}</p>
                          <p className="text-[10px] text-gray-400 leading-snug mt-px truncate">{item.body}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[9px] text-gray-600 font-mono">{timeAgo(item.timestamp)}</span>
                          <button
                            type="button"
                            onClick={async () => {
                              await presentRecoveryComplete({
                                sessionId: item.recovery?.sessionId ?? crypto.randomUUID(),
                                startTime: item.recovery?.startTime ?? Date.now(),
                                elapsedSeconds: item.recovery?.elapsedSeconds ?? 0,
                                sessionSkillXP: item.recovery?.sessionSkillXP || {},
                              })
                              window.electronAPI?.db?.clearCheckpoint?.().catch(() => {})
                              dismiss(item.id)
                            }}
                            className="px-2.5 py-1 rounded-lg bg-cyber-neon/15 border border-cyber-neon/35 text-cyber-neon text-xs font-semibold hover:bg-cyber-neon/25 transition-colors"
                          >
                            Claim
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : item.chestReward ? (
                  <div key={item.id} className="px-3 py-2 border-b border-white/[0.03] last:border-0">
                    <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-base shrink-0">{item.icon}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] text-white leading-snug">{item.title}</p>
                          <span className="text-[9px] text-gray-500 font-mono">{timeAgo(item.timestamp)}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleOpenChest(item.id, item.chestReward!.rewardId, item.chestReward!.chestType)}
                          className="shrink-0 px-2.5 py-1 rounded-lg bg-amber-400/20 border border-amber-400/40 text-amber-300 text-xs font-semibold hover:bg-amber-400/30 transition-colors"
                        >
                          Open
                        </button>
                      </div>
                    </div>
                  </div>
                ) : item.poll ? (
                  <div key={item.id} className="px-3 py-2 border-b border-white/[0.03] last:border-0">
                    <div className="rounded-xl border border-purple-400/20 bg-purple-400/[0.06] px-3 py-2">
                      <div className="flex items-start gap-2 mb-2">
                        <span className="text-base shrink-0 mt-0.5">{item.icon}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] text-white leading-snug font-semibold">{item.title}</p>
                          {item.body && <p className="text-[10px] text-gray-400 leading-snug mt-0.5">{item.body}</p>}
                        </div>
                        <span className="text-[9px] text-gray-600 font-mono shrink-0 mt-0.5">{timeAgo(item.timestamp)}</span>
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
                  <div key={item.id} className="px-3 py-2 border-b border-white/[0.03] last:border-0">
                    <div className="rounded-xl border border-green-400/20 bg-green-400/[0.06] px-3 py-2">
                      <div className="flex items-start gap-2">
                        <span className="text-base shrink-0 mt-0.5">{item.icon}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] text-white leading-snug font-semibold">{item.title}</p>
                          <p className="text-[10px] text-gray-400 leading-snug mt-0.5">{item.body}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[9px] text-gray-600 font-mono">{timeAgo(item.timestamp)}</span>
                          <button
                            type="button"
                            onClick={() => {
                              playClickSound()
                              setPatchModalOpen(true)
                            }}
                            className="px-2.5 py-1 rounded-lg bg-green-400/15 border border-green-400/35 text-green-400 text-xs font-semibold hover:bg-green-400/25 transition-colors"
                          >
                            View
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    key={item.id}
                    className="px-3 py-2 flex items-start gap-2 hover:bg-white/[0.02] border-b border-white/[0.03] last:border-0 cursor-pointer"
                    onClick={() => {
                      const tab = tabForNotifType(item.type)
                      if (tab && globalNavigate) { playClickSound(); globalNavigate(tab); onClose() }
                    }}
                  >
                    <span className="text-sm shrink-0 mt-0.5">{item.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-white leading-snug">{item.title}</p>
                      <p className="text-[10px] text-gray-500 leading-snug mt-0.5">{item.body}</p>
                    </div>
                    <span className="text-[9px] text-gray-600 font-mono shrink-0 mt-0.5">{timeAgo(item.timestamp)}</span>
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
