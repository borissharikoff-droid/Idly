// ─── Hot Zone weekly rotation ────────────────────────────────────────────────
//
// Each week one zone gets 2× gold, 2× material drops, and +1 chest tier.
// The rotation is deterministic (same zone for all players in a given week).
// Week resets on Monday UTC+0.

import { ZONES } from './combat'

/** Returns the ISO week number (1-based) for a given date. */
function isoWeekNumber(d: Date): number {
  const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  const startOfWeek1 = new Date(jan4)
  startOfWeek1.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7))
  const diff = d.getTime() - startOfWeek1.getTime()
  return Math.floor(diff / (7 * 86400 * 1000)) + 1
}

/**
 * Returns the zone ID that is currently "hot" this week.
 * Rotates through all zones in order; offset by year to add year-over-year variation.
 */
export function getHotZoneId(now = new Date()): string {
  const zoneIds = ZONES.map((z) => z.id)
  const week = isoWeekNumber(now)
  const year = now.getUTCFullYear()
  const index = (week + year * 17) % zoneIds.length
  return zoneIds[index]
}

export interface HotZoneModifiers {
  goldMultiplier: 2
  dropMultiplier: 2
  chestTierUp: true
}

export const HOT_ZONE_MODIFIERS: HotZoneModifiers = {
  goldMultiplier: 2,
  dropMultiplier: 2,
  chestTierUp: true,
}

/** Returns how many days remain until the hot zone resets (next Monday). */
export function hotZoneResetsInDays(now = new Date()): number {
  const day = now.getUTCDay() // 0=Sun, 1=Mon ...
  const daysToMonday = day === 0 ? 1 : (8 - day) % 7 || 7
  return daysToMonday
}

/** Bump a chest tier up by one (capped at legendary). */
export const HOT_CHEST_TIER_UP: Record<string, string> = {
  common_chest: 'rare_chest',
  rare_chest: 'epic_chest',
  epic_chest: 'legendary_chest',
  legendary_chest: 'legendary_chest',
}
