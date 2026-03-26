import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useNavBadgeStore } from '../stores/navBadgeStore'

export interface ChatMessage {
  id: string
  sender_id: string
  receiver_id: string
  body: string
  created_at: string
  read_at: string | null
}

// messageId → reaction → userId[]
export type ReactionsMap = Record<string, Record<string, string[]>>

const PAGE_SIZE = 50

/** @param peerId When set, new messages from this peer are appended to the thread and do not increase unread count. */
export function useChat(peerId: string | null = null) {
  const { user } = useAuthStore()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [reactions, setReactions] = useState<ReactionsMap>({})
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMoreMessages, setHasMoreMessages] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const { setUnreadMessagesCount } = useNavBadgeStore()

  // Track the latest message timestamp for incremental polling
  const latestCreatedAtRef = useRef<string | null>(null)

  const fetchUnreadCount = useCallback(async () => {
    if (!supabase || !user?.id) return
    const { count, error } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('receiver_id', user.id)
      .is('read_at', null)
    if (!error) setUnreadMessagesCount(count ?? 0)
  }, [user?.id, setUnreadMessagesCount])

  useEffect(() => {
    if (!user?.id) {
      setUnreadMessagesCount(0)
      return
    }
    fetchUnreadCount()
  }, [user?.id, fetchUnreadCount, setUnreadMessagesCount])

  // Polling: fetch only NEW messages after our latest known timestamp
  useEffect(() => {
    if (!supabase || !user?.id || !peerId) return
    const poll = async () => {
      const since = latestCreatedAtRef.current
      let query = supabase
        .from('messages')
        .select('id, sender_id, receiver_id, body, created_at, read_at')
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${peerId}),and(sender_id.eq.${peerId},receiver_id.eq.${user.id})`)
        .order('created_at', { ascending: true })
      if (since) query = query.gt('created_at', since)
      const { data } = await query
      if (!data || data.length === 0) return
      setMessages((prev) => {
        const ids = new Set(prev.map((m) => m.id))
        const fresh = (data as ChatMessage[]).filter((m) => !ids.has(m.id))
        if (fresh.length === 0) return prev
        return [...prev, ...fresh].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      })
      const latest = (data as ChatMessage[]).at(-1)
      if (latest) latestCreatedAtRef.current = latest.created_at
      fetchReactions((data as ChatMessage[]).map((m) => m.id))
    }
    const interval = setInterval(poll, 5000)
    return () => clearInterval(interval)
  }, [user?.id, peerId])

  const fetchReactions = useCallback(async (messageIds: string[]) => {
    if (!supabase || messageIds.length === 0) return
    const { data } = await supabase
      .from('message_reactions')
      .select('message_id, user_id, reaction')
      .in('message_id', messageIds)
    if (!data) return
    const map: ReactionsMap = {}
    for (const row of data as { message_id: string; user_id: string; reaction: string }[]) {
      if (!map[row.message_id]) map[row.message_id] = {}
      if (!map[row.message_id][row.reaction]) map[row.message_id][row.reaction] = []
      map[row.message_id][row.reaction].push(row.user_id)
    }
    // Merge into existing reactions (don't wipe reactions for messages not in this batch)
    setReactions((prev) => ({ ...prev, ...map }))
  }, [])

  const getConversation = useCallback(
    async (otherUserId: string) => {
      if (!supabase || !user?.id) return []
      setLoading(true)
      latestCreatedAtRef.current = null
      const { data, error } = await supabase
        .from('messages')
        .select('id, sender_id, receiver_id, body, created_at, read_at')
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${user.id})`)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)
      setLoading(false)
      if (error) return []
      const msgs = ((data as ChatMessage[]) ?? []).reverse()
      setMessages(msgs)
      setHasMoreMessages((data?.length ?? 0) === PAGE_SIZE)
      latestCreatedAtRef.current = msgs.length > 0 ? msgs[msgs.length - 1].created_at : null
      fetchReactions(msgs.map((m) => m.id))
      return msgs
    },
    [user?.id, fetchReactions]
  )

  const loadMoreMessages = useCallback(
    async (otherUserId: string, oldestCreatedAt: string) => {
      if (!supabase || !user?.id) return
      setLoadingMore(true)
      const { data, error } = await supabase
        .from('messages')
        .select('id, sender_id, receiver_id, body, created_at, read_at')
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${user.id})`)
        .lt('created_at', oldestCreatedAt)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)
      setLoadingMore(false)
      if (error || !data) return
      const older = ((data as ChatMessage[]) ?? []).reverse()
      setMessages((prev) => {
        const ids = new Set(prev.map((m) => m.id))
        return [...older.filter((m) => !ids.has(m.id)), ...prev]
      })
      setHasMoreMessages((data.length ?? 0) === PAGE_SIZE)
      fetchReactions(older.map((m) => m.id))
    },
    [user?.id, fetchReactions]
  )

  const toggleReaction = useCallback(
    async (messageId: string, reaction: string) => {
      if (!supabase || !user?.id) return
      const existing = reactions[messageId]?.[reaction]?.includes(user.id)
      // Optimistic update
      setReactions((prev) => {
        const next = { ...prev }
        if (!next[messageId]) next[messageId] = {}
        const users = next[messageId][reaction] ? [...next[messageId][reaction]] : []
        if (existing) {
          next[messageId] = { ...next[messageId], [reaction]: users.filter((id) => id !== user.id) }
        } else {
          next[messageId] = { ...next[messageId], [reaction]: [...users, user.id] }
        }
        return next
      })
      if (existing) {
        await supabase
          .from('message_reactions')
          .delete()
          .eq('message_id', messageId)
          .eq('user_id', user.id)
          .eq('reaction', reaction)
      } else {
        await supabase
          .from('message_reactions')
          .insert({ message_id: messageId, user_id: user.id, reaction })
      }
    },
    [user?.id, reactions]
  )

  const sendMessage = useCallback(
    async (receiverId: string, body: string) => {
      if (!supabase || !user?.id || !body.trim()) return
      setSending(true)
      setSendError(null)
      const { data, error } = await supabase
        .from('messages')
        .insert({ sender_id: user.id, receiver_id: receiverId, body: body.trim() })
        .select('id, sender_id, receiver_id, body, created_at, read_at')
        .single()
      setSending(false)
      if (error) {
        console.error('[useChat] send failed:', error)
        setSendError(error.message)
        return
      }
      if (data) {
        const msg = data as ChatMessage
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev
          return [...prev, msg].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        })
        latestCreatedAtRef.current = msg.created_at
      }
    },
    [user?.id]
  )

  const markConversationRead = useCallback(
    async (otherUserId: string) => {
      if (!supabase || !user?.id) return
      await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('receiver_id', user.id)
        .eq('sender_id', otherUserId)
        .is('read_at', null)
      fetchUnreadCount()
    },
    [user?.id, fetchUnreadCount]
  )

  return {
    messages,
    reactions,
    loading,
    loadingMore,
    hasMoreMessages,
    sending,
    sendError,
    getConversation,
    loadMoreMessages,
    sendMessage,
    markConversationRead,
    fetchUnreadCount,
    toggleReaction,
  }
}
