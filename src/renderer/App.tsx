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
import { MessageBanner } from './components/alerts/MessageBanner'
import { SkillLevelUpModal } from './components/home/SkillLevelUpModal'
import { useFriends } from './hooks/useFriends'
import { useMessageNotifier } from './hooks/useMessageNotifier'
import { UpdateBanner } from './components/UpdateBanner'
import { useSessionStore } from './stores/sessionStore'
import { useChatTargetStore } from './stores/chatTargetStore'
import { categoryToSkillId, getSkillById } from './lib/skills'
import { warmUpAudio } from './lib/sounds'

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
  useMessageNotifier() // sound, taskbar badge, toasts on new messages

  // Pre-warm audio context on first user gesture
  useEffect(() => {
    const handler = () => {
      warmUpAudio()
      window.removeEventListener('pointerdown', handler)
    }
    window.addEventListener('pointerdown', handler, { once: true })
    return () => window.removeEventListener('pointerdown', handler)
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
      } catch (e) {
        console.error('Failed to check streak:', e)
      }
    }

    checkStreak()
  }, [])

  const handleNavigateProfile = useCallback(() => setActiveTab('profile'), [])

  const handleNavigateToChat = useCallback((friendId: string) => {
    useChatTargetStore.getState().setFriendId(friendId)
    setActiveTab('friends')
  }, [])

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
        <MessageBanner onNavigateToChat={handleNavigateToChat} />
        <SkillLevelUpModal />
      </div>
    </AuthGate>
  )
}
