import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { checkSocialAchievements } from '../lib/xp'
import { useAlertStore } from '../stores/alertStore'
import { useFriendToastStore } from '../stores/friendToastStore'
import { useNavBadgeStore } from '../stores/navBadgeStore'
import { useNotificationStore } from '../stores/notificationStore'
import { unlockCosmeticsFromAchievement } from '../lib/cosmetics'
import { computeTotalSkillLevelFromLevels, normalizeSkillId, skillLevelFromXP } from '../lib/skills'

export interface FriendSkill {
  skill_id: string
  level: number
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
  /** Top 3 skills by level (for badge display) */
  top_skills?: FriendSkill[]
  /** Sum of all skill levels (for display e.g. 25/792) */
  total_skill_level?: number
  /** Focus persona: developer, gamer, scholar, etc. (synced from app) */
  persona_id?: string | null
}

export interface PendingRequest {
  friendship_id: string
  direction: 'incoming' | 'outgoing'
  profile: {
    id: string
    username: string | null
    avatar_url: string | null
    level: number
  }
}

export function useFriends() {
  const { user } = useAuthStore()
  const [friends, setFriends] = useState<FriendProfile[]>([])
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([])
  const [unreadByFriendId, setUnreadByFriendId] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const pushAlert = useAlertStore((s) => s.push)
  const pushFriendToast = useFriendToastStore((s) => s.push)
  const previousFriendsRef = useRef<FriendProfile[] | null>(null)

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
      setError('No internet connection')
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
        setError(fsError.message)
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
          setError(profError.message)
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
            level: Number(p.level) || 1,
            xp: Number(p.xp) || 0,
            current_activity: (p.current_activity as string | null) ?? null,
            is_online: Boolean(p.is_online),
            streak_count: Number(p.streak_count) || 0,
            friendship_id: f.id,
            friendship_status: f.status,
            top_skills: [] as FriendSkill[],
            persona_id: (p.persona_id as string | null) ?? null,
            equipped_badges: Array.isArray(p.equipped_badges) ? (p.equipped_badges as string[]) : [],
            equipped_frame: (p.equipped_frame as string | null) ?? null,
          }
        })
        try {
          const { data: skillsRows } = await supabase.from('user_skills').select('user_id, skill_id, level, total_xp').in('user_id', acceptedIds)
          const skillsByUser = new Map<string, Map<string, { skill_id: string; level: number }>>()
          for (const row of skillsRows || []) {
            const userId = (row as { user_id: string }).user_id
            const skill_id = normalizeSkillId((row as { skill_id: string }).skill_id)
            const levelRaw = (row as { level: number | null }).level ?? 0
            const totalXp = (row as { total_xp?: number | null }).total_xp ?? 0
            const level = Math.max(1, Math.max(levelRaw, skillLevelFromXP(totalXp)))
            const bySkill = skillsByUser.get(userId) || new Map<string, { skill_id: string; level: number }>()
            const prev = bySkill.get(skill_id)
            bySkill.set(skill_id, { skill_id, level: Math.max(prev?.level ?? 0, level) })
            skillsByUser.set(userId, bySkill)
          }
          friendList = friendList.map((p) => {
            const allSkills = Array.from((skillsByUser.get(p.id) || new Map()).values())
            const total_skill_level = allSkills.length > 0
              ? computeTotalSkillLevelFromLevels(allSkills)
              : (p.level ?? 0)
            const list = [...allSkills].sort((a, b) => b.level - a.level).slice(0, 3)
            return { ...p, top_skills: list, total_skill_level }
          })
        } catch {
          // user_skills table may not exist yet
        }
      }

      // Friend toasts + bell notifications: came online, leveled up
      const prev = previousFriendsRef.current
      if (prev !== null) {
        const name = (f: FriendProfile) => f.username?.trim() || 'Friend'
        const pushNotif = useNotificationStore.getState().push
        for (const friend of friendList) {
          const p = prev.find((x) => x.id === friend.id)
          if (!p?.is_online && friend.is_online) {
            pushFriendToast({ type: 'online', friendName: name(friend) })
            pushNotif({ type: 'friend_online', icon: friend.avatar_url || '🟢', title: `${name(friend)} is online`, body: friend.current_activity ? `Active: ${friend.current_activity}` : 'Just came online' })
          }
          const prevLevel = p?.total_skill_level ?? 0
          const newLevel = friend.total_skill_level ?? 0
          if (prevLevel > 0 && newLevel > prevLevel) {
            pushNotif({ type: 'friend_levelup', icon: '⬆️', title: `${name(friend)} leveled up!`, body: `Total level: ${prevLevel} → ${newLevel}` })
          }
        }
      }
      previousFriendsRef.current = friendList
      setFriends(friendList)

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
      const alreadyUnlocked = JSON.parse(localStorage.getItem('idly_unlocked_achievements') || '[]') as string[]
      const newSocial = checkSocialAchievements(friendList.length, alreadyUnlocked)
      if (newSocial.length > 0) {
        const updated = [...alreadyUnlocked, ...newSocial.map((s) => s.id)]
        localStorage.setItem('idly_unlocked_achievements', JSON.stringify(updated))
        const api = window.electronAPI
        if (api?.db?.unlockAchievement) {
          for (const { id } of newSocial) {
            api.db.unlockAchievement(id)
            unlockCosmeticsFromAchievement(id)
          }
        }
        for (const { def } of newSocial) {
          pushAlert(def)
        }
      }

      // Fetch pending request profiles
      const pendingIds = pending.map((f) => (f.user_id === user.id ? f.friend_id : f.user_id))
      let pendingList: PendingRequest[] = []
      if (pendingIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, username, avatar_url, level').in('id', pendingIds)
        pendingList = (profiles || []).map((p) => {
          const f = pending.find((x) => x.user_id === p.id || x.friend_id === p.id)!
          return {
            friendship_id: f.id,
            direction: (f.friend_id === user.id ? 'incoming' : 'outgoing') as 'incoming' | 'outgoing',
            profile: p,
          }
        })
      }
      setPendingRequests(pendingList)
      const incoming = pendingList.filter((r) => r.direction === 'incoming').length
      useNavBadgeStore.getState().setIncomingRequestsCount(incoming)
    } catch (e) {
      console.error('[useFriends] unexpected error:', e)
      setError(e instanceof Error ? e.message : 'Failed to load friends')
      setFriends([])
      setPendingRequests([])
      useNavBadgeStore.getState().setIncomingRequestsCount(0)
    } finally {
      setLoading(false)
    }
  }, [user, pushAlert, pushFriendToast])

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
      setError(`Remove failed: ${error.message}`)
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

  // Poll presence/activity every 15s so the Friends tab updates live without switching
  useEffect(() => {
    if (!user) return
    const interval = setInterval(fetchFriends, 15_000)
    return () => clearInterval(interval)
  }, [user, fetchFriends])

  const refresh = useCallback(() => fetchFriends(true), [fetchFriends])
  return { friends, pendingRequests, unreadByFriendId, loading, error, refresh, acceptRequest, rejectRequest, removeFriend }
}
