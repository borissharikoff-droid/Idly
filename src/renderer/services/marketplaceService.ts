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

  // RPC: atomic — validates price (1-10M), checks real inventory server-side,
  // deducts and creates listing in one transaction. No race condition possible.
  const { data, error } = await supabase.rpc('create_listing', {
    p_item_id: itemId,
    p_quantity: quantity,
    p_price_gold: priceGold,
  })

  if (error) return { ok: false, error: error.message }
  const result = data as { ok: boolean; error?: string; listing_id?: string }
  if (!result.ok) return { ok: false, error: result.error ?? 'Listing failed' }

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

  if (error || !listings?.length) return []

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

/** IDs the current user just cancelled — prevents the global sale notifier from misfiring them. */
export const recentlyCancelledListingIds = new Set<string>()

export async function cancelListing(listingId: string): Promise<CancelListingResult> {
  if (!supabase) return { ok: false, error: 'Supabase not configured' }
  recentlyCancelledListingIds.add(listingId)
  const { data, error } = await supabase.rpc('cancel_listing', { p_listing_id: listingId })
  if (error) {
    console.error('[cancelListing] RPC error:', error.message, error)
    return { ok: false, error: error.message }
  }
  if (data == null) {
    console.error('[cancelListing] RPC returned null/undefined data')
    return { ok: false, error: 'No response from server' }
  }
  const result = data as { ok?: boolean; error?: string; item_id?: string; quantity?: number }
  if (!result.ok) {
    console.error('[cancelListing] RPC returned failure:', result)
    return { ok: false, error: result.error ?? 'Cancel failed' }
  }
  return {
    ok: true,
    item_id: result.item_id,
    quantity: result.quantity,
  }
}

export interface PriceHistoryEntry {
  price_gold: number
  sold_at: string
}

/** Fetch recent sale prices for a given item (for sparkline / suggested price). */
export async function fetchPriceHistory(itemId: string, limit = 20): Promise<PriceHistoryEntry[]> {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('get_price_history', { p_item_id: itemId, p_limit: limit })
  if (error || !data) return []
  return (data as PriceHistoryEntry[])
}

/** Expire listings older than 7 days (returns items to sellers). Call before fetch. */
export async function expireOldListings(): Promise<number> {
  if (!supabase) return 0
  const { data, error } = await supabase.rpc('expire_old_listings')
  if (error) return 0
  return (data as number) ?? 0
}

export interface TradeHistoryEntry {
  id: string
  seller_id: string
  buyer_id: string | null
  item_id: string
  quantity: number
  price_gold: number
  status: string
  created_at: string
  seller_username: string | null
  buyer_username: string | null
}

/** Fetch trade history: sold/cancelled/expired listings involving the current user */
export async function fetchTradeHistory(userId: string): Promise<TradeHistoryEntry[]> {
  if (!supabase) return []
  const { data: rows, error } = await supabase
    .from('marketplace_listings')
    .select('id, seller_id, buyer_id, item_id, quantity, price_gold, status, created_at')
    .in('status', ['sold', 'cancelled', 'expired'])
    .or(`seller_id.eq.${userId},buyer_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error || !rows?.length) return []

  const allIds = new Set<string>()
  for (const r of rows as { seller_id: string; buyer_id?: string }[]) {
    allIds.add(r.seller_id)
    if (r.buyer_id) allIds.add(r.buyer_id)
  }
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username')
    .in('id', [...allIds])

  const nameMap = new Map((profiles || []).map((p: { id: string; username?: string }) => [p.id, p.username ?? null]))

  return (rows as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    seller_id: r.seller_id as string,
    buyer_id: (r.buyer_id as string) ?? null,
    item_id: r.item_id as string,
    quantity: r.quantity as number,
    price_gold: r.price_gold as number,
    status: r.status as string,
    created_at: r.created_at as string,
    seller_username: nameMap.get(r.seller_id as string) ?? null,
    buyer_username: r.buyer_id ? nameMap.get(r.buyer_id as string) ?? null : null,
  }))
}
