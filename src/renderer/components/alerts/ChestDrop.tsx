import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CHEST_DEFS, LOOT_ITEMS, getRarityTheme, type BonusMaterial, type ChestType } from '../../lib/loot'
import { useChestDropStore } from '../../stores/chestDropStore'
import { ensureInventoryHydrated, useInventoryStore } from '../../stores/inventoryStore'
import { useNotificationStore } from '../../stores/notificationStore'
import { ChestOpenModal } from '../animations/ChestOpenModal'
import { MOTION } from '../../lib/motion'
import { playClickSound } from '../../lib/sounds'

const AUTO_CLOSE_MS = 10_000

export function ChestDrop() {
  const queue = useChestDropStore((s) => s.queue)
  const clearByRewardId = useChestDropStore((s) => s.clearByRewardId)
  const claimPendingReward = useInventoryStore((s) => s.claimPendingReward)
  const openChestAndGrantItem = useInventoryStore((s) => s.openChestAndGrantItem)
  const [progress, setProgress] = useState(100)
  const [opened, setOpened] = useState<{ chestType: ChestType; itemId: string | null; goldDropped?: number; bonusMaterials?: BonusMaterial[] } | null>(null)

  const current = queue[0] ?? null
  const chest = current ? CHEST_DEFS[current.chestType] : null

  useEffect(() => {
    ensureInventoryHydrated()
  }, [])

  useEffect(() => {
    if (!current) return
    setProgress(100)
    const started = Date.now()
    const timer = setInterval(() => {
      const elapsed = Date.now() - started
      const left = Math.max(0, 100 - (elapsed / AUTO_CLOSE_MS) * 100)
      setProgress(left)
      if (left <= 0) {
        clearInterval(timer)
        const liveTop = useChestDropStore.getState().queue[0]
        if (liveTop && liveTop.id === current.id) {
          const liveChest = CHEST_DEFS[liveTop.chestType]
          if (liveChest) {
            useNotificationStore.getState().push({
              type: 'progression',
              icon: liveChest.icon,
              title: `Missed bag: ${liveChest.name}`,
              body: 'Tap Open to claim it now.',
              chestReward: { rewardId: liveTop.rewardId, chestType: liveTop.chestType, chestImage: liveChest.image, chestRarity: liveChest.rarity },
            })
          }
          useChestDropStore.getState().shift()
        }
      }
    }, 80)
    return () => clearInterval(timer)
  }, [current])

  const handleLater = () => {
    playClickSound()
    if (!current) return
    const liveChest = CHEST_DEFS[current.chestType]
    if (liveChest) {
      useNotificationStore.getState().push({
        type: 'progression',
        icon: liveChest.icon,
        title: `Saved: ${liveChest.name}`,
        body: 'Tap Open to claim it from your inbox.',
        chestReward: { rewardId: current.rewardId, chestType: current.chestType, chestImage: liveChest.image, chestRarity: liveChest.rarity },
      })
    }
    clearByRewardId(current.rewardId)
  }

  const handleOpen = () => {
    playClickSound()
    if (!current) return
    claimPendingReward(current.rewardId)
    const result = openChestAndGrantItem(current.chestType, { source: 'skill_grind', focusCategory: 'coding' })
    if (result) setOpened({ chestType: current.chestType, itemId: result.itemId, goldDropped: result.goldDropped, bonusMaterials: result.bonusMaterials })
    clearByRewardId(current.rewardId)
  }

  const openedItem = useMemo(
    () => (opened ? (LOOT_ITEMS.find((x) => x.id === opened.itemId) ?? null) : null),
    [opened],
  )

  return (
    <>
      <AnimatePresence>
        {current && chest && (() => {
          const theme = getRarityTheme(chest.rarity)
          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[115] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            >
              <motion.div
                initial={{ scale: 0.86, y: 16, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.92, y: 10, opacity: 0 }}
                transition={MOTION.spring.pop}
                className="w-[300px] rounded-card bg-surface-2 overflow-hidden"
                style={{ border: `1px solid ${theme.border}`, boxShadow: `0 0 28px ${theme.glow}40` }}
              >
                <div className="p-5 text-center">
                  <motion.div
                    animate={{ y: [0, -5, 0] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                    className="w-20 h-20 mx-auto rounded flex items-center justify-center relative"
                    style={{ border: `1px solid ${theme.border}`, background: `radial-gradient(circle at 50% 40%, ${theme.glow}30 0%, rgba(8,8,16,0.9) 70%)`, boxShadow: `0 0 18px ${theme.glow}44` }}
                  >
                    {chest.image ? (
                      <img
                        src={chest.image}
                        alt=""
                        className="w-14 h-14 object-contain"
                        style={{ imageRendering: 'pixelated' }}
                        draggable={false}
                      />
                    ) : (
                      <span className="text-4xl">{chest.icon}</span>
                    )}
                  </motion.div>
                  <p
                    className="text-micro font-mono uppercase tracking-wider mt-3"
                    style={{ color: theme.color }}
                  >
                    {chest.rarity === 'common' ? 'Bag dropped' : chest.rarity === 'rare' ? 'Rare drop!' : chest.rarity === 'epic' ? 'Epic drop!' : 'Legendary drop!'}
                  </p>
                  <p className="text-white font-semibold text-base mt-0.5">{chest.name}</p>
                  <p className="text-caption text-gray-500 mt-1">Dropped during your grind.</p>
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={handleOpen}
                      className="flex-1 py-2 rounded text-sm font-semibold transition-colors"
                      style={{ border: `1px solid ${theme.border}`, background: `${theme.color}22`, color: theme.color }}
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      onClick={handleLater}
                      className="flex-1 py-2 rounded border border-white/15 text-gray-400 text-sm font-semibold hover:bg-white/5 transition-colors"
                    >
                      Later
                    </button>
                  </div>
                </div>
                <div className="h-0.5 bg-surface-0/60">
                  <div
                    className="h-full transition-[width] duration-100"
                    style={{ width: `${progress}%`, backgroundColor: `${theme.color}99` }}
                  />
                </div>
              </motion.div>
            </motion.div>
          )
        })()}
      </AnimatePresence>

      <ChestOpenModal
        open={Boolean(opened)}
        chestType={opened?.chestType ?? null}
        item={openedItem}
        goldDropped={opened?.goldDropped}
        bonusMaterials={opened?.bonusMaterials}
        onClose={() => setOpened(null)}
      />
    </>
  )
}
