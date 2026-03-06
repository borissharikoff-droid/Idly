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

export interface ZoneDef {
  id: string
  name: string
  icon: string
  themeColor: string
  mobs: [MobDef, MobDef, MobDef]
  boss: BossDef
  warriorLevelRequired?: number
  prevZoneId?: string
  /** Item IDs player must own (in inventory or equipped) to enter this zone. */
  gateItems?: string[]
}

export const ZONES: ZoneDef[] = [
  {
    id: 'zone1',
    name: 'Slime Cavern',
    icon: '🌊',
    themeColor: '#22d3ee',
    mobs: [
      { id: 'slime_scout',  name: 'Slime Scout',  icon: '🫧', hp: 1200,  atk: 0.2, xpReward: 30,   goldMin: 5,   goldMax: 12,  materialDropId: 'slime_gel', materialDropChance: 0.3 },
      { id: 'slime_guard',  name: 'Slime Guard',  icon: '🫧', hp: 2100,  atk: 0.3, xpReward: 55,   goldMin: 8,   goldMax: 15,  materialDropId: 'slime_gel', materialDropChance: 0.4 },
      { id: 'slime_brute',  name: 'Slime Brute',  icon: '🫧', hp: 3000,  atk: 0.4, xpReward: 90,   goldMin: 10,  goldMax: 20,  materialDropId: 'slime_gel', materialDropChance: 0.5 },
    ],
    boss: {
      id: 'slime', name: 'Slime King', icon: '💧', hp: 14400, atk: 1.5,
      rewards: { chestTier: 'common_chest' },
      materialDropId: 'slime_gel', materialDropQty: 5,
    },
  },
  {
    id: 'zone2',
    name: 'Goblin Outpost',
    icon: '🏕️',
    themeColor: '#84cc16',
    prevZoneId: 'zone1',
    warriorLevelRequired: 3,
    mobs: [
      { id: 'goblin_scout',   name: 'Goblin Scout',   icon: '👺', hp: 3200,   atk: 1.0, xpReward: 120,  goldMin: 15,  goldMax: 30,  materialDropId: 'goblin_tooth', materialDropChance: 0.3 },
      { id: 'goblin_warrior', name: 'Goblin Warrior',  icon: '👺', hp: 5600,  atk: 1.8, xpReward: 220,  goldMin: 25,  goldMax: 40,  materialDropId: 'goblin_tooth', materialDropChance: 0.4 },
      { id: 'goblin_shaman',  name: 'Goblin Shaman',  icon: '👺', hp: 8000,  atk: 2.2, xpReward: 350,  goldMin: 30,  goldMax: 55,  materialDropId: 'goblin_tooth', materialDropChance: 0.5 },
    ],
    boss: {
      id: 'goblin', name: 'Goblin Chief', icon: '👺', hp: 21600, atk: 3,
      rewards: { chestTier: 'rare_chest' },
      requirements: { minAtk: 9, minHpRegen: 3 },
      materialDropId: 'goblin_tooth', materialDropQty: 4,
    },
  },
  {
    id: 'zone3',
    name: 'Wild Forest',
    icon: '🌲',
    themeColor: '#16a34a',
    prevZoneId: 'zone2',
    warriorLevelRequired: 8,
    gateItems: ['craft_slime_shield'],
    mobs: [
      { id: 'wolf_young', name: 'Young Wolf',  icon: '🐺', hp: 8000,  atk: 2.0, xpReward: 500,   goldMin: 40,  goldMax: 80,   materialDropId: 'wolf_fang', materialDropChance: 0.3 },
      { id: 'wolf_pack',  name: 'Pack Wolf',   icon: '🐺', hp: 14000,  atk: 3.0, xpReward: 900,   goldMin: 65,  goldMax: 100,  materialDropId: 'wolf_fang', materialDropChance: 0.4 },
      { id: 'wolf_alpha', name: 'Alpha Wolf',  icon: '🐺', hp: 20000,  atk: 3.5, xpReward: 1400,  goldMin: 80,  goldMax: 130,  materialDropId: 'wolf_fang', materialDropChance: 0.5 },
    ],
    boss: {
      id: 'wolf', name: 'Forest Wolf', icon: '🐺', hp: 52800, atk: 5,
      rewards: { chestTier: 'rare_chest' },
      requirements: { minAtk: 11, minHp: 200, minHpRegen: 5 },
      materialDropId: 'wolf_fang', materialDropQty: 3,
    },
  },
  {
    id: 'zone4',
    name: 'Orc Stronghold',
    icon: '🪨',
    themeColor: '#d97706',
    prevZoneId: 'zone3',
    warriorLevelRequired: 15,
    gateItems: ['craft_goblin_blade'],
    mobs: [
      { id: 'orc_grunt',  name: 'Orc Grunt',  icon: '👹', hp: 15000,  atk: 3.5, xpReward: 2000,  goldMin: 100, goldMax: 200,  materialDropId: 'orc_shard', materialDropChance: 0.3, materialDropQty: 2 },
      { id: 'orc_brute',  name: 'Orc Brute',  icon: '👹', hp: 27000,  atk: 5.5, xpReward: 3500,  goldMin: 180, goldMax: 280,  materialDropId: 'orc_shard', materialDropChance: 0.4, materialDropQty: 2 },
      { id: 'orc_shaman', name: 'Orc Shaman', icon: '👹', hp: 39000, atk: 6.5, xpReward: 5000,  goldMin: 250, goldMax: 380,  materialDropId: 'orc_shard', materialDropChance: 0.5, materialDropQty: 3 },
    ],
    boss: {
      id: 'orc', name: 'Orc Warlord', icon: '👹', hp: 129600, atk: 8,
      rewards: { chestTier: 'epic_chest' },
      requirements: { minAtk: 18, minHp: 280, minHpRegen: 8 },
      materialDropId: 'warlord_sigil', materialDropQty: 1,
    },
  },
  {
    id: 'zone5',
    name: 'Troll Bridge',
    icon: '🌉',
    themeColor: '#7c3aed',
    prevZoneId: 'zone4',
    warriorLevelRequired: 25,
    gateItems: ['craft_wolf_pendant', 'craft_orc_plate'],
    mobs: [
      { id: 'troll_bridge', name: 'Bridge Troll', icon: '🧌', hp: 36000,  atk: 6.0,  xpReward: 8000,   goldMin: 300,  goldMax: 550,   materialDropId: 'troll_hide', materialDropChance: 0.3, materialDropQty: 2 },
      { id: 'troll_stone',  name: 'Stone Troll',  icon: '🧌', hp: 66000,  atk: 9.0,  xpReward: 14000,  goldMin: 550,  goldMax: 800,   materialDropId: 'troll_hide', materialDropChance: 0.4, materialDropQty: 3 },
      { id: 'troll_ancient',name: 'Ancient Troll', icon: '🧌', hp: 96000,  atk: 11.0, xpReward: 20000,  goldMin: 750,  goldMax: 1100,  materialDropId: 'troll_hide', materialDropChance: 0.5, materialDropQty: 3 },
    ],
    boss: {
      id: 'troll', name: 'Troll Overlord', icon: '🧌', hp: 270000, atk: 13,
      rewards: { chestTier: 'epic_chest' },
      requirements: { minAtk: 25, minHp: 380, minHpRegen: 13 },
      materialDropId: 'troll_heart', materialDropQty: 1,
    },
  },
  {
    id: 'zone6',
    name: 'Dragon Lair',
    icon: '🔥',
    themeColor: '#ef4444',
    prevZoneId: 'zone5',
    warriorLevelRequired: 40,
    gateItems: ['craft_troll_cloak'],
    mobs: [
      { id: 'dragon_whelp',  name: 'Dragon Whelp',  icon: '🐉', hp: 90000,  atk: 10.0, xpReward: 30000,  goldMin: 800,   goldMax: 1500,  materialDropId: 'dragon_scale', materialDropChance: 0.3, materialDropQty: 2 },
      { id: 'dragon_guard',  name: 'Dragon Guard',  icon: '🐉', hp: 180000, atk: 15.0, xpReward: 55000,  goldMin: 1500,  goldMax: 2500,  materialDropId: 'dragon_scale', materialDropChance: 0.4, materialDropQty: 3 },
      { id: 'dragon_elder',  name: 'Elder Dragon',  icon: '🐉', hp: 300000, atk: 18.0, xpReward: 90000,  goldMin: 2200,  goldMax: 3500,  materialDropId: 'dragon_scale', materialDropChance: 0.5, materialDropQty: 4 },
    ],
    boss: {
      id: 'dragon', name: 'Ancient Dragon', icon: '🐉', hp: 567000, atk: 20,
      rewards: { chestTier: 'legendary_chest' },
      requirements: { minAtk: 35, minHp: 500, minHpRegen: 20 },
      materialDropId: 'dragon_heart', materialDropQty: 1,
    },
  },
]

/** Warrior XP granted on boss kill by boss id */
export const BOSS_WARRIOR_XP: Record<string, number> = {
  slime: 120,
  goblin: 400,
  wolf: 900,
  orc: 2500,
  troll: 6000,
  dragon: 15000,
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

export function getDailyBossId(): string {
  const today = new Date().toLocaleDateString('sv-SE')
  let hash = 0
  for (const c of today) hash = (hash * 31 + c.charCodeAt(0)) >>> 0
  return BOSSES[hash % BOSSES.length].id
}

export function computeBattleOutcome(player: CombatStats, boss: BossDef): BattleOutcome {
  const playerDPS = player.atk
  const tWinSeconds = boss.hp / playerDPS
  const effectiveBossDPS = Math.max(0, boss.atk - player.hpRegen)
  const tLoseSeconds = effectiveBossDPS > 0 ? player.hp / effectiveBossDPS : Infinity
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
  const effectiveBossDPS = Math.max(0, boss.atk - player.hpRegen)

  const bossHp = Math.max(0, boss.hp - playerDPS * elapsedSeconds)
  const playerHp = Math.min(player.hp, Math.max(0, player.hp - effectiveBossDPS * elapsedSeconds))

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
