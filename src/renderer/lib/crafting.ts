import type { LootItemDef, LootRarity } from './loot'

// ── Intermediate materials (crafted from raw drops, used in final recipes) ────

export const CRAFT_INTERMEDIATE_ITEMS: LootItemDef[] = [
  {
    id: 'compost',
    name: 'Compost',
    slot: 'material',
    rarity: 'common',
    icon: '🧪',
    description: 'Organic fertiliser. Apply to a farm plot for +20% yield and +5% farmer XP.',
    perkType: 'cosmetic', perkValue: 0, perkDescription: 'Farm consumable — +20% yield, +5% XP',
  },
  {
    id: 'iron_bar',
    name: 'Iron Bar',
    slot: 'material',
    rarity: 'common',
    icon: '⬛',
    description: 'Smelted iron. Used to forge equipment.',
    perkType: 'cosmetic', perkValue: 0, perkDescription: 'Intermediate crafting material',
  },
  {
    id: 'fang_shard',
    name: 'Fang Shard',
    slot: 'material',
    rarity: 'common',
    icon: '🦴',
    description: 'Ground monster fangs. Used in blade crafting.',
    perkType: 'cosmetic', perkValue: 0, perkDescription: 'Intermediate crafting material',
  },
  {
    id: 'essence_vial',
    name: 'Essence Vial',
    slot: 'material',
    rarity: 'rare',
    icon: '🧪',
    description: 'Concentrated magic essence. Used in enchanting.',
    perkType: 'cosmetic', perkValue: 0, perkDescription: 'Intermediate crafting material',
  },
  {
    id: 'ancient_dust',
    name: 'Ancient Dust',
    slot: 'material',
    rarity: 'rare',
    icon: '💨',
    description: 'Ground ancient scales. Used in robe weaving.',
    perkType: 'cosmetic', perkValue: 0, perkDescription: 'Intermediate crafting material',
  },
  {
    id: 'void_fragment',
    name: 'Void Fragment',
    slot: 'material',
    rarity: 'epic',
    icon: '💠',
    description: 'Refined void crystal shard. Used in void-forged weapons.',
    perkType: 'cosmetic', perkValue: 0, perkDescription: 'Intermediate crafting material',
  },
  {
    id: 'dungeon_pass',
    name: 'Dungeon Pass',
    slot: 'material',
    rarity: 'rare',
    icon: '🎫',
    description: 'Instantly completes one dungeon run. Consume on auto-farm.',
    perkType: 'cosmetic', perkValue: 0, perkDescription: 'Consumable — auto-runs one dungeon',
  },
  {
    id: 'death_insurance',
    name: 'Death Insurance',
    slot: 'material',
    rarity: 'rare',
    icon: '📜',
    description: 'A protective ward. Auto-consumed on arena death to prevent item loss.',
    perkType: 'cosmetic', perkValue: 0, perkDescription: 'Consumable — prevents item loss on death',
  },
]

// ── Craftable output items ────────────────────────────────────────────────────

export const CRAFT_LOOT_ITEMS: LootItemDef[] = [
  {
    id: 'craft_iron_helm',
    name: 'Iron Helm',
    slot: 'head',
    rarity: 'common',
    icon: '⛑️',
    description: 'A sturdy helm forged from iron bars.',
    perkType: 'atk_boost',
    perkValue: 2,
    perkDescription: '+2 ATK',
  },
  {
    id: 'craft_fang_dagger',
    name: 'Fang Dagger',
    slot: 'weapon',
    rarity: 'common',
    icon: '🗡️',
    description: 'A blade carved from refined fang shards.',
    perkType: 'atk_boost',
    perkValue: 3,
    perkDescription: '+3 ATK',
  },
  {
    id: 'craft_essence_ring',
    name: 'Essence Ring',
    slot: 'ring',
    rarity: 'rare',
    icon: '💍',
    description: 'A ring imbued with concentrated magic essence.',
    perkType: 'xp_skill_boost',
    perkValue: 1.08,
    perkDescription: '+8% XP to all skills',
  },
  {
    id: 'craft_scale_robe',
    name: 'Scale Robe',
    slot: 'body',
    rarity: 'rare',
    icon: '🥋',
    description: 'A robe woven from ancient dust.',
    perkType: 'hp_boost',
    perkValue: 20,
    perkDescription: '+20 HP · +2 DEF',
    perks: [
      { perkType: 'hp_boost', perkValue: 20, perkDescription: '+20 HP' },
      { perkType: 'def_boost', perkValue: 2, perkDescription: '+2 DEF' },
    ],
  },
  {
    id: 'craft_void_blade',
    name: 'Void Blade',
    slot: 'weapon',
    rarity: 'epic',
    icon: '⚔️',
    description: 'A weapon forged from void fragments — devastates arena bosses.',
    perkType: 'atk_boost',
    perkValue: 12,
    perkDescription: '+12 ATK',
  },

  // ── Zone-drop crafted gear (use arena mob materials) ────────────────────────
  {
    id: 'craft_slime_shield',
    name: 'Slime Shield',
    slot: 'body',
    rarity: 'common',
    icon: '🛡️',
    description: 'A rubbery shield coated in hardened slime gel.',
    perkType: 'hp_boost',
    perkValue: 8,
    perks: [
      { perkType: 'hp_boost', perkValue: 8, perkDescription: '+8 HP' },
      { perkType: 'def_boost', perkValue: 1, perkDescription: '+1 DEF' },
    ],
    perkDescription: '+8 HP',
  },
  {
    id: 'craft_goblin_blade',
    name: 'Goblin Blade',
    slot: 'weapon',
    rarity: 'common',
    icon: '🔪',
    description: 'A crude but effective weapon studded with goblin teeth.',
    perkType: 'atk_boost',
    perkValue: 4,
    perkDescription: '+4 ATK',
  },
  {
    id: 'craft_wolf_pendant',
    name: 'Wolf Fang Pendant',
    slot: 'ring',
    rarity: 'rare',
    icon: '🐺',
    description: 'A pendant strung with wolf fangs — pulses with primal energy.',
    perkType: 'hp_regen_boost',
    perkValue: 3,
    perkDescription: '+3 HP Regen/s',
  },
  {
    id: 'craft_orc_plate',
    name: 'Orc Plate',
    slot: 'body',
    rarity: 'rare',
    icon: '🪨',
    description: 'Heavy armor forged from orc shards and fang bindings.',
    perkType: 'hp_boost',
    perkValue: 15,
    perkDescription: '+15 HP · +3 ATK · +2 DEF',
    perks: [
      { perkType: 'hp_boost', perkValue: 15, perkDescription: '+15 HP' },
      { perkType: 'atk_boost', perkValue: 3, perkDescription: '+3 ATK' },
      { perkType: 'def_boost', perkValue: 2, perkDescription: '+2 DEF' },
    ],
  },
  {
    id: 'craft_troll_cloak',
    name: 'Troll Cloak',
    slot: 'body',
    rarity: 'epic',
    icon: '🧌',
    description: 'A thick cloak of troll hide — regenerates the wearer.',
    perkType: 'hp_boost',
    perkValue: 25,
    perkDescription: '+25 HP · +5 HP Regen/s · +4 DEF',
    perks: [
      { perkType: 'hp_boost', perkValue: 25, perkDescription: '+25 HP' },
      { perkType: 'hp_regen_boost', perkValue: 5, perkDescription: '+5 HP Regen/s' },
      { perkType: 'def_boost', perkValue: 4, perkDescription: '+4 DEF' },
    ],
  },
  {
    id: 'craft_dragon_crown',
    name: 'Dragon Crown',
    slot: 'head',
    rarity: 'legendary',
    icon: '👑',
    description: 'A crown forged from dragon scales — radiates ancient power.',
    perkType: 'atk_boost',
    perkValue: 8,
    perkDescription: '+8 ATK · +30 HP',
    perks: [
      { perkType: 'atk_boost', perkValue: 8, perkDescription: '+8 ATK' },
      { perkType: 'hp_boost', perkValue: 30, perkDescription: '+30 HP' },
    ],
  },

  // ── Zone 7 — Lich Set (Legendary, Shadow Crypt) ─────────────────────────────
  // Full set: +83 ATK, +380 HP, +13 HP Regen, +8 DEF — meets zone 7 requirements
  {
    id: 'craft_lich_helm',
    name: 'Lich Helm',
    slot: 'head',
    rarity: 'legendary',
    icon: '💀',
    description: 'A helm carved from lich bone, imbued with necrotic energy.',
    perkType: 'atk_boost',
    perkValue: 18,
    perkDescription: '+18 ATK · +60 HP · +8% XP',
    perks: [
      { perkType: 'atk_boost', perkValue: 18, perkDescription: '+18 ATK' },
      { perkType: 'hp_boost', perkValue: 60, perkDescription: '+60 HP' },
      { perkType: 'xp_global_boost', perkValue: 0.08, perkDescription: '+8% Global XP' },
    ],
  },
  {
    id: 'craft_lich_plate',
    name: 'Lich Plate',
    slot: 'body',
    rarity: 'legendary',
    icon: '🛡️',
    description: 'Shadow-forged plate that drinks incoming damage.',
    perkType: 'hp_boost',
    perkValue: 150,
    perkDescription: '+150 HP · +10 ATK · +8 DEF',
    perks: [
      { perkType: 'hp_boost', perkValue: 150, perkDescription: '+150 HP' },
      { perkType: 'atk_boost', perkValue: 10, perkDescription: '+10 ATK' },
      { perkType: 'def_boost', perkValue: 8, perkDescription: '+8 DEF' },
    ],
  },
  {
    id: 'craft_lich_sword',
    name: 'Lich Blade',
    slot: 'weapon',
    rarity: 'legendary',
    icon: '⚔️',
    description: 'A sword of crystallized necromantic energy — drains life on hit.',
    perkType: 'atk_boost',
    perkValue: 22,
    perkDescription: '+22 ATK · +6 HP Regen/s',
    perks: [
      { perkType: 'atk_boost', perkValue: 22, perkDescription: '+22 ATK' },
      { perkType: 'hp_regen_boost', perkValue: 6, perkDescription: '+6 HP Regen/s' },
    ],
  },
  {
    id: 'craft_lich_legs',
    name: 'Lich Greaves',
    slot: 'legs',
    rarity: 'legendary',
    icon: '🦿',
    description: 'Greaves inscribed with death runes — light as shadow.',
    perkType: 'atk_boost',
    perkValue: 16,
    perkDescription: '+16 ATK · +70 HP',
    perks: [
      { perkType: 'atk_boost', perkValue: 16, perkDescription: '+16 ATK' },
      { perkType: 'hp_boost', perkValue: 70, perkDescription: '+70 HP' },
    ],
  },
  {
    id: 'craft_lich_ring',
    name: 'Lich Sigil Ring',
    slot: 'ring',
    rarity: 'legendary',
    icon: '💎',
    description: 'A ring bearing the Necromancer Lord\'s sigil — pulses with dark vitality.',
    perkType: 'atk_boost',
    perkValue: 12,
    perkDescription: '+12 ATK · +7 HP Regen/s',
    perks: [
      { perkType: 'atk_boost', perkValue: 12, perkDescription: '+12 ATK' },
      { perkType: 'hp_regen_boost', perkValue: 7, perkDescription: '+7 HP Regen/s' },
    ],
  },

  // ── Zone 8 — Titan Set (Mythic, Celestial Spire) ─────────────────────────────
  // Full set: +107 ATK, +500 HP, +18 HP Regen, +15 DEF — meets zone 8 requirements
  {
    id: 'craft_titan_helm',
    name: 'Titan Helm',
    slot: 'head',
    rarity: 'mythic',
    icon: '⚡',
    description: 'Forged from a Titan Core — channels the power of storms.',
    perkType: 'atk_boost',
    perkValue: 24,
    perkDescription: '+24 ATK · +100 HP · +8% XP',
    perks: [
      { perkType: 'atk_boost', perkValue: 24, perkDescription: '+24 ATK' },
      { perkType: 'hp_boost', perkValue: 100, perkDescription: '+100 HP' },
      { perkType: 'xp_global_boost', perkValue: 0.08, perkDescription: '+8% Global XP' },
    ],
  },
  {
    id: 'craft_titan_plate',
    name: 'Titan Plate',
    slot: 'body',
    rarity: 'mythic',
    icon: '🌩️',
    description: 'Storm-hardened plate that nullifies the strongest blows.',
    perkType: 'hp_boost',
    perkValue: 200,
    perkDescription: '+200 HP · +14 ATK · +15 DEF · Streak Shield',
    perks: [
      { perkType: 'hp_boost', perkValue: 200, perkDescription: '+200 HP' },
      { perkType: 'atk_boost', perkValue: 14, perkDescription: '+14 ATK' },
      { perkType: 'def_boost', perkValue: 15, perkDescription: '+15 DEF' },
      { perkType: 'streak_shield', perkValue: 1, perkDescription: 'Streak Shield' },
    ],
  },
  {
    id: 'craft_titan_sword',
    name: 'Storm Titan Blade',
    slot: 'weapon',
    rarity: 'mythic',
    icon: '⚡',
    description: 'Lightning crystallized into a blade — the sky screams when it swings.',
    perkType: 'atk_boost',
    perkValue: 28,
    perkDescription: '+28 ATK · +8 HP Regen/s',
    perks: [
      { perkType: 'atk_boost', perkValue: 28, perkDescription: '+28 ATK' },
      { perkType: 'hp_regen_boost', perkValue: 8, perkDescription: '+8 HP Regen/s' },
    ],
  },
  {
    id: 'craft_titan_legs',
    name: 'Titan Greaves',
    slot: 'legs',
    rarity: 'mythic',
    icon: '🦿',
    description: 'Greaves charged with celestial static — each step crackles.',
    perkType: 'atk_boost',
    perkValue: 20,
    perkDescription: '+20 ATK · +100 HP',
    perks: [
      { perkType: 'atk_boost', perkValue: 20, perkDescription: '+20 ATK' },
      { perkType: 'hp_boost', perkValue: 100, perkDescription: '+100 HP' },
    ],
  },
  {
    id: 'craft_titan_ring',
    name: 'Titan Core Ring',
    slot: 'ring',
    rarity: 'mythic',
    icon: '🔮',
    description: 'A ring housing a shard of the Storm Titan\'s core — radiates limitless energy.',
    perkType: 'atk_boost',
    perkValue: 16,
    perkDescription: '+16 ATK · +10 HP Regen/s · +8% XP',
    perks: [
      { perkType: 'atk_boost', perkValue: 16, perkDescription: '+16 ATK' },
      { perkType: 'hp_regen_boost', perkValue: 10, perkDescription: '+10 HP Regen/s' },
      { perkType: 'xp_global_boost', perkValue: 0.08, perkDescription: '+8% Global XP' },
    ],
  },

  // ── Mythic boss-material gear ───────────────────────────────────────────────
  {
    id: 'craft_warlord_gauntlets',
    name: 'Warlord Gauntlets',
    slot: 'ring',
    rarity: 'epic',
    icon: '🔱',
    description: 'Gauntlets infused with the Warlord\'s sigil — devastating strikes.',
    perkType: 'atk_boost',
    perkValue: 6,
    perkDescription: '+6 ATK · +10 HP',
    perks: [
      { perkType: 'atk_boost', perkValue: 6, perkDescription: '+6 ATK' },
      { perkType: 'hp_boost', perkValue: 10, perkDescription: '+10 HP' },
    ],
  },
  {
    id: 'craft_troll_aegis',
    name: 'Troll Aegis',
    slot: 'body',
    rarity: 'legendary',
    icon: '💜',
    description: 'Armor fueled by a troll heart — regenerates endlessly.',
    perkType: 'hp_boost',
    perkValue: 40,
    perkDescription: '+40 HP · +8 HP Regen/s · +6 DEF',
    perks: [
      { perkType: 'hp_boost', perkValue: 40, perkDescription: '+40 HP' },
      { perkType: 'hp_regen_boost', perkValue: 8, perkDescription: '+8 HP Regen/s' },
      { perkType: 'def_boost', perkValue: 6, perkDescription: '+6 DEF' },
    ],
  },
  {
    id: 'craft_dragonfire_blade',
    name: 'Dragonfire Blade',
    slot: 'weapon',
    rarity: 'mythic',
    icon: '🔥',
    description: 'Forged in dragonfire — the ultimate weapon.',
    perkType: 'atk_boost',
    perkValue: 20,
    perkDescription: '+20 ATK · +15 HP · +5 HP Regen/s',
    perks: [
      { perkType: 'atk_boost', perkValue: 20, perkDescription: '+20 ATK' },
      { perkType: 'hp_boost', perkValue: 15, perkDescription: '+15 HP' },
      { perkType: 'hp_regen_boost', perkValue: 5, perkDescription: '+5 HP Regen/s' },
    ],
  },
]

export const CRAFT_ITEM_MAP: Record<string, LootItemDef> = Object.fromEntries(
  [...CRAFT_INTERMEDIATE_ITEMS, ...CRAFT_LOOT_ITEMS].map((i) => [i.id, i]),
)


// ── Crafter level perks ───────────────────────────────────────────────────────

/** Craft time multiplier by crafter level (lower = faster). */
export function getCrafterSpeedMultiplier(level: number): number {
  if (level >= 80) return 0.40  // −60% time
  if (level >= 60) return 0.55  // −45% time
  if (level >= 40) return 0.70  // −30% time
  if (level >= 25) return 0.80  // −20% time
  if (level >= 10) return 0.90  // −10% time
  return 1.0
}

/** Chance per crafted item to produce double output (bonus roll). */
export function getCrafterDoubleChance(level: number): number {
  if (level >= 60) return 0.45  // 45%
  if (level >= 25) return 0.15  // 15%
  return 0
}

// ── Recipes ───────────────────────────────────────────────────────────────────

export interface CraftIngredient {
  id: string    // inventory item id (raw material, intermediate, or plant)
  qty: number
}

export interface CraftRecipe {
  id: string
  outputItemId: string
  outputQty: number
  ingredients: CraftIngredient[]
  /** Crafter skill level required. */
  levelRequired: number
  /** Base XP awarded per crafted item (before level perks). */
  xpPerItem: number
  /** Base real-world seconds to craft one item (before level speed perk). */
  secPerItem: number
  /** Gold cost per craft (optional — advanced recipes only). */
  goldCost?: number
  /** Whether this is an intermediate refining step (vs. a final equippable item). */
  isIntermediate?: boolean
}

export const CRAFT_RECIPES: CraftRecipe[] = [
  // ── Farm consumable ────────────────────────────────────────────────────────
  {
    id: 'recipe_compost',
    outputItemId: 'compost',
    outputQty: 3,
    isIntermediate: true,
    ingredients: [{ id: 'wheat', qty: 5 }, { id: 'herbs', qty: 3 }],
    levelRequired: 0,
    xpPerItem: 60,
    secPerItem: 6,
  },
  {
    id: 'recipe_dungeon_pass',
    outputItemId: 'dungeon_pass',
    outputQty: 1,
    isIntermediate: true,
    ingredients: [{ id: 'wheat', qty: 5 }, { id: 'herbs', qty: 3 }],
    levelRequired: 5,
    xpPerItem: 80,
    secPerItem: 15,
  },
  {
    id: 'recipe_death_insurance',
    outputItemId: 'death_insurance',
    outputQty: 1,
    isIntermediate: true,
    ingredients: [{ id: 'iron_bar', qty: 1 }, { id: 'magic_essence', qty: 2 }],
    levelRequired: 20,
    xpPerItem: 120,
    secPerItem: 60,
  },
  // ── Tier 1 — Refine raw materials into intermediate components ─────────────
  {
    id: 'recipe_iron_bar',
    outputItemId: 'iron_bar',
    outputQty: 1,
    isIntermediate: true,
    ingredients: [{ id: 'ore_iron', qty: 5 }],
    levelRequired: 0,
    xpPerItem: 90,
    secPerItem: 8,
  },
  {
    id: 'recipe_fang_shard',
    outputItemId: 'fang_shard',
    outputQty: 1,
    isIntermediate: true,
    ingredients: [{ id: 'monster_fang', qty: 3 }],
    levelRequired: 0,
    xpPerItem: 110,
    secPerItem: 10,
  },
  {
    id: 'recipe_essence_vial',
    outputItemId: 'essence_vial',
    outputQty: 1,
    isIntermediate: true,
    ingredients: [{ id: 'magic_essence', qty: 3 }],
    levelRequired: 15,
    xpPerItem: 40,
    secPerItem: 15,
  },
  {
    id: 'recipe_ancient_dust',
    outputItemId: 'ancient_dust',
    outputQty: 1,
    isIntermediate: true,
    ingredients: [{ id: 'ancient_scale', qty: 2 }],
    levelRequired: 30,
    xpPerItem: 70,
    secPerItem: 15,
  },
  {
    id: 'recipe_void_fragment',
    outputItemId: 'void_fragment',
    outputQty: 1,
    isIntermediate: true,
    ingredients: [{ id: 'void_crystal', qty: 2 }],
    levelRequired: 55,
    xpPerItem: 120,
    secPerItem: 20,
  },

  // ── Tier 2 — Craft gear from intermediates + farm plants ───────────────────
  {
    // Iron Bar × 2 + Wheat × 3 → Iron Helm
    id: 'recipe_iron_helm',
    outputItemId: 'craft_iron_helm',
    outputQty: 1,
    ingredients: [
      { id: 'iron_bar', qty: 2 },
      { id: 'wheat',    qty: 3 },
    ],
    levelRequired: 3,
    xpPerItem: 40,
    secPerItem: 20,
  },
  {
    // Fang Shard × 2 + Herbs × 3 → Fang Dagger
    id: 'recipe_fang_dagger',
    outputItemId: 'craft_fang_dagger',
    outputQty: 1,
    ingredients: [
      { id: 'fang_shard', qty: 2 },
      { id: 'herbs',      qty: 3 },
    ],
    levelRequired: 15,
    xpPerItem: 70,
    secPerItem: 60,
  },
  {
    // Essence Vial × 2 + Blossoms × 2 → Essence Ring
    id: 'recipe_essence_ring',
    outputItemId: 'craft_essence_ring',
    outputQty: 1,
    ingredients: [
      { id: 'essence_vial', qty: 2 },
      { id: 'blossoms',     qty: 2 },
    ],
    levelRequired: 30,
    xpPerItem: 130,
    secPerItem: 600,
    goldCost: 500,
  },
  {
    // Ancient Dust × 2 + Orchids × 2 → Scale Robe
    id: 'recipe_scale_robe',
    outputItemId: 'craft_scale_robe',
    outputQty: 1,
    ingredients: [
      { id: 'ancient_dust', qty: 2 },
      { id: 'orchids',      qty: 2 },
    ],
    levelRequired: 45,
    xpPerItem: 260,
    secPerItem: 1200,
    goldCost: 1500,
  },
  {
    // Void Fragment × 2 + Star Bloom × 2 → Void Blade
    id: 'recipe_void_blade',
    outputItemId: 'craft_void_blade',
    outputQty: 1,
    ingredients: [
      { id: 'void_fragment', qty: 2 },
      { id: 'star_bloom',    qty: 2 },
    ],
    levelRequired: 65,
    xpPerItem: 650,
    secPerItem: 2700,
    goldCost: 3000,
  },

  // ── Tier 3 — Zone-drop gear (arena mob materials + farm plants + intermediates)
  {
    // Slime Gel × 5 + Wheat × 3 → Slime Shield
    id: 'recipe_slime_shield',
    outputItemId: 'craft_slime_shield',
    outputQty: 1,
    ingredients: [
      { id: 'slime_gel', qty: 5 },
      { id: 'wheat',     qty: 3 },
    ],
    levelRequired: 0,
    xpPerItem: 25,
    secPerItem: 15,
  },
  {
    // Goblin Tooth × 4 + Herbs × 3 → Goblin Blade
    id: 'recipe_goblin_blade',
    outputItemId: 'craft_goblin_blade',
    outputQty: 1,
    ingredients: [
      { id: 'goblin_tooth', qty: 4 },
      { id: 'herbs',        qty: 3 },
    ],
    levelRequired: 5,
    xpPerItem: 50,
    secPerItem: 25,
  },
  {
    // Wolf Fang × 3 + Iron Bar × 1 + Blossoms × 2 → Wolf Fang Pendant
    id: 'recipe_wolf_pendant',
    outputItemId: 'craft_wolf_pendant',
    outputQty: 1,
    ingredients: [
      { id: 'wolf_fang', qty: 3 },
      { id: 'iron_bar',  qty: 1 },
      { id: 'blossoms',  qty: 2 },
    ],
    levelRequired: 15,
    xpPerItem: 100,
    secPerItem: 300,
    goldCost: 300,
  },
  {
    // Orc Shard × 3 + Fang Shard × 2 + Orchids × 2 → Orc Plate
    id: 'recipe_orc_plate',
    outputItemId: 'craft_orc_plate',
    outputQty: 1,
    ingredients: [
      { id: 'orc_shard',   qty: 3 },
      { id: 'fang_shard',  qty: 2 },
      { id: 'orchids',     qty: 2 },
    ],
    levelRequired: 25,
    xpPerItem: 200,
    secPerItem: 600,
    goldCost: 800,
  },
  {
    // Troll Hide × 3 + Essence Vial × 1 + Orchids × 2 → Troll Cloak
    id: 'recipe_troll_cloak',
    outputItemId: 'craft_troll_cloak',
    outputQty: 1,
    ingredients: [
      { id: 'troll_hide',   qty: 3 },
      { id: 'essence_vial', qty: 1 },
      { id: 'orchids',      qty: 2 },
    ],
    levelRequired: 50,
    xpPerItem: 400,
    secPerItem: 1800,
    goldCost: 2000,
  },
  {
    // Dragon Scale × 3 + Void Fragment × 1 + Star Bloom × 2 → Dragon Crown
    id: 'recipe_dragon_crown',
    outputItemId: 'craft_dragon_crown',
    outputQty: 1,
    ingredients: [
      { id: 'dragon_scale',  qty: 3 },
      { id: 'void_fragment', qty: 1 },
      { id: 'star_bloom',    qty: 2 },
    ],
    levelRequired: 70,
    xpPerItem: 850,
    secPerItem: 3600,
    goldCost: 5000,
  },

  // ── Tier 5 — Zone 7 Lich Set (shadow_dust + lich_crystal) ───────────────────
  {
    // Shadow Dust × 3 + Lich Crystal × 1 + Void Crystal × 2 → Lich Helm
    id: 'recipe_lich_helm',
    outputItemId: 'craft_lich_helm',
    outputQty: 1,
    ingredients: [
      { id: 'shadow_dust',  qty: 3 },
      { id: 'lich_crystal', qty: 1 },
      { id: 'void_crystal', qty: 2 },
    ],
    levelRequired: 70,
    xpPerItem: 1000,
    secPerItem: 2700,
    goldCost: 5000,
  },
  {
    // Shadow Dust × 5 + Lich Crystal × 2 + Orchids × 3 → Lich Plate
    id: 'recipe_lich_plate',
    outputItemId: 'craft_lich_plate',
    outputQty: 1,
    ingredients: [
      { id: 'shadow_dust',  qty: 5 },
      { id: 'lich_crystal', qty: 2 },
      { id: 'orchids',      qty: 3 },
    ],
    levelRequired: 80,
    xpPerItem: 1200,
    secPerItem: 4500,
    goldCost: 8000,
  },
  {
    // Shadow Dust × 4 + Lich Crystal × 1 + Void Fragment × 2 → Lich Blade
    id: 'recipe_lich_sword',
    outputItemId: 'craft_lich_sword',
    outputQty: 1,
    ingredients: [
      { id: 'shadow_dust',   qty: 4 },
      { id: 'lich_crystal',  qty: 1 },
      { id: 'void_fragment', qty: 2 },
    ],
    levelRequired: 75,
    xpPerItem: 1100,
    secPerItem: 3600,
    goldCost: 6000,
  },
  {
    // Shadow Dust × 3 + Lich Crystal × 1 + Star Bloom × 2 → Lich Greaves
    id: 'recipe_lich_legs',
    outputItemId: 'craft_lich_legs',
    outputQty: 1,
    ingredients: [
      { id: 'shadow_dust',  qty: 3 },
      { id: 'lich_crystal', qty: 1 },
      { id: 'star_bloom',   qty: 2 },
    ],
    levelRequired: 72,
    xpPerItem: 900,
    secPerItem: 2400,
    goldCost: 4000,
  },
  {
    // Shadow Dust × 2 + Lich Crystal × 1 → Lich Sigil Ring
    id: 'recipe_lich_ring',
    outputItemId: 'craft_lich_ring',
    outputQty: 1,
    ingredients: [
      { id: 'shadow_dust',  qty: 2 },
      { id: 'lich_crystal', qty: 1 },
    ],
    levelRequired: 68,
    xpPerItem: 800,
    secPerItem: 1800,
    goldCost: 3000,
  },

  // ── Tier 6 — Zone 8 Titan Set (storm_shard + titan_core) ─────────────────────
  {
    // Storm Shard × 3 + Titan Core × 1 + Lich Crystal × 2 → Titan Helm
    id: 'recipe_titan_helm',
    outputItemId: 'craft_titan_helm',
    outputQty: 1,
    ingredients: [
      { id: 'storm_shard',  qty: 3 },
      { id: 'titan_core',   qty: 1 },
      { id: 'lich_crystal', qty: 2 },
    ],
    levelRequired: 85,
    xpPerItem: 2000,
    secPerItem: 5400,
    goldCost: 12000,
  },
  {
    // Storm Shard × 5 + Titan Core × 2 + Orchids × 3 → Titan Plate
    id: 'recipe_titan_plate',
    outputItemId: 'craft_titan_plate',
    outputQty: 1,
    ingredients: [
      { id: 'storm_shard', qty: 5 },
      { id: 'titan_core',  qty: 2 },
      { id: 'orchids',     qty: 3 },
    ],
    levelRequired: 90,
    xpPerItem: 2500,
    secPerItem: 7200,
    goldCost: 18000,
  },
  {
    // Storm Shard × 4 + Titan Core × 1 + Shadow Dust × 4 → Storm Titan Blade
    id: 'recipe_titan_sword',
    outputItemId: 'craft_titan_sword',
    outputQty: 1,
    ingredients: [
      { id: 'storm_shard',  qty: 4 },
      { id: 'titan_core',   qty: 1 },
      { id: 'shadow_dust',  qty: 4 },
    ],
    levelRequired: 88,
    xpPerItem: 2200,
    secPerItem: 6000,
    goldCost: 15000,
  },
  {
    // Storm Shard × 3 + Titan Core × 1 + Star Bloom × 2 → Titan Greaves
    id: 'recipe_titan_legs',
    outputItemId: 'craft_titan_legs',
    outputQty: 1,
    ingredients: [
      { id: 'storm_shard', qty: 3 },
      { id: 'titan_core',  qty: 1 },
      { id: 'star_bloom',  qty: 2 },
    ],
    levelRequired: 85,
    xpPerItem: 1800,
    secPerItem: 4800,
    goldCost: 10000,
  },
  {
    // Storm Shard × 2 + Titan Core × 1 + Lich Crystal × 1 → Titan Core Ring
    id: 'recipe_titan_ring',
    outputItemId: 'craft_titan_ring',
    outputQty: 1,
    ingredients: [
      { id: 'storm_shard',  qty: 2 },
      { id: 'titan_core',   qty: 1 },
      { id: 'lich_crystal', qty: 1 },
    ],
    levelRequired: 82,
    xpPerItem: 1600,
    secPerItem: 4200,
    goldCost: 8000,
  },

  // ── Tier 4 — Boss-material gear (require boss-exclusive drops) ──────────────
  {
    // Warlord Sigil × 2 + Orc Shard × 5 + Clovers × 3 → Warlord Gauntlets
    id: 'recipe_warlord_gauntlets',
    outputItemId: 'craft_warlord_gauntlets',
    outputQty: 1,
    ingredients: [
      { id: 'warlord_sigil', qty: 2 },
      { id: 'orc_shard',     qty: 5 },
      { id: 'clovers',       qty: 3 },
    ],
    levelRequired: 40,
    xpPerItem: 350,
    secPerItem: 1500,
    goldCost: 1500,
  },
  {
    // Troll Heart × 2 + Troll Hide × 5 + Ancient Dust × 2 + Crystal Root × 1 → Troll Aegis
    id: 'recipe_troll_aegis',
    outputItemId: 'craft_troll_aegis',
    outputQty: 1,
    ingredients: [
      { id: 'troll_heart',  qty: 2 },
      { id: 'troll_hide',   qty: 5 },
      { id: 'ancient_dust', qty: 2 },
      { id: 'crystal_root', qty: 1 },
    ],
    levelRequired: 60,
    xpPerItem: 700,
    secPerItem: 3000,
    goldCost: 4000,
  },
  {
    // Dragon Heart × 2 + Dragon Scale × 5 + Void Fragment × 2 + Star Bloom × 3 → Dragonfire Blade
    id: 'recipe_dragonfire_blade',
    outputItemId: 'craft_dragonfire_blade',
    outputQty: 1,
    ingredients: [
      { id: 'dragon_heart',  qty: 2 },
      { id: 'dragon_scale',  qty: 5 },
      { id: 'void_fragment', qty: 2 },
      { id: 'star_bloom',    qty: 3 },
    ],
    levelRequired: 80,
    xpPerItem: 1500,
    secPerItem: 5400,
    goldCost: 8000,
  },
]

export const CRAFT_RECIPE_MAP: Record<string, CraftRecipe> = Object.fromEntries(
  CRAFT_RECIPES.map((r) => [r.id, r]),
)

/** Returns true if player's inventory has enough items for `qty` of a recipe. */
export function canAffordRecipe(
  recipe: CraftRecipe,
  qty: number,
  items: Record<string, number>,
): boolean {
  return recipe.ingredients.every((ing) => (items[ing.id] ?? 0) >= ing.qty * qty)
}

/** Max number of times the recipe can be crafted with current inventory. */
export function maxAffordableQty(recipe: CraftRecipe, items: Record<string, number>): number {
  let max = Infinity
  for (const ing of recipe.ingredients) {
    const owned = items[ing.id] ?? 0
    max = Math.min(max, Math.floor(owned / ing.qty))
  }
  return max === Infinity ? 0 : max
}

/**
 * Total seconds to craft `qty` items, adjusted for crafter level speed perk.
 * Pass `crafterLevel` to apply the reduction; omit (0) for base time display.
 */
export function craftDuration(recipe: CraftRecipe, qty: number, crafterLevel = 0, grindlyCraftMult = 1): number {
  return Math.max(1, Math.round(recipe.secPerItem * getCrafterSpeedMultiplier(crafterLevel) * grindlyCraftMult)) * qty
}

/** Format seconds as "Xh Ym Zs". */
export function formatCraftTime(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`
}

// ── Session material drops ────────────────────────────────────────────────────

export interface SessionMaterialDrop { id: string; name: string; qty: number }

/** Activity category → primary crafting material affinity */
const CATEGORY_MATERIAL_AFFINITY: Record<string, string> = {
  coding:        'ore_iron',
  gaming:        'monster_fang',
  design:        'magic_essence',
  writing:       'ore_iron',
  reading:       'magic_essence',
  communication: 'monster_fang',
  research:      'magic_essence',
  music:         'ore_iron',
  other:         'ore_iron',
}

const MATERIAL_NAMES: Record<string, string> = {
  ore_iron:      'Iron Ore',
  monster_fang:  'Monster Fang',
  magic_essence: 'Magic Essence',
  ancient_scale: 'Ancient Scale',
  void_crystal:  'Void Crystal',
}

/**
 * Roll crafting material drops at session end.
 * topCategory: activity category string (e.g. 'coding', 'gaming').
 * durationHours: session length in hours.
 *
 * Thresholds:
 *   ≥ 0.5h (30min): 1× common material (80% chance)
 *   ≥ 1h:           2× common material (certain)
 *   ≥ 2h:           + 1× rare material (ancient_scale or magic_essence)
 *   ≥ 3h:           + 1× void_crystal (50% chance)
 */
export function rollSessionMaterialDrops(
  topCategory: string | null,
  durationHours: number,
  clearedZones: string[] = [],
): SessionMaterialDrop[] {
  if (durationHours < 0.5) return []

  const primaryId = CATEGORY_MATERIAL_AFFINITY[topCategory ?? 'other'] ?? 'ore_iron'
  const drops: SessionMaterialDrop[] = []

  if (durationHours >= 1.0) {
    drops.push({ id: primaryId, name: MATERIAL_NAMES[primaryId], qty: 2 })
  } else if (Math.random() < 0.8) {
    drops.push({ id: primaryId, name: MATERIAL_NAMES[primaryId], qty: 1 })
  }

  if (durationHours >= 2.0 && clearedZones.includes('zone3')) {
    const rareMat = Math.random() < 0.5 ? 'magic_essence' : 'ancient_scale'
    drops.push({ id: rareMat, name: MATERIAL_NAMES[rareMat], qty: 1 })
  }

  if (durationHours >= 3.0 && clearedZones.includes('zone5') && Math.random() < 0.50) {
    drops.push({ id: 'void_crystal', name: 'Void Crystal', qty: 1 })
  }

  return drops
}

// ── Re-exported for backward compat ──────────────────────────────────────────
export type { LootRarity }
