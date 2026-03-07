import { useState, useCallback, useEffect, useRef, lazy, Suspense, Component } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { AuthGate } from './components/auth/AuthGate'
import { useProfileSync, usePresenceSync } from './hooks/useProfileSync'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { BottomNav } from './components/layout/BottomNav'
import { HomePage } from './components/home/HomePage'
import { ProfilePage } from './components/profile/ProfilePage'
import { SettingsPage } from './components/settings/SettingsPage'
import { SkillsPage } from './components/skills/SkillsPage'
import { StreakOverlay } from './components/animations/StreakOverlay'
import { LootDrop } from './components/alerts/LootDrop'
import { ChestDrop } from './components/alerts/ChestDrop'
import { ToastStack } from './components/alerts/ToastStack'
import { VictoryResultModal } from './components/arena/VictoryResultModal'
import { useArenaBattleTick } from './hooks/useArenaBattleTick'
import { useArenaStore } from './stores/arenaStore'
import { MessageBanner } from './components/alerts/MessageBanner'
import { SkillLevelUpModal } from './components/home/SkillLevelUpModal'
import { InventoryPage } from './components/inventory/InventoryPage'
import { useFriends } from './hooks/useFriends'
import { useMessageNotifier } from './hooks/useMessageNotifier'
import { useAnnouncements } from './hooks/useAnnouncements'
import { useMarketplaceSaleNotifier } from './hooks/useMarketplaceSaleNotifier'
import { useCraftTick } from './hooks/useCraftTick'
import { UpdateBanner } from './components/UpdateBanner'
import { useSessionStore } from './stores/sessionStore'
import { useChatTargetStore } from './stores/chatTargetStore'
import { useAuthStore } from './stores/authStore'
import { categoryToSkillId, getSkillById } from './lib/skills'
import { warmUpAudio } from './lib/sounds'
import { runSupabaseHealthCheck } from './services/supabaseHealth'
import { routeNotification } from './services/notificationRouter'
import { MOTION } from './lib/motion'
import { PageLoading } from './components/shared/PageLoading'
import { LOOT_ITEMS } from './lib/loot'
import { BOSSES, ZONES } from './lib/combat'
import { CRAFT_RECIPES } from './lib/crafting'
import { applyAdminConfig, syncAdminConfigFromSupabase } from './lib/itemConfig'
import { useAdminConfigStore } from './stores/adminConfigStore'
import { supabase } from './lib/supabase'
import { useNavigationStore } from './stores/navigationStore'

// Apply cached admin overrides before first render (populated after first Supabase sync)
applyAdminConfig(LOOT_ITEMS, BOSSES, ZONES, CRAFT_RECIPES)

class PageErrorBoundary extends Component<
  { children: ReactNode; onReset: () => void },
  { crashed: boolean; errorMsg: string }
> {
  constructor(props: { children: ReactNode; onReset: () => void }) {
    super(props)
    this.state = { crashed: false, errorMsg: '' }
  }
  static getDerivedStateFromError(error: Error) { return { crashed: true, errorMsg: String(error?.message ?? error) } }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[PageErrorBoundary] crash:', error, info.componentStack)
  }
  render() {
    if (this.state.crashed) {
      return (
        <div className="p-8 flex flex-col items-center justify-center gap-3 text-center">
          <span className="text-3xl">💥</span>
          <p className="text-sm text-gray-300 font-semibold">Page crashed</p>
          {this.state.errorMsg && (
            <p className="text-[10px] text-gray-500 font-mono max-w-[280px] break-all">{this.state.errorMsg}</p>
          )}
          <button
            onClick={() => { this.setState({ crashed: false, errorMsg: '' }); this.props.onReset() }}
            className="px-4 py-2 rounded-lg border border-cyber-neon/30 text-cyber-neon text-xs hover:bg-cyber-neon/10 transition-colors"
          >
            Reload page
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

const StatsPage = lazy(() => import('./components/stats/StatsPage').then((m) => ({ default: m.StatsPage })))
const FriendsPage = lazy(() => import('./components/friends/FriendsPage').then((m) => ({ default: m.FriendsPage })))
const MarketplacePage = lazy(() => import('./components/marketplace/MarketplacePage').then((m) => ({ default: m.MarketplacePage })))
const ArenaPage = lazy(() => import('./components/arena/ArenaPage').then((m) => ({ default: m.ArenaPage })))
const FarmPage = lazy(() => import('./components/farm/FarmPage').then((m) => ({ default: m.FarmPage })))
const CraftPage = lazy(() => import('./components/craft/CraftPage').then((m) => ({ default: m.CraftPage })))

function PageFallback() {
  return (
    <div className="p-4">
      <PageLoading label="Loading..." />
    </div>
  )
}

function MarketplaceFallback() {
  return (
    <div className="p-4 pb-20 space-y-4">
      <div className="h-10" />
      <div className="h-4 w-3/4 rounded bg-white/5" />
      <div className="rounded-2xl bg-[#1e1e2e]/90 border border-white/[0.06] p-4 space-y-3">
        <div className="h-4 w-16 rounded bg-white/10" />
        <div className="h-10 w-full rounded-xl bg-white/10" />
        <div className="flex gap-2 flex-wrap">
          <div className="h-9 w-24 rounded-xl bg-white/10" />
          <div className="h-9 w-24 rounded-xl bg-white/10" />
          <div className="h-9 w-20 rounded-xl bg-white/10" />
        </div>
      </div>
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl border border-white/[0.06] bg-[#1e1e2e]/50 p-4 flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-white/10 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 rounded bg-white/10" />
              <div className="h-3 w-48 rounded bg-white/10" />
            </div>
            <div className="h-10 w-20 rounded-xl bg-white/10 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  )
}

export type TabId = 'home' | 'inventory' | 'skills' | 'stats' | 'profile' | 'friends' | 'marketplace' | 'arena' | 'farm' | 'craft' | 'settings'

const PAGE_SLIDE = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.15, ease: MOTION.easingSoft } },
}

function migrateLegacyLocalStorage(): void {
  if (typeof localStorage === 'undefined') return
  const toCopy: Array<{ from: string; to: string }> = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key) continue
    if (!key.includes('idly')) continue
    toCopy.push({
      from: key,
      to: key.replaceAll('idly', 'grindly').replaceAll('Idly', 'Grindly').replaceAll('IDLY', 'GRINDLY'),
    })
  }

  for (const pair of toCopy) {
    if (pair.from === pair.to) continue
    if (localStorage.getItem(pair.to) !== null) continue
    const value = localStorage.getItem(pair.from)
    if (value !== null) localStorage.setItem(pair.to, value)
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('home')
  const navigateTo = useCallback((tab: TabId) => {
    setActiveTab(tab)
  }, [])
  useEffect(() => { useNavigationStore.getState().setNavigateTo(navigateTo) }, [navigateTo])
  const [showStreak, setShowStreak] = useState(false)
  const [streakCount, setStreakCount] = useState(0)
  const [healthIssues, setHealthIssues] = useState<string[]>([])
  const [healthDismissed, setHealthDismissed] = useState(false)
  const [isBackground, setIsBackground] = useState(false)
  const lastHiddenActivityPushRef = useRef(0)
  const healthCheckDoneRef = useRef(false)
  const isBackgroundRef = useRef(false)
  const { user } = useAuthStore()
  const handleEscapeToHome = useCallback(() => {
    if (activeTab !== 'home') navigateTo('home')
  }, [activeTab, navigateTo])

  // Global presence: always is_online while app is open
  const { status, currentActivity, sessionStartTime } = useSessionStore()
  const presenceLabel = currentActivity && status === 'running'
    ? (() => {
      const cats = (currentActivity.categories || [currentActivity.category]).filter((c: string) => c !== 'idle')
      const names = cats.map((c: string) => getSkillById(categoryToSkillId(c))?.name).filter(Boolean)
      return names.length > 0 ? `Leveling ${names.join(' + ')}` : null
    })()
    : null
  usePresenceSync(presenceLabel, status === 'running', currentActivity?.appName ?? null, sessionStartTime)

  useProfileSync()
  useKeyboardShortcuts({ onEscapeToHome: handleEscapeToHome })
  const friendsModel = useFriends() // single orchestrator for friends/presence/notifications
  useMessageNotifier() // sound, taskbar badge, toasts on new messages
  useAnnouncements()   // fetch missed + realtime announcements → notification bell
  useMarketplaceSaleNotifier() // bell notification when someone buys the user's listing
  useArenaBattleTick(activeTab) // battle completion: toast+bell when off Arena, modal when on Arena
  useCraftTick()                // crafting job queue — runs on all tabs
  const arenaResultModal = useArenaStore((s) => s.resultModal)
  const setArenaResultModal = useArenaStore((s) => s.setResultModal)

  useEffect(() => {
    if (!localStorage.getItem('grindly_migration_done')) {
      migrateLegacyLocalStorage()
      localStorage.setItem('grindly_migration_done', '1')
    }
  }, [])

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null): boolean => {
      const el = target as HTMLElement | null
      if (!el) return false
      const tag = el.tagName?.toLowerCase()
      return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable
    }
    const isMouseBack = (button: number) => button === 3 || button === 4

    const onMouseBack = (e: MouseEvent) => {
      if (!isMouseBack(e.button)) return
      if (isEditableTarget(e.target)) return
      if (activeTab === 'home') return
      e.preventDefault()
      navigateTo('home')
    }

    window.addEventListener('mousedown', onMouseBack)
    window.addEventListener('auxclick', onMouseBack)
    return () => {
      window.removeEventListener('mousedown', onMouseBack)
      window.removeEventListener('auxclick', onMouseBack)
    }
  }, [activeTab, navigateTo])

  // Pre-warm audio context on first user gesture
  useEffect(() => {
    const handler = () => {
      warmUpAudio()
      window.removeEventListener('pointerdown', handler)
    }
    window.addEventListener('pointerdown', handler, { once: true })
    return () => window.removeEventListener('pointerdown', handler)
  }, [])

  useEffect(() => {
    // Only run after user is authenticated, and only once per session
    if (!window.electronAPI) return
    if (!user) return
    if (healthCheckDoneRef.current) return
    healthCheckDoneRef.current = true

    runSupabaseHealthCheck().then((result) => {
      if (result.ok) {
        setHealthIssues([])
        return
      }
      const issues = result.checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`)
      setHealthIssues(issues)
      setHealthDismissed(false)
      // Auto-dismiss connectivity issues after 8s
      const isConnectivity = issues.every((i) => /network|fetch|connect|offline/i.test(i))
      if (isConnectivity) setTimeout(() => setHealthDismissed(true), 8_000)
    }).catch(() => {
      // Network down — show soft warning, auto-dismiss
      setHealthIssues(['Offline — social features unavailable'])
      setHealthDismissed(false)
      setTimeout(() => setHealthDismissed(true), 8_000)
    })
  }, [user])

  // Check streak once on app startup (once per session, every launch)
  useEffect(() => {
    if (useSessionStore.getState().isStreakDone()) return
    useSessionStore.getState().markStreakDone()

    const checkStreak = async () => {
      const api = window.electronAPI
      if (!api?.db?.getStreak) return

      try {
        const streak = await api.db.getStreak()
        if (streak >= 2) {
          setStreakCount(streak)
          setShowStreak(true)
        }
      } catch {
        // non-critical — streak overlay simply won't show
      }
    }

    checkStreak()
  }, [])

  // Sync admin config from Supabase and re-apply; poll every 5 minutes so all
  // players pick up boss/item/skin changes without restarting the app.
  useEffect(() => {
    if (!supabase) return
    const { bump } = useAdminConfigStore.getState()
    const sync = () =>
      syncAdminConfigFromSupabase(supabase)
        .then(() => { applyAdminConfig(LOOT_ITEMS, BOSSES, ZONES, CRAFT_RECIPES); bump() })
        .catch(() => {})
    sync()
    const id = setInterval(sync, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  const handleNavigateProfile = useCallback(() => navigateTo('profile'), [navigateTo])
  const handleNavigateInventory = useCallback(() => navigateTo('inventory'), [navigateTo])
  const handleNavigateFarm = useCallback(() => navigateTo('farm'), [navigateTo])

  const handleNavigateToChat = useCallback((friendId: string) => {
    useChatTargetStore.getState().setFriendId(friendId)
    navigateTo('friends')
  }, [navigateTo])

  // Activity update listener — must live at App level so it works on ALL tabs
  const setCurrentActivity = useSessionStore((s) => s.setCurrentActivity)
  useEffect(() => {
    const onVisibility = () => {
      const hidden = typeof document !== 'undefined' ? document.hidden : false
      setIsBackground(hidden)
      isBackgroundRef.current = hidden
    }
    onVisibility()
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.electronAPI : null
    if (!api?.tracker?.onActivityUpdate) return
    const unsub = api.tracker.onActivityUpdate((a) => {
      if (isBackgroundRef.current) {
        const now = Date.now()
        // Eco mode: throttle foreground-window UI updates while app is hidden.
        if (now - lastHiddenActivityPushRef.current < 5000) return
        lastHiddenActivityPushRef.current = now
      }
      setCurrentActivity(a as Parameters<typeof setCurrentActivity>[0])
    })
    api.tracker.getCurrentActivity?.().then((a) => {
      if (a) setCurrentActivity(a as Parameters<typeof setCurrentActivity>[0])
    }).catch(() => {})
    return unsub
  }, [setCurrentActivity])

  useEffect(() => {
    // Allow grind/XP/drop ticks on any foreground tab (home, inventory, friends, etc.).
    useSessionStore.getState().setGrindPageActive(!isBackground)
  }, [isBackground])

  useEffect(() => {
    const api = window.electronAPI
    if (!api?.notify?.onSmart) return
    const unsub = api.notify.onSmart((payload) => {
      routeNotification({
        type: 'progression_info',
        icon: '🔔',
        title: payload.title,
        body: payload.body,
        dedupeKey: `smart:${payload.title}:${payload.body}`,
      }, api).catch(() => {})
    })
    return unsub
  }, [])

  return (
    <AuthGate>
      <MotionConfig reducedMotion="user" transition={{ duration: MOTION.duration.base, ease: MOTION.easing }}>
        <div className="flex flex-col h-full bg-discord-darker overflow-x-hidden">
          <UpdateBanner />
          {healthIssues.length > 0 && !healthDismissed && (
            <div className="px-3 py-2 bg-amber-500/8 border-b border-amber-500/20 text-[11px] text-amber-200/80 flex items-center justify-between gap-3">
              <span className="truncate">⚠ {healthIssues[0]}</span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => navigateTo('settings')}
                  className="px-2 py-1 rounded border border-amber-400/25 hover:bg-amber-400/10 transition-colors"
                >
                  Logs
                </button>
                <button
                  onClick={() => setHealthDismissed(true)}
                  className="px-2 py-1 rounded border border-white/15 text-gray-400 hover:bg-white/5 transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
          )}
          <main className="flex-1 overflow-y-auto overflow-x-hidden">
            <>
              {activeTab === 'home' && (
                <motion.div key="home" className="h-full" variants={PAGE_SLIDE} initial="initial" animate="animate">
                  <HomePage
                    onNavigateProfile={handleNavigateProfile}
                    onNavigateInventory={handleNavigateInventory}
                    onNavigateFriends={() => navigateTo('friends')}
                  />
                </motion.div>
              )}
              {activeTab === 'inventory' && (
                <motion.div key="inventory" variants={PAGE_SLIDE} initial="initial" animate="animate">
                  <InventoryPage onBack={() => navigateTo('home')} onNavigateFarm={handleNavigateFarm} />
                </motion.div>
              )}
              {activeTab === 'skills' && (
                <motion.div key="skills" variants={PAGE_SLIDE} initial="initial" animate="animate">
                  <SkillsPage />
                </motion.div>
              )}
              {activeTab === 'stats' && (
                <motion.div key="stats" variants={PAGE_SLIDE} initial="initial" animate="animate">
                  <Suspense fallback={<PageFallback />}>
                    <StatsPage />
                  </Suspense>
                </motion.div>
              )}
              {activeTab === 'profile' && (
                <motion.div key="profile" variants={PAGE_SLIDE} initial="initial" animate="animate">
                  <ProfilePage onBack={() => navigateTo('home')} />
                </motion.div>
              )}
              {activeTab === 'friends' && (
                <motion.div key="friends" className="h-full" variants={PAGE_SLIDE} initial="initial" animate="animate">
                  <Suspense fallback={<PageFallback />}>
                    <FriendsPage friendsModel={friendsModel} />
                  </Suspense>
                </motion.div>
              )}
              {activeTab === 'marketplace' && (
                <motion.div key="marketplace" variants={PAGE_SLIDE} initial="initial" animate="animate">
                  <PageErrorBoundary onReset={() => navigateTo('home')}>
                    <Suspense fallback={<MarketplaceFallback />}>
                      <MarketplacePage />
                    </Suspense>
                  </PageErrorBoundary>
                </motion.div>
              )}
              {activeTab === 'arena' && (
                <motion.div key="arena" variants={PAGE_SLIDE} initial="initial" animate="animate">
                  <Suspense fallback={<PageFallback />}>
                    <ArenaPage />
                  </Suspense>
                </motion.div>
              )}
              {activeTab === 'farm' && (
                <motion.div key="farm" variants={PAGE_SLIDE} initial="initial" animate="animate">
                  <Suspense fallback={<PageFallback />}>
                    <FarmPage />
                  </Suspense>
                </motion.div>
              )}
              {activeTab === 'craft' && (
                <motion.div key="craft" variants={PAGE_SLIDE} initial="initial" animate="animate">
                  <Suspense fallback={<PageFallback />}>
                    <CraftPage />
                  </Suspense>
                </motion.div>
              )}
              {activeTab === 'settings' && (
                <motion.div key="settings" variants={PAGE_SLIDE} initial="initial" animate="animate">
                  <SettingsPage />
                </motion.div>
              )}
            </>
          </main>
          <BottomNav activeTab={activeTab} onTabChange={navigateTo} />
          <AnimatePresence>
            {showStreak && streakCount >= 2 && (
              <StreakOverlay streak={streakCount} onClose={() => setShowStreak(false)} />
            )}
          </AnimatePresence>
          <LootDrop />
          <ChestDrop />
          <ToastStack onNavigate={navigateTo} />
          <VictoryResultModal
            open={Boolean(arenaResultModal)}
            victory={arenaResultModal?.victory ?? false}
            gold={arenaResultModal?.gold ?? 0}
            goldAlreadyAdded={arenaResultModal?.goldAlreadyAdded ?? true}
            bossName={arenaResultModal?.bossName}
            goldLost={arenaResultModal?.goldLost}
            chest={arenaResultModal?.chest ?? null}
            lostItemName={arenaResultModal?.lostItemName}
            lostItemIcon={arenaResultModal?.lostItemIcon}
            materialDrop={arenaResultModal?.materialDrop ?? null}
            dungeonGold={arenaResultModal?.dungeonGold ?? 0}
            warriorXP={arenaResultModal?.warriorXP ?? 0}
            onClose={() => setArenaResultModal(null)}
          />
          <MessageBanner onNavigateToChat={handleNavigateToChat} />
          <SkillLevelUpModal />
          </div>
      </MotionConfig>
    </AuthGate>
  )
}
