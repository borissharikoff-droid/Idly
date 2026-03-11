import { useEffect, useRef } from 'react'
import { useArenaStore, ITEM_LOSS_CHANCE } from '../stores/arenaStore'
import { useInventoryStore } from '../stores/inventoryStore'
import { useToastStore } from '../stores/toastStore'
import { useNotificationStore } from '../stores/notificationStore'
import { LOOT_ITEMS, type ChestType } from '../lib/loot'
import { BOSS_WARRIOR_XP, ZONES, canAffordEntry, type FoodLoadout } from '../lib/combat'
import type { TabId } from '../App'

function formatShort(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0'
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return Math.floor(n).toString()
}

/**
 * Auto-farm accumulator — mirrors the one in ArenaPage but lives here so
 * auto-farm keeps running even when the user switches tabs.
 */
interface AutoAcc {
  zoneId: string
  remaining: number
  runsCompleted: number
  totalGold: number
  totalWarriorXP: number
  materials: Record<string, { name: string; icon: string; qty: number }>
  chests: ChestType[]
  chestResults: { chestType: ChestType; itemId: string | null; goldDropped: number; bonusMaterials: { itemId: string; qty: number }[] }[]
  failed: boolean
  failedAt?: string
  lostItem?: { name: string; icon: string } | null
  passesUsed: number
  foodLoadout?: FoodLoadout
}

let autoAcc: AutoAcc | null = null

/** Read/write the shared auto accumulator (used by ArenaPage summary modal). */
export function getAutoAcc(): AutoAcc | null { return autoAcc }
export function setAutoAcc(v: AutoAcc | null) { autoAcc = v }

/** Runs battle tick and handles completion (toast+bell when off Arena, auto-farm chaining). */
export function useArenaBattleTick(activeTab: TabId) {
  const activeBattle = useArenaStore((s) => s.activeBattle)
  const getBattleState = useArenaStore((s) => s.getBattleState)
  const endBattleWithoutGold = useArenaStore((s) => s.endBattleWithoutGold)
  const pushToast = useToastStore((s) => s.push)
  const pushNotification = useNotificationStore((s) => s.push)

  const activeTabRef = useRef(activeTab)
  useEffect(() => { activeTabRef.current = activeTab }, [activeTab])

  const completedRef = useRef(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!activeBattle) {
      completedRef.current = false
      return
    }

    const tick = () => {
      const state = getBattleState()
      if (!state?.isComplete || completedRef.current) return

      const isAuto = useArenaStore.getState().isAutoRunning
      // When on arena tab and NOT auto-running, ArenaPage handles resolution
      if (activeTabRef.current === 'arena' && !isAuto) return

      const bossName = activeBattle.bossSnapshot.name

      if (activeBattle.isMob) {
        completedRef.current = true
        const victory = state.victory ?? false
        timeoutRef.current = setTimeout(() => {
          const { goldLost, lostItem, materialDrop: matDrop, warriorXP } = useArenaStore.getState().endBattle()
          if (!victory) {
            if (isAuto && autoAcc) {
              // Auto-farm: stop on mob death
              autoAcc.failed = true
              autoAcc.failedAt = bossName
              autoAcc.lostItem = lostItem
              finishAutoRun()
            }
            const lossChancePct = Math.round(ITEM_LOSS_CHANCE * 100)
            const bodyParts: string[] = []
            if (goldLost > 0) bodyParts.push(`-${formatShort(goldLost)} 🪙`)
            if (lostItem) bodyParts.push(`Lost ${lostItem.icon} ${lostItem.name} (${lossChancePct}%)`)
            else bodyParts.push(`Gear survived (${100 - lossChancePct}% safe)`)
            const notifId = pushNotification({
              type: 'arena_result',
              icon: '💀',
              title: `Died in dungeon vs ${bossName}`,
              body: bodyParts.join(' · ') || 'Dungeon failed',
              arenaResult: { victory: false, gold: 0, bossName },
            })
            if (notifId) {
              pushToast({ kind: 'arena_boss', victory: false, bossName, gold: 0, notificationId: notifId })
            }
          } else {
            // Mob victory — advance dungeon
            // endBattle already granted gold/materials/XP and cleared activeBattle
            // but kept activeDungeon alive so advanceDungeon can proceed.
            if (isAuto && autoAcc) {
              autoAcc.totalWarriorXP += warriorXP
              // materialDrop already added to inventory by endBattle; track for summary
              if (matDrop) {
                if (autoAcc.materials[matDrop.id]) {
                  autoAcc.materials[matDrop.id].qty += matDrop.qty
                } else {
                  autoAcc.materials[matDrop.id] = { name: matDrop.name, icon: matDrop.icon, qty: matDrop.qty }
                }
              }
            }
            // Use actual elapsed time (dynamic damage means formula-based duration is inaccurate)
            const fightEndTime = Date.now()
            completedRef.current = false
            useArenaStore.getState().advanceDungeon(fightEndTime)
          }
        }, isAuto ? 100 : 300)
        return
      }

      // Boss battle
      completedRef.current = true
      const victory = state.victory ?? false

      timeoutRef.current = setTimeout(() => {
        if (isAuto && autoAcc) {
          // Auto-farm boss resolution
          const { goldLost, chest, lostItem, materialDrop, dungeonGold, warriorXP } = useArenaStore.getState().endBattle()
          if (victory) {
            autoAcc.runsCompleted++
            autoAcc.totalGold += dungeonGold
            autoAcc.totalWarriorXP += warriorXP
            if (materialDrop) {
              if (autoAcc.materials[materialDrop.id]) {
                autoAcc.materials[materialDrop.id].qty += materialDrop.qty
              } else {
                autoAcc.materials[materialDrop.id] = { name: materialDrop.name, icon: materialDrop.icon, qty: materialDrop.qty }
              }
            }
            if (chest) {
              const inv = useInventoryStore.getState()
              const pending = inv.pendingRewards.find((r) => !r.claimed && r.chestType === chest.type)
              if (pending) inv.claimPendingReward(pending.id)
              const opened = inv.openChestAndGrantItem(chest.type as ChestType, { source: 'session_complete', focusCategory: null })
              autoAcc.chests.push(chest.type as ChestType)
              if (opened) {
                if (opened.goldDropped) autoAcc.totalGold += opened.goldDropped
                autoAcc.chestResults.push({ chestType: chest.type as ChestType, itemId: opened.itemId, goldDropped: opened.goldDropped, bonusMaterials: opened.bonusMaterials })
              }
            }
            // Chain next run
            if (autoAcc.remaining > 0) {
              const inv = useInventoryStore.getState()
              const passes = inv.items['dungeon_pass'] ?? 0
              const zone = ZONES.find((z) => z.id === autoAcc!.zoneId)
              if (passes > 0 && zone && canAffordEntry(zone, inv.items)) {
                inv.deleteItem('dungeon_pass', 1)
                autoAcc.remaining--
                autoAcc.passesUsed++
                completedRef.current = false
                const chainFood = autoAcc!.foodLoadout
                setTimeout(() => useArenaStore.getState().startDungeon(autoAcc!.zoneId, null, chainFood), 400)
              } else {
                finishAutoRun()
              }
            } else {
              finishAutoRun()
            }
          } else {
            // Boss defeat
            autoAcc.failed = true
            autoAcc.failedAt = bossName
            autoAcc.lostItem = lostItem
            finishAutoRun()
          }
        } else {
          // Non-auto boss resolution (off-tab notification)
          const { goldLost, chest, lostItem: bossLostItem } = endBattleWithoutGold()
          const bossDef = activeBattle.bossSnapshot as { materialDropId?: string; materialDropQty?: number; id: string }
          let materialDrop: { id: string; name: string; icon: string; qty: number } | null = null
          if (victory && bossDef.materialDropId) {
            const matItem = LOOT_ITEMS.find((x) => x.id === bossDef.materialDropId)
            if (matItem) materialDrop = { id: matItem.id, name: matItem.name, icon: matItem.icon, qty: bossDef.materialDropQty ?? 1 }
          }
          const warriorXP = BOSS_WARRIOR_XP[activeBattle.bossSnapshot.id] ?? 0
          const lossChancePct = Math.round(ITEM_LOSS_CHANCE * 100)
          const notifId = pushNotification({
            type: 'arena_result',
            icon: victory ? '🏆' : '💀',
            title: victory ? `You killed ${bossName}!` : `You died vs ${bossName}`,
            body: victory
              ? chest ? `${chest.icon} ${chest.name} — check Inventory` : 'Boss slain!'
              : (() => {
                  const parts: string[] = []
                  if (goldLost > 0) parts.push(`-${formatShort(goldLost)} 🪙`)
                  if (bossLostItem) parts.push(`Lost ${bossLostItem.icon} ${bossLostItem.name} (${lossChancePct}%)`)
                  else parts.push(`Gear survived (${100 - lossChancePct}% safe)`)
                  return parts.join(' · ')
                })(),
            arenaResult: { victory, gold: 0, bossName, chest, materialDrop, warriorXP },
          })
          if (notifId) {
            pushToast({ kind: 'arena_boss', victory, bossName, gold: 0, notificationId: notifId, chest, materialDrop, warriorXP })
          }
        }
      }, isAuto ? 200 : 1200)
    }

    tick()
    const interval = setInterval(tick, 500)
    return () => {
      clearInterval(interval)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [activeBattle, getBattleState, endBattleWithoutGold, pushToast, pushNotification])
}

function finishAutoRun() {
  if (!autoAcc) return
  // Store result in localStorage so ArenaPage can pick it up and show the summary modal
  localStorage.setItem('grindly_auto_result', JSON.stringify({
    runsCompleted: autoAcc.runsCompleted,
    totalGold: Math.max(0, autoAcc.totalGold),
    totalWarriorXP: autoAcc.totalWarriorXP,
    materials: Object.entries(autoAcc.materials).map(([id, m]) => ({ id, ...m })),
    chests: autoAcc.chests,
    chestResults: autoAcc.chestResults,
    failed: autoAcc.failed,
    failedAt: autoAcc.failedAt,
    lostItem: autoAcc.lostItem,
    passesUsed: autoAcc.passesUsed,
  }))
  autoAcc = null
  useArenaStore.getState().setAutoRunning(false)
  localStorage.removeItem('grindly_auto_acc')
}
