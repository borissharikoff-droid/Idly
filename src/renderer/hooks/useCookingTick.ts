import { useEffect, useRef } from 'react'
import { useCookingStore } from '../stores/cookingStore'
import { useInventoryStore } from '../stores/inventoryStore'
import { useToastStore } from '../stores/toastStore'
import { LOOT_ITEMS } from '../lib/loot'
import { playCookCompleteSound, playCookBurnSound, playCookSoundForInstrument } from '../lib/sounds'
import { useNavigationStore } from '../stores/navigationStore'
import { grantChefXP } from '../lib/farming'
import { syncInventoryToSupabase } from '../services/supabaseSync'
import { useAuthStore } from '../stores/authStore'
import { recordCookComplete } from '../services/dailyActivityService'
import { useBountyStore } from '../stores/bountyStore'
import { useWeeklyStore } from '../stores/weeklyStore'
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
  const batchRef = useRef<{ jobId: string; itemId: string; qty: number; xp: number; burned: number } | null>(null)
  const stepXpAccumRef = useRef(0)

  function isCookingTabActive() {
    return useNavigationStore.getState().currentTab === 'cooking'
  }

  useEffect(() => {
    function run() {
      const jobBefore = useCookingStore.getState().activeJob
      const stepBefore = jobBefore?.stepIndex ?? -1

      tick(
        Date.now(),
        // onGrant — final item completion only
        (itemId, qty, xpGained) => {
          if (qty > 0) addItem(itemId, qty)
          if (xpGained > 0) grantChefXP(xpGained).catch(() => {})

          const cur = batchRef.current
          if (cur && cur.jobId === jobBefore?.id && cur.itemId === itemId) {
            cur.qty += qty
            // add accumulated step XP + final step XP so notification shows full total
            cur.xp += xpGained + stepXpAccumRef.current
            stepXpAccumRef.current = 0
          } else {
            batchRef.current = { jobId: jobBefore?.id ?? '', itemId, qty, xp: xpGained + stepXpAccumRef.current, burned: 0 }
            stepXpAccumRef.current = 0
          }
        },
        // onBurn — track in batch; single notification shown at job completion
        (itemId, burnedQty) => {
          if (burnedQty <= 0) return
          if (isCookingTabActive()) playCookBurnSound()
          const cur = batchRef.current
          if (cur && cur.jobId === jobBefore?.id && cur.itemId === itemId) {
            cur.burned += burnedQty
          } else {
            batchRef.current = { jobId: jobBefore?.id ?? '', itemId, qty: 0, xp: 0, burned: burnedQty }
          }
        },
        // onStepXp — partial XP for each non-final step completed
        (stepXp) => {
          grantChefXP(stepXp).catch(() => {})
          stepXpAccumRef.current += stepXp
        },
      )

      const jobAfter = useCookingStore.getState().activeJob

      // Play sound when step auto-advances
      if (jobAfter && jobAfter.id === jobBefore?.id && jobAfter.stepIndex !== stepBefore && stepBefore >= 0) {
        const step = jobAfter.steps[jobAfter.stepIndex]
        if (step) {
          if (isCookingTabActive()) playCookSoundForInstrument(stepToInstrument(step))
        }
      }
      const batch = batchRef.current

      if (batch && jobBefore && jobAfter?.id !== jobBefore.id) {
        const def = findItemDef(batch.itemId)
        if (def) {
          if (batch.qty === 0 && batch.burned > 0) {
            // All items burned — show a single burn notification
            useToastStore.getState().push({
              kind: 'cook_complete',
              itemName: `${def.name} burned`,
              itemIcon: '🔥',
              qty: batch.burned,
              xp: 0,
            })
          } else if (batch.qty > 0) {
            const foodDef = FOOD_ITEM_MAP[batch.itemId]
            if (isCookingTabActive()) playCookCompleteSound(foodDef?.rarity ?? 'common')
            recordCookComplete()
            useBountyStore.getState().incrementCook(batch.qty)
            useWeeklyStore.getState().incrementCook(batch.qty)
            import('../stores/guildStore').then(({ useGuildStore }) => useGuildStore.getState().incrementRaidProgress('cook', batch.qty)).catch(() => {})

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
        }
        // Store total XP for the completion banner
        useCookingStore.getState().setLastJobXp(batch.xp)
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
