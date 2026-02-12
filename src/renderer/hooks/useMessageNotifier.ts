import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useNavBadgeStore } from '../stores/navBadgeStore'
import { useMessageToastStore } from '../stores/messageToastStore'
import { useNotificationStore } from '../stores/notificationStore'
import { playMessageSound } from '../lib/sounds'

/**
 * Global hook that listens for incoming messages on ALL tabs (not just friends).
 * Handles sound, taskbar flash, taskbar badge, friend toast, and message banner.
 * Must be called once in App.tsx.
 */
export function useMessageNotifier() {
  const { user } = useAuthStore()
  const { addUnreadMessages, setUnreadMessagesCount } = useNavBadgeStore()
  const unreadMessagesCount = useNavBadgeStore((s) => s.unreadMessagesCount)
  const initialized = useRef(false)

  // Sync taskbar badge whenever unread count changes (like Telegram)
  useEffect(() => {
    try {
      window.electronAPI?.window?.setBadgeCount?.(unreadMessagesCount)
    } catch {}
  }, [unreadMessagesCount])

  // Fetch initial unread count
  useEffect(() => {
    if (!supabase || !user?.id) {
      setUnreadMessagesCount(0)
      return
    }
    supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('receiver_id', user.id)
      .is('read_at', null)
      .then(({ count, error }) => {
        if (!error) setUnreadMessagesCount(count ?? 0)
      })
  }, [user?.id, setUnreadMessagesCount])

  // Real-time subscription for incoming messages
  useEffect(() => {
    if (!supabase || !user?.id) return
    const channel = supabase
      .channel('global-dm-notifier')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as { id: string; sender_id: string; body: string }
          addUnreadMessages(1)
          playMessageSound()
          // Flash taskbar (badge is synced via unreadMessagesCount effect)
          try {
            window.electronAPI?.window?.flashFrame?.()
          } catch {}
          const preview = row.body.length > 30 ? row.body.slice(0, 30) + '...' : row.body
          // Push to MessageBanner immediately so it shows at top of screen
          useMessageToastStore.getState().push({
            senderId: row.sender_id,
            senderName: 'Friend',
            senderAvatar: '💬',
            preview,
          })
          // Fetch sender profile and update system notifications
          supabase.from('profiles').select('username, avatar_url').eq('id', row.sender_id).single().then(({ data: profile }) => {
            const name = profile?.username?.trim() || 'Friend'
            const avatar = profile?.avatar_url || '💬'
            try {
              useNotificationStore.getState().push({ type: 'message', icon: avatar, title: name, body: preview })
            } catch {}
            // Note: MessageBanner already showed with "Friend" - we could update but banner is per-message, next one will have correct name
          })
        }
      )
      .subscribe()
    initialized.current = true
    return () => {
      supabase.removeChannel(channel)
      initialized.current = false
    }
  }, [user?.id, addUnreadMessages])
}
