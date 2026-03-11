import { create } from 'zustand'
import {
  COOKING_RECIPE_MAP,
  FOOD_ITEM_MAP,
  canAffordCookRecipe,
  getChefSpeedMultiplier,
  getChefDoubleChance,
  stepToInstrument,
  instrumentSpeedMult,
  effectiveBurnChance,
  effectiveQualityBonus,
  COOK_INSTRUMENT_MAP,
  DEFAULT_UNLOCKED_INSTRUMENTS,
  matchRecipeByIds,
  getMasteryStars,
  getMasteryBonus,
  MYSTERY_STEW,
  MYSTERY_STEW_XP,
  type CookStep,
  type CookInstrumentId,
} from '../lib/cooking'
import { skillLevelFromXP, getGrindlyLevel, computeGrindlyBonuses } from '../lib/skills'
import { useAchievementStatsStore } from './achievementStatsStore'

const STORAGE_KEY = 'grindly_cooking_v1'
const INSTRUMENTS_KEY = 'grindly_cooking_instruments'
const DISCOVERY_KEY = 'grindly_cooking_discovery'

const DEFAULT_TIERS: Record<CookInstrumentId, number> = {
  knife: 0, pot: 0, pan: 0, oven: 0, mortar: 0, bowl: 0,
}

export interface CookJob {
  id: string
  recipeId: string
  outputItemId: string
  outputQty: number
  totalQty: number
  doneQty: number
  secPerItem: number
  xpPerItem: number
  startedAt: number
  ingredients: Array<{ id: string; qty: number }>
  /** Current cooking step index (0-based). */
  stepIndex: number
  /** Snapshot of all steps with effective (speed-adjusted) durations. */
  steps: CookStep[]
  /** @deprecated No longer used — steps auto-advance. */
  stepReady: boolean
}

/** Burn/quality roll result for a single cook batch. */
export interface CookRollResult {
  granted: number
  burned: number
  bonus: number
}

/** Discovery result from free-combine attempt. */
export interface DiscoveryResult {
  type: 'discovered' | 'known' | 'mystery_stew'
  recipeId?: string
  foodName: string
  foodIcon: string
  xpGained: number
}

interface CookingState {
  cookXp: number
  activeJob: CookJob | null
  queue: CookJob[]
  /** Instrument upgrade tier levels (0 = base). */
  instrumentTiers: Record<CookInstrumentId, number>
  /** Which instruments the player has unlocked. */
  unlockedInstruments: CookInstrumentId[]
  /** Last cook roll result (for UI feedback). */
  lastRoll: CookRollResult | null
  /** Discovered recipes: recipeId → total times cooked (for mastery). */
  discoveredRecipes: Record<string, number>

  hydrate: () => void
  startCook: (
    recipeId: string,
    qty: number,
    itemsOwned: Record<string, number>,
    onConsume: (id: string, qty: number) => void,
  ) => 'ok' | 'not_enough' | 'invalid' | 'locked'
  advanceStep: () => void
  tick: (
    now: number,
    onGrant: (itemId: string, qty: number, xpGained: number) => void,
    onBurn?: (itemId: string, burnedQty: number) => void,
  ) => void
  cancelJob: (
    jobId: string,
    onRefund: (id: string, qty: number) => void,
  ) => void
  computeActiveDone: (now: number) => number
  /** Unlock a locked instrument. Returns false if can't afford or already unlocked. */
  unlockInstrument: (id: CookInstrumentId, chefLevel: number, gold: number, spendGold: (amount: number) => void) => boolean
  /** Upgrade an instrument to next tier. Returns false if can't afford or max tier. */
  upgradeInstrument: (id: CookInstrumentId, gold: number, spendGold: (amount: number) => void) => boolean
  /**
   * Free-combine: player picks ingredient types (no quantities).
   * System matches by IDs, auto-consumes recipe amounts if matched.
   * If no match → consumes 1 of each selected ingredient, grants Mystery Stew + XP.
   */
  tryFreeformCook: (
    ingredientIds: string[],
    itemsOwned: Record<string, number>,
    onConsume: (id: string, qty: number) => void,
  ) => DiscoveryResult | 'not_enough'
  /** Check if a recipe is discovered. */
  isDiscovered: (recipeId: string) => boolean
  /** Get mastery star count for a recipe. */
  getStars: (recipeId: string) => number
  /** Increment mastery count for a recipe (called after successful cook completion). */
  incrementMastery: (recipeId: string) => void
}

interface Snapshot {
  cookXp: number
  activeJob: CookJob | null
  queue: CookJob[]
}

interface InstrumentSnapshot {
  tiers: Record<CookInstrumentId, number>
  unlocked: CookInstrumentId[]
}

function save(s: Pick<CookingState, 'cookXp' | 'activeJob' | 'queue'>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch { /* ignore */ }
}

function load(): Snapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Snapshot) : null
  } catch { return null }
}

function saveInstruments(tiers: Record<CookInstrumentId, number>, unlocked: CookInstrumentId[]) {
  try { localStorage.setItem(INSTRUMENTS_KEY, JSON.stringify({ tiers, unlocked })) } catch { /* ignore */ }
}

function saveDiscovery(discovered: Record<string, number>) {
  try { localStorage.setItem(DISCOVERY_KEY, JSON.stringify(discovered)) } catch { /* ignore */ }
}

function loadDiscovery(): Record<string, number> {
  try {
    const raw = localStorage.getItem(DISCOVERY_KEY)
    return raw ? (JSON.parse(raw) as Record<string, number>) : {}
  } catch { return {} }
}

function loadInstruments(): InstrumentSnapshot {
  try {
    const raw = localStorage.getItem(INSTRUMENTS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<InstrumentSnapshot>
      return {
        tiers: { ...DEFAULT_TIERS, ...(parsed.tiers ?? {}) },
        unlocked: parsed.unlocked ?? [...DEFAULT_UNLOCKED_INSTRUMENTS],
      }
    }
  } catch { /* ignore */ }
  return { tiers: { ...DEFAULT_TIERS }, unlocked: [...DEFAULT_UNLOCKED_INSTRUMENTS] }
}

function uid() {
  return `cook_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

export const useCookingStore = create<CookingState>((set, get) => ({
  cookXp: 0,
  activeJob: null,
  queue: [],
  instrumentTiers: { ...DEFAULT_TIERS },
  unlockedInstruments: [...DEFAULT_UNLOCKED_INSTRUMENTS],
  lastRoll: null,
  discoveredRecipes: {},

  hydrate() {
    const snap = load()
    const inst = loadInstruments()
    const disc = loadDiscovery()
    const migrate = (j: CookJob | null): CookJob | null => {
      if (!j) return null
      // Old jobs without steps array — create 2 generic steps
      if (!j.steps || j.stepIndex == null) {
        const half = Math.max(1, Math.floor(j.secPerItem / 2))
        return {
          ...j,
          stepIndex: 1,
          stepReady: false,
          steps: [
            { label: 'Prep', icon: '🔪', secPerItem: half },
            { label: 'Cook', icon: '🔥', secPerItem: j.secPerItem - half },
          ],
        }
      }
      return j
    }

    if (snap) {
      set({
        cookXp:    snap.cookXp ?? 0,
        activeJob: migrate(snap.activeJob),
        queue:     (snap.queue ?? []).map((j) => migrate(j)!).filter(Boolean),
        instrumentTiers: inst.tiers,
        unlockedInstruments: inst.unlocked,
        discoveredRecipes: disc,
      })
    } else {
      set({ instrumentTiers: inst.tiers, unlockedInstruments: inst.unlocked, discoveredRecipes: disc })
    }
  },

  startCook(recipeId, qty, itemsOwned, onConsume) {
    const recipe = COOKING_RECIPE_MAP[recipeId]
    if (!recipe) return 'invalid'
    if (!canAffordCookRecipe(recipe, qty, itemsOwned)) return 'not_enough'

    // Check instruments are unlocked
    const { unlockedInstruments, instrumentTiers } = get()
    for (const step of recipe.steps) {
      const instId = stepToInstrument(step)
      if (!unlockedInstruments.includes(instId)) return 'locked'
    }

    for (const ing of recipe.ingredients) {
      onConsume(ing.id, ing.qty * qty)
    }

    const now = Date.now()
    const chefLevel = skillLevelFromXP(get().cookXp)
    const chefSpeedMult = getChefSpeedMultiplier(chefLevel)
    const grindlySpeedMult = computeGrindlyBonuses(getGrindlyLevel()).craftSpeedMultiplier

    const effectiveSteps: CookStep[] = recipe.steps.map((step) => {
      const instId = stepToInstrument(step)
      const instMult = instrumentSpeedMult(instrumentTiers, instId)
      const totalMult = chefSpeedMult * grindlySpeedMult * instMult
      return { ...step, secPerItem: Math.max(1, Math.round(step.secPerItem * totalMult)) }
    })

    const job: CookJob = {
      id:          uid(),
      recipeId,
      outputItemId: recipe.outputItemId,
      outputQty:   recipe.outputQty,
      totalQty:    qty,
      doneQty:     0,
      secPerItem:  effectiveSteps[0].secPerItem,
      xpPerItem:   recipe.xpPerItem,
      startedAt:   now,
      ingredients: recipe.ingredients,
      stepIndex:   0,
      steps:       effectiveSteps,
      stepReady:   false,
    }

    const { activeJob, queue } = get()
    const newActive = activeJob ? activeJob : job
    const newQueue  = activeJob ? [...queue, job] : queue

    const snap = { cookXp: get().cookXp, activeJob: newActive, queue: newQueue }
    save(snap)
    set({ activeJob: newActive, queue: newQueue, lastRoll: null })
    return 'ok'
  },

  advanceStep() {
    const { activeJob } = get()
    if (!activeJob || !activeJob.stepReady) return

    const nextIdx = activeJob.stepIndex + 1
    if (nextIdx >= activeJob.steps.length) return

    const now = Date.now()
    const updated: CookJob = {
      ...activeJob,
      stepIndex: nextIdx,
      secPerItem: activeJob.steps[nextIdx].secPerItem,
      startedAt: now,
      stepReady: false,
    }

    const snap = { cookXp: get().cookXp, activeJob: updated, queue: get().queue }
    save(snap)
    set({ activeJob: updated })
  },

  tick(now, onGrant, onBurn) {
    const { activeJob } = get()
    if (!activeJob) return

    const elapsed = (now - activeJob.startedAt) / 1000
    const newlyCompleted = Math.floor(elapsed / activeJob.secPerItem)
    if (newlyCompleted <= 0) return

    const isLastStep = activeJob.stepIndex === activeJob.steps.length - 1

    // Non-final step: auto-advance to next step immediately
    if (!isLastStep) {
      const nextIdx = activeJob.stepIndex + 1
      const nextStep = activeJob.steps[nextIdx]
      const updated: CookJob = {
        ...activeJob,
        stepIndex: nextIdx,
        secPerItem: nextStep.secPerItem,
        startedAt: now,
        stepReady: false,
      }
      const snap = { cookXp: get().cookXp, activeJob: updated, queue: get().queue }
      save(snap)
      set({ activeJob: updated })
      return
    }

    // Final step complete — roll burn & quality per item
    const remaining = activeJob.totalQty - activeJob.doneQty
    const completable = Math.min(newlyCompleted, remaining, 1)

    const recipe = COOKING_RECIPE_MAP[activeJob.recipeId]
    const foodDef = FOOD_ITEM_MAP[activeJob.outputItemId]
    const { instrumentTiers } = get()
    const rarity = foodDef?.rarity ?? 'common'
    const burnChance = recipe ? effectiveBurnChance(recipe, rarity, instrumentTiers) : 0
    const qualityChance = recipe ? effectiveQualityBonus(recipe, instrumentTiers) : 0

    let burned = 0
    let bonusOutput = 0
    let survivedItems = 0

    for (let i = 0; i < completable; i++) {
      if (burnChance > 0 && Math.random() < burnChance) {
        burned++
      } else {
        survivedItems++
        if (qualityChance > 0 && Math.random() < qualityChance) {
          bonusOutput += activeJob.outputQty
        }
      }
    }

    const baseOutput = survivedItems * activeJob.outputQty + bonusOutput

    // Chef double chance (stacks with quality)
    const chefLevel = skillLevelFromXP(get().cookXp)
    const doubleChance = getChefDoubleChance(chefLevel)

    // Mastery double output bonus (stacks with chef perk)
    const masteryCount = get().discoveredRecipes[activeJob.recipeId] ?? 0
    const masteryStars = getMasteryStars(masteryCount)
    const mastery = getMasteryBonus(masteryStars)
    const totalDoubleChance = doubleChance + mastery.doubleOutputChance

    let finalOutput = baseOutput
    if (totalDoubleChance > 0) {
      for (let i = 0; i < survivedItems; i++) {
        if (Math.random() < totalDoubleChance) finalOutput += activeJob.outputQty
      }
    }

    // Mastery ingredient save: chance to refund one random ingredient per survived item
    if (mastery.ingredientSaveChance > 0 && survivedItems > 0 && activeJob.ingredients.length > 0) {
      for (let i = 0; i < survivedItems; i++) {
        if (Math.random() < mastery.ingredientSaveChance) {
          const refundIng = activeJob.ingredients[Math.floor(Math.random() * activeJob.ingredients.length)]
          onGrant(refundIng.id, refundIng.qty, 0)
        }
      }
    }

    // XP is granted for all attempts (even burned — you learn from mistakes)
    const xpGained = Math.ceil(completable * activeJob.xpPerItem * mastery.xpMultiplier)
    if (finalOutput > 0) onGrant(activeJob.outputItemId, finalOutput, xpGained)
    else if (xpGained > 0) onGrant(activeJob.outputItemId, 0, xpGained)

    if (burned > 0 && onBurn) onBurn(activeJob.outputItemId, burned)

    const rollResult: CookRollResult = {
      granted: finalOutput,
      burned,
      bonus: bonusOutput > 0 ? Math.ceil(bonusOutput / activeJob.outputQty) : 0,
    }

    const newDone = activeJob.doneQty + completable
    const newCookXp = get().cookXp + xpGained
    const newQueue = [...get().queue]

    let newActiveJob: CookJob | null
    if (newDone >= activeJob.totalQty) {
      useAchievementStatsStore.getState().incrementCooks()
      // Increment mastery for this recipe
      get().incrementMastery(activeJob.recipeId)
      const next = newQueue.shift() ?? null
      newActiveJob = next ? { ...next, startedAt: now, doneQty: 0 } : null
    } else {
      // Start next item from step 0
      newActiveJob = {
        ...activeJob,
        doneQty: newDone,
        startedAt: now,
        stepIndex: 0,
        secPerItem: activeJob.steps[0].secPerItem,
        stepReady: false,
      }
    }

    const snap = { cookXp: newCookXp, activeJob: newActiveJob, queue: newQueue }
    save(snap)
    set({ cookXp: newCookXp, activeJob: newActiveJob, queue: newQueue, lastRoll: rollResult })
  },

  cancelJob(jobId, onRefund) {
    const { activeJob, queue } = get()
    let refundJob: CookJob | null = null
    let newActiveJob = activeJob
    let newQueue = [...queue]

    if (activeJob?.id === jobId) {
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

    const snap = { cookXp: get().cookXp, activeJob: newActiveJob, queue: newQueue }
    save(snap)
    set({ activeJob: newActiveJob, queue: newQueue })
  },

  computeActiveDone(now) {
    const { activeJob } = get()
    if (!activeJob) return 0
    const elapsed = (now - activeJob.startedAt) / 1000
    return Math.min(activeJob.totalQty, activeJob.doneQty + Math.floor(elapsed / activeJob.secPerItem))
  },

  unlockInstrument(id, chefLevel, gold, spendGold) {
    const { unlockedInstruments, instrumentTiers } = get()
    if (unlockedInstruments.includes(id)) return false
    const def = COOK_INSTRUMENT_MAP[id]
    if (!def) return false
    if (chefLevel < def.unlockLevel) return false
    if (gold < def.unlockCost) return false

    if (def.unlockCost > 0) spendGold(def.unlockCost)
    const updated = [...unlockedInstruments, id]
    saveInstruments(instrumentTiers, updated)
    set({ unlockedInstruments: updated })
    return true
  },

  upgradeInstrument(id, gold, spendGold) {
    const { instrumentTiers, unlockedInstruments } = get()
    if (!unlockedInstruments.includes(id)) return false
    const currentTier = instrumentTiers[id] ?? 0
    const def = COOK_INSTRUMENT_MAP[id]
    if (!def) return false
    const nextTier = currentTier + 1
    if (nextTier >= def.tiers.length) return false
    const cost = def.tiers[nextTier].cost
    if (gold < cost) return false

    spendGold(cost)
    const updated = { ...instrumentTiers, [id]: nextTier }
    saveInstruments(updated, unlockedInstruments)
    set({ instrumentTiers: updated })
    return true
  },

  // ── Discovery & Mastery ─────────────────────────────────────────────────

  tryFreeformCook(ingredientIds, itemsOwned, onConsume) {
    const ids = ingredientIds.filter(Boolean)
    if (ids.length === 0) return 'not_enough'

    const recipe = matchRecipeByIds(ids)

    if (!recipe) {
      // No recipe match → consume 1 of each selected ingredient, give Mystery Stew + XP
      for (const id of ids) {
        if ((itemsOwned[id] ?? 0) < 1) return 'not_enough'
      }
      for (const id of ids) onConsume(id, 1)

      const newXp = get().cookXp + MYSTERY_STEW_XP
      set({ cookXp: newXp })
      save({ cookXp: newXp, activeJob: get().activeJob, queue: get().queue })
      return {
        type: 'mystery_stew' as const,
        foodName: MYSTERY_STEW.name,
        foodIcon: MYSTERY_STEW.icon,
        xpGained: MYSTERY_STEW_XP,
      }
    }

    // Recipe matched — check player can afford recipe amounts
    for (const ing of recipe.ingredients) {
      if ((itemsOwned[ing.id] ?? 0) < ing.qty) return 'not_enough'
    }

    // Mark discovered (if first time)
    const { discoveredRecipes } = get()
    const wasKnown = (discoveredRecipes[recipe.id] ?? 0) > 0
    const type = wasKnown ? 'known' as const : 'discovered' as const

    if (!wasKnown) {
      const updated = { ...discoveredRecipes, [recipe.id]: 0 }
      saveDiscovery(updated)
      set({ discoveredRecipes: updated })
    }

    // Start the actual cook job (consumes recipe ingredient amounts, starts timer/steps)
    const result = get().startCook(recipe.id, 1, itemsOwned, onConsume)
    if (result !== 'ok') return 'not_enough'

    const food = FOOD_ITEM_MAP[recipe.outputItemId]
    return {
      type,
      recipeId: recipe.id,
      foodName: food?.name ?? recipe.outputItemId,
      foodIcon: food?.icon ?? '🍳',
      xpGained: recipe.xpPerItem,
    }
  },

  isDiscovered(recipeId) {
    return (get().discoveredRecipes[recipeId] ?? 0) >= 0 && recipeId in get().discoveredRecipes
  },

  getStars(recipeId) {
    const count = get().discoveredRecipes[recipeId] ?? 0
    return getMasteryStars(count)
  },

  incrementMastery(recipeId) {
    const { discoveredRecipes } = get()
    const current = discoveredRecipes[recipeId] ?? 0
    const updated = { ...discoveredRecipes, [recipeId]: current + 1 }
    saveDiscovery(updated)
    set({ discoveredRecipes: updated })

  },
}))
