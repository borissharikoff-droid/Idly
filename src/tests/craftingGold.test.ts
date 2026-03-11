import { describe, expect, it } from 'vitest'
import { CRAFT_RECIPES, CRAFT_RECIPE_MAP, canAffordRecipe } from '../renderer/lib/crafting'

describe('crafting gold costs', () => {
  describe('specific recipe goldCost values', () => {
    it('craft_wolf_pendant recipe costs 300 gold', () => {
      const recipe = CRAFT_RECIPES.find(r => r.outputItemId === 'craft_wolf_pendant')
      expect(recipe).toBeDefined()
      expect(recipe!.goldCost).toBe(300)
    })

    it('craft_dragonfire_blade recipe costs 8000 gold', () => {
      const recipe = CRAFT_RECIPES.find(r => r.outputItemId === 'craft_dragonfire_blade')
      expect(recipe).toBeDefined()
      expect(recipe!.goldCost).toBe(8000)
    })

    it('craft_essence_ring recipe costs 500 gold', () => {
      const recipe = CRAFT_RECIPES.find(r => r.outputItemId === 'craft_essence_ring')
      expect(recipe).toBeDefined()
      expect(recipe!.goldCost).toBe(500)
    })

    it('craft_scale_robe recipe costs 1500 gold', () => {
      const recipe = CRAFT_RECIPES.find(r => r.outputItemId === 'craft_scale_robe')
      expect(recipe).toBeDefined()
      expect(recipe!.goldCost).toBe(1500)
    })

    it('craft_void_blade recipe costs 3000 gold', () => {
      const recipe = CRAFT_RECIPES.find(r => r.outputItemId === 'craft_void_blade')
      expect(recipe).toBeDefined()
      expect(recipe!.goldCost).toBe(3000)
    })

    it('craft_dragon_crown recipe costs 5000 gold', () => {
      const recipe = CRAFT_RECIPES.find(r => r.outputItemId === 'craft_dragon_crown')
      expect(recipe).toBeDefined()
      expect(recipe!.goldCost).toBe(5000)
    })

    it('craft_orc_plate recipe costs 800 gold', () => {
      const recipe = CRAFT_RECIPES.find(r => r.outputItemId === 'craft_orc_plate')
      expect(recipe).toBeDefined()
      expect(recipe!.goldCost).toBe(800)
    })

    it('craft_troll_cloak recipe costs 2000 gold', () => {
      const recipe = CRAFT_RECIPES.find(r => r.outputItemId === 'craft_troll_cloak')
      expect(recipe).toBeDefined()
      expect(recipe!.goldCost).toBe(2000)
    })

    it('craft_warlord_gauntlets recipe costs 1500 gold', () => {
      const recipe = CRAFT_RECIPES.find(r => r.outputItemId === 'craft_warlord_gauntlets')
      expect(recipe).toBeDefined()
      expect(recipe!.goldCost).toBe(1500)
    })

    it('craft_troll_aegis recipe costs 4000 gold', () => {
      const recipe = CRAFT_RECIPES.find(r => r.outputItemId === 'craft_troll_aegis')
      expect(recipe).toBeDefined()
      expect(recipe!.goldCost).toBe(4000)
    })
  })

  describe('recipes without goldCost', () => {
    it('recipe_iron_bar has no goldCost', () => {
      const recipe = CRAFT_RECIPE_MAP['recipe_iron_bar']
      expect(recipe).toBeDefined()
      expect(recipe.goldCost).toBeUndefined()
    })

    it('recipe_fang_shard has no goldCost', () => {
      const recipe = CRAFT_RECIPE_MAP['recipe_fang_shard']
      expect(recipe).toBeDefined()
      expect(recipe.goldCost).toBeUndefined()
    })

    it('recipe_iron_helm has no goldCost', () => {
      const recipe = CRAFT_RECIPE_MAP['recipe_iron_helm']
      expect(recipe).toBeDefined()
      expect(recipe.goldCost).toBeUndefined()
    })

    it('recipe_slime_shield has no goldCost', () => {
      const recipe = CRAFT_RECIPE_MAP['recipe_slime_shield']
      expect(recipe).toBeDefined()
      expect(recipe.goldCost).toBeUndefined()
    })

    it('recipe_compost has no goldCost', () => {
      const recipe = CRAFT_RECIPE_MAP['recipe_compost']
      expect(recipe).toBeDefined()
      expect(recipe.goldCost).toBeUndefined()
    })

    it('basic intermediate recipes have no goldCost', () => {
      const FERTILIZER_RECIPES = ['recipe_golden_fertilizer', 'recipe_void_soil']
      const intermediates = CRAFT_RECIPES.filter(r => r.isIntermediate && !FERTILIZER_RECIPES.includes(r.id))
      for (const recipe of intermediates) {
        expect(recipe.goldCost).toBeUndefined()
      }
    })
  })

  describe('canAffordRecipe', () => {
    it('returns true when player has enough ingredients', () => {
      const recipe = CRAFT_RECIPE_MAP['recipe_iron_bar']
      const items = { ore_iron: 10 }
      expect(canAffordRecipe(recipe, 1, items)).toBe(true)
    })

    it('returns false when player lacks ingredients', () => {
      const recipe = CRAFT_RECIPE_MAP['recipe_iron_bar']
      const items = { ore_iron: 2 } // needs 5
      expect(canAffordRecipe(recipe, 1, items)).toBe(false)
    })

    it('returns true for exact ingredient count', () => {
      const recipe = CRAFT_RECIPE_MAP['recipe_iron_bar']
      const items = { ore_iron: 5 }
      expect(canAffordRecipe(recipe, 1, items)).toBe(true)
    })

    it('scales ingredient check with qty', () => {
      const recipe = CRAFT_RECIPE_MAP['recipe_iron_bar']
      expect(canAffordRecipe(recipe, 2, { ore_iron: 10 })).toBe(true)
      expect(canAffordRecipe(recipe, 2, { ore_iron: 9 })).toBe(false)
    })

    it('checks all ingredients for multi-ingredient recipe', () => {
      const recipe = CRAFT_RECIPE_MAP['recipe_wolf_pendant']
      // wolf_fang × 3, iron_bar × 1, blossoms × 2
      expect(canAffordRecipe(recipe, 1, { wolf_fang: 3, iron_bar: 1, blossoms: 2 })).toBe(true)
      expect(canAffordRecipe(recipe, 1, { wolf_fang: 3, iron_bar: 1, blossoms: 1 })).toBe(false)
      expect(canAffordRecipe(recipe, 1, { wolf_fang: 3, iron_bar: 0, blossoms: 2 })).toBe(false)
    })

    it('returns false when item is missing from inventory entirely', () => {
      const recipe = CRAFT_RECIPE_MAP['recipe_iron_bar']
      expect(canAffordRecipe(recipe, 1, {})).toBe(false)
    })

    it('returns true for qty=0', () => {
      const recipe = CRAFT_RECIPE_MAP['recipe_iron_bar']
      expect(canAffordRecipe(recipe, 0, {})).toBe(true)
    })
  })
})
