import type { TabId } from '../../App'
import { playTabSound } from '../../lib/sounds'
import { useAlertStore } from '../../stores/alertStore'
import { useNavBadgeStore } from '../../stores/navBadgeStore'

const tabs: { id: TabId; icon: string }[] = [
  { id: 'home', icon: '⏱' },
  { id: 'skills', icon: '📊' },
  { id: 'stats', icon: '⚡' },
  { id: 'friends', icon: '👥' },
  { id: 'settings', icon: '⚙' },
]

interface BottomNavProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
}

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const { queue, currentAlert } = useAlertStore()
  const { incomingRequestsCount, unreadMessagesCount, unclaimedLootCount } = useNavBadgeStore()
  const badgeHome = (currentAlert && !currentAlert.claimed ? 1 : 0) + queue.length
  const badgeFriends = incomingRequestsCount + unreadMessagesCount
  const hasUnclaimedLoot = currentAlert && !currentAlert.claimed

  return (
    <div className="shrink-0 flex justify-center pb-3 pt-1">
      <nav className="flex items-center gap-4 rounded-full bg-[#1a1a2e] border border-white/[0.07] px-2.5 py-1.5">
        {tabs.map((tab) => {
          const active = activeTab === tab.id
          const badgeCount = tab.id === 'home' ? badgeHome : tab.id === 'friends' ? badgeFriends : tab.id === 'profile' ? unclaimedLootCount : 0
          const isLootBadge = (tab.id === 'home' && badgeCount > 0 && hasUnclaimedLoot) || (tab.id === 'profile' && unclaimedLootCount > 0)
          return (
            <button
              key={tab.id}
              onClick={() => {
                playTabSound()
                onTabChange(tab.id)
              }}
              className={`relative w-9 h-9 flex items-center justify-center rounded-full text-sm transition-all duration-150 active:scale-90 ${
                active
                  ? 'bg-cyber-neon/15 text-cyber-neon shadow-[0_0_8px_rgba(0,255,136,0.15)]'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              {tab.icon}
              {badgeCount > 0 && (
                <span
                  className={`absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-1 flex items-center justify-center rounded-full text-[10px] font-bold text-white border-2 border-[#1a1a2e] ${
                    isLootBadge ? 'bg-orange-500' : 'bg-discord-red'
                  }`}
                  aria-label={isLootBadge ? 'Unclaimed loot' : `${badgeCount} new`}
                >
                  {badgeCount > 99 ? '99+' : badgeCount}
                </span>
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
