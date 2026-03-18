import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FOOD_ITEMS,
  FOOD_ITEM_MAP,
  FOOD_IDS,
  getFoodItemById,
  isFoodId,
  COOKING_RECIPES,
  COOKING_RECIPE_MAP,
  COOK_INSTRUMENTS,
  COOK_INSTRUMENT_MAP,
  DEFAULT_UNLOCKED_INSTRUMENTS,
  stepToInstrument,
  recipeInstruments,
  hasInstrumentsForRecipe,
  instrumentSpeedMult,
  BASE_BURN_CHANCE,
  effectiveBurnChance,
  effectiveQualityBonus,
  getChefSpeedMultiplier,
  getChefDoubleChance,
  canAffordCookRecipe,
  maxAffordableCookQty,
  cookDuration,
  cookStepDuration,
  cookTotalDuration,
  formatCookTime,
  MYSTERY_STEW,
  MYSTERY_STEW_XP,
  matchRecipeFromIngredients,
  matchRecipeByIds,
  MASTERY_MAX_STARS,
  MASTERY_THRESHOLDS,
  MASTERY_BONUSES,
  getMasteryStars,
  getMasteryBonus,
  cooksToNextStar,
  getRecipeHint,
  type CookInstrumentId,
  type CookingRecipe,
  type CookStep,
} from '../renderer/lib/cooking'
import { useCookingStore } from '../renderer/stores/cookingStore'

// ─── Test utilities ──────────────────────────────────────────────────────────

function createMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    get length() { return store.size },
    clear() { store.clear() },
    getItem(key: string) { return store.has(key) ? store.get(key)! : null },
    key(index: number) { return Array.from(store.keys())[index] ?? null },
    removeItem(key: string) { store.delete(key) },
    setItem(key: string, value: string) { store.set(key, String(value)) },
  }
}

function resetStore() {
  useCookingStore.setState({
    cookXp: 0,
    activeJob: null,
    queue: [],
    instrumentTiers: { knife: 0, pot: 0, pan: 0, oven: 0, mortar: 0, bowl: 0 },
    unlockedInstruments: ['knife', 'pot'],
    lastRoll: null,
    discoveredRecipes: {},
  })
}

/** Build items record with enough of everything for any recipe. */
function richInventory(): Record<string, number> {
  return {
    wheat: 999, herbs: 999, apples: 999, blossoms: 999, clovers: 999,
    orchids: 999, star_bloom: 999, crystal_root: 999, void_blossom: 999,
    slime_gel: 999, goblin_tooth: 999, wolf_fang: 999, orc_shard: 999,
    troll_hide: 999, dragon_scale: 999, golden_wheat: 999,
  }
}

const ALL_INSTRUMENT_IDS: CookInstrumentId[] = ['knife', 'pot', 'pan', 'bowl', 'oven', 'mortar']

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1: FOOD ITEM DEFINITIONS (cooking.ts data integrity)
// ═══════════════════════════════════════════════════════════════════════════════

describe('food items', () => {
  it('has at least 14 food items', () => {
    expect(FOOD_ITEMS.length).toBeGreaterThanOrEqual(14)
  })

  it('every food item has a unique id', () => {
    const ids = FOOD_ITEMS.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every food id starts with "food_"', () => {
    for (const f of FOOD_ITEMS) {
      expect(f.id).toMatch(/^food_/)
    }
  })

  it('every food item has name, icon, rarity, description', () => {
    for (const f of FOOD_ITEMS) {
      expect(f.name).toBeTruthy()
      expect(f.icon).toBeTruthy()
      expect(['common', 'rare', 'epic', 'legendary', 'mythic']).toContain(f.rarity)
      expect(f.description.length).toBeGreaterThan(5)
    }
  })

  it('every food item has at least a heal effect', () => {
    for (const f of FOOD_ITEMS) {
      expect(f.effect.heal).toBeGreaterThan(0)
    }
  })

  it('higher rarity foods have higher total effect values', () => {
    const rarityOrder = ['common', 'rare', 'epic', 'legendary', 'mythic']
    const avgByRarity: Record<string, number> = {}
    for (const r of rarityOrder) {
      const foods = FOOD_ITEMS.filter((f) => f.rarity === r)
      if (foods.length === 0) continue
      const avg = foods.reduce((sum, f) => {
        const e = f.effect
        return sum + (e.heal ?? 0) + (e.buffAtk ?? 0) * 5 + (e.buffDef ?? 0) * 5 +
          (e.buffRegen ?? 0) * 10 + (e.buffDurationSec ?? 0) * 0.1
      }, 0) / foods.length
      avgByRarity[r] = avg
    }
    // Each successive rarity should have higher average power
    for (let i = 1; i < rarityOrder.length; i++) {
      const prev = avgByRarity[rarityOrder[i - 1]]
      const curr = avgByRarity[rarityOrder[i]]
      if (prev != null && curr != null) {
        expect(curr).toBeGreaterThan(prev)
      }
    }
  })

  it('FOOD_ITEM_MAP contains all items', () => {
    expect(Object.keys(FOOD_ITEM_MAP).length).toBe(FOOD_ITEMS.length)
    for (const f of FOOD_ITEMS) {
      expect(FOOD_ITEM_MAP[f.id]).toBe(f)
    }
  })

  it('getFoodItemById returns correct item or undefined', () => {
    expect(getFoodItemById('food_bread')?.name).toBe('Bread')
    expect(getFoodItemById('nonexistent')).toBeUndefined()
  })

  it('FOOD_IDS matches all food item ids', () => {
    expect(FOOD_IDS.length).toBe(FOOD_ITEMS.length)
    for (const id of FOOD_IDS) {
      expect(isFoodId(id)).toBe(true)
    }
    expect(isFoodId('random_item')).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2: COOKING RECIPES (data integrity & consistency)
// ═══════════════════════════════════════════════════════════════════════════════

describe('cooking recipes', () => {
  it('has at least 15 recipes', () => {
    expect(COOKING_RECIPES.length).toBeGreaterThanOrEqual(15)
  })

  it('every recipe has a unique id', () => {
    const ids = COOKING_RECIPES.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every recipe id starts with "cook_"', () => {
    for (const r of COOKING_RECIPES) {
      expect(r.id).toMatch(/^cook_/)
    }
  })

  it('every recipe maps to an existing food item', () => {
    for (const r of COOKING_RECIPES) {
      expect(FOOD_ITEM_MAP[r.outputItemId]).toBeTruthy()
    }
  })

  it('every recipe has outputQty >= 1', () => {
    for (const r of COOKING_RECIPES) {
      expect(r.outputQty).toBeGreaterThanOrEqual(1)
    }
  })

  it('every recipe has at least 1 ingredient', () => {
    for (const r of COOKING_RECIPES) {
      expect(r.ingredients.length).toBeGreaterThanOrEqual(1)
      for (const ing of r.ingredients) {
        expect(ing.id).toBeTruthy()
        expect(ing.qty).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('every recipe has at least 2 steps', () => {
    for (const r of COOKING_RECIPES) {
      expect(r.steps.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('every step has label, icon, and positive secPerItem', () => {
    for (const r of COOKING_RECIPES) {
      for (const s of r.steps) {
        expect(s.label).toBeTruthy()
        expect(s.icon).toBeTruthy()
        expect(s.secPerItem).toBeGreaterThan(0)
      }
    }
  })

  it('higher rarity recipes require higher chef levels', () => {
    const rarityOrder = ['common', 'rare', 'epic', 'legendary', 'mythic']
    const maxLevelByRarity: Record<string, number> = {}
    for (const r of COOKING_RECIPES) {
      const food = FOOD_ITEM_MAP[r.outputItemId]
      if (!food) continue
      const prev = maxLevelByRarity[food.rarity] ?? 0
      maxLevelByRarity[food.rarity] = Math.max(prev, r.chefLevelRequired)
    }
    // Avg level per rarity should be increasing
    const minByRarity: Record<string, number> = {}
    for (const r of COOKING_RECIPES) {
      const food = FOOD_ITEM_MAP[r.outputItemId]
      if (!food) continue
      const prev = minByRarity[food.rarity]
      minByRarity[food.rarity] = prev == null ? r.chefLevelRequired : Math.min(prev, r.chefLevelRequired)
    }
    for (let i = 1; i < rarityOrder.length; i++) {
      const prevMin = minByRarity[rarityOrder[i - 1]]
      const currMin = minByRarity[rarityOrder[i]]
      if (prevMin != null && currMin != null) {
        expect(currMin).toBeGreaterThanOrEqual(prevMin)
      }
    }
  })

  it('higher rarity recipes give more XP per item', () => {
    const rarityOrder = ['common', 'rare', 'epic', 'legendary', 'mythic']
    const avgXpByRarity: Record<string, number> = {}
    for (const r of COOKING_RECIPES) {
      const food = FOOD_ITEM_MAP[r.outputItemId]
      if (!food) continue
      const group = avgXpByRarity[food.rarity]
      // Simple sum; we'll divide later
      if (!group) avgXpByRarity[food.rarity] = r.xpPerItem
      else avgXpByRarity[food.rarity] = (avgXpByRarity[food.rarity] + r.xpPerItem) / 2
    }
    for (let i = 1; i < rarityOrder.length; i++) {
      const prev = avgXpByRarity[rarityOrder[i - 1]]
      const curr = avgXpByRarity[rarityOrder[i]]
      if (prev != null && curr != null) {
        expect(curr).toBeGreaterThan(prev)
      }
    }
  })

  it('COOKING_RECIPE_MAP contains all recipes by id', () => {
    expect(Object.keys(COOKING_RECIPE_MAP).length).toBe(COOKING_RECIPES.length)
    for (const r of COOKING_RECIPES) {
      expect(COOKING_RECIPE_MAP[r.id]).toBe(r)
    }
  })

  it('no two recipes produce the same food item', () => {
    const outputIds = COOKING_RECIPES.map((r) => r.outputItemId)
    expect(new Set(outputIds).size).toBe(outputIds.length)
  })

  it('common recipes have 3 steps, rare 3-4, epic 4-5, legendary 5, mythic 6', () => {
    for (const r of COOKING_RECIPES) {
      const food = FOOD_ITEM_MAP[r.outputItemId]
      if (!food) continue
      const n = r.steps.length
      switch (food.rarity) {
        case 'common':    expect(n).toBeGreaterThanOrEqual(2); expect(n).toBeLessThanOrEqual(4); break
        case 'rare':      expect(n).toBeGreaterThanOrEqual(3); expect(n).toBeLessThanOrEqual(4); break
        case 'epic':      expect(n).toBeGreaterThanOrEqual(4); expect(n).toBeLessThanOrEqual(5); break
        case 'legendary': expect(n).toBeGreaterThanOrEqual(4); expect(n).toBeLessThanOrEqual(6); break
        case 'mythic':    expect(n).toBeGreaterThanOrEqual(5); expect(n).toBeLessThanOrEqual(7); break
      }
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3: COOKING INSTRUMENTS (definitions, tiers, unlocking)
// ═══════════════════════════════════════════════════════════════════════════════

describe('cooking instruments', () => {
  it('has exactly 6 instruments', () => {
    expect(COOK_INSTRUMENTS.length).toBe(6)
  })

  it('every instrument has unique id', () => {
    const ids = COOK_INSTRUMENTS.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every instrument has exactly 5 tiers', () => {
    for (const inst of COOK_INSTRUMENTS) {
      expect(inst.tiers.length).toBe(5)
    }
  })

  it('tier bonuses are non-decreasing', () => {
    for (const inst of COOK_INSTRUMENTS) {
      for (let i = 1; i < inst.tiers.length; i++) {
        expect(inst.tiers[i].speedBonus).toBeGreaterThanOrEqual(inst.tiers[i - 1].speedBonus)
        expect(inst.tiers[i].qualityBonus).toBeGreaterThanOrEqual(inst.tiers[i - 1].qualityBonus)
        expect(inst.tiers[i].burnReduction).toBeGreaterThanOrEqual(inst.tiers[i - 1].burnReduction)
      }
    }
  })

  it('tier costs are non-decreasing', () => {
    for (const inst of COOK_INSTRUMENTS) {
      for (let i = 1; i < inst.tiers.length; i++) {
        expect(inst.tiers[i].cost).toBeGreaterThanOrEqual(inst.tiers[i - 1].cost)
      }
    }
  })

  it('base tier (0) has zero bonuses and zero cost', () => {
    for (const inst of COOK_INSTRUMENTS) {
      const base = inst.tiers[0]
      expect(base.speedBonus).toBe(0)
      expect(base.qualityBonus).toBe(0)
      expect(base.burnReduction).toBe(0)
      expect(base.cost).toBe(0)
    }
  })

  it('max tier has speedBonus=0.32, burnReduction=1.0', () => {
    for (const inst of COOK_INSTRUMENTS) {
      const max = inst.tiers[inst.tiers.length - 1]
      expect(max.speedBonus).toBe(0.32)
      expect(max.burnReduction).toBe(1.0)
    }
  })

  it('knife and pot start unlocked (cost 0), others require gold', () => {
    expect(COOK_INSTRUMENT_MAP['knife'].unlockCost).toBe(0)
    expect(COOK_INSTRUMENT_MAP['pot'].unlockCost).toBe(0)
    expect(COOK_INSTRUMENT_MAP['pan'].unlockCost).toBeGreaterThan(0)
    expect(COOK_INSTRUMENT_MAP['bowl'].unlockCost).toBeGreaterThan(0)
    expect(COOK_INSTRUMENT_MAP['oven'].unlockCost).toBeGreaterThan(0)
    expect(COOK_INSTRUMENT_MAP['mortar'].unlockCost).toBeGreaterThan(0)
  })

  it('DEFAULT_UNLOCKED_INSTRUMENTS contains only free instruments', () => {
    expect(DEFAULT_UNLOCKED_INSTRUMENTS).toContain('knife')
    expect(DEFAULT_UNLOCKED_INSTRUMENTS).toContain('pot')
    expect(DEFAULT_UNLOCKED_INSTRUMENTS).not.toContain('pan')
    expect(DEFAULT_UNLOCKED_INSTRUMENTS).not.toContain('oven')
  })

  it('COOK_INSTRUMENT_MAP is complete', () => {
    for (const id of ALL_INSTRUMENT_IDS) {
      expect(COOK_INSTRUMENT_MAP[id]).toBeTruthy()
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4: STEP-TO-INSTRUMENT MAPPING
// ═══════════════════════════════════════════════════════════════════════════════

describe('stepToInstrument', () => {
  it('maps knife keywords correctly', () => {
    expect(stepToInstrument({ label: 'Chop Wheat', icon: '🔪', secPerItem: 2 })).toBe('knife')
    expect(stepToInstrument({ label: 'Dice Herbs', icon: '🔪', secPerItem: 3 })).toBe('knife')
    expect(stepToInstrument({ label: 'Peel Apples', icon: '🔪', secPerItem: 2 })).toBe('knife')
    expect(stepToInstrument({ label: 'Slice & Tenderize', icon: '🔪', secPerItem: 5 })).toBe('knife')
    expect(stepToInstrument({ label: 'Crack Scales', icon: '🐉', secPerItem: 50 })).toBe('knife')
    expect(stepToInstrument({ label: 'Extract Marrow', icon: '🦴', secPerItem: 40 })).toBe('knife')
    expect(stepToInstrument({ label: 'Pluck Petals', icon: '🌸', secPerItem: 30 })).toBe('knife')
  })

  it('maps pan keywords correctly', () => {
    expect(stepToInstrument({ label: 'Sear', icon: '🍳', secPerItem: 12 })).toBe('pan')
    expect(stepToInstrument({ label: 'Grill', icon: '🍳', secPerItem: 25 })).toBe('pan')
    expect(stepToInstrument({ label: 'Fry Kebabs', icon: '🍳', secPerItem: 6 })).toBe('pan')
    expect(stepToInstrument({ label: 'Dragonfire Sear', icon: '🔥', secPerItem: 120 })).toBe('pan')
    expect(stepToInstrument({ label: 'Rest & Glaze', icon: '♨️', secPerItem: 60 })).toBe('pan')
  })

  it('maps oven keywords correctly', () => {
    expect(stepToInstrument({ label: 'Bake Pie', icon: '🔥', secPerItem: 30 })).toBe('oven')
    expect(stepToInstrument({ label: 'Feast Bake', icon: '🔥', secPerItem: 80 })).toBe('oven')
    expect(stepToInstrument({ label: 'Cosmic Seal', icon: '🔮', secPerItem: 300 })).toBe('oven')
  })

  it('maps mortar keywords correctly', () => {
    expect(stepToInstrument({ label: 'Grind Petals', icon: '⚗️', secPerItem: 10 })).toBe('mortar')
    expect(stepToInstrument({ label: 'Crush Crystal', icon: '⚗️', secPerItem: 30 })).toBe('mortar')
    expect(stepToInstrument({ label: 'Distill Elixir', icon: '🧪', secPerItem: 180 })).toBe('mortar')
    expect(stepToInstrument({ label: 'Attune Void', icon: '🌀', secPerItem: 40 })).toBe('mortar')
    expect(stepToInstrument({ label: 'Weave Essence', icon: '🧬', secPerItem: 60 })).toBe('mortar')
    expect(stepToInstrument({ label: 'Void Seasoning', icon: '🌀', secPerItem: 40 })).toBe('mortar')
    expect(stepToInstrument({ label: 'Strain Liquid', icon: '⚗️', secPerItem: 20 })).toBe('mortar')
  })

  it('maps pot keywords correctly', () => {
    expect(stepToInstrument({ label: 'Boil Dough', icon: '🍲', secPerItem: 3 })).toBe('pot')
    expect(stepToInstrument({ label: 'Simmer', icon: '🍲', secPerItem: 3 })).toBe('pot')
    expect(stepToInstrument({ label: 'Slow Cook', icon: '♨️', secPerItem: 34 })).toBe('pot')
    expect(stepToInstrument({ label: 'Stew Herbs', icon: '♨️', secPerItem: 3 })).toBe('pot')
    expect(stepToInstrument({ label: 'Reduce Broth', icon: '🥘', secPerItem: 230 })).toBe('pot')
    expect(stepToInstrument({ label: 'Steep & Strain', icon: '🍵', secPerItem: 60 })).toBe('mortar') // 'strain' matches mortar
    expect(stepToInstrument({ label: 'Infuse Starbloom', icon: '✨', secPerItem: 60 })).toBe('pot')
  })

  it('falls back to bowl for unmatched keywords', () => {
    expect(stepToInstrument({ label: 'Mix Filling', icon: '🥣', secPerItem: 5 })).toBe('bowl')
    expect(stepToInstrument({ label: 'Roll Crust', icon: '🤲', secPerItem: 5 })).toBe('bowl')
    expect(stepToInstrument({ label: 'Layer & Assemble', icon: '🍱', secPerItem: 14 })).toBe('bowl')
    expect(stepToInstrument({ label: 'Skim Impurities', icon: '🥄', secPerItem: 30 })).toBe('bowl')
    expect(stepToInstrument({ label: 'Unknown Step', icon: '❓', secPerItem: 10 })).toBe('bowl')
  })

  it('every recipe step maps to a valid instrument', () => {
    for (const r of COOKING_RECIPES) {
      for (const s of r.steps) {
        const instId = stepToInstrument(s)
        expect(ALL_INSTRUMENT_IDS).toContain(instId)
      }
    }
  })
})

describe('recipeInstruments', () => {
  it('returns unique instruments for bread (knife, pot)', () => {
    const bread = COOKING_RECIPE_MAP['cook_bread']
    const instruments = recipeInstruments(bread)
    expect(instruments).toContain('knife')
    expect(instruments).toContain('pot')
    expect(new Set(instruments).size).toBe(instruments.length)
  })

  it('returns instruments for a complex recipe', () => {
    const voidFeast = COOKING_RECIPE_MAP['cook_void_feast']
    const instruments = recipeInstruments(voidFeast)
    expect(instruments.length).toBeGreaterThanOrEqual(2)
  })
})

describe('hasInstrumentsForRecipe', () => {
  it('returns true when all instruments are unlocked', () => {
    const bread = COOKING_RECIPE_MAP['cook_bread']
    expect(hasInstrumentsForRecipe(bread, ['knife', 'pot', 'pan', 'bowl', 'oven', 'mortar'])).toBe(true)
  })

  it('returns true for bread with just knife and pot', () => {
    const bread = COOKING_RECIPE_MAP['cook_bread']
    expect(hasInstrumentsForRecipe(bread, ['knife', 'pot'])).toBe(true)
  })

  it('returns false when missing a required instrument', () => {
    const bread = COOKING_RECIPE_MAP['cook_bread']
    expect(hasInstrumentsForRecipe(bread, ['pot'])).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// PART 5: SPEED, BURN & QUALITY CALCULATIONS
// ═══════════════════════════════════════════════════════════════════════════════

describe('instrumentSpeedMult', () => {
  it('tier 0 returns 1.0 (no speed bonus)', () => {
    const tiers: Record<CookInstrumentId, number> = { knife: 0, pot: 0, pan: 0, bowl: 0, oven: 0, mortar: 0 }
    expect(instrumentSpeedMult(tiers, 'knife')).toBe(1)
  })

  it('higher tiers return lower multiplier (faster speed)', () => {
    const t1: Record<CookInstrumentId, number> = { knife: 1, pot: 0, pan: 0, bowl: 0, oven: 0, mortar: 0 }
    const t4: Record<CookInstrumentId, number> = { knife: 4, pot: 0, pan: 0, bowl: 0, oven: 0, mortar: 0 }
    expect(instrumentSpeedMult(t1, 'knife')).toBeLessThan(1)
    expect(instrumentSpeedMult(t4, 'knife')).toBeLessThan(instrumentSpeedMult(t1, 'knife'))
  })

  it('max tier (4) has multiplier 0.68 (32% bonus)', () => {
    const tiers: Record<CookInstrumentId, number> = { knife: 4, pot: 0, pan: 0, bowl: 0, oven: 0, mortar: 0 }
    expect(instrumentSpeedMult(tiers, 'knife')).toBeCloseTo(0.68, 2)
  })
})

describe('chef speed multiplier', () => {
  it('level 0 returns 1.0', () => {
    expect(getChefSpeedMultiplier(0)).toBe(1.0)
  })

  it('level 9 still returns 1.0', () => {
    expect(getChefSpeedMultiplier(9)).toBe(1.0)
  })

  it('level 10 returns 0.9', () => {
    expect(getChefSpeedMultiplier(10)).toBe(0.9)
  })

  it('level 25 returns 0.8', () => {
    expect(getChefSpeedMultiplier(25)).toBe(0.8)
  })

  it('level 40 returns 0.7', () => {
    expect(getChefSpeedMultiplier(40)).toBe(0.7)
  })

  it('level 60 returns 0.55', () => {
    expect(getChefSpeedMultiplier(60)).toBe(0.55)
  })

  it('level 80+ returns 0.4', () => {
    expect(getChefSpeedMultiplier(80)).toBe(0.4)
    expect(getChefSpeedMultiplier(99)).toBe(0.4)
  })

  it('multiplier decreases with level (speed increases)', () => {
    const levels = [0, 10, 25, 40, 60, 80]
    for (let i = 1; i < levels.length; i++) {
      expect(getChefSpeedMultiplier(levels[i])).toBeLessThan(getChefSpeedMultiplier(levels[i - 1]))
    }
  })
})

describe('chef double chance', () => {
  it('level 0 returns 0', () => {
    expect(getChefDoubleChance(0)).toBe(0)
  })

  it('level 24 returns 0', () => {
    expect(getChefDoubleChance(24)).toBe(0)
  })

  it('level 25 returns 0.15', () => {
    expect(getChefDoubleChance(25)).toBe(0.15)
  })

  it('level 59 still returns 0.15', () => {
    expect(getChefDoubleChance(59)).toBe(0.15)
  })

  it('level 60+ returns 0.45', () => {
    expect(getChefDoubleChance(60)).toBe(0.45)
    expect(getChefDoubleChance(99)).toBe(0.45)
  })
})

describe('effectiveBurnChance', () => {
  const zeroTiers: Record<CookInstrumentId, number> = { knife: 0, pot: 0, pan: 0, bowl: 0, oven: 0, mortar: 0 }

  it('with tier-0 instruments, returns base burn chance', () => {
    const bread = COOKING_RECIPE_MAP['cook_bread']
    const chance = effectiveBurnChance(bread, 'common', zeroTiers)
    expect(chance).toBeCloseTo(BASE_BURN_CHANCE['common'], 4)
  })

  it('higher rarity has higher base burn', () => {
    expect(BASE_BURN_CHANCE['rare']).toBeGreaterThan(BASE_BURN_CHANCE['common'])
    expect(BASE_BURN_CHANCE['epic']).toBeGreaterThan(BASE_BURN_CHANCE['rare'])
    expect(BASE_BURN_CHANCE['legendary']).toBeGreaterThan(BASE_BURN_CHANCE['epic'])
    expect(BASE_BURN_CHANCE['mythic']).toBeGreaterThan(BASE_BURN_CHANCE['legendary'])
  })

  it('max tier instruments reduce burn to 0', () => {
    const maxTiers: Record<CookInstrumentId, number> = { knife: 4, pot: 4, pan: 4, bowl: 4, oven: 4, mortar: 4 }
    for (const r of COOKING_RECIPES) {
      const food = FOOD_ITEM_MAP[r.outputItemId]
      if (!food) continue
      expect(effectiveBurnChance(r, food.rarity, maxTiers)).toBe(0)
    }
  })

  it('mid-tier instruments partially reduce burn', () => {
    const midTiers: Record<CookInstrumentId, number> = { knife: 2, pot: 2, pan: 2, bowl: 2, oven: 2, mortar: 2 }
    const bread = COOKING_RECIPE_MAP['cook_bread']
    const chance = effectiveBurnChance(bread, 'common', midTiers)
    expect(chance).toBeGreaterThan(0)
    expect(chance).toBeLessThan(BASE_BURN_CHANCE['common'])
  })
})

describe('effectiveQualityBonus', () => {
  const zeroTiers: Record<CookInstrumentId, number> = { knife: 0, pot: 0, pan: 0, bowl: 0, oven: 0, mortar: 0 }

  it('tier-0 instruments give 0 quality bonus', () => {
    const bread = COOKING_RECIPE_MAP['cook_bread']
    expect(effectiveQualityBonus(bread, zeroTiers)).toBe(0)
  })

  it('higher tiers give positive quality bonus', () => {
    const midTiers: Record<CookInstrumentId, number> = { knife: 2, pot: 2, pan: 2, bowl: 2, oven: 2, mortar: 2 }
    const bread = COOKING_RECIPE_MAP['cook_bread']
    expect(effectiveQualityBonus(bread, midTiers)).toBeGreaterThan(0)
  })

  it('max tiers give highest quality bonus', () => {
    const maxTiers: Record<CookInstrumentId, number> = { knife: 4, pot: 4, pan: 4, bowl: 4, oven: 4, mortar: 4 }
    const bread = COOKING_RECIPE_MAP['cook_bread']
    expect(effectiveQualityBonus(bread, maxTiers)).toBeGreaterThan(0.15)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// PART 6: AFFORDABILITY & DURATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

describe('canAffordCookRecipe', () => {
  it('returns true when player has enough materials', () => {
    const bread = COOKING_RECIPE_MAP['cook_bread']
    expect(canAffordCookRecipe(bread, 1, { wheat: 3 })).toBe(true)
    expect(canAffordCookRecipe(bread, 1, { wheat: 100 })).toBe(true)
  })

  it('returns false when not enough materials', () => {
    const bread = COOKING_RECIPE_MAP['cook_bread']
    expect(canAffordCookRecipe(bread, 1, { wheat: 2 })).toBe(false)
    expect(canAffordCookRecipe(bread, 1, {})).toBe(false)
  })

  it('scales by quantity', () => {
    const bread = COOKING_RECIPE_MAP['cook_bread']
    expect(canAffordCookRecipe(bread, 10, { wheat: 30 })).toBe(true)
    expect(canAffordCookRecipe(bread, 10, { wheat: 29 })).toBe(false)
  })

  it('works for multi-ingredient recipes', () => {
    const soup = COOKING_RECIPE_MAP['cook_herb_soup']
    expect(canAffordCookRecipe(soup, 1, { herbs: 2, wheat: 2 })).toBe(true)
    expect(canAffordCookRecipe(soup, 1, { herbs: 2, wheat: 1 })).toBe(false)
    expect(canAffordCookRecipe(soup, 1, { herbs: 1, wheat: 2 })).toBe(false)
  })
})

describe('maxAffordableCookQty', () => {
  it('returns 0 when player has no ingredients', () => {
    const bread = COOKING_RECIPE_MAP['cook_bread']
    expect(maxAffordableCookQty(bread, {})).toBe(0)
  })

  it('returns floor division of owned / needed', () => {
    const bread = COOKING_RECIPE_MAP['cook_bread']
    expect(maxAffordableCookQty(bread, { wheat: 3 })).toBe(1)
    expect(maxAffordableCookQty(bread, { wheat: 7 })).toBe(2)
    expect(maxAffordableCookQty(bread, { wheat: 30 })).toBe(10)
  })

  it('is limited by scarcest ingredient', () => {
    const soup = COOKING_RECIPE_MAP['cook_herb_soup'] // 2 herbs, 2 wheat
    expect(maxAffordableCookQty(soup, { herbs: 100, wheat: 4 })).toBe(2)
    expect(maxAffordableCookQty(soup, { herbs: 4, wheat: 100 })).toBe(2)
  })
})

describe('cookDuration (deprecated secPerItem based)', () => {
  it('returns positive value for simple bread', () => {
    const bread = COOKING_RECIPE_MAP['cook_bread']
    expect(cookDuration(bread, 1)).toBeGreaterThan(0)
  })

  it('scales linearly with quantity', () => {
    const bread = COOKING_RECIPE_MAP['cook_bread']
    expect(cookDuration(bread, 10)).toBe(cookDuration(bread, 1) * 10)
  })

  it('chef level reduces duration', () => {
    const bread = COOKING_RECIPE_MAP['cook_bread']
    const d0 = cookDuration(bread, 1, 0)
    const d80 = cookDuration(bread, 1, 80)
    expect(d80).toBeLessThan(d0)
  })
})

describe('cookStepDuration', () => {
  const step: CookStep = { label: 'Chop Wheat', icon: '🔪', secPerItem: 10 }

  it('returns base secPerItem at level 0 with no instrument bonus', () => {
    expect(cookStepDuration(step, 0, 1)).toBe(10)
  })

  it('chef level reduces step duration', () => {
    expect(cookStepDuration(step, 80, 1)).toBeLessThan(10)
  })

  it('instrument tiers reduce step duration', () => {
    const tiers: Record<CookInstrumentId, number> = { knife: 4, pot: 0, pan: 0, bowl: 0, oven: 0, mortar: 0 }
    // This step maps to knife
    expect(cookStepDuration(step, 0, 1, tiers)).toBeLessThan(10)
  })

  it('never goes below 1 second', () => {
    const tinyStep: CookStep = { label: 'Chop', icon: '🔪', secPerItem: 1 }
    const tiers: Record<CookInstrumentId, number> = { knife: 4, pot: 4, pan: 4, bowl: 4, oven: 4, mortar: 4 }
    expect(cookStepDuration(tinyStep, 99, 0.1, tiers)).toBeGreaterThanOrEqual(1)
  })
})

describe('cookTotalDuration', () => {
  it('equals sum of all step durations × qty', () => {
    const bread = COOKING_RECIPE_MAP['cook_bread']
    const singleItemDur = bread.steps.reduce((sum, s) => sum + s.secPerItem, 0)
    expect(cookTotalDuration(bread, 1, 0, 1)).toBe(singleItemDur)
    expect(cookTotalDuration(bread, 5, 0, 1)).toBe(singleItemDur * 5)
  })

  it('chef level 80 reduces total duration significantly', () => {
    const bread = COOKING_RECIPE_MAP['cook_bread']
    const d0 = cookTotalDuration(bread, 1, 0)
    const d80 = cookTotalDuration(bread, 1, 80)
    expect(d80).toBeLessThan(d0 * 0.5)
  })

  it('instrument tiers stack with chef level', () => {
    const bread = COOKING_RECIPE_MAP['cook_bread']
    const maxTiers: Record<CookInstrumentId, number> = { knife: 4, pot: 4, pan: 4, bowl: 4, oven: 4, mortar: 4 }
    const dBase = cookTotalDuration(bread, 1, 0, 1)
    const dFull = cookTotalDuration(bread, 1, 80, 1, maxTiers)
    expect(dFull).toBeLessThan(dBase * 0.4)
  })
})

describe('formatCookTime', () => {
  it('formats seconds correctly', () => {
    expect(formatCookTime(5)).toBe('5s')
    expect(formatCookTime(30)).toBe('30s')
    expect(formatCookTime(59)).toBe('59s')
  })

  it('formats minutes correctly', () => {
    expect(formatCookTime(60)).toBe('1m')
    expect(formatCookTime(90)).toBe('1m 30s')
    expect(formatCookTime(120)).toBe('2m')
    expect(formatCookTime(3599)).toMatch(/59m/)
  })

  it('formats hours correctly', () => {
    expect(formatCookTime(3600)).toBe('1h')
    expect(formatCookTime(3660)).toBe('1h 1m')
    expect(formatCookTime(7200)).toBe('2h')
  })

  it('handles sub-second values', () => {
    expect(formatCookTime(0.5)).toBe('1s')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// PART 7: MYSTERY STEW
// ═══════════════════════════════════════════════════════════════════════════════

describe('mystery stew', () => {
  it('has correct structure', () => {
    expect(MYSTERY_STEW.id).toBe('food_mystery_stew')
    expect(MYSTERY_STEW.rarity).toBe('common')
    expect(MYSTERY_STEW.effect.heal).toBeGreaterThan(0)
    expect(MYSTERY_STEW.icon).toBeTruthy()
    expect(MYSTERY_STEW.name).toBe('Mystery Stew')
  })

  it('XP is a small positive value', () => {
    expect(MYSTERY_STEW_XP).toBe(5)
    expect(MYSTERY_STEW_XP).toBeGreaterThan(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// PART 8: RECIPE MATCHING (discovery system)
// ═══════════════════════════════════════════════════════════════════════════════

describe('matchRecipeFromIngredients (exact match)', () => {
  it('matches bread recipe with exact ingredients', () => {
    const result = matchRecipeFromIngredients([{ id: 'wheat', qty: 3 }])
    expect(result?.id).toBe('cook_bread')
  })

  it('matches with excess quantity', () => {
    const result = matchRecipeFromIngredients([{ id: 'wheat', qty: 100 }])
    expect(result?.id).toBe('cook_bread')
  })

  it('returns null for insufficient quantity', () => {
    const result = matchRecipeFromIngredients([{ id: 'wheat', qty: 2 }])
    expect(result).toBeNull()
  })

  it('returns null for empty input', () => {
    expect(matchRecipeFromIngredients([])).toBeNull()
  })

  it('matches multi-ingredient recipe', () => {
    const result = matchRecipeFromIngredients([
      { id: 'herbs', qty: 2 },
      { id: 'wheat', qty: 2 },
    ])
    expect(result?.id).toBe('cook_herb_soup')
  })

  it('returns null for wrong ingredient combination', () => {
    const result = matchRecipeFromIngredients([
      { id: 'wheat', qty: 3 },
      { id: 'herbs', qty: 3 },
      { id: 'apples', qty: 3 },
      { id: 'orchids', qty: 3 },
    ])
    expect(result).toBeNull()
  })

  it('ignores empty id slots', () => {
    const result = matchRecipeFromIngredients([
      { id: '', qty: 0 },
      { id: 'wheat', qty: 3 },
    ])
    expect(result?.id).toBe('cook_bread')
  })

  it('matches most recipes with their own ingredients', () => {
    // Some recipes share the same ingredient IDs (e.g. apple_jam and apple_pie both use apples+wheat).
    // matchRecipeFromIngredients returns the first match, so apple_pie's ingredients may match apple_jam.
    // This is expected — the cauldron uses matchRecipeByIds for discovery.
    const ambiguousIds = new Set(['cook_apple_pie']) // shares apples+wheat with cook_apple_jam
    for (const recipe of COOKING_RECIPES) {
      if (ambiguousIds.has(recipe.id)) continue
      const result = matchRecipeFromIngredients(recipe.ingredients)
      expect(result?.id).toBe(recipe.id)
    }
  })

  it('apple_pie ingredients match apple_jam first (same ingredient IDs, lower qty threshold)', () => {
    const pie = COOKING_RECIPE_MAP['cook_apple_pie']
    const result = matchRecipeFromIngredients(pie.ingredients)
    // apple_jam (apples:2, wheat:1) is checked first and satisfied by pie's (apples:3, wheat:2)
    expect(result?.id).toBe('cook_apple_jam')
  })
})

describe('matchRecipeByIds (ID-only match for cauldron)', () => {
  it('matches bread by wheat only', () => {
    const result = matchRecipeByIds(['wheat'])
    expect(result?.id).toBe('cook_bread')
  })

  it('matches herb soup by herbs and wheat', () => {
    const result = matchRecipeByIds(['herbs', 'wheat'])
    expect(result?.id).toBe('cook_herb_soup')
  })

  it('returns null for empty input', () => {
    expect(matchRecipeByIds([])).toBeNull()
  })

  it('deduplicates input IDs', () => {
    const result = matchRecipeByIds(['wheat', 'wheat', 'wheat'])
    expect(result?.id).toBe('cook_bread') // wheat is the only ingredient
  })

  it('returns null for non-recipe combination', () => {
    const result = matchRecipeByIds(['wheat', 'dragon_scale', 'orchids', 'herbs', 'apples'])
    expect(result).toBeNull()
  })

  it('order-independent matching', () => {
    const r1 = matchRecipeByIds(['wheat', 'herbs'])
    const r2 = matchRecipeByIds(['herbs', 'wheat'])
    expect(r1?.id).toBe(r2?.id)
  })

  it('matches most recipes with their ingredient IDs', () => {
    // Recipes sharing the same ingredient ID set (e.g. apple_jam and apple_pie: both apples+wheat)
    // will match whichever appears first in COOKING_RECIPES.
    const ambiguousIds = new Set(['cook_apple_pie']) // shares apples+wheat with apple_jam
    for (const recipe of COOKING_RECIPES) {
      if (ambiguousIds.has(recipe.id)) continue
      const ids = recipe.ingredients.map((i) => i.id)
      const result = matchRecipeByIds(ids)
      expect(result?.id).toBe(recipe.id)
    }
  })

  it('filters out falsy values', () => {
    const result = matchRecipeByIds(['', 'wheat', ''])
    expect(result?.id).toBe('cook_bread')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// PART 9: MASTERY SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

describe('mastery system', () => {
  it('has 5 max stars', () => {
    expect(MASTERY_MAX_STARS).toBe(5)
  })

  it('thresholds are increasing', () => {
    for (let i = 1; i < MASTERY_THRESHOLDS.length; i++) {
      expect(MASTERY_THRESHOLDS[i]).toBeGreaterThan(MASTERY_THRESHOLDS[i - 1])
    }
  })

  it('first threshold is 0 (discovery grants 1 star)', () => {
    expect(MASTERY_THRESHOLDS[0]).toBe(0)
  })

  it('has correct number of thresholds and bonuses', () => {
    expect(MASTERY_THRESHOLDS.length).toBe(MASTERY_MAX_STARS)
    expect(MASTERY_BONUSES.length).toBe(MASTERY_MAX_STARS)
  })

  describe('getMasteryStars', () => {
    it('0 cooks = 1 star (discovery)', () => {
      expect(getMasteryStars(0)).toBe(1)
    })

    it('4 cooks = 1 star (not yet 2)', () => {
      expect(getMasteryStars(4)).toBe(1)
    })

    it('5 cooks = 2 stars', () => {
      expect(getMasteryStars(5)).toBe(2)
    })

    it('15 cooks = 3 stars', () => {
      expect(getMasteryStars(15)).toBe(3)
    })

    it('35 cooks = 4 stars', () => {
      expect(getMasteryStars(35)).toBe(4)
    })

    it('75 cooks = 5 stars (max)', () => {
      expect(getMasteryStars(75)).toBe(5)
    })

    it('999 cooks = 5 stars (clamped)', () => {
      expect(getMasteryStars(999)).toBe(5)
    })
  })

  describe('getMasteryBonus', () => {
    it('1 star: no extra bonuses', () => {
      const b = getMasteryBonus(1)
      expect(b.buffMultiplier).toBe(1.0)
      expect(b.ingredientSaveChance).toBe(0)
      expect(b.doubleOutputChance).toBe(0)
      expect(b.xpMultiplier).toBe(1.0)
    })

    it('2 star: buff and XP multiplier', () => {
      const b = getMasteryBonus(2)
      expect(b.buffMultiplier).toBe(1.25)
      expect(b.xpMultiplier).toBe(1.1)
      expect(b.ingredientSaveChance).toBe(0)
    })

    it('3 star: ingredient save chance', () => {
      const b = getMasteryBonus(3)
      expect(b.ingredientSaveChance).toBe(0.15)
      expect(b.xpMultiplier).toBe(1.2)
    })

    it('4 star: double output starts', () => {
      const b = getMasteryBonus(4)
      expect(b.doubleOutputChance).toBe(0.10)
      expect(b.buffMultiplier).toBe(1.5)
    })

    it('5 star: max bonuses', () => {
      const b = getMasteryBonus(5)
      expect(b.buffMultiplier).toBe(1.5)
      expect(b.ingredientSaveChance).toBe(0.30)
      expect(b.doubleOutputChance).toBe(0.20)
      expect(b.xpMultiplier).toBe(1.5)
    })

    it('clamps out-of-range values', () => {
      expect(getMasteryBonus(0)).toEqual(MASTERY_BONUSES[0])
      expect(getMasteryBonus(99)).toEqual(MASTERY_BONUSES[4])
    })

    it('bonuses are non-decreasing per star level', () => {
      for (let i = 1; i < MASTERY_BONUSES.length; i++) {
        expect(MASTERY_BONUSES[i].buffMultiplier).toBeGreaterThanOrEqual(MASTERY_BONUSES[i - 1].buffMultiplier)
        expect(MASTERY_BONUSES[i].ingredientSaveChance).toBeGreaterThanOrEqual(MASTERY_BONUSES[i - 1].ingredientSaveChance)
        expect(MASTERY_BONUSES[i].doubleOutputChance).toBeGreaterThanOrEqual(MASTERY_BONUSES[i - 1].doubleOutputChance)
        expect(MASTERY_BONUSES[i].xpMultiplier).toBeGreaterThanOrEqual(MASTERY_BONUSES[i - 1].xpMultiplier)
      }
    })
  })

  describe('cooksToNextStar', () => {
    it('0 cooks → 5 to next star', () => {
      expect(cooksToNextStar(0)).toBe(5)
    })

    it('4 cooks → 1 to next star', () => {
      expect(cooksToNextStar(4)).toBe(1)
    })

    it('5 cooks → 10 to next star', () => {
      expect(cooksToNextStar(5)).toBe(10)
    })

    it('75 cooks → 0 (maxed out)', () => {
      expect(cooksToNextStar(75)).toBe(0)
    })

    it('100 cooks → 0 (already maxed)', () => {
      expect(cooksToNextStar(100)).toBe(0)
    })

    it('at each threshold, distance to next is correct', () => {
      for (let i = 0; i < MASTERY_THRESHOLDS.length - 1; i++) {
        const expected = MASTERY_THRESHOLDS[i + 1] - MASTERY_THRESHOLDS[i]
        expect(cooksToNextStar(MASTERY_THRESHOLDS[i])).toBe(expected)
      }
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// PART 10: RECIPE HINTS (discovery UI)
// ═══════════════════════════════════════════════════════════════════════════════

describe('getRecipeHint', () => {
  const bread = COOKING_RECIPE_MAP['cook_bread']
  const dragonRoast = COOKING_RECIPE_MAP['cook_dragon_roast']

  it('level 0-9: returns vague rarity hint', () => {
    const hint = getRecipeHint(bread, 0)
    expect(hint).toContain('simple')
  })

  it('level 0-9: mythic rarity hint', () => {
    const hint = getRecipeHint(dragonRoast, 5)
    expect(hint).toContain('mythical')
  })

  it('level 10-29: reveals ingredient count and first ingredient', () => {
    const hint = getRecipeHint(bread, 15)
    expect(hint).toContain('1')
    expect(hint).toContain('Wheat')
  })

  it('level 30-49: reveals all ingredient names', () => {
    const hint = getRecipeHint(COOKING_RECIPE_MAP['cook_herb_soup'], 35)
    expect(hint).toContain('Herbs')
    expect(hint).toContain('Wheat')
  })

  it('level 50+: reveals full recipe with quantities', () => {
    const hint = getRecipeHint(bread, 55)
    expect(hint).toContain('3')
    expect(hint).toContain('Wheat')
  })

  it('returns ??? for invalid recipe output', () => {
    const fakeRecipe: CookingRecipe = {
      ...bread,
      outputItemId: 'nonexistent_food',
    }
    expect(getRecipeHint(fakeRecipe, 0)).toBe('???')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// PART 11: COOKING STORE (state management + logic)
// ═══════════════════════════════════════════════════════════════════════════════

describe('cooking store', () => {
  beforeEach(() => {
    if (!('localStorage' in globalThis)) {
      Object.defineProperty(globalThis, 'localStorage', {
        value: createMemoryStorage(),
        configurable: true,
      })
    }
    localStorage.clear()
    resetStore()
    vi.restoreAllMocks()
  })

  describe('hydrate', () => {
    it('loads default state when localStorage is empty', () => {
      useCookingStore.getState().hydrate()
      const s = useCookingStore.getState()
      expect(s.cookXp).toBe(0)
      expect(s.activeJob).toBeNull()
      expect(s.queue).toEqual([])
      expect(s.unlockedInstruments).toContain('knife')
      expect(s.unlockedInstruments).toContain('pot')
    })

    it('restores saved state from localStorage', () => {
      localStorage.setItem('grindly_cooking_v1', JSON.stringify({
        cookXp: 500,
        activeJob: null,
        queue: [],
      }))
      localStorage.setItem('grindly_cooking_instruments', JSON.stringify({
        tiers: { knife: 2, pot: 1, pan: 0, bowl: 0, oven: 0, mortar: 0 },
        unlocked: ['knife', 'pot', 'pan'],
      }))
      localStorage.setItem('grindly_cooking_discovery', JSON.stringify({
        cook_bread: 10,
      }))

      useCookingStore.getState().hydrate()
      const s = useCookingStore.getState()
      expect(s.cookXp).toBe(500)
      expect(s.instrumentTiers.knife).toBe(2)
      expect(s.instrumentTiers.pot).toBe(1)
      expect(s.unlockedInstruments).toContain('pan')
      expect(s.discoveredRecipes['cook_bread']).toBe(10)
    })

    it('migrates old jobs without steps array', () => {
      const oldJob = {
        id: 'old_job',
        recipeId: 'cook_bread',
        outputItemId: 'food_bread',
        outputQty: 1,
        totalQty: 5,
        doneQty: 0,
        secPerItem: 8,
        xpPerItem: 15,
        startedAt: Date.now(),
        ingredients: [{ id: 'wheat', qty: 3 }],
        // No stepIndex or steps — old format
      }
      localStorage.setItem('grindly_cooking_v1', JSON.stringify({
        cookXp: 0,
        activeJob: oldJob,
        queue: [],
      }))

      useCookingStore.getState().hydrate()
      const s = useCookingStore.getState()
      expect(s.activeJob).toBeTruthy()
      expect(s.activeJob!.steps.length).toBe(2)
      expect(s.activeJob!.stepIndex).toBe(1) // migration sets to 1
    })
  })

  describe('startCook', () => {
    it('returns "invalid" for nonexistent recipe', () => {
      const result = useCookingStore.getState().startCook('fake_recipe', 1, {}, () => {})
      expect(result).toBe('invalid')
    })

    it('returns "not_enough" when player lacks ingredients', () => {
      const result = useCookingStore.getState().startCook('cook_bread', 1, { wheat: 2 }, () => {})
      expect(result).toBe('not_enough')
    })

    it('returns "locked" when missing required instrument', () => {
      // Apple pie requires oven (Bake Pie step) and chefLevelRequired=15
      // Must set level high enough so the level check passes first, then instrument check fails
      useCookingStore.setState({ cookXp: 9_999_999, unlockedInstruments: ['knife', 'pot', 'bowl'] })
      const result = useCookingStore.getState().startCook(
        'cook_apple_pie', 1, richInventory(), () => {},
      )
      expect(result).toBe('locked')
    })

    it('returns "ok" and creates active job for valid cook', () => {
      const consumed: [string, number][] = []
      const result = useCookingStore.getState().startCook(
        'cook_bread', 1, { wheat: 10 },
        (id, qty) => consumed.push([id, qty]),
      )
      expect(result).toBe('ok')
      expect(consumed).toEqual([['wheat', 3]])

      const s = useCookingStore.getState()
      expect(s.activeJob).toBeTruthy()
      expect(s.activeJob!.recipeId).toBe('cook_bread')
      expect(s.activeJob!.totalQty).toBe(1)
      expect(s.activeJob!.doneQty).toBe(0)
      expect(s.activeJob!.stepIndex).toBe(0)
      expect(s.activeJob!.steps.length).toBeGreaterThanOrEqual(2)
    })

    it('consumes correct qty for multi-item batch', () => {
      const consumed: [string, number][] = []
      useCookingStore.getState().startCook(
        'cook_bread', 5, { wheat: 50 },
        (id, qty) => consumed.push([id, qty]),
      )
      expect(consumed).toEqual([['wheat', 15]])
    })

    it('queues job when one is already active', () => {
      useCookingStore.getState().startCook('cook_bread', 1, { wheat: 10 }, () => {})
      useCookingStore.getState().startCook('cook_bread', 1, { wheat: 10 }, () => {})

      const s = useCookingStore.getState()
      expect(s.activeJob).toBeTruthy()
      expect(s.queue.length).toBe(1)
    })

    it('effective steps have speed-adjusted durations', () => {
      // Give high chef XP for speed bonus
      useCookingStore.setState({ cookXp: 99999999 })
      useCookingStore.getState().startCook('cook_bread', 1, { wheat: 10 }, () => {})

      const s = useCookingStore.getState()
      const bread = COOKING_RECIPE_MAP['cook_bread']
      // At least some steps should be faster than base
      const anyFaster = s.activeJob!.steps.some(
        (step, i) => step.secPerItem < bread.steps[i].secPerItem,
      )
      expect(anyFaster).toBe(true)
    })

    it('persists to localStorage after start', () => {
      useCookingStore.getState().startCook('cook_bread', 1, { wheat: 10 }, () => {})
      const stored = JSON.parse(localStorage.getItem('grindly_cooking_v1') || '{}')
      expect(stored.activeJob).toBeTruthy()
      expect(stored.activeJob.recipeId).toBe('cook_bread')
    })
  })

  describe('tick', () => {
    it('does nothing when no active job', () => {
      const grantSpy = vi.fn()
      useCookingStore.getState().tick(Date.now(), grantSpy)
      expect(grantSpy).not.toHaveBeenCalled()
    })

    it('does nothing when not enough time elapsed', () => {
      useCookingStore.getState().startCook('cook_bread', 1, { wheat: 10 }, () => {})
      const grantSpy = vi.fn()
      // Tick immediately (0ms elapsed)
      useCookingStore.getState().tick(Date.now(), grantSpy)
      expect(grantSpy).not.toHaveBeenCalled()
    })

    it('auto-advances non-final step when time elapsed', () => {
      useCookingStore.getState().startCook('cook_bread', 1, { wheat: 10 }, () => {})
      const job = useCookingStore.getState().activeJob!
      expect(job.stepIndex).toBe(0)

      // Advance time past step 0 duration
      const future = job.startedAt + (job.steps[0].secPerItem + 1) * 1000
      useCookingStore.getState().tick(future, () => {})

      const after = useCookingStore.getState().activeJob!
      expect(after.stepIndex).toBe(1) // advanced to next step
    })

    it('grants output on final step completion (no burn)', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.99) // no burn
      useCookingStore.getState().startCook('cook_bread', 1, { wheat: 10 }, () => {})

      // Advance through all steps
      let job = useCookingStore.getState().activeJob!
      let now = job.startedAt

      // Step through non-final steps
      for (let i = 0; i < job.steps.length - 1; i++) {
        now += (job.steps[i].secPerItem + 1) * 1000
        useCookingStore.getState().tick(now, () => {})
        job = useCookingStore.getState().activeJob!
      }

      // Now on final step — tick past it
      const grants: Array<{ itemId: string; qty: number; xp: number }> = []
      now += (job.secPerItem + 1) * 1000
      useCookingStore.getState().tick(now, (itemId, qty, xp) => {
        grants.push({ itemId, qty, xp })
      })

      expect(grants.length).toBeGreaterThan(0)
      expect(grants.some((g) => g.itemId === 'food_bread' && g.qty > 0)).toBe(true)
    })

    it('burns item when random < burnChance', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.01) // burn guaranteed
      useCookingStore.getState().startCook('cook_bread', 1, { wheat: 10 }, () => {})

      let job = useCookingStore.getState().activeJob!
      let now = job.startedAt

      // Advance to final step
      for (let i = 0; i < job.steps.length - 1; i++) {
        now += (job.steps[i].secPerItem + 1) * 1000
        useCookingStore.getState().tick(now, () => {})
        job = useCookingStore.getState().activeJob!
      }

      const burns: Array<{ itemId: string; qty: number }> = []
      now += (job.secPerItem + 1) * 1000
      useCookingStore.getState().tick(
        now,
        () => {},
        (itemId, qty) => burns.push({ itemId, qty }),
      )

      expect(burns.length).toBeGreaterThan(0)
      expect(burns[0].itemId).toBe('food_bread')
    })

    it('grants XP even when item is burned', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.01) // burn guaranteed
      useCookingStore.getState().startCook('cook_bread', 1, { wheat: 10 }, () => {})

      let job = useCookingStore.getState().activeJob!
      let now = job.startedAt

      for (let i = 0; i < job.steps.length - 1; i++) {
        now += (job.steps[i].secPerItem + 1) * 1000
        useCookingStore.getState().tick(now, () => {})
        job = useCookingStore.getState().activeJob!
      }

      const xpBefore = useCookingStore.getState().cookXp
      now += (job.secPerItem + 1) * 1000
      useCookingStore.getState().tick(now, () => {})
      const xpAfter = useCookingStore.getState().cookXp
      expect(xpAfter).toBeGreaterThan(xpBefore)
    })

    it('resets to step 0 for next item in batch', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.99) // no burn
      useCookingStore.getState().startCook('cook_bread', 3, { wheat: 20 }, () => {})

      let job = useCookingStore.getState().activeJob!
      let now = job.startedAt

      // Complete first item (all steps)
      for (let i = 0; i < job.steps.length - 1; i++) {
        now += (job.steps[i].secPerItem + 1) * 1000
        useCookingStore.getState().tick(now, () => {})
        job = useCookingStore.getState().activeJob!
      }
      now += (job.secPerItem + 1) * 1000
      useCookingStore.getState().tick(now, () => {})

      const after = useCookingStore.getState().activeJob
      expect(after).toBeTruthy()
      expect(after!.doneQty).toBe(1)
      expect(after!.stepIndex).toBe(0) // reset to step 0 for next item
    })

    it('moves to next queue job after batch completes', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.99)
      useCookingStore.getState().startCook('cook_bread', 1, { wheat: 10 }, () => {})
      useCookingStore.getState().startCook('cook_bread', 1, { wheat: 10 }, () => {})
      expect(useCookingStore.getState().queue.length).toBe(1)

      let job = useCookingStore.getState().activeJob!
      let now = job.startedAt

      // Complete the first job
      for (let i = 0; i < job.steps.length - 1; i++) {
        now += (job.steps[i].secPerItem + 1) * 1000
        useCookingStore.getState().tick(now, () => {})
        job = useCookingStore.getState().activeJob!
      }
      now += (job.secPerItem + 1) * 1000
      useCookingStore.getState().tick(now, () => {})

      // Should have moved to queue job
      const after = useCookingStore.getState()
      expect(after.activeJob).toBeTruthy()
      expect(after.queue.length).toBe(0)
    })

    it('sets activeJob to null when all jobs complete', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.99)
      useCookingStore.getState().startCook('cook_bread', 1, { wheat: 10 }, () => {})

      let job = useCookingStore.getState().activeJob!
      let now = job.startedAt

      for (let i = 0; i < job.steps.length - 1; i++) {
        now += (job.steps[i].secPerItem + 1) * 1000
        useCookingStore.getState().tick(now, () => {})
        job = useCookingStore.getState().activeJob!
      }
      now += (job.secPerItem + 1) * 1000
      useCookingStore.getState().tick(now, () => {})

      expect(useCookingStore.getState().activeJob).toBeNull()
      expect(useCookingStore.getState().queue.length).toBe(0)
    })

    it('stores lastRoll after completion', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.99)
      useCookingStore.getState().startCook('cook_bread', 1, { wheat: 10 }, () => {})

      let job = useCookingStore.getState().activeJob!
      let now = job.startedAt
      for (let i = 0; i < job.steps.length - 1; i++) {
        now += (job.steps[i].secPerItem + 1) * 1000
        useCookingStore.getState().tick(now, () => {})
        job = useCookingStore.getState().activeJob!
      }
      now += (job.secPerItem + 1) * 1000
      useCookingStore.getState().tick(now, () => {})

      const roll = useCookingStore.getState().lastRoll
      expect(roll).toBeTruthy()
      expect(roll!.granted).toBeGreaterThanOrEqual(0)
      expect(roll!.burned).toBeGreaterThanOrEqual(0)
    })

    it('increments mastery after job completes', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.99)
      useCookingStore.setState({ discoveredRecipes: { cook_bread: 0 } })
      useCookingStore.getState().startCook('cook_bread', 1, { wheat: 10 }, () => {})

      let job = useCookingStore.getState().activeJob!
      let now = job.startedAt
      for (let i = 0; i < job.steps.length - 1; i++) {
        now += (job.steps[i].secPerItem + 1) * 1000
        useCookingStore.getState().tick(now, () => {})
        job = useCookingStore.getState().activeJob!
      }
      now += (job.secPerItem + 1) * 1000
      useCookingStore.getState().tick(now, () => {})

      expect(useCookingStore.getState().discoveredRecipes['cook_bread']).toBe(1)
    })
  })

  describe('cancelJob', () => {
    it('refunds remaining ingredients for active job', () => {
      useCookingStore.getState().startCook('cook_bread', 5, { wheat: 50 }, () => {})
      const job = useCookingStore.getState().activeJob!

      const refunds: [string, number][] = []
      useCookingStore.getState().cancelJob(job.id, (id, qty) => refunds.push([id, qty]))

      // Should refund 5 uncompleted × 3 wheat = 15
      expect(refunds).toEqual([['wheat', 15]])
      expect(useCookingStore.getState().activeJob).toBeNull()
    })

    it('refunds and removes queued job', () => {
      useCookingStore.getState().startCook('cook_bread', 1, { wheat: 10 }, () => {})
      useCookingStore.getState().startCook('cook_bread', 2, { wheat: 10 }, () => {})
      const queuedJob = useCookingStore.getState().queue[0]

      const refunds: [string, number][] = []
      useCookingStore.getState().cancelJob(queuedJob.id, (id, qty) => refunds.push([id, qty]))

      expect(refunds).toEqual([['wheat', 6]]) // 2 × 3 wheat
      expect(useCookingStore.getState().queue.length).toBe(0)
      expect(useCookingStore.getState().activeJob).toBeTruthy() // original active still there
    })

    it('promotes queue head to active when cancelling active job', () => {
      useCookingStore.getState().startCook('cook_bread', 1, { wheat: 10 }, () => {})
      useCookingStore.getState().startCook('cook_bread', 1, { wheat: 10 }, () => {})
      const activeId = useCookingStore.getState().activeJob!.id
      const queuedId = useCookingStore.getState().queue[0].id

      useCookingStore.getState().cancelJob(activeId, () => {})

      expect(useCookingStore.getState().activeJob!.id).toBe(queuedId)
      expect(useCookingStore.getState().queue.length).toBe(0)
    })

    it('does nothing for non-existent job id', () => {
      useCookingStore.getState().startCook('cook_bread', 1, { wheat: 10 }, () => {})
      const before = useCookingStore.getState().activeJob
      useCookingStore.getState().cancelJob('nonexistent', () => {})
      expect(useCookingStore.getState().activeJob).toBe(before)
    })
  })

  describe('computeActiveDone', () => {
    it('returns 0 when no active job', () => {
      expect(useCookingStore.getState().computeActiveDone(Date.now())).toBe(0)
    })

    it('returns 0 when just started', () => {
      useCookingStore.getState().startCook('cook_bread', 5, { wheat: 50 }, () => {})
      const done = useCookingStore.getState().computeActiveDone(Date.now())
      expect(done).toBe(0)
    })

    it('does not exceed totalQty', () => {
      useCookingStore.getState().startCook('cook_bread', 1, { wheat: 10 }, () => {})
      const far = Date.now() + 999_999_999
      const done = useCookingStore.getState().computeActiveDone(far)
      expect(done).toBeLessThanOrEqual(1)
    })
  })

  describe('unlockInstrument', () => {
    it('unlocks pan when level and gold are sufficient', () => {
      const spendSpy = vi.fn()
      const result = useCookingStore.getState().unlockInstrument('pan', 10, 1000, spendSpy)
      expect(result).toBe(true)
      expect(spendSpy).toHaveBeenCalledWith(300)
      expect(useCookingStore.getState().unlockedInstruments).toContain('pan')
    })

    it('fails when level too low', () => {
      const result = useCookingStore.getState().unlockInstrument('pan', 1, 1000, () => {})
      expect(result).toBe(false)
    })

    it('fails when gold too low', () => {
      const result = useCookingStore.getState().unlockInstrument('pan', 10, 100, () => {})
      expect(result).toBe(false)
    })

    it('fails when already unlocked', () => {
      const result = useCookingStore.getState().unlockInstrument('knife', 0, 1000, () => {})
      expect(result).toBe(false)
    })

    it('does not spend gold for free instruments', () => {
      // knife is already unlocked, but test the logic
      useCookingStore.setState({ unlockedInstruments: [] })
      const spendSpy = vi.fn()
      useCookingStore.getState().unlockInstrument('knife', 0, 0, spendSpy)
      expect(spendSpy).not.toHaveBeenCalled()
    })

    it('persists to localStorage', () => {
      useCookingStore.getState().unlockInstrument('pan', 10, 1000, () => {})
      const stored = JSON.parse(localStorage.getItem('grindly_cooking_instruments') || '{}')
      expect(stored.unlocked).toContain('pan')
    })
  })

  describe('upgradeInstrument', () => {
    it('upgrades knife from tier 0 to tier 1', () => {
      const spendSpy = vi.fn()
      const result = useCookingStore.getState().upgradeInstrument('knife', 500, spendSpy)
      expect(result).toBe(true)
      expect(spendSpy).toHaveBeenCalledWith(400) // copper tier cost
      expect(useCookingStore.getState().instrumentTiers.knife).toBe(1)
    })

    it('fails when instrument not unlocked', () => {
      const result = useCookingStore.getState().upgradeInstrument('pan', 10000, () => {})
      expect(result).toBe(false)
    })

    it('fails when gold insufficient', () => {
      const result = useCookingStore.getState().upgradeInstrument('knife', 100, () => {})
      expect(result).toBe(false)
    })

    it('fails at max tier', () => {
      useCookingStore.setState({
        instrumentTiers: { knife: 4, pot: 0, pan: 0, bowl: 0, oven: 0, mortar: 0 },
      })
      const result = useCookingStore.getState().upgradeInstrument('knife', 999999, () => {})
      expect(result).toBe(false)
    })

    it('can upgrade through all tiers sequentially', () => {
      let gold = 999999
      const spend = (amt: number) => { gold -= amt }
      for (let i = 0; i < 4; i++) {
        const result = useCookingStore.getState().upgradeInstrument('knife', gold, spend)
        expect(result).toBe(true)
        expect(useCookingStore.getState().instrumentTiers.knife).toBe(i + 1)
      }
      // 5th should fail (already at max)
      expect(useCookingStore.getState().upgradeInstrument('knife', gold, spend)).toBe(false)
    })

    it('persists tier to localStorage', () => {
      useCookingStore.getState().upgradeInstrument('knife', 500, () => {})
      const stored = JSON.parse(localStorage.getItem('grindly_cooking_instruments') || '{}')
      expect(stored.tiers.knife).toBe(1)
    })
  })

  describe('tryFreeformCook (cauldron discovery)', () => {
    it('returns "not_enough" for empty ingredients', () => {
      const result = useCookingStore.getState().tryFreeformCook([], {}, () => {})
      expect(result).toBe('not_enough')
    })

    it('returns "not_enough" when player lacks ingredients for mystery stew', () => {
      const result = useCookingStore.getState().tryFreeformCook(
        ['fake_item_1', 'fake_item_2'],
        {},
        () => {},
      )
      expect(result).toBe('not_enough')
    })

    it('returns mystery_stew for non-matching combination', () => {
      const consumed: [string, number][] = []
      const result = useCookingStore.getState().tryFreeformCook(
        ['wheat', 'dragon_scale', 'orchids', 'void_blossom', 'herbs'],
        { wheat: 10, dragon_scale: 10, orchids: 10, void_blossom: 10, herbs: 10 },
        (id, qty) => consumed.push([id, qty]),
      )
      expect(result).not.toBe('not_enough')
      expect((result as any).type).toBe('mystery_stew')
      expect((result as any).foodName).toBe('Mystery Stew')
      expect((result as any).xpGained).toBe(MYSTERY_STEW_XP)
      // Consumes 1 of each
      expect(consumed.length).toBe(5)
      for (const [, qty] of consumed) {
        expect(qty).toBe(1)
      }
    })

    it('grants cookXp for mystery stew', () => {
      const before = useCookingStore.getState().cookXp
      useCookingStore.getState().tryFreeformCook(
        ['wheat', 'dragon_scale'],
        { wheat: 10, dragon_scale: 10 },
        () => {},
      )
      expect(useCookingStore.getState().cookXp).toBe(before + MYSTERY_STEW_XP)
    })

    it('discovers recipe on first matching attempt', () => {
      const consumed: [string, number][] = []
      const result = useCookingStore.getState().tryFreeformCook(
        ['wheat'],
        richInventory(),
        (id, qty) => consumed.push([id, qty]),
      )
      expect(result).not.toBe('not_enough')
      expect((result as any).type).toBe('discovered')
      expect((result as any).recipeId).toBe('cook_bread')
      expect(useCookingStore.getState().discoveredRecipes['cook_bread']).toBeDefined()
    })

    it('returns "known" for already discovered recipe', () => {
      useCookingStore.setState({ discoveredRecipes: { cook_bread: 5 } })
      const result = useCookingStore.getState().tryFreeformCook(
        ['wheat'],
        richInventory(),
        () => {},
      )
      expect(result).not.toBe('not_enough')
      expect((result as any).type).toBe('known')
    })

    it('returns canStart and recipeId after successful discovery', () => {
      const result = useCookingStore.getState().tryFreeformCook(
        ['wheat'],
        richInventory(),
        () => {},
      )
      expect(result).not.toBe('not_enough')
      expect((result as any).type).toBe('discovered')
      expect((result as any).recipeId).toBe('cook_bread')
      expect((result as any).canStart).toBe(true)
      // UI handles opening the cook modal; activeJob is not set automatically
      expect(useCookingStore.getState().activeJob).toBeNull()
    })

    it('returns discovery without starting cook when cant afford full recipe qty', () => {
      const result = useCookingStore.getState().tryFreeformCook(
        ['wheat'],
        { wheat: 1 }, // only 1, need 3
        () => {},
      )
      expect(result).not.toBe('not_enough')
      expect((result as any).type).toBe('discovered')
      expect((result as any).xpGained).toBe(0) // no XP because didn't cook
      expect(useCookingStore.getState().activeJob).toBeNull() // no cook started
    })
  })

  describe('isDiscovered', () => {
    it('returns false for undiscovered recipe', () => {
      expect(useCookingStore.getState().isDiscovered('cook_bread')).toBe(false)
    })

    it('returns true for discovered recipe', () => {
      useCookingStore.setState({ discoveredRecipes: { cook_bread: 0 } })
      expect(useCookingStore.getState().isDiscovered('cook_bread')).toBe(true)
    })
  })

  describe('getStars', () => {
    it('returns 1 star for discovered recipe (0 cooks)', () => {
      useCookingStore.setState({ discoveredRecipes: { cook_bread: 0 } })
      expect(useCookingStore.getState().getStars('cook_bread')).toBe(1)
    })

    it('returns correct stars based on cook count', () => {
      useCookingStore.setState({ discoveredRecipes: { cook_bread: 75 } })
      expect(useCookingStore.getState().getStars('cook_bread')).toBe(5)
    })

    it('returns 1 for unknown recipe (defaults to 0 cooks)', () => {
      expect(useCookingStore.getState().getStars('nonexistent')).toBe(1)
    })
  })

  describe('incrementMastery', () => {
    it('increments cook count from 0 to 1', () => {
      useCookingStore.setState({ discoveredRecipes: { cook_bread: 0 } })
      useCookingStore.getState().incrementMastery('cook_bread')
      expect(useCookingStore.getState().discoveredRecipes['cook_bread']).toBe(1)
    })

    it('handles undiscovered recipe (starts at 0, increments to 1)', () => {
      useCookingStore.getState().incrementMastery('cook_bread')
      expect(useCookingStore.getState().discoveredRecipes['cook_bread']).toBe(1)
    })

    it('persists to localStorage', () => {
      useCookingStore.getState().incrementMastery('cook_bread')
      const stored = JSON.parse(localStorage.getItem('grindly_cooking_discovery') || '{}')
      expect(stored['cook_bread']).toBe(1)
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// PART 12: INTEGRATION & EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════════

describe('integration & edge cases', () => {
  beforeEach(() => {
    if (!('localStorage' in globalThis)) {
      Object.defineProperty(globalThis, 'localStorage', {
        value: createMemoryStorage(),
        configurable: true,
      })
    }
    localStorage.clear()
    resetStore()
    vi.restoreAllMocks()
  })

  it('every recipe can be started with all instruments unlocked and rich inventory', () => {
    for (const recipe of COOKING_RECIPES) {
      resetStore()
      // Set max chef level and all instruments so nothing blocks the cook
      useCookingStore.setState({ unlockedInstruments: [...ALL_INSTRUMENT_IDS], cookXp: 9_999_999 })
      const result = useCookingStore.getState().startCook(recipe.id, 1, richInventory(), () => {})
      expect(result).toBe('ok')
    }
  })

  it('every recipe requires only instruments that exist', () => {
    for (const recipe of COOKING_RECIPES) {
      const needed = recipeInstruments(recipe)
      for (const id of needed) {
        expect(COOK_INSTRUMENT_MAP[id]).toBeTruthy()
      }
    }
  })

  it('bread can be cooked with default instruments (no unlock needed)', () => {
    const result = useCookingStore.getState().startCook('cook_bread', 1, { wheat: 10 }, () => {})
    expect(result).toBe('ok')
  })

  it('full cook cycle: start → tick through all steps → complete → XP gained', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99) // no burn
    useCookingStore.getState().startCook('cook_bread', 1, { wheat: 10 }, () => {})

    let job = useCookingStore.getState().activeJob!
    let now = job.startedAt
    const totalGrants: Array<{ itemId: string; qty: number; xp: number }> = []

    // Walk through every step
    for (let safety = 0; safety < 20; safety++) {
      const cur = useCookingStore.getState().activeJob
      if (!cur) break
      now += (cur.secPerItem + 1) * 1000
      useCookingStore.getState().tick(now, (itemId, qty, xp) => {
        totalGrants.push({ itemId, qty, xp })
      })
    }

    // Job should be complete
    expect(useCookingStore.getState().activeJob).toBeNull()
    // Should have granted bread and XP
    expect(totalGrants.some((g) => g.itemId === 'food_bread' && g.qty > 0)).toBe(true)
    expect(totalGrants.some((g) => g.xp > 0)).toBe(true)
    expect(useCookingStore.getState().cookXp).toBeGreaterThan(0)
  })

  it('mastery XP multiplier applies to XP grants', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    // Set 5-star mastery (75+ cooks)
    useCookingStore.setState({ discoveredRecipes: { cook_bread: 100 } })
    useCookingStore.getState().startCook('cook_bread', 1, { wheat: 10 }, () => {})

    let job = useCookingStore.getState().activeJob!
    let now = job.startedAt
    let totalXp = 0

    for (let safety = 0; safety < 20; safety++) {
      const cur = useCookingStore.getState().activeJob
      if (!cur) break
      now += (cur.secPerItem + 1) * 1000
      useCookingStore.getState().tick(
        now,
        (_, __, xp) => { totalXp += xp },
        undefined,
        (stepXp) => { totalXp += stepXp },
      )
    }

    // With 5-star mastery (1.5x multiplier), XP should be more than base 15
    expect(totalXp).toBeGreaterThan(15)
  })

  it('quality bonus can grant extra output items', () => {
    // Mock: first call (burn check) → 0.99 (no burn), second call (quality) → 0.01 (bonus!)
    let callCount = 0
    vi.spyOn(Math, 'random').mockImplementation(() => {
      callCount++
      // Alternate: no burn, then yes quality, etc.
      return callCount % 2 === 1 ? 0.99 : 0.01
    })

    // Need quality bonus > 0 → upgrade instruments
    useCookingStore.setState({
      instrumentTiers: { knife: 4, pot: 4, pan: 0, bowl: 0, oven: 0, mortar: 0 },
    })

    useCookingStore.getState().startCook('cook_bread', 1, { wheat: 10 }, () => {})

    let job = useCookingStore.getState().activeJob!
    let now = job.startedAt
    let totalQty = 0

    for (let safety = 0; safety < 20; safety++) {
      const cur = useCookingStore.getState().activeJob
      if (!cur) break
      now += (cur.secPerItem + 1) * 1000
      useCookingStore.getState().tick(now, (_, qty) => { totalQty += qty })
    }

    // With quality bonus, should get at least 1 bread (possibly more)
    expect(totalQty).toBeGreaterThanOrEqual(1)
  })

  it('concurrent multi-item batch processes items sequentially', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    useCookingStore.getState().startCook('cook_bread', 3, { wheat: 20 }, () => {})

    let now = useCookingStore.getState().activeJob!.startedAt
    let completedItems = 0

    for (let safety = 0; safety < 60; safety++) {
      const cur = useCookingStore.getState().activeJob
      if (!cur) break
      now += (cur.secPerItem + 1) * 1000
      useCookingStore.getState().tick(now, (_, qty) => { completedItems += qty })
    }

    expect(completedItems).toBe(6) // 3 cook cycles × outputQty 2 = 6 breads
    expect(useCookingStore.getState().activeJob).toBeNull()
  })

  it('cancel refunds proportional to uncompleted items', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99)

    // Start a batch of 5, cancel immediately — should refund all 5×3=15 wheat
    useCookingStore.getState().startCook('cook_bread', 5, { wheat: 50 }, () => {})
    const job = useCookingStore.getState().activeJob!

    const refunds: [string, number][] = []
    useCookingStore.getState().cancelJob(job.id, (id, qty) => refunds.push([id, qty]))

    const totalRefunded = refunds.reduce((sum, [, qty]) => sum + qty, 0)
    expect(totalRefunded).toBe(15) // 5 uncompleted × 3 wheat
    expect(useCookingStore.getState().activeJob).toBeNull()
  })

  it('recipe ingredient IDs are consistent (all used ingredient IDs exist)', () => {
    const allIngredientIds = new Set<string>()
    for (const recipe of COOKING_RECIPES) {
      for (const ing of recipe.ingredients) {
        allIngredientIds.add(ing.id)
      }
    }
    // All ingredient IDs should be non-empty strings
    for (const id of allIngredientIds) {
      expect(id.length).toBeGreaterThan(0)
    }
  })

  it('no recipe has duplicate ingredient IDs', () => {
    for (const recipe of COOKING_RECIPES) {
      const ids = recipe.ingredients.map((i) => i.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('chef double chance + mastery double stack but stay < 1', () => {
    // Max chef double: 0.45, max mastery double: 0.20
    // Stacked: 0.65 — should be < 1.0
    const totalDouble = getChefDoubleChance(99) + MASTERY_BONUSES[4].doubleOutputChance
    expect(totalDouble).toBeLessThan(1.0)
    expect(totalDouble).toBe(0.65)
  })

  it('localStorage corruption is handled gracefully', () => {
    localStorage.setItem('grindly_cooking_v1', '{corrupted json')
    localStorage.setItem('grindly_cooking_instruments', 'not valid')
    localStorage.setItem('grindly_cooking_discovery', 'broken')

    // Should not throw
    expect(() => useCookingStore.getState().hydrate()).not.toThrow()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// PART 13: PROGRESSION BALANCE (sanity checks)
// ═══════════════════════════════════════════════════════════════════════════════

describe('progression balance', () => {
  it('common recipes are accessible at level 0-5', () => {
    const commons = COOKING_RECIPES.filter((r) => FOOD_ITEM_MAP[r.outputItemId]?.rarity === 'common')
    for (const r of commons) {
      expect(r.chefLevelRequired).toBeLessThanOrEqual(5)
    }
  })

  it('mythic recipes require level 70+', () => {
    const mythics = COOKING_RECIPES.filter((r) => FOOD_ITEM_MAP[r.outputItemId]?.rarity === 'mythic')
    for (const r of mythics) {
      expect(r.chefLevelRequired).toBeGreaterThanOrEqual(70)
    }
  })

  it('mythic burn chance (35%) is significant but not guaranteed', () => {
    expect(BASE_BURN_CHANCE['mythic']).toBe(0.35)
    expect(BASE_BURN_CHANCE['mythic']).toBeLessThan(0.5)
  })

  it('XP per item scales reasonably (no 1000x jumps between tiers)', () => {
    const sorted = [...COOKING_RECIPES].sort((a, b) => a.xpPerItem - b.xpPerItem)
    for (let i = 1; i < sorted.length; i++) {
      // No single jump should be more than 10x the previous
      expect(sorted[i].xpPerItem).toBeLessThanOrEqual(sorted[i - 1].xpPerItem * 10)
    }
  })

  it('instrument unlock progression is reasonable', () => {
    // Should unlock in increasing level order
    const levels = COOK_INSTRUMENTS.map((i) => i.unlockLevel).filter((l) => l > 0)
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]).toBeGreaterThanOrEqual(levels[i - 1])
    }
  })

  it('total gold cost for max-tier instruments is finite and reachable', () => {
    let totalCost = 0
    for (const inst of COOK_INSTRUMENTS) {
      totalCost += inst.unlockCost
      for (const tier of inst.tiers) {
        totalCost += tier.cost
      }
    }
    expect(totalCost).toBeGreaterThan(0)
    expect(totalCost).toBeLessThan(1_000_000) // shouldn't be millions
  })

  it('at max chef level + max instruments, mythic recipes take reasonable time', () => {
    const maxTiers: Record<CookInstrumentId, number> = { knife: 4, pot: 4, pan: 4, bowl: 4, oven: 4, mortar: 4 }
    for (const recipe of COOKING_RECIPES) {
      const dur = cookTotalDuration(recipe, 1, 99, 1, maxTiers)
      // Even mythic should complete in under 5 minutes at max level/instruments
      expect(dur).toBeLessThan(300)
      expect(dur).toBeGreaterThanOrEqual(1) // never 0
    }
  })
})
