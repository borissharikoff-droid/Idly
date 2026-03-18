import { supabase } from '../lib/supabase'

export type PartyRole = 'tank' | 'healer' | 'dps'
export type PartyStatus = 'active' | 'disbanded'

export interface Party {
  id: string
  leader_id: string
  status: PartyStatus
  created_at: string
}

export interface PartyMember {
  id: string
  party_id: string
  user_id: string
  username: string | null
  avatar_url: string | null
  frame_id: string | null
  role: PartyRole
  joined_at: string
}

export interface PartyInvite {
  id: string
  party_id: string
  from_user_id: string
  to_user_id: string
  from_username: string | null
  status: 'pending' | 'accepted' | 'declined'
  created_at: string
}

export const ROLE_ICONS: Record<PartyRole, string> = {
  tank: '🛡',
  healer: '💚',
  dps: '⚔',
}

export const ROLE_LABELS: Record<PartyRole, string> = {
  tank: 'Tank',
  healer: 'Healer',
  dps: 'DPS',
}

export const ROLE_COLORS: Record<PartyRole, string> = {
  tank: '#60a5fa',
  healer: '#4ade80',
  dps: '#f87171',
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function createParty(
  leaderId: string,
): Promise<{ ok: boolean; party?: Party; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase not configured' }

  const { data, error } = await supabase
    .from('parties')
    .insert({ leader_id: leaderId, status: 'active' })
    .select()
    .single()

  if (error || !data) return { ok: false, error: error?.message ?? 'Failed to create party' }

  const party = data as Party
  // Add leader as member with DPS role by default
  await supabase.from('party_members').insert({
    party_id: party.id,
    user_id: leaderId,
    role: 'dps',
  })

  return { ok: true, party }
}

export async function fetchActiveParty(
  userId: string,
): Promise<{ party: Party | null; members: PartyMember[] }> {
  if (!supabase) return { party: null, members: [] }

  // Find parties where user is a member
  const { data: memberRows } = await supabase
    .from('party_members')
    .select('party_id')
    .eq('user_id', userId)

  if (!memberRows?.length) return { party: null, members: [] }

  const partyIds = memberRows.map((r) => (r as { party_id: string }).party_id)

  const { data: parties } = await supabase
    .from('parties')
    .select('*')
    .in('id', partyIds)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)

  const party = (parties?.[0] as Party) ?? null
  if (!party) return { party: null, members: [] }

  // Fetch members joined with profiles
  const { data: membersRaw } = await supabase
    .from('party_members')
    .select('*, profiles!user_id(username, avatar_url, equipped_frame)')
    .eq('party_id', party.id)

  const members: PartyMember[] = (membersRaw ?? []).map((m) => {
    const row = m as Record<string, unknown>
    const profile = row.profiles as { username?: string; avatar_url?: string; equipped_frame?: string } | null
    return {
      id: row.id as string,
      party_id: row.party_id as string,
      user_id: row.user_id as string,
      username: profile?.username ?? null,
      avatar_url: profile?.avatar_url ?? null,
      frame_id: profile?.equipped_frame ?? null,
      role: (row.role as PartyRole) ?? 'dps',
      joined_at: row.joined_at as string,
    }
  })

  return { party, members }
}

export async function disbandParty(partyId: string): Promise<void> {
  if (!supabase) return
  await supabase.from('parties').update({ status: 'disbanded' }).eq('id', partyId)
}

export async function leaveParty(partyId: string, userId: string): Promise<void> {
  if (!supabase) return
  await supabase.from('party_members').delete().eq('party_id', partyId).eq('user_id', userId)
}

export async function sendPartyInvite(
  partyId: string,
  fromUserId: string,
  toUserId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase not configured' }
  const { error } = await supabase.from('party_invites').insert({
    party_id: partyId,
    from_user_id: fromUserId,
    to_user_id: toUserId,
    status: 'pending',
  })
  return error ? { ok: false, error: error.message } : { ok: true }
}

export async function fetchPendingPartyInvites(userId: string): Promise<PartyInvite[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('party_invites')
    .select('*, profiles!from_user_id(username)')
    .eq('to_user_id', userId)
    .eq('status', 'pending')
  if (!data) return []
  return (data as Array<Record<string, unknown>>).map((row) => ({
    id: row.id as string,
    party_id: row.party_id as string,
    from_user_id: row.from_user_id as string,
    to_user_id: row.to_user_id as string,
    from_username: (row.profiles as { username?: string } | null)?.username ?? null,
    status: row.status as 'pending' | 'accepted' | 'declined',
    created_at: row.created_at as string,
  }))
}

export async function acceptPartyInvite(
  inviteId: string,
  userId: string,
  partyId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase not configured' }
  await supabase.from('party_invites').update({ status: 'accepted' }).eq('id', inviteId)
  const { error } = await supabase.from('party_members').insert({
    party_id: partyId,
    user_id: userId,
    role: 'dps',
  })
  return error ? { ok: false, error: error.message } : { ok: true }
}

export async function declinePartyInvite(inviteId: string): Promise<void> {
  if (!supabase) return
  await supabase.from('party_invites').update({ status: 'declined' }).eq('id', inviteId)
}

export async function transferPartyLeadership(partyId: string, newLeaderId: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase not configured' }
  const { error } = await supabase
    .from('parties')
    .update({ leader_id: newLeaderId })
    .eq('id', partyId)
  return error ? { ok: false, error: error.message } : { ok: true }
}

export async function kickPartyMember(partyId: string, userId: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase not configured' }
  const { error } = await supabase
    .from('party_members')
    .delete()
    .eq('party_id', partyId)
    .eq('user_id', userId)
  return error ? { ok: false, error: error.message } : { ok: true }
}

export async function sendFriendRequest(fromUserId: string, toUserId: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase not configured' }
  const { error } = await supabase.from('friendships').insert({
    user_id: fromUserId,
    friend_id: toUserId,
    status: 'pending',
  })
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Already friends or request pending' }
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

export async function updateMemberRole(
  partyId: string,
  userId: string,
  role: PartyRole,
): Promise<void> {
  if (!supabase) return
  await supabase
    .from('party_members')
    .update({ role })
    .eq('party_id', partyId)
    .eq('user_id', userId)
}
