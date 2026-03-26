import type { ChestType } from './loot'

// ── Reward types ─────────────────────────────────────────────────────────────

export interface DailyLoginMaterial {
  id: string
  qty: number
}

export interface DailyLoginReward {
  day: number
  gold?: number
  chests?: { type: ChestType; qty: number }[]
  materials?: DailyLoginMaterial[]
  milestone?: string
}

// ── 30-day reward table ───────────────────────────────────────────────────────

// Wheat / wheat_seed scaling: days 1–15 → wheat_seed (qty = day), days 16–30 → wheat (qty = day - 8)
export const DAILY_LOGIN_REWARDS: DailyLoginReward[] = [
  // ── Week 1: Hook them in — varied starter kit, Vita early ────────────────────
  { day: 1,  gold: 500,  materials: [{ id: 'wheat_seed', qty: 1 }, { id: 'herb_seed', qty: 3 }, { id: 'ore_iron', qty: 5 }] },
  { day: 2,  materials: [{ id: 'wheat_seed', qty: 2 }, { id: 'hp_potion', qty: 1 }, { id: 'monster_fang', qty: 3 }] },
  { day: 3,  gold: 800,  materials: [{ id: 'wheat_seed', qty: 3 }, { id: 'herbs', qty: 8 }, { id: 'slime_gel', qty: 5 }] },
  { day: 4,  chests: [{ type: 'common_chest', qty: 1 }], materials: [{ id: 'wheat_seed', qty: 4 }, { id: 'apple_seed', qty: 3 }, { id: 'goblin_tooth', qty: 4 }] },
  { day: 5,  gold: 1200, materials: [{ id: 'wheat_seed', qty: 5 }, { id: 'hp_potion', qty: 1 }, { id: 'herb_seed', qty: 5 }] },
  { day: 6,  chests: [{ type: 'common_chest', qty: 2 }], materials: [{ id: 'wheat_seed', qty: 6 }, { id: 'magic_essence', qty: 3 }, { id: 'monster_fang', qty: 5 }] },
  { day: 7,  gold: 2000, chests: [{ type: 'rare_chest', qty: 1 }], materials: [{ id: 'wheat_seed', qty: 7 }, { id: 'hp_potion', qty: 1 }], milestone: 'Week 1' },

  // ── Week 2: Farming + Crafting — seeds, mats, Vita stack ─────────────────────
  { day: 8,  gold: 1500, materials: [{ id: 'wheat_seed', qty: 8 }, { id: 'blossom_seed', qty: 3 }, { id: 'wolf_fang', qty: 5 }] },
  { day: 9,  materials: [{ id: 'wheat_seed', qty: 9 }, { id: 'hp_potion', qty: 2 }, { id: 'ancient_scale', qty: 4 }] },
  { day: 10, gold: 2500, chests: [{ type: 'rare_chest', qty: 1 }], materials: [{ id: 'wheat_seed', qty: 10 }, { id: 'troll_hide', qty: 4 }] },
  { day: 11, gold: 3000, materials: [{ id: 'wheat_seed', qty: 11 }, { id: 'ore_iron', qty: 10 }, { id: 'ancient_scale', qty: 5 }] },
  { day: 12, chests: [{ type: 'rare_chest', qty: 1 }], materials: [{ id: 'wheat_seed', qty: 12 }, { id: 'hp_potion', qty: 2 }, { id: 'magic_essence', qty: 5 }] },
  { day: 13, gold: 4000, materials: [{ id: 'wheat_seed', qty: 13 }, { id: 'magic_essence', qty: 8 }, { id: 'goblin_tooth', qty: 8 }] },
  { day: 14, gold: 5000, chests: [{ type: 'epic_chest', qty: 1 }], materials: [{ id: 'wheat_seed', qty: 14 }, { id: 'hp_potion', qty: 2 }], milestone: 'Week 2' },

  // ── Week 3: Mid-game power — switches to wheat, epic drops ──────────────────
  { day: 15, gold: 3500, materials: [{ id: 'wheat_seed', qty: 15 }, { id: 'clover_seed', qty: 3 }, { id: 'shadow_dust', qty: 4 }] },
  { day: 16, chests: [{ type: 'epic_chest', qty: 1 }], materials: [{ id: 'wheat', qty: 8 }, { id: 'hp_potion', qty: 3 }, { id: 'troll_hide', qty: 6 }] },
  { day: 17, gold: 6000, materials: [{ id: 'wheat', qty: 9 }, { id: 'ancient_scale', qty: 8 }, { id: 'void_crystal', qty: 4 }] },
  { day: 18, gold: 4000, chests: [{ type: 'epic_chest', qty: 1 }], materials: [{ id: 'wheat', qty: 10 }, { id: 'orchid_seed', qty: 3 }, { id: 'shadow_dust', qty: 5 }] },
  { day: 19, materials: [{ id: 'wheat', qty: 11 }, { id: 'hp_potion', qty: 3 }, { id: 'void_crystal', qty: 6 }] },
  { day: 20, gold: 8000, chests: [{ type: 'legendary_chest', qty: 1 }], materials: [{ id: 'wheat', qty: 12 }, { id: 'starbloom_seed', qty: 2 }, { id: 'hp_potion', qty: 2 }], milestone: 'Week 3' },
  { day: 21, gold: 5000, chests: [{ type: 'legendary_chest', qty: 1 }], materials: [{ id: 'wheat', qty: 13 }, { id: 'dragon_scale', qty: 5 }] },

  // ── Week 4: Endgame — massive wheat, Vita hoards, legendary pull ─────────────
  { day: 22, gold: 10000, materials: [{ id: 'wheat', qty: 14 }, { id: 'hp_potion', qty: 4 }, { id: 'void_crystal', qty: 8 }] },
  { day: 23, chests: [{ type: 'legendary_chest', qty: 2 }], materials: [{ id: 'wheat', qty: 15 }, { id: 'lich_crystal', qty: 6 }] },
  { day: 24, gold: 12000, materials: [{ id: 'wheat', qty: 16 }, { id: 'hp_potion', qty: 4 }, { id: 'titan_core', qty: 5 }] },
  { day: 25, gold: 8000, chests: [{ type: 'legendary_chest', qty: 2 }], materials: [{ id: 'wheat', qty: 17 }, { id: 'void_spore', qty: 2 }, { id: 'dragon_heart', qty: 4 }] },
  { day: 26, gold: 15000, materials: [{ id: 'wheat', qty: 18 }, { id: 'hp_potion', qty: 5 }, { id: 'dragon_scale', qty: 10 }] },
  { day: 27, chests: [{ type: 'legendary_chest', qty: 3 }], materials: [{ id: 'wheat', qty: 19 }, { id: 'lich_crystal', qty: 8 }, { id: 'storm_shard', qty: 8 }] },
  { day: 28, gold: 20000, materials: [{ id: 'wheat', qty: 20 }, { id: 'hp_potion', qty: 5 }, { id: 'dragon_heart', qty: 8 }] },
  { day: 29, gold: 25000, chests: [{ type: 'legendary_chest', qty: 3 }], materials: [{ id: 'wheat', qty: 21 }, { id: 'hp_potion', qty: 5 }, { id: 'void_spore', qty: 3 }] },
  { day: 30, gold: 50000, chests: [{ type: 'legendary_chest', qty: 5 }], materials: [
    { id: 'wheat',        qty: 22 },
    { id: 'hp_potion',    qty: 10 },
    { id: 'dragon_scale', qty: 15 },
    { id: 'titan_core',   qty: 15 },
    { id: 'dragon_heart', qty: 15 },
  ], milestone: 'LEGENDARY' },
]

// ── Persistence ───────────────────────────────────────────────────────────────

const STORAGE_KEY = 'grindly_daily_login_v1'

export interface DailyLoginState {
  lastClaimedDate: string | null
  totalClaimed: number
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

export function getDailyLoginState(): DailyLoginState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as DailyLoginState
  } catch { /* ignore */ }
  return { lastClaimedDate: null, totalClaimed: 0 }
}

function saveDailyLoginState(state: DailyLoginState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function canClaimToday(): boolean {
  const s = getDailyLoginState()
  if (s.totalClaimed >= 30) return false
  return s.lastClaimedDate !== todayStr()
}

export function claimDailyLoginReward(): DailyLoginReward | null {
  if (!canClaimToday()) return null
  const s = getDailyLoginState()
  const nextDay = s.totalClaimed + 1
  const reward = DAILY_LOGIN_REWARDS[nextDay - 1]
  if (!reward) return null
  saveDailyLoginState({ lastClaimedDate: todayStr(), totalClaimed: nextDay })
  return reward
}

// ── Calendar helpers ──────────────────────────────────────────────────────────

export type DayStatus = 'claimed' | 'today' | 'future'

export interface CalendarDay {
  day: number
  reward: DailyLoginReward
  status: DayStatus
}

export function getCalendarDays(): CalendarDay[] {
  const s = getDailyLoginState()
  const claimedToday = s.lastClaimedDate === todayStr()
  return DAILY_LOGIN_REWARDS.map((reward) => {
    let status: DayStatus
    if (reward.day <= s.totalClaimed) {
      status = 'claimed'
    } else if (reward.day === s.totalClaimed + 1 && !claimedToday) {
      status = 'today'
    } else {
      status = 'future'
    }
    return { day: reward.day, reward, status }
  })
}

// ── Reward summary helpers ────────────────────────────────────────────────────

export function rewardPreviewIcons(reward: DailyLoginReward): string {
  const parts: string[] = []
  if (reward.chests) {
    const icons: Record<string, string> = {
      common_chest: '📦', rare_chest: '💠', epic_chest: '💜', legendary_chest: '🏆',
    }
    for (const c of reward.chests) {
      parts.push(c.qty > 1 ? `${icons[c.type]}×${c.qty}` : icons[c.type])
    }
  }
  if (reward.gold) parts.push(`🪙`)
  return parts.slice(0, 2).join(' ')
}
