export type LootRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic'
export type LootSlot = 'head' | 'body' | 'legs' | 'ring' | 'weapon' | 'consumable' | 'plant' | 'material' | 'food'
export const LOOT_SLOTS: LootSlot[] = ['head', 'body', 'legs', 'ring', 'weapon']

export const POTION_IDS = ['atk_potion', 'hp_potion', 'regen_potion', 'def_potion'] as const
export const POTION_MAX = 50

/** Normalize equipped_loot from DB (handles JSON string, different key casing, null, legacy integer 0) */
export function normalizeEquippedLoot(raw: unknown): Partial<Record<LootSlot, string>> {
  if (raw == null) return {}
  if (typeof raw === 'number') return {}
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw) as unknown
    } catch {
      return {}
    }
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Partial<Record<LootSlot, string>> = {}
  for (const slot of LOOT_SLOTS) {
    const val = (raw as Record<string, unknown>)[slot] ?? (raw as Record<string, unknown>)[slot.charAt(0).toUpperCase() + slot.slice(1)]
    if (typeof val === 'string' && val.length > 0) out[slot] = val
  }
  return out
}

export type LootSource = 'skill_grind' | 'achievement_claim' | 'goal_complete' | 'daily_activity' | 'session_complete' | 'bounty_reward'

/** Human-readable labels for loot sources (shown in inventory, chest modals) */
export const LOOT_SOURCE_LABELS: Record<LootSource, string> = {
  skill_grind: 'Skill Grind',
  achievement_claim: 'Achievement',
  goal_complete: 'Goal Complete',
  daily_activity: 'Daily Activity',
  session_complete: 'Session Complete',
  bounty_reward: 'Daily Bounty',
}

/** Item Power score by rarity (100+). Higher rarity = higher IP. Used for leaderboard and item descriptions. */
export const ITEM_POWER_BY_RARITY: Record<string, number> = {
  common: 100,
  rare: 150,
  epic: 220,
  legendary: 320,
  mythic: 450,
}

/** Stat contribution to IP per perk type, given the numeric perk value. */
const PERK_IP: Partial<Record<string, (v: number) => number>> = {
  atk_boost:        v => v * 15,
  hp_boost:         v => v * 0.5,
  hp_regen_boost:   v => v * 25,
  def_boost:        v => v * 20,
  xp_skill_boost:   v => Math.max(0, v - 1) * 150,
  xp_global_boost:  v => Math.max(0, v - 1) * 300,
  chest_drop_boost: v => v * 800,
  focus_boost:      v => Math.max(0, v - 1) * 120,
  streak_shield:    () => 60,
  status_title:     () => 15,
  harvested_plant:  v => v * 0.3,
}

const SLOT_IP_MULT: Partial<Record<string, number>> = {
  weapon: 1.2,
  head: 1.1,
  body: 1.1,
}

/** Compute Item Power from the item's rarity, slot, and all perks. */
export function getItemPower(item: Pick<LootItemDef, 'rarity' | 'slot' | 'perkType' | 'perkValue' | 'perks'>): number {
  const base = ITEM_POWER_BY_RARITY[item.rarity] ?? 100
  const perks = item.perks?.length
    ? item.perks
    : [{ perkType: item.perkType, perkValue: item.perkValue }]
  const statPower = perks.reduce((sum, p) => {
    const v = typeof p.perkValue === 'number' ? p.perkValue : parseFloat(String(p.perkValue)) || 0
    const fn = PERK_IP[p.perkType]
    return sum + (fn ? fn(v) : 0)
  }, 0)
  const slotMult = SLOT_IP_MULT[item.slot] ?? 1.0
  return Math.round((base + statPower) * slotMult)
}

/** Gold drop range per chest type */
export const GOLD_BY_CHEST: Record<ChestType, { min: number; max: number }> = {
  common_chest: { min: 15, max: 30 },
  rare_chest: { min: 30, max: 75 },
  epic_chest: { min: 75, max: 150 },
  legendary_chest: { min: 150, max: 300 },
}

export function getChestGoldDrop(chestType: ChestType): number {
  const { min, max } = GOLD_BY_CHEST[chestType]
  return min + Math.floor(Math.random() * (max - min + 1))
}

/** Rarity colors and theme for UI (borders, text, etc.) */
export const RARITY_COLORS: Record<LootRarity, { color: string; border: string; glow: string; panel: string }> = {
  common: {
    color: '#9CA3AF',
    border: 'rgba(156, 163, 175, 0.35)',
    glow: 'rgba(156, 163, 175, 0.22)',
    panel: 'radial-gradient(circle at 50% 18%, rgba(156,163,175,0.16) 0%, rgba(17,24,39,0.96) 62%)',
  },
  rare: {
    color: '#38BDF8',
    border: 'rgba(56, 189, 248, 0.45)',
    glow: 'rgba(56, 189, 248, 0.3)',
    panel: 'radial-gradient(circle at 50% 18%, rgba(56,189,248,0.18) 0%, rgba(17,24,39,0.96) 62%)',
  },
  epic: {
    color: '#C084FC',
    border: 'rgba(192, 132, 252, 0.45)',
    glow: 'rgba(192, 132, 252, 0.3)',
    panel: 'radial-gradient(circle at 50% 18%, rgba(192,132,252,0.18) 0%, rgba(17,24,39,0.96) 62%)',
  },
  legendary: {
    color: '#FACC15',
    border: 'rgba(250, 204, 21, 0.45)',
    glow: 'rgba(250, 204, 21, 0.3)',
    panel: 'radial-gradient(circle at 50% 18%, rgba(250,204,21,0.18) 0%, rgba(17,24,39,0.96) 62%)',
  },
  mythic: {
    color: '#F472B6',
    border: 'rgba(244, 114, 182, 0.5)',
    glow: 'rgba(244, 114, 182, 0.35)',
    panel: 'radial-gradient(circle at 50% 18%, rgba(244,114,182,0.2) 0%, rgba(17,24,39,0.96) 62%)',
  },
}

export function getRarityTheme(rarity: LootRarity | string) {
  return RARITY_COLORS[rarity as LootRarity] ?? RARITY_COLORS.common
}

/** Item IDs that cannot be listed or shown on the marketplace */
export const MARKETPLACE_BLOCKED_ITEMS: string[] = ['atk_potion', 'hp_potion', 'regen_potion', 'def_potion', 'death_insurance']

let _validIdCache: Set<string> | null = null
/** Returns true if the item ID corresponds to a real in-game item (gear, seed, chest, material, etc.) */
export function isValidItemId(itemId: string): boolean {
  if (!_validIdCache) {
    _validIdCache = new Set(LOOT_ITEMS.map((i) => i.id))
    for (const id of ['wheat_seed', 'herb_seed', 'apple_seed', 'blossom_seed', 'clover_seed', 'orchid_seed', 'starbloom_seed', 'crystal_seed', 'void_spore']) _validIdCache.add(id)
    for (const id of ['seed_zip_common', 'seed_zip_rare', 'seed_zip_epic', 'seed_zip_legendary']) _validIdCache.add(id)
    for (const id of ['common_chest', 'rare_chest', 'epic_chest', 'legendary_chest']) _validIdCache.add(id)
  }
  return _validIdCache.has(itemId)
}

export type LootPerkType =
  | 'cosmetic'
  | 'xp_skill_boost'
  | 'chest_drop_boost'
  | 'status_title'
  | 'xp_global_boost'
  | 'streak_shield'
  | 'focus_boost'
  | 'atk_boost'
  | 'hp_boost'
  | 'hp_regen_boost'
  | 'def_boost'
  | 'harvested_plant'
export type ChestType = 'common_chest' | 'rare_chest' | 'epic_chest' | 'legendary_chest'

export interface LootItemPerk {
  perkType: LootPerkType
  perkValue: number | string
  perkTarget?: string
  perkDescription: string
}

export interface LootItemDef {
  id: string
  name: string
  slot: LootSlot
  rarity: LootRarity
  icon: string
  image?: string
  renderScale?: number
  description: string
  perkType: LootPerkType
  perkValue: number | string
  perkTarget?: string
  perkDescription: string
  perks?: LootItemPerk[]
}

export interface LootPerkRuntime {
  skillXpMultiplierBySkill: Record<string, number>
  chestDropChanceBonusByCategory: Record<string, number>
  statusTitle: string | null
  globalXpMultiplier: number
  streakShield: boolean
  focusBoostMultiplier: number
}

export interface ChestDef {
  id: ChestType
  name: string
  icon: string
  image?: string
  rarity: LootRarity
  itemWeights: Array<{ itemId: string; weight: number }>
}

export interface LootDropContext {
  source: LootSource
  focusCategory?: string | null
}

export interface LootRollPity {
  rollsSinceRareChest: number
  rollsSinceEpicChest: number
  rollsSinceLegendaryChest: number
}

export interface ChestRollResult {
  chestType: ChestType
  estimatedDropRate: number
}

export interface BonusMaterial {
  itemId: string
  qty: number
}

export interface ChestOpenResult {
  item: LootItemDef | null
  estimatedDropRate: number
  bonusMaterials: BonusMaterial[]
}

// ─── Boss chest tier roll ────────────────────────────────────────────────────
const CHEST_TIER_ORDER: ChestType[] = ['common_chest', 'rare_chest', 'epic_chest', 'legendary_chest']

/** Roll which chest tier actually drops from a boss.
 *  55% listed tier, 30% one tier lower, 15% no chest at all. */
export function rollBossChestTier(baseTier: ChestType): ChestType | null {
  const roll = Math.random()
  if (roll < 0.55) return baseTier                                         // 55% — listed tier
  if (roll < 0.85) {                                                        // 30% — one tier lower
    const idx = CHEST_TIER_ORDER.indexOf(baseTier)
    return idx > 0 ? CHEST_TIER_ORDER[idx - 1] : baseTier                  // common stays common
  }
  return null                                                               // 15% — no chest
}

/** Chance that a chest contains an equipment item (vs only gold/seeds/materials).
 *  Higher tier → higher chance. */
const ITEM_DROP_CHANCE: Record<ChestType, number> = {
  common_chest: 0.50,
  rare_chest: 0.60,
  epic_chest: 0.70,
  legendary_chest: 0.80,
}

import { CRAFT_LOOT_ITEMS, CRAFT_INTERMEDIATE_ITEMS } from './crafting'
import { FOOD_ITEMS } from './cooking'

/** Convert cooking food items to LootItemDef so they show in inventory & marketplace */
const FOOD_LOOT_ITEMS: LootItemDef[] = FOOD_ITEMS.map((f) => ({
  id: f.id,
  name: f.name,
  slot: 'food' as LootSlot,
  rarity: f.rarity,
  icon: f.icon,
  description: f.description,
  perkType: 'cosmetic' as LootPerkType,
  perkValue: 0,
  perkDescription: f.description,
}))

export const LOOT_ITEMS: LootItemDef[] = [
  // Potions (consumable)
  {
    id: 'atk_potion',
    name: 'Attack Potion',
    slot: 'consumable',
    rarity: 'mythic',
    icon: '⚗️',
    description: 'A rare brew distilled from arena victories. Permanently increases attack power.',
    perkType: 'atk_boost',
    perkValue: 1,
    perkDescription: '+1 permanent ATK (max 50)',
  },
  {
    id: 'hp_potion',
    name: 'Vitality Potion',
    slot: 'consumable',
    rarity: 'mythic',
    icon: '💊',
    description: 'A rare elixir that permanently reinforces your max HP.',
    perkType: 'hp_boost',
    perkValue: 1,
    perkDescription: '+1 permanent HP (max 50)',
  },
  {
    id: 'regen_potion',
    name: 'Regen Potion',
    slot: 'consumable',
    rarity: 'mythic',
    icon: '💉',
    description: 'A rare formula that permanently boosts your HP regeneration.',
    perkType: 'hp_regen_boost',
    perkValue: 1,
    perkDescription: '+1 permanent HP Regen/s (max 50)',
  },
  {
    id: 'def_potion',
    name: 'Defense Potion',
    slot: 'consumable',
    rarity: 'mythic',
    icon: '🛡️',
    description: 'A rare elixir that permanently hardens your defenses.',
    perkType: 'def_boost',
    perkValue: 1,
    perkDescription: '+1 permanent DEF (max 50)',
  },

  // Harvested Plants (from Farm)
  { id: 'wheat',        name: 'Wheat',        slot: 'plant', rarity: 'common',    icon: '🌾', description: 'Golden wheat harvested from your farm.',          perkType: 'harvested_plant', perkValue: 0, perkDescription: 'Farm harvest. Sell on the Marketplace.' },
  { id: 'herbs',        name: 'Herbs',        slot: 'plant', rarity: 'common',    icon: '🌿', description: 'Fresh herbs harvested from your farm.',           perkType: 'harvested_plant', perkValue: 0, perkDescription: 'Farm harvest. Sell on the Marketplace.' },
  { id: 'apples',       name: 'Apples',       slot: 'plant', rarity: 'rare',      icon: '🍎', description: 'Crisp apples grown with care.',                  perkType: 'harvested_plant', perkValue: 0, perkDescription: 'Farm harvest. Sell on the Marketplace.' },
  { id: 'blossoms',     name: 'Blossoms',     slot: 'plant', rarity: 'rare',      icon: '🌸', description: 'Delicate blossoms from your garden.',            perkType: 'harvested_plant', perkValue: 0, perkDescription: 'Farm harvest. Sell on the Marketplace.' },
  { id: 'clovers',      name: 'Clovers',      slot: 'plant', rarity: 'epic',      icon: '🍀', description: 'Lucky four-leaf clovers, rare and prized.',      perkType: 'harvested_plant', perkValue: 0, perkDescription: 'Farm harvest. Sell on the Marketplace.' },
  { id: 'orchids',      name: 'Orchids',      slot: 'plant', rarity: 'epic',      icon: '🌺', description: 'Exotic orchids requiring patience to grow.',     perkType: 'harvested_plant', perkValue: 0, perkDescription: 'Farm harvest. Sell on the Marketplace.' },
  { id: 'star_bloom',   name: 'Star Bloom',   slot: 'plant', rarity: 'legendary', icon: '🌟', description: 'A radiant bloom said to hold cosmic energy.',    perkType: 'harvested_plant', perkValue: 0, perkDescription: 'Farm harvest. Sell on the Marketplace.' },
  { id: 'crystal_root', name: 'Crystal Root', slot: 'plant', rarity: 'legendary', icon: '💎', description: 'A crystalline root pulsing with energy.',        perkType: 'harvested_plant', perkValue: 0, perkDescription: 'Farm harvest. Sell on the Marketplace.' },
  { id: 'void_blossom', name: 'Void Blossom', slot: 'plant', rarity: 'mythic',   icon: '🔮', description: 'A flower from beyond — grown from a Void Spore.', perkType: 'harvested_plant', perkValue: 0, perkDescription: 'Farm harvest. Sell on the Marketplace.' },
  { id: 'wilted_plant', name: 'Wilted Plant', slot: 'plant', rarity: 'common',  icon: '🥀', description: 'A rotted crop. Can be composted or sold for scraps.', perkType: 'harvested_plant', perkValue: 0, perkDescription: 'Rotted crop salvage.' },

  // Arena materials (dropped by dungeon mobs & bosses, used in crafting)
  { id: 'slime_gel',    name: 'Slime Gel',    slot: 'material', rarity: 'common',    icon: '🫧', description: 'Dropped by slimes. Craft into Slime Shield.',       perkType: 'cosmetic', perkValue: 0, perkDescription: 'Crafting material — Slime Cavern' },
  { id: 'goblin_tooth', name: 'Goblin Tooth', slot: 'material', rarity: 'common',    icon: '🦷', description: 'Dropped by goblins. Craft into Goblin Blade.',     perkType: 'cosmetic', perkValue: 0, perkDescription: 'Crafting material — Goblin Outpost' },
  { id: 'wolf_fang',    name: 'Wolf Fang',    slot: 'material', rarity: 'rare',      icon: '🐺', description: 'Dropped by wolves. Craft into Wolf Fang Pendant.',  perkType: 'cosmetic', perkValue: 0, perkDescription: 'Crafting material — Wild Forest' },
  { id: 'orc_shard',    name: 'Orc Shard',    slot: 'material', rarity: 'rare',      icon: '🪨', description: 'Dropped by orcs. Craft into Orc Plate.',            perkType: 'cosmetic', perkValue: 0, perkDescription: 'Crafting material — Orc Stronghold' },
  { id: 'troll_hide',   name: 'Troll Hide',   slot: 'material', rarity: 'epic',      icon: '🧌', description: 'Dropped by trolls. Craft into Troll Cloak.',        perkType: 'cosmetic', perkValue: 0, perkDescription: 'Crafting material — Troll Bridge' },
  { id: 'dragon_scale', name: 'Dragon Scale', slot: 'material', rarity: 'legendary', icon: '🐉', description: 'Dropped by dragons. Craft into Dragon Crown.',      perkType: 'cosmetic', perkValue: 0, perkDescription: 'Crafting material — Dragon Lair' },

  // Boss-exclusive materials (guaranteed drop from specific bosses)
  { id: 'warlord_sigil', name: 'Warlord Sigil', slot: 'material', rarity: 'epic',      icon: '🔱', description: 'Torn from the Orc Warlord. Pulses with brutal energy.',   perkType: 'cosmetic', perkValue: 0, perkDescription: 'Boss material — Orc Warlord' },
  { id: 'troll_heart',   name: 'Troll Heart',   slot: 'material', rarity: 'legendary', icon: '💜', description: 'A still-beating heart ripped from the Troll Overlord.',    perkType: 'cosmetic', perkValue: 0, perkDescription: 'Boss material — Troll Overlord' },
  { id: 'dragon_heart',  name: 'Dragon Heart',  slot: 'material', rarity: 'legendary', icon: '❤️‍🔥', description: 'The blazing core of the Ancient Dragon. Immense power.', perkType: 'cosmetic', perkValue: 0, perkDescription: 'Boss material — Ancient Dragon' },
  { id: 'shadow_dust',   name: 'Shadow Dust',   slot: 'material', rarity: 'epic',      icon: '💜', description: 'Crystallized essence of shadow creatures.',                 perkType: 'cosmetic', perkValue: 0, perkDescription: 'Crafting material — Shadow Crypt' },
  { id: 'lich_crystal',  name: 'Lich Crystal',  slot: 'material', rarity: 'legendary', icon: '💎', description: 'A shard of pure necromantic energy, pulsing with dark magic.', perkType: 'cosmetic', perkValue: 0, perkDescription: 'Boss material — Necromancer Lord' },
  { id: 'storm_shard',   name: 'Storm Shard',   slot: 'material', rarity: 'epic',      icon: '⚡', description: 'Solidified lightning from celestial beings.',               perkType: 'cosmetic', perkValue: 0, perkDescription: 'Crafting material — Celestial Spire' },
  { id: 'titan_core',    name: 'Titan Core',    slot: 'material', rarity: 'mythic',    icon: '🔮', description: 'The crystallized heart of a Storm Titan.',                  perkType: 'cosmetic', perkValue: 0, perkDescription: 'Boss material — Storm Titan' },

  // Crafting materials — drop from chests/bosses, consumed by craft recipes
  { id: 'ore_iron',      name: 'Iron Ore',      slot: 'material', rarity: 'common',    icon: '🪨', description: 'Raw iron ore. Used in basic smithing recipes.',           perkType: 'cosmetic', perkValue: 0, perkDescription: 'Crafting material' },
  { id: 'monster_fang',  name: 'Monster Fang',  slot: 'material', rarity: 'common',    icon: '🦷', description: 'A sharp fang dropped by arena monsters.',                 perkType: 'cosmetic', perkValue: 0, perkDescription: 'Crafting material' },
  { id: 'magic_essence', name: 'Magic Essence', slot: 'material', rarity: 'rare',      icon: '💧', description: 'Distilled magical residue from powerful creatures.',       perkType: 'cosmetic', perkValue: 0, perkDescription: 'Crafting material' },
  { id: 'ancient_scale', name: 'Ancient Scale', slot: 'material', rarity: 'rare',      icon: '🐉', description: 'A scale shed by an ancient beast. Tough and magical.',    perkType: 'cosmetic', perkValue: 0, perkDescription: 'Crafting material' },
  { id: 'void_crystal',  name: 'Void Crystal',  slot: 'material', rarity: 'epic',      icon: '🔮', description: 'A crystallised fragment of the void. Immense power.',     perkType: 'cosmetic', perkValue: 0, perkDescription: 'Crafting material' },

  // ── Bag-drop gear (equippable items that drop directly from chests) ────────
  // Common — Wooden Set  (full set: +6 ATK, +15 HP, +1 Regen → player 11/115/1)
  { id: 'wooden_helm',    name: 'Wooden Helm',    slot: 'head',   rarity: 'common', icon: '🪖', description: 'A crude helm carved from hardwood.',               perkType: 'atk_boost',      perkValue: 2,  perkDescription: '+2 ATK' },
  { id: 'wooden_plate',   name: 'Wooden Plate',   slot: 'body',   rarity: 'common', icon: '🪵', description: 'Wooden planks strapped together as armor.',        perkType: 'hp_boost',       perkValue: 15, perkDescription: '+15 HP · +1 DEF',
    perks: [{ perkType: 'hp_boost', perkValue: 15, perkDescription: '+15 HP' }, { perkType: 'def_boost', perkValue: 1, perkDescription: '+1 DEF' }] },
  { id: 'wooden_sword',   name: 'Wooden Sword',   slot: 'weapon', rarity: 'common', icon: '🗡️', description: 'A practice sword. Splinters on contact.',         perkType: 'atk_boost',      perkValue: 3,  perkDescription: '+3 ATK' },
  { id: 'wooden_legs',    name: 'Wooden Legs',    slot: 'legs',   rarity: 'common', icon: '🦿', description: 'Wooden shin guards. Better than bare legs.',       perkType: 'atk_boost',      perkValue: 1,  perkDescription: '+1 ATK' },
  { id: 'wooden_ring',    name: 'Wooden Ring',    slot: 'ring',   rarity: 'common', icon: '📿', description: 'A whittled ring with faint natural energy.',       perkType: 'hp_regen_boost', perkValue: 1,  perkDescription: '+1 HP Regen' },
  // Rare — Copper Set  (full set: +13 ATK, +55 HP, +2 Regen → player 18/155/2)
  { id: 'copper_helm',    name: 'Copper Helm',    slot: 'head',   rarity: 'rare',   icon: '⛑️', description: 'A polished copper helm. Deflects glancing blows.', perkType: 'atk_boost', perkValue: 4, perkDescription: '+4 ATK',
    perks: [{ perkType: 'atk_boost', perkValue: 4, perkDescription: '+4 ATK' }, { perkType: 'hp_boost', perkValue: 10, perkDescription: '+10 HP' }] },
  { id: 'copper_plate',   name: 'Copper Plate',   slot: 'body',   rarity: 'rare',   icon: '🛡️', description: 'Hammered copper chestplate. Solid protection.',   perkType: 'hp_boost',       perkValue: 35, perkDescription: '+35 HP · +2 DEF',
    perks: [{ perkType: 'hp_boost', perkValue: 35, perkDescription: '+35 HP' }, { perkType: 'def_boost', perkValue: 2, perkDescription: '+2 DEF' }] },
  { id: 'copper_sword',   name: 'Copper Sword',   slot: 'weapon', rarity: 'rare',   icon: '⚔️', description: 'A copper blade with a keen edge.',                perkType: 'atk_boost',      perkValue: 6,  perkDescription: '+6 ATK' },
  { id: 'copper_legs',    name: 'Copper Legs',    slot: 'legs',   rarity: 'rare',   icon: '🦿', description: 'Copper greaves forged for agility.',               perkType: 'atk_boost', perkValue: 3, perkDescription: '+3 ATK',
    perks: [{ perkType: 'atk_boost', perkValue: 3, perkDescription: '+3 ATK' }, { perkType: 'hp_boost', perkValue: 10, perkDescription: '+10 HP' }] },
  { id: 'copper_ring',    name: 'Copper Ring',    slot: 'ring',   rarity: 'rare',   icon: '💍', description: 'A copper band humming with warmth.',               perkType: 'hp_regen_boost', perkValue: 2,  perkDescription: '+2 HP Regen' },
  // Epic — Shadow Set  (full set: +29 ATK, +105 HP, +5 Regen → player 34/205/5)
  { id: 'shadow_helm',    name: 'Shadow Helm',    slot: 'head',   rarity: 'epic',   icon: '🪖', description: 'A helm wreathed in living shadow.',                perkType: 'atk_boost', perkValue: 7, perkDescription: '+7 ATK',
    perks: [{ perkType: 'atk_boost', perkValue: 7, perkDescription: '+7 ATK' }, { perkType: 'hp_boost', perkValue: 20, perkDescription: '+20 HP' }] },
  { id: 'shadow_plate',   name: 'Shadow Plate',   slot: 'body',   rarity: 'epic',   icon: '🛡️', description: 'Dark armor that absorbs incoming strikes.',       perkType: 'hp_boost', perkValue: 60, perkDescription: '+60 HP',
    perks: [{ perkType: 'hp_boost', perkValue: 60, perkDescription: '+60 HP' }, { perkType: 'atk_boost', perkValue: 3, perkDescription: '+3 ATK' }, { perkType: 'def_boost', perkValue: 4, perkDescription: '+4 DEF' }] },
  { id: 'shadow_sword',   name: 'Shadow Sword',   slot: 'weapon', rarity: 'epic',   icon: '⚔️', description: 'A blade forged in darkness. Cuts through armor.',  perkType: 'atk_boost', perkValue: 10, perkDescription: '+10 ATK',
    perks: [{ perkType: 'atk_boost', perkValue: 10, perkDescription: '+10 ATK' }, { perkType: 'hp_regen_boost', perkValue: 2, perkDescription: '+2 HP Regen' }] },
  { id: 'shadow_legs',    name: 'Shadow Legs',    slot: 'legs',   rarity: 'epic',   icon: '🦿', description: 'Greaves that let you move like a phantom.',        perkType: 'atk_boost', perkValue: 5, perkDescription: '+5 ATK',
    perks: [{ perkType: 'atk_boost', perkValue: 5, perkDescription: '+5 ATK' }, { perkType: 'hp_boost', perkValue: 25, perkDescription: '+25 HP' }] },
  { id: 'shadow_ring',    name: 'Shadow Ring',    slot: 'ring',   rarity: 'epic',   icon: '🔗', description: 'A ring pulsing with dark energy.',                 perkType: 'atk_boost', perkValue: 4, perkDescription: '+4 ATK',
    perks: [{ perkType: 'atk_boost', perkValue: 4, perkDescription: '+4 ATK' }, { perkType: 'hp_regen_boost', perkValue: 3, perkDescription: '+3 HP Regen' }] },
  // Legendary — Golden Set  (full set: +44 ATK, +150 HP, +7 Regen → player 49/250/7)
  { id: 'golden_helm',    name: 'Golden Helm',    slot: 'head',   rarity: 'legendary', icon: '👑', description: 'A crown-helm of pure gold. Radiates power.',    perkType: 'atk_boost', perkValue: 10, perkDescription: '+10 ATK',
    perks: [{ perkType: 'atk_boost', perkValue: 10, perkDescription: '+10 ATK' }, { perkType: 'hp_boost', perkValue: 30, perkDescription: '+30 HP' }, { perkType: 'xp_global_boost', perkValue: 0.05, perkDescription: '+5% Global XP' }] },
  { id: 'golden_plate',   name: 'Golden Plate',   slot: 'body',   rarity: 'legendary', icon: '🛡️', description: 'Legendary golden armor. Nearly impenetrable.', perkType: 'hp_boost', perkValue: 80, perkDescription: '+80 HP',
    perks: [{ perkType: 'hp_boost', perkValue: 80, perkDescription: '+80 HP' }, { perkType: 'atk_boost', perkValue: 5, perkDescription: '+5 ATK' }, { perkType: 'def_boost', perkValue: 6, perkDescription: '+6 DEF' }, { perkType: 'streak_shield', perkValue: 1, perkDescription: 'Streak Shield' }] },
  { id: 'golden_sword',   name: 'Golden Sword',   slot: 'weapon', rarity: 'legendary', icon: '⚔️', description: 'A blade of gleaming gold. Strikes true.',     perkType: 'atk_boost', perkValue: 15, perkDescription: '+15 ATK',
    perks: [{ perkType: 'atk_boost', perkValue: 15, perkDescription: '+15 ATK' }, { perkType: 'hp_regen_boost', perkValue: 3, perkDescription: '+3 HP Regen' }] },
  { id: 'golden_legs',    name: 'Golden Legs',    slot: 'legs',   rarity: 'legendary', icon: '🦿', description: 'Golden greaves that bolster the wearer.',       perkType: 'atk_boost', perkValue: 8, perkDescription: '+8 ATK',
    perks: [{ perkType: 'atk_boost', perkValue: 8, perkDescription: '+8 ATK' }, { perkType: 'hp_boost', perkValue: 40, perkDescription: '+40 HP' }] },
  { id: 'golden_ring',    name: 'Golden Ring',    slot: 'ring',   rarity: 'legendary', icon: '💍', description: 'A ring of ancient kings. Sharpens focus.',      perkType: 'atk_boost', perkValue: 6, perkDescription: '+6 ATK',
    perks: [{ perkType: 'atk_boost', perkValue: 6, perkDescription: '+6 ATK' }, { perkType: 'hp_regen_boost', perkValue: 4, perkDescription: '+4 HP Regen' }, { perkType: 'focus_boost', perkValue: 0.10, perkDescription: '+10% Focus' }] },
  // Mythic — Void Set  (full set: +62 ATK, +230 HP, +10 Regen → player 67/330/10)
  { id: 'void_helm',      name: 'Void Helm',      slot: 'head',   rarity: 'mythic', icon: '🌀', description: 'A helm torn from the void itself.',               perkType: 'atk_boost', perkValue: 14, perkDescription: '+14 ATK',
    perks: [{ perkType: 'atk_boost', perkValue: 14, perkDescription: '+14 ATK' }, { perkType: 'hp_boost', perkValue: 50, perkDescription: '+50 HP' }, { perkType: 'xp_global_boost', perkValue: 0.08, perkDescription: '+8% Global XP' }] },
  { id: 'void_plate',     name: 'Void Plate',     slot: 'body',   rarity: 'mythic', icon: '👻', description: 'Armor woven from void threads. Defies reality.',   perkType: 'hp_boost', perkValue: 120, perkDescription: '+120 HP',
    perks: [{ perkType: 'hp_boost', perkValue: 120, perkDescription: '+120 HP' }, { perkType: 'atk_boost', perkValue: 8, perkDescription: '+8 ATK' }, { perkType: 'def_boost', perkValue: 10, perkDescription: '+10 DEF' }, { perkType: 'streak_shield', perkValue: 1, perkDescription: 'Streak Shield' }] },
  { id: 'void_sword',     name: 'Void Sword',     slot: 'weapon', rarity: 'mythic', icon: '⚔️', description: 'A blade of pure void energy. Unmatchable.',       perkType: 'atk_boost', perkValue: 18, perkDescription: '+18 ATK',
    perks: [{ perkType: 'atk_boost', perkValue: 18, perkDescription: '+18 ATK' }, { perkType: 'hp_regen_boost', perkValue: 5, perkDescription: '+5 HP Regen' }] },
  { id: 'void_legs',      name: 'Void Legs',      slot: 'legs',   rarity: 'mythic', icon: '🦿', description: 'Greaves that phase through attacks.',              perkType: 'atk_boost', perkValue: 12, perkDescription: '+12 ATK',
    perks: [{ perkType: 'atk_boost', perkValue: 12, perkDescription: '+12 ATK' }, { perkType: 'hp_boost', perkValue: 60, perkDescription: '+60 HP' }] },
  { id: 'void_ring',      name: 'Void Ring',      slot: 'ring',   rarity: 'mythic', icon: '🌀', description: 'A ring forged from pure void energy.',             perkType: 'atk_boost', perkValue: 10, perkDescription: '+10 ATK',
    perks: [{ perkType: 'atk_boost', perkValue: 10, perkDescription: '+10 ATK' }, { perkType: 'hp_regen_boost', perkValue: 5, perkDescription: '+5 HP Regen' }, { perkType: 'xp_global_boost', perkValue: 0.08, perkDescription: '+8% Global XP' }] },

  // Raid-exclusive mythic items (only drop from raid victories, tradeable)
  { id: 'raid_ancient_ring', name: 'Ancient Relic Ring', slot: 'ring', rarity: 'mythic', icon: '💍', description: 'Forged in the fires of ancient raids. Untold gold flows to its bearer.',
    perkType: 'atk_boost', perkValue: 22, perkDescription: '+22 ATK',
    perks: [{ perkType: 'atk_boost', perkValue: 22, perkDescription: '+22 ATK' }, { perkType: 'hp_regen_boost', perkValue: 10, perkDescription: '+10 HP Regen' }] },
  { id: 'raid_void_blade', name: 'Void Conqueror Blade', slot: 'weapon', rarity: 'mythic', icon: '🗡️', description: 'Wielded only by those who have faced the mythic hydra and lived.',
    perkType: 'atk_boost', perkValue: 35, perkDescription: '+35 ATK',
    perks: [{ perkType: 'atk_boost', perkValue: 35, perkDescription: '+35 ATK' }, { perkType: 'hp_regen_boost', perkValue: 15, perkDescription: '+15 HP Regen' }, { perkType: 'xp_global_boost', perkValue: 0.10, perkDescription: '+10% Global XP' }] },
  { id: 'raid_eternal_crown', name: 'Eternal Crown', slot: 'head', rarity: 'mythic', icon: '👑', description: 'The crown of the eternal titan. Only the worthy shall wear it.',
    perkType: 'atk_boost', perkValue: 28, perkDescription: '+28 ATK',
    perks: [{ perkType: 'atk_boost', perkValue: 28, perkDescription: '+28 ATK' }, { perkType: 'hp_boost', perkValue: 180, perkDescription: '+180 HP' }, { perkType: 'xp_global_boost', perkValue: 0.15, perkDescription: '+15% Global XP' }, { perkType: 'def_boost', perkValue: 12, perkDescription: '+12 DEF' }] },

  // Intermediate crafting materials (smelted/refined from raw drops, used in gear recipes)
  ...CRAFT_INTERMEDIATE_ITEMS,

  // Crafted gear items (defined in crafting.ts, registered here so all inventory/marketplace lookups work)
  ...CRAFT_LOOT_ITEMS,

  // Cooked food items (defined in cooking.ts, registered here for inventory/marketplace)
  ...FOOD_LOOT_ITEMS,
]
export const CHEST_DEFS: Record<ChestType, ChestDef> = {
  common_chest: {
    id: 'common_chest',
    name: 'Common Bag',
    icon: '📦',
    image: 'loot/chest_common.png',
    rarity: 'common',
    itemWeights: [
      { itemId: 'wooden_helm',   weight: 3 },
      { itemId: 'wooden_plate',  weight: 3 },
      { itemId: 'wooden_sword',  weight: 3 },
      { itemId: 'wooden_legs',   weight: 3 },
      { itemId: 'wooden_ring',   weight: 3 },
    ],
  },
  rare_chest: {
    id: 'rare_chest',
    name: 'Rare Bag',
    icon: '🎁',
    image: 'loot/chest_rare.png',
    rarity: 'rare',
    itemWeights: [
      { itemId: 'wooden_helm',   weight: 2 },
      { itemId: 'wooden_plate',  weight: 2 },
      { itemId: 'wooden_sword',  weight: 2 },
      { itemId: 'wooden_legs',   weight: 2 },
      { itemId: 'wooden_ring',   weight: 2 },
      { itemId: 'copper_helm',   weight: 3 },
      { itemId: 'copper_plate',  weight: 3 },
      { itemId: 'copper_sword',  weight: 3 },
      { itemId: 'copper_legs',   weight: 3 },
      { itemId: 'copper_ring',   weight: 3 },
    ],
  },
  epic_chest: {
    id: 'epic_chest',
    name: 'Epic Bag',
    icon: '🪙',
    image: 'loot/chest_epic.png',
    rarity: 'epic',
    itemWeights: [
      { itemId: 'copper_helm',   weight: 2 },
      { itemId: 'copper_plate',  weight: 2 },
      { itemId: 'copper_sword',  weight: 2 },
      { itemId: 'copper_legs',   weight: 2 },
      { itemId: 'copper_ring',   weight: 2 },
      { itemId: 'shadow_helm',   weight: 3 },
      { itemId: 'shadow_plate',  weight: 3 },
      { itemId: 'shadow_sword',  weight: 3 },
      { itemId: 'shadow_legs',   weight: 3 },
      { itemId: 'shadow_ring',   weight: 3 },
      { itemId: 'atk_potion',    weight: 1 },
      { itemId: 'hp_potion',     weight: 1 },
      { itemId: 'regen_potion',  weight: 1 },
      { itemId: 'def_potion',   weight: 1 },
    ],
  },
  legendary_chest: {
    id: 'legendary_chest',
    name: 'Legendary Bag',
    icon: '💎',
    image: 'loot/chest_epic.png',
    rarity: 'legendary',
    itemWeights: [
      { itemId: 'shadow_helm',   weight: 2 },
      { itemId: 'shadow_plate',  weight: 2 },
      { itemId: 'shadow_sword',  weight: 2 },
      { itemId: 'shadow_legs',   weight: 2 },
      { itemId: 'shadow_ring',   weight: 2 },
      { itemId: 'golden_helm',   weight: 3 },
      { itemId: 'golden_plate',  weight: 3 },
      { itemId: 'golden_sword',  weight: 3 },
      { itemId: 'golden_legs',   weight: 3 },
      { itemId: 'golden_ring',   weight: 3 },
      { itemId: 'void_helm',     weight: 1 },
      { itemId: 'void_plate',    weight: 1 },
      { itemId: 'void_sword',    weight: 1 },
      { itemId: 'void_legs',     weight: 1 },
      { itemId: 'void_ring',     weight: 1 },
      { itemId: 'craft_lich_helm',  weight: 1 },
      { itemId: 'craft_lich_plate', weight: 1 },
      { itemId: 'craft_lich_sword', weight: 1 },
      { itemId: 'craft_lich_legs',  weight: 1 },
      { itemId: 'craft_lich_ring',  weight: 1 },
      { itemId: 'atk_potion',    weight: 2 },
      { itemId: 'hp_potion',     weight: 2 },
      { itemId: 'regen_potion',  weight: 2 },
      { itemId: 'def_potion',   weight: 2 },
    ],
  },
}

function randomPickByWeight<T>(entries: Array<{ value: T; weight: number }>): T | null {
  const safe = entries.filter((e) => e.weight > 0)
  const total = safe.reduce((sum, e) => sum + e.weight, 0)
  if (total <= 0 || safe.length === 0) return null
  let roll = Math.random() * total
  for (const e of safe) {
    roll -= e.weight
    if (roll <= 0) return e.value
  }
  return safe[safe.length - 1].value
}

function clampRate(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function normalizeRates(common: number, rare: number, epic: number, legendary: number): Record<ChestType, number> {
  const sum = common + rare + epic + legendary
  if (sum <= 0) return { common_chest: 0.70, rare_chest: 0.22, epic_chest: 0.07, legendary_chest: 0.01 }
  return {
    common_chest: clampRate(common / sum),
    rare_chest: clampRate(rare / sum),
    epic_chest: clampRate(epic / sum),
    legendary_chest: clampRate(legendary / sum),
  }
}

function chestRatesForContext(context: LootDropContext): Record<ChestType, number> {
  let common = 0.70
  let rare = 0.22
  let epic = 0.07
  let legendary = 0.01
  if (context.source === 'daily_activity') {
    common -= 0.15
    rare += 0.10
    epic += 0.04
    legendary += 0.01
  } else if (context.source === 'goal_complete') {
    common -= 0.06
    rare += 0.04
    epic += 0.02
  } else if (context.source === 'skill_grind' && context.focusCategory === 'coding') {
    common -= 0.02
    rare += 0.01
    epic += 0.01
  }
  return normalizeRates(common, rare, epic, legendary)
}

export function estimateChestDropRate(chestType: ChestType, context: LootDropContext): number {
  return Number((chestRatesForContext(context)[chestType] * 100).toFixed(2))
}

export function estimateLootDropRate(itemId: string, context: LootDropContext): number {
  const item = LOOT_ITEMS.find((x) => x.id === itemId)
  if (!item) return 0
  // Approximation: expected chance from weighted mix over all chest types.
  const rates = chestRatesForContext(context)
  let total = 0
  for (const chest of Object.values(CHEST_DEFS)) {
    const entry = chest.itemWeights.find((x) => x.itemId === item.id)
    const weightSum = chest.itemWeights.reduce((sum, x) => sum + x.weight, 0)
    if (!entry || weightSum <= 0) continue
    const withinChest = entry.weight / weightSum
    total += rates[chest.id] * withinChest
  }
  return Number((total * 100).toFixed(2))
}

const PITY_RARE = 15
const PITY_EPIC = 40
const PITY_LEGENDARY = 80

export function rollChestDrop(
  context: LootDropContext,
  pity: LootRollPity,
): ChestRollResult {
  if (pity.rollsSinceLegendaryChest >= PITY_LEGENDARY) {
    return { chestType: 'legendary_chest', estimatedDropRate: 100 }
  }
  if (pity.rollsSinceEpicChest >= PITY_EPIC) {
    return { chestType: 'epic_chest', estimatedDropRate: 100 }
  }
  const rates = chestRatesForContext(context)
  let chestType = randomPickByWeight<ChestType>([
    { value: 'common_chest', weight: rates.common_chest },
    { value: 'rare_chest', weight: rates.rare_chest },
    { value: 'epic_chest', weight: rates.epic_chest },
    { value: 'legendary_chest', weight: rates.legendary_chest },
  ]) ?? 'common_chest'
  if (pity.rollsSinceRareChest >= PITY_RARE && chestType === 'common_chest') {
    chestType = 'rare_chest'
  }
  return {
    chestType,
    estimatedDropRate: Number((rates[chestType] * 100).toFixed(2)),
  }
}

export function nextPityAfterChestRoll(chestType: ChestType, pity: LootRollPity): LootRollPity {
  return {
    rollsSinceRareChest: chestType === 'common_chest' ? pity.rollsSinceRareChest + 1 : 0,
    rollsSinceEpicChest: (chestType === 'epic_chest' || chestType === 'legendary_chest') ? 0 : pity.rollsSinceEpicChest + 1,
    rollsSinceLegendaryChest: chestType === 'legendary_chest' ? 0 : pity.rollsSinceLegendaryChest + 1,
  }
}

// ── Bonus material drops per chest tier ──────────────────────────────────────
const BONUS_MATERIAL_POOL: Record<ChestType, Array<{ itemId: string; weight: number; minQty: number; maxQty: number }>> = {
  common_chest: [
    { itemId: 'ore_iron',     weight: 5, minQty: 1, maxQty: 2 },
    { itemId: 'monster_fang', weight: 5, minQty: 1, maxQty: 2 },
  ],
  rare_chest: [
    { itemId: 'ore_iron',      weight: 4, minQty: 1, maxQty: 3 },
    { itemId: 'monster_fang',  weight: 4, minQty: 1, maxQty: 3 },
    { itemId: 'magic_essence', weight: 2, minQty: 1, maxQty: 2 },
  ],
  epic_chest: [
    { itemId: 'ore_iron',      weight: 2, minQty: 2, maxQty: 4 },
    { itemId: 'monster_fang',  weight: 2, minQty: 2, maxQty: 4 },
    { itemId: 'magic_essence', weight: 3, minQty: 1, maxQty: 3 },
    { itemId: 'ancient_scale', weight: 2, minQty: 1, maxQty: 2 },
    { itemId: 'void_crystal',  weight: 1, minQty: 1, maxQty: 1 },
  ],
  legendary_chest: [
    { itemId: 'magic_essence', weight: 3, minQty: 2, maxQty: 4 },
    { itemId: 'ancient_scale', weight: 3, minQty: 2, maxQty: 3 },
    { itemId: 'void_crystal',  weight: 2, minQty: 1, maxQty: 2 },
  ],
}

const BONUS_ROLLS: Record<ChestType, number> = {
  common_chest: 1,
  rare_chest: 2,
  epic_chest: 2,
  legendary_chest: 3,
}

export function rollBonusMaterials(chestType: ChestType): BonusMaterial[] {
  const pool = BONUS_MATERIAL_POOL[chestType]
  if (!pool.length) return []
  const rolls = BONUS_ROLLS[chestType]
  const result: Record<string, number> = {}
  for (let i = 0; i < rolls; i++) {
    const pick = randomPickByWeight(pool.map(p => ({ value: p, weight: p.weight })))
    if (!pick) continue
    const qty = pick.minQty + Math.floor(Math.random() * (pick.maxQty - pick.minQty + 1))
    result[pick.itemId] = (result[pick.itemId] ?? 0) + qty
  }
  return Object.entries(result).map(([itemId, qty]) => ({ itemId, qty }))
}

// Hardcoded fallback weights per chest rarity — used when admin overrides reference stale/deleted items
const FALLBACK_WEIGHTS: Record<ChestType, { itemId: string; weight: number }[]> = {
  common_chest: [
    { itemId: 'wooden_helm', weight: 3 }, { itemId: 'wooden_plate', weight: 3 },
    { itemId: 'wooden_sword', weight: 3 }, { itemId: 'wooden_legs', weight: 3 }, { itemId: 'wooden_ring', weight: 3 },
  ],
  rare_chest: [
    { itemId: 'wooden_helm', weight: 2 }, { itemId: 'wooden_plate', weight: 2 }, { itemId: 'wooden_sword', weight: 2 },
    { itemId: 'wooden_legs', weight: 2 }, { itemId: 'wooden_ring', weight: 2 },
    { itemId: 'copper_helm', weight: 3 }, { itemId: 'copper_plate', weight: 3 }, { itemId: 'copper_sword', weight: 3 },
    { itemId: 'copper_legs', weight: 3 }, { itemId: 'copper_ring', weight: 3 },
  ],
  epic_chest: [
    { itemId: 'copper_helm', weight: 2 }, { itemId: 'copper_plate', weight: 2 }, { itemId: 'copper_sword', weight: 2 },
    { itemId: 'copper_legs', weight: 2 }, { itemId: 'copper_ring', weight: 2 },
    { itemId: 'shadow_helm', weight: 3 }, { itemId: 'shadow_plate', weight: 3 }, { itemId: 'shadow_sword', weight: 3 },
    { itemId: 'shadow_legs', weight: 3 }, { itemId: 'shadow_ring', weight: 3 },
    { itemId: 'atk_potion', weight: 1 }, { itemId: 'hp_potion', weight: 1 }, { itemId: 'regen_potion', weight: 1 }, { itemId: 'def_potion', weight: 1 },
  ],
  legendary_chest: [
    { itemId: 'shadow_helm', weight: 2 }, { itemId: 'shadow_plate', weight: 2 }, { itemId: 'shadow_sword', weight: 2 },
    { itemId: 'shadow_legs', weight: 2 }, { itemId: 'shadow_ring', weight: 2 },
    { itemId: 'golden_helm', weight: 3 }, { itemId: 'golden_plate', weight: 3 }, { itemId: 'golden_sword', weight: 3 },
    { itemId: 'golden_legs', weight: 3 }, { itemId: 'golden_ring', weight: 3 },
    { itemId: 'void_helm', weight: 1 }, { itemId: 'void_plate', weight: 1 }, { itemId: 'void_sword', weight: 1 },
    { itemId: 'void_legs', weight: 1 }, { itemId: 'void_ring', weight: 1 },
    { itemId: 'atk_potion', weight: 2 }, { itemId: 'hp_potion', weight: 2 }, { itemId: 'regen_potion', weight: 2 }, { itemId: 'def_potion', weight: 2 },
  ],
}

export function openChest(chestType: ChestType, context: LootDropContext): ChestOpenResult {
  const chest = CHEST_DEFS[chestType]
  const bonusMaterials = rollBonusMaterials(chestType)

  // Roll whether an equipment item drops
  const itemChance = ITEM_DROP_CHANCE[chestType] ?? 0.5
  if (Math.random() >= itemChance) {
    // No item — only gold + materials
    return { item: null, estimatedDropRate: 0, bonusMaterials }
  }

  // Filter to only items that actually exist in LOOT_ITEMS (admin overrides may reference stale IDs)
  let validWeights = chest.itemWeights.filter((entry) => LOOT_ITEMS.some((x) => x.id === entry.itemId))
  if (validWeights.length === 0) {
    console.warn('[openChest] admin weights have no valid items for', chestType, '— falling back to defaults')
    validWeights = FALLBACK_WEIGHTS[chestType]
  }
  const itemId = randomPickByWeight(validWeights.map((entry) => ({ value: entry.itemId, weight: entry.weight })))
  const item = itemId ? LOOT_ITEMS.find((x) => x.id === itemId) : null
  return {
    item: item ?? null,
    estimatedDropRate: item ? estimateLootDropRate(item.id, context) : 0,
    bonusMaterials,
  }
}

/** Returns the perks array for an item, falling back to the legacy single-perk fields. */
export function getItemPerks(item: LootItemDef): LootItemPerk[] {
  if (item.perks?.length) return item.perks
  return [{ perkType: item.perkType, perkValue: item.perkValue, perkTarget: item.perkTarget, perkDescription: item.perkDescription }]
}

/** Human-readable description of all perks on an item, joined with ' · '. */
export function getItemPerkDescription(item: LootItemDef): string {
  return getItemPerks(item).map(p => p.perkDescription).filter(Boolean).join(' · ')
}

export function getEquippedPerkRuntime(equippedBySlot: Partial<Record<LootSlot, string>>): LootPerkRuntime {
  const out: LootPerkRuntime = {
    skillXpMultiplierBySkill: {},
    chestDropChanceBonusByCategory: {},
    statusTitle: null,
    globalXpMultiplier: 1,
    streakShield: false,
    focusBoostMultiplier: 1,
  }

  const equippedItems = Object.values(equippedBySlot)
    .map((id) => LOOT_ITEMS.find((x) => x.id === id))
    .filter((item): item is LootItemDef => Boolean(item))

  for (const item of equippedItems) {
    for (const p of getItemPerks(item)) {
      if (p.perkType === 'xp_skill_boost') {
        const skillKey = p.perkTarget || 'developer'
        out.skillXpMultiplierBySkill[skillKey] = Math.max(
          out.skillXpMultiplierBySkill[skillKey] ?? 1,
          1 + Number(p.perkValue || 0),
        )
      } else if (p.perkType === 'chest_drop_boost') {
        const categoryKey = p.perkTarget || 'coding'
        out.chestDropChanceBonusByCategory[categoryKey] = Math.max(
          out.chestDropChanceBonusByCategory[categoryKey] ?? 0,
          Number(p.perkValue || 0),
        )
      } else if (p.perkType === 'status_title') {
        out.statusTitle = String(p.perkValue || '')
      } else if (p.perkType === 'xp_global_boost') {
        out.globalXpMultiplier = Math.max(out.globalXpMultiplier, 1 + Number(p.perkValue || 0))
      } else if (p.perkType === 'streak_shield') {
        out.streakShield = out.streakShield || Boolean(p.perkValue)
      } else if (p.perkType === 'focus_boost') {
        out.focusBoostMultiplier = Math.max(out.focusBoostMultiplier, 1 + Number(p.perkValue || 0))
      }
      // Combat perks (atk_boost, hp_boost, hp_regen_boost) are summed in getCombatStatsFromEquipped
    }
  }

  return out
}

export interface CombatStats {
  atk: number
  hp: number
  hpRegen: number
  def: number
}

/** Sum ATK, HP, HP regen from equipped items with combat perks. */
export function getCombatStatsFromEquipped(equippedBySlot: Partial<Record<LootSlot, string>>): CombatStats {
  const out: CombatStats = { atk: 0, hp: 0, hpRegen: 0, def: 0 }
  const equippedItems = Object.values(equippedBySlot)
    .map((id) => LOOT_ITEMS.find((x) => x.id === id))
    .filter((item): item is LootItemDef => Boolean(item))

  for (const item of equippedItems) {
    for (const p of getItemPerks(item)) {
      if (p.perkType === 'atk_boost') {
        out.atk += Number(p.perkValue || 0)
      } else if (p.perkType === 'hp_boost') {
        out.hp += Number(p.perkValue || 0)
      } else if (p.perkType === 'hp_regen_boost') {
        out.hpRegen += Number(p.perkValue || 0)
      } else if (p.perkType === 'def_boost') {
        out.def += Number(p.perkValue || 0)
      }
    }
  }
  return out
}
