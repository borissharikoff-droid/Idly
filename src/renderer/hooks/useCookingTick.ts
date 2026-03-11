import { useEffect, useRef } from 'react'
import { useCookingStore } from '../stores/cookingStore'
import { useInventoryStore } from '../stores/inventoryStore'
import { useToastStore } from '../stores/toastStore'
import { LOOT_ITEMS } from '../lib/loot'
import { playCraftCompleteSound, playCookSoundForInstrument } from '../lib/sounds'
import { grantChefXP } from '../lib/farming'
import { syncInventoryToSupabase } from '../services/supabaseSync'
import { useAuthStore } from '../stores/authStore'
import { useFarmStore } from '../stores/farmStore'
import { supabase } from '../lib/supabase'
import { stepToInstrument, FOOD_ITEM_MAP } from '../lib/cooking'

/** Look up item def from loot OR food tables. */
function findItemDef(id: string) {
  const food = FOOD_ITEM_MAP[id]
  if (food) return { name: food.name, icon: food.icon }
  const loot = LOOT_ITEMS.find((x) => x.id === id)
  if (loot) return { name: loot.name, icon: loot.icon }
  return null
}

export function useCookingTick() {
  const tick = useCookingStore((s) => s.tick)
  const addItem = useInventoryStore((s) => s.addItem)
  const batchRef = useRef<{ jobId: string; itemId: string; qty: number; xp: number } | null>(null)
  const prevStepRef = useRef<number>(-1)

  useEffect(() => {
    function run() {
      const jobBefore = useCookingStore.getState().activeJob
      const stepBefore = jobBefore?.stepIndex ?? -1

      tick(
        Date.now(),
        // onGrant
        (itemId, qty, xpGained) => {
          if (qty > 0) addItem(itemId, qty)
          if (xpGained > 0) grantChefXP(xpGained).catch(() => {})

          const cur = batchRef.current
          if (cur && cur.jobId === jobBefore?.id && cur.itemId === itemId) {
            cur.qty += qty
            cur.xp += xpGained
          } else {
            batchRef.current = { jobId: jobBefore?.id ?? '', itemId, qty, xp: xpGained }
          }
        },
        // onBurn
        (itemId, burnedQty) => {
          const def = findItemDef(itemId)
          if (def && burnedQty > 0) {
            useToastStore.getState().push({
              kind: 'cook_complete',
              itemName: `Burned ${def.name}`,
              itemIcon: '🔥',
              qty: burnedQty,
              xp: 0,
            })
          }
        },
      )

      const jobAfter = useCookingStore.getState().activeJob

      // Play sound when step auto-advances
      if (jobAfter && jobAfter.id === jobBefore?.id && jobAfter.stepIndex !== stepBefore && stepBefore >= 0) {
        const step = jobAfter.steps[jobAfter.stepIndex]
        if (step) {
          playCookSoundForInstrument(stepToInstrument(step))
        }
      }
      prevStepRef.current = jobAfter?.stepIndex ?? -1

      const batch = batchRef.current

      if (batch && jobBefore && jobAfter?.id !== jobBefore.id) {
        const def = findItemDef(batch.itemId)
        if (def) {
          playCraftCompleteSound()

          // Show quality/burn info from last roll
          const lastRoll = useCookingStore.getState().lastRoll
          let suffix = ''
          if (lastRoll) {
            if (lastRoll.bonus > 0) suffix += ` (+${lastRoll.bonus} bonus)`
            if (lastRoll.burned > 0) suffix += ` (${lastRoll.burned} burned)`
          }

          useToastStore.getState().push({
            kind: 'cook_complete',
            itemName: def.name + suffix,
            itemIcon: def.icon,
            qty: batch.qty,
            xp: batch.xp,
          })
        }
        batchRef.current = null
        const user = useAuthStore.getState().user
        if (supabase && user) {
          const { items, chests } = useInventoryStore.getState()
          const { seeds, seedZips } = useFarmStore.getState()
          syncInventoryToSupabase(items, chests, { merge: false, seeds, seedZips }).catch(() => {})
        }
      }
    }
    run()
    const id = setInterval(run, 500)
    return () => clearInterval(id)
  }, [tick, addItem])
}
