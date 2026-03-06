import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CHEST_DEFS, LOOT_ITEMS, type BonusMaterial, type ChestType } from '../../lib/loot'
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
  const [opened, setOpened] = useState<{ chestType: ChestType; itemId: string; goldDropped?: number; bonusMaterials?: BonusMaterial[] } | null>(null)

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
              chestReward: { rewardId: liveTop.rewardId, chestType: liveTop.chestType },
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
    if (current) clearByRewardId(current.rewardId)
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
        {current && chest && (
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
              className="w-[320px] rounded-2xl border border-cyber-neon/30 bg-discord-card overflow-hidden"
            >
              <div className="p-5 text-center">
                <div className="w-20 h-20 mx-auto rounded-xl border border-cyber-neon/30 bg-discord-darker/60 flex items-center justify-center">
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
                </div>
                <p className="text-[10px] text-cyber-neon font-mono uppercase tracking-wider mt-3">Loot drop</p>
                <p className="text-white font-semibold text-lg mt-1">{chest.name}</p>
                <p className="text-[11px] text-gray-400 mt-1">
                  A bag dropped during your grind session.
                </p>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={handleOpen}
                    className="flex-1 py-2 rounded-lg border border-cyber-neon/35 bg-cyber-neon/15 text-cyber-neon text-sm font-semibold hover:bg-cyber-neon/25 transition-colors"
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    onClick={handleLater}
                    className="flex-1 py-2 rounded-lg border border-white/20 text-gray-300 text-sm font-semibold hover:bg-white/5 transition-colors"
                  >
                    Ok, later
                  </button>
                </div>
              </div>
              <div className="h-1 bg-discord-darker/60">
                <div className="h-full bg-cyber-neon/70 transition-[width] duration-100" style={{ width: `${progress}%` }} />
              </div>
            </motion.div>
          </motion.div>
        )}
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
