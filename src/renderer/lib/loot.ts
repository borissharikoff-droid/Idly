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
]
export const CHEST_DEFS: Record<ChestType, ChestDef> = {
  common_chest: {
    id: 'common_chest',
    name: 'Common Chest',
    icon: '📦',
    image: 'loot/chest_t1_user.png',
    rarity: 'common',
    itemWeights: [],
  },
  rare_chest: {
    id: 'rare_chest',
    name: 'Rare Chest',
    icon: '🎁',
    image: 'loot/chest_t2_user.png',
    rarity: 'rare',
    // ~84% rare · ~14% epic · ~2% legendary · 0% common/mythic
    itemWeights: [
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
}

/** Sum ATK, HP, HP regen from equipped items with combat perks. */
export function getCombatStatsFromEquipped(equippedBySlot: Partial<Record<LootSlot, string>>): CombatStats {
  const out: CombatStats = { atk: 0, hp: 0, hpRegen: 0 }
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
      }
    }
  }
  return out
}
