import { useEffect, useRef } from 'react'
import { useCraftingStore } from '../stores/craftingStore'
import { useInventoryStore } from '../stores/inventoryStore'
import { useToastStore } from '../stores/toastStore'
import { LOOT_ITEMS } from '../lib/loot'
import { playCraftCompleteSound } from '../lib/sounds'
import { grantCrafterXP } from '../lib/farming'

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
        batchRef.current = null
      }
    }
    // Fast-forward any progress that accrued while the app was closed
    run()
    const id = setInterval(run, 2_000)
    return () => clearInterval(id)
  }, [tick, addItem])
}
