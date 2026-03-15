import type { TabId } from '../../App'
import type { ReactNode } from 'react'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { playTabSound, playClickSound } from '../../lib/sounds'
import { track } from '../../lib/analytics'
import { useAlertStore } from '../../stores/alertStore'
import { useNavBadgeStore } from '../../stores/navBadgeStore'
import { useArenaStore } from '../../stores/arenaStore'
import { useCraftingStore } from '../../stores/craftingStore'
import { useCookingStore } from '../../stores/cookingStore'
import { useFarmStore } from '../../stores/farmStore'
import { useBountyStore } from '../../stores/bountyStore'
import { useWeeklyStore } from '../../stores/weeklyStore'
import { MOTION } from '../../lib/motion'
import { getUIIcons } from '../../lib/itemConfig'
import { useAdminConfigStore } from '../../stores/adminConfigStore'
import { Home, Zap, Users, BarChart3, MoreHorizontal, Package, ShoppingCart, Sword, Sprout, Hammer, User, Settings } from '../../lib/icons'

// Lucide icon components for each tab (used when no admin override is set)
const TAB_LUCIDE_ICONS: Partial<Record<TabId, ReactNode>> = {
  home:        <Home className="w-[18px] h-[18px]" />,
  skills:      <Zap className="w-[18px] h-[18px]" />,
  friends:     <Users className="w-[18px] h-[18px]" />,
  stats:       <BarChart3 className="w-[18px] h-[18px]" />,
  inventory:   <Package className="w-[18px] h-[18px]" />,
  marketplace: <ShoppingCart className="w-[18px] h-[18px]" />,
  arena:       <Sword className="w-[18px] h-[18px]" />,
  farm:        <Sprout className="w-[18px] h-[18px]" />,
  craft:       <Hammer className="w-[18px] h-[18px]" />,
  cooking:     <span className="text-[15px] leading-none">🍳</span>,
  profile:     <User className="w-[18px] h-[18px]" />,
  settings:    <Settings className="w-[18px] h-[18px]" />,
}

const PRIMARY_TABS_DEFAULT: { id: TabId; icon: string }[] = [
  { id: 'home',    icon: '⏱' },
  { id: 'skills',  icon: '⚡' },
  { id: 'friends', icon: '👥' },
  { id: 'stats',   icon: '📊' },
]

const SECONDARY_TABS_DEFAULT: { id: TabId; icon: string; label: string }[] = [
  { id: 'inventory',   icon: '🎒', label: 'Inventory' },
  { id: 'marketplace', icon: '🛒', label: 'Market'    },
  { id: 'arena',       icon: '⚔️', label: 'Arena'     },
  { id: 'farm',        icon: '🌱', label: 'Farm'      },
  { id: 'craft',       icon: '⚒️', label: 'Craft'     },
  { id: 'cooking',     icon: '🍳', label: 'Cook'      },
  { id: 'profile',     icon: '👤', label: 'Profile'   },
  { id: 'settings',    icon: '⚙',  label: 'Settings'  },
]

const SECONDARY_IDS = new Set<TabId>(SECONDARY_TABS_DEFAULT.map((t) => t.id))

/** Render icon — admin overrides (data URI / URL) take priority; otherwise use Lucide icon */
function NavIcon({ tabId, adminIcon, className }: { tabId: TabId; adminIcon: string; className?: string }) {
  if (adminIcon.startsWith('data:') || adminIcon.startsWith('http')) {
    return <img src={adminIcon} alt="" className={className ?? 'w-[18px] h-[18px] object-contain'} draggable={false} />
  }
  return <>{TAB_LUCIDE_ICONS[tabId]}</>
}

interface BottomNavProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
}

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  useAdminConfigStore((s) => s.rev) // re-render on config change
  const uiIcons = getUIIcons()
  const PRIMARY_TABS = PRIMARY_TABS_DEFAULT.map((t) => ({ ...t, icon: uiIcons.navTabs?.[t.id] || t.icon }))
  const SECONDARY_TABS = SECONDARY_TABS_DEFAULT.map((t) => ({ ...t, icon: uiIcons.navSecondaryTabs?.[t.id] || t.icon }))
  const [moreOpen, setMoreOpen] = useState(false)
  const { queue, currentAlert } = useAlertStore()
  const { incomingRequestsCount, unreadMessagesCount, marketplaceSaleCount } = useNavBadgeStore()
  const isArenaBattleActive = useArenaStore((s) => !!s.activeBattle)
  const claimableBounties = useBountyStore((s) => s.bounties.filter((b) => !b.claimed && b.progress >= b.targetCount).length)
  const claimableWeekly = useWeeklyStore((s) => s.bounties.filter((b) => !b.claimed && b.progress >= b.targetCount).length)
  const isCraftingActive = useCraftingStore((s) => !!s.activeJob)
  const isCookingActive = useCookingStore((s) => !!s.activeJob)
  const planted = useFarmStore((s) => s.planted)
  const badgeHome = (currentAlert && !currentAlert.claimed ? 1 : 0) + queue.length
  const badgeFriends = incomingRequestsCount + unreadMessagesCount
  const hasUnclaimedLoot = currentAlert && !currentAlert.claimed

  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000)
    return () => clearInterval(id)
  }, [])
  const now = Date.now() + tick * 0
  const badgeFarm = Object.values(planted).filter(
    (s) => !!s && (now - s.plantedAt) / 1000 >= s.growTimeSeconds,
  ).length

  // Unclaimed achievement rewards (read from localStorage, recheck on tick)
  const profileUnclaimed = (() => {
    try {
      const unlocked = JSON.parse(localStorage.getItem('grindly_unlocked_achievements') || '[]') as string[]
      const claimed = JSON.parse(localStorage.getItem('grindly_claimed_achievements') || '[]') as string[]
      const claimedSet = new Set(claimed)
      return unlocked.filter((id) => !claimedSet.has(id)).length
    } catch { return 0 }
  })()
  void tick // re-read on tick

  const secondaryIsActive = SECONDARY_IDS.has(activeTab)
  const secondaryHasBadge = badgeFarm > 0 || isArenaBattleActive || isCraftingActive || isCookingActive || marketplaceSaleCount > 0 || profileUnclaimed > 0 || claimableBounties > 0 || claimableWeekly > 0

  const navigate = (id: TabId) => {
    playTabSound()
    track('tab_click', { tab: id })
    onTabChange(id)
    setMoreOpen(false)
  }

  return (
    <>
      {/* ── More popup ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {moreOpen && (
          <>
            {/* Invisible backdrop to close on outside click */}
            <motion.div
              className="fixed inset-0 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              onClick={() => setMoreOpen(false)}
            />

            <motion.div
              className="fixed bottom-[68px] left-1/2 z-50 w-[228px] -translate-x-1/2 rounded-2xl border border-white/[0.10] bg-[#1a1a2a] shadow-2xl"
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: MOTION.duration.fast, ease: MOTION.easingSoft }}
            >
              <div className="p-1.5 grid grid-cols-3 gap-0.5">
                {SECONDARY_TABS.map((tab) => {
                  const isActive = activeTab === tab.id
                  const tabBadge = tab.id === 'farm' ? badgeFarm : tab.id === 'marketplace' ? marketplaceSaleCount : tab.id === 'profile' ? claimableBounties + claimableWeekly : 0
                  const tabPulse = (tab.id === 'arena' && isArenaBattleActive) || (tab.id === 'craft' && isCraftingActive) || (tab.id === 'cooking' && isCookingActive)
                  const tabOrangeDot = tab.id === 'profile' && profileUnclaimed > 0 && tabBadge === 0
                  return (
                    <motion.button
                      key={tab.id}
                      type="button"
                      whileTap={{ scale: 0.94 }}
                      onClick={() => navigate(tab.id)}
                      className={`relative flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl transition-colors ${
                        isActive
                          ? 'bg-cyber-neon/15 text-cyber-neon ring-1 ring-inset ring-cyber-neon/20'
                          : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.06]'
                      }`}
                    >
                      <span className="text-lg leading-none"><NavIcon tabId={tab.id} adminIcon={tab.icon} /></span>
                      <span className="text-[9px] font-mono leading-none tracking-wide">{tab.label}</span>
                      {tabBadge > 0 && (
                        <span className="absolute top-1 right-1.5 min-w-[13px] h-[13px] px-0.5 flex items-center justify-center rounded-full text-[8px] font-bold text-white bg-lime-500">
                          {tabBadge}
                        </span>
                      )}
                      {tabPulse && (
                        <span className="absolute top-1.5 right-2 w-2 h-2 rounded-full bg-cyber-neon animate-pulse" />
                      )}
                      {tabOrangeDot && (
                        <span className="absolute top-1 right-1.5 min-w-[13px] h-[13px] px-0.5 flex items-center justify-center rounded-full text-[8px] font-bold text-white bg-orange-500">
                          {profileUnclaimed}
                        </span>
                      )}
                    </motion.button>
                  )
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Bottom nav ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex justify-center pb-3 pt-1">
        <nav className="flex items-center gap-3 rounded-full bg-discord-nav border border-white/[0.07] px-3 py-1.5 shadow-nav">
          {/* Primary tabs */}
          {PRIMARY_TABS.map((tab) => {
            const active = activeTab === tab.id
            const badgeCount =
              tab.id === 'home'    ? badgeHome
              : tab.id === 'friends' ? badgeFriends
              : 0
            const isLootBadge = tab.id === 'home' && badgeCount > 0 && hasUnclaimedLoot
            return (
              <motion.button
                key={tab.id}
                whileTap={MOTION.interactive.tap}
                onClick={() => navigate(tab.id)}
                className={`relative w-9 h-9 flex items-center justify-center rounded-full text-sm transition-all duration-200 ${
                  active
                    ? 'bg-cyber-neon/15 text-cyber-neon shadow-glow-sm'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-white/5 hover:-translate-y-[1px]'
                }`}
              >
                <span className="grindly-tab-icon" aria-hidden><NavIcon tabId={tab.id} adminIcon={tab.icon} /></span>
                {badgeCount > 0 && (
                  <span
                    className={`absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-1 flex items-center justify-center rounded-full text-[10px] font-bold text-white border-2 border-discord-nav ${
                      isLootBadge ? 'bg-orange-500' : 'bg-discord-red'
                    }`}
                    aria-label={`${badgeCount} new`}
                  >
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </motion.button>
            )
          })}

          {/* ··· More button */}
          <motion.button
            whileTap={MOTION.interactive.tap}
            onClick={() => { playClickSound(); setMoreOpen((o) => !o) }}
            className={`relative w-9 h-9 flex items-center justify-center rounded-full transition-all duration-200 ${
              moreOpen || secondaryIsActive
                ? 'bg-cyber-neon/15 text-cyber-neon shadow-glow-sm'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/5 hover:-translate-y-[1px]'
            }`}
            aria-label="More"
            aria-expanded={moreOpen}
          >
            <MoreHorizontal className="w-[18px] h-[18px]" aria-hidden />
            {/* Badge dot when secondary tabs have activity */}
            {secondaryHasBadge && !moreOpen && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-discord-nav bg-lime-500" />
            )}
          </motion.button>
        </nav>
      </div>
    </>
  )
}
