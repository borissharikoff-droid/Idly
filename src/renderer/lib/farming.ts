import type { ChestType, LootRarity } from './loot'
import { skillLevelFromXP } from './skills'

// ─── Seed definitions ───────────────────────────────────────────────────────

export interface SeedDef {
  id: string
  name: string
  rarity: LootRarity
  icon: string
  image?: string
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
  30_000,   // slot 8  — Field 2 begins
  40_000,   // slot 9
  55_000,   // slot 10
  75_000,   // slot 11
  100_000,  // slot 12
  130_000,  // slot 13
  170_000,  // slot 14
  220_000,  // slot 15
]

export const MAX_FARM_SLOTS = 16

/** Per-slot unlock requirements beyond gold. */
export interface SlotRequirement {
  farmerLevel: number
  /** Optional secondary skill requirement. */
  secondarySkill?: { skillId: string; level: number }
}

export const SLOT_UNLOCK_REQUIREMENTS: SlotRequirement[] = [
  { farmerLevel: 0 },   // slot 0
  { farmerLevel: 0 },   // slot 1
  { farmerLevel: 0 },   // slot 2
  { farmerLevel: 5 },   // slot 3
  { farmerLevel: 10 },  // slot 4
  { farmerLevel: 15 },  // slot 5
  { farmerLevel: 20 },  // slot 6
  { farmerLevel: 25 },  // slot 7
  { farmerLevel: 30 },  // slot 8
  { farmerLevel: 35 },  // slot 9
  { farmerLevel: 40 },  // slot 10
  { farmerLevel: 45, secondarySkill: { skillId: 'crafter', level: 10 } },  // slot 11
  { farmerLevel: 50 },  // slot 12
  { farmerLevel: 55, secondarySkill: { skillId: 'warrior', level: 15 } },  // slot 13
  { farmerLevel: 60, secondarySkill: { skillId: 'crafter', level: 20 } },  // slot 14
  { farmerLevel: 70, secondarySkill: { skillId: 'warrior', level: 25 } },  // slot 15
]

/** Field definitions — slots split across two tabs. */
export const FIELD_DEFS = [
  { id: 'field1' as const, label: 'Field 1', slots: [0, 1, 2, 3, 4, 5, 6, 7] },
  { id: 'field2' as const, label: 'Field 2', slots: [8, 9, 10, 11, 12, 13, 14, 15] },
]
export type FieldId = typeof FIELD_DEFS[number]['id']

/** Check if a player meets all requirements for unlocking a slot. */
export function canUnlockSlot(slotIndex: number, gold: number, skillXP: Record<string, number>): { canUnlock: boolean; missingGold: boolean; missingFarmer: boolean; missingSecondary: boolean; req: SlotRequirement } {
  const cost = SLOT_UNLOCK_COSTS[slotIndex] ?? 0
  const req = SLOT_UNLOCK_REQUIREMENTS[slotIndex] ?? { farmerLevel: 0 }
  const farmerLvl = skillLevelFromXP(skillXP['farmer'] ?? 0)
  const missingGold = gold < cost
  const missingFarmer = farmerLvl < req.farmerLevel
  let missingSecondary = false
  if (req.secondarySkill) {
    const secLvl = skillLevelFromXP(skillXP[req.secondarySkill.skillId] ?? 0)
    missingSecondary = secLvl < req.secondarySkill.level
  }
  return { canUnlock: !missingGold && !missingFarmer && !missingSecondary, missingGold, missingFarmer, missingSecondary, req }
}

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

/** Custom images per tier — populated by applyAdminConfig when overrides exist */
export const SEED_ZIP_IMAGES: Record<SeedZipTier, string> = {
  common: '',
  rare: '',
  epic: '',
  legendary: '',
}

/** Returns effective display info for a seed zip tier (respects admin overrides). */
export function getSeedZipDisplay(tier: SeedZipTier): { name: string; icon: string; image: string } {
  return {
    name: `${SEED_ZIP_LABELS[tier]} Seed Zip`,
    icon: SEED_ZIP_ICONS[tier],
    image: SEED_ZIP_IMAGES[tier] ?? '',
  }
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

// ─── Warrior XP helper ───────────────────────────────────────────────────────

/** Grant XP to the Warrior skill. Writes to both SQLite (via IPC) and localStorage. */
export async function grantWarriorXP(amount: number): Promise<void> {
  if (amount <= 0) return
  const skillId = 'warrior'

  try {
    const api = (window as Window & typeof globalThis & { electronAPI?: { db?: { addSkillXP?: (id: string, xp: number) => Promise<void> } } }).electronAPI
    if (api?.db?.addSkillXP) {
      await api.db.addSkillXP(skillId, amount)
    }
  } catch {
    // ignore IPC errors
  }

  try {
    const stored = JSON.parse(localStorage.getItem('grindly_skill_xp') || '{}') as Record<string, number>
    stored[skillId] = (stored[skillId] ?? 0) + amount
    localStorage.setItem('grindly_skill_xp', JSON.stringify(stored))
  } catch {
    // ignore storage errors
  }
}

// ─── Crafter XP helper ───────────────────────────────────────────────────────

/** Grant XP to the Crafter skill. Writes to both SQLite (via IPC) and localStorage. */
export async function grantCrafterXP(amount: number): Promise<void> {
  if (amount <= 0) return
  const skillId = 'crafter'

  try {
    const api = (window as Window & typeof globalThis & { electronAPI?: { db?: { addSkillXP?: (id: string, xp: number) => Promise<void> } } }).electronAPI
    if (api?.db?.addSkillXP) {
      await api.db.addSkillXP(skillId, amount)
    }
  } catch {
    // ignore IPC errors
  }

  try {
    const stored = JSON.parse(localStorage.getItem('grindly_skill_xp') || '{}') as Record<string, number>
    stored[skillId] = (stored[skillId] ?? 0) + amount
    localStorage.setItem('grindly_skill_xp', JSON.stringify(stored))
  } catch {
    // ignore storage errors
  }
}

// ─── Chef XP helper ─────────────────────────────────────────────────────────

/** Grant XP to the Chef skill. Writes to both SQLite (via IPC) and localStorage. */
export async function grantChefXP(amount: number): Promise<void> {
  if (amount <= 0) return
  const skillId = 'chef'

  try {
    const api = (window as Window & typeof globalThis & { electronAPI?: { db?: { addSkillXP?: (id: string, xp: number) => Promise<void> } } }).electronAPI
    if (api?.db?.addSkillXP) {
      await api.db.addSkillXP(skillId, amount)
    }
  } catch {
    // ignore IPC errors
  }

  try {
    const stored = JSON.parse(localStorage.getItem('grindly_skill_xp') || '{}') as Record<string, number>
    stored[skillId] = (stored[skillId] ?? 0) + amount
    localStorage.setItem('grindly_skill_xp', JSON.stringify(stored))
  } catch {
    // ignore storage errors
  }
}

// ─── Plant → Combat buff map ─────────────────────────────────────────────────

export const PLANT_COMBAT_BUFFS: Record<string, { atk: number; hp: number; hpRegen: number; def: number }> = {
  wheat:        { atk: 0,  hp: 5,  hpRegen: 0, def: 0 },
  herbs:        { atk: 0,  hp: 0,  hpRegen: 2, def: 0 },
  apples:       { atk: 0,  hp: 15, hpRegen: 0, def: 1 },
  blossoms:     { atk: 2,  hp: 0,  hpRegen: 0, def: 0 },
  clovers:      { atk: 5,  hp: 0,  hpRegen: 0, def: 0 },
  orchids:      { atk: 0,  hp: 0,  hpRegen: 4, def: 1 },
  star_bloom:   { atk: 8,  hp: 0,  hpRegen: 0, def: 0 },
  crystal_root: { atk: 0,  hp: 30, hpRegen: 0, def: 2 },
  void_blossom: { atk: 15, hp: 0,  hpRegen: 0, def: 0 },
}

// ─── Farmer level bonuses ────────────────────────────────────────────────────

/** Grow-time multiplier by farmer level (lower = faster). Same curve as crafter/chef. */
export function getFarmerSpeedMultiplier(level: number): number {
  if (level >= 80) return 0.40
  if (level >= 60) return 0.55
  if (level >= 40) return 0.70
  if (level >= 25) return 0.80
  if (level >= 10) return 0.90
  return 1.0
}

/** Chance per harvest to get +1 bonus yield. */
export function getFarmerBonusYieldChance(level: number): number {
  if (level >= 60) return 0.45
  if (level >= 25) return 0.15
  return 0
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

/** Returns display info for farm-specific item IDs (seeds, seed zips) not found in LOOT_ITEMS. */
export function getFarmItemDisplay(itemId: string): { name: string; icon: string; image?: string; rarity: LootRarity } | null {
  const tier = seedZipTierFromItemId(itemId)
  if (tier) {
    const d = getSeedZipDisplay(tier)
    return { name: d.name, icon: d.icon, image: d.image || undefined, rarity: tier }
  }
  const seed = SEED_DEFS.find((s) => s.id === itemId)
  if (seed) {
    return { name: seed.name, icon: seed.icon, image: seed.image, rarity: seed.rarity }
  }
  return null
}

// ─── Harvest Fail Chance ─────────────────────────────────────────────────────

/** Base harvest-fail chance by seed rarity (1 – 50 %). Higher rarity = riskier. */
export const FAIL_CHANCE_BY_RARITY: Record<LootRarity, number> = {
  common: 0.12,
  rare: 0.17,
  epic: 0.22,
  legendary: 0.27,
  mythic: 0.32,
}

/** Farmer-skill reduction of harvest-fail chance by level tier. */
export function getFarmerFailReduction(level: number): number {
  if (level >= 80) return 0.15
  if (level >= 60) return 0.12
  if (level >= 40) return 0.08
  if (level >= 25) return 0.05
  if (level >= 10) return 0.02
  return 0
}

/** Effective harvest-fail chance (accounts for farmhouse + farmer skill). Clamped 1 – 50 %. */
export function getEffectiveFailChance(seedRarity: LootRarity, farmhouseLevel: number, farmerLevel: number = 0): number {
  const base = FAIL_CHANCE_BY_RARITY[seedRarity] ?? 0.15
  const farmhouseReduction = farmhouseLevel * 0.02
  const farmerReduction = getFarmerFailReduction(farmerLevel)
  return Math.min(0.50, Math.max(0.01, base - farmhouseReduction - farmerReduction))
}

/** Roll whether a harvest fails. Returns true if the harvest failed. */
export function rollHarvestFail(seedRarity: LootRarity, farmhouseLevel: number, farmerLevel: number = 0): boolean {
  return Math.random() < getEffectiveFailChance(seedRarity, farmhouseLevel, farmerLevel)
}

/** Roll whether a planted crop will rot, and if so at what fraction of grow time.
 *  Returns null if no rot, or { rotAtFraction } if it will rot. */
export function rollCropRot(seedRarity: LootRarity, farmhouseLevel: number): { rotAtFraction: number } | null {
  const baseChance = FAIL_CHANCE_BY_RARITY[seedRarity] ?? 0.15
  const reduction = farmhouseLevel * 0.02
  const effectiveChance = Math.max(0, baseChance - reduction)
  if (Math.random() >= effectiveChance) return null
  const rotAtFraction = 0.3 + Math.random() * 0.4
  return { rotAtFraction }
}

/** Get effective rot chance for display (accounts for farmhouse). */
export function getEffectiveRotChance(seedRarity: LootRarity, farmhouseLevel: number): number {
  const baseChance = FAIL_CHANCE_BY_RARITY[seedRarity] ?? 0.15
  return Math.max(0, baseChance - farmhouseLevel * 0.02)
}

// ─── Farmhouse ───────────────────────────────────────────────────────────────

export const FARMHOUSE_UNLOCK_LEVEL = 45

export interface FarmhouseLevelDef {
  level: number
  goldCost: number
  materials: Record<string, number>
  buildDurationMs: number         // construction time in ms
  bonuses: {
    rotReductionPct: number       // flat reduction (already baked into rollCropRot via level)
    growSpeedPct: number          // growth time reduction %
    autoCompostPct: number        // chance to auto-compost on plant
    yieldBonusPct: number         // extra yield %
    autoHarvest: boolean          // auto-collect ready crops
  }
}

export const FARMHOUSE_LEVELS: FarmhouseLevelDef[] = [
  { level: 1,  goldCost: 8_000,    materials: { apples: 15, blossoms: 10, iron_bar: 5 },                                buildDurationMs: 5 * 60_000,         bonuses: { rotReductionPct: 2,  growSpeedPct: 3,  autoCompostPct: 0,  yieldBonusPct: 0,  autoHarvest: false } },
  { level: 2,  goldCost: 18_000,   materials: { apples: 20, blossoms: 15, ore_iron: 20, wooden_sword: 1 },              buildDurationMs: 20 * 60_000,        bonuses: { rotReductionPct: 4,  growSpeedPct: 5,  autoCompostPct: 5,  yieldBonusPct: 0,  autoHarvest: false } },
  { level: 3,  goldCost: 35_000,   materials: { clovers: 10, orchids: 5, copper_sword: 1, magic_essence: 5 },           buildDurationMs: 60 * 60_000,        bonuses: { rotReductionPct: 6,  growSpeedPct: 8,  autoCompostPct: 8,  yieldBonusPct: 5,  autoHarvest: false } },
  { level: 4,  goldCost: 55_000,   materials: { clovers: 15, orchids: 10, orc_shard: 8, copper_plate: 1 },              buildDurationMs: 3 * 3_600_000,      bonuses: { rotReductionPct: 8,  growSpeedPct: 10, autoCompostPct: 10, yieldBonusPct: 5,  autoHarvest: false } },
  { level: 5,  goldCost: 85_000,   materials: { star_bloom: 5, crystal_root: 3, troll_hide: 5, shadow_sword: 1 },       buildDurationMs: 8 * 3_600_000,      bonuses: { rotReductionPct: 10, growSpeedPct: 13, autoCompostPct: 13, yieldBonusPct: 10, autoHarvest: false } },
  { level: 6,  goldCost: 130_000,  materials: { star_bloom: 8, crystal_root: 5, ancient_scale: 5, shadow_plate: 1 },    buildDurationMs: 24 * 3_600_000,     bonuses: { rotReductionPct: 12, growSpeedPct: 15, autoCompostPct: 15, yieldBonusPct: 10, autoHarvest: false } },
  { level: 7,  goldCost: 180_000,  materials: { crystal_root: 8, void_blossom: 2, void_crystal: 3, golden_sword: 1 },   buildDurationMs: 3 * 86_400_000,     bonuses: { rotReductionPct: 14, growSpeedPct: 18, autoCompostPct: 18, yieldBonusPct: 15, autoHarvest: false } },
  { level: 8,  goldCost: 250_000,  materials: { void_blossom: 5, dragon_scale: 5, golden_plate: 1, troll_heart: 1 },    buildDurationMs: 5 * 86_400_000,     bonuses: { rotReductionPct: 16, growSpeedPct: 20, autoCompostPct: 20, yieldBonusPct: 15, autoHarvest: false } },
  { level: 9,  goldCost: 350_000,  materials: { void_blossom: 8, dragon_scale: 8, void_crystal: 5, dragon_heart: 1 },   buildDurationMs: 5 * 86_400_000,     bonuses: { rotReductionPct: 18, growSpeedPct: 23, autoCompostPct: 23, yieldBonusPct: 20, autoHarvest: false } },
  { level: 10, goldCost: 500_000,  materials: { void_blossom: 15, crystal_root: 20, void_crystal: 10, void_sword: 1 },  buildDurationMs: 5 * 86_400_000,     bonuses: { rotReductionPct: 20, growSpeedPct: 25, autoCompostPct: 25, yieldBonusPct: 25, autoHarvest: true } },
]

/** Get farmhouse bonuses for a given level. Level 0 = no farmhouse. */
export function getFarmhouseBonuses(level: number): FarmhouseLevelDef['bonuses'] {
  if (level <= 0) return { rotReductionPct: 0, growSpeedPct: 0, autoCompostPct: 0, yieldBonusPct: 0, autoHarvest: false }
  const def = FARMHOUSE_LEVELS[Math.min(level, FARMHOUSE_LEVELS.length) - 1]
  return def.bonuses
}

/** Get effective grow time after farmhouse speed bonus. */
export function getEffectiveGrowTime(baseSeconds: number, farmhouseLevel: number): number {
  const bonus = getFarmhouseBonuses(farmhouseLevel)
  return Math.ceil(baseSeconds * (1 - bonus.growSpeedPct / 100))
}

/** Get the next farmhouse level definition (for upgrade UI). Null if max. */
export function getNextFarmhouseUpgrade(currentLevel: number): FarmhouseLevelDef | null {
  if (currentLevel >= FARMHOUSE_LEVELS.length) return null
  return FARMHOUSE_LEVELS[currentLevel] // 0-indexed, so level 0 → index 0 is level 1 upgrade
}

/** Farmhouse visual progression. */
export const FARMHOUSE_ICONS: Record<number, string> = {
  0: '🏚️',
  1: '🏠',
  2: '🏠',
  3: '🏡',
  4: '🏡',
  5: '🏘️',
  6: '🏘️',
  7: '🏰',
  8: '🏰',
  9: '🏰',
  10: '🏰',
}

export function getFarmhouseIcon(level: number): string {
  return FARMHOUSE_ICONS[Math.min(level, 10)] ?? '🏚️'
}
