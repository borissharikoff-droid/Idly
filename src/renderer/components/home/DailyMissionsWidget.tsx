import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { claimDailyActivity, getDailyActivities, type DailyActivityId } from '../../services/dailyActivityService'
import { useInventoryStore } from '../../stores/inventoryStore'
import { CHEST_DEFS, LOOT_ITEMS, type ChestType } from '../../lib/loot'
import { ChestOpenModal } from '../animations/ChestOpenModal'
import { playClickSound } from '../../lib/sounds'

function ChestVisual({ name, icon, image }: { name: string; icon: string; image?: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {image ? (
        <img
          src={image}
          alt={name}
          className="w-3.5 h-3.5 object-contain"
          style={{ imageRendering: 'pixelated' }}
          draggable={false}
        />
      ) : (
        <span>{icon}</span>
      )}
      <span>{name}</span>
    </span>
  )
}

export function DailyMissionsWidget() {
  const [tick, setTick] = useState(0)
  const [expanded, setExpanded] = useState(true)
  const [opened, setOpened] = useState<{ chestType: ChestType; itemId: string; goldDropped?: number; bonusMaterials?: import('../../lib/loot').BonusMaterial[] } | null>(null)
  const missions = useMemo(() => getDailyActivities(), [tick])
  const addChest = useInventoryStore((s) => s.addChest)
  const claimPendingReward = useInventoryStore((s) => s.claimPendingReward)
  const openChestAndGrantItem = useInventoryStore((s) => s.openChestAndGrantItem)
  const completedCount = missions.filter((m) => m.completed).length

  const handleClaim = (id: DailyActivityId) => {
    const chestType = claimDailyActivity(id)
    if (!chestType) return
    playClickSound()
    const rewardId = addChest(chestType, 'daily_activity', 100)
    claimPendingReward(rewardId)
    const result = openChestAndGrantItem(chestType, { source: 'daily_activity' })
    if (result?.itemId) setOpened({ chestType, itemId: result.itemId, goldDropped: result.goldDropped, bonusMaterials: result.bonusMaterials })
    setTick((v) => v + 1)
  }

  const openedItem = useMemo(
    () => (opened ? LOOT_ITEMS.find((x) => x.id === opened.itemId) ?? null : null),
    [opened],
  )

  return (
    <>
    <div className="w-full rounded-card bg-surface-2/70 border border-white/10 p-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-micro uppercase tracking-wider text-gray-500 font-mono">Daily quests</p>
        <div className="flex items-center gap-2">
          <p className="text-micro text-gray-600 font-mono">{completedCount}/{missions.length}</p>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-micro px-1.5 py-0.5 rounded border border-white/15 text-gray-400 hover:text-white hover:border-white/25"
          >
            {expanded ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>
      {!expanded ? (
        <div className="rounded border border-white/10 bg-surface-1/45 px-2 py-1.5">
          <p className="text-micro text-gray-400">
            Daily rewards:{' '}
            {missions.map((mission) => {
              const chest = CHEST_DEFS[mission.rewardChest]
              return (
                <span key={mission.id} className="inline-block mr-2 text-micro text-gray-300">
                  <ChestVisual name={chest.name} icon={chest.icon} image={chest.image} />
                </span>
              )
            })}
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {missions.map((mission) => {
            const pct = Math.min(100, mission.target > 0 ? (mission.progress / mission.target) * 100 : 0)
            const chest = CHEST_DEFS[mission.rewardChest]
            return (
              <motion.div key={mission.id} layout className="rounded border border-white/10 bg-surface-1/45 p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-caption text-white font-medium truncate">{mission.title}</p>
                    <p className="text-micro text-gray-500 truncate">{mission.description}</p>
                    <p className="text-micro text-gray-400 mt-0.5">Reward: <ChestVisual name={chest.name} icon={chest.icon} image={chest.image} /></p>
                  </div>
                  {mission.claimed ? (
                    <span className="text-micro px-2 py-1 rounded border border-accent/30 bg-accent/10 text-accent font-mono">Claimed</span>
                  ) : mission.completed ? (
                    <button
                      type="button"
                      onClick={() => handleClaim(mission.id)}
                      className="text-micro px-2 py-1 rounded border border-accent/40 bg-accent/15 text-accent font-semibold hover:bg-accent/25 transition-colors"
                    >
                      <span className="inline-flex items-center gap-1">
                        <span>Claim</span>
                        {chest.image ? (
                          <img
                            src={chest.image}
                            alt={chest.name}
                            className="w-3.5 h-3.5 object-contain"
                            style={{ imageRendering: 'pixelated' }}
                            draggable={false}
                          />
                        ) : (
                          <span>{chest.icon}</span>
                        )}
                      </span>
                    </button>
                  ) : (
                    <span className="text-micro text-gray-500 font-mono">{Math.floor(mission.progress)}/{mission.target}</span>
                  )}
                </div>
                <div className="mt-2 h-1 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full rounded-full bg-accent/70" style={{ width: `${pct}%` }} />
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
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
