import { useEffect, useRef } from 'react'
import { useCraftingStore } from '../stores/craftingStore'
import { usePartyCraftStore } from '../stores/partyCraftStore'
import { useInventoryStore } from '../stores/inventoryStore'
import { useToastStore } from '../stores/toastStore'
import { LOOT_ITEMS } from '../lib/loot'
import { playCraftCompleteSound } from '../lib/sounds'
import { grantCrafterXP } from '../lib/farming'
import { syncInventoryToSupabase } from '../services/supabaseSync'
import { useAuthStore } from '../stores/authStore'
import { useFarmStore } from '../stores/farmStore'
import { supabase } from '../lib/supabase'

/**
 * Drives the crafting job queue from App-level (runs on all tabs).
 * Ticks every 2 seconds; uses wall-clock anchors so progress is correct
 * even if the app was closed and reopened.
 *
 * Toast + sound fire once per completed batch (not per item).
 */
export function useCraftTick() {
  const tick = useCraftingStore((s) => s.tick)
  const addItem = useInventoryStore((s) => s.addItem)
  const batchRef = useRef<{ jobId: string; itemId: string; qty: number; xp: number } | null>(null)

  useEffect(() => {
    function run() {
      const jobBefore = useCraftingStore.getState().activeJob

      tick(Date.now(), (itemId, qty, xpGained) => {
        addItem(itemId, qty)
        if (xpGained > 0) grantCrafterXP(xpGained).catch(() => {})

        // Accumulate within current batch
        const cur = batchRef.current
        if (cur && cur.jobId === jobBefore?.id && cur.itemId === itemId) {
          cur.qty += qty
          cur.xp += xpGained
        } else {
          batchRef.current = { jobId: jobBefore?.id ?? '', itemId, qty, xp: xpGained }
        }
      }, (id, refundQty) => {
        // Mastery ingredient refund — silently return materials to inventory
        addItem(id, refundQty)
      })

      const jobAfter = useCraftingStore.getState().activeJob
      const batch = batchRef.current

      // Batch finished: active job changed or completed (jobAfter is null or different id)
      if (batch && jobBefore && jobAfter?.id !== jobBefore.id) {
        const def = LOOT_ITEMS.find((x) => x.id === batch.itemId)
        if (def) {
          playCraftCompleteSound()
          useToastStore.getState().push({
            kind: 'craft_complete',
            itemName: def.name,
            itemIcon: def.icon,
            qty: batch.qty,
            xp: batch.xp,
          })
        }
        // Distribute XP to party helpers if this was a party craft
        const partyCraftSession = usePartyCraftStore.getState().session
        if (partyCraftSession?.status === 'crafting' && partyCraftSession.recipe_id === jobBefore.recipeId) {
          usePartyCraftStore.getState().completeSession(partyCraftSession.id).catch(() => {})
        }
        batchRef.current = null
        // Sync crafted items to Supabase so periodic merge doesn't lose them
        const user = useAuthStore.getState().user
        if (supabase && user) {
          const { items, chests } = useInventoryStore.getState()
          const { seeds, seedZips } = useFarmStore.getState()
          syncInventoryToSupabase(items, chests, { merge: false, seeds, seedZips }).catch(() => {})
        }
      }
    }
    // Fast-forward any progress that accrued while the app was closed
    run()
    const id = setInterval(run, 2_000)
    return () => clearInterval(id)
  }, [tick, addItem])
}
