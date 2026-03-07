import { useEffect, useRef } from 'react'
import { useArenaStore } from '../stores/arenaStore'
import { useToastStore } from '../stores/toastStore'
import { useNotificationStore } from '../stores/notificationStore'
import { LOOT_ITEMS } from '../lib/loot'
import { BOSS_WARRIOR_XP } from '../lib/combat'
import type { TabId } from '../App'

function formatShort(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0'
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return Math.floor(n).toString()
}

/** Runs battle tick and handles completion (toast+bell when off Arena, modal when on Arena). */
export function useArenaBattleTick(activeTab: TabId) {
  const activeBattle = useArenaStore((s) => s.activeBattle)
  const getBattleState = useArenaStore((s) => s.getBattleState)
  const endBattleWithoutGold = useArenaStore((s) => s.endBattleWithoutGold)
  const pushToast = useToastStore((s) => s.push)
  const pushNotification = useNotificationStore((s) => s.push)

  // Track activeTab via ref so tab changes don't cancel the completion timeout
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
      // When on Arena tab, ArenaPage handles all battles (mobs + bosses) inline
      if (activeTabRef.current === 'arena') return
      // Mob battles in dungeons are always handled by ArenaPage
      if (activeBattle.isMob) return

      completedRef.current = true
      const victory = state.victory ?? false
      const bossName = activeBattle.bossSnapshot.name

      timeoutRef.current = setTimeout(() => {
        const { goldLost, chest } = endBattleWithoutGold()
        // Also grab material drop info from the boss def for the notification
        const bossDef = activeBattle.bossSnapshot as { materialDropId?: string; materialDropQty?: number; id: string }
        let materialDrop: { id: string; name: string; icon: string; qty: number } | null = null
        if (victory && bossDef.materialDropId) {
          const matItem = LOOT_ITEMS.find((x) => x.id === bossDef.materialDropId)
          if (matItem) materialDrop = { id: matItem.id, name: matItem.name, icon: matItem.icon, qty: bossDef.materialDropQty ?? 1 }
        }
        const warriorXP = BOSS_WARRIOR_XP[activeBattle.bossSnapshot.id] ?? 0
        const notifId = pushNotification({
          type: 'arena_result',
          icon: victory ? '🏆' : '💀',
          title: victory ? `You killed ${bossName}!` : `You died vs ${bossName}`,
          body: victory
            ? chest ? `${chest.icon} ${chest.name} — check Inventory` : 'Boss slain!'
            : goldLost > 0 ? `-${formatShort(goldLost)} 🪙 lost on death` : '',
          arenaResult: { victory, gold: 0, bossName, chest, materialDrop, warriorXP },
        })
        if (notifId) {
          pushToast({ kind: 'arena_boss', victory, bossName, gold: 0, notificationId: notifId, chest, materialDrop, warriorXP })
        }
      }, 1200)
    }

    tick()
    const interval = setInterval(tick, 1000)
    return () => {
      clearInterval(interval)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [activeBattle, getBattleState, endBattleWithoutGold, pushToast, pushNotification])
}
