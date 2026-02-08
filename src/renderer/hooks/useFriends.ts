import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { checkSocialAchievements } from '../lib/xp'
import { useAlertStore } from '../stores/alertStore'
import { unlockCosmeticsFromAchievement } from '../lib/cosmetics'

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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const pushAlert = useAlertStore((s) => s.push)

  const fetchFriends = useCallback(async () => {
    if (!supabase || !user) {
      setFriends([])
      setPendingRequests([])
      setLoading(false)
      setError(null)
      return
    }
    setError(null)
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
          }
        })
        try {
          const { data: skillsRows } = await supabase.from('user_skills').select('user_id, skill_id, level').in('user_id', acceptedIds)
          const skillsByUser = new Map<string, { skill_id: string; level: number }[]>()
          for (const row of skillsRows || []) {
            const list = skillsByUser.get(row.user_id) || []
            list.push({ skill_id: row.skill_id, level: row.level })
            skillsByUser.set(row.user_id, list)
          }
          friendList = friendList.map((p) => {
            const list = (skillsByUser.get(p.id) || []).sort((a, b) => b.level - a.level).slice(0, 3)
            return { ...p, top_skills: list }
          })
        } catch {
          // user_skills table may not exist yet
        }
      }
      setFriends(friendList)

      // Check social achievements
      const alreadyUnlocked = JSON.parse(localStorage.getItem('grinder_unlocked_achievements') || '[]') as string[]
      const newSocial = checkSocialAchievements(friendList.length, alreadyUnlocked)
      if (newSocial.length > 0) {
        const updated = [...alreadyUnlocked, ...newSocial.map((s) => s.id)]
        localStorage.setItem('grinder_unlocked_achievements', JSON.stringify(updated))
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
    } catch (e) {
      console.error('[useFriends] unexpected error:', e)
      setError(e instanceof Error ? e.message : 'Failed to load friends')
      setFriends([])
      setPendingRequests([])
    } finally {
      setLoading(false)
    }
  }, [user, pushAlert])

  const acceptRequest = useCallback(async (friendshipId: string) => {
    if (!supabase) return
    await supabase.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId)
    fetchFriends()
  }, [fetchFriends])

  const rejectRequest = useCallback(async (friendshipId: string) => {
    if (!supabase) return
    await supabase.from('friendships').delete().eq('id', friendshipId)
    fetchFriends()
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

  return { friends, pendingRequests, loading, error, refresh: fetchFriends, acceptRequest, rejectRequest }
}
