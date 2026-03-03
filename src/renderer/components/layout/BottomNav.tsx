import type { TabId } from '../../App'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { playTabSound, playClickSound } from '../../lib/sounds'
import { track } from '../../lib/analytics'
import { useAlertStore } from '../../stores/alertStore'
import { useNavBadgeStore } from '../../stores/navBadgeStore'
import { useArenaStore } from '../../stores/arenaStore'
import { useFarmStore } from '../../stores/farmStore'
import { MOTION } from '../../lib/motion'

const PRIMARY_TABS: { id: TabId; icon: string }[] = [
  { id: 'home',    icon: '⏱' },
  { id: 'skills',  icon: '⚡' },
  { id: 'friends', icon: '👥' },
  { id: 'stats',   icon: '📊' },
]

const SECONDARY_TABS: { id: TabId; icon: string; label: string }[] = [
  { id: 'inventory',   icon: '🎒', label: 'Inventory' },
  { id: 'marketplace', icon: '🛒', label: 'Market'    },
  { id: 'arena',       icon: '⚔️', label: 'Arena'     },
  { id: 'farm',        icon: '🌱', label: 'Farm'      },
  { id: 'profile',     icon: '👤', label: 'Profile'   },
  { id: 'settings',    icon: '⚙',  label: 'Settings'  },
]

const SECONDARY_IDS = new Set<TabId>(SECONDARY_TABS.map((t) => t.id))

interface BottomNavProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
}

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const [moreOpen, setMoreOpen] = useState(false)
  const { queue, currentAlert } = useAlertStore()
  const { incomingRequestsCount, unreadMessagesCount, marketplaceSaleCount } = useNavBadgeStore()
  const isArenaBattleActive = useArenaStore((s) => !!s.activeBattle)
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

  const secondaryIsActive = SECONDARY_IDS.has(activeTab)
  const secondaryHasBadge = badgeFarm > 0 || isArenaBattleActive || marketplaceSaleCount > 0

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
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="p-1.5 grid grid-cols-3 gap-0.5">
                {SECONDARY_TABS.map((tab) => {
                  const isActive = activeTab === tab.id
                  const tabBadge = tab.id === 'farm' ? badgeFarm : tab.id === 'marketplace' ? marketplaceSaleCount : 0
                  const tabPulse = tab.id === 'arena' && isArenaBattleActive
                  return (
                    <motion.button
                      key={tab.id}
                      type="button"
                      whileTap={{ scale: 0.94 }}
                      onClick={() => navigate(tab.id)}
                      className={`relative flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl transition-colors ${
                        isActive
                          ? 'bg-cyber-neon/12 text-cyber-neon'
                          : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.06]'
                      }`}
                    >
                      <span className="text-lg leading-none">{tab.icon}</span>
                      <span className="text-[9px] font-mono leading-none tracking-wide">{tab.label}</span>
                      {tabBadge > 0 && (
                        <span className="absolute top-1 right-1.5 min-w-[13px] h-[13px] px-0.5 flex items-center justify-center rounded-full text-[8px] font-bold text-white bg-lime-500">
                          {tabBadge}
                        </span>
                      )}
                      {tabPulse && (
                        <span className="absolute top-1.5 right-2 w-2 h-2 rounded-full bg-cyber-neon animate-pulse" />
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
                <span className="grindly-tab-icon" aria-hidden>{tab.icon}</span>
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
            {/* Three-dot icon */}
            <svg width="16" height="4" viewBox="0 0 16 4" fill="currentColor" aria-hidden>
              <circle cx="2"  cy="2" r="1.8" />
              <circle cx="8"  cy="2" r="1.8" />
              <circle cx="14" cy="2" r="1.8" />
            </svg>
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
