import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useNavBadgeStore } from '../stores/navBadgeStore'
import { useNotificationStore } from '../stores/notificationStore'
import { LOOT_ITEMS } from '../lib/loot'
import { getFarmItemDisplay } from '../lib/farming'
import { recentlyCancelledListingIds } from '../services/marketplaceService'

type CachedListing = { item_id: string; quantity: number; price_gold: number }

/**
 * Global hook: listens for marketplace_listings changes on ALL tabs.
 * Fires a bell notification + nav badge when one of the user's listings is sold.
 * Must be called once in App.tsx.
 */
export function useMarketplaceSaleNotifier() {
  const { user } = useAuthStore()
  const myListingsRef = useRef(new Map<string, CachedListing>())

  // Populate the ref whenever the user logs in
  useEffect(() => {
    if (!supabase || !user?.id) { myListingsRef.current.clear(); return }
    supabase
      .from('marketplace_listings')
      .select('id, item_id, quantity, price_gold')
      .eq('seller_id', user.id)
      .eq('status', 'active')
      .then(
        ({ data }) => {
          if (!data) return
          const map = new Map<string, CachedListing>()
          for (const l of data as unknown as (CachedListing & { id: string })[]) {
            map.set(l.id, { item_id: l.item_id, quantity: l.quantity, price_gold: l.price_gold })
          }
          myListingsRef.current = map
        },
        () => {},
      )
  }, [user?.id])

  useEffect(() => {
    if (!supabase || !user?.id) return
    const uid = user.id
    const channel = supabase
      .channel('global-marketplace-sale-notifier')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marketplace_listings' }, async () => {
        const prevMap = new Map(myListingsRef.current) // snapshot before refresh
        if (prevMap.size === 0) return

        const result = await supabase!
          .from('marketplace_listings')
          .select('id, item_id, quantity, price_gold')
          .eq('seller_id', uid)
          .eq('status', 'active')
          .then((r) => r, () => ({ data: null }))

        const data = result.data
        if (!data) return

        // Update cached ref
        const newMap = new Map<string, CachedListing>()
        for (const l of data as unknown as (CachedListing & { id: string })[]) {
          newMap.set(l.id, { item_id: l.item_id, quantity: l.quantity, price_gold: l.price_gold })
        }
        myListingsRef.current = newMap
        const newIds = new Set(newMap.keys())

        // Any of my prev listings that vanished and weren't cancelled by me = sold
        for (const [prevId, prev] of prevMap) {
          if (newIds.has(prevId)) continue
          if (recentlyCancelledListingIds.has(prevId)) {
            recentlyCancelledListingIds.delete(prevId)
            continue
          }
          const item = LOOT_ITEMS.find((x) => x.id === prev.item_id)
          const farmDisplay = !item ? getFarmItemDisplay(prev.item_id) : null
          const name = item?.name ?? farmDisplay?.name ?? prev.item_id
          useNotificationStore.getState().push({
            type: 'marketplace_sale',
            icon: '🛒',
            title: 'Item sold!',
            body: `${name}${prev.quantity > 1 ? ` ×${prev.quantity}` : ''} — ${prev.price_gold} 🪙`,
          })
          useNavBadgeStore.getState().addMarketplaceSale()
        }
      })
      .subscribe()

    return () => { supabase!.removeChannel(channel).catch(() => {}) }
  }, [user?.id])
}
