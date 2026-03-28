import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useNavBadgeStore } from '../stores/navBadgeStore'

export interface GroupChat {
  id: string
  name: string
  owner_id: string
  created_at: string
}

export interface GroupMember {
  user_id: string
  username: string | null
  avatar_url: string | null
  equipped_frame?: string | null
  joined_at: string
}

export type GroupReactionsMap = Record<string, Record<string, string[]>>

export interface GroupMessage {
  id: string
  group_id: string
  sender_id: string
  sender_username: string | null
  body: string
  created_at: string
}

export interface GroupLastMessage {
  body: string
  sender_id: string
  sender_username: string | null
  created_at: string
}

export interface GroupChatPreview extends GroupChat {
  lastMessage: GroupLastMessage | null
  hasUnread: boolean
  memberCount: number
  otherMember: { username: string | null; avatar_url: string | null } | null
}

const PAGE_SIZE = 50

const SEEN_KEY = (id: string) => `grindly_group_seen_${id}`

/** Write the last-seen timestamp for a group. Call when opening a group chat. */
export function markGroupRead(groupId: string, createdAt: string) {
  localStorage.setItem(SEEN_KEY(groupId), createdAt)
}

// ── Group list (all groups the current user is in) ───────────────────────────

export function useGroupChatList() {
  const { user } = useAuthStore()
  const [groups, setGroups] = useState<GroupChatPreview[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!supabase || !user?.id) return
    setLoading(true)

    const { data } = await supabase
      .from('group_chat_members')
      .select('group_id, group_chats(id, name, owner_id, created_at)')
      .eq('user_id', user.id)

    if (!data) { setLoading(false); return }

    const rawGroups: GroupChat[] = data
      .map((row: { group_chats: GroupChat | GroupChat[] | null }) => {
        const g = row.group_chats
        return Array.isArray(g) ? g[0] : g
      })
      .filter(Boolean) as GroupChat[]

    // Fetch last message per group (N is small — typically < 10)
    type RawMsg = { body: string; sender_id: string; created_at: string; profiles: { username: string | null } | { username: string | null }[] | null }
    const lastMsgResults = await Promise.all(
      rawGroups.map((g) =>
        supabase!
          .from('group_messages')
          .select('body, sender_id, created_at, profiles(username)')
          .eq('group_id', g.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      )
    )

    // Fetch all members for all groups in one query
    const groupIds = rawGroups.map((g) => g.id)
    type RawMember = { group_id: string; user_id: string; profiles: { username: string | null; avatar_url: string | null } | { username: string | null; avatar_url: string | null }[] | null }
    const { data: allMembersData } = groupIds.length > 0
      ? await supabase!.from('group_chat_members').select('group_id, user_id, profiles(username, avatar_url)').in('group_id', groupIds)
      : { data: [] as RawMember[] }
    const membersByGroup: Record<string, RawMember[]> = {}
    for (const m of (allMembersData ?? []) as RawMember[]) {
      if (!membersByGroup[m.group_id]) membersByGroup[m.group_id] = []
      membersByGroup[m.group_id].push(m)
    }

    const previews: GroupChatPreview[] = rawGroups.map((g, i) => {
      const raw = lastMsgResults[i]?.data as RawMsg | null
      const lastMessage: GroupLastMessage | null = raw
        ? {
            body: raw.body,
            sender_id: raw.sender_id,
            sender_username: (Array.isArray(raw.profiles) ? raw.profiles[0] : raw.profiles)?.username ?? null,
            created_at: raw.created_at,
          }
        : null
      const seenAt = localStorage.getItem(SEEN_KEY(g.id))
      const hasUnread = !!(
        lastMessage &&
        lastMessage.sender_id !== user.id &&
        (!seenAt || lastMessage.created_at > seenAt)
      )
      const groupMembers = membersByGroup[g.id] ?? []
      const memberCount = groupMembers.length
      const otherMemberRaw = groupMembers.find((m) => m.user_id !== user.id)
      const otherMemberProfile = otherMemberRaw
        ? (Array.isArray(otherMemberRaw.profiles) ? otherMemberRaw.profiles[0] : otherMemberRaw.profiles)
        : null
      const otherMember = memberCount === 2 && otherMemberProfile
        ? { username: otherMemberProfile.username, avatar_url: otherMemberProfile.avatar_url }
        : null
      return { ...g, lastMessage, hasUnread, memberCount, otherMember }
    })

    // Sort by most recent activity
    previews.sort((a, b) => {
      const at = a.lastMessage?.created_at ?? a.created_at
      const bt = b.lastMessage?.created_at ?? b.created_at
      return new Date(bt).getTime() - new Date(at).getTime()
    })

    setLoading(false)
    setGroups(previews)

    // Propagate unread count to nav badge
    const unreadCount = previews.filter((g) => g.hasUnread).length
    useNavBadgeStore.getState().setUnreadGroupsCount(unreadCount)
  }, [user?.id])

  useEffect(() => { refresh() }, [refresh])

  // Poll for new messages / unread updates
  useEffect(() => {
    const interval = setInterval(refresh, 15_000)
    return () => clearInterval(interval)
  }, [refresh])

  // Realtime: refresh when added to a new group
  useEffect(() => {
    if (!supabase || !user?.id) return
    const channel = supabase
      .channel(`group_membership:${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'group_chat_members',
        filter: `user_id=eq.${user.id}`,
      }, () => refresh())
      .subscribe()
    return () => { supabase!.removeChannel(channel) }
  }, [user?.id, refresh])

  /** Mark a group as read and immediately update local state. */
  const markRead = useCallback((groupId: string) => {
    const group = groups.find((g) => g.id === groupId)
    const ts = group?.lastMessage?.created_at
    if (ts) markGroupRead(groupId, ts)
    setGroups((prev) => {
      const next = prev.map((g) => g.id === groupId ? { ...g, hasUnread: false } : g)
      // Defer badge update to avoid calling external setState inside a setter (React warning)
      const unreadCount = next.filter((g) => g.hasUnread).length
      setTimeout(() => useNavBadgeStore.getState().setUnreadGroupsCount(unreadCount), 0)
      return next
    })
  }, [groups])

  const createGroup = useCallback(
    async (name: string, memberIds: string[]): Promise<GroupChatPreview | null> => {
      if (!supabase || !user?.id || !name.trim()) return null
      const { data: groupData, error } = await supabase
        .from('group_chats')
        .insert({ name: name.trim(), owner_id: user.id })
        .select('id, name, owner_id, created_at')
        .single()
      if (error || !groupData) return null
      const group = groupData as GroupChat
      const allIds = Array.from(new Set([user.id, ...memberIds]))
      await supabase
        .from('group_chat_members')
        .insert(allIds.map((uid) => ({ group_id: group.id, user_id: uid })))
      await refresh()
      return { ...group, lastMessage: null, hasUnread: false, memberCount: allIds.length, otherMember: null }
    },
    [user?.id, refresh]
  )

  const leaveGroup = useCallback(async (groupId: string) => {
    if (!supabase || !user?.id) return
    await supabase.from('group_chat_members').delete().eq('group_id', groupId).eq('user_id', user.id)
    setGroups((prev) => prev.filter((g) => g.id !== groupId))
    useNavBadgeStore.getState().setUnreadGroupsCount(
      groups.filter((g) => g.id !== groupId && g.hasUnread).length
    )
  }, [user?.id, groups])

  const deleteGroup = useCallback(async (groupId: string) => {
    if (!supabase) return
    await supabase.from('group_chats').delete().eq('id', groupId)
    setGroups((prev) => prev.filter((g) => g.id !== groupId))
    useNavBadgeStore.getState().setUnreadGroupsCount(
      groups.filter((g) => g.id !== groupId && g.hasUnread).length
    )
  }, [groups])

  return { groups, loading, refresh, createGroup, markRead, leaveGroup, deleteGroup }
}

// ── Single active group chat ─────────────────────────────────────────────────

export function useGroupChat(groupId: string | null) {
  const { user } = useAuthStore()
  const [group, setGroup] = useState<GroupChat | null>(null)
  const [members, setMembers] = useState<GroupMember[]>([])
  const [messages, setMessages] = useState<GroupMessage[]>([])
  const [reactions, setReactions] = useState<GroupReactionsMap>({})
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const latestCreatedAtRef = useRef<string | null>(null)

  // Fetch group metadata + members
  const fetchGroupInfo = useCallback(async () => {
    if (!supabase || !groupId) return
    const [{ data: groupData }, { data: membersData }] = await Promise.all([
      supabase.from('group_chats').select('id, name, owner_id, created_at').eq('id', groupId).single(),
      supabase
        .from('group_chat_members')
        .select('user_id, joined_at, profiles(username, avatar_url, equipped_frame)')
        .eq('group_id', groupId),
    ])
    if (groupData) setGroup(groupData as GroupChat)
    if (membersData) {
      setMembers(
        (membersData as unknown as { user_id: string; joined_at: string; profiles: { username: string | null; avatar_url: string | null; equipped_frame?: string | null } | { username: string | null; avatar_url: string | null; equipped_frame?: string | null }[] | null }[]).map(
          (row) => {
            const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
            return {
              user_id: row.user_id,
              username: p?.username ?? null,
              avatar_url: p?.avatar_url ?? null,
              equipped_frame: p?.equipped_frame ?? null,
              joined_at: row.joined_at,
            }
          }
        )
      )
    }
  }, [groupId])

  const fetchReactions = useCallback(async (messageIds: string[]) => {
    if (!supabase || messageIds.length === 0) return
    const { data } = await supabase
      .from('group_message_reactions')
      .select('group_message_id, user_id, reaction')
      .in('group_message_id', messageIds)
    if (!data) return
    const map: GroupReactionsMap = {}
    for (const row of data as { group_message_id: string; user_id: string; reaction: string }[]) {
      if (!map[row.group_message_id]) map[row.group_message_id] = {}
      if (!map[row.group_message_id][row.reaction]) map[row.group_message_id][row.reaction] = []
      map[row.group_message_id][row.reaction].push(row.user_id)
    }
    setReactions((prev) => ({ ...prev, ...map }))
  }, [])

  // Fetch initial messages
  const fetchMessages = useCallback(async () => {
    if (!supabase || !groupId) return
    setLoading(true)
    latestCreatedAtRef.current = null
    const { data } = await supabase
      .from('group_messages')
      .select('id, group_id, sender_id, body, created_at, profiles(username)')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)
    setLoading(false)
    if (!data) return
    const msgs = mapMessages(data).reverse()
    setMessages(msgs)
    latestCreatedAtRef.current = msgs.length > 0 ? msgs[msgs.length - 1].created_at : null
    fetchReactions(msgs.map((m) => m.id))
  }, [groupId, fetchReactions])

  useEffect(() => {
    if (!groupId) { setGroup(null); setMembers([]); setMessages([]); setReactions({}); return }
    fetchGroupInfo()
    fetchMessages()
  }, [groupId, fetchGroupInfo, fetchMessages])

  // Realtime subscription + polling fallback for new messages
  useEffect(() => {
    if (!supabase || !groupId || !user?.id) return

    const poll = async () => {
      const since = latestCreatedAtRef.current
      let query = supabase
        .from('group_messages')
        .select('id, group_id, sender_id, body, created_at, profiles(username)')
        .eq('group_id', groupId)
        .order('created_at', { ascending: true })
      if (since) query = query.gt('created_at', since)
      const { data } = await query
      if (!data || data.length === 0) return
      const fresh = mapMessages(data)
      setMessages((prev) => {
        const ids = new Set(prev.map((m) => m.id))
        const newMsgs = fresh.filter((m) => !ids.has(m.id))
        if (newMsgs.length === 0) return prev
        return [...prev, ...newMsgs]
      })
      latestCreatedAtRef.current = fresh[fresh.length - 1].created_at
    }

    // Realtime for instant delivery
    const channel = supabase
      .channel(`group_messages:${groupId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'group_messages', filter: `group_id=eq.${groupId}` },
        () => { void poll() },
      )
      .subscribe()

    // Polling as fallback (every 5s)
    const interval = setInterval(poll, 5000)

    return () => {
      clearInterval(interval)
      void supabase.removeChannel(channel)
    }
  }, [groupId, user?.id])

  const sendMessage = useCallback(
    async (body: string) => {
      if (!supabase || !user?.id || !groupId || !body.trim()) return
      setSending(true)
      setSendError(null)
      const { data, error } = await supabase
        .from('group_messages')
        .insert({ group_id: groupId, sender_id: user.id, body: body.trim() })
        .select('id, group_id, sender_id, body, created_at, profiles(username)')
        .single()
      setSending(false)
      if (error) { setSendError(error.message); return }
      if (data) {
        const msg = mapMessages([data])[0]
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
        latestCreatedAtRef.current = msg.created_at
      }
    },
    [user?.id, groupId]
  )

  const addMember = useCallback(
    async (userId: string) => {
      if (!supabase || !groupId) return
      await supabase.from('group_chat_members').insert({ group_id: groupId, user_id: userId })
      await fetchGroupInfo()
    },
    [groupId, fetchGroupInfo]
  )

  const removeMember = useCallback(
    async (userId: string) => {
      if (!supabase || !groupId) return
      await supabase.from('group_chat_members').delete().eq('group_id', groupId).eq('user_id', userId)
      await fetchGroupInfo()
    },
    [groupId, fetchGroupInfo]
  )

  const renameGroup = useCallback(
    async (name: string): Promise<string | null> => {
      if (!supabase || !groupId || !name.trim()) return 'Missing data'
      const { error } = await supabase.from('group_chats').update({ name: name.trim() }).eq('id', groupId)
      if (error) return error.message
      setGroup((prev) => (prev ? { ...prev, name: name.trim() } : prev))
      return null
    },
    [groupId]
  )

  const deleteGroup = useCallback(async () => {
    if (!supabase || !groupId) return
    await supabase.from('group_chats').delete().eq('id', groupId)
  }, [groupId])

  const leaveGroup = useCallback(async () => {
    if (!supabase || !groupId || !user?.id) return
    await supabase.from('group_chat_members').delete().eq('group_id', groupId).eq('user_id', user.id)
  }, [groupId, user?.id])

  const toggleReaction = useCallback(
    async (messageId: string, reaction: string) => {
      if (!supabase || !user?.id) return
      const existing = reactions[messageId]?.[reaction]?.includes(user.id)
      setReactions((prev) => {
        const next = { ...prev }
        if (!next[messageId]) next[messageId] = {}
        const users = next[messageId][reaction] ? [...next[messageId][reaction]] : []
        next[messageId] = { ...next[messageId], [reaction]: existing ? users.filter((id) => id !== user.id) : [...users, user.id] }
        return next
      })
      if (existing) {
        await supabase.from('group_message_reactions').delete()
          .eq('group_message_id', messageId).eq('user_id', user.id).eq('reaction', reaction)
      } else {
        await supabase.from('group_message_reactions').insert({ group_message_id: messageId, user_id: user.id, reaction })
      }
    },
    [user?.id, reactions]
  )

  return {
    group,
    members,
    messages,
    reactions,
    loading,
    sending,
    sendError,
    sendMessage,
    toggleReaction,
    addMember,
    removeMember,
    renameGroup,
    deleteGroup,
    leaveGroup,
    refetchMembers: fetchGroupInfo,
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapMessages(
  data: unknown[]
): GroupMessage[] {
  return (data as { id: string; group_id: string; sender_id: string; body: string; created_at: string; profiles: { username: string | null } | { username: string | null }[] | null }[]).map((row) => {
    const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
    return {
      id: row.id,
      group_id: row.group_id,
      sender_id: row.sender_id,
      sender_username: p?.username ?? null,
      body: row.body,
      created_at: row.created_at,
    }
  })
}
