import { useState, useCallback, useEffect } from 'react'
import { AnimatePresence } from 'framer-motion'
import { AuthGate } from './components/auth/AuthGate'
import { useProfileSync, usePresenceSync } from './hooks/useProfileSync'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { BottomNav } from './components/layout/BottomNav'
import { HomePage } from './components/home/HomePage'
import { StatsPage } from './components/stats/StatsPage'
import { FriendsPage } from './components/friends/FriendsPage'
import { ProfilePage } from './components/profile/ProfilePage'
import { SettingsPage } from './components/settings/SettingsPage'
import { SkillsPage } from './components/skills/SkillsPage'
import { StreakOverlay } from './components/animations/StreakOverlay'
import { LootDrop } from './components/alerts/LootDrop'
import { FriendToasts } from './components/alerts/FriendToasts'
import { SkillLevelUpModal } from './components/home/SkillLevelUpModal'
import { useFriends } from './hooks/useFriends'
import { UpdateBanner } from './components/UpdateBanner'
import { useSessionStore } from './stores/sessionStore'
import { categoryToSkillId, getSkillById } from './lib/skills'
import { warmUpAudio } from './lib/sounds'
import { ACHIEVEMENTS } from './lib/xp'
import { useNavBadgeStore } from './stores/navBadgeStore'
import { useUpdateChecker } from './hooks/useUpdateChecker'
import { useMessageNotifier } from './hooks/useMessageNotifier'

export type TabId = 'home' | 'skills' | 'stats' | 'profile' | 'friends' | 'settings'

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('home')
  const [showStreak, setShowStreak] = useState(false)
  const [streakCount, setStreakCount] = useState(0)

  // Global presence: always is_online while app is open
  const { status, currentActivity } = useSessionStore()
  const presenceLabel = currentActivity && status === 'running'
    ? (() => {
      const cats = (currentActivity.categories || [currentActivity.category]).filter((c: string) => c !== 'idle')
      const names = cats.map((c: string) => getSkillById(categoryToSkillId(c))?.name).filter(Boolean)
      return names.length > 0 ? `Leveling ${names.join(' + ')}` : null
    })()
    : null
  usePresenceSync(presenceLabel, status === 'running', currentActivity?.appName ?? null)

  useProfileSync()
  useKeyboardShortcuts()
  useFriends() // run so friend presence polling + online/leveling toasts work on all tabs
  useUpdateChecker()
  useMessageNotifier() // global: message sound, taskbar flash/badge, toast banner on ALL tabs

  // Pre-warm audio context on first user gesture
  useEffect(() => {
    const handler = () => {
      warmUpAudio()
      window.removeEventListener('pointerdown', handler)
    }
    window.addEventListener('pointerdown', handler, { once: true })
    return () => window.removeEventListener('pointerdown', handler)
  }, [])

  // Compute unclaimed loot count on startup for nav badge
  useEffect(() => {
    const computeLootBadge = async () => {
      const api = window.electronAPI
      let unlockedIds: string[] = []
      if (api?.db?.getUnlockedAchievements) {
        unlockedIds = await api.db.getUnlockedAchievements()
      } else {
        unlockedIds = JSON.parse(localStorage.getItem('idly_unlocked_achievements') || '[]')
      }
      const claimedIds: string[] = JSON.parse(localStorage.getItem('idly_claimed_achievements') || '[]')
      const count = ACHIEVEMENTS.filter(a => unlockedIds.includes(a.id) && !claimedIds.includes(a.id) && a.reward).length
      useNavBadgeStore.getState().setUnclaimedLootCount(count)
    }
    computeLootBadge()
  }, [])

  // Check streak once on app startup
  useEffect(() => {
    if (useSessionStore.getState().isStreakDone()) return
    useSessionStore.getState().markStreakDone()

    const checkStreak = async () => {
      const api = window.electronAPI
      if (!api?.db?.getStreak || !api?.db?.getLocalStat || !api?.db?.setLocalStat) return

      const today = new Date().toLocaleDateString('sv-SE')

      try {
        const savedDate = await api.db.getLocalStat('streak_shown_date')
        if (savedDate === today) return

        const streak = await api.db.getStreak()
        if (streak >= 2) {
          await api.db.setLocalStat('streak_shown_date', today)
          setStreakCount(streak)
          setShowStreak(true)
        }
      } catch {
        // streak check failed silently
      }
    }

    checkStreak()
  }, [])

  const handleNavigateProfile = useCallback(() => setActiveTab('profile'), [])

  // Activity update listener — must live at App level so it works on ALL tabs
  const setCurrentActivity = useSessionStore((s) => s.setCurrentActivity)
  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.electronAPI : null
    if (!api?.tracker?.onActivityUpdate) return
    const unsub = api.tracker.onActivityUpdate((a) => {
      setCurrentActivity(a as Parameters<typeof setCurrentActivity>[0])
    })
    api.tracker.getCurrentActivity?.().then((a) => {
      if (a) setCurrentActivity(a as Parameters<typeof setCurrentActivity>[0])
    }).catch(() => {})
    return unsub
  }, [setCurrentActivity])

  useEffect(() => {
    useSessionStore.getState().setGrindPageActive(activeTab === 'home')
  }, [activeTab])

  // Global ESC handler: go back to home tab (lowest priority — inner views handle first via stopPropagation)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      if (activeTab !== 'home') {
        setActiveTab('home')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeTab])

  return (
    <AuthGate>
      <div className="flex flex-col h-full bg-discord-darker overflow-x-hidden">
        <UpdateBanner />
        <main className="flex-1 overflow-auto">
          <AnimatePresence mode="wait">
            {activeTab === 'home' && (
              <HomePage
                key="home"
                onNavigateProfile={handleNavigateProfile}
                onNavigateFriends={() => setActiveTab('friends')}
              />
            )}
            {activeTab === 'skills' && <SkillsPage key="skills" />}
            {activeTab === 'stats' && <StatsPage key="stats" />}
            {activeTab === 'profile' && <ProfilePage key="profile" onBack={() => setActiveTab('home')} />}
            {activeTab === 'friends' && <FriendsPage key="friends" />}
            {activeTab === 'settings' && <SettingsPage key="settings" />}
          </AnimatePresence>
        </main>
        <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
        <AnimatePresence>
          {showStreak && streakCount >= 2 && (
            <StreakOverlay streak={streakCount} onClose={() => setShowStreak(false)} />
          )}
        </AnimatePresence>
        <LootDrop />
        <FriendToasts />
        <SkillLevelUpModal />
      </div>
    </AuthGate>
  )
}
