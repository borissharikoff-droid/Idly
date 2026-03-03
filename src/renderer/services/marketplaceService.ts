import { supabase } from '../lib/supabase'
import { MARKETPLACE_BLOCKED_ITEMS } from '../lib/loot'
import { track } from '../lib/analytics'

export interface CreateListingResult {
  ok: boolean
  error?: string
}

export async function createListing(
  sellerId: string,
  itemId: string,
  quantity: number,
  priceGold: number,
): Promise<CreateListingResult> {
  if (!supabase) return { ok: false, error: 'Supabase not configured' }
  if (priceGold < 1) return { ok: false, error: 'Price must be at least 1 gold' }
  if (quantity < 1) return { ok: false, error: 'Quantity must be at least 1' }
  if (MARKETPLACE_BLOCKED_ITEMS.includes(itemId)) return { ok: false, error: 'This item cannot be listed' }

  const { error } = await supabase.from('marketplace_listings').insert({
    seller_id: sellerId,
    item_id: itemId,
    quantity,
    price_gold: priceGold,
    status: 'active',
  })

  if (error) return { ok: false, error: error.message }

  // Deduct from user_inventory in Supabase so the item doesn't return on next merge sync.
  try {
    const { data: invRow } = await supabase
      .from('user_inventory')
      .select('quantity')
      .eq('user_id', sellerId)
      .eq('item_id', itemId)
      .maybeSingle()
    const cloudQty = (invRow as { quantity: number } | null)?.quantity ?? 0
    const newQty = cloudQty - quantity
    if (newQty <= 0) {
      await supabase.from('user_inventory').delete().eq('user_id', sellerId).eq('item_id', itemId)
    } else {
      await supabase
        .from('user_inventory')
        .update({ quantity: newQty, updated_at: new Date().toISOString() })
        .eq('user_id', sellerId)
        .eq('item_id', itemId)
    }
  } catch {
    // Non-fatal — local state and listing are correct; cloud will self-correct on next full sync.
  }

  return { ok: true }
}

export interface ListingWithSeller {
  id: string
  seller_id: string
  item_id: string
  quantity: number
  price_gold: number
  created_at: string
  seller_username: string | null
  seller_avatar_url: string | null
}

export async function fetchActiveListings(): Promise<ListingWithSeller[]> {
  if (!supabase) return []
  const { data: listings, error } = await supabase
    .from('marketplace_listings')
    .select('id, seller_id, item_id, quantity, price_gold, created_at')
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (error || !listings?.length) return listings ?? []

  const sellerIds = [...new Set((listings as { seller_id: string }[]).map((l) => l.seller_id))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .in('id', sellerIds)

  const profileMap = new Map(
    (profiles || []).map((p: { id: string; username?: string; avatar_url?: string }) => [
      p.id,
      { username: p.username ?? null, avatar_url: p.avatar_url ?? null },
    ]),
  )

  return (listings as Record<string, unknown>[]).map((row) => {
    const p = profileMap.get(row.seller_id as string)
    return {
      id: row.id as string,
      seller_id: row.seller_id as string,
      item_id: row.item_id as string,
      quantity: row.quantity as number,
      price_gold: row.price_gold as number,
      created_at: row.created_at as string,
      seller_username: p?.username ?? null,
      seller_avatar_url: p?.avatar_url ?? null,
    }
  })
}

export interface BuyListingResult {
  ok: boolean
  error?: string
  item_id?: string
  quantity?: number
  cost?: number
}

export async function buyListing(listingId: string): Promise<BuyListingResult> {
  if (!supabase) return { ok: false, error: 'Supabase not configured' }
  const { data, error } = await supabase.rpc('buy_listing', { p_listing_id: listingId })
  if (error) return { ok: false, error: error.message }
  const result = data as { ok?: boolean; error?: string; item_id?: string; quantity?: number }
  if (!result?.ok) return { ok: false, error: result?.error ?? 'Purchase failed' }
  track('marketplace_buy', { item_id: result.item_id, quantity: result.quantity })
  return { ok: true, item_id: result.item_id, quantity: result.quantity }
}

export async function partialBuyListing(listingId: string, quantity: number): Promise<BuyListingResult> {
  if (!supabase) return { ok: false, error: 'Supabase not configured' }
  const { data, error } = await supabase.rpc('partial_buy_listing', { p_listing_id: listingId, p_quantity: quantity })
  if (error) return { ok: false, error: error.message }
  const result = data as { ok?: boolean; error?: string; item_id?: string; quantity?: number; cost?: number }
  if (!result?.ok) return { ok: false, error: result?.error ?? 'Purchase failed' }
  track('marketplace_buy', { item_id: result.item_id, quantity: result.quantity })
  return { ok: true, item_id: result.item_id, quantity: result.quantity, cost: result.cost }
}

export interface CancelListingResult {
  ok: boolean
  error?: string
  item_id?: string
  quantity?: number
}

export async function cancelListing(listingId: string): Promise<CancelListingResult> {
  if (!supabase) return { ok: false, error: 'Supabase not configured' }
  const { data, error } = await supabase.rpc('cancel_listing', { p_listing_id: listingId })
  if (error) return { ok: false, error: error.message }
  const result = data as { ok?: boolean; error?: string; item_id?: string; quantity?: number }
  if (!result?.ok) return { ok: false, error: result?.error ?? 'Cancel failed' }
  return {
    ok: true,
    item_id: result.item_id,
    quantity: result.quantity,
  }
}

/** Expire listings older than 7 days (returns items to sellers). Call before fetch. */
export async function expireOldListings(): Promise<number> {
  if (!supabase) return 0
  const { data, error } = await supabase.rpc('expire_old_listings')
  if (error) return 0
  return (data as number) ?? 0
}
