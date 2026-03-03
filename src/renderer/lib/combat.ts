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
}

// Boss fight durations at recommended player stats:
// Slime 2min · Goblin 10min · Wolf 20min · Orc 40min · Troll 60min · Dragon 90min
// Survival rule: minHpRegen >= boss.atk ensures player is immortal at required stats.
export const BOSSES: BossDef[] = [
  // Tier E — intro. No gear needed. Fight ≈2min at base ATK=5.
  { id: 'slime',  name: 'Slime',  icon: '💧', hp: 600,    atk: 0.5,
    rewards: { chestTier: 'common_chest' } },

  // Tier D — ~10min at ATK≥9. Regen negates boss damage.
  { id: 'goblin', name: 'Goblin', icon: '👺', hp: 5400,   atk: 3,
    rewards: { chestTier: 'rare_chest' },
    requirements: { minAtk: 9, minHpRegen: 3 } },

  // Tier C — ~20min at ATK≥11. Requires some HP investment.
  { id: 'wolf',   name: 'Wolf',   icon: '🐺', hp: 13200,  atk: 5,
    rewards: { chestTier: 'rare_chest' },
    requirements: { minAtk: 11, minHp: 200, minHpRegen: 5 } },

  // Tier B — ~40min at ATK≥18. Mid-game grind required.
  { id: 'orc',    name: 'Orc',    icon: '👹', hp: 43200,  atk: 8,
    rewards: { chestTier: 'epic_chest' },
    requirements: { minAtk: 18, minHp: 280, minHpRegen: 8, minSkillLevel: { gamer: 5 } } },

  // Tier A — ~60min at ATK≥25. High-level commitment.
  { id: 'troll',  name: 'Troll',  icon: '🧌', hp: 90000,  atk: 13,
    rewards: { chestTier: 'epic_chest' },
    requirements: { minAtk: 25, minHp: 380, minHpRegen: 13, minSkillLevel: { gamer: 12 } } },

  // Tier S — ~90min at ATK≥35. Ultimate challenge.
  { id: 'dragon', name: 'Dragon', icon: '🐉', hp: 189000, atk: 20,
    rewards: { chestTier: 'legendary_chest' },
    requirements: { minAtk: 35, minHp: 500, minHpRegen: 20, minSkillLevel: { gamer: 25 } } },
]

export function computePlayerStats(
  equippedBySlot: Partial<Record<LootSlot, string>>,
  permanentStats?: { atk: number; hp: number; hpRegen: number },
): CombatStats {
  const fromItems = getCombatStatsFromEquipped(equippedBySlot)
  return {
    atk: BASE_ATK + fromItems.atk + (permanentStats?.atk ?? 0),
    hp: BASE_HP + fromItems.hp + (permanentStats?.hp ?? 0),
    hpRegen: fromItems.hpRegen + (permanentStats?.hpRegen ?? 0),
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
  boss: BossDef,
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
