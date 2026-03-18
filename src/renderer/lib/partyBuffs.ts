/** Multiplier to apply to skill XP ticks when the player is in an active party (2+ members). */
export function getPartyXpMultiplier(isInActiveParty: boolean): number {
  return isInActiveParty ? 1.05 : 1
}
