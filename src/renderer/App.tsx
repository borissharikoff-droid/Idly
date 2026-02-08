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
import { UpdateBanner } from './components/UpdateBanner'
import { useSessionStore } from './stores/sessionStore'
import { categoryToSkillId, getSkillById } from './lib/skills'

export type TabId = 'home' | 'skills' | 'stats' | 'profile' | 'friends' | 'settings'

// Module-level flag — survives ALL React remounts, only resets on full app restart
let _streakDoneThisSession = false

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('home')
  const [showStreak, setShowStreak] = useState(false)
  const [streakCount, setStreakCount] = useState(0)

  // Global presence: always is_online while app is open
  const { status, currentActivity } = useSessionStore()
  const presenceLabel = currentActivity && status === 'running'
    ? (() => {
      const skill = getSkillById(categoryToSkillId(currentActivity.category))
      return skill ? `Leveling ${skill.name}` : null
    })()
    : null
  usePresenceSync(presenceLabel, status === 'running')

  useProfileSync()
  useKeyboardShortcuts()

  // Check streak once on app startup
  useEffect(() => {
    if (_streakDoneThisSession) return
    _streakDoneThisSession = true // set IMMEDIATELY before any async work

    const checkStreak = async () => {
      const api = window.electronAPI
      if (!api?.db?.getStreak || !api?.db?.getLocalStat || !api?.db?.setLocalStat) return

      const today = new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD local

      // Check browser storage first (redundancy)
      const browserStoredDate = localStorage.getItem('streak_shown_date')
      if (browserStoredDate === today) return

      try {
        const savedDate = await api.db.getLocalStat('streak_shown_date')
        if (savedDate === today) {
          // Sync browser storage if missing
          localStorage.setItem('streak_shown_date', today)
          return
        }

        const streak = await api.db.getStreak()
        if (streak >= 2) {
          await api.db.setLocalStat('streak_shown_date', today)
          localStorage.setItem('streak_shown_date', today) // Update browser storage too
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

  return (
    <AuthGate>
      <div className="flex flex-col h-full bg-discord-darker">
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
        {/* Global loot drop overlay */}
        <LootDrop />
      </div>
    </AuthGate>
  )
}
