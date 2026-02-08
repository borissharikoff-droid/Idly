import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { levelFromTotalXP, xpProgressInLevel, getStreakMultiplier, getTitleForLevel } from '../../lib/xp'
import { detectPersona } from '../../lib/persona'
import { FRAMES, BADGES, getEquippedFrame, getEquippedBadges } from '../../lib/cosmetics'

interface ProfileBarProps {
  onNavigateProfile?: () => void
}

export function ProfileBar({ onNavigateProfile }: ProfileBarProps) {
  const { user, signOut } = useAuthStore()
  const [username, setUsername] = useState('')
  const [avatar, setAvatar] = useState('🤖')
  const [totalXP, setTotalXP] = useState(0)
  const [persona, setPersona] = useState<{ emoji: string; label: string; description: string } | null>(null)
  const [showXPTooltip, setShowXPTooltip] = useState(false)
  const [showPersonaTooltip, setShowPersonaTooltip] = useState(false)
  const [frameId, setFrameId] = useState<string | null>(null)
  const [badgeIds, setBadgeIds] = useState<string[]>([])
  const [streak, setStreak] = useState(0)
  const activeFrame = FRAMES.find(f => f.id === frameId)
  const streakMult = getStreakMultiplier(streak)

  useEffect(() => {
    if (supabase && user) {
      supabase.from('profiles').select('username, avatar_url').eq('id', user.id).single().then(({ data }) => {
        if (data) {
          setUsername(data.username || 'Grinder')
          setAvatar(data.avatar_url || '🤖')
        }
      })
    }
    const api = window.electronAPI
    if (api?.db?.getLocalStat) {
      api.db.getLocalStat('total_xp').then((v) => setTotalXP(parseInt(v || '0', 10)))
    }
    // Load cosmetics
    setFrameId(getEquippedFrame())
    setBadgeIds(getEquippedBadges())
    // Load streak
    if (api?.db?.getStreak) {
      api.db.getStreak().then((s: number) => setStreak(s || 0))
    }
    // Detect persona
    if (api?.db?.getCategoryStats) {
      api.db.getCategoryStats().then((cats) => {
        if (cats && cats.length > 0) {
          const p = detectPersona(cats as { category: string; total_ms: number }[])
          setPersona(p)
        }
      })
    }
  }, [user])

  const level = levelFromTotalXP(totalXP)
  const { current, needed } = xpProgressInLevel(totalXP)
  const pct = Math.min(100, (current / needed) * 100)

  if (!supabase || !user) return null

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 border-b border-white/5"
    >
      {/* Avatar — click goes to Profile */}
      <button
        onClick={onNavigateProfile}
        className="relative shrink-0"
        title="Profile"
      >
        {activeFrame && (
          <div
            className="absolute -inset-1 rounded-full"
            style={{ background: activeFrame.gradient, opacity: 0.7 }}
          />
        )}
        <div
          className={`relative w-10 h-10 rounded-full bg-discord-card flex items-center justify-center text-xl hover:scale-105 transition-transform ${activeFrame ? 'border-2' : 'border border-white/10'
            }`}
          style={activeFrame ? { borderColor: activeFrame.color } : undefined}
        >
          {avatar}
        </div>
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-white font-medium text-sm truncate">{username}</span>

          {/* Level — hover shows XP */}
          <div
            className="relative"
            onMouseEnter={() => setShowXPTooltip(true)}
            onMouseLeave={() => setShowXPTooltip(false)}
          >
            <span className="text-cyber-neon font-mono text-xs cursor-default">Lv.{level}</span>
            <span className="text-gray-400 text-[10px] font-medium">{getTitleForLevel(level)}</span>
            {showXPTooltip && (
              <div className="absolute top-full left-0 mt-1 px-2 py-1 rounded-lg bg-discord-card border border-white/10 text-[10px] text-gray-300 font-mono whitespace-nowrap z-20 shadow-lg">
                {current}/{needed} XP to Lv.{level + 1} · Total: {totalXP} XP
              </div>
            )}
          </div>

          {/* Equipped badges */}
          {badgeIds.map(bId => {
            const badge = BADGES.find(b => b.id === bId)
            return badge ? (
              <span
                key={bId}
                className="text-[9px] px-1 py-0.5 rounded-md border font-medium"
                style={{ borderColor: `${badge.color}30`, backgroundColor: `${badge.color}10`, color: badge.color }}
                title={badge.name}
              >
                {badge.icon}
              </span>
            ) : null
          })}

          {/* Persona badge — tooltip below */}
          {persona && (
            <div
              className="relative"
              onMouseEnter={() => setShowPersonaTooltip(true)}
              onMouseLeave={() => setShowPersonaTooltip(false)}
            >
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-discord-card/80 border border-white/5 text-gray-400 cursor-default">
                {persona.emoji}
              </span>
              {showPersonaTooltip && (
                <div className="absolute left-0 top-full mt-1.5 w-48 px-2.5 py-2 rounded-lg bg-discord-card border border-white/10 text-[10px] text-gray-300 z-20 shadow-xl">
                  <p className="font-medium text-white">{persona.emoji} {persona.label}</p>
                  <p className="text-gray-500 mt-1 leading-relaxed break-words">
                    By activity. We analyze what you do and show your focus profile.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Streak multiplier badge */}
          {streakMult > 1 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-orange-500/10 border border-orange-500/20 text-orange-400 font-mono font-bold" title={`${streak}-day streak — x${streakMult} XP`}>
              x{streakMult}
            </span>
          )}
        </div>

        <div className="h-1.5 rounded-full bg-discord-dark overflow-hidden mt-1">
          <div className="h-full bg-gradient-to-r from-cyber-neon to-discord-accent rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Exit button */}
      <button
        onClick={() => signOut()}
        className="text-gray-500 hover:text-discord-red transition-colors"
        title="Sign out"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      </button>
    </div>
  )
}
