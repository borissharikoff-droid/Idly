import { create } from 'zustand'
import {
  CHEST_DEFS,
  LOOT_ITEMS,
  POTION_IDS,
  POTION_MAX,
  estimateLootDropRate,
  getChestGoldDrop,
  getEquippedPerkRuntime,
  nextPityAfterChestRoll,
  openChest,
  rollChestDrop,
  type ChestType,
  type LootDropContext,
  type LootRollPity,
  type LootSlot,
} from '../lib/loot'
import { useGoldStore } from './goldStore'
import { useAuthStore } from './authStore'

export interface PendingReward {
  id: string
  createdAt: number
  source: LootDropContext['source']
  chestType: ChestType
  estimatedDropRate: number
  claimed: boolean
}

interface ChestCounts {
  common_chest: number
  rare_chest: number
  epic_chest: number
  legendary_chest: number
}

interface InventoryState {
  items: Record<string, number>
  chests: ChestCounts
  equippedBySlot: Partial<Record<LootSlot, string>>
  pendingRewards: PendingReward[]
  pity: LootRollPity
  lastSkillDropAt: number
  hydrate: () => void
  addChest: (chestType: ChestType, source: LootDropContext['source'], estimatedDropRate?: number) => string
  claimPendingReward: (rewardId: string) => void
  deletePendingReward: (rewardId: string) => void
  claimAllPendingRewards: () => void
  rollSkillGrindDrop: (context: LootDropContext, elapsedSeconds: number) => PendingReward | null
  rollSessionChestDrop: (context: LootDropContext) => { rewardId: string; chestType: ChestType; estimatedDropRate: number }
  openChestAndGrantItem: (chestType: ChestType, context: LootDropContext) => { itemId: string; estimatedDropRate: number; goldDropped: number } | null
  deleteChest: (chestType: ChestType, amount?: number) => void
  equipItem: (itemId: string) => void
  deleteItem: (itemId: string, amount?: number) => void
  unequipSlot: (slot: LootSlot) => void
  addItem: (itemId: string, qty?: number) => void
  /** Permanently consume a potion, boosting the corresponding stat by 1. Returns false if maxed or not owned. */
  consumePotion: (itemId: string) => boolean
  /** Merge cloud data into local (takes max). Used after sync. */
  mergeFromCloud: (items: Record<string, number>, chests: Record<ChestType, number>) => void
  permanentStats: { atk: number; hp: number; hpRegen: number }
}

const STORAGE_KEY = 'grindly_inventory_state_v2'
// Economy: chests from grinding are extremely rare — arena bosses are the primary loot source.
// - cooldown: 3600s (1 hr)
// - base chance: 0.02%/min → ~1.2% per hour → ~1 chest per 80+ hours grinding
const SKILL_DROP_COOLDOWN_MS = 3_600_000
const BASE_DROP_PER_MINUTE = 0.0002


const initialState: Omit<InventoryState, 'hydrate' | 'addItem' | 'addChest' | 'claimPendingReward' | 'claimAllPendingRewards' | 'rollSkillGrindDrop' | 'rollSessionChestDrop' | 'openChestAndGrantItem' | 'equipItem' | 'unequipSlot' | 'mergeFromCloud' | 'consumePotion' | 'deletePendingReward' | 'deleteChest' | 'deleteItem'> = {
  items: {},
  chests: {
    common_chest: 0,
    rare_chest: 0,
    epic_chest: 0,
    legendary_chest: 0,
  },
  equippedBySlot: {},
  pendingRewards: [],
  pity: {
    rollsSinceRareChest: 0,
    rollsSinceEpicChest: 0,
    rollsSinceLegendaryChest: 0,
  },
  lastSkillDropAt: 0,
  permanentStats: { atk: 0, hp: 0, hpRegen: 0 },
}

function saveSnapshot(state: InventoryState): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        items: state.items,
        chests: state.chests,
        equippedBySlot: state.equippedBySlot,
        pendingRewards: state.pendingRewards,
        pity: state.pity,
        lastSkillDropAt: state.lastSkillDropAt,
        permanentStats: state.permanentStats,
      }),
    )
  } catch {
    // ignore storage failures
  }
}

function readSnapshot(): Partial<typeof initialState> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as Partial<typeof initialState>
  } catch {
    return null
  }
}

export const useInventoryStore = create<InventoryState>((set, get) => ({
  ...initialState,

  hydrate() {
    const snapshot = readSnapshot()
    if (!snapshot) return
    set((state) => {
      const chests = snapshot.chests ?? state.chests
      const pity = snapshot.pity ?? state.pity
      return {
        ...state,
        items: snapshot.items ?? state.items,
        chests: {
          common_chest: chests.common_chest ?? 0,
          rare_chest: chests.rare_chest ?? 0,
          epic_chest: chests.epic_chest ?? 0,
          legendary_chest: chests.legendary_chest ?? 0,
        },
        equippedBySlot: snapshot.equippedBySlot ?? state.equippedBySlot,
        pendingRewards: snapshot.pendingRewards ?? state.pendingRewards,
        pity: {
          rollsSinceRareChest: pity.rollsSinceRareChest ?? 0,
          rollsSinceEpicChest: pity.rollsSinceEpicChest ?? 0,
          rollsSinceLegendaryChest: pity.rollsSinceLegendaryChest ?? 0,
        },
        lastSkillDropAt: snapshot.lastSkillDropAt ?? state.lastSkillDropAt,
        permanentStats: {
          atk: (snapshot as { permanentStats?: { atk?: number } }).permanentStats?.atk ?? 0,
          hp: (snapshot as { permanentStats?: { hp?: number } }).permanentStats?.hp ?? 0,
          hpRegen: (snapshot as { permanentStats?: { hpRegen?: number } }).permanentStats?.hpRegen ?? 0,
        },
      }
    })
  },

  addChest(chestType, source, estimatedDropRate = 0) {
    const id = crypto.randomUUID()
    set((state) => {
      const next: InventoryState = {
        ...state,
        pendingRewards: [
          ...state.pendingRewards,
          {
            id,
            createdAt: Date.now(),
            source,
            chestType,
            estimatedDropRate,
            claimed: false,
          },
        ],
      }
      saveSnapshot(next)
      return next
    })
    return id
  },

  claimPendingReward(rewardId) {
    set((state) => {
      const reward = state.pendingRewards.find((r) => r.id === rewardId && !r.claimed)
      if (!reward) return state
      const nextChests = { ...state.chests, [reward.chestType]: (state.chests[reward.chestType] ?? 0) + 1 }
      const nextRewards = state.pendingRewards.map((r) => (r.id === rewardId ? { ...r, claimed: true } : r))
      const next: InventoryState = {
        ...state,
        chests: nextChests,
        pendingRewards: nextRewards,
      }
      saveSnapshot(next)
      return next
    })
  },

  deletePendingReward(rewardId) {
    set((state) => {
      const next: InventoryState = {
        ...state,
        pendingRewards: state.pendingRewards.filter((reward) => reward.id !== rewardId),
      }
      saveSnapshot(next)
      return next
    })
  },

  claimAllPendingRewards() {
    set((state) => {
      const nextChests = { ...state.chests }
      const nextRewards = state.pendingRewards.map((reward) => {
        if (!reward.claimed) nextChests[reward.chestType] += 1
        return reward.claimed ? reward : { ...reward, claimed: true }
      })
      const next: InventoryState = {
        ...state,
        chests: nextChests,
        pendingRewards: nextRewards,
      }
      saveSnapshot(next)
      return next
    })
  },

  rollSkillGrindDrop(context, elapsedSeconds) {
    const now = Date.now()
    const state = get()
    const lastDropAt = state.lastSkillDropAt > now ? 0 : state.lastSkillDropAt
    if (now - lastDropAt < SKILL_DROP_COOLDOWN_MS) return null
    if (elapsedSeconds <= 0) return null
    const perk = getEquippedPerkRuntime(state.equippedBySlot)
    const categoryBonus = context.focusCategory ? (perk.chestDropChanceBonusByCategory[context.focusCategory] ?? 0) : 0
    const effectivePerMinute = BASE_DROP_PER_MINUTE * (1 + categoryBonus)
    const perSecond = effectivePerMinute / 60
    // Clamp to cooldown window to avoid near-100% chance on first ever roll (lastSkillDropAt=0).
    const sinceLastDrop = lastDropAt > 0 ? Math.floor((now - lastDropAt) / 1000) : SKILL_DROP_COOLDOWN_MS / 1000
    const elapsedForChance = Math.max(elapsedSeconds, Math.min(sinceLastDrop, SKILL_DROP_COOLDOWN_MS / 1000))
    const chance = 1 - Math.pow(1 - perSecond, Math.max(1, elapsedForChance))
    if (Math.random() > chance) return null

    const chestRoll = rollChestDrop(context, state.pity)
    const reward: PendingReward = {
      id: crypto.randomUUID(),
      createdAt: now,
      source: context.source,
      chestType: chestRoll.chestType,
      estimatedDropRate: chestRoll.estimatedDropRate,
      claimed: false,
    }
    const nextState: InventoryState = {
      ...state,
      pity: nextPityAfterChestRoll(chestRoll.chestType, state.pity),
      pendingRewards: [...state.pendingRewards, reward],
      lastSkillDropAt: now,
    }
    set(nextState)
    saveSnapshot(nextState)
    return reward
  },

  rollSessionChestDrop(context) {
    const state = get()
    const chestRoll = rollChestDrop(context, state.pity)
    const rewardId = crypto.randomUUID()
    const reward: PendingReward = {
      id: rewardId,
      createdAt: Date.now(),
      source: context.source,
      chestType: chestRoll.chestType,
      estimatedDropRate: chestRoll.estimatedDropRate,
      claimed: false,
    }
    const nextState: InventoryState = {
      ...state,
      pity: nextPityAfterChestRoll(chestRoll.chestType, state.pity),
      pendingRewards: [...state.pendingRewards, reward],
    }
    set(nextState)
    saveSnapshot(nextState)
    return {
      rewardId,
      chestType: chestRoll.chestType,
      estimatedDropRate: chestRoll.estimatedDropRate,
    }
  },

  openChestAndGrantItem(chestType, context) {
    const state = get()
    if ((state.chests[chestType] ?? 0) <= 0) return null
    const result = openChest(chestType, context)
    if (!result) return null
    const goldAmount = getChestGoldDrop(chestType)
    const nextChests = { ...state.chests, [chestType]: Math.max(0, state.chests[chestType] - 1) }
    const nextItems = { ...state.items, [result.item.id]: (state.items[result.item.id] ?? 0) + 1 }
    const nextState: InventoryState = {
      ...state,
      chests: nextChests,
      items: nextItems,
    }
    set(nextState)
    saveSnapshot(nextState)
    useGoldStore.getState().addGold(goldAmount)
    const user = useAuthStore.getState().user
    if (user) useGoldStore.getState().syncToSupabase(user.id).catch(() => {})
    return { itemId: result.item.id, estimatedDropRate: estimateLootDropRate(result.item.id, context), goldDropped: goldAmount }
  },

  deleteChest(chestType, amount = 1) {
    const qty = Math.max(1, Math.floor(amount))
    set((state) => {
      const next: InventoryState = {
        ...state,
        chests: {
          ...state.chests,
          [chestType]: Math.max(0, (state.chests[chestType] ?? 0) - qty),
        },
      }
      saveSnapshot(next)
      return next
    })
  },

  consumePotion(itemId) {
    const state = get()
    const qty = state.items[itemId] ?? 0
    if (qty <= 0) return false
    const potionIndex = POTION_IDS.indexOf(itemId as (typeof POTION_IDS)[number])
    if (potionIndex === -1) return false
    const { permanentStats } = state
    let nextStats: { atk: number; hp: number; hpRegen: number } | null = null
    if (itemId === 'atk_potion' && permanentStats.atk < POTION_MAX) {
      nextStats = { ...permanentStats, atk: permanentStats.atk + 1 }
    } else if (itemId === 'hp_potion' && permanentStats.hp < POTION_MAX) {
      nextStats = { ...permanentStats, hp: permanentStats.hp + 1 }
    } else if (itemId === 'regen_potion' && permanentStats.hpRegen < POTION_MAX) {
      nextStats = { ...permanentStats, hpRegen: permanentStats.hpRegen + 1 }
    }
    if (!nextStats) return false
    const nextItems = { ...state.items, [itemId]: qty - 1 }
    if (nextItems[itemId] === 0) delete nextItems[itemId]
    const nextState: InventoryState = { ...state, items: nextItems, permanentStats: nextStats }
    set(nextState)
    saveSnapshot(nextState)
    return true
  },

  equipItem(itemId) {
    const state = get()
    const qty = state.items[itemId] ?? 0
    if (qty <= 0) return
    const item = LOOT_ITEMS.find((x) => x.id === itemId)
    if (!item || item.slot === 'consumable') return
    set((prev) => {
      const next: InventoryState = {
        ...prev,
        equippedBySlot: { ...prev.equippedBySlot, [item.slot]: item.id },
      }
      saveSnapshot(next)
      return next
    })
  },

  deleteItem(itemId, amount = 1) {
    const qty = Math.max(1, Math.floor(amount))
    set((state) => {
      const current = state.items[itemId] ?? 0
      if (current <= 0) return state
      const nextItems = { ...state.items, [itemId]: Math.max(0, current - qty) }
      if (nextItems[itemId] === 0) delete nextItems[itemId]
      const nextEquipped = { ...state.equippedBySlot }
      for (const [slot, equippedId] of Object.entries(nextEquipped) as Array<[LootSlot, string]>) {
        if (equippedId === itemId && !nextItems[itemId]) {
          delete nextEquipped[slot]
        }
      }
      const next: InventoryState = {
        ...state,
        items: nextItems,
        equippedBySlot: nextEquipped,
      }
      saveSnapshot(next)
      return next
    })
  },

  unequipSlot(slot) {
    set((state) => {
      const nextEquipped = { ...state.equippedBySlot }
      delete nextEquipped[slot]
      const next: InventoryState = {
        ...state,
        equippedBySlot: nextEquipped,
      }
      saveSnapshot(next)
      return next
    })
  },

  addItem(itemId, qty = 1) {
    const safeQty = Math.max(1, Math.floor(qty))
    set((state) => {
      const next = { ...state, items: { ...state.items, [itemId]: (state.items[itemId] ?? 0) + safeQty } }
      saveSnapshot(next)
      return next
    })
  },

  mergeFromCloud(items, chests) {
    set((state) => {
      const nextItems = { ...state.items }
      for (const [itemId, cloudQty] of Object.entries(items)) {
        const localQty = nextItems[itemId] ?? 0
        const merged = Math.max(localQty, cloudQty)
        if (merged > 0) nextItems[itemId] = merged
        else if (itemId in nextItems) delete nextItems[itemId]
      }
      const nextChests: ChestCounts = {
        common_chest: Math.max(state.chests.common_chest ?? 0, chests.common_chest ?? 0),
        rare_chest: Math.max(state.chests.rare_chest ?? 0, chests.rare_chest ?? 0),
        epic_chest: Math.max(state.chests.epic_chest ?? 0, chests.epic_chest ?? 0),
        legendary_chest: Math.max(state.chests.legendary_chest ?? 0, chests.legendary_chest ?? 0),
      }
      const next: InventoryState = { ...state, items: nextItems, chests: nextChests }
      saveSnapshot(next)
      return next
    })
  },
}))

// The store uses lazy hydrate so callers can control when localStorage is read.
export function ensureInventoryHydrated(): void {
  useInventoryStore.getState().hydrate()
}
