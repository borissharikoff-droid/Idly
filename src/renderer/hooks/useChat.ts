import { useState, useEffect, useCallback } from 'react'
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

/** @param peerId When set, new messages from this peer are appended to the thread and do not increase unread count. */
export function useChat(peerId: string | null = null) {
  const { user } = useAuthStore()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [reactions, setReactions] = useState<ReactionsMap>({})
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const { setUnreadMessagesCount } = useNavBadgeStore()
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

  // Polling fallback: when chat is open, poll every 5s for new messages
  useEffect(() => {
    if (!supabase || !user?.id || !peerId) return
    const poll = async () => {
      const { data } = await supabase
        .from('messages')
        .select('id, sender_id, receiver_id, body, created_at, read_at')
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${peerId}),and(sender_id.eq.${peerId},receiver_id.eq.${user.id})`)
        .order('created_at', { ascending: true })
      if (data) setMessages(data as ChatMessage[])
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
    setReactions(map)
  }, [])

  const getConversation = useCallback(
    async (otherUserId: string) => {
      if (!supabase || !user?.id) return []
      setLoading(true)
      const { data, error } = await supabase
        .from('messages')
        .select('id, sender_id, receiver_id, body, created_at, read_at')
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${user.id})`)
        .order('created_at', { ascending: true })
      setLoading(false)
      if (error) return []
      const msgs = (data as ChatMessage[]) ?? []
      setMessages(msgs)
      fetchReactions(msgs.map((m) => m.id))
      return msgs
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
        setMessages((prev) => {
          if (prev.some((m) => m.id === (data as ChatMessage).id)) return prev
          return [...prev, data as ChatMessage].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        })
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
    sending,
    sendError,
    getConversation,
    sendMessage,
    markConversationRead,
    fetchUnreadCount,
    toggleReaction,
  }
}
