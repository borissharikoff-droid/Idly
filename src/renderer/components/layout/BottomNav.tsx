import type { TabId } from '../../App'
import { playTabSound } from '../../lib/sounds'

const tabs: { id: TabId; icon: string }[] = [
  { id: 'home', icon: '⏱' },
  { id: 'skills', icon: '⚡' },
  { id: 'stats', icon: '📊' },
  { id: 'friends', icon: '👥' },
  { id: 'settings', icon: '⚙' },
]

interface BottomNavProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
}

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  return (
    <div className="shrink-0 flex justify-center pb-3 pt-1">
      <nav className="flex items-center gap-4 rounded-full bg-[#1a1a2e] border border-white/[0.07] px-2.5 py-1.5">
        {tabs.map((tab) => {
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => {
                playTabSound()
                onTabChange(tab.id)
              }}
              className={`w-9 h-9 flex items-center justify-center rounded-full text-sm transition-all duration-150 active:scale-90 ${
                active
                  ? 'bg-cyber-neon/15 text-cyber-neon shadow-[0_0_8px_rgba(0,255,136,0.15)]'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              {tab.icon}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
