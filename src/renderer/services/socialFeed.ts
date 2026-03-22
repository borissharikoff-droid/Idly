import { supabase } from '../lib/supabase'

export type SocialFeedEventType =
  | 'skill_level_up'
  | 'achievement_unlocked'
  | 'streak_milestone'
  | 'competition_result'
  | 'session_milestone'
  | 'loot_drop'
  | 'legendary_unlock'

export interface SocialFeedEventRow {
  id: string
  user_id: string
  event_type: SocialFeedEventType
  payload: Record<string, unknown>
  created_at: string
}

export interface SocialFeedEvent extends SocialFeedEventRow {
  username: string | null
  avatar_url: string | null
}

const PUBLISHED_KEYS_STORAGE = 'grindly_social_feed_published_keys'

function readPublishedKeys(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PUBLISHED_KEYS_STORAGE) || '[]') as string[]
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

function writePublishedKeys(keys: string[]): void {
  try {
    localStorage.setItem(PUBLISHED_KEYS_STORAGE, JSON.stringify(keys.slice(-500)))
  } catch {
    // noop
  }
}

export async function publishSocialFeedEvent(
  eventType: SocialFeedEventType,
  payload: Record<string, unknown>,
  options: { dedupeKey?: string } = {},
): Promise<void> {
  if (!supabase) return
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const dedupeSeed = options.dedupeKey || `${eventType}:${JSON.stringify(payload)}`
  const dayKey = new Date().toISOString().slice(0, 10)
  const fullKey = `${user.id}:${dayKey}:${dedupeSeed}`
  const published = readPublishedKeys()
  if (published.includes(fullKey)) return

  // RPC: валидирует event_type, размер payload ≤ 2KB, макс 20 за вызов
  const { error } = await supabase.rpc('publish_feed_events', {
    p_events: [{ event_type: eventType, payload }],
  })

  if (!error) {
    writePublishedKeys([...published, fullKey])
  }
}

async function getFriendAndSelfIds(userId: string): Promise<string[]> {
  if (!supabase) return [userId]
  const { data } = await supabase
    .from('friendships')
    .select('user_id, friend_id, status')
    .eq('status', 'accepted')
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`)

  const ids = new Set<string>([userId])
  for (const row of data || []) {
    const left = (row as { user_id: string }).user_id
    const right = (row as { friend_id: string }).friend_id
    ids.add(left === userId ? right : left)
  }
  return Array.from(ids)
}

export async function fetchFriendFeed(limit = 40): Promise<SocialFeedEvent[]> {
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const ids = await getFriendAndSelfIds(user.id)
  if (ids.length === 0) return []

  const { data: rows } = await supabase
    .from('social_feed_events')
    .select('id, user_id, event_type, payload, created_at')
    .in('user_id', ids)
    .order('created_at', { ascending: false })
    .limit(limit)

  const uniqueUserIds = Array.from(new Set((rows || []).map((r) => (r as { user_id: string }).user_id)))
  let profileMap = new Map<string, { username: string | null; avatar_url: string | null }>()
  if (uniqueUserIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .in('id', uniqueUserIds)
    profileMap = new Map(
      (profiles || []).map((p) => [
        (p as { id: string }).id,
        {
          username: ((p as { username?: string | null }).username ?? null),
          avatar_url: ((p as { avatar_url?: string | null }).avatar_url ?? null),
        },
      ]),
    )
  }

  return (rows || []).map((row) => {
    const typed = row as SocialFeedEventRow
    const profile = profileMap.get(typed.user_id)
    return {
      ...typed,
      username: profile?.username ?? null,
      avatar_url: profile?.avatar_url ?? null,
    }
  })
}

export async function fetchUserPublicProgressHistory(userId: string, limit = 20): Promise<SocialFeedEvent[]> {
  if (!supabase || !userId) return []

  const { data: rows } = await supabase
    .from('social_feed_events')
    .select('id, user_id, event_type, payload, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  const { data: profile } = await supabase
    .from('profiles')
    .select('username, avatar_url')
    .eq('id', userId)
    .single()

  return (rows || []).map((row) => ({
    ...(row as SocialFeedEventRow),
    username: (profile as { username?: string | null } | null)?.username ?? null,
    avatar_url: (profile as { avatar_url?: string | null } | null)?.avatar_url ?? null,
  }))
}
