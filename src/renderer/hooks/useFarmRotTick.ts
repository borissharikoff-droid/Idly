import { useEffect } from 'react'
import { useFarmStore } from '../stores/farmStore'

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

      // Check rot (silent — no toast)
      store.checkAllRots()

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
