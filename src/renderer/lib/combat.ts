import { getCombatStatsFromEquipped, type CombatStats, type ChestType } from './loot'
import type { LootSlot } from './loot'

const BASE_ATK = 5
const BASE_HP = 100
const BASE_DEF = 0

// ─── Seeded PRNG for deterministic dynamic damage ───────────────────────────

/** Default damage spread: ±20% of base ATK per tick. */
export const DEFAULT_ATK_SPREAD = 0.2

/** Simple seeded PRNG (mulberry32). Returns values in [0, 1). */
function mulberry32(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6D2B79F5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Returns damage with ±spread variance around base. */
function variedDamage(base: number, spread: number, rng: () => number): number {
  const factor = 1 + (rng() * 2 - 1) * spread
  return base * factor
}

export interface BossRequirements {
  minAtk?: number
  minHp?: number
  minHpRegen?: number
  minDef?: number
  /** Per-skill level requirements. e.g. { gamer: 5 } means Gamer must be level 5+ */
  minSkillLevel?: Partial<Record<string, number>>
}

export interface BossDef {
  id: string
  name: string
  /** Emoji or character for the boss (e.g. 💧 🐺). Shown when image is absent. */
  icon: string
  /** Optional image path for boss sprite (pixel art). */
  image?: string
  hp: number
  atk: number
  def?: number
  /** Damage spread: ±fraction of atk per tick. Defaults to DEFAULT_ATK_SPREAD. */
  atkSpread?: number
  rewards: { chestTier: ChestType }
  requirements?: BossRequirements
  /** Boss-exclusive material drop (guaranteed on kill). */
  materialDropId?: string
  materialDropQty?: number
}

export interface MobDef {
  id: string
  name: string
  icon: string
  /** Optional uploaded image (base64 data URL). Shown when set, falls back to icon. */
  image?: string
  hp: number
  atk: number
  def?: number
  /** Damage spread: ±fraction of atk per tick. Defaults to DEFAULT_ATK_SPREAD. */
  atkSpread?: number
  xpReward: number
  goldMin: number
  goldMax: number
  materialDropId?: string
  materialDropChance?: number
  /** How many materials drop on success (default 1). */
  materialDropQty?: number
}

export interface EntryCost {
  itemId: string
  quantity: number
}

export interface ZoneDef {
  id: string
  name: string
  icon: string
  /** Optional uploaded image (base64 data URL). Shown when set, falls back to icon. */
  image?: string
  themeColor: string
  mobs: [MobDef, MobDef, MobDef]
  boss: BossDef
  warriorLevelRequired?: number
  prevZoneId?: string
  /** Item IDs player must own (in inventory or equipped) to enter this zone. */
  gateItems?: string[]
  /** Items consumed each time the player enters this dungeon. */
  entryCost?: EntryCost[]
}

export const ZONES: ZoneDef[] = [
  // ── Zone 1 — Slime Cavern (target: partial Wooden → ~8 ATK, 100 HP; full Wooden → 11/115/1) ──
  {
    id: 'zone1',
    name: 'Slime Cavern',
    icon: '🌊',
    themeColor: '#22d3ee',
    entryCost: [{ itemId: 'wheat', quantity: 3 }],
    mobs: [
      { id: 'slime_scout',  name: 'Slime Scout',  icon: '🫧', hp: 80,    atk: 1.5, xpReward: 15,    goldMin: 10,  goldMax: 22,   materialDropId: 'slime_gel', materialDropChance: 0.3 },
      { id: 'slime_guard',  name: 'Slime Guard',  icon: '🫧', hp: 150,   atk: 2,   xpReward: 25,    goldMin: 15,  goldMax: 30,   materialDropId: 'slime_gel', materialDropChance: 0.4 },
      { id: 'slime_brute',  name: 'Slime Brute',  icon: '🫧', hp: 250,   atk: 3,   xpReward: 40,    goldMin: 22,  goldMax: 40,   materialDropId: 'slime_gel', materialDropChance: 0.5 },
    ],
    boss: {
      id: 'slime', name: 'Slime King', icon: '💧', hp: 350, atk: 3,
      rewards: { chestTier: 'common_chest' },
      materialDropId: 'slime_gel', materialDropQty: 3,
    },
  },
  // ── Zone 2 — Goblin Outpost (target: Copper set → 18 ATK, 155 HP, 2 Regen) ─
  {
    id: 'zone2',
    name: 'Goblin Outpost',
    icon: '🏕️',
    themeColor: '#84cc16',
    prevZoneId: 'zone1',
    warriorLevelRequired: 3,
    entryCost: [{ itemId: 'herbs', quantity: 3 }],
    mobs: [
      { id: 'goblin_scout',   name: 'Goblin Scout',   icon: '👺', hp: 220,   atk: 2.5, xpReward: 60,   goldMin: 10,  goldMax: 20,   materialDropId: 'goblin_tooth', materialDropChance: 0.3 },
      { id: 'goblin_warrior', name: 'Goblin Warrior',  icon: '👺', hp: 350,   atk: 3.5, xpReward: 100,  goldMin: 15,  goldMax: 30,   materialDropId: 'goblin_tooth', materialDropChance: 0.4 },
      { id: 'goblin_shaman',  name: 'Goblin Shaman',  icon: '👺', hp: 480,   atk: 4,   xpReward: 150,  goldMin: 20,  goldMax: 40,   materialDropId: 'goblin_tooth', materialDropChance: 0.5 },
    ],
    boss: {
      id: 'goblin', name: 'Goblin Chief', icon: '👺', hp: 600, atk: 4.5,
      rewards: { chestTier: 'rare_chest' },
      requirements: { minAtk: 10 },
      materialDropId: 'goblin_tooth', materialDropQty: 3,
    },
  },
  // ── Zone 3 — Wild Forest (target: Copper set → 18 ATK, 155 HP, 2 Regen; rewards Shadow gear) ────
  {
    id: 'zone3',
    name: 'Wild Forest',
    icon: '🌲',
    themeColor: '#16a34a',
    prevZoneId: 'zone2',
    warriorLevelRequired: 8,
    gateItems: ['craft_slime_shield'],
    entryCost: [{ itemId: 'slime_gel', quantity: 2 }, { itemId: 'apples', quantity: 1 }],
    mobs: [
      { id: 'wolf_young', name: 'Young Wolf',  icon: '🐺', hp: 320,   atk: 3.5, def: 1, xpReward: 150,   goldMin: 20,  goldMax: 40,   materialDropId: 'wolf_fang', materialDropChance: 0.3 },
      { id: 'wolf_pack',  name: 'Pack Wolf',   icon: '🐺', hp: 450,   atk: 4.5, def: 2, xpReward: 250,   goldMin: 30,  goldMax: 55,   materialDropId: 'wolf_fang', materialDropChance: 0.4 },
      { id: 'wolf_alpha', name: 'Alpha Wolf',  icon: '🐺', hp: 580,   atk: 5,   def: 2, xpReward: 400,   goldMin: 45,  goldMax: 80,   materialDropId: 'wolf_fang', materialDropChance: 0.5 },
    ],
    boss: {
      id: 'wolf', name: 'Forest Wolf', icon: '🐺', hp: 650, atk: 5, def: 2,
      rewards: { chestTier: 'epic_chest' },
      requirements: { minAtk: 12, minHp: 130 },
      materialDropId: 'wolf_fang', materialDropQty: 2,
    },
  },
  // ── Zone 4 — Orc Stronghold (target: Shadow set → 34 ATK, 205 HP, 5 Regen) ─
  {
    id: 'zone4',
    name: 'Orc Stronghold',
    icon: '🪨',
    themeColor: '#d97706',
    prevZoneId: 'zone3',
    warriorLevelRequired: 15,
    gateItems: ['craft_goblin_blade'],
    entryCost: [{ itemId: 'goblin_tooth', quantity: 3 }, { itemId: 'blossoms', quantity: 2 }],
    mobs: [
      { id: 'orc_grunt',  name: 'Orc Grunt',  icon: '👹', hp: 800,   atk: 6,   def: 3, xpReward: 800,   goldMin: 60,  goldMax: 120,  materialDropId: 'orc_shard', materialDropChance: 0.3, materialDropQty: 2 },
      { id: 'orc_brute',  name: 'Orc Brute',  icon: '👹', hp: 1200,  atk: 7,   def: 4, xpReward: 1400,  goldMin: 90,  goldMax: 160,  materialDropId: 'orc_shard', materialDropChance: 0.4, materialDropQty: 2 },
      { id: 'orc_shaman', name: 'Orc Shaman', icon: '👹', hp: 1600,  atk: 8,   def: 5, xpReward: 2000,  goldMin: 120, goldMax: 200,  materialDropId: 'orc_shard', materialDropChance: 0.5, materialDropQty: 3 },
    ],
    boss: {
      id: 'orc', name: 'Orc Warlord', icon: '👹', hp: 1800, atk: 8.5, def: 6,
      rewards: { chestTier: 'legendary_chest' },
      requirements: { minAtk: 25, minHp: 180, minHpRegen: 4 },
      materialDropId: 'warlord_sigil', materialDropQty: 1,
    },
  },
  // ── Zone 5 — Troll Bridge (target: Golden set → 49 ATK, 250 HP, 7 Regen) ───
  {
    id: 'zone5',
    name: 'Troll Bridge',
    icon: '🌉',
    themeColor: '#7c3aed',
    prevZoneId: 'zone4',
    warriorLevelRequired: 25,
    gateItems: ['craft_wolf_pendant', 'craft_orc_plate'],
    entryCost: [{ itemId: 'wolf_fang', quantity: 2 }, { itemId: 'orc_shard', quantity: 2 }, { itemId: 'clovers', quantity: 2 }],
    mobs: [
      { id: 'troll_bridge', name: 'Bridge Troll', icon: '🧌', hp: 1400,  atk: 8,    def: 4, xpReward: 3000,  goldMin: 150, goldMax: 250,  materialDropId: 'troll_hide', materialDropChance: 0.3, materialDropQty: 2 },
      { id: 'troll_stone',  name: 'Stone Troll',  icon: '🧌', hp: 2000,  atk: 9,    def: 5, xpReward: 5000,  goldMin: 200, goldMax: 350,  materialDropId: 'troll_hide', materialDropChance: 0.4, materialDropQty: 3 },
      { id: 'troll_ancient',name: 'Ancient Troll', icon: '🧌', hp: 2700,  atk: 10,   def: 6, xpReward: 7500,  goldMin: 280, goldMax: 450,  materialDropId: 'troll_hide', materialDropChance: 0.5, materialDropQty: 3 },
    ],
    boss: {
      id: 'troll', name: 'Troll Overlord', icon: '🧌', hp: 2900, atk: 10.5, def: 7, atkSpread: 0.25,
      rewards: { chestTier: 'legendary_chest' },
      requirements: { minAtk: 40, minHp: 230, minHpRegen: 7 },
      materialDropId: 'troll_heart', materialDropQty: 1,
    },
  },
  // ── Zone 6 — Dragon Lair (target: Void set → 67 ATK, 330 HP, 10 Regen + warrior bonuses)
  {
    id: 'zone6',
    name: 'Dragon Lair',
    icon: '🔥',
    themeColor: '#ef4444',
    prevZoneId: 'zone5',
    warriorLevelRequired: 40,
    gateItems: ['craft_troll_cloak'],
    entryCost: [{ itemId: 'troll_hide', quantity: 2 }, { itemId: 'orchids', quantity: 2 }],
    mobs: [
      { id: 'dragon_whelp',  name: 'Dragon Whelp',  icon: '🐉', hp: 2000,  atk: 12,   def: 6,  atkSpread: 0.3, xpReward: 10000, goldMin: 200,  goldMax: 350,  materialDropId: 'dragon_scale', materialDropChance: 0.3, materialDropQty: 2 },
      { id: 'dragon_guard',  name: 'Dragon Guard',  icon: '🐉', hp: 2800,  atk: 13,   def: 7,  atkSpread: 0.3, xpReward: 18000, goldMin: 280,  goldMax: 450,  materialDropId: 'dragon_scale', materialDropChance: 0.4, materialDropQty: 3 },
      { id: 'dragon_elder',  name: 'Elder Dragon',  icon: '🐉', hp: 3800,  atk: 14.5, def: 9,  atkSpread: 0.3, xpReward: 28000, goldMin: 350,  goldMax: 500,  materialDropId: 'dragon_scale', materialDropChance: 0.5, materialDropQty: 4 },
    ],
    boss: {
      id: 'dragon', name: 'Ancient Dragon', icon: '🐉', hp: 4200, atk: 15, def: 10, atkSpread: 0.35,
      rewards: { chestTier: 'legendary_chest' },
      requirements: { minAtk: 55, minHp: 300, minHpRegen: 10 },
      materialDropId: 'dragon_heart', materialDropQty: 1,
    },
  },
  // ── Zone 7 — Shadow Crypt (target: post-Void, needs dragon materials to enter)
  {
    id: 'zone7',
    name: 'Shadow Crypt',
    icon: '💀',
    themeColor: '#a855f7',
    prevZoneId: 'zone6',
    warriorLevelRequired: 55,
    entryCost: [{ itemId: 'dragon_scale', quantity: 2 }, { itemId: 'dragon_heart', quantity: 1 }],
    mobs: [
      { id: 'skeleton_archer', name: 'Skeleton Archer', icon: '💀', hp: 2800, atk: 16,   def: 8,  atkSpread: 0.3,  xpReward: 35000,  goldMin: 280, goldMax: 420,  materialDropId: 'shadow_dust', materialDropChance: 0.3, materialDropQty: 2 },
      { id: 'zombie_knight',   name: 'Zombie Knight',   icon: '💀', hp: 4000, atk: 17,   def: 10, atkSpread: 0.3,  xpReward: 55000,  goldMin: 380, goldMax: 580,  materialDropId: 'shadow_dust', materialDropChance: 0.4, materialDropQty: 3 },
      { id: 'lich_apprentice', name: 'Lich Apprentice', icon: '💀', hp: 5200, atk: 18.5, def: 11, atkSpread: 0.35, xpReward: 80000,  goldMin: 480, goldMax: 700,  materialDropId: 'shadow_dust', materialDropChance: 0.5, materialDropQty: 4 },
    ],
    boss: {
      id: 'lich', name: 'Necromancer Lord', icon: '💀', hp: 6500, atk: 20, def: 13, atkSpread: 0.4,
      rewards: { chestTier: 'legendary_chest' },
      requirements: { minAtk: 75, minHp: 380, minHpRegen: 13, minDef: 8 },
      materialDropId: 'lich_crystal', materialDropQty: 1,
    },
  },
  // ── Zone 8 — Celestial Spire (target: endgame, requires lich_crystal to enter)
  {
    id: 'zone8',
    name: 'Celestial Spire',
    icon: '⚡',
    themeColor: '#38bdf8',
    prevZoneId: 'zone7',
    warriorLevelRequired: 75,
    entryCost: [{ itemId: 'lich_crystal', quantity: 2 }, { itemId: 'troll_heart', quantity: 1 }],
    mobs: [
      { id: 'sky_serpent',     name: 'Sky Serpent',     icon: '🐍', hp: 4500, atk: 21, def: 11, atkSpread: 0.3,  xpReward: 100000, goldMin: 450, goldMax: 650,  materialDropId: 'storm_shard', materialDropChance: 0.3, materialDropQty: 2 },
      { id: 'thunder_drake',   name: 'Thunder Drake',   icon: '🦅', hp: 6200, atk: 23, def: 13, atkSpread: 0.35, xpReward: 160000, goldMin: 600, goldMax: 900,  materialDropId: 'storm_shard', materialDropChance: 0.4, materialDropQty: 3 },
      { id: 'storm_elemental', name: 'Storm Elemental', icon: '🌪️', hp: 8000, atk: 25, def: 15, atkSpread: 0.4,  xpReward: 230000, goldMin: 750, goldMax: 1100, materialDropId: 'storm_shard', materialDropChance: 0.5, materialDropQty: 4 },
    ],
    boss: {
      id: 'titan', name: 'Storm Titan', icon: '⚡', hp: 10000, atk: 28, def: 18, atkSpread: 0.45,
      rewards: { chestTier: 'legendary_chest' },
      requirements: { minAtk: 100, minHp: 500, minHpRegen: 18, minDef: 15 },
      materialDropId: 'titan_core', materialDropQty: 1,
    },
  },
]

/** Warrior XP granted on boss kill by boss id */
export const BOSS_WARRIOR_XP: Record<string, number> = {
  slime: 100,
  goblin: 300,
  wolf: 700,
  orc: 2000,
  troll: 5000,
  dragon: 12000,
  lich: 30000,
  titan: 80000,
}

/** Backward compat: flat list of boss defs */
export const BOSSES: BossDef[] = ZONES.map((z) => z.boss)

export function computePlayerStats(
  equippedBySlot: Partial<Record<LootSlot, string>>,
  permanentStats?: { atk: number; hp: number; hpRegen: number; def?: number },
  additionalBonuses?: { atk: number; hp: number; hpRegen: number; def?: number },
): CombatStats {
  const fromItems = getCombatStatsFromEquipped(equippedBySlot)
  return {
    atk: BASE_ATK + fromItems.atk + (permanentStats?.atk ?? 0) + (additionalBonuses?.atk ?? 0),
    hp: BASE_HP + fromItems.hp + (permanentStats?.hp ?? 0) + (additionalBonuses?.hp ?? 0),
    hpRegen: fromItems.hpRegen + (permanentStats?.hpRegen ?? 0) + (additionalBonuses?.hpRegen ?? 0),
    def: BASE_DEF + fromItems.def + (permanentStats?.def ?? 0) + (additionalBonuses?.def ?? 0),
  }
}

export function computeWarriorBonuses(level: number): { atk: number; hp: number; hpRegen: number; def: number } {
  return {
    atk: (level >= 5 ? 1 : 0) + (level >= 20 ? 1 : 0) + (level >= 40 ? 2 : 0) + (level >= 75 ? 3 : 0),
    hp: (level >= 15 ? 5 : 0) + (level >= 60 ? 10 : 0),
    hpRegen: (level >= 30 ? 1 : 0) + (level >= 75 ? 2 : 0),
    def: (level >= 50 ? 2 : 0) + (level >= 80 ? 3 : 0),
  }
}

export interface BattleOutcome {
  willWin: boolean
  tWinSeconds: number
  tLoseSeconds: number
}

export function meetsBossRequirements(
  player: CombatStats,
  skillLevels: Record<string, number>,
  boss: BossDef,
): boolean {
  const req = boss.requirements
  if (!req) return true
  if (req.minAtk != null && player.atk < req.minAtk) return false
  if (req.minHp != null && player.hp < req.minHp) return false
  if (req.minHpRegen != null && player.hpRegen < req.minHpRegen) return false
  if (req.minDef != null && player.def < req.minDef) return false
  if (req.minSkillLevel) {
    for (const [skillId, minLevel] of Object.entries(req.minSkillLevel)) {
      if ((skillLevels[skillId] ?? 0) < (minLevel ?? 0)) return false
    }
  }
  return true
}

export function isZoneUnlocked(
  zone: ZoneDef,
  skillLevels: Record<string, number>,
  clearedZones: string[],
  ownedItems?: Record<string, number>,
): boolean {
  if (zone.prevZoneId && !clearedZones.includes(zone.prevZoneId)) return false
  if (zone.warriorLevelRequired && (skillLevels['warrior'] ?? 0) < zone.warriorLevelRequired) return false
  if (zone.gateItems && ownedItems) {
    for (const itemId of zone.gateItems) {
      if ((ownedItems[itemId] ?? 0) < 1) return false
    }
  }
  return true
}

/** Returns gate items the player is missing for a zone. */
export function getMissingGateItems(zone: ZoneDef, ownedItems: Record<string, number>): string[] {
  if (!zone.gateItems) return []
  return zone.gateItems.filter((id) => (ownedItems[id] ?? 0) < 1)
}

/** Check if the player has enough items to pay the dungeon entry cost. */
export function canAffordEntry(zone: ZoneDef, ownedItems: Record<string, number>): boolean {
  if (!zone.entryCost) return true
  return zone.entryCost.every((c) => (ownedItems[c.itemId] ?? 0) >= c.quantity)
}

/** Returns entry cost items the player doesn't have enough of. */
export function getMissingEntryCost(zone: ZoneDef, ownedItems: Record<string, number>): Array<EntryCost & { owned: number }> {
  if (!zone.entryCost) return []
  return zone.entryCost
    .filter((c) => (ownedItems[c.itemId] ?? 0) < c.quantity)
    .map((c) => ({ ...c, owned: ownedItems[c.itemId] ?? 0 }))
}

export function getDailyBossId(): string {
  const today = new Date().toLocaleDateString('sv-SE')
  let hash = 0
  for (const c of today) hash = (hash * 31 + c.charCodeAt(0)) >>> 0
  return BOSSES[hash % BOSSES.length].id
}

/** DEF/regen can mitigate at most 85% of incoming DPS — always deals ≥15% of ATK. */
const MIN_DAMAGE_FRACTION = 0.15

/** Net DPS from boss to player, accounting for DEF + regen with a minimum damage floor. */
export function effectiveBossDps(bossAtk: number, playerRegen: number, playerDef = 0): number {
  return Math.max(bossAtk * MIN_DAMAGE_FRACTION, bossAtk - playerDef - playerRegen)
}

/** Net DPS from player to enemy, accounting for enemy DEF with a minimum damage floor. */
export function effectivePlayerDps(playerAtk: number, enemyDef = 0): number {
  return Math.max(playerAtk * MIN_DAMAGE_FRACTION, playerAtk - enemyDef)
}

/** Average-based outcome prediction (no variance). Used for quick win/loss checks. */
export function computeBattleOutcome(player: CombatStats, boss: BossDef | MobDef): BattleOutcome {
  const playerDPS = effectivePlayerDps(player.atk, boss.def ?? 0)
  const tWinSeconds = boss.hp / playerDPS
  const eDPS = effectiveBossDps(boss.atk, player.hpRegen, player.def)
  const tLoseSeconds = eDPS > 0 ? player.hp / eDPS : Infinity
  const willWin = tWinSeconds < tLoseSeconds
  return { willWin, tWinSeconds, tLoseSeconds }
}

export interface BattleStateAtTime {
  playerHp: number
  bossHp: number
  elapsedSeconds: number
  isComplete: boolean
  victory: boolean | null
}

/**
 * Tick-based battle simulation with dynamic damage variance.
 * Uses a seeded PRNG so the same battle always produces the same result.
 * @param seed — deterministic seed (usually battle startTime). If omitted, uses average DPS (legacy).
 */
export function computeBattleStateAtTime(
  player: CombatStats,
  boss: BossDef | MobDef,
  elapsedSeconds: number,
  seed?: number,
): BattleStateAtTime {
  // Legacy path: no seed → deterministic linear formula (backward compat for tests)
  if (seed == null) {
    const playerDPS = effectivePlayerDps(player.atk, boss.def ?? 0)
    const eDPS = effectiveBossDps(boss.atk, player.hpRegen, player.def)
    const bossHp = Math.max(0, boss.hp - playerDPS * elapsedSeconds)
    const playerHp = Math.min(player.hp, Math.max(0, player.hp - eDPS * elapsedSeconds))
    let isComplete = false
    let victory: boolean | null = null
    if (bossHp <= 0) { isComplete = true; victory = true }
    else if (playerHp <= 0) { isComplete = true; victory = false }
    return { playerHp, bossHp, elapsedSeconds, isComplete, victory }
  }

  // Tick-based with dynamic damage
  const rng = mulberry32(seed)
  const spread = boss.atkSpread ?? DEFAULT_ATK_SPREAD
  let playerHp = player.hp
  let bossHp = boss.hp
  let t = 0
  let isComplete = false
  let victory: boolean | null = null

  while (t < elapsedSeconds && !isComplete) {
    // Player deals varied damage
    const pAtk = variedDamage(player.atk, DEFAULT_ATK_SPREAD, rng)
    const pDps = effectivePlayerDps(pAtk, boss.def ?? 0)
    // Enemy deals varied damage
    const eAtk = variedDamage(boss.atk, spread, rng)
    const eDps = effectiveBossDps(eAtk, player.hpRegen, player.def)

    bossHp -= pDps * FOOD_TICK_STEP
    playerHp -= eDps * FOOD_TICK_STEP
    playerHp = Math.min(player.hp, playerHp) // regen can't exceed max
    t += FOOD_TICK_STEP

    if (bossHp <= 0) { isComplete = true; victory = true }
    else if (playerHp <= 0) { isComplete = true; victory = false }
  }

  return {
    playerHp: Math.max(0, playerHp),
    bossHp: Math.max(0, bossHp),
    elapsedSeconds: t,
    isComplete,
    victory,
  }
}

// ─── Food Loadout / Battle Healing ──────────────────────────────────────────

export interface FoodEffect {
  heal?: number
  buffAtk?: number
  buffDef?: number
  buffRegen?: number
  buffDurationSec?: number
  /** % bonus to gold earned this run (e.g. 15 = +15% gold). */
  goldBonusPct?: number
  /** % bonus to material drop chance this run (e.g. 10 = +10% drop chance). */
  dropBonusPct?: number
}

export interface FoodLoadoutSlot {
  foodId: string
  qty: number
  effect: FoodEffect
}
export type FoodLoadout = (FoodLoadoutSlot | null)[]

export interface FoodConsumptionEvent {
  atSeconds: number
  foodId: string
  healAmount: number
}

export interface BattleOutcomeWithFood extends BattleOutcome {
  foodConsumed: Array<{ foodId: string; qty: number }>
}

export interface BattleStateWithFood extends BattleStateAtTime {
  foodEvents: FoodConsumptionEvent[]
  activeBuffs: { atk: number; def: number; regen: number }
}

const FOOD_TICK_STEP = 0.5

interface ActiveFoodBuff {
  atk: number
  def: number
  regen: number
  expiresAt: number
}

/** Tick-based simulation with food healing, buffs, and dynamic damage. */
export function simulateBattleWithFood(
  player: CombatStats,
  boss: BossDef | MobDef,
  foodLoadout: FoodLoadout,
  _healThreshold = 0.5,
  seed?: number,
): BattleOutcomeWithFood {
  const rng = mulberry32(seed ?? (Date.now() ^ 0x9E3779B9))
  const spread = boss.atkSpread ?? DEFAULT_ATK_SPREAD
  const maxHp = player.hp
  let playerHp = maxHp
  let bossHp = boss.hp
  const slots = foodLoadout.map(s => s ? { ...s } : null)
  const consumed: Record<string, number> = {}
  const buffs: ActiveFoodBuff[] = []
  let t = 0
  const maxTime = 600 // 10 min cap

  // Food buff stacking caps
  const MAX_FOOD_BUFF_ATK_SIM = 25
  const MAX_FOOD_BUFF_DEF_SIM = 15
  const MAX_FOOD_BUFF_REGEN_SIM = 8

  // Consume all food at battle start — buffs apply from t=0
  for (const slot of slots) {
    if (!slot || slot.qty <= 0) continue
    const eff = slot.effect
    slot.qty--
    consumed[slot.foodId] = (consumed[slot.foodId] ?? 0) + 1
    if (eff.heal) playerHp = Math.min(maxHp, playerHp + eff.heal)
    if (eff.buffAtk || eff.buffDef || eff.buffRegen) {
      buffs.push({ atk: eff.buffAtk ?? 0, def: eff.buffDef ?? 0, regen: eff.buffRegen ?? 0, expiresAt: t + (eff.buffDurationSec ?? 60) })
    }
  }

  while (t < maxTime) {
    // Sum active buffs
    let buffAtk = 0, buffDef = 0, buffRegen = 0
    for (const b of buffs) {
      if (t < b.expiresAt) { buffAtk += b.atk; buffDef += b.def; buffRegen += b.regen }
    }
    // Apply food buff caps
    buffAtk = Math.min(buffAtk, MAX_FOOD_BUFF_ATK_SIM)
    buffDef = Math.min(buffDef, MAX_FOOD_BUFF_DEF_SIM)
    buffRegen = Math.min(buffRegen, MAX_FOOD_BUFF_REGEN_SIM)

    const pAtk = variedDamage(player.atk + buffAtk, DEFAULT_ATK_SPREAD, rng)
    const pDps = effectivePlayerDps(pAtk, boss.def ?? 0)
    const eAtk = variedDamage(boss.atk, spread, rng)
    const eDps = effectiveBossDps(eAtk, player.hpRegen + buffRegen, player.def + buffDef)

    bossHp -= pDps * FOOD_TICK_STEP
    playerHp -= eDps * FOOD_TICK_STEP
    playerHp = Math.min(maxHp, playerHp)
    t += FOOD_TICK_STEP

    if (bossHp <= 0) {
      const tWin = t
      return { willWin: true, tWinSeconds: tWin, tLoseSeconds: Infinity, foodConsumed: Object.entries(consumed).map(([foodId, qty]) => ({ foodId, qty })) }
    }
    if (playerHp <= 0) {
      return { willWin: false, tWinSeconds: Infinity, tLoseSeconds: t, foodConsumed: Object.entries(consumed).map(([foodId, qty]) => ({ foodId, qty })) }
    }
  }

  // Timeout = loss
  return { willWin: false, tWinSeconds: Infinity, tLoseSeconds: maxTime, foodConsumed: Object.entries(consumed).map(([foodId, qty]) => ({ foodId, qty })) }
}

/** Same as simulateBattleWithFood but returns state at a specific time, with dynamic damage. */
export function computeBattleStateAtTimeWithFood(
  player: CombatStats,
  boss: BossDef | MobDef,
  foodLoadout: FoodLoadout,
  elapsedSeconds: number,
  _healThreshold = 0.5,
  seed?: number,
): BattleStateWithFood {
  const rng = mulberry32(seed ?? (Date.now() ^ 0x9E3779B9))
  const spread = boss.atkSpread ?? DEFAULT_ATK_SPREAD
  const maxHp = player.hp
  let playerHp = maxHp
  let bossHp = boss.hp
  const slots = foodLoadout.map(s => s ? { ...s } : null)
  const foodEvents: FoodConsumptionEvent[] = []
  const buffs: ActiveFoodBuff[] = []
  let t = 0
  let isComplete = false
  let victory: boolean | null = null

  // Food buff stacking caps
  const MAX_FOOD_BUFF_ATK = 25
  const MAX_FOOD_BUFF_DEF = 15
  const MAX_FOOD_BUFF_REGEN = 8

  // Consume all food at battle start — buffs apply from t=0
  for (const slot of slots) {
    if (!slot || slot.qty <= 0) continue
    const eff = slot.effect
    slot.qty--
    foodEvents.push({ atSeconds: 0, foodId: slot.foodId, healAmount: eff.heal ?? 0 })
    if (eff.heal) playerHp = Math.min(maxHp, playerHp + eff.heal)
    if (eff.buffAtk || eff.buffDef || eff.buffRegen) {
      buffs.push({ atk: eff.buffAtk ?? 0, def: eff.buffDef ?? 0, regen: eff.buffRegen ?? 0, expiresAt: t + (eff.buffDurationSec ?? 60) })
    }
  }

  while (t < elapsedSeconds && !isComplete) {
    let buffAtk = 0, buffDef = 0, buffRegen = 0
    for (const b of buffs) {
      if (t < b.expiresAt) { buffAtk += b.atk; buffDef += b.def; buffRegen += b.regen }
    }
    // Apply food buff caps
    buffAtk = Math.min(buffAtk, MAX_FOOD_BUFF_ATK)
    buffDef = Math.min(buffDef, MAX_FOOD_BUFF_DEF)
    buffRegen = Math.min(buffRegen, MAX_FOOD_BUFF_REGEN)

    const pAtk = variedDamage(player.atk + buffAtk, DEFAULT_ATK_SPREAD, rng)
    const pDps = effectivePlayerDps(pAtk, boss.def ?? 0)
    const eAtk = variedDamage(boss.atk, spread, rng)
    const eDps = effectiveBossDps(eAtk, player.hpRegen + buffRegen, player.def + buffDef)

    bossHp -= pDps * FOOD_TICK_STEP
    playerHp -= eDps * FOOD_TICK_STEP
    playerHp = Math.min(maxHp, playerHp)
    t += FOOD_TICK_STEP

    if (bossHp <= 0) { isComplete = true; victory = true; break }
    if (playerHp <= 0) { isComplete = true; victory = false; break }
  }

  // Active buffs at requested time (with caps)
  let curBuffAtk = 0, curBuffDef = 0, curBuffRegen = 0
  for (const b of buffs) {
    if (elapsedSeconds < b.expiresAt) { curBuffAtk += b.atk; curBuffDef += b.def; curBuffRegen += b.regen }
  }
  curBuffAtk = Math.min(curBuffAtk, MAX_FOOD_BUFF_ATK)
  curBuffDef = Math.min(curBuffDef, MAX_FOOD_BUFF_DEF)
  curBuffRegen = Math.min(curBuffRegen, MAX_FOOD_BUFF_REGEN)

  return {
    playerHp: Math.max(0, playerHp),
    bossHp: Math.max(0, bossHp),
    elapsedSeconds: t,
    isComplete,
    victory,
    foodEvents,
    activeBuffs: { atk: curBuffAtk, def: curBuffDef, regen: curBuffRegen },
  }
}
