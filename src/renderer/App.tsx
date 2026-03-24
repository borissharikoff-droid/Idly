import { useState, useCallback, useEffect, useRef, lazy, Suspense, Component } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { AuthGate } from './components/auth/AuthGate'
import { useProfileSync, usePresenceSync } from './hooks/useProfileSync'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { BottomNav } from './components/layout/BottomNav'
import { HomePage } from './components/home/HomePage'
import { StreakOverlay } from './components/animations/StreakOverlay'
import { LootDrop } from './components/alerts/LootDrop'
import { ChestDrop } from './components/alerts/ChestDrop'
import { ToastStack } from './components/alerts/ToastStack'
import { ChestOpenModal } from './components/animations/ChestOpenModal'
import { useArenaBattleTick } from './hooks/useArenaBattleTick'
import { useArenaStore } from './stores/arenaStore'
import { LOOT_ITEMS } from './lib/loot'
import { useGoldStore } from './stores/goldStore'
import { useAuthStore } from './stores/authStore'
import { MessageBanner } from './components/alerts/MessageBanner'
import { SkillLevelUpModal } from './components/home/SkillLevelUpModal'
import { useFriends } from './hooks/useFriends'
import { useMessageNotifier } from './hooks/useMessageNotifier'
import { useAnnouncements } from './hooks/useAnnouncements'
import { usePolls } from './hooks/usePolls'
import { useMarketplaceSaleNotifier } from './hooks/useMarketplaceSaleNotifier'
import { useCraftTick } from './hooks/useCraftTick'
import { useCookingTick } from './hooks/useCookingTick'
import { UpdateBanner } from './components/UpdateBanner'
import { useSessionStore, setupAfkListener } from './stores/sessionStore'
import { useChatTargetStore } from './stores/chatTargetStore'
import { categoryToSkillId, getSkillById, SKILLS } from './lib/skills'
import { skillLevelFromXP } from './lib/skills'
import { warmUpAudio } from './lib/sounds'
import { runSupabaseHealthCheck } from './services/supabaseHealth'
import { routeNotification } from './services/notificationRouter'
import { MOTION } from './lib/motion'
import { PageLoading } from './components/shared/PageLoading'
import { BOSSES, ZONES } from './lib/combat'
import { CRAFT_RECIPES } from './lib/crafting'
import { useAchievementStatsStore } from './stores/achievementStatsStore'
import { useNavCustomizationStore } from './stores/navCustomizationStore'
import { applyAdminConfig, syncAdminConfigFromSupabase } from './lib/itemConfig'
import { useAdminConfigStore } from './stores/adminConfigStore'
import { supabase } from './lib/supabase'
import { useNavigationStore } from './stores/navigationStore'
import { useEscapeHandler } from './hooks/useEscapeHandler'
import { clearEscapeStack } from './lib/escapeStack'
import { useWhatsNew, WhatsNewModal } from './components/WhatsNewModal'
import { useRemotePatchNotes } from './hooks/useRemotePatchNotes'
import { PartyHUD } from './components/party/PartyHUD'
import { OnboardingWizard } from './components/onboarding/OnboardingWizard'
import { OnboardingTour, getTourHighlightTab } from './components/onboarding/OnboardingTour'

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
            <p className="text-micro text-gray-500 font-mono max-w-[280px] break-all">{this.state.errorMsg}</p>
          )}
          <button
            onClick={() => { this.setState({ crashed: false, errorMsg: '' }); this.props.onReset() }}
            className="px-4 py-2 rounded border border-accent/30 text-accent text-xs hover:bg-accent/10 transition-colors"
          >
            Reload page
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

const InventoryPage = lazy(() => import('./components/inventory/InventoryPage').then((m) => ({ default: m.InventoryPage })))
const SkillsPage = lazy(() => import('./components/skills/SkillsPage').then((m) => ({ default: m.SkillsPage })))
const ProfilePage = lazy(() => import('./components/profile/ProfilePage').then((m) => ({ default: m.ProfilePage })))
const SettingsPage = lazy(() => import('./components/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const FriendsPage = lazy(() => import('./components/friends/FriendsPage').then((m) => ({ default: m.FriendsPage })))
const MarketplacePage = lazy(() => import('./components/marketplace/MarketplacePage').then((m) => ({ default: m.MarketplacePage })))
const ArenaPage = lazy(() => import('./components/arena/ArenaPage').then((m) => ({ default: m.ArenaPage })))
const FarmPage = lazy(() => import('./components/farm/FarmPage').then((m) => ({ default: m.FarmPage })))
const CraftPage = lazy(() => import('./components/craft/CraftPage').then((m) => ({ default: m.CraftPage })))
const CookingPage = lazy(() => import('./components/cooking/CookingPage').then((m) => ({ default: m.CookingPage })))

function PageFallback() {
  return (
    <div className="p-4">
      <PageLoading label="Loading..." />
    </div>
  )
}


export type TabId = 'home' | 'inventory' | 'skills' | 'stats' | 'profile' | 'friends' | 'marketplace' | 'arena' | 'farm' | 'craft' | 'cooking' | 'settings'

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
  const [showOnboarding, setShowOnboarding] = useState(() => {
    if (localStorage.getItem('grindly_onboarding_done')) return false
    // Returning user who updated before onboarding existed — skip wizard + tour
    if (localStorage.getItem('grindly_last_seen_version') || localStorage.getItem('grindly_tour_done')) {
      localStorage.setItem('grindly_onboarding_done', '1')
      localStorage.setItem('grindly_tour_done', '1')
      return false
    }
    return true
  })
  const [showTour, setShowTour] = useState(false)
  const [pendingTour, setPendingTour] = useState(false)
  const [tourStep, setTourStep] = useState(0)
  const [activeTab, setActiveTab] = useState<TabId>('home')
  const [skillsInitialTab, setSkillsInitialTab] = useState<'overview' | 'history'>('overview')
  const navigateTo = useCallback((tab: TabId) => {
    if (tab === 'stats') {
      setSkillsInitialTab('history')
      setActiveTab('skills')
    } else {
      if (tab === 'skills') setSkillsInitialTab('overview')
      setActiveTab(tab)
    }
  }, [])
  useEffect(() => { useNavigationStore.getState().setNavigateTo(navigateTo) }, [navigateTo])
  useEffect(() => {
    useNavigationStore.getState().setCurrentTab(activeTab)
    clearEscapeStack()
  }, [activeTab])
  useEffect(() => { useAchievementStatsStore.getState().hydrate() }, [])
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
  const { status, currentActivity, sessionStartTime, isSystemIdle } = useSessionStore()
  const presenceLabel = currentActivity && status === 'running'
    ? (() => {
      const cats = (currentActivity.categories || [currentActivity.category]).filter((c: string) => c !== 'idle' && c !== 'other')
      const names = cats.map((c: string) => getSkillById(categoryToSkillId(c))?.name).filter(Boolean)
      return names.length > 0 ? `Leveling ${names.join(' + ')}` : null
    })()
    : null
  useEffect(() => { setupAfkListener() }, [])
  usePresenceSync(presenceLabel, status === 'running', currentActivity?.appName ?? null, sessionStartTime, isSystemIdle)

  // ── Discord Rich Presence ──────────────────────────────────────────────────
  const skillXPAtStart = useSessionStore((s) => s.skillXPAtStart)
  const sessionSkillXP = useSessionStore((s) => s.sessionSkillXP)
  useEffect(() => {
    const api = window.electronAPI
    if (!api?.discord?.update) return
    if (status !== 'running') {
      api.discord.update({ status: 'idle' })
      return
    }
    // Find top skill by total XP (start + session earned), excluding warrior (arena skill)
    let topSkillName = 'Developer'
    let topSkillLevel = 1
    let topXP = -1
    for (const skill of SKILLS) {
      if (skill.id === 'warrior') continue
      const base = skillXPAtStart[skill.id] ?? 0
      const earned = sessionSkillXP[skill.id] ?? 0
      const total = base + earned
      const level = skillLevelFromXP(total)
      if (total > topXP) { topXP = total; topSkillName = skill.name; topSkillLevel = level }
    }
    api.discord.update({
      status: 'running',
      topSkillName,
      topSkillLevel,
      streak: streakCount,
      startTimestamp: sessionStartTime ?? undefined,
    })
  // skillXPAtStart added so level updates once DB load completes after session start
  }, [status, sessionStartTime, skillXPAtStart])
  // ─────────────────────────────────────────────────────────────────────────

  // ── Progressive tab disclosure: unlock advanced tabs after 3 sessions ─────
  const lockedTabs = useNavCustomizationStore((s) => s.lockedTabs)
  const unlockAllAdvanced = useNavCustomizationStore((s) => s.unlockAllAdvanced)
  useEffect(() => {
    if (lockedTabs.length === 0) return
    const api = window.electronAPI
    if (!api?.db?.getSessionCount) return
    api.db.getSessionCount(0).then((count: number) => {
      if ((count ?? 0) >= 3) unlockAllAdvanced()
    }).catch(() => {})
  // Re-check whenever a session completes (status goes idle)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, lockedTabs.length])
  // ─────────────────────────────────────────────────────────────────────────

  useProfileSync()
  useKeyboardShortcuts({ onEscapeToHome: handleEscapeToHome, onTabChange: setActiveTab })
  const friendsModel = useFriends() // single orchestrator for friends/presence/notifications
  useMessageNotifier() // sound, taskbar badge, toasts on new messages
  useAnnouncements()   // fetch missed + realtime announcements → notification bell
  usePolls()           // fetch active polls → voting modal
  useMarketplaceSaleNotifier() // bell notification when someone buys the user's listing
  useArenaBattleTick(activeTab) // battle completion: toast+bell when off Arena, modal when on Arena
  useCraftTick()                // crafting job queue — runs on all tabs
  useCookingTick()              // cooking job queue — runs on all tabs
  const whatsNew = useWhatsNew()
  useRemotePatchNotes(whatsNew.showRemotePatch)
  // Start tour only after WhatsNew modal and streak overlay are gone (prevents overlap)
  useEffect(() => {
    if (pendingTour && !whatsNew.showModal && !showStreak) {
      setPendingTour(false)
      navigateTo('home')
      setTourStep(0)
      setShowTour(true)
    }
  }, [pendingTour, whatsNew.showModal, showStreak, navigateTo])
  const arenaResultModal = useArenaStore((s) => s.resultModal)
  const setArenaResultModal = useArenaStore((s) => s.setResultModal)
  const arenaAutoRunning = useArenaStore((s) => s.isAutoRunning)
  const closeArenaModal = useCallback(() => {
    const pending = arenaResultModal?.pendingGold ?? 0
    setArenaResultModal(null)
    if (pending > 0) {
      useGoldStore.getState().addGold(pending)
      const user = useAuthStore.getState().user
      if (user) useGoldStore.getState().syncToSupabase(user.id)
    }
  }, [arenaResultModal, setArenaResultModal])

  // App-level modals close on Escape (ordered: arena result → streak → whats new)
  useEscapeHandler(closeArenaModal, Boolean(arenaResultModal))
  useEscapeHandler(() => setShowStreak(false), showStreak)
  useEscapeHandler(whatsNew.closeModal, whatsNew.showModal)

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

  // Dev helper: call window.__devMaxStats() from DevTools console to max all local state
  useEffect(() => {
    if (!import.meta.env.DEV) return
    ;(window as unknown as Record<string, unknown>).__devMaxStats = () => {
      const MAX_XP = 3_600_000
      const skills = ['warrior','developer','designer','gamer','communicator','researcher','creator','learner','listener']
      const xpMap: Record<string, number> = {}
      for (const s of skills) xpMap[s] = MAX_XP
      localStorage.setItem('grindly_skill_xp', JSON.stringify(xpMap))
      const arenaRaw = localStorage.getItem('grindly_arena_state')
      const arena = arenaRaw ? JSON.parse(arenaRaw) : {}
      const state = arena.state ?? arena
      state.clearedZones = ['zone1','zone2','zone3','zone4','zone5','zone6','zone7','zone8']
      state.killCounts = state.killCounts ?? {}
      if (arena.state) arena.state = state; else Object.assign(arena, state)
      localStorage.setItem('grindly_arena_state', JSON.stringify(arena))
      console.log('%c[devMaxStats] ✅ All stats maxed — reload the app now', 'color: #22c55e; font-weight: bold')
    }
  }, [])

  return (
    <AuthGate>
      <MotionConfig reducedMotion="user" transition={{ duration: MOTION.duration.base, ease: MOTION.easing }}>
        <div className="flex flex-col h-full bg-surface-0 overflow-x-hidden">
          <UpdateBanner />
          {healthIssues.length > 0 && !healthDismissed && (
            <div className="px-3 py-2 bg-amber-500/8 border-b border-amber-500/20 text-caption text-amber-200/80 flex items-center justify-between gap-3">
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
          <PartyHUD />
          <main className="flex-1 overflow-y-auto overflow-x-hidden isolate">
            <>
              {activeTab === 'home' && (
                <motion.div key="home" className="h-full" variants={PAGE_SLIDE} initial="initial" animate="animate">
                  <HomePage
                    onNavigateProfile={handleNavigateProfile}
                    onNavigateInventory={handleNavigateInventory}
                    onNavigateFriends={() => navigateTo('friends')}
                    hasFriends={friendsModel.friends.length > 0}
                  />
                </motion.div>
              )}
              {activeTab === 'inventory' && (
                <motion.div key="inventory" variants={PAGE_SLIDE} initial="initial" animate="animate">
                  <Suspense fallback={<PageFallback />}>
                    <InventoryPage onBack={() => navigateTo('home')} onNavigateFarm={handleNavigateFarm} />
                  </Suspense>
                </motion.div>
              )}
              {activeTab === 'skills' && (
                <motion.div key="skills" variants={PAGE_SLIDE} initial="initial" animate="animate">
                  <PageErrorBoundary onReset={() => navigateTo('home')}>
                    <Suspense fallback={<PageFallback />}>
                      <SkillsPage initialTab={skillsInitialTab} />
                    </Suspense>
                  </PageErrorBoundary>
                </motion.div>
              )}
              {activeTab === 'profile' && (
                <motion.div key="profile" variants={PAGE_SLIDE} initial="initial" animate="animate">
                  <Suspense fallback={<PageFallback />}>
                    <ProfilePage onBack={() => navigateTo('home')} />
                  </Suspense>
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
                    <Suspense fallback={<PageFallback />}>
                      <MarketplacePage />
                    </Suspense>
                  </PageErrorBoundary>
                </motion.div>
              )}
              {(activeTab === 'arena' || arenaAutoRunning) && (
                <motion.div key="arena" variants={PAGE_SLIDE} initial="initial" animate="animate"
                  style={activeTab !== 'arena' ? { position: 'absolute', left: '-9999px', pointerEvents: 'none' } : undefined}
                >
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
              {activeTab === 'cooking' && (
                <motion.div key="cooking" variants={PAGE_SLIDE} initial="initial" animate="animate">
                  <Suspense fallback={<PageFallback />}>
                    <CookingPage />
                  </Suspense>
                </motion.div>
              )}
              {activeTab === 'settings' && (
                <motion.div key="settings" variants={PAGE_SLIDE} initial="initial" animate="animate">
                  <Suspense fallback={<PageFallback />}>
                    <SettingsPage />
                  </Suspense>
                </motion.div>
              )}
            </>
          </main>
          <BottomNav activeTab={activeTab} onTabChange={navigateTo} tourHighlightTab={getTourHighlightTab(showTour, tourStep)} />
          <AnimatePresence>
            {showStreak && streakCount >= 2 && (
              <StreakOverlay streak={streakCount} onClose={() => setShowStreak(false)} />
            )}
          </AnimatePresence>
          <LootDrop />
          <ChestDrop />
          <ToastStack onNavigate={navigateTo} />
          <ChestOpenModal
            open={Boolean(arenaResultModal)}
            chestType={arenaResultModal?.chestType ?? null}
            item={arenaResultModal?.itemId ? (LOOT_ITEMS.find((x) => x.id === arenaResultModal.itemId) ?? null) : null}
            goldDropped={arenaResultModal?.goldDropped ?? 0}
            bonusMaterials={arenaResultModal?.bonusMaterials}
            warriorXP={arenaResultModal?.warriorXP ?? 0}
            onClose={closeArenaModal}
          />
          <MessageBanner onNavigateToChat={handleNavigateToChat} />
          <SkillLevelUpModal />
          <WhatsNewModal patch={whatsNew.patch} open={whatsNew.showModal} onClose={whatsNew.closeModal} />
          </div>
      </MotionConfig>
      <AnimatePresence>
        {showOnboarding && (
          <OnboardingWizard onDone={() => {
            setShowOnboarding(false)
            if (!localStorage.getItem('grindly_tour_done')) {
              if (whatsNew.showModal || showStreak) {
                setPendingTour(true)
              } else {
                navigateTo('home')
                setTourStep(0)
                setShowTour(true)
              }
            }
          }} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showTour && (
          <OnboardingTour
            onNavigate={(tab) => { navigateTo(tab) }}
            onStepChange={(s) => setTourStep(s)}
            onDone={() => {
              setShowTour(false)
              localStorage.setItem('grindly_tour_done', '1')
            }}
          />
        )}
      </AnimatePresence>
    </AuthGate>
  )
}
