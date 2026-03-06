import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { CHEST_DEFS, LOOT_ITEMS, LOOT_SOURCE_LABELS, getItemPerkDescription, type ChestType } from '../../lib/loot'
import { publishSocialFeedEvent } from '../../services/socialFeed'
import { SLOT_LABEL, LootVisual, RARITY_THEME, normalizeRarity } from '../loot/LootUI'
import { CharacterCard } from '../character/CharacterCard'
import { ensureInventoryHydrated, useInventoryStore } from '../../stores/inventoryStore'
import { ChestOpenModal } from '../animations/ChestOpenModal'
import { playClickSound } from '../../lib/sounds'
import { useFarmStore } from '../../stores/farmStore'
import { MOTION } from '../../lib/motion'

interface BackpackPanelProps {
  open: boolean
  onClose: () => void
  backpackRef?: React.RefObject<HTMLButtonElement | null>
}

export function BackpackPanel({ open, onClose, backpackRef }: BackpackPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const items = useInventoryStore((s) => s.items)
  const chests = useInventoryStore((s) => s.chests)
  const pendingRewards = useInventoryStore((s) => s.pendingRewards)
  const equippedBySlot = useInventoryStore((s) => s.equippedBySlot)
  const claimPendingReward = useInventoryStore((s) => s.claimPendingReward)
  const deletePendingReward = useInventoryStore((s) => s.deletePendingReward)
  const openChestAndGrantItem = useInventoryStore((s) => s.openChestAndGrantItem)
  const deleteChest = useInventoryStore((s) => s.deleteChest)
  const equipItem = useInventoryStore((s) => s.equipItem)
  const deleteItem = useInventoryStore((s) => s.deleteItem)

  const [openChestModal, setOpenChestModal] = useState<{ chestType: ChestType; itemId: string; goldDropped?: number; bonusMaterials?: import('../../lib/loot').BonusMaterial[] } | null>(null)
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; slotId: string } | null>(null)
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<SlotEntry | null>(null)

  type SlotEntry =
    | { id: string; kind: 'pending'; icon: string; image?: string; title: string; subtitle: string; quantity: number; rewardId: string; chestType: ChestType }
    | { id: string; kind: 'chest'; icon: string; image?: string; title: string; subtitle: string; quantity: number; chestType: ChestType }
    | { id: string; kind: 'item'; icon: string; image?: string; title: string; subtitle: string; quantity: number; itemId: string; equipped: boolean }

  const slots = useMemo<SlotEntry[]>(() => {
    const out: SlotEntry[] = []
    for (const reward of pendingRewards.filter((r) => !r.claimed)) {
      const chest = CHEST_DEFS[reward.chestType]
      out.push({
        id: `pending:${reward.id}`,
        kind: 'pending',
        icon: chest.icon,
        image: chest.image,
        title: chest.name,
        subtitle: `Inbox drop · ${LOOT_SOURCE_LABELS[reward.source as keyof typeof LOOT_SOURCE_LABELS] ?? reward.source}`,
        quantity: 1,
        rewardId: reward.id,
        chestType: reward.chestType,
      })
    }
    for (const chestType of Object.keys(CHEST_DEFS) as ChestType[]) {
      const qty = chests[chestType] ?? 0
      if (qty <= 0) continue
      const chest = CHEST_DEFS[chestType]
      out.push({
        id: `chest:${chestType}`,
        kind: 'chest',
        icon: chest.icon,
        image: chest.image,
        title: chest.name,
        subtitle: `${chest.rarity.toUpperCase()} bag`,
        quantity: qty,
        chestType,
      })
    }
    for (const item of LOOT_ITEMS) {
      const qty = items[item.id] ?? 0
      if (qty <= 0) continue
      out.push({
        id: `item:${item.id}`,
        kind: 'item',
        icon: item.icon,
        image: item.image,
        title: item.name,
        subtitle: getItemPerkDescription(item),
        quantity: qty,
        itemId: item.id,
        equipped: equippedBySlot[item.slot] === item.id,
      })
    }
    return out
  }, [pendingRewards, chests, items, equippedBySlot])

  const selectedSlot = useMemo(
    () => slots.find((slot) => slot.id === selectedSlotId) ?? null,
    [slots, selectedSlotId],
  )

  useEffect(() => {
    if (!open) return
    ensureInventoryHydrated()
  }, [open])

  useEffect(() => {
    if (!open) return
    if (!selectedSlotId && slots.length > 0) setSelectedSlotId(slots[0].id)
    if (selectedSlotId && !slots.some((slot) => slot.id === selectedSlotId)) {
      setSelectedSlotId(slots[0]?.id ?? null)
    }
  }, [open, slots, selectedSlotId])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (backpackRef?.current?.contains(e.target as Node)) return
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
      setContextMenu(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onClose, backpackRef])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const openChest = (chestType: ChestType) => {
    const result = openChestAndGrantItem(chestType, { source: 'session_complete' })
    if (!result) return
    useFarmStore.getState().rollSeedDrop(chestType)
    const item = LOOT_ITEMS.find((x) => x.id === result.itemId)
    if (item && ['epic', 'legendary', 'mythic'].includes(item.rarity)) {
      const eventType = item.rarity === 'legendary' || item.rarity === 'mythic' ? 'legendary_unlock' : 'loot_drop'
      publishSocialFeedEvent(eventType, { itemId: item.id, itemName: item.name, rarity: item.rarity, chestType, chestName: CHEST_DEFS[chestType].name }, { dedupeKey: `loot:${item.id}:${Date.now()}` }).catch(() => {})
    }
    setOpenChestModal({ chestType, itemId: result.itemId, goldDropped: result.goldDropped, bonusMaterials: result.bonusMaterials })
  }

  const runPrimaryAction = (slot: SlotEntry) => {
    playClickSound()
    if (slot.kind === 'pending') { claimPendingReward(slot.rewardId); return }
    if (slot.kind === 'chest') { openChest(slot.chestType); return }
    if (slot.kind === 'item') equipItem(slot.itemId)
  }

  const runDeleteAction = (slot: SlotEntry) => {
    if (slot.kind === 'pending') { deletePendingReward(slot.rewardId); return }
    if (slot.kind === 'chest') { deleteChest(slot.chestType); return }
    if (slot.kind === 'item') deleteItem(slot.itemId)
  }

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: MOTION.duration.fast, ease: MOTION.easingSoft }}
            className="absolute top-full right-0 mt-1.5 w-[min(340px,calc(100vw-16px))] rounded-xl bg-discord-card border border-white/10 shadow-xl z-50 overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
              <span className="text-xs font-semibold text-white">Backpack</span>
              <span className="text-[10px] text-gray-500 font-mono">{slots.length} items</span>
            </div>

            {/* Character */}
            <div className="px-2 pt-2">
              <CharacterCard />
            </div>

            <div className="mx-2 mt-2 border-t border-white/[0.06]" />

            {slots.length === 0 ? (
              <div className="flex items-center justify-center py-6">
                <p className="text-[11px] text-gray-500">No loot yet.</p>
              </div>
            ) : (
              <>
                {/* Scrollable list */}
                <div className="overflow-y-auto max-h-[300px] p-2 space-y-1">
                  {slots.map((slot) => {
                    const slotRarity =
                      slot.kind === 'item'
                        ? LOOT_ITEMS.find((x) => x.id === slot.itemId)?.rarity ?? 'common'
                        : slot.kind === 'chest' || slot.kind === 'pending'
                          ? CHEST_DEFS[slot.chestType].rarity
                          : 'common'
                    const slotTheme = RARITY_THEME[normalizeRarity(slotRarity)]
                    const isEquipped = slot.kind === 'item' && slot.equipped
                    const isPending = slot.kind === 'pending'
                    const isSelected = selectedSlotId === slot.id
                    const lootItem = slot.kind === 'item' ? LOOT_ITEMS.find((x) => x.id === slot.itemId) : null

                    return (
                      <button
                        key={slot.id}
                        type="button"
                        onClick={() => { playClickSound(); setSelectedSlotId(slot.id); setContextMenu(null) }}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          setSelectedSlotId(slot.id)
                          setContextMenu({ x: e.clientX, y: e.clientY, slotId: slot.id })
                        }}
                        className="relative w-full px-2.5 py-2 flex items-center gap-2.5 rounded-lg border transition-all text-left"
                        style={{
                          borderColor: isSelected ? slotTheme.color : slotTheme.border,
                          background: isSelected
                            ? `linear-gradient(135deg, ${slotTheme.glow}18 0%, rgba(12,12,20,0.97) 55%)`
                            : `linear-gradient(135deg, ${slotTheme.glow}07 0%, rgba(12,12,20,0.85) 60%)`,
                          boxShadow: isSelected ? `0 0 10px ${slotTheme.glow}30` : undefined,
                        }}
                      >
                        {isPending && (
                          <span className="absolute inset-0 rounded-lg pointer-events-none animate-pulse border border-amber-400/30" />
                        )}

                        {/* Icon */}
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden relative"
                          style={isEquipped
                            ? { background: `radial-gradient(circle at 50% 40%, ${slotTheme.glow}55 0%, rgba(9,9,17,0.95) 70%)` }
                            : { background: 'rgba(9,9,17,0.85)' }}
                        >
                          <LootVisual
                            icon={slot.icon}
                            image={slot.image}
                            className="w-6 h-6 object-contain"
                            scale={lootItem?.renderScale ?? 1}
                          />
                          {isEquipped && (
                            <span className="absolute top-[3px] left-[3px] w-[5px] h-[5px] rounded-full" style={{ background: slotTheme.color }} />
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-[11px] font-medium truncate text-white/85 leading-tight">{slot.title}</p>
                            {lootItem && lootItem.slot !== 'consumable' && (
                              <span className="flex-shrink-0 text-[8px] font-mono uppercase tracking-wide px-1 py-px rounded border border-white/10 text-gray-500 leading-none">
                                {SLOT_LABEL[lootItem.slot]}
                              </span>
                            )}
                          </div>
                          <p className="text-[9px] text-gray-500 truncate mt-0.5">{slot.subtitle}</p>
                        </div>

                        {/* Right: qty + rarity dot */}
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {slot.quantity > 1 && (
                            <span
                              className="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded"
                              style={{ background: `${slotTheme.border}50`, color: slotTheme.color }}
                            >
                              ×{slot.quantity}
                            </span>
                          )}
                          <div className="w-1.5 h-1.5 rounded-full" style={{ background: slotTheme.color }} />
                        </div>
                      </button>
                    )
                  })}
                </div>

                {/* Action bar for selected item */}
                {selectedSlot && (
                  <div className="border-t border-white/[0.06] px-2 py-2 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => runPrimaryAction(selectedSlot)}
                      className="flex-1 text-[10px] py-1.5 rounded border border-cyber-neon/35 text-cyber-neon bg-cyber-neon/10 hover:bg-cyber-neon/20 transition-colors"
                    >
                      {selectedSlot.kind === 'pending' ? 'claim' : selectedSlot.kind === 'chest' ? 'open' : selectedSlot.equipped ? 'equipped ✓' : 'equip'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmTarget(selectedSlot)}
                      className="px-3 text-[10px] py-1.5 rounded border border-red-400/30 text-red-400/70 hover:bg-red-400/10 transition-colors"
                    >
                      delete
                    </button>
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {contextMenu && (() => {
        const slot = slots.find((x) => x.id === contextMenu.slotId)
        if (!slot) return null
        return (
          <div
            className="fixed z-[90] rounded-lg border border-white/15 bg-discord-card px-2 py-1.5"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" onClick={() => { runPrimaryAction(slot); setContextMenu(null) }} className="block w-full text-left text-[11px] px-2 py-1 rounded text-cyber-neon hover:bg-cyber-neon/15 transition-colors">
              {slot.kind === 'pending' ? 'claim' : slot.kind === 'chest' ? 'open' : slot.equipped ? 'equip (refresh)' : 'equip'}
            </button>
            <button type="button" onClick={() => { setDeleteConfirmTarget(slot); setContextMenu(null) }} className="block w-full text-left text-[11px] px-2 py-1 rounded text-red-300 hover:bg-red-400/10 transition-colors">
              delete
            </button>
          </div>
        )
      })()}

      {deleteConfirmTarget &&
        typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            <motion.div
              key="delete-confirm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[95] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
              onClick={() => setDeleteConfirmTarget(null)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="w-[280px] rounded-xl bg-discord-card border border-red-400/30 p-4"
              >
                <p className="text-sm font-semibold text-white mb-1">Delete permanently?</p>
                <p className="text-[11px] text-gray-400 mb-4">
                  {deleteConfirmTarget.kind === 'item'
                    ? `Delete ${deleteConfirmTarget.title}? This cannot be undone.`
                    : deleteConfirmTarget.kind === 'chest'
                      ? `Delete ${deleteConfirmTarget.title} x${deleteConfirmTarget.quantity}? This cannot be undone.`
                      : 'Discard this bag drop? You won\'t be able to open it.'}
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => { playClickSound(); setDeleteConfirmTarget(null) }} className="flex-1 py-2 rounded-lg border border-white/20 text-gray-300 text-sm font-semibold hover:bg-white/5">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      playClickSound()
                      runDeleteAction(deleteConfirmTarget)
                      setDeleteConfirmTarget(null)
                      setSelectedSlotId(null)
                    }}
                    className="flex-1 py-2 rounded-lg border border-red-400/40 bg-red-400/20 text-red-300 text-sm font-semibold hover:bg-red-400/30"
                  >
                    Delete
                  </button>
                </div>
              </motion.div>
            </motion.div>
          </AnimatePresence>,
          document.body,
        )}
      <ChestOpenModal
        open={Boolean(openChestModal)}
        chestType={openChestModal?.chestType ?? null}
        item={openChestModal ? (LOOT_ITEMS.find((x) => x.id === openChestModal.itemId) ?? null) : null}
        goldDropped={openChestModal?.goldDropped}
        bonusMaterials={openChestModal?.bonusMaterials}
        onClose={() => setOpenChestModal(null)}
      />

    </>
  )
}
