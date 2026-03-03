/**
 * GiftService — send duplicate items to friends. Receiver claims to add to their inventory.
 */

import { supabase } from '../lib/supabase'
import { syncInventoryToSupabase } from './supabaseSync'
import { useInventoryStore } from '../stores/inventoryStore'
import { useFarmStore } from '../stores/farmStore'
import { isSeedId } from '../lib/farming'

export interface PendingGift {
  id: string
  sender_id: string
  receiver_id: string
  item_id: string
  quantity: number
  status: string
  created_at: string
  sender_username?: string | null
}

export async function sendGiftToFriend(
  itemId: string,
  quantity: number,
  receiverId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase not configured' }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }
  if (receiverId === user.id) return { ok: false, error: 'Cannot gift to yourself' }
  if (quantity < 1) return { ok: false, error: 'Invalid quantity' }

  const store = useInventoryStore.getState()
  const currentQty = store.items[itemId] ?? 0
  if (currentQty < quantity) return { ok: false, error: 'Not enough items' }

  const { error } = await supabase.from('item_gifts').insert({
    sender_id: user.id,
    receiver_id: receiverId,
    item_id: itemId,
    quantity,
    status: 'pending',
  })
  if (error) return { ok: false, error: error.message }

  store.deleteItem(itemId, quantity)
  const { items, chests } = useInventoryStore.getState()
  const { seeds, seedZips } = useFarmStore.getState()
  syncInventoryToSupabase(items, chests, { merge: true, seeds, seedZips }).catch(() => {})
  return { ok: true }
}

export async function fetchPendingGiftsForMe(): Promise<PendingGift[]> {
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: rows } = await supabase
    .from('item_gifts')
    .select('id, sender_id, receiver_id, item_id, quantity, status, created_at')
    .eq('receiver_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (!rows || rows.length === 0) return []

  const senderIds = [...new Set((rows as { sender_id: string }[]).map((r) => r.sender_id))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username')
    .in('id', senderIds)

  const usernameMap = new Map<string, string | null>()
  for (const p of profiles || []) {
    const t = p as { id: string; username: string | null }
    usernameMap.set(t.id, t.username ?? null)
  }

  return (rows || []).map((r) => {
    const t = r as PendingGift
    return {
      ...t,
      sender_username: usernameMap.get(t.sender_id) ?? null,
    }
  })
}

export async function claimGift(giftId: string): Promise<{ ok: boolean; itemId?: string; quantity?: number; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase not configured' }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const { data: gift } = await supabase
    .from('item_gifts')
    .select('id, receiver_id, item_id, quantity')
    .eq('id', giftId)
    .eq('receiver_id', user.id)
    .eq('status', 'pending')
    .single()

  if (!gift) return { ok: false, error: 'Gift not found or already claimed' }
  const g = gift as { id: string; item_id: string; quantity: number }

  const { error: updateErr } = await supabase
    .from('item_gifts')
    .update({ status: 'claimed', claimed_at: new Date().toISOString() })
    .eq('id', giftId)
    .eq('receiver_id', user.id)

  if (updateErr) return { ok: false, error: updateErr.message }

  if (isSeedId(g.item_id)) {
    useFarmStore.getState().addSeed(g.item_id, g.quantity)
  } else {
    useInventoryStore.getState().addItem(g.item_id, g.quantity)
  }
  const { items, chests } = useInventoryStore.getState()
  const { seeds, seedZips } = useFarmStore.getState()
  syncInventoryToSupabase(items, chests, { merge: true, seeds, seedZips }).catch(() => {})

  return { ok: true, itemId: g.item_id, quantity: g.quantity }
}
