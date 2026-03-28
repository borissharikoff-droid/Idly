import { useState, useEffect } from 'react'
import { useAlertStore } from '../stores/alertStore'
import { useNavBadgeStore } from '../stores/navBadgeStore'
import { useArenaStore } from '../stores/arenaStore'
import { useCraftingStore } from '../stores/craftingStore'
import { useCookingStore } from '../stores/cookingStore'
import { useFarmStore } from '../stores/farmStore'
import { useBountyStore } from '../stores/bountyStore'
import { useWeeklyStore } from '../stores/weeklyStore'

export const BADGE_URGENT = 'bg-red-500'
export const BADGE_READY = 'bg-lime-500'

export function useBadges() {
  const { queue, currentAlert } = useAlertStore()
  const { incomingRequestsCount, unreadMessagesCount, marketplaceSaleCount, unreadGroupsCount } = useNavBadgeStore()
  const isArenaBattleActive = useArenaStore((s) => !!s.activeBattle)
  const claimableBounties = useBountyStore((s) => s.bounties.filter((b) => !b.claimed && b.progress >= b.targetCount).length)
  const claimableWeekly = useWeeklyStore((s) => s.bounties.filter((b) => !b.claimed && b.progress >= b.targetCount).length)
  const isCraftingActive = useCraftingStore((s) => !!s.activeJob)
  const isCookingActive = useCookingStore((s) => !!s.activeJob)
  const planted = useFarmStore((s) => s.planted)

  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000)
    return () => clearInterval(id)
  }, [])
  void tick

  const now = Date.now()
  const badgeFarm = Object.values(planted).filter(
    (s) => !!s && (now - s.plantedAt) / 1000 >= s.growTimeSeconds,
  ).length

  const profileUnclaimed = (() => {
    try {
      const unlocked = JSON.parse(localStorage.getItem('grindly_unlocked_achievements') || '[]') as string[]
      const claimed = JSON.parse(localStorage.getItem('grindly_claimed_achievements') || '[]') as string[]
      const claimedSet = new Set(claimed)
      return unlocked.filter((id) => !claimedSet.has(id)).length
    } catch { return 0 }
  })()

  const hasUnclaimedLoot = !!(currentAlert && !currentAlert.claimed)

  return {
    badgeHome: (currentAlert && !currentAlert.claimed ? 1 : 0) + queue.length,
    badgeFriends: incomingRequestsCount + unreadMessagesCount + unreadGroupsCount,
    badgeFarm,
    badgeMarketplace: marketplaceSaleCount,
    badgeProfile: claimableBounties + claimableWeekly,
    badgeProfileOrange: profileUnclaimed,
    isArenaBattleActive,
    isCraftingActive,
    isCookingActive,
    isHomeLootBadge: hasUnclaimedLoot,
    isFriendsUrgent: incomingRequestsCount > 0 || unreadMessagesCount > 0 || unreadGroupsCount > 0,
  }
}
