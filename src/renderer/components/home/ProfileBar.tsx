import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Bell } from '../../lib/icons'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { getStreakMultiplier } from '../../lib/xp'
import { computeTotalSkillLevel, MAX_TOTAL_SKILL_LEVEL } from '../../lib/skills'
import { FRAMES, getEquippedFrame } from '../../lib/cosmetics'
import { playClickSound } from '../../lib/sounds'
import { useAlertStore } from '../../stores/alertStore'
import { useNotificationStore } from '../../stores/notificationStore'
import { NotificationPanel } from '../notifications/NotificationPanel'
import { BackpackButton } from '../shared/BackpackButton'
import { ensureInventoryHydrated } from '../../stores/inventoryStore'
import { useGoldStore } from '../../stores/goldStore'
import { AvatarWithFrame } from '../shared/AvatarWithFrame'
import { usePartyStore } from '../../stores/partyStore'
import { ROLE_ICONS } from '../../services/partyService'
import { useNavigationStore } from '../../stores/navigationStore'
import { useSessionStore } from '../../stores/sessionStore'
import { PartyMemberCtxMenu, type CtxTarget } from '../party/PartyMemberCtxMenu'
import { useChatTargetStore } from '../../stores/chatTargetStore'

interface ProfileBarProps {
  onNavigateProfile?: () => void
  onNavigateInventory?: () => void
}

export function ProfileBar({ onNavigateProfile, onNavigateInventory }: ProfileBarProps) {
  const { user } = useAuthStore()
  const party = usePartyStore((s) => s.party)
  const partyMembers = usePartyStore((s) => s.members)
  const navigateTo = useNavigationStore((s) => s.navigateTo)
  const setPendingFriendUserId = useNavigationStore((s) => s.setPendingFriendUserId)
  const setReturnTab = useNavigationStore((s) => s.setReturnTab)
  const [username, setUsername] = useState('Grindly')
  const [avatar, setAvatar] = useState('🤖')
  const [totalSkillLevel, setTotalSkillLevel] = useState(0)
  const [frameId, setFrameId] = useState<string | null>(null)
  const [streak, setStreak] = useState(0)
  const activeFrame = FRAMES.find(f => f.id === frameId)
  const streakMult = getStreakMultiplier(streak)
  const lootCount = useAlertStore((s) => (s.currentAlert ? 1 : 0) + s.queue.length)
  const gold = useGoldStore((s) => s.gold)
  const unreadCount = useNotificationStore((s) => s.unreadCount)
  const [bellOpen, setBellOpen] = useState(false)
  const [ctxTarget, setCtxTarget] = useState<CtxTarget | null>(null)
  const [ctxMessageUserId, setCtxMessageUserId] = useState<string | null>(null)
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set())
  const setChatTargetFriendId = useChatTargetStore((s) => s.setFriendId)
  const isAfkPaused = useSessionStore((s) => s.isAfkPaused)
  const afkSinceRef = useRef<number | null>(null)
  const [afkElapsedSec, setAfkElapsedSec] = useState(0)
  const [showResumed, setShowResumed] = useState(false)
  const resumedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bellRef = useRef<HTMLButtonElement>(null)
  const toggleBell = useCallback(() => {
    playClickSound()
    setBellOpen((o) => !o)
  }, [])
  const closeBell = useCallback(() => setBellOpen(false), [])

  useEffect(() => {
    if (user) {
      const cacheKey = `grindly_profile_cache_${user.id}`
      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey) || '{}') as { username?: string; avatar?: string }
        if (cached.username) setUsername(cached.username)
        if (cached.avatar) setAvatar(cached.avatar)
      } catch {
        // ignore broken cache
      }
    }

    if (supabase && user) {
      void Promise.resolve(supabase.from('profiles').select('username, avatar_url').eq('id', user.id).single()).then(({ data }) => {
        if (data) {
          const nextUsername = data.username || 'Grindly'
          const nextAvatar = data.avatar_url || '🤖'
          setUsername(nextUsername)
          setAvatar(nextAvatar)
          const cacheKey = `grindly_profile_cache_${user.id}`
          localStorage.setItem(cacheKey, JSON.stringify({ username: nextUsername, avatar: nextAvatar }))
        }
      }).catch(() => {})
    }
    const api = window.electronAPI
    if (api?.db?.getAllSkillXP) {
      api.db.getAllSkillXP().then((rows: { skill_id: string; total_xp: number }[]) => {
        setTotalSkillLevel(computeTotalSkillLevel(rows || []))
      })
    }
    setFrameId(getEquippedFrame())
    if (api?.db?.getStreak) {
      api.db.getStreak().then((s: number) => setStreak(s || 0))
    }
    ensureInventoryHydrated()

    if (supabase && user) {
      void Promise.resolve(supabase
        .from('friendships')
        .select('user_id, friend_id')
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
        .eq('status', 'accepted')
      ).then(({ data }) => {
        if (data) {
          const ids = new Set(data.map((r) => r.user_id === user.id ? r.friend_id : r.user_id))
          setFriendIds(ids)
        }
      }).catch(() => {})
    }
  }, [user])

  // AFK badge: track idle duration and "Resumed" flash
  useEffect(() => {
    if (isAfkPaused) {
      afkSinceRef.current = Date.now()
      setAfkElapsedSec(0)
      setShowResumed(false)
      if (resumedTimerRef.current) clearTimeout(resumedTimerRef.current)
      const interval = setInterval(() => {
        if (afkSinceRef.current) {
          setAfkElapsedSec(Math.floor((Date.now() - afkSinceRef.current) / 1000))
        }
      }, 1000)
      return () => clearInterval(interval)
    } else if (afkSinceRef.current !== null) {
      // Was AFK, now resumed
      afkSinceRef.current = null
      setAfkElapsedSec(0)
      setShowResumed(true)
      resumedTimerRef.current = setTimeout(() => setShowResumed(false), 2000)
    }
  }, [isAfkPaused])

  const afkLabel = useMemo(() => {
    if (afkElapsedSec < 60) return `💤 AFK — ${afkElapsedSec}s`
    const m = Math.floor(afkElapsedSec / 60)
    const s = afkElapsedSec % 60
    return `💤 AFK — ${m}m ${s}s`
  }, [afkElapsedSec])

  const myMember = party?.status === 'active' ? partyMembers.find((m) => m.user_id === user?.id) : null
  const otherMembers = party?.status === 'active' ? partyMembers.filter((m) => m.user_id !== user?.id) : []

  return (
    <div className="flex flex-col items-center px-4 pt-3 pb-3">
      {/* Top row: avatar + info + sign out — overflow hidden so tooltips don't expand window */}
      <div className="flex items-center gap-2.5 w-full min-w-0">
        {/* Avatar */}
        <button onClick={() => { playClickSound(); onNavigateProfile?.() }} className={`relative shrink-0 ${activeFrame ? `frame-style-${activeFrame.style}` : ''}`} title="Profile">
          <AvatarWithFrame
            avatar={avatar}
            frameId={frameId}
            sizeClass="w-9 h-9 frame-avatar hover:scale-105 transition-transform"
            textClass="text-lg"
            roundedClass="rounded-full"
            ringInsetClass="-inset-0.5"
          />
          {lootCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-cyber-neon text-discord-darker text-[10px] font-bold flex items-center justify-center shadow-[0_0_6px_rgba(0,255,136,0.5)]">
              {lootCount}
            </span>
          )}
          {myMember && !lootCount && (
            <span className="absolute -bottom-0.5 -right-0.5 text-[10px] leading-none drop-shadow-md">
              {ROLE_ICONS[myMember.role]}
            </span>
          )}
        </button>

        {/* Name + badges */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-white font-medium text-sm leading-none truncate">{username}</span>

            <span className="text-cyber-neon font-mono text-[11px] leading-none cursor-default" title="Total skill level">
              {totalSkillLevel}/{MAX_TOTAL_SKILL_LEVEL}
            </span>

            {isAfkPaused && (
              <span className="font-mono text-[10px] leading-none px-1 py-0.5 rounded bg-amber-500/20 text-amber-300 animate-pulse" title="Session paused — AFK detected">
                {afkLabel}
              </span>
            )}
            {!isAfkPaused && showResumed && (
              <span className="font-mono text-[10px] leading-none px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                ▶ Resumed
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-xs">
            <span className="text-amber-400/90 flex items-center gap-1">
              <span aria-hidden>🪙</span>
              <span className="font-mono tabular-nums">{gold}</span>
            </span>
            {streak > 0 && (
              <span
                className="text-orange-400 flex items-center gap-0.5"
                title={`${streak}-day streak · ×${streakMult.toFixed(1)} XP`}
              >
                <span aria-hidden>🔥</span>
                <span className="font-mono tabular-nums">{streak}</span>
              </span>
            )}
          </div>
        </div>

        <div className="relative shrink-0">
          <BackpackButton
            onClick={() => { setBellOpen(false); onNavigateInventory?.() }}
            className="mr-1"
          />
        </div>
        <div className="relative shrink-0">
          <button
            ref={bellRef}
            onClick={toggleBell}
            className="w-8 h-8 rounded-lg bg-discord-card/60 border border-white/[0.06] flex items-center justify-center text-gray-400 hover:text-white hover:border-white/10 transition-colors relative"
            title="Notifications"
          >
            <Bell className="w-[15px] h-[15px]" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          <NotificationPanel open={bellOpen} onClose={closeBell} bellRef={bellRef} />
        </div>

      </div>

      {/* Party members — compact avatar circles, no border strip */}
      {otherMembers.length > 0 && (
        <div className="flex items-center gap-2 w-full mt-2 pl-[46px]">
          {otherMembers.map((m) => {
            const avatarEmoji = m.avatar_url && m.avatar_url.length <= 4 ? m.avatar_url : '🤖'
            const handleClick = () => {
              setReturnTab('home')
              setPendingFriendUserId(m.user_id)
              navigateTo?.('friends')
            }
            const handleContextMenu = (e: React.MouseEvent) => {
              e.preventDefault()
              setCtxTarget({ x: e.clientX, y: e.clientY, userId: m.user_id, username: m.username, isSelf: false, isFriend: friendIds.has(m.user_id) })
              setCtxMessageUserId(m.user_id)
            }
            return (
              <button
                key={m.user_id}
                type="button"
                onClick={handleClick}
                onContextMenu={handleContextMenu}
                className="relative group shrink-0 hover:scale-110 transition-transform"
                title={m.username ?? undefined}
              >
                <AvatarWithFrame
                  avatar={avatarEmoji}
                  frameId={m.frame_id}
                  sizeClass="w-7 h-7"
                  textClass="text-base"
                  roundedClass="rounded-full"
                  ringInsetClass="-inset-[1px]"
                  ringOpacity={0.6}
                />
                <span className="absolute -bottom-0.5 -right-0.5 text-[10px] leading-none drop-shadow-md">
                  {ROLE_ICONS[m.role]}
                </span>
              </button>
            )
          })}
        </div>
      )}

      <PartyMemberCtxMenu
        target={ctxTarget}
        onClose={() => { setCtxTarget(null); setCtxMessageUserId(null) }}
        onMessage={ctxMessageUserId && friendIds.has(ctxMessageUserId) ? () => {
          setChatTargetFriendId(ctxMessageUserId)
          navigateTo?.('friends')
        } : undefined}
      />

    </div>
  )
}
