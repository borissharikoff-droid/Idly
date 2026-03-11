import { create } from 'zustand'
import { CRAFT_RECIPE_MAP, canAffordRecipe, getCrafterSpeedMultiplier, getCrafterDoubleChance } from '../lib/crafting'
import { skillLevelFromXP, getGrindlyLevel, computeGrindlyBonuses } from '../lib/skills'
import { recordCraftComplete } from '../services/dailyActivityService'
import { useAchievementStatsStore } from './achievementStatsStore'
import { useGoldStore } from './goldStore'

const STORAGE_KEY = 'grindly_crafting_v2'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CraftJob {
  id: string
  recipeId: string
  outputItemId: string
  outputQty: number        // per-item output qty
  totalQty: number         // total items to craft in this batch
  doneQty: number          // items completed as of startedAt anchor
  secPerItem: number
  xpPerItem: number
  startedAt: number        // wall-clock anchor — doneQty was accurate at this time
  /** Snapshot of ingredients for refund on cancel */
  ingredients: Array<{ id: string; qty: number }>
}

interface CraftingState {
  craftXp: number
  activeJob: CraftJob | null
  queue: CraftJob[]

  hydrate: () => void

  /**
   * Consume ingredients upfront and enqueue a craft batch.
   * Returns 'ok' | 'not_enough' | 'invalid'.
   * Caller must pass current items and an onConsume callback (deducts from inventoryStore).
   */
  startCraft: (
    recipeId: string,
    qty: number,
    itemsOwned: Record<string, number>,
    onConsume: (id: string, qty: number) => void,
  ) => 'ok' | 'not_enough' | 'no_gold' | 'invalid'

  /**
   * Advance the active job based on wall time. Call every ~2s from App.
   * onGrant receives (itemId, qty, xpGained) — all three must be applied by caller.
   */
  tick: (
    now: number,
    onGrant: (itemId: string, qty: number, xpGained: number) => void,
  ) => void

  /** Cancel a job (active or queued). Refunds unconsumed ingredient quantities. */
  cancelJob: (
    jobId: string,
    onRefund: (id: string, qty: number) => void,
  ) => void

  /** Real-time completed qty for active job (computed from wall clock, not stored). */
  computeActiveDone: (now: number) => number
}

// ── Persistence ───────────────────────────────────────────────────────────────

interface Snapshot {
  craftXp: number
  activeJob: CraftJob | null
  queue: CraftJob[]
}

function save(s: Pick<CraftingState, 'craftXp' | 'activeJob' | 'queue'>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch { /* ignore */ }
}

function load(): Snapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Snapshot) : null
  } catch { return null }
}

function uid() {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useCraftingStore = create<CraftingState>((set, get) => ({
  craftXp: 0,
  activeJob: null,
  queue: [],

  hydrate() {
    const snap = load()
    if (!snap) return
    set({
      craftXp:   snap.craftXp   ?? 0,
      activeJob: snap.activeJob ?? null,
      queue:     snap.queue     ?? [],
    })
  },

  startCraft(recipeId, qty, itemsOwned, onConsume) {
    const recipe = CRAFT_RECIPE_MAP[recipeId]
    if (!recipe) return 'invalid'
    if (!canAffordRecipe(recipe, qty, itemsOwned)) return 'not_enough'

    // Check gold cost (gold sink for high-tier recipes)
    const totalGoldCost = (recipe.goldCost ?? 0) * qty
    if (totalGoldCost > 0) {
      const goldState = useGoldStore.getState()
      if (goldState.gold < totalGoldCost) return 'no_gold'
    }

    // Consume all ingredients upfront (OSRS-style), then deduct gold
    for (const ing of recipe.ingredients) {
      onConsume(ing.id, ing.qty * qty)
    }
    if (totalGoldCost > 0) {
      useGoldStore.getState().addGold(-totalGoldCost)
    }

    const now = Date.now()
    // Bake in crafter level speed perk at job creation time
    const crafterLevel = skillLevelFromXP(get().craftXp)
    const crafterSpeedMult = getCrafterSpeedMultiplier(crafterLevel)
    const grindlySpeedMult = computeGrindlyBonuses(getGrindlyLevel()).craftSpeedMultiplier
    const speedMult = crafterSpeedMult * grindlySpeedMult
    const effectiveSecPerItem = Math.max(1, Math.round(recipe.secPerItem * speedMult))

    const job: CraftJob = {
      id:          uid(),
      recipeId,
      outputItemId: recipe.outputItemId,
      outputQty:   recipe.outputQty,
      totalQty:    qty,
      doneQty:     0,
      secPerItem:  effectiveSecPerItem,
      xpPerItem:   recipe.xpPerItem,
      startedAt:   now,
      ingredients: recipe.ingredients,
    }

    const { activeJob, queue } = get()
    const newActive = activeJob ? activeJob : job
    const newQueue  = activeJob ? [...queue, job] : queue

    const snap = { craftXp: get().craftXp, activeJob: newActive, queue: newQueue }
    save(snap)
    set({ activeJob: newActive, queue: newQueue })
    return 'ok'
  },

  tick(now, onGrant) {
    const { activeJob } = get()
    if (!activeJob) return

    const elapsed = (now - activeJob.startedAt) / 1000
    const newlyCompleted = Math.floor(elapsed / activeJob.secPerItem)
    if (newlyCompleted <= 0) return

    const remaining = activeJob.totalQty - activeJob.doneQty
    const completable = Math.min(newlyCompleted, remaining)
    const xpGained = completable * activeJob.xpPerItem

    // Crafter level double-output perk
    const crafterLevel = skillLevelFromXP(get().craftXp)
    const doubleChance = getCrafterDoubleChance(crafterLevel)
    let outputQty = completable * activeJob.outputQty
    if (doubleChance > 0) {
      for (let i = 0; i < completable; i++) {
        if (Math.random() < doubleChance) outputQty += activeJob.outputQty
      }
    }

    onGrant(activeJob.outputItemId, outputQty, xpGained)

    const newDone = activeJob.doneQty + completable
    const newCraftXp = get().craftXp + xpGained
    const newQueue = [...get().queue]

    let newActiveJob: CraftJob | null
    if (newDone >= activeJob.totalQty) {
      recordCraftComplete()
      useAchievementStatsStore.getState().incrementCrafts()
      const next = newQueue.shift() ?? null
      newActiveJob = next ? { ...next, startedAt: now, doneQty: 0 } : null
    } else {
      // Advance anchor so next tick computes delta from now
      newActiveJob = { ...activeJob, doneQty: newDone, startedAt: now }
    }

    const snap = { craftXp: newCraftXp, activeJob: newActiveJob, queue: newQueue }
    save(snap)
    set({ craftXp: newCraftXp, activeJob: newActiveJob, queue: newQueue })
  },

  cancelJob(jobId, onRefund) {
    const { activeJob, queue } = get()
    let refundJob: CraftJob | null = null
    let newActiveJob = activeJob
    let newQueue = [...queue]

    if (activeJob?.id === jobId) {
      // Fast-forward to get accurate doneQty before cancelling
      const now = Date.now()
      const elapsed = (now - activeJob.startedAt) / 1000
      const done = Math.min(activeJob.totalQty, activeJob.doneQty + Math.floor(elapsed / activeJob.secPerItem))
      refundJob = { ...activeJob, doneQty: done }
      const next = newQueue.shift() ?? null
      newActiveJob = next ? { ...next, startedAt: now, doneQty: 0 } : null
    } else {
      const idx = newQueue.findIndex((j) => j.id === jobId)
      if (idx === -1) return
      refundJob = newQueue[idx]
      newQueue.splice(idx, 1)
    }

    if (refundJob) {
      const uncompleted = refundJob.totalQty - refundJob.doneQty
      for (const ing of refundJob.ingredients) {
        onRefund(ing.id, ing.qty * uncompleted)
      }
    }

    const snap = { craftXp: get().craftXp, activeJob: newActiveJob, queue: newQueue }
    save(snap)
    set({ activeJob: newActiveJob, queue: newQueue })
  },

  computeActiveDone(now) {
    const { activeJob } = get()
    if (!activeJob) return 0
    const elapsed = (now - activeJob.startedAt) / 1000
    return Math.min(activeJob.totalQty, activeJob.doneQty + Math.floor(elapsed / activeJob.secPerItem))
  },
}))
