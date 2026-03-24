import type { TabId } from '../../App'
import type { ReactNode } from 'react'
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { playTabSound, playClickSound } from '../../lib/sounds'
import { track } from '../../lib/analytics'
import { useBadges, BADGE_URGENT, BADGE_READY } from '../../hooks/useBadges'
import { useNavCustomizationStore, ADVANCED_TABS } from '../../stores/navCustomizationStore'
import { MOTION } from '../../lib/motion'
import { getUIIcons } from '../../lib/itemConfig'
import { useAdminConfigStore } from '../../stores/adminConfigStore'
import { TAB_SHORTCUTS } from '../../hooks/useKeyboardShortcuts'
import {
  Home, Zap, Users, BarChart3, MoreHorizontal,
  Package, ShoppingCart, Sword, Sprout, Hammer, UtensilsCrossed,
  User, Settings,
} from '../../lib/icons'

const ALL_TABS: { id: TabId; label: string }[] = [
  { id: 'home',        label: 'Home'      },
  { id: 'skills',      label: 'Skills'    },
  { id: 'friends',     label: 'Social'    },
  { id: 'stats',       label: 'Stats'     },
  { id: 'inventory',   label: 'Inventory' },
  { id: 'marketplace', label: 'Market'    },
  { id: 'arena',       label: 'Arena'     },
  { id: 'farm',        label: 'Farm'      },
  { id: 'craft',       label: 'Craft'     },
  { id: 'cooking',     label: 'Cook'      },
  { id: 'profile',     label: 'Profile'   },
  { id: 'settings',    label: 'Settings'  },
]

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
  cooking:     <UtensilsCrossed className="w-[18px] h-[18px]" />,
  profile:     <User className="w-[18px] h-[18px]" />,
  settings:    <Settings className="w-[18px] h-[18px]" />,
}

function NavIcon({ tabId, adminIcon }: { tabId: TabId; adminIcon: string }) {
  if (adminIcon.startsWith('data:') || adminIcon.startsWith('http')) {
    return <img src={adminIcon} alt="" className="w-[18px] h-[18px] object-contain" draggable={false} />
  }
  return <>{TAB_LUCIDE_ICONS[tabId]}</>
}

interface BottomNavProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
  tourHighlightTab?: TabId | null
}

export function BottomNav({ activeTab, onTabChange, tourHighlightTab }: BottomNavProps) {
  useAdminConfigStore((s) => s.rev)
  const uiIcons = getUIIcons()
  const pinnedTabs = useNavCustomizationStore((s) => s.pinnedTabs)
  const setPinnedTabs = useNavCustomizationStore((s) => s.setPinnedTabs)
  const lockedTabs = useNavCustomizationStore((s) => s.lockedTabs)
  const [moreOpen, setMoreOpen] = useState(false)

  const [dropTarget, setDropTarget] = useState<number | null>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  const tabEnteredAtRef = useRef<number>(Date.now())
  const prevTabRef = useRef<TabId>(activeTab)

  useEffect(() => {
    if (!moreOpen) return
    const mouseHandler = (e: MouseEvent) => {
      if (popupRef.current?.contains(e.target as Node)) return
      if (moreButtonRef.current?.contains(e.target as Node)) return
      setMoreOpen(false)
    }
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false)
    }
    document.addEventListener('mousedown', mouseHandler)
    document.addEventListener('keydown', keyHandler)
    return () => {
      document.removeEventListener('mousedown', mouseHandler)
      document.removeEventListener('keydown', keyHandler)
    }
  }, [moreOpen])

  const badges = useBadges()

  const getTabBadge = (tabId: TabId) => {
    switch (tabId) {
      case 'home':        return badges.badgeHome > 0 ? { count: badges.badgeHome, color: badges.isHomeLootBadge ? BADGE_READY : BADGE_URGENT } : null
      case 'friends':     return badges.badgeFriends > 0 ? { count: badges.badgeFriends, color: BADGE_URGENT } : null
      case 'farm':        return badges.badgeFarm > 0 ? { count: badges.badgeFarm, color: BADGE_READY } : null
      case 'marketplace': return badges.badgeMarketplace > 0 ? { count: badges.badgeMarketplace, color: BADGE_READY } : null
      case 'profile':     return (badges.badgeProfile + badges.badgeProfileOrange) > 0 ? { count: badges.badgeProfile + badges.badgeProfileOrange, color: BADGE_READY } : null
      default:            return null
    }
  }

  const getTabPulse = (tabId: TabId) =>
    (tabId === 'arena' && badges.isArenaBattleActive) ||
    (tabId === 'craft' && badges.isCraftingActive) ||
    (tabId === 'cooking' && badges.isCookingActive)

  const moreTabs = ALL_TABS.filter((t) => !pinnedTabs.includes(t.id) && !lockedTabs.includes(t.id))
  const moreBadge = moreTabs.some((t) => getTabBadge(t.id) !== null || getTabPulse(t.id))
  const moreIsActiveTab = !pinnedTabs.includes(activeTab)

  const navigate = (id: TabId) => {
    if (id !== prevTabRef.current) {
      const seconds = Math.round((Date.now() - tabEnteredAtRef.current) / 1000)
      if (seconds > 2) {
        track('tab_time_spent', { tab_id: prevTabRef.current, seconds })
      }
      prevTabRef.current = id
      tabEnteredAtRef.current = Date.now()
    }
    playTabSound()
    track('tab_click', { tab: id })
    onTabChange(id)
    setMoreOpen(false)
  }

  // ── Drag: tab from More popup → nav bar ──────────────────────────
  const onDragStartMore = (e: React.DragEvent, tabId: TabId) => {
    e.dataTransfer.setData('grindly-tab', tabId)
    e.dataTransfer.setData('grindly-source', 'more')
    e.dataTransfer.effectAllowed = 'move'
  }

  // ── Drag: tab within nav bar → reorder ───────────────────────────
  const onDragStartNav = (e: React.DragEvent, tabId: TabId, slotIndex: number) => {
    e.dataTransfer.setData('grindly-tab', tabId)
    e.dataTransfer.setData('grindly-source', 'nav')
    e.dataTransfer.setData('grindly-slot', String(slotIndex))
    e.dataTransfer.effectAllowed = 'move'
  }

  const onDragEnd = () => {
    setDropTarget(null)
  }

  // Drop on a specific nav slot ─────────────────────────────────────
  const onDropNavSlot = (e: React.DragEvent, slotIndex: number) => {
    e.preventDefault()
    setDropTarget(null)
    const tabId = e.dataTransfer.getData('grindly-tab') as TabId
    const source = e.dataTransfer.getData('grindly-source')
    if (!tabId) return

    const newPinned = [...pinnedTabs]
    if (source === 'more') {
      newPinned[slotIndex] = tabId
    } else if (source === 'nav') {
      const srcSlot = parseInt(e.dataTransfer.getData('grindly-slot'))
      if (!isNaN(srcSlot) && srcSlot !== slotIndex) {
        ;[newPinned[slotIndex], newPinned[srcSlot]] = [newPinned[srcSlot], newPinned[slotIndex]]
      }
    }
    setPinnedTabs(newPinned)
  }

  // Drop on nav bar area (between slots) → append if < 4 pinned ────
  const onDropNavArea = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.getData('grindly-source') !== 'more') return
    const tabId = e.dataTransfer.getData('grindly-tab') as TabId
    if (!tabId || pinnedTabs.length >= 4) return
    setPinnedTabs([...pinnedTabs, tabId])
  }

  return (
    <>
      {/* ── More popup ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {moreOpen && (
          <>
            <motion.div
              ref={popupRef}
              className="fixed bottom-[58px] left-1/2 z-50 w-[280px] -translate-x-1/2 rounded-card border border-white/[0.08] bg-surface-2 shadow-popup overflow-hidden"
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: MOTION.duration.fast, ease: MOTION.easingSoft }}
            >
              <p className="text-micro font-mono text-gray-600 text-center pt-2 pb-0.5 px-2 select-none tracking-wide">
                drag any icon to the bar below to pin it
              </p>

              <div className="p-1.5 grid grid-cols-3 gap-0.5">
                {moreTabs.map((tab) => {
                  const isActive = activeTab === tab.id
                  const adminIcon = uiIcons.navSecondaryTabs?.[tab.id] || ''
                  const badge = getTabBadge(tab.id)
                  const pulse = getTabPulse(tab.id)
                  return (
                    <div
                      key={tab.id}
                      draggable
                      onDragStart={(e) => onDragStartMore(e, tab.id)}
                      onDragEnd={onDragEnd}
                      className="cursor-grab active:cursor-grabbing"
                    >
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.94 }}
                      onClick={() => navigate(tab.id)}
                      className={`relative flex flex-col items-center gap-1 px-2 py-2.5 rounded transition-colors select-none w-full ${
                        isActive
                          ? 'bg-accent/15 text-accent ring-1 ring-inset ring-accent/20'
                          : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.06]'
                      }`}
                    >
                      <span className="text-lg leading-none">
                        <NavIcon tabId={tab.id} adminIcon={adminIcon} />
                      </span>
                      <span className="text-micro font-mono leading-none tracking-wide">{tab.label}</span>
                      {badge && (
                        <span className={`absolute top-1 right-1.5 min-w-[13px] h-[13px] px-0.5 flex items-center justify-center rounded-full text-micro font-bold text-white ${badge.color}`}>
                          {badge.count > 99 ? '99+' : badge.count}
                        </span>
                      )}
                      {pulse && !badge && (
                        <span className="absolute top-1.5 right-2 w-2 h-2 rounded-full bg-accent animate-pulse" />
                      )}
                    </motion.button>
                    </div>
                  )
                })}
              </div>

              {/* Locked advanced tabs */}
              {lockedTabs.filter((t) => ADVANCED_TABS.includes(t)).length > 0 && (
                <div className="px-2 pb-2 pt-1 border-t border-white/[0.05]">
                  <p className="text-micro font-mono text-gray-700 text-center mb-1 select-none">
                    🔒 unlocks after 3 sessions
                  </p>
                  <div className="grid grid-cols-3 gap-0.5">
                    {lockedTabs.filter((t) => ADVANCED_TABS.includes(t)).map((tabId) => {
                      const tab = ALL_TABS.find((t) => t.id === tabId)
                      if (!tab) return null
                      return (
                        <div
                          key={tabId}
                          className="flex flex-col items-center gap-1 px-2 py-2.5 rounded select-none opacity-30 cursor-not-allowed"
                        >
                          <span className="text-lg leading-none">
                            <NavIcon tabId={tabId} adminIcon="" />
                          </span>
                          <span className="text-micro font-mono leading-none tracking-wide text-gray-500">{tab.label}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Bottom nav bar ───────────────────────────────────────────── */}
      <div
        className="shrink-0 flex justify-center pb-1.5 pt-1 px-2"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDropNavArea}
      >
        <nav className="flex items-stretch gap-1.5 rounded bg-surface-1 border border-white/[0.07] px-1.5 py-1.5 shadow-nav w-full max-w-xs">

          {/* Pinned tabs (1–4, variable) */}
          {pinnedTabs.map((tabId, slotIndex) => {
            const tab = ALL_TABS.find((t) => t.id === tabId)
            if (!tab) return null
            const active = activeTab === tabId
            const adminIcon = uiIcons.navTabs?.[tabId] || ''
            const badge = getTabBadge(tabId)
            const pulse = getTabPulse(tabId)
            const isDropTarget = dropTarget === slotIndex
            return (
              <div
                key={tabId}
                draggable
                onDragStart={(e) => onDragStartNav(e, tabId, slotIndex)}
                onDragEnd={onDragEnd}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropTarget(slotIndex) }}
                onDragLeave={() => setDropTarget(null)}
                onDrop={(e) => onDropNavSlot(e, slotIndex)}
                className="flex-1 cursor-grab active:cursor-grabbing"
              >
              <button
                type="button"
                onClick={() => navigate(tabId)}
                title={TAB_SHORTCUTS[tabId] ? `${tab.label} [${TAB_SHORTCUTS[tabId]}]` : tab.label}
                className={`relative w-full flex flex-col items-center justify-center gap-0.5 py-1.5 rounded transition-all duration-150 select-none ${
                  tourHighlightTab === tabId
                    ? 'ring-2 ring-accent bg-accent/20 text-accent animate-pulse'
                    : isDropTarget
                    ? 'ring-1 ring-accent/60 bg-accent/15 text-accent'
                    : active
                    ? 'bg-accent/15 text-accent'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                }`}
              >
                <span className="grindly-tab-icon leading-none" aria-hidden>
                  <NavIcon tabId={tabId} adminIcon={adminIcon} />
                </span>
                <span className="text-micro font-mono leading-none tracking-wide">{tab.label}</span>
                {badge && (
                  <span
                    className={`absolute -top-0.5 right-1 min-w-[14px] h-[14px] px-1 flex items-center justify-center rounded-full text-micro font-bold text-white border-2 border-surface-1 ${badge.color}`}
                    aria-label={`${badge.count} new`}
                  >
                    {badge.count > 99 ? '99+' : badge.count}
                  </span>
                )}
                {pulse && !badge && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full border border-surface-1 bg-accent animate-pulse" />
                )}
              </button>
              </div>
            )
          })}

          {/* More — always rightmost, never draggable */}
          <motion.button
            ref={moreButtonRef}
            type="button"
            whileTap={MOTION.interactive.tap}
            onClick={() => { playClickSound(); setMoreOpen((o) => !o) }}
            className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 rounded transition-all duration-200 ${
              moreOpen || moreIsActiveTab
                ? 'bg-accent/15 text-accent'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
            }`}
            aria-label="More"
            aria-expanded={moreOpen}
          >
            <MoreHorizontal className="w-[18px] h-[18px]" aria-hidden />
            <span className="text-micro font-mono leading-none tracking-wide">More</span>
            {moreBadge && !moreOpen && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full border border-surface-1 bg-accent" />
            )}
          </motion.button>
        </nav>
      </div>
    </>
  )
}
