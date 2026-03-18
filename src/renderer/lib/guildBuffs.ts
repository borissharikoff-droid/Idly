export interface GuildBuff {
  id: string
  icon: string
  label: string
  description: string
  value: number // percent
}

export interface GuildHallLevel {
  level: number
  name: string
  goldCost: number
  materials: Array<{ id: string; qty: number }>
  xpBonusPct: number
  goldBonusPct: number
  chestDropBonusPct: number
  /** Percent reduction in craft duration (e.g. 5 = 5% faster) */
  craftSpeedBonusPct: number
  /** Percent increase in farm yield (e.g. 5 = 5% more yield) */
  farmYieldBonusPct: number
  buildDurationMs: number
}

export const GUILD_HALL_LEVELS: GuildHallLevel[] = [
  {
    level: 1,
    name: 'Wooden Shack',
    goldCost: 0,
    materials: [],
    xpBonusPct: 5,
    goldBonusPct: 5,
    chestDropBonusPct: 0,
    craftSpeedBonusPct: 0,
    farmYieldBonusPct: 0,
    buildDurationMs: 0,
  },
  {
    level: 2,
    name: 'Stone Keep',
    goldCost: 5000,
    materials: [
      { id: 'ore_iron', qty: 300 },
      { id: 'wheat', qty: 500 },
      { id: 'slime_gel', qty: 100 },
      { id: 'wooden_sword', qty: 5 },
    ],
    xpBonusPct: 8,
    goldBonusPct: 8,
    chestDropBonusPct: 0,
    craftSpeedBonusPct: 0,
    farmYieldBonusPct: 0,
    buildDurationMs: 60 * 60 * 1000, // 1h
  },
  {
    level: 3,
    name: 'Iron Fortress',
    goldCost: 15000,
    materials: [
      { id: 'ore_iron', qty: 200 },
      { id: 'monster_fang', qty: 200 },
      { id: 'wooden_helm', qty: 5 },
      { id: 'wooden_plate', qty: 5 },
    ],
    xpBonusPct: 10,
    goldBonusPct: 10,
    chestDropBonusPct: 0,
    craftSpeedBonusPct: 0,
    farmYieldBonusPct: 0,
    buildDurationMs: 3 * 60 * 60 * 1000, // 3h
  },
  {
    level: 4,
    name: 'Arcane Tower',
    goldCost: 35000,
    materials: [
      { id: 'magic_essence', qty: 100 },
      { id: 'blossoms', qty: 200 },
    ],
    xpBonusPct: 12,
    goldBonusPct: 12,
    chestDropBonusPct: 5,
    craftSpeedBonusPct: 0,
    farmYieldBonusPct: 0,
    buildDurationMs: 8 * 60 * 60 * 1000, // 8h
  },
  {
    level: 5,
    name: 'Crystal Stronghold',
    goldCost: 70000,
    materials: [
      { id: 'ancient_scale', qty: 50 },
      { id: 'orchids', qty: 100 },
    ],
    xpBonusPct: 15,
    goldBonusPct: 15,
    chestDropBonusPct: 8,
    craftSpeedBonusPct: 0,
    farmYieldBonusPct: 0,
    buildDurationMs: 18 * 60 * 60 * 1000, // 18h
  },
  {
    level: 6,
    name: 'Void Bastion',
    goldCost: 130000,
    materials: [
      { id: 'void_crystal', qty: 30 },
      { id: 'clovers', qty: 150 },
      { id: 'slime_gel', qty: 500 },
    ],
    xpBonusPct: 18,
    goldBonusPct: 18,
    chestDropBonusPct: 10,
    craftSpeedBonusPct: 5,
    farmYieldBonusPct: 0,
    buildDurationMs: 24 * 60 * 60 * 1000, // 1d
  },
  {
    level: 7,
    name: 'Eternal Citadel',
    goldCost: 250000,
    materials: [
      { id: 'warlord_sigil', qty: 15 },
      { id: 'star_bloom', qty: 50 },
    ],
    xpBonusPct: 20,
    goldBonusPct: 20,
    chestDropBonusPct: 12,
    craftSpeedBonusPct: 10,
    farmYieldBonusPct: 0,
    buildDurationMs: 2 * 24 * 60 * 60 * 1000, // 2d
  },
  {
    level: 8,
    name: 'Draconic Keep',
    goldCost: 450000,
    materials: [
      { id: 'dragon_scale', qty: 20 },
      { id: 'lich_crystal', qty: 8 },
      { id: 'crystal_root', qty: 30 },
    ],
    xpBonusPct: 22,
    goldBonusPct: 22,
    chestDropBonusPct: 15,
    craftSpeedBonusPct: 15,
    farmYieldBonusPct: 5,
    buildDurationMs: 3 * 24 * 60 * 60 * 1000, // 3d
  },
  {
    level: 9,
    name: 'Shadow Sanctum',
    goldCost: 700000,
    materials: [
      { id: 'shadow_dust', qty: 30 },
      { id: 'titan_core', qty: 5 },
      { id: 'void_blossom', qty: 15 },
    ],
    xpBonusPct: 25,
    goldBonusPct: 25,
    chestDropBonusPct: 18,
    craftSpeedBonusPct: 20,
    farmYieldBonusPct: 10,
    buildDurationMs: 4 * 24 * 60 * 60 * 1000, // 4d
  },
  {
    level: 10,
    name: 'Celestial Spire',
    goldCost: 1200000,
    materials: [
      { id: 'dragon_heart', qty: 5 },
      { id: 'storm_shard', qty: 10 },
      { id: 'void_crystal', qty: 50 },
      { id: 'star_bloom', qty: 100 },
    ],
    xpBonusPct: 30,
    goldBonusPct: 30,
    chestDropBonusPct: 20,
    craftSpeedBonusPct: 25,
    farmYieldBonusPct: 15,
    buildDurationMs: 5 * 24 * 60 * 60 * 1000, // 5d
  },
]

export const MAX_HALL_LEVEL = 10

/** Get the hall level definition. Level 0 or below = not in guild = no buffs. */
export function getHallDef(hallLevel: number): GuildHallLevel | null {
  if (hallLevel <= 0) return null
  return GUILD_HALL_LEVELS[Math.min(hallLevel, MAX_HALL_LEVEL) - 1] ?? null
}

/** Multiplier to apply to skill XP ticks. hallLevel=0 means not in guild. */
export function getGuildXpMultiplier(hallLevel: number): number {
  const def = getHallDef(hallLevel)
  return def ? 1 + def.xpBonusPct / 100 : 1
}

/** Multiplier to apply to arena mob gold. hallLevel=0 means not in guild. */
export function getGuildGoldMultiplier(hallLevel: number): number {
  const def = getHallDef(hallLevel)
  return def ? 1 + def.goldBonusPct / 100 : 1
}

/** Chest drop chance bonus (additive %). 0 if no bonus. */
export function getGuildChestDropBonus(hallLevel: number): number {
  const def = getHallDef(hallLevel)
  return def?.chestDropBonusPct ?? 0
}

/** Craft speed reduction multiplier. 1.0 = no bonus. 0.95 = 5% faster. */
export function getGuildCraftSpeedMultiplier(hallLevel: number): number {
  const def = getHallDef(hallLevel)
  if (!def || def.craftSpeedBonusPct <= 0) return 1
  return 1 - def.craftSpeedBonusPct / 100
}

/** Farm yield bonus percent. 0 if no bonus. */
export function getGuildFarmYieldBonus(hallLevel: number): number {
  const def = getHallDef(hallLevel)
  return def?.farmYieldBonusPct ?? 0
}

// Legacy GUILD_BUFFS kept for reference (GuildTab still imports this)
export const GUILD_BUFFS: GuildBuff[] = [
  {
    id: 'xp',
    icon: '⚡',
    label: '+5% Skill XP',
    description: 'All skill XP earned from focus sessions is increased by 5%.',
    value: 5,
  },
  {
    id: 'gold',
    icon: '🪙',
    label: '+5% Arena Gold',
    description: 'Gold earned from mob kills in the Arena is increased by 5%.',
    value: 5,
  },
]
