import { supabase } from '../lib/supabase'

export interface Guild {
  id: string
  name: string
  tag: string
  description: string | null
  owner_id: string | null
  created_at: string
  member_count: number
  chest_gold: number
  weekly_goal_progress: Record<string, number>
  weekly_goal_reset_at: string | null
  tax_rate_pct: number
  hall_level: number
  hall_build_started_at: string | null
  hall_build_target_level: number | null
}

export interface GuildMember {
  id: string
  guild_id: string
  user_id: string
  role: 'owner' | 'officer' | 'member'
  joined_at: string
  contribution_gold: number
  // Profile fields (fetched from profiles join)
  username?: string | null
  avatar_url?: string | null
  is_online?: boolean
  current_activity?: string | null
  streak_count?: number
  equipped_frame?: string | null
  total_skill_level?: number | null
  skills_sync_status?: 'synced' | 'pending'
  last_seen_at?: string | null
}

export interface GuildChestItem {
  id: string
  guild_id: string
  item_id: string
  quantity: number
  deposited_by: string | null
  deposited_at: string
}

export interface GuildActivityLogEntry {
  id: string
  guild_id: string
  user_id: string | null
  event_type: string
  payload: Record<string, unknown>
  created_at: string
  username?: string | null
}

/** Fetch a map of userId → { tag, name } for the given user IDs. Returns empty map on error. */
export async function fetchGuildTagsForUsers(userIds: string[]): Promise<Record<string, { tag: string; name: string }>> {
  if (!supabase || userIds.length === 0) return {}
  try {
    const { data } = await supabase
      .from('guild_members')
      .select('user_id, guilds(tag, name)')
      .in('user_id', userIds)
    if (!data) return {}
    const map: Record<string, { tag: string; name: string }> = {}
    for (const row of data) {
      const gRaw = row.guilds
      const g = (Array.isArray(gRaw) ? gRaw[0] : gRaw) as { tag: string; name: string } | null | undefined
      if (g && row.user_id) map[row.user_id] = { tag: g.tag, name: g.name }
    }
    return map
  } catch {
    return {}
  }
}

// Helper: fire-and-forget a Supabase query without .catch() issues
async function tryRun(fn: () => unknown) {
  try { await (fn() as PromiseLike<unknown>) } catch { /* non-fatal */ }
}

// ── Guild CRUD ────────────────────────────────────────────────────────────────

export async function createGuild(
  userId: string,
  name: string,
  tag: string,
  description?: string,
): Promise<{ ok: boolean; guild?: Guild; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase not configured' }

  const { data: guild, error: guildErr } = await supabase
    .from('guilds')
    .insert({ name, tag, description: description ?? null, owner_id: userId })
    .select()
    .single()

  if (guildErr || !guild) return { ok: false, error: guildErr?.message ?? 'Failed to create guild' }

  const { error: memberErr } = await supabase
    .from('guild_members')
    .insert({ guild_id: (guild as Guild).id, user_id: userId, role: 'owner' })

  if (memberErr) {
    await tryRun(() => supabase!.from('guilds').delete().eq('id', (guild as Guild).id))
    return { ok: false, error: memberErr.message }
  }

  await tryRun(() => supabase!.from('guild_activity_log').insert({
    guild_id: (guild as Guild).id,
    user_id: userId,
    event_type: 'join',
    payload: { role: 'owner' },
  }))

  return { ok: true, guild: guild as Guild }
}

export async function joinGuild(userId: string, guildId: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase not configured' }

  const { error } = await supabase
    .from('guild_members')
    .insert({ guild_id: guildId, user_id: userId, role: 'member' })

  if (error) return { ok: false, error: error.message }

  // Update member count
  const { count } = await supabase
    .from('guild_members')
    .select('*', { count: 'exact', head: true })
    .eq('guild_id', guildId)

  await tryRun(() => supabase!.from('guilds').update({ member_count: count ?? 1 }).eq('id', guildId))

  await tryRun(() => supabase!.from('guild_activity_log').insert({
    guild_id: guildId, user_id: userId, event_type: 'join', payload: {},
  }))

  return { ok: true }
}

export async function leaveGuild(userId: string, guildId: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase not configured' }

  await tryRun(() => supabase!.from('guild_activity_log').insert({
    guild_id: guildId, user_id: userId, event_type: 'leave', payload: {},
  }))

  const { error } = await supabase
    .from('guild_members')
    .delete()
    .eq('user_id', userId)
    .eq('guild_id', guildId)

  if (error) return { ok: false, error: error.message }

  const { count } = await supabase
    .from('guild_members')
    .select('*', { count: 'exact', head: true })
    .eq('guild_id', guildId)

  await tryRun(() => supabase!.from('guilds').update({ member_count: count ?? 0 }).eq('id', guildId))

  return { ok: true }
}

export async function depositGold(
  userId: string,
  guildId: string,
  amount: number,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase not configured' }
  if (amount < 1) return { ok: false, error: 'Amount must be at least 1' }

  const { data: guild, error: fetchErr } = await supabase
    .from('guilds')
    .select('chest_gold')
    .eq('id', guildId)
    .single()

  if (fetchErr || !guild) return { ok: false, error: 'Guild not found' }

  const newTotal = ((guild as { chest_gold: number }).chest_gold ?? 0) + amount
  const { error } = await supabase.from('guilds').update({ chest_gold: newTotal }).eq('id', guildId)
  if (error) return { ok: false, error: error.message }

  const { data: member } = await supabase
    .from('guild_members')
    .select('contribution_gold')
    .eq('guild_id', guildId)
    .eq('user_id', userId)
    .single()

  const newContrib = ((member as { contribution_gold: number } | null)?.contribution_gold ?? 0) + amount
  await tryRun(() => supabase!.from('guild_members')
    .update({ contribution_gold: newContrib })
    .eq('guild_id', guildId)
    .eq('user_id', userId))

  await tryRun(() => supabase!.from('guild_activity_log').insert({
    guild_id: guildId, user_id: userId, event_type: 'deposit_gold', payload: { amount },
  }))

  return { ok: true }
}

// ── Fetch helpers ────────────────────────────────────────────────────────────

export async function fetchMyGuild(userId: string): Promise<{ guild: Guild | null; membership: GuildMember | null }> {
  if (!supabase) return { guild: null, membership: null }

  const { data: membership } = await supabase
    .from('guild_members')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (!membership) return { guild: null, membership: null }

  const { data: guild } = await supabase
    .from('guilds')
    .select('*')
    .eq('id', (membership as GuildMember).guild_id)
    .maybeSingle()

  return { guild: guild as Guild | null, membership: membership as GuildMember }
}

export async function fetchGuildMembers(guildId: string): Promise<GuildMember[]> {
  if (!supabase) return []

  const { data: members } = await supabase
    .from('guild_members')
    .select('*')
    .eq('guild_id', guildId)
    .order('contribution_gold', { ascending: false })

  if (!members?.length) return []

  const userIds = (members as GuildMember[]).map((m) => m.user_id)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, avatar_url, is_online, current_activity, streak_count, equipped_frame, total_skill_level, skills_sync_status, last_seen_at, updated_at')
    .in('id', userIds)

  const ONLINE_STALE_MS = 3 * 60 * 1000
  type RawProfile = {
    id: string; username?: string | null; avatar_url?: string | null
    is_online?: boolean; current_activity?: string | null; streak_count?: number
    equipped_frame?: string | null; total_skill_level?: number | null
    skills_sync_status?: string | null; last_seen_at?: string | null; updated_at?: string | null
  }
  const profileMap = new Map<string, RawProfile>(
    ((profiles as RawProfile[]) || []).map((p) => [p.id, p]),
  )

  return (members as GuildMember[]).map((m) => {
    const p = profileMap.get(m.user_id)
    const isOnlineRaw = p?.is_online ?? false
    const updatedAt = p?.updated_at ?? null
    const isFreshOnline = isOnlineRaw && typeof updatedAt === 'string'
      ? Date.now() - Date.parse(updatedAt) <= ONLINE_STALE_MS
      : false
    return {
      ...m,
      username: p?.username ?? null,
      avatar_url: p?.avatar_url ?? null,
      is_online: isFreshOnline,
      current_activity: p?.current_activity ?? null,
      streak_count: p?.streak_count ?? 0,
      equipped_frame: p?.equipped_frame ?? null,
      total_skill_level: p?.total_skill_level ?? null,
      skills_sync_status: (p?.skills_sync_status === 'synced' ? 'synced' : 'pending') as 'synced' | 'pending',
      last_seen_at: p?.last_seen_at ?? null,
    }
  })
}

export async function fetchGuildActivityLog(guildId: string, limit = 20): Promise<GuildActivityLogEntry[]> {
  if (!supabase) return []

  const { data: logs } = await supabase
    .from('guild_activity_log')
    .select('*')
    .eq('guild_id', guildId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!logs?.length) return []

  const userIds = [...new Set((logs as GuildActivityLogEntry[]).filter((l) => l.user_id).map((l) => l.user_id as string))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username')
    .in('id', userIds)

  const nameMap = new Map((profiles || []).map((p: { id: string; username?: string }) => [p.id, p.username ?? null]))

  return (logs as GuildActivityLogEntry[]).map((l) => ({
    ...l,
    username: l.user_id ? nameMap.get(l.user_id) ?? null : null,
  }))
}

export async function fetchTopGuilds(limit = 10): Promise<Guild[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('guilds')
    .select('*')
    .order('chest_gold', { ascending: false })
    .limit(limit)
  return (data as Guild[]) ?? []
}

export async function searchGuilds(query: string): Promise<Guild[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('guilds')
    .select('*')
    .ilike('name', `%${query}%`)
    .limit(20)
  return (data as Guild[]) ?? []
}

export async function setGuildTaxRate(guildId: string, rate: number): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase not configured' }
  const clamped = Math.max(0, Math.min(15, Math.round(rate)))
  const { error } = await supabase.from('guilds').update({ tax_rate_pct: clamped }).eq('id', guildId)
  return error ? { ok: false, error: error.message } : { ok: true }
}

// ── Guild Invites ─────────────────────────────────────────────────────────────

export interface GuildInvite {
  id: string
  guild_id: string
  inviter_id: string
  invitee_id: string
  status: 'pending' | 'accepted' | 'declined'
  created_at: string
  expires_at: string
  guild_name?: string
  guild_tag?: string
  inviter_username?: string
}

export async function sendGuildInvite(guildId: string, inviterId: string, inviteeId: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase not configured' }
  // Check no existing pending invite
  const { data: existing } = await supabase
    .from('guild_invites')
    .select('id')
    .eq('guild_id', guildId)
    .eq('invitee_id', inviteeId)
    .eq('status', 'pending')
    .maybeSingle()
  if (existing) return { ok: false, error: 'Invite already sent' }
  const { error } = await supabase.from('guild_invites').insert({ guild_id: guildId, inviter_id: inviterId, invitee_id: inviteeId })
  return error ? { ok: false, error: error.message } : { ok: true }
}

export async function fetchPendingInvites(userId: string): Promise<GuildInvite[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('guild_invites')
    .select('*, guilds!inner(name, tag), profiles!inviter_id(username)')
    .eq('invitee_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (!data) return []
  return (data as unknown[]).map((row) => {
    const r = row as Record<string, unknown>
    const guild = r.guilds as Record<string, string> | null
    const inviterProfile = r.profiles as Record<string, string> | null
    return {
      id: String(r.id),
      guild_id: String(r.guild_id),
      inviter_id: String(r.inviter_id),
      invitee_id: String(r.invitee_id),
      status: r.status as 'pending',
      created_at: String(r.created_at),
      expires_at: String(r.expires_at),
      guild_name: guild?.name ?? '?',
      guild_tag: guild?.tag ?? '?',
      inviter_username: inviterProfile?.username ?? '?',
    }
  })
}

export async function respondToInvite(inviteId: string, response: 'accepted' | 'declined'): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase not configured' }
  const { error } = await supabase.from('guild_invites').update({ status: response }).eq('id', inviteId)
  return error ? { ok: false, error: error.message } : { ok: true }
}


// ── Member management ─────────────────────────────────────────────────────────

export async function kickMember(guildId: string, memberId: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase not configured' }
  const { error } = await supabase
    .from('guild_members')
    .delete()
    .eq('user_id', memberId)
    .eq('guild_id', guildId)
  if (error) return { ok: false, error: error.message }
  const { count } = await supabase
    .from('guild_members')
    .select('*', { count: 'exact', head: true })
    .eq('guild_id', guildId)
  await tryRun(() => supabase!.from('guilds').update({ member_count: count ?? 0 }).eq('id', guildId))
  return { ok: true }
}

export async function promoteMember(guildId: string, memberId: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase not configured' }
  const { error } = await supabase
    .from('guild_members')
    .update({ role: 'officer' })
    .eq('user_id', memberId)
    .eq('guild_id', guildId)
  return error ? { ok: false, error: error.message } : { ok: true }
}

export async function demoteMember(guildId: string, memberId: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase not configured' }
  const { error } = await supabase
    .from('guild_members')
    .update({ role: 'member' })
    .eq('user_id', memberId)
    .eq('guild_id', guildId)
  return error ? { ok: false, error: error.message } : { ok: true }
}

// ── Guild Hall ────────────────────────────────────────────────────────────────

export interface HallContributions {
  [itemId: string]: number
}

export async function fetchHallContributions(guildId: string): Promise<HallContributions> {
  if (!supabase) return {}
  const { data } = await supabase
    .from('guild_hall_contributions')
    .select('item_id, total_donated')
    .eq('guild_id', guildId)
  if (!data) return {}
  const map: HallContributions = {}
  for (const row of data as { item_id: string; total_donated: number }[]) {
    map[row.item_id] = row.total_donated
  }
  return map
}

export async function donateToHall(
  guildId: string,
  items: Array<{ id: string; qty: number }>,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase not configured' }
  if (items.length === 0) return { ok: false, error: 'No items specified' }

  // Upsert each item contribution (add to existing total)
  for (const item of items) {
    if (item.qty <= 0) continue
    const { data: existing } = await supabase
      .from('guild_hall_contributions')
      .select('total_donated')
      .eq('guild_id', guildId)
      .eq('item_id', item.id)
      .maybeSingle()

    const prev = (existing as { total_donated: number } | null)?.total_donated ?? 0
    const { error } = await supabase
      .from('guild_hall_contributions')
      .upsert(
        { guild_id: guildId, item_id: item.id, total_donated: prev + item.qty },
        { onConflict: 'guild_id,item_id' },
      )
    if (error) return { ok: false, error: error.message }
  }
  return { ok: true }
}

export async function startHallBuild(
  guildId: string,
  targetLevel: number,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase not configured' }
  const { error } = await supabase
    .from('guilds')
    .update({
      hall_build_started_at: new Date().toISOString(),
      hall_build_target_level: targetLevel,
    })
    .eq('id', guildId)
  return error ? { ok: false, error: error.message } : { ok: true }
}

export async function completeHallUpgrade(
  guildId: string,
  newLevel: number,
  itemsToReset: string[],
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase not configured' }
  const { error } = await supabase
    .from('guilds')
    .update({
      hall_level: newLevel,
      hall_build_started_at: null,
      hall_build_target_level: null,
    })
    .eq('id', guildId)
  if (error) return { ok: false, error: error.message }

  // Reset contribution rows for the completed level
  if (itemsToReset.length > 0) {
    await tryRun(() =>
      supabase!
        .from('guild_hall_contributions')
        .upsert(
          itemsToReset.map((id) => ({ guild_id: guildId, item_id: id, total_donated: 0 })),
          { onConflict: 'guild_id,item_id' },
        ),
    )
  }
  return { ok: true }
}

export async function applyGuildTax(userId: string, guildId: string, goldEarned: number, taxRatePct: number): Promise<number> {
  if (!supabase || taxRatePct <= 0 || goldEarned <= 0) return 0
  const taxAmount = Math.floor(goldEarned * taxRatePct / 100)
  if (taxAmount <= 0) return 0
  try {
    const { data: guild } = await supabase.from('guilds').select('chest_gold').eq('id', guildId).single()
    if (!guild) return 0
    const newTotal = ((guild as { chest_gold: number }).chest_gold ?? 0) + taxAmount
    await supabase.from('guilds').update({ chest_gold: newTotal }).eq('id', guildId)
    const { data: member } = await supabase.from('guild_members').select('contribution_gold').eq('guild_id', guildId).eq('user_id', userId).single()
    const newContrib = ((member as { contribution_gold: number } | null)?.contribution_gold ?? 0) + taxAmount
    await supabase.from('guild_members').update({ contribution_gold: newContrib }).eq('guild_id', guildId).eq('user_id', userId)
  } catch { /* non-fatal */ }
  return taxAmount
}
