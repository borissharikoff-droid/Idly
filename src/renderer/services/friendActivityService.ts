import { supabase } from '../lib/supabase'

export type FriendActivityEvent =
  | { type: 'boss_kill'; zoneId: string; zoneName: string; bossName: string; goldEarned: number }
  | { type: 'achievement'; achievementId: string; achievementName: string }
  | { type: 'rare_drop'; itemId: string; itemName: string; rarity: string }

export interface FriendActivityEntry {
  id: string
  user_id: string
  username: string
  avatar: string
  event_type: string
  payload: Record<string, unknown>
  created_at: string
}

/** Log an activity event for the current user (fire-and-forget). */
export async function logFriendActivity(userId: string, event: FriendActivityEvent): Promise<void> {
  if (!supabase) return
  await supabase.from('friend_activity').insert({
    user_id: userId,
    event_type: event.type,
    payload: event,
  }).then(() => {}) // ignore errors
}

/** Fetch recent activity from friends + self (last 30 events). */
export async function fetchFriendActivity(userId: string): Promise<FriendActivityEntry[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('friend_activity')
    .select('id, user_id, event_type, payload, created_at, profiles!inner(username, avatar_url)')
    .order('created_at', { ascending: false })
    .limit(30)
  if (error || !data) return []
  return data.map((row: Record<string, unknown>) => {
    const profile = (row.profiles as { username?: string; avatar_url?: string } | null) ?? {}
    return {
      id: String(row.id),
      user_id: String(row.user_id),
      username: profile.username ?? 'Unknown',
      avatar: profile.avatar_url ?? '🤖',
      event_type: String(row.event_type),
      payload: (row.payload as Record<string, unknown>) ?? {},
      created_at: String(row.created_at),
    }
  })
  void userId // used by RLS
}

/** Format a relative time string like "2m ago", "3h ago", "2d ago" */
export function relativeTime(isoString: string): string {
  const delta = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000)
  if (delta < 60) return 'just now'
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`
  return `${Math.floor(delta / 86400)}d ago`
}

/** Format a feed entry into a human-readable string */
export function formatActivityEntry(entry: FriendActivityEntry): { text: string; icon: string } {
  const p = entry.payload
  switch (entry.event_type) {
    case 'boss_kill':
      return { icon: '⚔️', text: `cleared ${String(p.zoneName ?? 'a zone')} (+${String(p.goldEarned ?? 0)}g)` }
    case 'achievement':
      return { icon: '🏅', text: `unlocked "${String(p.achievementName ?? '')}"` }
    case 'rare_drop':
      return { icon: '✨', text: `got ${String(p.itemName ?? '')} (${String(p.rarity ?? '')})` }
    default:
      return { icon: '📌', text: entry.event_type }
  }
}
