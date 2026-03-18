import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNotificationStore } from '../stores/notificationStore'
import { useAuthStore } from '../stores/authStore'

const LS_KEY = 'grindly_last_announcement_seen'

function pushAnnouncement(ann: { title: string; body: string; icon?: string | null }) {
  useNotificationStore.getState().push({
    type: 'update',
    icon: ann.icon ?? '📢',
    title: ann.title,
    body: ann.body,
  })
}

/**
 * Fetches announcements posted while the user was offline and subscribes to
 * new announcements in real-time. Each announcement appears in the notification bell.
 */
export function useAnnouncements() {
  const user = useAuthStore((s) => s.user)

  useEffect(() => {
    if (!user) return

    const lastSeen = localStorage.getItem(LS_KEY) ?? new Date(0).toISOString()

    // Fetch any announcements posted after the last-seen timestamp
    void Promise.resolve(supabase
      .from('announcements')
      .select('id, title, body, icon, created_at')
      .gt('created_at', lastSeen)
      .order('created_at', { ascending: true })
    ).then(({ data }) => {
      if (!data || data.length === 0) return
      data.forEach(pushAnnouncement)
      localStorage.setItem(LS_KEY, new Date().toISOString())
    }).catch(() => {})

    // Real-time subscription for announcements posted while the app is open
    const channel = supabase
      .channel('grindly-announcements')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'announcements' },
        (payload) => {
          const ann = payload.new as { title: string; body: string; icon?: string }
          pushAnnouncement(ann)
          localStorage.setItem(LS_KEY, new Date().toISOString())
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.id])
}
