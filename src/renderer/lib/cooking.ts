import type { LootRarity } from './loot'
import type { FoodEffect } from './combat'

// ─── Food item definitions ──────────────────────────────────────────────────

export interface FoodItemDef {
  id: string
  name: string
  icon: string
  rarity: LootRarity
  effect: FoodEffect
  description: string
}

export const FOOD_ITEMS: FoodItemDef[] = [
  // ── Common (basic farm ingredients) ──────────────────────────────────────────
  {
    id: 'food_bread',
    name: 'Bread',
    icon: '🍞',
    rarity: 'common',
    effect: { heal: 30 },
    description: 'Simple baked bread. Restores 30 HP.',
  },
  {
    id: 'food_herb_soup',
    name: 'Herb Soup',
    icon: '🍲',
    rarity: 'common',
    effect: { heal: 40, buffRegen: 2, buffDurationSec: 60 },
    description: 'A hearty herbal soup. Restores 40 HP + 2 regen for 60s.',
  },
  {
    id: 'food_apple_jam',
    name: 'Apple Jam',
    icon: '🫙',
    rarity: 'common',
    effect: { heal: 35, buffAtk: 1, buffDurationSec: 45 },
    description: 'Sweet apple preserve. Restores 35 HP + 1 ATK for 45s.',
  },

  // ── Rare (mixed farm + early arena materials) ────────────────────────────────
  {
    id: 'food_apple_pie',
    name: 'Apple Pie',
    icon: '🥧',
    rarity: 'rare',
    effect: { heal: 60, buffAtk: 3, buffDurationSec: 90 },
    description: 'Sweet apple pie. Restores 60 HP + 3 ATK for 90s.',
  },
  {
    id: 'food_blossom_stew',
    name: 'Blossom Stew',
    icon: '🍜',
    rarity: 'rare',
    effect: { heal: 50, buffDef: 4, buffDurationSec: 90 },
    description: 'Fragrant blossom stew. Restores 50 HP + 4 DEF for 90s.',
  },
  {
    id: 'food_slime_jelly',
    name: 'Slime Jelly',
    icon: '🍮',
    rarity: 'rare',
    effect: { heal: 55, buffDef: 3, buffRegen: 1, buffDurationSec: 75 },
    description: 'Wobbly but nutritious. Restores 55 HP + 3 DEF + 1 regen for 75s.',
  },
  {
    id: 'food_goblin_kebab',
    name: 'Goblin Kebab',
    icon: '🍢',
    rarity: 'rare',
    effect: { heal: 45, buffAtk: 4, buffDurationSec: 60 },
    description: 'Spicy goblin-style skewers. Restores 45 HP + 4 ATK for 60s.',
  },

  // ── Epic (mid-game arena materials + higher farm) ────────────────────────────
  {
    id: 'food_clover_feast',
    name: 'Clover Feast',
    icon: '🍱',
    rarity: 'epic',
    effect: { heal: 100, buffAtk: 5, buffDef: 4, buffDurationSec: 120 },
    description: 'Lucky feast. Restores 100 HP + 5 ATK + 4 DEF for 120s.',
  },
  {
    id: 'food_wolf_steak',
    name: 'Wolf Steak',
    icon: '🥩',
    rarity: 'epic',
    effect: { heal: 80, buffAtk: 7, buffDurationSec: 90 },
    description: 'Seared wolf-cut steak. Restores 80 HP + 7 ATK for 90s.',
  },
  {
    id: 'food_orchid_tea',
    name: 'Orchid Tea',
    icon: '🍵',
    rarity: 'epic',
    effect: { heal: 70, buffRegen: 4, buffDef: 3, buffDurationSec: 120 },
    description: 'Soothing orchid infusion. Restores 70 HP + 4 regen + 3 DEF for 120s.',
  },
  {
    id: 'food_orc_hotpot',
    name: 'Orc Hotpot',
    icon: '🫕',
    rarity: 'epic',
    effect: { heal: 90, buffAtk: 4, buffDef: 6, buffDurationSec: 100 },
    description: 'Powerful iron-rich hotpot. Restores 90 HP + 4 ATK + 6 DEF for 100s.',
  },

  // ── Legendary (late-game arena drops + rare plants) ──────────────────────────
  {
    id: 'food_starbloom_elixir',
    name: 'Starbloom Elixir',
    icon: '🧃',
    rarity: 'legendary',
    effect: { heal: 150, buffAtk: 8, buffDef: 6, buffRegen: 3, buffDurationSec: 180 },
    description: 'Cosmic elixir. Restores 150 HP + 8 ATK + 6 DEF + 3 regen for 180s.',
  },
  {
    id: 'food_troll_broth',
    name: 'Troll Broth',
    icon: '🥘',
    rarity: 'legendary',
    effect: { heal: 120, buffRegen: 6, buffDef: 8, buffDurationSec: 150 },
    description: 'Bubbling troll-hide broth. Restores 120 HP + 6 regen + 8 DEF for 150s.',
  },

  // ── Mythic (endgame) ─────────────────────────────────────────────────────────
  {
    id: 'food_void_feast',
    name: 'Void Feast',
    icon: '🍽️',
    rarity: 'mythic',
    effect: { heal: 250, buffAtk: 15, buffDef: 10, buffRegen: 5, buffDurationSec: 300 },
    description: 'Ultimate feast. Restores 250 HP + 15 ATK + 10 DEF + 5 regen for 300s.',
  },
  {
    id: 'food_dragon_roast',
    name: 'Dragon Roast',
    icon: '🔥',
    rarity: 'mythic',
    effect: { heal: 200, buffAtk: 20, buffDef: 5, buffDurationSec: 240 },
    description: 'Fire-charred dragon cut. Restores 200 HP + 20 ATK + 5 DEF for 240s.',
  },
]

export const FOOD_ITEM_MAP: Record<string, FoodItemDef> = Object.fromEntries(
  FOOD_ITEMS.map((f) => [f.id, f]),
)

export function getFoodItemById(id: string): FoodItemDef | undefined {
  return FOOD_ITEM_MAP[id]
}

export const FOOD_IDS = FOOD_ITEMS.map((f) => f.id)

export function isFoodId(id: string): boolean {
  return FOOD_IDS.includes(id)
}

// ─── Cooking recipes ────────────────────────────────────────────────────────

export interface CookIngredient {
  id: string
  qty: number
}

export interface CookStep {
  label: string   // e.g. "Chop Herbs", "Boil"
  icon: string    // emoji for the action
  secPerItem: number
}

export interface CookingRecipe {
  id: string
  outputItemId: string
  outputQty: number
  ingredients: CookIngredient[]
  /** @deprecated Use sum of steps[].secPerItem instead */
  secPerItem: number
  xpPerItem: number
  chefLevelRequired: number
  /** Multi-step cooking process. Player clicks advance between each step. */
  steps: CookStep[]
}

export const COOKING_RECIPES: CookingRecipe[] = [
  // ── Common (3 steps) ─────────────────────────────────────────────────────────
  {
    id: 'cook_bread',
    outputItemId: 'food_bread',
    outputQty: 1,
    ingredients: [{ id: 'wheat', qty: 3 }],
    secPerItem: 8,
    xpPerItem: 15,
    chefLevelRequired: 0,
    steps: [
      { label: 'Grind Wheat', icon: '⚗️', secPerItem: 2 },
      { label: 'Knead Dough', icon: '🤲', secPerItem: 2 },
      { label: 'Bake', icon: '🔥', secPerItem: 4 },
    ],
  },
  {
    id: 'cook_apple_jam',
    outputItemId: 'food_apple_jam',
    outputQty: 2,
    ingredients: [{ id: 'apples', qty: 2 }, { id: 'wheat', qty: 1 }],
    secPerItem: 10,
    xpPerItem: 20,
    chefLevelRequired: 3,
    steps: [
      { label: 'Peel Apples', icon: '🔪', secPerItem: 2 },
      { label: 'Mash & Mix', icon: '🥣', secPerItem: 3 },
      { label: 'Simmer', icon: '♨️', secPerItem: 5 },
    ],
  },
  {
    id: 'cook_herb_soup',
    outputItemId: 'food_herb_soup',
    outputQty: 1,
    ingredients: [{ id: 'herbs', qty: 2 }, { id: 'wheat', qty: 2 }],
    secPerItem: 15,
    xpPerItem: 30,
    chefLevelRequired: 5,
    steps: [
      { label: 'Wash Herbs', icon: '🌿', secPerItem: 3 },
      { label: 'Chop & Dice', icon: '🔪', secPerItem: 4 },
      { label: 'Boil', icon: '♨️', secPerItem: 8 },
    ],
  },

  // ── Rare (4 steps) ───────────────────────────────────────────────────────────
  {
    id: 'cook_apple_pie',
    outputItemId: 'food_apple_pie',
    outputQty: 1,
    ingredients: [{ id: 'apples', qty: 3 }, { id: 'wheat', qty: 2 }],
    secPerItem: 45,
    xpPerItem: 60,
    chefLevelRequired: 15,
    steps: [
      { label: 'Peel & Slice', icon: '🔪', secPerItem: 5 },
      { label: 'Mix Filling', icon: '🥣', secPerItem: 5 },
      { label: 'Roll Crust', icon: '🤲', secPerItem: 5 },
      { label: 'Bake Pie', icon: '🔥', secPerItem: 30 },
    ],
  },
  {
    id: 'cook_blossom_stew',
    outputItemId: 'food_blossom_stew',
    outputQty: 1,
    ingredients: [{ id: 'blossoms', qty: 3 }, { id: 'herbs', qty: 1 }],
    secPerItem: 45,
    xpPerItem: 60,
    chefLevelRequired: 15,
    steps: [
      { label: 'Sort Blossoms', icon: '🌸', secPerItem: 4 },
      { label: 'Crush Petals', icon: '⚗️', secPerItem: 4 },
      { label: 'Add Herbs', icon: '🌿', secPerItem: 3 },
      { label: 'Slow Cook', icon: '♨️', secPerItem: 34 },
    ],
  },
  {
    id: 'cook_slime_jelly',
    outputItemId: 'food_slime_jelly',
    outputQty: 1,
    ingredients: [{ id: 'slime_gel', qty: 3 }, { id: 'wheat', qty: 2 }, { id: 'herbs', qty: 1 }],
    secPerItem: 30,
    xpPerItem: 50,
    chefLevelRequired: 10,
    steps: [
      { label: 'Strain Gel', icon: '🧪', secPerItem: 5 },
      { label: 'Boil & Stir', icon: '♨️', secPerItem: 7 },
      { label: 'Set & Chill', icon: '🧊', secPerItem: 18 },
    ],
  },
  {
    id: 'cook_goblin_kebab',
    outputItemId: 'food_goblin_kebab',
    outputQty: 1,
    ingredients: [{ id: 'goblin_tooth', qty: 2 }, { id: 'herbs', qty: 2 }, { id: 'blossoms', qty: 1 }],
    secPerItem: 40,
    xpPerItem: 65,
    chefLevelRequired: 18,
    steps: [
      { label: 'Grind Teeth', icon: '⚗️', secPerItem: 5 },
      { label: 'Chop Herbs', icon: '🔪', secPerItem: 4 },
      { label: 'Skewer & Marinate', icon: '🧂', secPerItem: 6 },
      { label: 'Grill', icon: '🔥', secPerItem: 25 },
    ],
  },

  // ── Epic (4-5 steps) ─────────────────────────────────────────────────────────
  {
    id: 'cook_clover_feast',
    outputItemId: 'food_clover_feast',
    outputQty: 1,
    ingredients: [{ id: 'clovers', qty: 2 }, { id: 'apples', qty: 2 }, { id: 'herbs', qty: 2 }],
    secPerItem: 120,
    xpPerItem: 150,
    chefLevelRequired: 30,
    steps: [
      { label: 'Dry Clovers', icon: '🍀', secPerItem: 10 },
      { label: 'Dice Apples', icon: '🔪', secPerItem: 8 },
      { label: 'Prepare Herbs', icon: '🌿', secPerItem: 8 },
      { label: 'Layer & Assemble', icon: '🍱', secPerItem: 14 },
      { label: 'Feast Bake', icon: '🔥', secPerItem: 80 },
    ],
  },
  {
    id: 'cook_wolf_steak',
    outputItemId: 'food_wolf_steak',
    outputQty: 1,
    ingredients: [{ id: 'wolf_fang', qty: 2 }, { id: 'blossoms', qty: 2 }, { id: 'wheat', qty: 3 }],
    secPerItem: 90,
    xpPerItem: 130,
    chefLevelRequired: 25,
    steps: [
      { label: 'Tenderize Meat', icon: '🥩', secPerItem: 10 },
      { label: 'Herb Rub', icon: '🌿', secPerItem: 8 },
      { label: 'Sear', icon: '🍳', secPerItem: 12 },
      { label: 'Rest & Glaze', icon: '♨️', secPerItem: 60 },
    ],
  },
  {
    id: 'cook_orchid_tea',
    outputItemId: 'food_orchid_tea',
    outputQty: 1,
    ingredients: [{ id: 'orchids', qty: 3 }, { id: 'herbs', qty: 2 }],
    secPerItem: 100,
    xpPerItem: 140,
    chefLevelRequired: 28,
    steps: [
      { label: 'Dry Orchids', icon: '🌿', secPerItem: 15 },
      { label: 'Grind Petals', icon: '⚗️', secPerItem: 10 },
      { label: 'Boil Water', icon: '♨️', secPerItem: 15 },
      { label: 'Steep & Strain', icon: '🍵', secPerItem: 60 },
    ],
  },
  {
    id: 'cook_orc_hotpot',
    outputItemId: 'food_orc_hotpot',
    outputQty: 1,
    ingredients: [{ id: 'orc_shard', qty: 2 }, { id: 'clovers', qty: 2 }, { id: 'apples', qty: 2 }],
    secPerItem: 150,
    xpPerItem: 200,
    chefLevelRequired: 35,
    steps: [
      { label: 'Crush Shards', icon: '🪨', secPerItem: 15 },
      { label: 'Dice Clovers', icon: '🔪', secPerItem: 10 },
      { label: 'Peel Apples', icon: '🔪', secPerItem: 10 },
      { label: 'Layer Iron Pot', icon: '🫕', secPerItem: 15 },
      { label: 'Slow Stew', icon: '♨️', secPerItem: 100 },
    ],
  },

  // ── Legendary (5 steps) ──────────────────────────────────────────────────────
  {
    id: 'cook_starbloom_elixir',
    outputItemId: 'food_starbloom_elixir',
    outputQty: 1,
    ingredients: [{ id: 'star_bloom', qty: 1 }, { id: 'orchids', qty: 2 }, { id: 'herbs', qty: 3 }],
    secPerItem: 300,
    xpPerItem: 400,
    chefLevelRequired: 50,
    steps: [
      { label: 'Pluck Petals', icon: '🌸', secPerItem: 30 },
      { label: 'Extract Essence', icon: '✨', secPerItem: 40 },
      { label: 'Steep Orchids', icon: '🍵', secPerItem: 30 },
      { label: 'Blend Herbs', icon: '⚗️', secPerItem: 20 },
      { label: 'Distill Elixir', icon: '🧪', secPerItem: 180 },
    ],
  },
  {
    id: 'cook_troll_broth',
    outputItemId: 'food_troll_broth',
    outputQty: 1,
    ingredients: [{ id: 'troll_hide', qty: 2 }, { id: 'orchids', qty: 2 }, { id: 'crystal_root', qty: 1 }],
    secPerItem: 360,
    xpPerItem: 500,
    chefLevelRequired: 55,
    steps: [
      { label: 'Boil Hide', icon: '♨️', secPerItem: 40 },
      { label: 'Skim Impurities', icon: '🥄', secPerItem: 30 },
      { label: 'Add Orchids', icon: '🌿', secPerItem: 30 },
      { label: 'Crush Crystal', icon: '⚗️', secPerItem: 30 },
      { label: 'Reduce Broth', icon: '🥘', secPerItem: 230 },
    ],
  },

  // ── Mythic (6 steps) ─────────────────────────────────────────────────────────
  {
    id: 'cook_void_feast',
    outputItemId: 'food_void_feast',
    outputQty: 1,
    ingredients: [{ id: 'void_blossom', qty: 1 }, { id: 'crystal_root', qty: 1 }, { id: 'star_bloom', qty: 2 }],
    secPerItem: 600,
    xpPerItem: 1000,
    chefLevelRequired: 70,
    steps: [
      { label: 'Attune Void', icon: '🌀', secPerItem: 40 },
      { label: 'Harvest Crystal', icon: '💎', secPerItem: 50 },
      { label: 'Infuse Starbloom', icon: '✨', secPerItem: 60 },
      { label: 'Weave Essence', icon: '🧬', secPerItem: 60 },
      { label: 'Assemble Feast', icon: '🍽️', secPerItem: 90 },
      { label: 'Cosmic Seal', icon: '🔮', secPerItem: 300 },
    ],
  },
  {
    id: 'cook_dragon_roast',
    outputItemId: 'food_dragon_roast',
    outputQty: 1,
    ingredients: [{ id: 'dragon_scale', qty: 2 }, { id: 'star_bloom', qty: 1 }, { id: 'void_blossom', qty: 1 }],
    secPerItem: 540,
    xpPerItem: 900,
    chefLevelRequired: 75,
    steps: [
      { label: 'Crack Scales', icon: '🐉', secPerItem: 50 },
      { label: 'Extract Marrow', icon: '🦴', secPerItem: 40 },
      { label: 'Starbloom Marinade', icon: '✨', secPerItem: 50 },
      { label: 'Void Seasoning', icon: '🌀', secPerItem: 40 },
      { label: 'Dragonfire Sear', icon: '🔥', secPerItem: 120 },
      { label: 'Rest & Plate', icon: '🍽️', secPerItem: 240 },
    ],
  },
]

export const COOKING_RECIPE_MAP: Record<string, CookingRecipe> = Object.fromEntries(
  COOKING_RECIPES.map((r) => [r.id, r]),
)

// ─── Cooking instruments ──────────────────────────────────────────────────

export type CookInstrumentId = 'knife' | 'pot' | 'pan' | 'oven' | 'mortar' | 'bowl'

export interface InstrumentTier {
  name: string
  icon: string
  speedBonus: number    // 0.08 = 8% faster
  qualityBonus: number  // 0.05 = 5% chance for +1 extra output
  burnReduction: number // 0.25 = 25% less burn chance
  cost: number          // gold
}

export interface CookInstrument {
  id: CookInstrumentId
  name: string
  icon: string
  /** Chef level required to buy/unlock this instrument. */
  unlockLevel: number
  /** Gold cost to unlock (first purchase). 0 = starts unlocked. */
  unlockCost: number
  tiers: InstrumentTier[]
}

export const COOK_INSTRUMENTS: CookInstrument[] = [
  {
    id: 'knife', name: 'Knife', icon: '🔪',
    unlockLevel: 0, unlockCost: 0,    // starts unlocked
    tiers: [
      { name: 'Wooden',  icon: '🔪', speedBonus: 0,    qualityBonus: 0,    burnReduction: 0,    cost: 0 },
      { name: 'Copper',  icon: '🗡️', speedBonus: 0.06, qualityBonus: 0.03, burnReduction: 0.20, cost: 400 },
      { name: 'Iron',    icon: '⚔️', speedBonus: 0.14, qualityBonus: 0.07, burnReduction: 0.45, cost: 1800 },
      { name: 'Steel',   icon: '🔪', speedBonus: 0.22, qualityBonus: 0.12, burnReduction: 0.70, cost: 7000 },
      { name: 'Mythril', icon: '✨', speedBonus: 0.32, qualityBonus: 0.20, burnReduction: 1.00, cost: 22000 },
    ],
  },
  {
    id: 'pot', name: 'Pot', icon: '🍲',
    unlockLevel: 0, unlockCost: 0,    // starts unlocked
    tiers: [
      { name: 'Clay',    icon: '🍲', speedBonus: 0,    qualityBonus: 0,    burnReduction: 0,    cost: 0 },
      { name: 'Copper',  icon: '🫕', speedBonus: 0.06, qualityBonus: 0.03, burnReduction: 0.20, cost: 400 },
      { name: 'Iron',    icon: '🍲', speedBonus: 0.14, qualityBonus: 0.07, burnReduction: 0.45, cost: 1800 },
      { name: 'Steel',   icon: '🫕', speedBonus: 0.22, qualityBonus: 0.12, burnReduction: 0.70, cost: 7000 },
      { name: 'Mythril', icon: '✨', speedBonus: 0.32, qualityBonus: 0.20, burnReduction: 1.00, cost: 22000 },
    ],
  },
  {
    id: 'pan', name: 'Pan', icon: '🍳',
    unlockLevel: 5, unlockCost: 300,
    tiers: [
      { name: 'Wooden',  icon: '🍳', speedBonus: 0,    qualityBonus: 0,    burnReduction: 0,    cost: 0 },
      { name: 'Copper',  icon: '🍳', speedBonus: 0.06, qualityBonus: 0.03, burnReduction: 0.20, cost: 500 },
      { name: 'Iron',    icon: '🍳', speedBonus: 0.14, qualityBonus: 0.07, burnReduction: 0.45, cost: 2200 },
      { name: 'Steel',   icon: '🍳', speedBonus: 0.22, qualityBonus: 0.12, burnReduction: 0.70, cost: 8000 },
      { name: 'Mythril', icon: '✨', speedBonus: 0.32, qualityBonus: 0.20, burnReduction: 1.00, cost: 25000 },
    ],
  },
  {
    id: 'bowl', name: 'Bowl', icon: '🥣',
    unlockLevel: 10, unlockCost: 800,
    tiers: [
      { name: 'Wooden',  icon: '🥣', speedBonus: 0,    qualityBonus: 0,    burnReduction: 0,    cost: 0 },
      { name: 'Copper',  icon: '🥣', speedBonus: 0.06, qualityBonus: 0.03, burnReduction: 0.20, cost: 600 },
      { name: 'Iron',    icon: '🥣', speedBonus: 0.14, qualityBonus: 0.07, burnReduction: 0.45, cost: 2500 },
      { name: 'Steel',   icon: '🥣', speedBonus: 0.22, qualityBonus: 0.12, burnReduction: 0.70, cost: 9000 },
      { name: 'Mythril', icon: '✨', speedBonus: 0.32, qualityBonus: 0.20, burnReduction: 1.00, cost: 28000 },
    ],
  },
  {
    id: 'oven', name: 'Oven', icon: '🔥',
    unlockLevel: 15, unlockCost: 2000,
    tiers: [
      { name: 'Brick',   icon: '🧱', speedBonus: 0,    qualityBonus: 0,    burnReduction: 0,    cost: 0 },
      { name: 'Copper',  icon: '🔥', speedBonus: 0.06, qualityBonus: 0.04, burnReduction: 0.20, cost: 800 },
      { name: 'Iron',    icon: '🔥', speedBonus: 0.14, qualityBonus: 0.08, burnReduction: 0.45, cost: 3000 },
      { name: 'Steel',   icon: '🔥', speedBonus: 0.22, qualityBonus: 0.14, burnReduction: 0.70, cost: 10000 },
      { name: 'Mythril', icon: '✨', speedBonus: 0.32, qualityBonus: 0.22, burnReduction: 1.00, cost: 30000 },
    ],
  },
  {
    id: 'mortar', name: 'Mortar', icon: '⚗️',
    unlockLevel: 25, unlockCost: 5000,
    tiers: [
      { name: 'Stone',   icon: '⚗️', speedBonus: 0,    qualityBonus: 0,    burnReduction: 0,    cost: 0 },
      { name: 'Copper',  icon: '⚗️', speedBonus: 0.06, qualityBonus: 0.04, burnReduction: 0.20, cost: 1000 },
      { name: 'Iron',    icon: '⚗️', speedBonus: 0.14, qualityBonus: 0.08, burnReduction: 0.45, cost: 4000 },
      { name: 'Steel',   icon: '⚗️', speedBonus: 0.22, qualityBonus: 0.14, burnReduction: 0.70, cost: 12000 },
      { name: 'Mythril', icon: '✨', speedBonus: 0.32, qualityBonus: 0.22, burnReduction: 1.00, cost: 35000 },
    ],
  },
]

export const COOK_INSTRUMENT_MAP: Record<CookInstrumentId, CookInstrument> = Object.fromEntries(
  COOK_INSTRUMENTS.map((i) => [i.id, i]),
) as Record<CookInstrumentId, CookInstrument>

/** All instrument IDs that start unlocked (cost 0). */
export const DEFAULT_UNLOCKED_INSTRUMENTS: CookInstrumentId[] =
  COOK_INSTRUMENTS.filter((i) => i.unlockCost === 0).map((i) => i.id)

/** Map a cooking step to the instrument it uses, based on keywords. */
export function stepToInstrument(step: CookStep): CookInstrumentId {
  const l = step.label.toLowerCase()
  if (/chop|dice|cut|prep|skewer|crack|peel|slice|tenderize|pluck|harvest|extract marrow/.test(l)) return 'knife'
  if (/sear|grill|fry|glaze|roast|dragonfire/.test(l)) return 'pan'
  if (/bake|seal|feast bake/.test(l)) return 'oven'
  if (/grind|crush|strain|extract|distill|attune|weave|void seasoning/.test(l)) return 'mortar'
  if (/boil|simmer|stew|slow cook|reduce|brew|steep|infuse/.test(l)) return 'pot'
  return 'bowl' // knead, wash, sort, mix, layer, skim, rub, rest, assemble, plate, set, marinate, add, mash, cosmic, etc.
}

/** Get all unique instruments needed for a recipe (one per step). */
export function recipeInstruments(recipe: CookingRecipe): CookInstrumentId[] {
  const set = new Set(recipe.steps.map(s => stepToInstrument(s)))
  return Array.from(set)
}

/** Check whether the player has the instruments required for a recipe. */
export function hasInstrumentsForRecipe(recipe: CookingRecipe, unlocked: CookInstrumentId[]): boolean {
  return recipeInstruments(recipe).every(id => unlocked.includes(id))
}

/** Speed multiplier from instrument tier (e.g. tier 2 → 0.86 = 14% faster). */
export function instrumentSpeedMult(instrumentTiers: Record<CookInstrumentId, number>, instrumentId: CookInstrumentId): number {
  const tier = instrumentTiers[instrumentId] ?? 0
  const def = COOK_INSTRUMENT_MAP[instrumentId]
  const bonus = def?.tiers[tier]?.speedBonus ?? 0
  return 1 - bonus
}

// ─── Burn & quality mechanics ────────────────────────────────────────────────

/** Base burn chance per food rarity (before instrument reduction). */
export const BASE_BURN_CHANCE: Record<LootRarity, number> = {
  common: 0.08,
  rare: 0.14,
  epic: 0.20,
  legendary: 0.28,
  mythic: 0.35,
}

/**
 * Effective burn chance for a recipe, considering all instruments.
 * Average burnReduction of unique instruments used, applied to the base rate.
 */
export function effectiveBurnChance(
  recipe: CookingRecipe,
  rarity: LootRarity,
  instrumentTiers: Record<CookInstrumentId, number>,
): number {
  const instruments = recipeInstruments(recipe)
  const avgReduction = instruments.reduce((sum, id) => {
    const def = COOK_INSTRUMENT_MAP[id]
    return sum + (def?.tiers[instrumentTiers[id] ?? 0]?.burnReduction ?? 0)
  }, 0) / instruments.length
  return Math.max(0, BASE_BURN_CHANCE[rarity] * (1 - avgReduction))
}

/**
 * Effective quality bonus (extra output chance) from all instruments.
 * Average qualityBonus of unique instruments used.
 */
export function effectiveQualityBonus(
  recipe: CookingRecipe,
  instrumentTiers: Record<CookInstrumentId, number>,
): number {
  const instruments = recipeInstruments(recipe)
  const avgQuality = instruments.reduce((sum, id) => {
    const def = COOK_INSTRUMENT_MAP[id]
    return sum + (def?.tiers[instrumentTiers[id] ?? 0]?.qualityBonus ?? 0)
  }, 0) / instruments.length
  return avgQuality
}

// ─── Chef level perks ───────────────────────────────────────────────────────

export function getChefSpeedMultiplier(level: number): number {
  if (level >= 80) return 0.40
  if (level >= 60) return 0.55
  if (level >= 40) return 0.70
  if (level >= 25) return 0.80
  if (level >= 10) return 0.90
  return 1.0
}

export function getChefDoubleChance(level: number): number {
  if (level >= 60) return 0.45
  if (level >= 25) return 0.15
  return 0
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function canAffordCookRecipe(
  recipe: CookingRecipe,
  qty: number,
  items: Record<string, number>,
): boolean {
  return recipe.ingredients.every((ing) => (items[ing.id] ?? 0) >= ing.qty * qty)
}

export function maxAffordableCookQty(recipe: CookingRecipe, items: Record<string, number>): number {
  let max = Infinity
  for (const ing of recipe.ingredients) {
    const owned = items[ing.id] ?? 0
    max = Math.min(max, Math.floor(owned / ing.qty))
  }
  return max === Infinity ? 0 : max
}

export function cookDuration(recipe: CookingRecipe, qty: number, chefLevel = 0, grindlyCraftMult = 1): number {
  return Math.max(1, Math.round(recipe.secPerItem * getChefSpeedMultiplier(chefLevel) * grindlyCraftMult)) * qty
}

/** Duration for a single step, adjusted for chef level and optional instrument speed. */
export function cookStepDuration(
  step: CookStep,
  chefLevel = 0,
  grindlyCraftMult = 1,
  instTiers?: Record<CookInstrumentId, number>,
): number {
  const instMult = instTiers ? instrumentSpeedMult(instTiers, stepToInstrument(step)) : 1
  return Math.max(1, Math.round(step.secPerItem * getChefSpeedMultiplier(chefLevel) * grindlyCraftMult * instMult))
}

/** Total duration for all steps × qty, adjusted for chef level and optional instrument speed. */
export function cookTotalDuration(
  recipe: CookingRecipe,
  qty: number,
  chefLevel = 0,
  grindlyCraftMult = 1,
  instTiers?: Record<CookInstrumentId, number>,
): number {
  const speedMult = getChefSpeedMultiplier(chefLevel) * grindlyCraftMult
  const totalPerItem = recipe.steps.reduce((sum, s) => {
    const instMult = instTiers ? instrumentSpeedMult(instTiers, stepToInstrument(s)) : 1
    return sum + Math.max(1, Math.round(s.secPerItem * speedMult * instMult))
  }, 0)
  return totalPerItem * qty
}

export function formatCookTime(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`
}

// ─── Mystery Stew (fallback for invalid combos) ────────────────────────────

export const MYSTERY_STEW: FoodItemDef = {
  id: 'food_mystery_stew',
  name: 'Mystery Stew',
  icon: '🫠',
  rarity: 'common',
  effect: { heal: 10, buffAtk: 1, buffDurationSec: 30 },
  description: 'An unrecognisable concoction. At least it\'s warm.',
}

/** XP granted for a failed (mystery stew) attempt. */
export const MYSTERY_STEW_XP = 5

// ─── Recipe Discovery ──────────────────────────────────────────────────────

/**
 * Match a set of ingredient IDs against all recipes.
 * Returns the matching recipe, or null if no recipe matches.
 * Ingredients must match EXACTLY (same IDs and sufficient qty).
 */
export function matchRecipeFromIngredients(
  ingredientSlots: { id: string; qty: number }[],
): CookingRecipe | null {
  const inputMap: Record<string, number> = {}
  for (const slot of ingredientSlots) {
    if (!slot.id) continue
    inputMap[slot.id] = (inputMap[slot.id] ?? 0) + slot.qty
  }
  const inputIds = Object.keys(inputMap).sort()
  if (inputIds.length === 0) return null

  for (const recipe of COOKING_RECIPES) {
    const recipeIds = recipe.ingredients.map((i) => i.id).sort()
    if (recipeIds.length !== inputIds.length) continue
    if (!recipeIds.every((id, i) => id === inputIds[i])) continue
    const qtyMatch = recipe.ingredients.every((ing) => (inputMap[ing.id] ?? 0) >= ing.qty)
    if (qtyMatch) return recipe
  }
  return null
}

/**
 * Match by ingredient IDs only (ignoring quantities).
 * Used by the Cauldron for discovery — player picks which ingredients, system figures out amounts.
 * Returns the recipe if ingredient types match, or null.
 */
export function matchRecipeByIds(ingredientIds: string[]): CookingRecipe | null {
  const sorted = [...new Set(ingredientIds.filter(Boolean))].sort()
  if (sorted.length === 0) return null

  for (const recipe of COOKING_RECIPES) {
    const recipeIds = [...new Set(recipe.ingredients.map((i) => i.id))].sort()
    if (recipeIds.length !== sorted.length) continue
    if (recipeIds.every((id, i) => id === sorted[i])) return recipe
  }
  return null
}

// ─── Recipe Mastery ────────────────────────────────────────────────────────

export const MASTERY_MAX_STARS = 5

/** Number of cooks needed to reach each star level. */
export const MASTERY_THRESHOLDS: number[] = [
  0,    // 1★ — first successful cook (discovery)
  5,    // 2★★
  15,   // 3★★★
  35,   // 4★★★★
  75,   // 5★★★★★
]

/** Bonuses per mastery star. All are multiplicative (1.0 = no bonus). */
export interface MasteryBonus {
  buffMultiplier: number       // multiplier on food buff values
  ingredientSaveChance: number // chance to NOT consume one ingredient
  doubleOutputChance: number   // extra chance for double output (stacks with chef perk)
  xpMultiplier: number         // multiplier on chef XP gained
}

export const MASTERY_BONUSES: MasteryBonus[] = [
  { buffMultiplier: 1.0,  ingredientSaveChance: 0,    doubleOutputChance: 0,    xpMultiplier: 1.0  }, // 1★
  { buffMultiplier: 1.25, ingredientSaveChance: 0,    doubleOutputChance: 0,    xpMultiplier: 1.1  }, // 2★★
  { buffMultiplier: 1.25, ingredientSaveChance: 0.15, doubleOutputChance: 0,    xpMultiplier: 1.2  }, // 3★★★
  { buffMultiplier: 1.50, ingredientSaveChance: 0.15, doubleOutputChance: 0.10, xpMultiplier: 1.3  }, // 4★★★★
  { buffMultiplier: 1.50, ingredientSaveChance: 0.30, doubleOutputChance: 0.20, xpMultiplier: 1.5  }, // 5★★★★★
]

/** Get mastery star count (1-5) from total times cooked. */
export function getMasteryStars(timesCrafted: number): number {
  for (let i = MASTERY_THRESHOLDS.length - 1; i >= 0; i--) {
    if (timesCrafted >= MASTERY_THRESHOLDS[i]) return i + 1
  }
  return 1
}

/** Get mastery bonus for a given star level (1-5). */
export function getMasteryBonus(stars: number): MasteryBonus {
  return MASTERY_BONUSES[Math.min(Math.max(stars - 1, 0), MASTERY_BONUSES.length - 1)]
}

/** How many more cooks needed to reach next star, or 0 if maxed. */
export function cooksToNextStar(timesCrafted: number): number {
  const currentStars = getMasteryStars(timesCrafted)
  if (currentStars >= MASTERY_MAX_STARS) return 0
  return MASTERY_THRESHOLDS[currentStars] - timesCrafted
}

// ─── Discovery Hints ───────────────────────────────────────────────────────

/**
 * Generate a hint for an undiscovered recipe based on chef level.
 * Higher chef level = more detailed hint.
 */
export function getRecipeHint(recipe: CookingRecipe, chefLevel: number): string {
  const food = FOOD_ITEM_MAP[recipe.outputItemId]
  if (!food) return '???'

  // Level 0-9: vague rarity hint
  if (chefLevel < 10) {
    const rarityHints: Record<string, string> = {
      common: 'A simple dish anyone could make...',
      rare: 'Something tasty requires a bit of skill...',
      epic: 'A complex recipe from distant lands...',
      legendary: 'A legendary dish whispered about by master chefs...',
      mythic: 'A mythical feast of unimaginable power...',
    }
    return rarityHints[food.rarity] ?? '???'
  }

  // Level 10-29: ingredient count + one ingredient revealed
  if (chefLevel < 30) {
    const count = recipe.ingredients.length
    const revealed = recipe.ingredients[0]
    return `Uses ${count} ingredients. Starts with ${getIngredientName(revealed.id)}...`
  }

  // Level 30-49: all ingredients revealed, no quantities
  if (chefLevel < 50) {
    return recipe.ingredients.map((i) => getIngredientName(i.id)).join(' + ')
  }

  // Level 50+: full recipe shown (ingredients + quantities)
  return recipe.ingredients.map((i) => `${i.qty}× ${getIngredientName(i.id)}`).join(', ')
}

/** Helper: human-readable ingredient name from item ID. */
function getIngredientName(id: string): string {
  const names: Record<string, string> = {
    wheat: 'Wheat', herbs: 'Herbs', apples: 'Apples', blossoms: 'Blossoms',
    clovers: 'Clovers', orchids: 'Orchids', star_bloom: 'Star Bloom',
    crystal_root: 'Crystal Root', void_blossom: 'Void Blossom',
    slime_gel: 'Slime Gel', goblin_tooth: 'Goblin Tooth', wolf_fang: 'Wolf Fang',
    orc_shard: 'Orc Shard', troll_hide: 'Troll Hide', dragon_scale: 'Dragon Scale',
    golden_wheat: 'Golden Wheat', moonberries: 'Moonberries',
    crystal_lotus: 'Crystal Lotus', prismatic_bloom: 'Prismatic Bloom',
  }
  return names[id] ?? id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
