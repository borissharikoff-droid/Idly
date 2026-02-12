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

let _channelSeq = 0

/** @param peerId When set, new messages from this peer are appended to the thread in real-time. */
export function useChat(peerId: string | null = null) {
  const { user } = useAuthStore()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const { setUnreadMessagesCount } = useNavBadgeStore()
  const peerIdRef = useRef(peerId)
  peerIdRef.current = peerId

  const fetchUnreadCount = useCallback(async () => {
    if (!supabase || !user?.id) return
    const { count, error } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('receiver_id', user.id)
      .is('read_at', null)
    if (!error) setUnreadMessagesCount(count ?? 0)
  }, [user?.id, setUnreadMessagesCount])

  // Real-time: append messages from the currently open peer to the thread
  useEffect(() => {
    if (!supabase || !user?.id) return
    const channelName = `dm-thread-${++_channelSeq}`
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as ChatMessage
          const currentPeer = peerIdRef.current
          if (currentPeer !== null && row.sender_id === currentPeer) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === row.id)) return prev
              return [...prev, row].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
            })
          }
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.id])

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
      setMessages((data as ChatMessage[]) ?? [])
      return (data as ChatMessage[]) ?? []
    },
    [user?.id]
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
      // Clear taskbar badge when reading messages
      try { (window.electronAPI as any)?.window?.setBadgeCount?.(0) } catch {}
    },
    [user?.id, fetchUnreadCount]
  )

  return {
    messages,
    loading,
    sending,
    sendError,
    getConversation,
    sendMessage,
    markConversationRead,
    fetchUnreadCount,
  }
}
