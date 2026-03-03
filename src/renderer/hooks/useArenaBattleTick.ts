import { useEffect, useRef } from 'react'
import { useArenaStore } from '../stores/arenaStore'
import { useArenaToastStore } from '../stores/arenaToastStore'
import { useNotificationStore } from '../stores/notificationStore'
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
  const endBattle = useArenaStore((s) => s.endBattle)
  const endBattleWithoutGold = useArenaStore((s) => s.endBattleWithoutGold)
  const pushArenaToast = useArenaToastStore((s) => s.push)
  const pushNotification = useNotificationStore((s) => s.push)
  const setResultModal = useArenaStore((s) => s.setResultModal)

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

      completedRef.current = true
      const victory = state.victory ?? false
      const bossName = activeBattle.bossSnapshot.name

      timeoutRef.current = setTimeout(() => {
        if (activeTabRef.current === 'arena') {
          const { goldLost, chest } = endBattle()
          setResultModal({ victory, gold: 0, goldAlreadyAdded: true, bossName, goldLost, chest })
        } else {
          const { goldLost, chest } = endBattleWithoutGold()
          const notifId = pushNotification({
            type: 'arena_result',
            icon: victory ? '🏆' : '💀',
            title: victory ? `You killed ${bossName}!` : `You died vs ${bossName}`,
            body: victory
              ? chest ? `${chest.icon} ${chest.name} — check Inventory` : 'Boss slain!'
              : goldLost > 0 ? `-${formatShort(goldLost)} 🪙 lost on death` : '',
            arenaResult: { victory, gold: 0, bossName },
          })
          if (notifId) {
            pushArenaToast({ victory, bossName, gold: 0, notificationId: notifId })
          }
        }
      }, 1200)
    }

    tick()
    const interval = setInterval(tick, 1000)
    return () => {
      clearInterval(interval)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [activeBattle, getBattleState, endBattle, endBattleWithoutGold, pushArenaToast, pushNotification, setResultModal])
}
