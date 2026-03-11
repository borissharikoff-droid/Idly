import { describe, expect, it } from 'vitest'
import { getFarmerSpeedMultiplier, getFarmerBonusYieldChance } from '../renderer/lib/farming'
import { getCrafterSpeedMultiplier, getCrafterDoubleChance } from '../renderer/lib/crafting'
import { getChefSpeedMultiplier, getChefDoubleChance } from '../renderer/lib/cooking'

describe('getFarmerSpeedMultiplier', () => {
  it('returns 1.0 at level 0', () => {
    expect(getFarmerSpeedMultiplier(0)).toBe(1.0)
  })

  it('returns 1.0 at level 9 (below first tier)', () => {
    expect(getFarmerSpeedMultiplier(9)).toBe(1.0)
  })

  it('returns 0.90 at level 10', () => {
    expect(getFarmerSpeedMultiplier(10)).toBe(0.90)
  })

  it('returns 0.90 at level 24', () => {
    expect(getFarmerSpeedMultiplier(24)).toBe(0.90)
  })

  it('returns 0.80 at level 25', () => {
    expect(getFarmerSpeedMultiplier(25)).toBe(0.80)
  })

  it('returns 0.80 at level 39', () => {
    expect(getFarmerSpeedMultiplier(39)).toBe(0.80)
  })

  it('returns 0.70 at level 40', () => {
    expect(getFarmerSpeedMultiplier(40)).toBe(0.70)
  })

  it('returns 0.70 at level 59', () => {
    expect(getFarmerSpeedMultiplier(59)).toBe(0.70)
  })

  it('returns 0.55 at level 60', () => {
    expect(getFarmerSpeedMultiplier(60)).toBe(0.55)
  })

  it('returns 0.55 at level 79', () => {
    expect(getFarmerSpeedMultiplier(79)).toBe(0.55)
  })

  it('returns 0.40 at level 80', () => {
    expect(getFarmerSpeedMultiplier(80)).toBe(0.40)
  })

  it('returns 0.40 at level 99', () => {
    expect(getFarmerSpeedMultiplier(99)).toBe(0.40)
  })
})

describe('getFarmerBonusYieldChance', () => {
  it('returns 0 at level 0', () => {
    expect(getFarmerBonusYieldChance(0)).toBe(0)
  })

  it('returns 0 at level 10', () => {
    expect(getFarmerBonusYieldChance(10)).toBe(0)
  })

  it('returns 0 at level 24', () => {
    expect(getFarmerBonusYieldChance(24)).toBe(0)
  })

  it('returns 0.15 at level 25', () => {
    expect(getFarmerBonusYieldChance(25)).toBe(0.15)
  })

  it('returns 0.15 at level 59', () => {
    expect(getFarmerBonusYieldChance(59)).toBe(0.15)
  })

  it('returns 0.45 at level 60', () => {
    expect(getFarmerBonusYieldChance(60)).toBe(0.45)
  })

  it('returns 0.45 at level 99', () => {
    expect(getFarmerBonusYieldChance(99)).toBe(0.45)
  })
})

describe('speed multiplier consistency across farmer/crafter/chef', () => {
  const tiers = [0, 5, 9, 10, 24, 25, 39, 40, 59, 60, 79, 80, 99]

  it('farmer and crafter share the same speed curve', () => {
    for (const level of tiers) {
      expect(getFarmerSpeedMultiplier(level)).toBe(getCrafterSpeedMultiplier(level))
    }
  })

  it('farmer and chef share the same speed curve', () => {
    for (const level of tiers) {
      expect(getFarmerSpeedMultiplier(level)).toBe(getChefSpeedMultiplier(level))
    }
  })
})

describe('bonus yield/double chance consistency across farmer/crafter/chef', () => {
  it('farmer bonus yield chance matches crafter double chance at key tiers', () => {
    expect(getFarmerBonusYieldChance(0)).toBe(getCrafterDoubleChance(0))
    expect(getFarmerBonusYieldChance(24)).toBe(getCrafterDoubleChance(24))
    expect(getFarmerBonusYieldChance(25)).toBe(getCrafterDoubleChance(25))
    expect(getFarmerBonusYieldChance(59)).toBe(getCrafterDoubleChance(59))
    expect(getFarmerBonusYieldChance(60)).toBe(getCrafterDoubleChance(60))
    expect(getFarmerBonusYieldChance(99)).toBe(getCrafterDoubleChance(99))
  })

  it('farmer bonus yield chance matches chef double chance at key tiers', () => {
    expect(getFarmerBonusYieldChance(0)).toBe(getChefDoubleChance(0))
    expect(getFarmerBonusYieldChance(24)).toBe(getChefDoubleChance(24))
    expect(getFarmerBonusYieldChance(25)).toBe(getChefDoubleChance(25))
    expect(getFarmerBonusYieldChance(59)).toBe(getChefDoubleChance(59))
    expect(getFarmerBonusYieldChance(60)).toBe(getChefDoubleChance(60))
    expect(getFarmerBonusYieldChance(99)).toBe(getChefDoubleChance(99))
  })
})
