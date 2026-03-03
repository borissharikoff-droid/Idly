import type { ChestType, LootRarity } from './loot'

// ─── Seed definitions ───────────────────────────────────────────────────────

export interface SeedDef {
  id: string
  name: string
  rarity: LootRarity
  icon: string
  growTimeSeconds: number
  yieldPlantId: string
  yieldMin: number
  yieldMax: number
  xpOnPlant: number
  xpOnHarvest: number
}

export const SEED_DEFS: SeedDef[] = [
  {
    id: 'wheat_seed',
    name: 'Wheat Seed',
    rarity: 'common',
    icon: '🌾',
    growTimeSeconds: 5 * 60,
    yieldPlantId: 'wheat',
    yieldMin: 1,
    yieldMax: 3,
    xpOnPlant: 10,
    xpOnHarvest: 50,
  },
  {
    id: 'herb_seed',
    name: 'Herb Seed',
    rarity: 'common',
    icon: '🌿',
    growTimeSeconds: 8 * 60,
    yieldPlantId: 'herbs',
    yieldMin: 1,
    yieldMax: 2,
    xpOnPlant: 10,
    xpOnHarvest: 50,
  },
  {
    id: 'apple_seed',
    name: 'Apple Seed',
    rarity: 'rare',
    icon: '🍎',
    growTimeSeconds: 20 * 60,
    yieldPlantId: 'apples',
    yieldMin: 1,
    yieldMax: 4,
    xpOnPlant: 20,
    xpOnHarvest: 100,
  },
  {
    id: 'blossom_seed',
    name: 'Blossom Seed',
    rarity: 'rare',
    icon: '🌸',
    growTimeSeconds: 25 * 60,
    yieldPlantId: 'blossoms',
    yieldMin: 1,
    yieldMax: 3,
    xpOnPlant: 20,
    xpOnHarvest: 100,
  },
  {
    id: 'clover_seed',
    name: 'Clover Seed',
    rarity: 'epic',
    icon: '🍀',
    growTimeSeconds: 60 * 60,
    yieldPlantId: 'clovers',
    yieldMin: 1,
    yieldMax: 5,
    xpOnPlant: 40,
    xpOnHarvest: 200,
  },
  {
    id: 'orchid_seed',
    name: 'Orchid Seed',
    rarity: 'epic',
    icon: '🌺',
    growTimeSeconds: 90 * 60,
    yieldPlantId: 'orchids',
    yieldMin: 1,
    yieldMax: 3,
    xpOnPlant: 40,
    xpOnHarvest: 200,
  },
  {
    id: 'starbloom_seed',
    name: 'Star Bloom Seed',
    rarity: 'legendary',
    icon: '🌟',
    growTimeSeconds: 3 * 60 * 60,
    yieldPlantId: 'star_bloom',
    yieldMin: 1,
    yieldMax: 4,
    xpOnPlant: 80,
    xpOnHarvest: 400,
  },
  {
    id: 'crystal_seed',
    name: 'Crystal Root Seed',
    rarity: 'legendary',
    icon: '💎',
    growTimeSeconds: 4 * 60 * 60,
    yieldPlantId: 'crystal_root',
    yieldMin: 1,
    yieldMax: 3,
    xpOnPlant: 80,
    xpOnHarvest: 400,
  },
  {
    id: 'void_spore',
    name: 'Void Spore',
    rarity: 'mythic',
    icon: '🔮',
    growTimeSeconds: 8 * 60 * 60,
    yieldPlantId: 'void_blossom',
    yieldMin: 1,
    yieldMax: 6,
    xpOnPlant: 160,
    xpOnHarvest: 800,
  },
]

export const SEED_IDS = SEED_DEFS.map((s) => s.id)

export function getSeedById(id: string): SeedDef | undefined {
  return SEED_DEFS.find((s) => s.id === id)
}

export function isSeedId(id: string): boolean {
  return SEED_IDS.includes(id)
}

// ─── Slot unlock costs ───────────────────────────────────────────────────────

/** Gold cost to unlock each slot index (0-based). Index = slot being unlocked (1 = second slot, etc.) */
export const SLOT_UNLOCK_COSTS: number[] = [
  0,        // slot 0 — free (always unlocked)
  200,      // slot 1
  600,      // slot 2
  1_500,    // slot 3
  3_500,    // slot 4
  7_000,    // slot 5
  12_000,   // slot 6
  20_000,   // slot 7
]

export const MAX_FARM_SLOTS = 8

// ─── Seed Zip ────────────────────────────────────────────────────────────────

/** Tier of a Seed Zip — matches chest quality */
export type SeedZipTier = 'common' | 'rare' | 'epic' | 'legendary'

/** user_inventory item_id for each Seed Zip tier */
export const SEED_ZIP_ITEM_IDS: Record<SeedZipTier, string> = {
  common: 'seed_zip_common',
  rare: 'seed_zip_rare',
  epic: 'seed_zip_epic',
  legendary: 'seed_zip_legendary',
}

export function isSeedZipId(id: string): boolean {
  return Object.values(SEED_ZIP_ITEM_IDS).includes(id)
}

export function seedZipTierFromItemId(id: string): SeedZipTier | null {
  const entry = Object.entries(SEED_ZIP_ITEM_IDS).find(([, v]) => v === id)
  return (entry?.[0] as SeedZipTier) ?? null
}

export const SEED_ZIP_LABELS: Record<SeedZipTier, string> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
}

export const SEED_ZIP_ICONS: Record<SeedZipTier, string> = {
  common: '🎒',
  rare: '🎒',
  epic: '🎒',
  legendary: '🎒',
}

/** Map chest type → Seed Zip tier */
export const CHEST_TO_ZIP_TIER: Record<ChestType, SeedZipTier> = {
  common_chest: 'common',
  rare_chest: 'rare',
  epic_chest: 'epic',
  legendary_chest: 'legendary',
}

// ─── Seed drop table by chest type ──────────────────────────────────────────

interface SeedDropEntry {
  seedId: string
  weight: number
}

const SEED_DROP_TABLE: Record<ChestType, SeedDropEntry[]> = {
  common_chest: [
    { seedId: 'wheat_seed', weight: 60 },
    { seedId: 'herb_seed', weight: 40 },
  ],
  rare_chest: [
    { seedId: 'wheat_seed', weight: 30 },
    { seedId: 'herb_seed', weight: 20 },
    { seedId: 'apple_seed', weight: 30 },
    { seedId: 'blossom_seed', weight: 20 },
  ],
  epic_chest: [
    { seedId: 'apple_seed', weight: 25 },
    { seedId: 'blossom_seed', weight: 25 },
    { seedId: 'clover_seed', weight: 30 },
    { seedId: 'orchid_seed', weight: 20 },
  ],
  legendary_chest: [
    { seedId: 'clover_seed', weight: 15 },
    { seedId: 'orchid_seed', weight: 15 },
    { seedId: 'starbloom_seed', weight: 25 },
    { seedId: 'crystal_seed', weight: 25 },
    { seedId: 'void_spore', weight: 20 },
  ],
}

/** Probability of getting a Seed Zip when opening a chest */
const SEED_ZIP_DROP_CHANCE: Record<ChestType, number> = {
  common_chest: 0.40,
  rare_chest: 0.55,
  epic_chest: 0.70,
  legendary_chest: 0.85,
}

/** Roll whether a Seed Zip drops when opening a chest. */
export function rollSeedZipFromChest(chestType: ChestType): boolean {
  return Math.random() <= SEED_ZIP_DROP_CHANCE[chestType]
}

/** Roll a random seed from a Seed Zip of a given tier. */
export function rollSeedFromZip(tier: SeedZipTier): string | null {
  const chestType: ChestType = (
    { common: 'common_chest', rare: 'rare_chest', epic: 'epic_chest', legendary: 'legendary_chest' } as Record<SeedZipTier, ChestType>
  )[tier]
  const table = SEED_DROP_TABLE[chestType]
  const totalWeight = table.reduce((sum, e) => sum + e.weight, 0)
  let roll = Math.random() * totalWeight
  for (const entry of table) {
    roll -= entry.weight
    if (roll <= 0) return entry.seedId
  }
  return table[table.length - 1]?.seedId ?? null
}

/** Chance of a bonus Seed Zip dropping on harvest */
export const HARVEST_SEED_ZIP_CHANCE = 0.15

/** Roll zip tier for harvest bonus (biased toward common/rare) */
export function rollHarvestSeedZipTier(): SeedZipTier {
  const r = Math.random()
  if (r < 0.60) return 'common'
  if (r < 0.85) return 'rare'
  if (r < 0.97) return 'epic'
  return 'legendary'
}

// ─── Farmer XP helper ────────────────────────────────────────────────────────

/** Grant XP to the Farmer skill. Writes to both SQLite (via IPC) and localStorage. */
export async function grantFarmerXP(amount: number): Promise<void> {
  if (amount <= 0) return
  const skillId = 'farmer'

  // Write to SQLite if running in Electron
  try {
    const api = (window as Window & typeof globalThis & { electronAPI?: { db?: { addSkillXP?: (id: string, xp: number) => Promise<void> } } }).electronAPI
    if (api?.db?.addSkillXP) {
      await api.db.addSkillXP(skillId, amount)
    }
  } catch {
    // ignore IPC errors
  }

  // Always sync to localStorage (Skills page reads from here)
  try {
    const stored = JSON.parse(localStorage.getItem('grindly_skill_xp') || '{}') as Record<string, number>
    stored[skillId] = (stored[skillId] ?? 0) + amount
    localStorage.setItem('grindly_skill_xp', JSON.stringify(stored))
  } catch {
    // ignore storage errors
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function formatGrowTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function formatCountdown(remainingSeconds: number): string {
  if (remainingSeconds <= 0) return 'Ready!'
  const h = Math.floor(remainingSeconds / 3600)
  const m = Math.floor((remainingSeconds % 3600) / 60)
  const s = Math.floor(remainingSeconds % 60)
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`
  if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`
  return `${s}s`
}

/** Returns display info for farm-specific item IDs (seed zips) not found in LOOT_ITEMS. */
export function getFarmItemDisplay(itemId: string): { name: string; icon: string; rarity: LootRarity } | null {
  const tier = seedZipTierFromItemId(itemId)
  if (tier) {
    return { name: `${SEED_ZIP_LABELS[tier]} Seed Zip`, icon: SEED_ZIP_ICONS[tier], rarity: tier }
  }
  return null
}
