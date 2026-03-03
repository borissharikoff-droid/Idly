export type LootRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic'
export type LootSlot = 'head' | 'body' | 'legs' | 'ring' | 'weapon' | 'consumable' | 'plant'
export const LOOT_SLOTS: LootSlot[] = ['head', 'body', 'legs', 'ring', 'weapon']

export const POTION_IDS = ['atk_potion', 'hp_potion', 'regen_potion'] as const
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

export type LootSource = 'skill_grind' | 'achievement_claim' | 'goal_complete' | 'daily_activity' | 'session_complete'

/** Human-readable labels for loot sources (shown in inventory, chest modals) */
export const LOOT_SOURCE_LABELS: Record<LootSource, string> = {
  skill_grind: 'Skill Grind',
  achievement_claim: 'Achievement',
  goal_complete: 'Goal Complete',
  daily_activity: 'Daily Activity',
  session_complete: 'Session Complete',
}

/** Item Power score by rarity (100+). Higher rarity = higher IP. Used for leaderboard and item descriptions. */
export const ITEM_POWER_BY_RARITY: Record<string, number> = {
  common: 100,
  rare: 150,
  epic: 220,
  legendary: 320,
  mythic: 450,
}

export function getItemPower(rarity: string): number {
  return ITEM_POWER_BY_RARITY[rarity] ?? 100
}

/** Gold drop range per chest type (anti-inflation, small amounts) */
export const GOLD_BY_CHEST: Record<ChestType, { min: number; max: number }> = {
  common_chest: { min: 1, max: 2 },
  rare_chest: { min: 2, max: 5 },
  epic_chest: { min: 5, max: 10 },
  legendary_chest: { min: 10, max: 20 },
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
export const MARKETPLACE_BLOCKED_ITEMS: string[] = ['health_potion', 'atk_potion', 'hp_potion', 'regen_potion']
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
  | 'harvested_plant'
export type ChestType = 'common_chest' | 'rare_chest' | 'epic_chest' | 'legendary_chest'

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

export interface ChestOpenResult {
  item: LootItemDef
  estimatedDropRate: number
}

const INLINE_LOOT_IMAGES = {
  neon_visor: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAQ0lEQVR4nO3ROQ4AMAgDQf//00Qp6CPOFDs9YGEJAH5iQ1aPu3QAFc+HF5UddgSw4CvHKxABuiq4uirQK9sOAADQoAMv6CQV46fULQAAAABJRU5ErkJggg==',
  hacker_jacket: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAXUlEQVR4nO3TQQoAIQxD0dz/0pHuBVtnKqTk7atfpIAVMAnjAnhJP4A/0QtgE40ANtMLwMc1nBEQbi7fzUE2IFQv383ghMmXZCMcQH/BmC0IDuCLLwjlgUdnmaHDAgNLGUpqY1l4AAAAAElFTkSuQmCC',
  zen_beanie: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAUElEQVR4nO3TwQ0AIAhD0e6/dA1XL0ZFUehbgB9QQBaxg9tYNoADeQM4KU8AN/0dQCd/BtCZAqATzGL5R2jCvuAzASZ0uFGACVv/MwEiOKgBgijKfB8cl/AAAAAASUVORK5CYII=',
  pixel_shades: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAASklEQVR4nO3T0QoAEBBE0fn/nx6vUsKuRO55tmNqkQAAHa7oRIYX7Z7XcwWyQvtyNHzmDicDKGBWUOERKvINewdbGsjM3lMAwFcK8BBE5r8OJs8AAAAASUVORK5CYII=',
  cozy_sweater: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAP0lEQVR4nO3SgQkAIAwDwey/dJxAJLQKlr8JHhIJQMgHGhvg0JwAF/0b4GYEiAlS5oTNmECcsMKvjrdDAKCLFjqPgsRlPx3NAAAAAElFTkSuQmCC',
  beat_headphones: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAUklEQVR4nO3TOwoAIAwE0b3/pSMWAbGKYNDovDKFDn4kADeyJATo5PG7WgHahADjCgY8QpX6hhnuD+giC0Tny5uXCXDzjAA7cQVRKQGzNwK+0gCKyD8IexEJcgAAAABJRU5ErkJggg==',
  scholar_cape: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAATElEQVR4nO3S0QkAMAhDwey/dPpfKGirlEhuAR8YwCyBQRgXwEv6ASyiGcBiWgFs4gD4BVH0CJv4BfAIo7gN52V0mgEnmcMt+DvARlpox/lb/ePuqAAAAABJRU5ErkJggg==',
  social_ring: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAWUlEQVR4nO2SSQoAIAwD+/9PRzx4VOICkZC5Cu1gpyqEQIJNykYAhwOfiWAx6PTtWgDEt/sKgIzPV0B+gk4EoDwB1BFCLdBJhAw+Amx8sxh9BAayxd8IBDsaUFhE5kbrNzQAAAAASUVORK5CYII=',
  phantom_cloak: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAV0lEQVR4nO3RQQ4AIQhD0d7/0p2wl2TiOBS1b43hRwCbwASq0AEJybdnzgngR/sGcLF9Aviz3gEs0jOAxRyAdicI0uUtAoJ0uTyALx6vmnHAEK8/gUHgAbvIl9liZ/suAAAAAElFTkSuQmCC',
  void_aura: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAcUlEQVR4nO3RQQ6AIAxE0d7/0mNMYEM02E5pTdO3x/mCSCNgkCzogCHt6lf1A/BRvQAY0YPiFKAOwiHmmwgfvtGr2ggE2waI8xNsA554BlAQPYzlA2yAOggvB6x/Tt8IG+AOWcO/CZjShqcOQPYTtBIu4opb3UwPsSsAAAAASUVORK5CYII=',
  paper_crown: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAANklEQVR4nO3RMQoAIAwEwfz/07EXLCJYeMxUB2kWUgXwix7KCuhLeQG17dNNQO4LpnICAKAeWs1w3jAvU1xsAAAAAElFTkSuQmCC',
  plain_tee: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAOklEQVR4nO3SgQkAIAwDwey/dJxARAkFw98ET1MJwG980BvgSx0BDiFATPDKPGEIEyjBU2ffIQBArQUB+vwuPgU3awAAAABJRU5ErkJggg==',
  worn_bracelet: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAARUlEQVR4nO3UQQoAIAgFUe9/6d/KpaRhBDZvG+hEkBkAIElFNiZAhwPbQhQM2t2YAI1/Ahed/RMQufYfZLUtds8DAGCsBflchoiM8VE7AAAAAElFTkSuQmCC',
  soft_glow: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAASUlEQVR4nO3QwQkAIAxD0ey/dDwVxItYCymat0A+AcwsiQt8E8CNdwN4qHQUyYDrGBYpeUEyPpMNtwkIsuE2AUE23CbAzMyeMQAGpRYHewEUggAAAABJRU5ErkJggg==',
  canvas_cap: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAO0lEQVR4nO3Thw0AMAgDQe+/tCM2SEOk/E3wEkYCgE4epGcCvOjuAG9CgDjBLH8/wlD2gscEBAIAQIka3c/MXiyGcv4AAAAASUVORK5CYII=',
  sprint_cap: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAPUlEQVR4nO3SgQkAMAgDwey/dEo3KNZilb8FfIgSgE58aF6Ag2YE+BIBYoL2T7iVHP0qIBKRHuPqAACAHlmFFA0et78u9wAAAABJRU5ErkJggg==',
  task_vest: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAOElEQVR4nO3SwQ0AQAgCQfpvGls4iR/PnQo2AQlAgx/puwCH9gd4CAFigpQ54RAmECdM+fwJAZxQfpCrjSi/1wYAAAAASUVORK5CYII=',
  code_wraps: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAOklEQVR4nO3SgQkAMAgDwey/dLqC2BSq/E3wGCUAKHCTxgf40uwAhxAgJugyTxjCBErx65N/HwBgrQP2mAwtihUOEwAAAABJRU5ErkJggg==',
  signal_pin: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAT0lEQVR4nO3UUQoAEBBF0dn/pp+mfEhIqAn3fIkytxQzANigzL4KUDG0t34zQI0Bs3t3B2hw4erZXQEjf/4D9fCwCBEQ/QQudLgjAIAdkADsLgcIO6vpBgAAAABJRU5ErkJggg==',
  study_halo: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAQ0lEQVR4nO3RyQ0AIAwDwfTftHnlzSUUMDsNeCVHABikSWEToE3vB6Sy4WsCUtlwIkBc0BGniYCvL9AgvwAt8gkArDUctDzueBkV9AAAAABJRU5ErkJggg==',
  sketch_hood: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAQklEQVR4nO3SyQkAMAwDQfXftNJAHjlMiMxOA16wJCCJF/UL8KEeAb6UG+BiBIgX7DIjLMYLxAjjRjjz9NiXAUBLA7yNmqyazgtWAAAAAElFTkSuQmCC',
  chrono_visor: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAASUlEQVR4nO3ROw4AIAgE0b3/pTF0NiaA+Cnm1YqjSgDwGzvs/wBXGdR2uNu+JgELirKAeV1mDwEhVnjO1i9w3QHKstcBAABdMgCS/MRm/qcalQAAAABJRU5ErkJggg==',
  pulse_coat: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAWUlEQVR4nO3SQQrAIBBD0dz/0pGCKzFIq7NIzdurn3GAcMGX/hPATb4BPMwrgEU8AljMLwAbUeo+v4DHl8dn57DCBAzUZFbyBcgSdmo3JGYJB2oyZV8QcZ0GZ0UJWtnZTfgAAAAASUVORK5CYII=',
  sonic_loop: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAATUlEQVR4nO3SwQ0AIAhDUfZfup48mqIhEWvfAPpFIszsNSB0A7BJJwCHB5aFoGsAyMgdAH+B9BJi4Z+AjLIA9urMNDQCpmsXtwkwkzMALiB9n3Sdxn4AAAAASUVORK5CYII=',
  teamlink_band: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAS0lEQVR4nO3RMQoAIAwEwfv/pyMWNoJEIUENO23AW1ACgB/Ywu69boCnfoA27/8HdN7jqeMdAcYXTHR4D2OOtOFnAoZrw88EAFCQBuadTc9+y9uqAAAAAElFTkSuQmCC',
  aurora_field: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAUklEQVR4nO3RuwoAIAxD0fz/T8fFgoMg1mJ95KwOuVRA5Gas/grgwLsBnBQ6CmfAcgyDhFwhZbyVNnxMgEkbPibApAyzGesFbPt/ON9FRETQUQAgUCX3dYescAAAAABJRU5ErkJggg==',
  singularity_helm: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAQ0lEQVR4nO3SwQkAMAgEweu/6cs3zyiCGnYacFElIMCP9F2Ak/YHuMjOABcjQJwgyjxhMU6gDHetf0zArWXoqAAA3zr8f1rsi8KuMQAAAABJRU5ErkJggg==',
  zero_day_jacket: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAW0lEQVR4nO3TSQoAIRBD0dz/0hHBlVpQ4liSt2/8tBEQJw7CNwGcFDeAi8UJ4GZvB/CQOAFY9AxjB2Qzh/e+h4UKqFh/xktXAI2wsLbR0AipZ1ixtrFthCK4IAGcGUAxTZ8XvQAAAABJRU5ErkJggg==',
  mythic_monocle: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAUklEQVR4nO3RQQoAIAhEUe9/6WlTmwhTERKbty8/KkJEZAQnaROA4IdpIagaAGXlqSdBIEB7xwA38ATTaSu7fwIs+gTc1m45R4+A5dngMgFE7Qw+MFnDBnUniwAAAABJRU5ErkJggg==',
  eclipse_mantle: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAWklEQVR4nO3RMQ4AIAhDUe5/6RpWowxEA9W+1Ri+aCasMFGAVax9570AJPEH4BDOABzGFYBLeAJc6fAWAa50eIsAVzrctXu9BVHRHQWkQF+wsNtMdJbbv/xiAO79+kyse9AZAAAAAElFTkSuQmCC',
  omega_crown: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAUklEQVR4nO3SwQkAMAgEweu/6cs3zyiCGnYacFElIMCP9F2Ak/YHuMjOABcjQJwgyjxhMU6gDHetf0zArWXoqAAA3zr8f1rsi8KuMQAAAABJRU5ErkJggg==',
  prism_aura: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAUklEQVR4nO3SwQkAMAgEweu/6cs3zyiCGnYacFElIMCP9F2Ak/YHuMjOABcjQJwgyjxhMU6gDHetf0zArWXoqAAA3zr8f1rsi8KuMQAAAABJRU5ErkJggg==',
} as const

export const LOOT_ITEMS: LootItemDef[] = [
  {
    id: 'focus_cap',
    name: 'Focus Cap',
    slot: 'head',
    rarity: 'common',
    icon: '🧢',
    image: 'loot/focus_cap_bw_user.png',
    renderScale: 0.9,
    description: 'Starter cap that marks consistent focus.',
    perkType: 'cosmetic',
    perkValue: 0,
    perkDescription: 'Cosmetic only.',
  },
  {
    id: 'grind_hoodie',
    name: 'Grind Hoodie',
    slot: 'body',
    rarity: 'rare',
    icon: '👕',
    image: 'loot/grind_hoodie_bw_user.png',
    description: 'Daily uniform for coding sessions.',
    perkType: 'xp_skill_boost',
    perkValue: 0.05,
    perkTarget: 'developer',
    perkDescription: '+5% XP to Developer skill.',
  },
  {
    id: 'geek_glasses',
    name: 'Geek Glasses',
    slot: 'legs',
    rarity: 'legendary',
    icon: '🤓',
    image: 'loot/geek_glasses_bw_user.png',
    renderScale: 1.25,
    description: 'Ultra-rare coding trophy.',
    perkType: 'chest_drop_boost',
    perkValue: 0.12,
    perkTarget: 'coding',
    perkDescription: '+12% chest drop chance while grinding coding category.',
  },
  {
    id: 'pulse_aura',
    name: 'Pulse Aura',
    slot: 'ring',
    rarity: 'epic',
    icon: '✨',
    image: 'loot/pulse_aura_bw_user.png',
    description: 'Visible social aura around your profile.',
    perkType: 'status_title',
    perkValue: 'Pulse Wielder',
    perkDescription: 'Sets social status title.',
  },
  {
    id: 'speed_shorts',
    name: 'Speed Shorts',
    slot: 'legs',
    rarity: 'rare',
    icon: '🩳',
    image: 'loot/speed_shorts_bw_user.png',
    description: 'Lightweight shorts for relentless sprints.',
    perkType: 'chest_drop_boost',
    perkValue: 0.08,
    perkTarget: 'coding',
    perkDescription: '+8% chest drop chance while grinding coding category.',
  },
  {
    id: 'aegis_aura',
    name: 'Aegis Aura',
    slot: 'ring',
    rarity: 'epic',
    icon: '🛡️',
    image: 'loot/aegis_aura_bw_user.png',
    description: 'A protective field that signals resilience.',
    perkType: 'status_title',
    perkValue: 'Aegis Guard',
    perkDescription: 'Sets social status title.',
  },
  {
    id: 'neon_visor',
    name: 'Neon Visor',
    slot: 'head',
    rarity: 'epic',
    icon: '🕶️',
    image: INLINE_LOOT_IMAGES.neon_visor,
    renderScale: 1.08,
    description: 'Tinted visor for focused late-night runs.',
    perkType: 'xp_global_boost',
    perkValue: 0.03,
    perkDescription: '+3% XP to all skills.',
  },
  {
    id: 'hacker_jacket',
    name: 'Hacker Jacket',
    slot: 'body',
    rarity: 'legendary',
    icon: '🧥',
    image: INLINE_LOOT_IMAGES.hacker_jacket,
    renderScale: 1.08,
    description: 'Layered cyber jacket with neon seams and armored shoulders.',
    perkType: 'xp_global_boost',
    perkValue: 0.05,
    perkDescription: '+5% XP to all skills.',
  },
  {
    id: 'zen_beanie',
    name: 'Zen Beanie',
    slot: 'head',
    rarity: 'rare',
    icon: '🧶',
    image: INLINE_LOOT_IMAGES.zen_beanie,
    description: 'Soft beanie that rewards distraction-free sessions.',
    perkType: 'focus_boost',
    perkValue: 0.08,
    perkDescription: '+8% XP during Focus Mode.',
  },
  {
    id: 'pixel_shades',
    name: 'Pixel Shades',
    slot: 'legs',
    rarity: 'rare',
    icon: '😎',
    image: INLINE_LOOT_IMAGES.pixel_shades,
    description: 'Retro shades made for visual perfection.',
    perkType: 'xp_skill_boost',
    perkValue: 0.05,
    perkTarget: 'designer',
    perkDescription: '+5% XP to Designer skill.',
  },
  {
    id: 'cozy_sweater',
    name: 'Cozy Sweater',
    slot: 'body',
    rarity: 'common',
    icon: '🧣',
    image: INLINE_LOOT_IMAGES.cozy_sweater,
    renderScale: 0.88,
    description: 'Basic plain sweater for chill everyday sessions.',
    perkType: 'cosmetic',
    perkValue: 0,
    perkDescription: 'Cosmetic only.',
  },
  {
    id: 'phantom_cloak',
    name: 'Phantom Cloak',
    slot: 'ring',
    rarity: 'legendary',
    icon: '🦇',
    image: INLINE_LOOT_IMAGES.phantom_cloak,
    renderScale: 1.22,
    description: 'A drifting cloak that protects your streak momentum.',
    perkType: 'streak_shield',
    perkValue: 1,
    perkDescription: 'Protects your streak once when you miss a day.',
  },
  {
    id: 'beat_headphones',
    name: 'Beat Headphones',
    slot: 'legs',
    rarity: 'epic',
    icon: '🎧',
    image: INLINE_LOOT_IMAGES.beat_headphones,
    renderScale: 1.04,
    description: 'Headphones tuned for sustained deep listening.',
    perkType: 'xp_skill_boost',
    perkValue: 0.06,
    perkTarget: 'listener',
    perkDescription: '+6% XP to Listener skill.',
  },
  {
    id: 'scholar_cape',
    name: 'Scholar Cape',
    slot: 'body',
    rarity: 'rare',
    icon: '🎓',
    image: INLINE_LOOT_IMAGES.scholar_cape,
    description: 'Academic cape for marathon study sessions.',
    perkType: 'xp_skill_boost',
    perkValue: 0.05,
    perkTarget: 'learner',
    perkDescription: '+5% XP to Learner skill.',
  },
  {
    id: 'social_ring',
    name: 'Social Ring',
    slot: 'legs',
    rarity: 'epic',
    icon: '💍',
    image: INLINE_LOOT_IMAGES.social_ring,
    renderScale: 1.06,
    description: 'A bright ring that marks social confidence.',
    perkType: 'status_title',
    perkValue: 'Social Star',
    perkDescription: 'Sets social status title.',
  },
  {
    id: 'void_aura',
    name: 'Void Aura',
    slot: 'ring',
    rarity: 'legendary',
    icon: '🌌',
    image: INLINE_LOOT_IMAGES.void_aura,
    renderScale: 1.2,
    description: 'A dark aura reserved for relentless grinders.',
    perkType: 'status_title',
    perkValue: 'Void Walker',
    perkDescription: 'Sets social status title.',
  },
  {
    id: 'paper_crown',
    name: 'Paper Crown',
    slot: 'head',
    rarity: 'common',
    icon: '👑',
    image: INLINE_LOOT_IMAGES.paper_crown,
    renderScale: 0.92,
    description: 'A handmade crown for first wins.',
    perkType: 'cosmetic',
    perkValue: 0,
    perkDescription: 'Cosmetic only.',
  },
  {
    id: 'plain_tee',
    name: 'Plain Tee',
    slot: 'body',
    rarity: 'common',
    icon: '👕',
    image: INLINE_LOOT_IMAGES.plain_tee,
    renderScale: 0.92,
    description: 'Simple shirt for everyday grind.',
    perkType: 'cosmetic',
    perkValue: 0,
    perkDescription: 'Cosmetic only.',
  },
  {
    id: 'worn_bracelet',
    name: 'Worn Bracelet',
    slot: 'legs',
    rarity: 'common',
    icon: '📿',
    image: INLINE_LOOT_IMAGES.worn_bracelet,
    renderScale: 0.92,
    description: 'Old bracelet that marks consistency.',
    perkType: 'cosmetic',
    perkValue: 0,
    perkDescription: 'Cosmetic only.',
  },
  {
    id: 'soft_glow',
    name: 'Soft Glow',
    slot: 'ring',
    rarity: 'common',
    icon: '💫',
    image: INLINE_LOOT_IMAGES.soft_glow,
    renderScale: 0.94,
    description: 'Subtle aura for calm sessions.',
    perkType: 'status_title',
    perkValue: 'Steady Starter',
    perkDescription: 'Sets social status title.',
  },
  {
    id: 'canvas_cap',
    name: 'Canvas Cap',
    slot: 'head',
    rarity: 'common',
    icon: '🧢',
    image: INLINE_LOOT_IMAGES.canvas_cap,
    renderScale: 0.92,
    description: 'Low-profile cap with clean lines.',
    perkType: 'cosmetic',
    perkValue: 0,
    perkDescription: 'Cosmetic only.',
  },
  {
    id: 'sprint_cap',
    name: 'Sprint Cap',
    slot: 'head',
    rarity: 'rare',
    icon: '🎽',
    image: INLINE_LOOT_IMAGES.sprint_cap,
    description: 'Light cap tuned for focused streaks.',
    perkType: 'focus_boost',
    perkValue: 0.06,
    perkDescription: '+6% XP during Focus Mode.',
  },
  {
    id: 'task_vest',
    name: 'Task Vest',
    slot: 'body',
    rarity: 'rare',
    icon: '🦺',
    image: INLINE_LOOT_IMAGES.task_vest,
    description: 'Utility vest for mission-driven sessions.',
    perkType: 'xp_skill_boost',
    perkValue: 0.05,
    perkTarget: 'learner',
    perkDescription: '+5% XP to Learner skill.',
  },
  {
    id: 'code_wraps',
    name: 'Code Wraps',
    slot: 'legs',
    rarity: 'rare',
    icon: '🧤',
    image: INLINE_LOOT_IMAGES.code_wraps,
    description: 'Finger wraps that boost coding luck.',
    perkType: 'chest_drop_boost',
    perkValue: 0.06,
    perkTarget: 'coding',
    perkDescription: '+6% chest drop chance while grinding coding category.',
  },
  {
    id: 'signal_pin',
    name: 'Signal Pin',
    slot: 'legs',
    rarity: 'rare',
    icon: '📡',
    image: INLINE_LOOT_IMAGES.signal_pin,
    description: 'Badge that amplifies social output.',
    perkType: 'xp_skill_boost',
    perkValue: 0.05,
    perkTarget: 'communicator',
    perkDescription: '+5% XP to Communicator skill.',
  },
  {
    id: 'study_halo',
    name: 'Study Halo',
    slot: 'ring',
    rarity: 'rare',
    icon: '📘',
    image: INLINE_LOOT_IMAGES.study_halo,
    description: 'Academic glow around methodical learners.',
    perkType: 'status_title',
    perkValue: 'Session Scholar',
    perkDescription: 'Sets social status title.',
  },
  {
    id: 'sketch_hood',
    name: 'Sketch Hood',
    slot: 'body',
    rarity: 'rare',
    icon: '🎨',
    image: INLINE_LOOT_IMAGES.sketch_hood,
    description: 'Art-forward hoodie for design blocks.',
    perkType: 'xp_skill_boost',
    perkValue: 0.05,
    perkTarget: 'designer',
    perkDescription: '+5% XP to Designer skill.',
  },
  {
    id: 'chrono_visor',
    name: 'Chrono Visor',
    slot: 'head',
    rarity: 'epic',
    icon: '⌛',
    image: INLINE_LOOT_IMAGES.chrono_visor,
    renderScale: 1.04,
    description: 'Visor synced to your best productivity windows.',
    perkType: 'xp_global_boost',
    perkValue: 0.03,
    perkDescription: '+3% XP to all skills.',
  },
  {
    id: 'pulse_coat',
    name: 'Pulse Coat',
    slot: 'body',
    rarity: 'epic',
    icon: '🧥',
    image: INLINE_LOOT_IMAGES.pulse_coat,
    renderScale: 1.05,
    description: 'Coat that channels momentum between sessions.',
    perkType: 'xp_global_boost',
    perkValue: 0.04,
    perkDescription: '+4% XP to all skills.',
  },
  {
    id: 'sonic_loop',
    name: 'Sonic Loop',
    slot: 'legs',
    rarity: 'epic',
    icon: '🎵',
    image: INLINE_LOOT_IMAGES.sonic_loop,
    renderScale: 1.04,
    description: 'Audio relic that sharpens deep listening.',
    perkType: 'xp_skill_boost',
    perkValue: 0.08,
    perkTarget: 'listener',
    perkDescription: '+8% XP to Listener skill.',
  },
  {
    id: 'teamlink_band',
    name: 'Teamlink Band',
    slot: 'legs',
    rarity: 'epic',
    icon: '🤝',
    image: INLINE_LOOT_IMAGES.teamlink_band,
    renderScale: 1.04,
    description: 'Coordination band that improves social synergy.',
    perkType: 'xp_skill_boost',
    perkValue: 0.07,
    perkTarget: 'communicator',
    perkDescription: '+7% XP to Communicator skill.',
  },
  {
    id: 'aurora_field',
    name: 'Aurora Field',
    slot: 'ring',
    rarity: 'epic',
    icon: '🌠',
    image: INLINE_LOOT_IMAGES.aurora_field,
    renderScale: 1.06,
    description: 'Luminous field visible in social profiles.',
    perkType: 'status_title',
    perkValue: 'Aurora Vanguard',
    perkDescription: 'Sets social status title.',
  },
  {
    id: 'singularity_helm',
    name: 'Singularity Helm',
    slot: 'head',
    rarity: 'legendary',
    icon: '🪖',
    image: INLINE_LOOT_IMAGES.singularity_helm,
    renderScale: 1.08,
    description: 'High-end helm that bends focus around goals.',
    perkType: 'xp_global_boost',
    perkValue: 0.06,
    perkDescription: '+6% XP to all skills.',
  },
  {
    id: 'zero_day_jacket',
    name: 'Zero-Day Jacket',
    slot: 'body',
    rarity: 'legendary',
    icon: '🥷',
    image: INLINE_LOOT_IMAGES.zero_day_jacket,
    renderScale: 1.1,
    description: 'Prestige jacket stitched for elite grinders.',
    perkType: 'xp_global_boost',
    perkValue: 0.08,
    perkDescription: '+8% XP to all skills.',
  },
  {
    id: 'mythic_monocle',
    name: 'Mythic Monocle',
    slot: 'legs',
    rarity: 'legendary',
    icon: '🧐',
    image: INLINE_LOOT_IMAGES.mythic_monocle,
    renderScale: 1.12,
    description: 'Ultra-rare lens that spots hidden opportunity.',
    perkType: 'chest_drop_boost',
    perkValue: 0.14,
    perkTarget: 'coding',
    perkDescription: '+14% chest drop chance while grinding coding category.',
  },
  {
    id: 'eclipse_mantle',
    name: 'Eclipse Mantle',
    slot: 'ring',
    rarity: 'legendary',
    icon: '🌘',
    image: INLINE_LOOT_IMAGES.eclipse_mantle,
    renderScale: 1.1,
    description: 'Mythic aura that shields your streak momentum.',
    perkType: 'streak_shield',
    perkValue: 1,
    perkDescription: 'Protects your streak once when you miss a day.',
  },
  {
    id: 'omega_crown',
    name: 'Omega Crown',
    slot: 'head',
    rarity: 'mythic',
    icon: '👑',
    image: INLINE_LOOT_IMAGES.omega_crown,
    renderScale: 1.15,
    description: 'The ultimate symbol of mastery. Insanely rare.',
    perkType: 'xp_global_boost',
    perkValue: 0.1,
    perkDescription: '+10% XP to all skills.',
  },
  {
    id: 'prism_aura',
    name: 'Prism Aura',
    slot: 'ring',
    rarity: 'mythic',
    icon: '🌈',
    image: INLINE_LOOT_IMAGES.prism_aura,
    renderScale: 1.25,
    description: 'A transcendent aura visible only to the most dedicated grinders.',
    perkType: 'status_title',
    perkValue: 'Prism Wielder',
    perkDescription: 'Sets social status title.',
  },
  // Combat perks (Arena)
  {
    id: 'iron_gauntlet',
    name: 'Iron Gauntlet',
    slot: 'legs',
    rarity: 'common',
    icon: '🥊',
    description: 'Basic combat glove for striking.',
    perkType: 'atk_boost',
    perkValue: 2,
    perkDescription: '+2 ATK',
  },
  {
    id: 'steel_helm',
    name: 'Steel Helm',
    slot: 'head',
    rarity: 'rare',
    icon: '⛑️',
    description: 'Protective headgear for the arena.',
    perkType: 'hp_boost',
    perkValue: 10,
    perkDescription: '+10 HP',
  },
  {
    id: 'regen_ring',
    name: 'Regen Ring',
    slot: 'legs',
    rarity: 'rare',
    icon: '💍',
    description: 'Restores vitality during combat.',
    perkType: 'hp_regen_boost',
    perkValue: 5,
    perkDescription: '+5 HP regen',
  },
  {
    id: 'war_blade',
    name: 'War Blade',
    slot: 'body',
    rarity: 'epic',
    icon: '⚔️',
    description: 'Sharp edge for decisive strikes.',
    perkType: 'atk_boost',
    perkValue: 5,
    perkDescription: '+5 ATK',
  },
  {
    id: 'titan_plate',
    name: 'Titan Plate',
    slot: 'body',
    rarity: 'epic',
    icon: '🛡️',
    description: 'Heavy armor for endurance.',
    perkType: 'hp_boost',
    perkValue: 25,
    perkDescription: '+25 HP',
  },
  {
    id: 'vitality_aura',
    name: 'Vitality Aura',
    slot: 'ring',
    rarity: 'legendary',
    icon: '💚',
    description: 'Sustains you through long battles.',
    perkType: 'hp_regen_boost',
    perkValue: 15,
    perkDescription: '+15 HP regen',
  },
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

  // ── Harvested Plants (from Farm) ──────────────────────────────────────────
  {
    id: 'wheat',
    name: 'Wheat',
    slot: 'plant',
    rarity: 'common',
    icon: '🌾',
    description: 'Golden wheat harvested from your farm.',
    perkType: 'harvested_plant',
    perkValue: 0,
    perkDescription: 'Farm harvest. Sell on the Marketplace.',
  },
  {
    id: 'herbs',
    name: 'Herbs',
    slot: 'plant',
    rarity: 'common',
    icon: '🌿',
    description: 'Fresh herbs harvested from your farm.',
    perkType: 'harvested_plant',
    perkValue: 0,
    perkDescription: 'Farm harvest. Sell on the Marketplace.',
  },
  {
    id: 'apples',
    name: 'Apples',
    slot: 'plant',
    rarity: 'rare',
    icon: '🍎',
    description: 'Crisp apples grown with care.',
    perkType: 'harvested_plant',
    perkValue: 0,
    perkDescription: 'Farm harvest. Sell on the Marketplace.',
  },
  {
    id: 'blossoms',
    name: 'Blossoms',
    slot: 'plant',
    rarity: 'rare',
    icon: '🌸',
    description: 'Delicate blossoms from your garden.',
    perkType: 'harvested_plant',
    perkValue: 0,
    perkDescription: 'Farm harvest. Sell on the Marketplace.',
  },
  {
    id: 'clovers',
    name: 'Clovers',
    slot: 'plant',
    rarity: 'epic',
    icon: '🍀',
    description: 'Lucky four-leaf clovers, rare and prized.',
    perkType: 'harvested_plant',
    perkValue: 0,
    perkDescription: 'Farm harvest. Sell on the Marketplace.',
  },
  {
    id: 'orchids',
    name: 'Orchids',
    slot: 'plant',
    rarity: 'epic',
    icon: '🌺',
    description: 'Exotic orchids requiring patience to grow.',
    perkType: 'harvested_plant',
    perkValue: 0,
    perkDescription: 'Farm harvest. Sell on the Marketplace.',
  },
  {
    id: 'star_bloom',
    name: 'Star Bloom',
    slot: 'plant',
    rarity: 'legendary',
    icon: '🌟',
    description: 'A radiant bloom said to hold cosmic energy.',
    perkType: 'harvested_plant',
    perkValue: 0,
    perkDescription: 'Farm harvest. Sell on the Marketplace.',
  },
  {
    id: 'crystal_root',
    name: 'Crystal Root',
    slot: 'plant',
    rarity: 'legendary',
    icon: '💎',
    description: 'A crystalline root pulsing with energy.',
    perkType: 'harvested_plant',
    perkValue: 0,
    perkDescription: 'Farm harvest. Sell on the Marketplace.',
  },
  {
    id: 'void_blossom',
    name: 'Void Blossom',
    slot: 'plant',
    rarity: 'mythic',
    icon: '🔮',
    description: 'A flower from beyond — grown from a Void Spore.',
    perkType: 'harvested_plant',
    perkValue: 0,
    perkDescription: 'Farm harvest. Sell on the Marketplace.',
  },

  // ── Weapons (weapon slot — always +ATK) ────────────────────────────────
  {
    id: 'iron_sword',
    name: 'Iron Sword',
    slot: 'weapon',
    rarity: 'common',
    icon: '⚔️',
    description: 'A sturdy iron blade — reliable in any fight.',
    perkType: 'atk_boost',
    perkValue: 6,
    perkDescription: '+6 ATK',
  },
  {
    id: 'steel_blade',
    name: 'Steel Blade',
    slot: 'weapon',
    rarity: 'rare',
    icon: '🗡️',
    description: 'Tempered steel with a keen edge.',
    perkType: 'atk_boost',
    perkValue: 14,
    perkDescription: '+14 ATK',
  },
  {
    id: 'void_edge',
    name: 'Void Edge',
    slot: 'weapon',
    rarity: 'epic',
    icon: '⚡',
    description: 'A blade crackling with electric energy from the void.',
    perkType: 'atk_boost',
    perkValue: 25,
    perkDescription: '+25 ATK',
  },
  {
    id: 'nexus_sword',
    name: 'Nexus Sword',
    slot: 'weapon',
    rarity: 'legendary',
    icon: '🌟',
    description: 'Forged at the nexus of all realities. Immense power.',
    perkType: 'atk_boost',
    perkValue: 45,
    perkDescription: '+45 ATK',
  },
  {
    id: 'omega_blade',
    name: 'Omega Blade',
    slot: 'weapon',
    rarity: 'mythic',
    icon: '☄️',
    description: 'The ultimate weapon. Nothing can withstand its edge.',
    perkType: 'atk_boost',
    perkValue: 75,
    perkDescription: '+75 ATK',
  },
]

export const CHEST_DEFS: Record<ChestType, ChestDef> = {
  common_chest: {
    id: 'common_chest',
    name: 'Common Chest',
    icon: '📦',
    image: 'loot/chest_t1_user.png',
    rarity: 'common',
    // ~84% common · ~14% rare · ~2% epic · 0% legendary
    itemWeights: [
      // Common (×80)
      { itemId: 'focus_cap', weight: 80 },
      { itemId: 'cozy_sweater', weight: 80 },
      { itemId: 'paper_crown', weight: 80 },
      { itemId: 'plain_tee', weight: 80 },
      { itemId: 'worn_bracelet', weight: 80 },
      { itemId: 'soft_glow', weight: 80 },
      { itemId: 'canvas_cap', weight: 80 },
      { itemId: 'iron_gauntlet', weight: 80 },
      { itemId: 'iron_sword', weight: 80 },
      // Rare (×8)
      { itemId: 'grind_hoodie', weight: 8 },
      { itemId: 'speed_shorts', weight: 8 },
      { itemId: 'zen_beanie', weight: 8 },
      { itemId: 'pixel_shades', weight: 8 },
      { itemId: 'scholar_cape', weight: 8 },
      { itemId: 'sprint_cap', weight: 8 },
      { itemId: 'task_vest', weight: 8 },
      { itemId: 'code_wraps', weight: 8 },
      { itemId: 'signal_pin', weight: 8 },
      { itemId: 'study_halo', weight: 8 },
      { itemId: 'sketch_hood', weight: 8 },
      { itemId: 'steel_helm', weight: 8 },
      { itemId: 'regen_ring', weight: 8 },
      { itemId: 'steel_blade', weight: 8 },
      // Epic (×1)
      { itemId: 'pulse_aura', weight: 1 },
      { itemId: 'aegis_aura', weight: 1 },
      { itemId: 'neon_visor', weight: 1 },
      { itemId: 'beat_headphones', weight: 1 },
      { itemId: 'social_ring', weight: 1 },
      { itemId: 'chrono_visor', weight: 1 },
      { itemId: 'pulse_coat', weight: 1 },
      { itemId: 'sonic_loop', weight: 1 },
      { itemId: 'teamlink_band', weight: 1 },
      { itemId: 'aurora_field', weight: 1 },
      { itemId: 'war_blade', weight: 1 },
      { itemId: 'titan_plate', weight: 1 },
      { itemId: 'void_edge', weight: 1 },
    ],
  },
  rare_chest: {
    id: 'rare_chest',
    name: 'Rare Chest',
    icon: '🎁',
    image: 'loot/chest_t2_user.png',
    rarity: 'rare',
    // ~84% rare · ~14% epic · ~2% legendary · 0% common/mythic
    itemWeights: [
      // Rare (×60)
      { itemId: 'grind_hoodie', weight: 60 },
      { itemId: 'speed_shorts', weight: 60 },
      { itemId: 'zen_beanie', weight: 60 },
      { itemId: 'pixel_shades', weight: 60 },
      { itemId: 'scholar_cape', weight: 60 },
      { itemId: 'sprint_cap', weight: 60 },
      { itemId: 'task_vest', weight: 60 },
      { itemId: 'code_wraps', weight: 60 },
      { itemId: 'signal_pin', weight: 60 },
      { itemId: 'study_halo', weight: 60 },
      { itemId: 'sketch_hood', weight: 60 },
      { itemId: 'steel_helm', weight: 60 },
      { itemId: 'regen_ring', weight: 60 },
      { itemId: 'steel_blade', weight: 60 },
      // Epic (×10)
      { itemId: 'pulse_aura', weight: 10 },
      { itemId: 'aegis_aura', weight: 10 },
      { itemId: 'neon_visor', weight: 10 },
      { itemId: 'beat_headphones', weight: 10 },
      { itemId: 'social_ring', weight: 10 },
      { itemId: 'chrono_visor', weight: 10 },
      { itemId: 'pulse_coat', weight: 10 },
      { itemId: 'sonic_loop', weight: 10 },
      { itemId: 'teamlink_band', weight: 10 },
      { itemId: 'aurora_field', weight: 10 },
      { itemId: 'war_blade', weight: 10 },
      { itemId: 'titan_plate', weight: 10 },
      { itemId: 'void_edge', weight: 10 },
      // Legendary (×2)
      { itemId: 'geek_glasses', weight: 2 },
      { itemId: 'hacker_jacket', weight: 2 },
      { itemId: 'phantom_cloak', weight: 2 },
      { itemId: 'void_aura', weight: 2 },
      { itemId: 'singularity_helm', weight: 2 },
      { itemId: 'zero_day_jacket', weight: 2 },
      { itemId: 'mythic_monocle', weight: 2 },
      { itemId: 'eclipse_mantle', weight: 2 },
      { itemId: 'vitality_aura', weight: 2 },
      { itemId: 'nexus_sword', weight: 2 },
    ],
  },
  epic_chest: {
    id: 'epic_chest',
    name: 'Epic Chest',
    icon: '🪙',
    image: 'loot/chest_bw_test.png',
    rarity: 'epic',
    // ~84% epic · ~15% legendary · ~0.5% mythic potions · ~0.1% mythic gear
    itemWeights: [
      // Epic (×50)
      { itemId: 'pulse_aura', weight: 50 },
      { itemId: 'aegis_aura', weight: 50 },
      { itemId: 'neon_visor', weight: 50 },
      { itemId: 'beat_headphones', weight: 50 },
      { itemId: 'social_ring', weight: 50 },
      { itemId: 'chrono_visor', weight: 50 },
      { itemId: 'pulse_coat', weight: 50 },
      { itemId: 'sonic_loop', weight: 50 },
      { itemId: 'teamlink_band', weight: 50 },
      { itemId: 'aurora_field', weight: 50 },
      { itemId: 'war_blade', weight: 50 },
      { itemId: 'titan_plate', weight: 50 },
      { itemId: 'void_edge', weight: 50 },
      // Legendary (×12)
      { itemId: 'geek_glasses', weight: 12 },
      { itemId: 'hacker_jacket', weight: 12 },
      { itemId: 'phantom_cloak', weight: 12 },
      { itemId: 'void_aura', weight: 12 },
      { itemId: 'singularity_helm', weight: 12 },
      { itemId: 'zero_day_jacket', weight: 12 },
      { itemId: 'mythic_monocle', weight: 12 },
      { itemId: 'eclipse_mantle', weight: 12 },
      { itemId: 'vitality_aura', weight: 12 },
      { itemId: 'nexus_sword', weight: 12 },
      // Mythic gear (×0.5)
      { itemId: 'omega_crown', weight: 0.5 },
      { itemId: 'prism_aura', weight: 0.5 },
      { itemId: 'omega_blade', weight: 0.5 },
      // Mythic potions (×1)
      { itemId: 'atk_potion', weight: 1 },
      { itemId: 'hp_potion', weight: 1 },
      { itemId: 'regen_potion', weight: 1 },
    ],
  },
  legendary_chest: {
    id: 'legendary_chest',
    name: 'Legendary Chest',
    icon: '💎',
    image: 'loot/chest_bw_test.png',
    rarity: 'legendary',
    // ~93% legendary · ~4% mythic potions · ~2% mythic gear
    itemWeights: [
      // Legendary (×20)
      { itemId: 'geek_glasses', weight: 20 },
      { itemId: 'hacker_jacket', weight: 20 },
      { itemId: 'phantom_cloak', weight: 20 },
      { itemId: 'void_aura', weight: 20 },
      { itemId: 'singularity_helm', weight: 20 },
      { itemId: 'zero_day_jacket', weight: 20 },
      { itemId: 'mythic_monocle', weight: 20 },
      { itemId: 'eclipse_mantle', weight: 20 },
      { itemId: 'vitality_aura', weight: 20 },
      { itemId: 'nexus_sword', weight: 20 },
      // Mythic gear (×2)
      { itemId: 'omega_crown', weight: 2 },
      { itemId: 'prism_aura', weight: 2 },
      { itemId: 'omega_blade', weight: 2 },
      // Mythic potions (×3)
      { itemId: 'atk_potion', weight: 3 },
      { itemId: 'hp_potion', weight: 3 },
      { itemId: 'regen_potion', weight: 3 },
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

export function openChest(chestType: ChestType, context: LootDropContext): ChestOpenResult | null {
  const chest = CHEST_DEFS[chestType]
  const itemId = randomPickByWeight(chest.itemWeights.map((entry) => ({ value: entry.itemId, weight: entry.weight })))
  const item = LOOT_ITEMS.find((x) => x.id === itemId)
  if (!item) return null
  return {
    item,
    estimatedDropRate: estimateLootDropRate(item.id, context),
  }
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
    if (item.perkType === 'xp_skill_boost') {
      const skillKey = item.perkTarget || 'developer'
      out.skillXpMultiplierBySkill[skillKey] = Math.max(
        out.skillXpMultiplierBySkill[skillKey] ?? 1,
        1 + Number(item.perkValue || 0),
      )
    } else if (item.perkType === 'chest_drop_boost') {
      const categoryKey = item.perkTarget || 'coding'
      out.chestDropChanceBonusByCategory[categoryKey] = Math.max(
        out.chestDropChanceBonusByCategory[categoryKey] ?? 0,
        Number(item.perkValue || 0),
      )
    } else if (item.perkType === 'status_title') {
      out.statusTitle = String(item.perkValue || '')
    } else if (item.perkType === 'xp_global_boost') {
      out.globalXpMultiplier = Math.max(out.globalXpMultiplier, 1 + Number(item.perkValue || 0))
    } else if (item.perkType === 'streak_shield') {
      out.streakShield = out.streakShield || Boolean(item.perkValue)
    } else if (item.perkType === 'focus_boost') {
      out.focusBoostMultiplier = Math.max(out.focusBoostMultiplier, 1 + Number(item.perkValue || 0))
    }
    // Combat perks (atk_boost, hp_boost, hp_regen_boost) are summed in getCombatStatsFromEquipped
  }

  return out
}

export interface CombatStats {
  atk: number
  hp: number
  hpRegen: number
}

/** Sum ATK, HP, HP regen from equipped items with combat perks. */
export function getCombatStatsFromEquipped(equippedBySlot: Partial<Record<LootSlot, string>>): CombatStats {
  const out: CombatStats = { atk: 0, hp: 0, hpRegen: 0 }
  const equippedItems = Object.values(equippedBySlot)
    .map((id) => LOOT_ITEMS.find((x) => x.id === id))
    .filter((item): item is LootItemDef => Boolean(item))

  for (const item of equippedItems) {
    if (item.perkType === 'atk_boost') {
      out.atk += Number(item.perkValue || 0)
    } else if (item.perkType === 'hp_boost') {
      out.hp += Number(item.perkValue || 0)
    } else if (item.perkType === 'hp_regen_boost') {
      out.hpRegen += Number(item.perkValue || 0)
    }
  }
  return out
}
