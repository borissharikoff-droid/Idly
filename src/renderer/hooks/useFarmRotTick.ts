import { useEffect } from 'react'
import { useFarmStore } from '../stores/farmStore'
import { useToastStore } from '../stores/toastStore'

const ROT_CHECK_INTERVAL_MS = 5_000

/**
 * Interval hook that checks for rotted crops every 5 seconds.
 * Shows a toast notification for each rotted crop.
 * Also triggers auto-harvest if farmhouse level 10.
 */
export function useFarmRotTick() {
  useEffect(() => {
    const check = () => {
      const store = useFarmStore.getState()

      // Check rot
      const rottedSlots = store.checkAllRots()
      if (rottedSlots.length > 0) {
        useToastStore.getState().push({ kind: 'crop_rot', count: rottedSlots.length })
      }

      // Auto-complete farmhouse build if timer finished
      store.completeFarmhouseBuild()

      // Auto-harvest (farmhouse L10)
      store.autoHarvestReady()
    }

    // Run immediately on mount to catch any crops that rotted while app was closed
    check()

    const id = setInterval(check, ROT_CHECK_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])
}
