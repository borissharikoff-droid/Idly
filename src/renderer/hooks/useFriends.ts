import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { checkSocialAchievements } from '../lib/xp'
import { useAlertStore } from '../stores/alertStore'
import { useToastStore } from '../stores/toastStore'
import { useNavBadgeStore } from '../stores/navBadgeStore'
import { routeNotification } from '../services/notificationRouter'
import { grantAchievementCosmetics } from '../services/rewardGrant'
import { computeTotalSkillLevelFromLevels, normalizeSkillId, skillLevelFromXP, SKILLS } from '../lib/skills'
import { syncAchievementsToSupabase } from '../services/supabaseSync'
import { normalizeEquippedLoot, type LootSlot } from '../lib/loot'
import { fetchGuildTagsForUsers } from '../services/guildService'

export interface FriendSkill {
  skill_id: string
  level: number
  total_xp?: number
}

export interface FriendProfile {
  id: string
  username: string | null
  avatar_url: string | null
  level: number
  xp: number
  current_activity: string | null
  is_online: boolean
  streak_count: number
  friendship_id: string
  friendship_status: string
  /** Equipped badge IDs (synced from cosmetics) */
  equipped_badges?: string[]
  /** Equipped frame ID (synced from cosmetics) */
  equipped_frame?: string | null
  /** Equipped loot by slot for social profile rendering */
  equipped_loot?: Partial<Record<LootSlot, string>>
  /** Optional status title from aura/equipment perks */
  status_title?: string | null
  /** Top 3 skills by level (for badge display) */
  top_skills?: FriendSkill[]
  /** Full skill levels map from user_skills (all skills) */
  all_skills?: FriendSkill[]
  /** Sum of all skill levels (for display e.g. 25/792) */
  total_skill_level?: number
  /** Focus persona: developer, gamer, scholar, etc. (synced from app) */
  persona_id?: string | null
  /** Number of confirmed rows in user_skills */
  skill_rows_count?: number
  /** Explicit sync state for user_skills rendering */
  skills_sync_status?: 'synced' | 'pending'
  /** Last known user_skills update timestamp */
  skills_last_synced_at?: string | null
  /** Last profile/presence update timestamp (used for last seen). */
  last_seen_at?: string | null
  /** Guild tag the user belongs to, e.g. "GLD" */
  guild_tag?: string | null
}

export interface PendingRequest {
  friendship_id: string
  direction: 'incoming' | 'outgoing'
  profile: {
    id: string
    username: string | null
    avatar_url: string | null
    level: number
    equipped_frame?: string | null
    /** Total skill level from user_skills (sum of all skills); preferred over profiles.level */
    total_skill_level?: number
  }
}

const ONLINE_STALE_MS = 3 * 60 * 1000

function isFreshOnlinePresence(rawOnline: unknown, updatedAt: unknown): boolean {
  if (!rawOnline) return false
  if (typeof updatedAt !== 'string' || !updatedAt) return false
  const ts = Date.parse(updatedAt)
  if (Number.isNaN(ts)) return false
  return Date.now() - ts <= ONLINE_STALE_MS
}

export function useFriends() {
  const { user } = useAuthStore()
  const [friends, setFriends] = useState<FriendProfile[]>([])
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([])
  const [unreadByFriendId, setUnreadByFriendId] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const pushAlert = useAlertStore((s) => s.push)
  const pushToast = useToastStore((s) => s.push)
  const previousFriendsRef = useRef<FriendProfile[] | null>(null)
  const getFriendsCacheKey = useCallback(() => (user ? `grindly_friends_cache_${user.id}` : null), [user])

  const fetchFriends = useCallback(async (showLoading = false) => {
    if (!supabase || !user) {
      setFriends([])
      setPendingRequests([])
      setLoading(false)
      setError(null)
      useNavBadgeStore.getState().setIncomingRequestsCount(0)
      return
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setError('Failed to load friends. Check your internet connection.')
      setLoading(false)
      return
    }
    setError(null)
    if (showLoading) setLoading(true)
    try {
      // Fetch all friendships (both accepted and pending)
      const { data: fs, error: fsError } = await supabase
        .from('friendships')
        .select('id, status, user_id, friend_id')
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
      if (fsError) {
        console.error('[useFriends] friendships error:', fsError)
        setError('Failed to load friends. Check your internet connection.')
        setFriends([])
        setPendingRequests([])
        return
      }

      const accepted = (fs || []).filter((f) => f.status === 'accepted')
      const pending = (fs || []).filter((f) => f.status === 'pending')

      // Fetch accepted friend profiles
      const acceptedIds = accepted.map((f) => (f.user_id === user.id ? f.friend_id : f.user_id))
      let friendList: FriendProfile[] = []
      if (acceptedIds.length > 0) {
        const { data: profiles, error: profError } = await supabase.from('profiles').select('*').in('id', acceptedIds)
        if (profError) {
          console.error('[useFriends] profiles error:', profError)
          setError('Failed to load friends. Check your internet connection.')
          setFriends([])
          setPendingRequests([])
          return
        }
        friendList = (profiles || []).map((p: Record<string, unknown>) => {
          const f = accepted.find((x) => x.user_id === p.id || x.friend_id === p.id)!
          return {
            id: p.id as string,
            username: (p.username as string | null) ?? null,
            avatar_url: (p.avatar_url as string | null) ?? null,
            level: Number(p.level) || 0,
            xp: Number(p.xp) || 0,
            current_activity: (p.current_activity as string | null) ?? null,
            is_online: isFreshOnlinePresence(p.is_online, p.updated_at),
            streak_count: Number(p.streak_count) || 0,
            friendship_id: f.id,
            friendship_status: f.status,
            top_skills: [] as FriendSkill[],
            total_skill_level: 0,
            persona_id: (p.persona_id as string | null) ?? null,
            equipped_badges: Array.isArray(p.equipped_badges) ? (p.equipped_badges as string[]) : [],
            equipped_frame: (p.equipped_frame as string | null) ?? null,
            equipped_loot: normalizeEquippedLoot(p.equipped_loot),
            status_title: (p.status_title as string | null) ?? null,
            skill_rows_count: 0,
            skills_sync_status: 'pending' as const,
            skills_last_synced_at: null,
            last_seen_at: (p.updated_at as string | null) ?? null,
          }
        })
        try {
          let skillsRows: Array<{
            user_id: string
            skill_id: string
            level: number | null
            total_xp?: number | null
            updated_at?: string | null
          }> = []
          const primarySkillsRes = await supabase
            .from('user_skills')
            .select('user_id, skill_id, level, total_xp, updated_at')
            .in('user_id', acceptedIds)
          if (primarySkillsRes.error) {
            // Backward-compatible fallback for deployments without total_xp column.
            const fallbackSkillsRes = await supabase
              .from('user_skills')
              .select('user_id, skill_id, level, updated_at')
              .in('user_id', acceptedIds)
            skillsRows = (fallbackSkillsRes.data || []) as typeof skillsRows
          } else {
            skillsRows = (primarySkillsRes.data || []) as typeof skillsRows
          }
          const skillsByUser = new Map<string, Map<string, { skill_id: string; level: number; total_xp: number }>>()
          const lastSkillSyncByUser = new Map<string, string>()
          for (const row of skillsRows || []) {
            const userId = (row as { user_id: string }).user_id
            const skill_id = normalizeSkillId((row as { skill_id: string }).skill_id)
            const levelRaw = (row as { level: number | null }).level ?? 0
            const totalXp = (row as { total_xp?: number | null }).total_xp ?? 0
            const updatedAt = (row as { updated_at?: string | null }).updated_at ?? null
            const level = Math.max(0, Math.max(levelRaw, skillLevelFromXP(totalXp)))
            const bySkill = skillsByUser.get(userId) || new Map<string, { skill_id: string; level: number; total_xp: number }>()
            const prev = bySkill.get(skill_id)
            bySkill.set(skill_id, {
              skill_id,
              level: Math.max(prev?.level ?? 0, level),
              total_xp: Math.max(prev?.total_xp ?? 0, totalXp),
            })
            skillsByUser.set(userId, bySkill)
            if (updatedAt) {
              const prevSync = lastSkillSyncByUser.get(userId)
              if (!prevSync || updatedAt > prevSync) lastSkillSyncByUser.set(userId, updatedAt)
            }
          }
          friendList = friendList.map((p) => {
            const allSkills = Array.from((skillsByUser.get(p.id) || new Map()).values())
            const fullSkills: FriendSkill[] | undefined = allSkills.length > 0
              ? SKILLS.map((skillDef) => {
                const row = allSkills.find((s) => s.skill_id === skillDef.id)
                return { skill_id: skillDef.id, level: Math.max(0, row?.level ?? 0), total_xp: row?.total_xp ?? 0 }
              })
              : undefined
            const total_skill_level = allSkills.length > 0
              ? computeTotalSkillLevelFromLevels(allSkills)
              : 0
            const list = allSkills.length > 0
              ? [...allSkills].sort((a, b) => b.level - a.level).slice(0, 3)
              : []
            return {
              ...p,
              top_skills: list,
              all_skills: fullSkills,
              total_skill_level,
              skill_rows_count: allSkills.length,
              skills_sync_status: allSkills.length > 0 ? 'synced' : 'pending',
              skills_last_synced_at: lastSkillSyncByUser.get(p.id) ?? null,
            }
          })
        } catch {
          // user_skills table may not exist yet
        }
      }

      // Enrich with guild tags (best-effort, non-blocking)
      if (friendList.length > 0) {
        try {
          const guildTags = await fetchGuildTagsForUsers(friendList.map((f) => f.id))
          if (Object.keys(guildTags).length > 0) {
            for (const f of friendList) {
              f.guild_tag = guildTags[f.id]?.tag ?? null
            }
          }
        } catch { /* non-fatal */ }
      }

      // Guard against transient empty payloads: keep cached/previous friends instead of wiping UI.
      if (friendList.length === 0) {
        const prev = previousFriendsRef.current
        if (prev && prev.length > 0) {
          setFriends(prev)
        } else {
          const key = getFriendsCacheKey()
          if (key) {
            try {
              const cached = JSON.parse(localStorage.getItem(key) || '[]') as FriendProfile[]
              if (Array.isArray(cached) && cached.length > 0) {
                setFriends(cached)
              }
            } catch {
              // ignore cache parse issues
            }
          }
        }
      }

      // Friend toasts + bell notifications: came online, leveled up
      const prev = previousFriendsRef.current
      if (prev !== null) {
        const name = (f: FriendProfile) => f.username?.trim() || 'Friend'
        for (const friend of friendList) {
          const p = prev.find((x) => x.id === friend.id)
          if (!p?.is_online && friend.is_online) {
            pushToast({ kind: 'friend_online', friendName: name(friend) })
          }
          const prevLevel = p?.total_skill_level ?? 0
          const newLevel = friend.total_skill_level ?? 0
          if (prevLevel > 0 && newLevel > prevLevel) {
            routeNotification({
              type: 'friend_levelup',
              icon: '⬆️',
              title: `${name(friend)} leveled up!`,
              body: `Total level: ${prevLevel} → ${newLevel}`,
              dedupeKey: `friend-level:${friend.id}:${newLevel}`,
            }, window.electronAPI || null).catch(() => {})
          }
        }
      }
      previousFriendsRef.current = friendList
      setFriends(friendList)
      const cacheKey = getFriendsCacheKey()
      if (cacheKey) {
        try {
          localStorage.setItem(cacheKey, JSON.stringify(friendList))
        } catch {
          // ignore cache write issues
        }
      }

      // Unread message count per friend (messages they sent to me, not read)
      if (acceptedIds.length > 0) {
        const { data: unreadRows } = await supabase
          .from('messages')
          .select('sender_id')
          .eq('receiver_id', user.id)
          .is('read_at', null)
          .in('sender_id', acceptedIds)
        const byFriend: Record<string, number> = {}
        let totalUnread = 0
        for (const row of unreadRows || []) {
          const sid = (row as { sender_id: string }).sender_id
          byFriend[sid] = (byFriend[sid] || 0) + 1
          totalUnread++
        }
        setUnreadByFriendId(byFriend)
        useNavBadgeStore.getState().setUnreadMessagesCount(totalUnread)
      } else {
        setUnreadByFriendId({})
        useNavBadgeStore.getState().setUnreadMessagesCount(0)
      }

      // Check social achievements
      const alreadyUnlocked = JSON.parse(localStorage.getItem('grindly_unlocked_achievements') || '[]') as string[]
      const newSocial = checkSocialAchievements(friendList.length, alreadyUnlocked)
      if (newSocial.length > 0) {
        const updated = [...alreadyUnlocked, ...newSocial.map((s) => s.id)]
        localStorage.setItem('grindly_unlocked_achievements', JSON.stringify(updated))
        const api = window.electronAPI
        if (api?.db?.unlockAchievement) {
          for (const { id } of newSocial) {
            api.db.unlockAchievement(id)
            grantAchievementCosmetics(id)
          }
        }
        syncAchievementsToSupabase(newSocial.map((s) => s.id)).catch(() => {})
        for (const { def } of newSocial) {
          pushAlert(def)
        }
      }

      // Fetch pending request profiles + user_skills for correct total skill level
      const pendingIds = pending.map((f) => (f.user_id === user.id ? f.friend_id : f.user_id))
      let pendingList: PendingRequest[] = []
      if (pendingIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, username, avatar_url, level, equipped_frame').in('id', pendingIds)
        let skillsRows: Array<{ user_id: string; skill_id: string; level: number | null; total_xp?: number | null }> = []
        try {
          const skillsRes = await supabase
            .from('user_skills')
            .select('user_id, skill_id, level, total_xp')
            .in('user_id', pendingIds)
          if (!skillsRes.error) {
            skillsRows = (skillsRes.data || []) as typeof skillsRows
          }
        } catch {
          // user_skills may not exist
        }
        const skillsByUser = new Map<string, Array<{ skill_id: string; level: number }>>()
        for (const row of skillsRows) {
          const userId = row.user_id
          const skill_id = normalizeSkillId(row.skill_id)
          const totalXp = row.total_xp ?? 0
          const levelRaw = row.level ?? 0
          const level = Math.max(0, Math.max(levelRaw, skillLevelFromXP(totalXp)))
          const arr = skillsByUser.get(userId) || []
          const prev = arr.find((s) => s.skill_id === skill_id)
          if (prev) {
            prev.level = Math.max(prev.level, level)
          } else {
            arr.push({ skill_id, level })
          }
          skillsByUser.set(userId, arr)
        }
        pendingList = (profiles || []).map((p) => {
          const f = pending.find((x) => x.user_id === p.id || x.friend_id === p.id)!
          const allSkills = skillsByUser.get(p.id as string) || []
          const total_skill_level = allSkills.length > 0 ? computeTotalSkillLevelFromLevels(allSkills) : undefined
          return {
            friendship_id: f.id,
            direction: (f.friend_id === user.id ? 'incoming' : 'outgoing') as 'incoming' | 'outgoing',
            profile: {
              ...p,
              total_skill_level,
            },
          }
        })
      }
      setPendingRequests(pendingList)
      const incoming = pendingList.filter((r) => r.direction === 'incoming').length
      useNavBadgeStore.getState().setIncomingRequestsCount(incoming)
    } catch (e) {
      console.error('[useFriends] unexpected error:', e)
      setError('Failed to load friends. Check your internet connection.')
      setFriends([])
      setPendingRequests([])
      useNavBadgeStore.getState().setIncomingRequestsCount(0)
    } finally {
      setLoading(false)
    }
  }, [user, pushAlert, pushToast, getFriendsCacheKey])

  const acceptRequest = useCallback(async (friendshipId: string) => {
    if (!supabase) return
    await supabase.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId)
    await fetchFriends()
  }, [fetchFriends])

  const rejectRequest = useCallback(async (friendshipId: string) => {
    if (!supabase) return
    await supabase.from('friendships').delete().eq('id', friendshipId)
    fetchFriends()
  }, [fetchFriends])

  const removeFriend = useCallback(async (friendshipId: string): Promise<boolean> => {
    if (!supabase) return false
    const { error } = await supabase.from('friendships').delete().eq('id', friendshipId)
    if (error) {
      setError('Failed to remove friend. Check your internet connection.')
      return false
    }
    await fetchFriends(true)
    return true
  }, [fetchFriends])

  useEffect(() => {
    fetchFriends()
  }, [fetchFriends])

  useEffect(() => {
    if (!supabase || !user) return
    const channel = supabase
      .channel('friends-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        fetchFriends()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => {
        fetchFriends()
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, fetchFriends])

  // Refresh unread counts when messages change (new message or read)
  const friendIds = friends.map((f) => f.id)
  useEffect(() => {
    if (!supabase || !user?.id || friendIds.length === 0) return
    const refreshUnread = async () => {
      const { data: rows } = await supabase
        .from('messages')
        .select('sender_id')
        .eq('receiver_id', user.id)
        .is('read_at', null)
        .in('sender_id', friendIds)
      const byFriend: Record<string, number> = {}
      let totalUnread = 0
      for (const row of rows || []) {
        const sid = (row as { sender_id: string }).sender_id
        byFriend[sid] = (byFriend[sid] || 0) + 1
        totalUnread++
      }
      setUnreadByFriendId(byFriend)
      useNavBadgeStore.getState().setUnreadMessagesCount(totalUnread)
    }
    const channel = supabase
      .channel('messages-unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` }, refreshUnread)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` }, refreshUnread)
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.id, supabase, friendIds.join(',')])

  // Poll presence/activity with eco mode when app is hidden.
  useEffect(() => {
    if (!user) return
    let timer: ReturnType<typeof setTimeout> | null = null
    let cancelled = false
    const loop = async () => {
      if (cancelled) return
      await fetchFriends()
      const hidden = typeof document !== 'undefined' && document.hidden
      const delay = hidden ? 60_000 : 15_000
      timer = setTimeout(loop, delay)
    }
    loop()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [user, fetchFriends])

  const refresh = useCallback(() => fetchFriends(true), [fetchFriends])
  return { friends, pendingRequests, unreadByFriendId, loading, error, refresh, acceptRequest, rejectRequest, removeFriend }
}

export type FriendsModel = ReturnType<typeof useFriends>
