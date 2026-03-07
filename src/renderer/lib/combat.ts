import { getCombatStatsFromEquipped, type CombatStats, type ChestType } from './loot'
import type { LootSlot } from './loot'

const BASE_ATK = 5
const BASE_HP = 100

export interface BossRequirements {
  minAtk?: number
  minHp?: number
  minHpRegen?: number
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
  // ── Zone 1 — Slime Cavern (target: Wooden set → 11 ATK, 115 HP, 1 Regen) ──
  {
    id: 'zone1',
    name: 'Slime Cavern',
    icon: '🌊',
    themeColor: '#22d3ee',
    entryCost: [{ itemId: 'wheat', quantity: 3 }],
    mobs: [
      { id: 'slime_scout',  name: 'Slime Scout',  icon: '🫧', hp: 100,   atk: 1.5, xpReward: 15,    goldMin: 3,   goldMax: 8,    materialDropId: 'slime_gel', materialDropChance: 0.3 },
      { id: 'slime_guard',  name: 'Slime Guard',  icon: '🫧', hp: 180,   atk: 2.5, xpReward: 25,    goldMin: 5,   goldMax: 12,   materialDropId: 'slime_gel', materialDropChance: 0.4 },
      { id: 'slime_brute',  name: 'Slime Brute',  icon: '🫧', hp: 350,   atk: 3.5, xpReward: 40,    goldMin: 8,   goldMax: 18,   materialDropId: 'slime_gel', materialDropChance: 0.5 },
    ],
    boss: {
      id: 'slime', name: 'Slime King', icon: '💧', hp: 400, atk: 3,
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
      { id: 'goblin_scout',   name: 'Goblin Scout',   icon: '👺', hp: 250,   atk: 3,   xpReward: 60,   goldMin: 10,  goldMax: 20,   materialDropId: 'goblin_tooth', materialDropChance: 0.3 },
      { id: 'goblin_warrior', name: 'Goblin Warrior',  icon: '👺', hp: 400,   atk: 4,   xpReward: 100,  goldMin: 15,  goldMax: 30,   materialDropId: 'goblin_tooth', materialDropChance: 0.4 },
      { id: 'goblin_shaman',  name: 'Goblin Shaman',  icon: '👺', hp: 550,   atk: 4.5, xpReward: 150,  goldMin: 20,  goldMax: 40,   materialDropId: 'goblin_tooth', materialDropChance: 0.5 },
    ],
    boss: {
      id: 'goblin', name: 'Goblin Chief', icon: '👺', hp: 700, atk: 5.5,
      rewards: { chestTier: 'rare_chest' },
      requirements: { minAtk: 10 },
      materialDropId: 'goblin_tooth', materialDropQty: 3,
    },
  },
  // ── Zone 3 — Wild Forest (target: Shadow set → 34 ATK, 205 HP, 5 Regen) ────
  {
    id: 'zone3',
    name: 'Wild Forest',
    icon: '🌲',
    themeColor: '#16a34a',
    prevZoneId: 'zone2',
    warriorLevelRequired: 8,
    gateItems: ['craft_slime_shield'],
    entryCost: [{ itemId: 'slime_gel', quantity: 3 }, { itemId: 'apples', quantity: 2 }],
    mobs: [
      { id: 'wolf_young', name: 'Young Wolf',  icon: '🐺', hp: 500,   atk: 4.5, xpReward: 200,   goldMin: 25,  goldMax: 50,   materialDropId: 'wolf_fang', materialDropChance: 0.3 },
      { id: 'wolf_pack',  name: 'Pack Wolf',   icon: '🐺', hp: 800,   atk: 6,   xpReward: 350,   goldMin: 40,  goldMax: 70,   materialDropId: 'wolf_fang', materialDropChance: 0.4 },
      { id: 'wolf_alpha', name: 'Alpha Wolf',  icon: '🐺', hp: 1200,  atk: 7,   xpReward: 500,   goldMin: 50,  goldMax: 90,   materialDropId: 'wolf_fang', materialDropChance: 0.5 },
    ],
    boss: {
      id: 'wolf', name: 'Forest Wolf', icon: '🐺', hp: 2000, atk: 8,
      rewards: { chestTier: 'rare_chest' },
      requirements: { minAtk: 15, minHp: 140 },
      materialDropId: 'wolf_fang', materialDropQty: 2,
    },
  },
  // ── Zone 4 — Orc Stronghold (target: Golden set → 49 ATK, 250 HP, 7 Regen) ─
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
      { id: 'orc_grunt',  name: 'Orc Grunt',  icon: '👹', hp: 1000,  atk: 7.5, xpReward: 800,   goldMin: 60,  goldMax: 120,  materialDropId: 'orc_shard', materialDropChance: 0.3, materialDropQty: 2 },
      { id: 'orc_brute',  name: 'Orc Brute',  icon: '👹', hp: 1600,  atk: 9,   xpReward: 1400,  goldMin: 90,  goldMax: 160,  materialDropId: 'orc_shard', materialDropChance: 0.4, materialDropQty: 2 },
      { id: 'orc_shaman', name: 'Orc Shaman', icon: '👹', hp: 2200,  atk: 10,  xpReward: 2000,  goldMin: 120, goldMax: 200,  materialDropId: 'orc_shard', materialDropChance: 0.5, materialDropQty: 3 },
    ],
    boss: {
      id: 'orc', name: 'Orc Warlord', icon: '👹', hp: 2500, atk: 11,
      rewards: { chestTier: 'epic_chest' },
      requirements: { minAtk: 25, minHp: 180, minHpRegen: 4 },
      materialDropId: 'warlord_sigil', materialDropQty: 1,
    },
  },
  // ── Zone 5 — Troll Bridge (target: Void set → 67 ATK, 330 HP, 10 Regen) ────
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
      { id: 'troll_bridge', name: 'Bridge Troll', icon: '🧌', hp: 1800,  atk: 10.5, xpReward: 3000,  goldMin: 150, goldMax: 250,  materialDropId: 'troll_hide', materialDropChance: 0.3, materialDropQty: 2 },
      { id: 'troll_stone',  name: 'Stone Troll',  icon: '🧌', hp: 3000,  atk: 12,   xpReward: 5000,  goldMin: 200, goldMax: 350,  materialDropId: 'troll_hide', materialDropChance: 0.4, materialDropQty: 3 },
      { id: 'troll_ancient',name: 'Ancient Troll', icon: '🧌', hp: 4200,  atk: 13.5, xpReward: 7500,  goldMin: 280, goldMax: 450,  materialDropId: 'troll_hide', materialDropChance: 0.5, materialDropQty: 3 },
    ],
    boss: {
      id: 'troll', name: 'Troll Overlord', icon: '🧌', hp: 4500, atk: 14.5,
      rewards: { chestTier: 'epic_chest' },
      requirements: { minAtk: 40, minHp: 230, minHpRegen: 7 },
      materialDropId: 'troll_heart', materialDropQty: 1,
    },
  },
  // ── Zone 6 — Dragon Lair (target: Void + crafted/potions → ~80 ATK, 350 HP, 15+ Regen)
  {
    id: 'zone6',
    name: 'Dragon Lair',
    icon: '🔥',
    themeColor: '#ef4444',
    prevZoneId: 'zone5',
    warriorLevelRequired: 40,
    gateItems: ['craft_troll_cloak'],
    entryCost: [{ itemId: 'troll_hide', quantity: 2 }, { itemId: 'dragon_scale', quantity: 1 }, { itemId: 'orchids', quantity: 3 }],
    mobs: [
      { id: 'dragon_whelp',  name: 'Dragon Whelp',  icon: '🐉', hp: 2500,  atk: 14,   xpReward: 10000, goldMin: 300,  goldMax: 500,  materialDropId: 'dragon_scale', materialDropChance: 0.3, materialDropQty: 2 },
      { id: 'dragon_guard',  name: 'Dragon Guard',  icon: '🐉', hp: 3500,  atk: 16,   xpReward: 18000, goldMin: 450,  goldMax: 700,  materialDropId: 'dragon_scale', materialDropChance: 0.4, materialDropQty: 3 },
      { id: 'dragon_elder',  name: 'Elder Dragon',  icon: '🐉', hp: 5000,  atk: 18,   xpReward: 28000, goldMin: 600,  goldMax: 900,  materialDropId: 'dragon_scale', materialDropChance: 0.5, materialDropQty: 4 },
    ],
    boss: {
      id: 'dragon', name: 'Ancient Dragon', icon: '🐉', hp: 6000, atk: 19,
      rewards: { chestTier: 'legendary_chest' },
      requirements: { minAtk: 55, minHp: 300, minHpRegen: 10 },
      materialDropId: 'dragon_heart', materialDropQty: 1,
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
}

/** Backward compat: flat list of boss defs */
export const BOSSES: BossDef[] = ZONES.map((z) => z.boss)

export function computePlayerStats(
  equippedBySlot: Partial<Record<LootSlot, string>>,
  permanentStats?: { atk: number; hp: number; hpRegen: number },
  additionalBonuses?: { atk: number; hp: number; hpRegen: number },
): CombatStats {
  const fromItems = getCombatStatsFromEquipped(equippedBySlot)
  return {
    atk: BASE_ATK + fromItems.atk + (permanentStats?.atk ?? 0) + (additionalBonuses?.atk ?? 0),
    hp: BASE_HP + fromItems.hp + (permanentStats?.hp ?? 0) + (additionalBonuses?.hp ?? 0),
    hpRegen: fromItems.hpRegen + (permanentStats?.hpRegen ?? 0) + (additionalBonuses?.hpRegen ?? 0),
  }
}

export function computeWarriorBonuses(level: number): { atk: number; hp: number; hpRegen: number } {
  return {
    atk: (level >= 5 ? 1 : 0) + (level >= 20 ? 1 : 0) + (level >= 40 ? 2 : 0) + (level >= 75 ? 3 : 0),
    hp: (level >= 15 ? 5 : 0) + (level >= 60 ? 10 : 0),
    hpRegen: (level >= 30 ? 1 : 0) + (level >= 75 ? 2 : 0),
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

/** Regen can mitigate at most 80% of incoming DPS — boss always deals ≥20% of its ATK. */
const MIN_DAMAGE_FRACTION = 0.20

/** Net DPS from boss to player, accounting for regen with a minimum damage floor. */
export function effectiveBossDps(bossAtk: number, playerRegen: number): number {
  return Math.max(bossAtk * MIN_DAMAGE_FRACTION, bossAtk - playerRegen)
}

export function computeBattleOutcome(player: CombatStats, boss: BossDef): BattleOutcome {
  const playerDPS = player.atk
  const tWinSeconds = boss.hp / playerDPS
  const eDPS = effectiveBossDps(boss.atk, player.hpRegen)
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

export function computeBattleStateAtTime(
  player: CombatStats,
  boss: BossDef | MobDef,
  elapsedSeconds: number,
): BattleStateAtTime {
  const playerDPS = player.atk
  const eDPS = effectiveBossDps(boss.atk, player.hpRegen)

  const bossHp = Math.max(0, boss.hp - playerDPS * elapsedSeconds)
  const playerHp = Math.min(player.hp, Math.max(0, player.hp - eDPS * elapsedSeconds))

  let isComplete = false
  let victory: boolean | null = null
  if (bossHp <= 0) {
    isComplete = true
    victory = true
  } else if (playerHp <= 0) {
    isComplete = true
    victory = false
  }

  return {
    playerHp,
    bossHp,
    elapsedSeconds,
    isComplete,
    victory,
  }
}
