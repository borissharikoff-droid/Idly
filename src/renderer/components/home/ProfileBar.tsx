import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { getStreakMultiplier } from '../../lib/xp'
import { computeTotalSkillLevel, MAX_TOTAL_SKILL_LEVEL } from '../../lib/skills'
import { detectPersona } from '../../lib/persona'
import { FRAMES, BADGES, getEquippedFrame, getEquippedBadges } from '../../lib/cosmetics'
import { playClickSound } from '../../lib/sounds'
import { useAlertStore } from '../../stores/alertStore'
import { useNotificationStore } from '../../stores/notificationStore'
import { NotificationPanel } from '../notifications/NotificationPanel'

interface ProfileBarProps {
  onNavigateProfile?: () => void
}

export function ProfileBar({ onNavigateProfile }: ProfileBarProps) {
  const { user } = useAuthStore()
  const [username, setUsername] = useState('')
  const [avatar, setAvatar] = useState('🤖')
  const [totalSkillLevel, setTotalSkillLevel] = useState(0)
  const [persona, setPersona] = useState<{ emoji: string; label: string; description: string } | null>(null)
  const [showPersonaTooltip, setShowPersonaTooltip] = useState(false)
  const [frameId, setFrameId] = useState<string | null>(null)
  const [badgeIds, setBadgeIds] = useState<string[]>([])
  const [streak, setStreak] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const activeFrame = FRAMES.find(f => f.id === frameId)
  const streakMult = getStreakMultiplier(streak)
  const lootCount = useAlertStore((s) => (s.currentAlert ? 1 : 0) + s.queue.length)
  const unreadCount = useNotificationStore((s) => s.unreadCount)
  const [bellOpen, setBellOpen] = useState(false)
  const bellRef = useRef<HTMLButtonElement>(null)
  const toggleBell = useCallback(() => { playClickSound(); setBellOpen((o) => !o) }, [])

  useEffect(() => {
    if (supabase && user) {
      supabase.from('profiles').select('username, avatar_url').eq('id', user.id).single().then(({ data }) => {
        if (data) {
          setUsername(data.username || 'Idly')
          setAvatar(data.avatar_url || '🤖')
        }
        setLoaded(true)
      }).catch(() => setLoaded(true))
    } else {
      setLoaded(true)
    }
    const api = window.electronAPI
    if (api?.db?.getAllSkillXP) {
      api.db.getAllSkillXP().then((rows: { skill_id: string; total_xp: number }[]) => {
        setTotalSkillLevel(computeTotalSkillLevel(rows || []))
      })
    }
    setFrameId(getEquippedFrame())
    setBadgeIds(getEquippedBadges())
    if (api?.db?.getStreak) {
      api.db.getStreak().then((s: number) => setStreak(s || 0))
    }
    if (api?.db?.getCategoryStats) {
      api.db.getCategoryStats().then((cats) => {
        const p = detectPersona((cats || []) as { category: string; total_ms: number }[])
        setPersona(p)
      })
    } else {
      setPersona(detectPersona([]))
    }
  }, [user])

  if (!supabase || !user) return null

  return (
    <div className={`flex flex-col items-center px-4 pt-3 pb-4 transition-opacity duration-150 ${loaded ? 'opacity-100' : 'opacity-0'}`}>
      {/* Top row: avatar + info + sign out — overflow hidden so tooltips don't expand window */}
      <div className="flex items-center gap-2.5 w-full max-w-[340px] min-w-0">
        {/* Avatar */}
        <button onClick={() => { playClickSound(); onNavigateProfile?.() }} className={`relative shrink-0 ${activeFrame ? `frame-style-${activeFrame.style}` : ''}`} title="Profile">
          {activeFrame && (
            <div className="frame-ring absolute -inset-1 rounded-full" style={{ background: activeFrame.gradient, opacity: 0.7, color: activeFrame.color, borderColor: activeFrame.color }} />
          )}
          <div
            className={`frame-avatar relative w-9 h-9 rounded-full bg-discord-card flex items-center justify-center text-lg hover:scale-105 transition-transform ${
              activeFrame ? 'border-2' : 'border border-white/10'
            }`}
            style={activeFrame ? { borderColor: activeFrame.color } : undefined}
          >
            {avatar}
          </div>
          {lootCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-cyber-neon text-discord-darker text-[9px] font-bold flex items-center justify-center shadow-[0_0_6px_rgba(0,255,136,0.5)]">
              {lootCount}
            </span>
          )}
        </button>

        {/* Name + badges */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 overflow-hidden">
            <span className="text-white font-medium text-sm leading-none truncate">{username}</span>

            <span className="text-cyber-neon font-mono text-[11px] leading-none cursor-default" title="Total skill level">
              {totalSkillLevel}/{MAX_TOTAL_SKILL_LEVEL}
            </span>

            {badgeIds.map(bId => {
              const badge = BADGES.find(b => b.id === bId)
              return badge ? (
                <span key={bId} className="text-[9px] leading-none px-1 py-0.5 rounded-md border font-medium"
                  style={{ borderColor: `${badge.color}30`, backgroundColor: `${badge.color}10`, color: badge.color }} title={badge.name}>
                  {badge.icon}
                </span>
              ) : null
            })}

            {persona && (
              <div className="relative shrink-0" onMouseEnter={() => setShowPersonaTooltip(true)} onMouseLeave={() => setShowPersonaTooltip(false)}>
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-discord-card/80 border border-white/5 text-gray-400 cursor-default">
                  {persona.emoji}
                </span>
                {showPersonaTooltip && (
                  <div className="absolute right-0 top-full mt-1.5 w-44 max-w-[calc(100vw-2rem)] px-2.5 py-2 rounded-lg bg-discord-card border border-white/10 text-[10px] text-gray-300 z-20 shadow-xl pointer-events-none">
                    <p className="font-medium text-white">{persona.emoji} {persona.label}</p>
                    <p className="text-gray-500 mt-1 leading-relaxed break-words">
                      By activity. We analyze what you do and show your focus profile.
                    </p>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>

        {/* Notification bell */}
        <div className="relative shrink-0">
          <button
            ref={bellRef}
            onClick={toggleBell}
            className="w-8 h-8 rounded-lg bg-discord-card/60 border border-white/[0.06] flex items-center justify-center text-gray-400 hover:text-white hover:border-white/10 transition-colors relative"
            title="Notifications"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-orange-500 text-white text-[8px] font-bold flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          <NotificationPanel open={bellOpen} onClose={() => setBellOpen(false)} bellRef={bellRef} />
        </div>

      </div>

    </div>
  )
}
