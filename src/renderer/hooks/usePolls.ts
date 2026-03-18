import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useNotificationStore } from '../stores/notificationStore'

const LS_KEY = 'grindly_last_poll_seen'

interface PollRow {
  id: string
  title: string
  description: string | null
  icon: string
  expires_at: string | null
  created_at: string
  is_active: boolean
  poll_options: Array<{ id: string; label: string; sort_order: number }>
}

function pushPoll(poll: PollRow) {
  const options = [...poll.poll_options].sort((a, b) => a.sort_order - b.sort_order)
  useNotificationStore.getState().push({
    type: 'poll',
    icon: poll.icon ?? '📊',
    title: poll.title,
    body: poll.description || `Vote now — ${options.length} options`,
    poll: {
      pollId: poll.id,
      options: options.map((o) => ({ id: o.id, label: o.label })),
    },
  })
}

/**
 * Fetches active polls the user hasn't voted on yet and subscribes to new polls in real-time.
 * Each unseen poll appears in the notification bell with inline voting.
 */
export function usePolls() {
  const user = useAuthStore((s) => s.user)

  useEffect(() => {
    if (!user) return

    const lastSeen = localStorage.getItem(LS_KEY) ?? new Date(0).toISOString()

    // Fetch active polls created after last seen
    void Promise.resolve(supabase
      .from('polls')
      .select('id, title, description, icon, expires_at, created_at, is_active, poll_options(id, label, sort_order)')
      .eq('is_active', true)
      .gt('created_at', lastSeen)
      .order('created_at', { ascending: true })
    ).then(({ data }) => {
      if (!data || data.length === 0) return

      // Check which polls the user already voted on
      const pollIds = data.map((p) => p.id)
      void Promise.resolve(supabase
        .from('poll_votes')
        .select('poll_id')
        .eq('user_id', user.id)
        .in('poll_id', pollIds)
      ).then(({ data: votes }) => {
        const votedSet = new Set((votes ?? []).map((v) => v.poll_id))

        for (const poll of data as PollRow[]) {
          if (poll.expires_at && new Date(poll.expires_at) < new Date()) continue
          if (votedSet.has(poll.id)) continue
          pushPoll(poll)
        }

        localStorage.setItem(LS_KEY, new Date().toISOString())
      })
    }).catch(() => {})

    // Real-time subscription for new polls
    const channel = supabase
      .channel('grindly-polls')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'polls' },
        (payload) => {
          const poll = payload.new as { id: string; title: string; description: string; icon: string; expires_at: string | null; created_at: string; is_active: boolean }
          if (!poll.is_active) return

          supabase
            .from('poll_options')
            .select('id, label, sort_order')
            .eq('poll_id', poll.id)
            .order('sort_order', { ascending: true })
            .then(({ data: opts }) => {
              pushPoll({ ...poll, poll_options: opts ?? [] })
              localStorage.setItem(LS_KEY, new Date().toISOString())
            })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.id])
}
