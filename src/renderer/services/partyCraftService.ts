import { supabase } from '../lib/supabase'

export interface PartyCraftSession {
  id: string
  party_id: string
  recipe_id: string
  output_item_id: string
  initiator_id: string
  helpers: string[]
  party_size: number
  total_xp: number
  status: 'crafting' | 'done' | 'cancelled'
  created_at: string
  expires_at: string
}

export async function createPartyCraftSession(
  partyId: string,
  recipeId: string,
  outputItemId: string,
  initiatorId: string,
  partySize: number,
  totalXp: number,
): Promise<{ ok: boolean; session?: PartyCraftSession; error?: string }> {
  if (!supabase) return { ok: false, error: 'No Supabase' }
  // Cancel any previous active session for this party first
  await supabase
    .from('party_craft_sessions')
    .update({ status: 'cancelled' })
    .eq('party_id', partyId)
    .eq('status', 'crafting')

  const { data, error } = await supabase
    .from('party_craft_sessions')
    .insert({ party_id: partyId, recipe_id: recipeId, output_item_id: outputItemId, initiator_id: initiatorId, party_size: partySize, total_xp: totalXp })
    .select()
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, session: data as PartyCraftSession }
}

export async function joinPartyCraftSession(sessionId: string, userId: string): Promise<{ ok: boolean }> {
  if (!supabase) return { ok: false }
  // Atomic array append — ignore if already in helpers
  const { error } = await supabase.rpc('join_party_craft', { p_session_id: sessionId, p_user_id: userId })
  if (error) {
    // Fallback: manual update (if RPC doesn't exist yet)
    const { data: cur } = await supabase.from('party_craft_sessions').select('helpers').eq('id', sessionId).single()
    if (!cur) return { ok: false }
    const helpers: string[] = cur.helpers ?? []
    if (helpers.includes(userId)) return { ok: true }
    await supabase.from('party_craft_sessions').update({ helpers: [...helpers, userId] }).eq('id', sessionId)
  }
  return { ok: true }
}

export async function completePartyCraftSession(sessionId: string): Promise<void> {
  if (!supabase) return
  await supabase.rpc('complete_party_craft', { p_session_id: sessionId })
}

export async function cancelPartyCraftSession(sessionId: string): Promise<void> {
  if (!supabase) return
  await supabase.from('party_craft_sessions').update({ status: 'cancelled' }).eq('id', sessionId)
}

export async function fetchActivePartyCraftSession(partyId: string): Promise<PartyCraftSession | null> {
  if (!supabase) return null
  const { data } = await supabase
    .from('party_craft_sessions')
    .select('*')
    .eq('party_id', partyId)
    .eq('status', 'crafting')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as PartyCraftSession | null) ?? null
}
