import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useEscapeHandler } from '../../hooks/useEscapeHandler'
import { AnimatePresence, motion } from 'framer-motion'
import {
  COOKING_RECIPES,
  COOKING_RECIPE_MAP,
  FOOD_ITEM_MAP,
  canAffordCookRecipe,
  maxAffordableCookQty,
  cookTotalDuration,
  cookStepDuration,
  formatCookTime,
  recipeInstruments,
  hasInstrumentsForRecipe,
  effectiveBurnChance,
  effectiveQualityBonus,
  COOK_INSTRUMENTS,
  stepToInstrument,
  getRecipeHint,
  getMasteryStars,
  getMasteryBonus,
  cooksToNextStar,
  MASTERY_MAX_STARS,
  type CookingRecipe,
  type CookInstrumentId,
} from '../../lib/cooking'
import { getRarityTheme, LOOT_ITEMS, type LootItemDef } from '../../lib/loot'
import { LootVisual } from '../loot/LootUI'
import { skillLevelFromXP, skillXPProgress, getGrindlyLevel, computeGrindlyBonuses } from '../../lib/skills'
import { useCookingStore, type DiscoveryResult } from '../../stores/cookingStore'
import { useInventoryStore } from '../../stores/inventoryStore'
import { useGoldStore } from '../../stores/goldStore'
import { fmt } from '../../lib/format'
import {
  playClickSound,
  playLootRaritySound,
  playCookSoundForInstrument,
  playCookErrorSound,
  playCookDiscoverySound,
} from '../../lib/sounds'
import { BackpackButton } from '../shared/BackpackButton'
import { PageHeader } from '../shared/PageHeader'
import { InventoryPage } from '../inventory/InventoryPage'
import { useNavigationStore } from '../../stores/navigationStore'
import { syncInventoryToSupabase } from '../../services/supabaseSync'
import { useAuthStore } from '../../stores/authStore'
import { useFarmStore } from '../../stores/farmStore'
import { supabase } from '../../lib/supabase'

// ── Kitchen Palette ──────────────────────────────────────────────────────────
const K = {
  copper:  '#c27840',
  cream:   '#e8e0d8',
  clay:    '#a0674a',
  wood:    '#5c3a28',
  hearth:  '#16161e',
  surface: '#1c1c28',
  pageBg:  '#111118',
  ready:   '#6ecf8e',
  warn:    '#e8665a',
  indigo:  '#9b8fef',
  xp:     '#e2b052',
  muted:   '#6b7280',
  faint:   '#2a2a3a',
}

const TIER_C = ['#8a7568', '#c27840', '#a0a0a0', '#70a0e0', '#b888e0']

function getItemDef(id: string) {
  return LOOT_ITEMS.find((x) => x.id === id) ?? null
}

// CSS animations for cooking are defined in globals.css (kv-* classes)

function spawnRipple(e: React.MouseEvent<HTMLElement>) {
  const el = e.currentTarget
  const rect = el.getBoundingClientRect()
  const ripple = document.createElement('div')
  ripple.className = 'kv-ripple'
  const size = Math.max(rect.width, rect.height) * 2
  ripple.style.width = ripple.style.height = `${size}px`
  ripple.style.left = `${e.clientX - rect.left - size / 2}px`
  ripple.style.top = `${e.clientY - rect.top - size / 2}px`
  el.appendChild(ripple)
  setTimeout(() => ripple.remove(), 500)
}


/** Spawn confetti particles inside a container element. */
function spawnConfetti(container: HTMLElement, count: number, colors: string[] = ['#e2b052', '#c27840', '#9b8fef', '#6ecf8e', '#e8665a']) {
  for (let i = 0; i < count; i++) {
    const dot = document.createElement('div')
    dot.className = 'kv-confetti'
    const size = 4 + Math.random() * 4
    dot.style.cssText = `
      position:absolute; width:${size}px; height:${size}px; border-radius:50%;
      background:${colors[i % colors.length]};
      left:${20 + Math.random() * 60}%; top:${10 + Math.random() * 30}%;
      --dur:${0.6 + Math.random() * 0.6}s; --rot:${90 + Math.random() * 270}deg;
    `
    container.appendChild(dot)
    setTimeout(() => dot.remove(), 1400)
  }
}


// ══════════════════════════════════════════════════════════════════════════════
// ── COOKING STATION — big centered current action + step progress below ─────
// ══════════════════════════════════════════════════════════════════════════════

function CookingStation({ onCancel }: { onCancel: (id: string) => void }) {
  const activeJob = useCookingStore((s) => s.activeJob)
  const queue = useCookingStore((s) => s.queue)
  const lastRoll = useCookingStore((s) => s.lastRoll)

  const [timer, setTimer] = useState('--')
  const ringRef = useRef<SVGCircleElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const prevDoneRef = useRef(0)
  const [itemPop, setItemPop] = useState(0)
  const [ringFlash, setRingFlash] = useState<'burn' | 'bonus' | null>(null)
  const prevRollRef = useRef<{ burned: number; bonus: number } | null>(null)

  useEffect(() => {
    if (!activeJob) { prevDoneRef.current = 0; return }
    if (activeJob.doneQty > prevDoneRef.current && prevDoneRef.current > 0) setItemPop((n) => n + 1)
    prevDoneRef.current = activeJob.doneQty
  }, [activeJob?.doneQty, activeJob?.id])

  // Ring flash on burn/bonus roll changes
  useEffect(() => {
    if (!lastRoll) { prevRollRef.current = null; return }
    const prev = prevRollRef.current
    prevRollRef.current = { burned: lastRoll.burned, bonus: lastRoll.bonus }
    if (!prev) return
    if (lastRoll.burned > prev.burned) {
      setRingFlash('burn')
      setTimeout(() => setRingFlash(null), 500)
    } else if (lastRoll.bonus > prev.bonus) {
      setRingFlash('bonus')
      setTimeout(() => setRingFlash(null), 500)
    }
  }, [lastRoll?.burned, lastRoll?.bonus])

  // rAF-driven progress
  useEffect(() => {
    if (!activeJob) return
    let raf = 0
    const circumference = 2 * Math.PI * 52
    const tick = () => {
      const job = useCookingStore.getState().activeJob
      if (!job) { raf = requestAnimationFrame(tick); return }
      const step = job.steps[job.stepIndex]
      const elapsed = (Date.now() - job.startedAt) / 1000
      const pct = Math.min(1, Math.max(0, elapsed / step.secPerItem))
      const rem = Math.max(0, step.secPerItem - elapsed)
      setTimer(formatCookTime(rem))
      if (ringRef.current) ringRef.current.style.strokeDashoffset = String(circumference * (1 - pct))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [activeJob?.id, activeJob?.stepIndex, activeJob?.doneQty])

  if (!activeJob) return null

  const output = FOOD_ITEM_MAP[activeJob.outputItemId]
  const done = activeJob.doneQty
  const currentStep = activeJob.steps[activeJob.stepIndex]
  const circumference = 2 * Math.PI * 52

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
      className="rounded relative overflow-visible"
      style={{
        background: K.surface,
        border: `1px solid ${K.faint}`,
        boxShadow: `0 8px 32px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.02)`,
      }}
    >
      <div className="px-4 pt-4 pb-3">
        {/* ── Big centered current action ── */}
        <div className="flex flex-col items-center mb-3 relative">
          {/* Ember particles */}
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 pointer-events-none" style={{ width: 60, height: 40 }}>
            {[0,1,2,3,4].map(i => (
              <div key={i} className="kv-ember-rise absolute rounded-full"
                style={{
                  width: 3, height: 3,
                  background: K.copper,
                  left: `${6 + i * 12}px`,
                  bottom: 0,
                  '--dur': `${1.4 + i * 0.3}s`,
                  animationDelay: `${i * 0.25}s`,
                } as React.CSSProperties} />
            ))}
          </div>

          {/* Ring + icon */}
          <div className="relative" style={{ width: 120, height: 120 }}>
            <svg ref={svgRef} viewBox="0 0 120 120"
              className={`absolute inset-0 ${ringFlash === 'burn' ? 'kv-ring-burn' : ringFlash === 'bonus' ? 'kv-ring-bonus' : ''}`}
              style={{ transform: 'rotate(-90deg)' }}>
              <defs>
                <linearGradient id="kv-pipe-grad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor={K.copper} />
                  <stop offset="100%" stopColor={K.xp} />
                </linearGradient>
              </defs>
              <circle cx="60" cy="60" r="52" fill="none" strokeWidth="5" className="kv-ring-bg" />
              <circle ref={ringRef} cx="60" cy="60" r="52" fill="none" strokeWidth="5" className="kv-ring-fg"
                strokeDasharray={circumference} strokeDashoffset={circumference} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <motion.span
                key={`${activeJob.id}-${activeJob.stepIndex}`}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-4xl kv-action-bounce">{currentStep.icon}</motion.span>
            </div>
          </div>

          {/* Current action label */}
          <p className="text-sm font-bold mt-2" style={{ color: K.cream }}>{currentStep.label}</p>
          <p className="text-[20px] font-mono font-bold" style={{ color: K.copper }}>{timer}</p>
        </div>

        {/* ── Info row: dish + count + xp ── */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <motion.span key={itemPop} className="text-lg"
              initial={itemPop > 0 ? { scale: 1.4 } : false}
              animate={{ scale: 1 }}>{output?.icon ?? '🍳'}</motion.span>
            <div>
              <p className="text-xs font-bold" style={{ color: K.cream }}>{output?.name ?? 'Cooking'}</p>
              <p className="text-micro" style={{ color: K.muted }}>
                Item {done + 1} of {activeJob.totalQty}
                <span className="ml-2" style={{ color: K.xp }}>+{fmt(done * activeJob.xpPerItem)} XP</span>
              </p>
            </div>
          </div>
          <button type="button" onClick={() => { playClickSound(); onCancel(activeJob.id) }}
            className="text-micro px-3 py-1.5 rounded" style={{ color: K.muted, border: `1px solid ${K.faint}` }}>Cancel</button>
        </div>

        {/* ── Step progress dots ── */}
        <div className="flex items-center gap-1 justify-center">
          {activeJob.steps.map((step, i) => {
            const done2 = i < activeJob.stepIndex
            const active = i === activeJob.stepIndex
            return (
              <div key={i} className="flex items-center gap-1">
                {i > 0 && <div className="w-4 h-0.5 rounded-full" style={{
                  background: done2 ? `${K.ready}50` : active ? `${K.copper}40` : `${K.faint}80`,
                }} />}
                <div className="flex flex-col items-center" style={{ width: 36 }}>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs"
                    style={{
                      background: done2 ? `${K.ready}15` : active ? `${K.copper}20` : 'rgba(255,255,255,.02)',
                      border: `1.5px solid ${done2 ? `${K.ready}40` : active ? `${K.copper}50` : `${K.faint}`}`,
                    }}>
                    {done2 ? <span style={{ color: K.ready, fontSize: 10 }}>✓</span> : <span style={{ opacity: active ? 1 : 0.3 }}>{step.icon}</span>}
                  </div>
                  <span className="text-[7px] mt-0.5 truncate w-full text-center" style={{
                    color: done2 ? K.ready : active ? K.copper : K.muted,
                    opacity: active || done2 ? 1 : 0.4,
                  }}>{step.label.split(' ')[0]}</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Last roll info */}
        {lastRoll && (lastRoll.burned > 0 || lastRoll.bonus > 0) && (
          <p className="text-micro text-center mt-2" style={{ color: K.muted }}>
            {lastRoll.burned > 0 && <span style={{ color: K.warn }}>Last item burned! </span>}
            {lastRoll.bonus > 0 && <span style={{ color: K.indigo }}>Bonus output! </span>}
          </p>
        )}

        {queue.length > 0 && (
          <div className="mt-1.5 space-y-0.5 border-t pt-1.5" style={{ borderColor: K.faint }}>
            {queue.map((job, i) => {
              const qOut = FOOD_ITEM_MAP[job.outputItemId]
              return (
                <div key={job.id} className="flex items-center gap-1.5 px-1 py-0.5 text-micro font-mono" style={{ color: K.muted }}>
                  <span style={{ color: `${K.muted}80` }}>{i + 1}.</span>
                  {qOut?.icon && <span>{qOut.icon}</span>}
                  <span className="truncate">{qOut?.name ?? job.outputItemId}</span>
                  <span className="ml-auto shrink-0" style={{ color: `${K.muted}80` }}>×{job.totalQty}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </motion.div>
  )
}


// ══════════════════════════════════════════════════════════════════════════════
// ── DISH CARD — clear readable ingredients and stats ────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function DishCard({
  recipe, chefLevel, items, unlockedInstruments, instrumentTiers, isCooking, isDiscovered, onSelect,
}: {
  recipe: CookingRecipe; chefLevel: number; items: Record<string, number>
  unlockedInstruments: CookInstrumentId[]; instrumentTiers: Record<CookInstrumentId, number>
  isCooking: boolean; isDiscovered: boolean; onSelect: () => void
}) {
  const output = FOOD_ITEM_MAP[recipe.outputItemId]
  if (!output) return null

  const theme = getRarityTheme(output.rarity)

  // ── Undiscovered: show mystery card ──────────────────────────────────────
  if (!isDiscovered) {
    return (
      <div className="relative rounded text-left overflow-hidden"
        style={{
          width: '100%',
          background: `${K.surface}80`,
          border: `1px solid ${K.faint}40`,
        }}
      >
        <div className="p-3">
          <div className="flex items-start gap-3">
            {/* Mystery icon */}
            <div className="w-11 h-11 rounded flex items-center justify-center text-xl shrink-0"
              style={{ background: 'rgba(255,255,255,.02)', border: `1px solid ${K.faint}40` }}>
              <span style={{ filter: 'grayscale(1)', opacity: 0.3 }}>?</span>
            </div>

            <div className="flex-1 min-w-0">
              {/* Hidden name */}
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold tracking-widest" style={{ color: `${K.muted}60` }}>??? ???</span>
                <span className="text-micro font-semibold uppercase" style={{ color: `${theme.color}50` }}>{output.rarity}</span>
              </div>

              {/* Hidden ingredients */}
              <div className="flex items-center gap-1.5 mb-1">
                {recipe.ingredients.map((_, i) => (
                  <span key={i} className="text-micro font-mono px-1.5 py-0.5 rounded"
                    style={{ background: 'rgba(255,255,255,.03)', color: `${K.muted}50` }}>???</span>
                ))}
              </div>

              {/* Discovery hint */}
              <div className="text-micro italic" style={{ color: `${K.muted}50` }}>
                Discover via Cauldron
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Discovered: normal card ───────────────────────────────────────────────
  const missingInst = !hasInstrumentsForRecipe(recipe, unlockedInstruments)
  const lvlLocked = chefLevel < recipe.chefLevelRequired
  const locked = lvlLocked || missingInst
  const canCook1 = !locked && canAffordCookRecipe(recipe, 1, items)
  const owned = items[output.id] ?? 0

  const grindlyMult = computeGrindlyBonuses(getGrindlyLevel()).craftSpeedMultiplier
  const totalTime = cookTotalDuration(recipe, 1, chefLevel, grindlyMult, instrumentTiers)
  const burnPct = Math.round(effectiveBurnChance(recipe, output.rarity, instrumentTiers) * 100)
  const qualPct = Math.round(effectiveQualityBonus(recipe, instrumentTiers) * 100)

  return (
    <motion.button type="button" whileTap={locked ? {} : { scale: .97 }}
      onClick={locked ? undefined : onSelect}
      className="relative rounded text-left overflow-hidden"
      style={{
        width: '100%',
        background: locked ? `${K.surface}80` : K.surface,
        border: `1px solid ${locked ? `${K.faint}60` : K.faint}`,
        opacity: locked ? .35 : 1,
      }}
    >
      {!locked && (
        <div className="absolute top-0 left-0 right-0 h-12 pointer-events-none"
          style={{ background: `linear-gradient(180deg, ${theme.glow}06 0%, transparent 100%)` }} />
      )}

      {isCooking && (
        <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md text-micro font-bold uppercase tracking-wider"
          style={{ background: `${K.copper}20`, color: K.copper, border: `1px solid ${K.copper}30` }}>
          Cooking
        </div>
      )}

      <div className="p-3 relative">
        <div className="flex items-start gap-3">
          {/* Dish icon */}
          <div className="w-11 h-11 rounded flex items-center justify-center text-2xl shrink-0"
            style={{
              background: !locked ? `${theme.glow}0a` : 'rgba(255,255,255,.02)',
              border: `1px solid ${!locked ? `${theme.border}20` : 'rgba(255,255,255,.04)'}`,
            }}>
            {output.icon}
          </div>

          <div className="flex-1 min-w-0">
            {/* Name + rarity */}
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-bold truncate" style={{ color: K.cream }}>{output.name}</span>
              <span className="text-micro font-semibold uppercase" style={{ color: theme.color }}>{output.rarity}</span>
              {owned > 0 && (
                <span className="text-micro font-mono px-1 py-0.5 rounded shrink-0"
                  style={{ color: K.muted, background: 'rgba(255,255,255,.03)' }}>x{owned}</span>
              )}
            </div>

            {/* Effect tags */}
            {!locked && (
              <div className="flex flex-wrap gap-1 mb-1.5">
                {output.effect.heal && <span className="text-micro font-semibold px-1.5 py-0.5 rounded" style={{ color: K.ready, background: `${K.ready}0a` }}>+{output.effect.heal} HP</span>}
                {output.effect.buffAtk && <span className="text-micro font-semibold px-1.5 py-0.5 rounded" style={{ color: K.warn, background: `${K.warn}0a` }}>+{output.effect.buffAtk} ATK</span>}
                {output.effect.buffDef && <span className="text-micro font-semibold px-1.5 py-0.5 rounded" style={{ color: K.indigo, background: `${K.indigo}0a` }}>+{output.effect.buffDef} DEF</span>}
                {output.effect.buffRegen && <span className="text-micro font-semibold px-1.5 py-0.5 rounded" style={{ color: '#22d3ee', background: 'rgba(34,211,238,.04)' }}>+{output.effect.buffRegen} Regen</span>}
              </div>
            )}

            {/* Ingredients — clear: "3x Wheat, 2x Herbs" */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-1">
              {recipe.ingredients.map((ing) => {
                const def = getItemDef(ing.id)
                const have = items[ing.id] ?? 0
                const enough = have >= ing.qty
                return (
                  <span key={ing.id} className="text-micro flex items-center gap-0.5"
                    style={{ color: enough ? `${K.ready}cc` : `${K.warn}cc` }}>
                    {def?.icon} <span className="font-medium">{ing.qty}x {def?.name ?? ing.id}</span>
                    <span className="font-mono text-micro" style={{ color: K.muted }}>({have})</span>
                  </span>
                )
              })}
            </div>

            {/* Bottom row: time, steps, burn chance, quality */}
            <div className="flex items-center gap-3 text-micro" style={{ color: K.muted }}>
              {!locked && (
                <>
                  <span>{formatCookTime(totalTime)}</span>
                  <span>{recipe.steps.length} steps</span>
                  <span style={{ color: K.xp }}>{recipe.xpPerItem} XP</span>
                  {burnPct > 0 && <Tip text="Chance to lose item. Reduced by instruments."><span style={{ color: K.warn }}>Burn {burnPct}%</span></Tip>}
                  {qualPct > 0 && <Tip text="Chance for extra output. Increased by instruments."><span style={{ color: K.indigo }}>Bonus {qualPct}%</span></Tip>}
                </>
              )}
              {canCook1 && (
                <div className="w-1.5 h-1.5 rounded-full ml-auto shrink-0" style={{ background: `${K.ready}60` }} />
              )}
              {lvlLocked && (
                <span className="font-mono ml-auto" style={{ color: K.warn }}>Cooking Lvl {recipe.chefLevelRequired}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.button>
  )
}


// ══════════════════════════════════════════════════════════════════════════════
// ── COOK MODAL — bottom sheet ───────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

const QTY_PRESETS = [1, 5, 10, 50]

function CookModal({
  recipe, chefLevel, items, instrumentTiers, onClose, onStart,
}: {
  recipe: CookingRecipe; chefLevel: number; items: Record<string, number>
  instrumentTiers: Record<CookInstrumentId, number>
  onClose: () => void; onStart: (r: CookingRecipe, qty: number) => void
}) {
  const [qty, setQty] = useState(1)
  const [btnShake, setBtnShake] = useState(false)
  const [missingTip, setMissingTip] = useState(false)
  const output = FOOD_ITEM_MAP[recipe.outputItemId]
  if (!output) return null

  const theme = getRarityTheme(output.rarity)
  const canStart = canAffordCookRecipe(recipe, qty, items)
  const max = maxAffordableCookQty(recipe, items)
  const grindlyMult = computeGrindlyBonuses(getGrindlyLevel()).craftSpeedMultiplier
  const duration = cookTotalDuration(recipe, qty, chefLevel, grindlyMult, instrumentTiers)
  const burnPct = Math.round(effectiveBurnChance(recipe, output.rarity, instrumentTiers) * 100)
  const qualPct = Math.round(effectiveQualityBonus(recipe, instrumentTiers) * 100)

  const fx = output.effect

  return (
    <>
      <motion.div className="fixed inset-0 z-[100] bg-black/75"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} />
      <motion.div
        className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none"
      >
        <motion.div
          className="w-full max-w-sm rounded-card overflow-hidden pointer-events-auto"
          style={{ background: K.surface, border: `1px solid ${K.faint}`, boxShadow: '0 20px 60px rgba(0,0,0,.7)' }}
          initial={{ scale: 0.93, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.93, opacity: 0, y: 12 }}
          transition={{ type: 'spring', damping: 30, stiffness: 380 }}
          onClick={(e) => e.stopPropagation()}
        >
        {/* Scrollable content */}
        <div className="px-4 pt-4 pb-2 max-h-[60vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded flex items-center justify-center text-3xl shrink-0"
              style={{ background: `${theme.glow}0c`, border: `1.5px solid ${theme.border}25` }}>
              {output.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold" style={{ color: K.cream }}>{output.name}</p>
              <div className="flex gap-1 mt-1 flex-wrap">
                {fx.heal && <span className="text-micro font-bold px-1.5 py-0.5 rounded" style={{ color: K.ready, background: `${K.ready}0c` }}>+{fx.heal} HP</span>}
                {fx.buffAtk && <span className="text-micro font-bold px-1.5 py-0.5 rounded" style={{ color: K.warn, background: `${K.warn}0c` }}>+{fx.buffAtk} ATK</span>}
                {fx.buffDef && <span className="text-micro font-bold px-1.5 py-0.5 rounded" style={{ color: K.indigo, background: `${K.indigo}0c` }}>+{fx.buffDef} DEF</span>}
                {fx.buffRegen && <span className="text-micro font-bold px-1.5 py-0.5 rounded" style={{ color: '#22d3ee', background: 'rgba(34,211,238,.06)' }}>+{fx.buffRegen} Regen</span>}
                {fx.buffDurationSec && (fx.buffAtk || fx.buffDef || fx.buffRegen) && (
                  <span className="text-micro font-bold px-1.5 py-0.5 rounded" style={{ color: K.muted, background: 'rgba(255,255,255,.03)' }}>for {fx.buffDurationSec}s</span>
                )}
              </div>
            </div>
          </div>

          {/* Ingredients — compact row */}
          <div className="mb-3">
            <p className="text-micro uppercase tracking-wider mb-1" style={{ color: K.muted }}>Ingredients (x{qty})</p>
            <div className="flex gap-1.5 flex-wrap">
              {recipe.ingredients.map((ing) => {
                const def = getItemDef(ing.id)
                const own = items[ing.id] ?? 0
                const need = ing.qty * qty
                const ok = own >= need
                return (
                  <div key={ing.id} className="flex items-center gap-1.5 rounded px-2 py-1"
                    style={{ background: `${ok ? K.ready : K.warn}06`, border: `1px solid ${ok ? K.ready : K.warn}12` }}>
                    <ItemIcon item={def} size="sm" />
                    <span className="text-micro" style={{ color: K.cream }}>{def?.name ?? ing.id}</span>
                    <span className="text-micro font-mono" style={{ color: ok ? K.ready : K.warn }}>{own}/{need}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Steps — inline */}
          <div className="mb-3">
            <p className="text-micro uppercase tracking-wider mb-1" style={{ color: K.muted }}>
              {recipe.steps.length} steps
            </p>
            <div className="flex items-center gap-1 flex-wrap">
              {recipe.steps.map((st, i) => {
                const stepDur = cookStepDuration(st, chefLevel, grindlyMult, instrumentTiers)
                return (
                  <div key={i} className="flex items-center gap-1">
                    {i > 0 && <span className="text-micro" style={{ color: K.faint }}>›</span>}
                    <div className="flex items-center gap-1 rounded-md px-1.5 py-0.5"
                      style={{ background: `${K.copper}06`, border: `1px solid ${K.copper}0c` }}>
                      <span className="text-xs">{st.icon}</span>
                      <span className="text-micro" style={{ color: K.cream }}>{st.label}</span>
                      <span className="text-micro font-mono" style={{ color: K.copper }}>{formatCookTime(stepDur)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Qty */}
          <div>
            <p className="text-micro uppercase tracking-wider mb-1" style={{ color: K.muted }}>Quantity</p>
            <div className="flex gap-1.5 flex-wrap items-center">
              {QTY_PRESETS.map((p) => (
                <button key={p} type="button" onClick={() => setQty(p)}
                  className="text-caption font-mono px-2.5 py-1 rounded border transition-colors"
                  style={qty === p
                    ? { borderColor: `${K.copper}60`, background: `${K.copper}18`, color: K.copper }
                    : { borderColor: K.faint, color: K.muted }}>{p}</button>
              ))}
              <button type="button"
                onClick={() => { if (max > 0) setQty(max) }}
                className="text-caption font-mono px-2.5 py-1 rounded border transition-colors"
                style={max <= 0
                  ? { borderColor: `${K.faint}60`, color: `${K.muted}40`, cursor: 'not-allowed' }
                  : qty === max
                    ? { borderColor: `${K.copper}60`, background: `${K.copper}18`, color: K.copper }
                    : { borderColor: K.faint, color: K.muted }}>
                Max{max > 0 ? ` (${max})` : ''}
              </button>
              <input type="number" min={1} value={qty}
                onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-14 text-caption font-mono px-2 py-1 rounded text-center focus:outline-none transition-colors"
                style={{ background: 'rgba(255,255,255,.02)', border: `1px solid ${K.faint}`, color: K.cream }} />
            </div>
          </div>
        </div>

        {/* Pinned footer — always visible */}
        <div className="px-4 py-3 pb-4 flex items-center justify-between gap-3"
          style={{ borderTop: `1px solid ${K.faint}`, background: K.surface }}>
          <div className="text-micro space-y-0.5" style={{ color: K.muted }}>
            <p>Time: <span style={{ color: K.cream }}>{formatCookTime(duration)}</span> · XP: <span style={{ color: K.xp }}>{fmt(qty * recipe.xpPerItem)}</span></p>
            <div className="flex items-center gap-3">
              {burnPct > 0 && <Tip text="Chance to lose item. Reduced by instruments."><span style={{ color: K.warn }}>Burn {burnPct}%</span></Tip>}
              {qualPct > 0 && <Tip text="Chance for extra output. Increased by instruments."><span style={{ color: K.indigo }}>Bonus {qualPct}%</span></Tip>}
            </div>
          </div>
          <div className="relative shrink-0">
            <AnimatePresence>
              {missingTip && (
                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
                  className="absolute -top-7 right-0 whitespace-nowrap text-micro font-bold px-2 py-0.5 rounded-md z-10"
                  style={{ background: K.warn, color: '#fff' }}>Missing ingredients!</motion.div>
              )}
            </AnimatePresence>
            <motion.button type="button"
              whileTap={canStart ? { scale: .93 } : {}}
              animate={btnShake ? { x: [0, -4, 4, -3, 3, 0] } : {}}
              transition={btnShake ? { duration: 0.4 } : {}}
              onClick={(e) => {
                if (canStart) { spawnRipple(e); playClickSound(); onStart(recipe, qty) }
                else {
                  playCookErrorSound()
                  setBtnShake(true); setTimeout(() => setBtnShake(false), 400)
                  setMissingTip(true); setTimeout(() => setMissingTip(false), 1500)
                }
              }}
              className="px-7 py-2.5 rounded text-sm font-bold relative overflow-hidden"
              style={canStart
                ? { color: '#fff', background: `linear-gradient(135deg, ${K.copper}, ${K.clay})`,
                    boxShadow: `0 4px 20px ${K.copper}20` }
                : { color: `${K.muted}60`, border: `1px solid ${K.faint}`, background: 'rgba(255,255,255,.01)' }}>
              <span className="relative">{canStart ? 'Cook!' : 'Need more'}</span>
            </motion.button>
          </div>
        </div>
        </motion.div>
      </motion.div>
    </>
  )
}


// ══════════════════════════════════════════════════════════════════════════════
// ── TOOLS PANEL ─────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function ToolsPanel({ chefLevel, onClose, focusId }: { chefLevel: number; onClose: () => void; focusId?: CookInstrumentId | null }) {
  const instrumentTiers = useCookingStore((s) => s.instrumentTiers)
  const unlocked = useCookingStore((s) => s.unlockedInstruments)
  const upgradeInstrument = useCookingStore((s) => s.upgradeInstrument)
  const unlockInstrument = useCookingStore((s) => s.unlockInstrument)
  const gold = useGoldStore((s) => s.gold) ?? 0
  const focusRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (focusId && focusRef.current) {
      setTimeout(() => focusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 350)
    }
  }, [focusId])

  const spend = (cost: number) => {
    useGoldStore.getState().addGold(-cost)
    const uid = useAuthStore.getState().user?.id
    if (uid) useGoldStore.getState().syncToSupabase(uid).catch(() => {})
  }

  return (
    <>
      <motion.div className="fixed inset-0 z-[100] bg-black/65"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-[101] rounded-t-2xl"
        style={{ background: K.surface, borderTop: `1px solid ${K.faint}` }}
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 340 }}
      >
        <div className="p-4 pb-8 max-h-[70vh] overflow-y-auto">
          <div className="flex justify-center mb-3"><div className="w-10 h-1 rounded-full" style={{ background: K.faint }} /></div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-bold" style={{ color: K.cream }}>Cooking Tools</p>
            <span className="text-micro font-mono px-2 py-1 rounded"
              style={{ color: K.xp, background: `${K.xp}08` }}>
              {fmt(gold)} gold
            </span>
          </div>
          <div className="space-y-1.5">
            {COOK_INSTRUMENTS.map((inst) => {
              const isFocused = focusId === inst.id
              const isLocked = !unlocked.includes(inst.id)
              const tier = instrumentTiers[inst.id] ?? 0
              const td = inst.tiers[tier]
              const next = tier + 1 < inst.tiers.length ? inst.tiers[tier + 1] : null
              const maxed = !isLocked && !next
              const canUL = isLocked && chefLevel >= inst.unlockLevel && gold >= inst.unlockCost
              const lvlLock = isLocked && chefLevel < inst.unlockLevel
              const canUP = !isLocked && next ? gold >= next.cost : false

              return (
                <div key={inst.id} ref={isFocused ? focusRef : undefined}
                  className="rounded px-3 py-2.5"
                  style={{
                    background: isFocused ? `${K.copper}08` : 'rgba(255,255,255,.01)',
                    border: `1px solid ${isFocused ? `${K.copper}18` : K.faint}`,
                    opacity: lvlLock ? .3 : 1,
                  }}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded flex items-center justify-center text-xl shrink-0"
                      style={{
                        background: isLocked ? 'rgba(255,255,255,.01)' : `${TIER_C[tier]}0a`,
                        border: `1px solid ${isLocked ? K.faint : `${TIER_C[tier]}20`}`,
                      }}>
                      {isLocked ? '🔒' : td.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-caption font-semibold" style={{ color: K.cream }}>{inst.name}</span>
                        {!isLocked && (
                          <span className="text-micro font-mono px-1 py-0.5 rounded"
                            style={{ color: TIER_C[tier], background: `${TIER_C[tier]}0c` }}>{td.name}</span>
                        )}
                      </div>
                      {isLocked ? (
                        <p className="text-micro mt-0.5" style={{ color: K.muted }}>Requires Cooking Level {inst.unlockLevel}</p>
                      ) : (
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap text-micro">
                          {td.speedBonus > 0 && <span style={{ color: K.ready }}>Speed +{Math.round(td.speedBonus * 100)}%</span>}
                          {td.qualityBonus > 0 && <span style={{ color: K.indigo }}>Bonus +{Math.round(td.qualityBonus * 100)}%</span>}
                          {td.burnReduction > 0 && <span style={{ color: K.warn }}>Burn -{Math.round(td.burnReduction * 100)}%</span>}
                        </div>
                      )}
                      {!isLocked && (
                        <div className="flex gap-0.5 mt-1">
                          {inst.tiers.map((_, i) => (
                            <div key={i} className="w-2.5 h-0.5 rounded-full"
                              style={{ background: i <= tier ? TIER_C[Math.min(i, tier)] : `${K.faint}60` }} />
                          ))}
                        </div>
                      )}
                    </div>
                    {isLocked ? (
                      <button type="button"
                        onClick={() => { if (canUL) { playClickSound(); unlockInstrument(inst.id, chefLevel, gold, spend) } }}
                        className="shrink-0 px-3 py-1.5 rounded text-micro font-bold"
                        style={canUL ? { color: K.xp, background: `${K.xp}0c`, border: `1px solid ${K.xp}18` }
                          : { color: `${K.muted}60`, background: 'rgba(255,255,255,.01)', border: `1px solid ${K.faint}` }}>
                        {lvlLock ? `Lvl ${inst.unlockLevel}` : `${fmt(inst.unlockCost)}g`}
                      </button>
                    ) : maxed ? (
                      <span className="text-micro font-mono px-2" style={{ color: K.muted }}>MAX</span>
                    ) : (
                      <button type="button"
                        onClick={() => { if (canUP) { playClickSound(); upgradeInstrument(inst.id, gold, spend) } }}
                        className="shrink-0 px-3 py-1.5 rounded text-micro font-bold"
                        style={canUP ? { color: K.xp, background: `${K.xp}0c`, border: `1px solid ${K.xp}18` }
                          : { color: `${K.muted}60`, background: 'rgba(255,255,255,.01)', border: `1px solid ${K.faint}` }}>
                        {fmt(next!.cost)}g
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </motion.div>
    </>
  )
}


// ══════════════════════════════════════════════════════════════════════════════
// ── INSTRUMENT SHELF ────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function InstrumentShelf({ currentInstrument, activeInstruments, onInstrumentClick }: {
  currentInstrument: CookInstrumentId | null
  activeInstruments: Set<CookInstrumentId> | null
  onInstrumentClick: (id: CookInstrumentId) => void
}) {
  const tiers = useCookingStore((s) => s.instrumentTiers)
  const unlocked = useCookingStore((s) => s.unlockedInstruments)
  const isCooking = activeInstruments !== null

  return (
    <div className="relative rounded"
      style={{ background: 'rgba(255,255,255,.02)', border: `1px solid ${K.faint}` }}>
      <div className="absolute bottom-0 left-0 right-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, rgba(255,255,255,.06), transparent)` }} />
      <div className="flex items-center justify-between py-2.5 px-2">
        {COOK_INSTRUMENTS.map((inst) => {
          const isLocked = !unlocked.includes(inst.id)
          const t = tiers[inst.id] ?? 0
          const td = inst.tiers[t]
          const isCurrentStep = currentInstrument === inst.id
          const isUsedInRecipe = activeInstruments?.has(inst.id) ?? false
          const isDimmed = isCooking && !isUsedInRecipe

          return (
            <button key={inst.id} type="button"
              onClick={() => { playClickSound(); onInstrumentClick(inst.id) }}
              className={`relative flex flex-col items-center ${isCurrentStep && isCooking ? 'ember-pulse' : ''}`}
              style={{
                width: 46, opacity: isLocked ? .2 : isDimmed ? .3 : 1,
                transition: 'opacity .3s, transform .3s, border-color .3s, background .3s',
                transform: isCurrentStep && isCooking ? 'translateY(-2px)' : 'translateY(0)',
                borderRadius: 10,
                border: isCurrentStep && isCooking ? `1px solid ${K.copper}55` : '1px solid transparent',
                background: isCurrentStep && isCooking ? `${K.copper}0d` : 'transparent',
                padding: '5px 0 4px',
              }}
            >
              <div className="flex items-center justify-center"
                style={{ width: 34, height: 34, fontSize: 18 }}>
                {isLocked ? '🔒' : td.icon}
              </div>
              <span className="text-micro mt-1" style={{
                color: isCurrentStep && isCooking ? K.copper : K.muted,
                fontWeight: isCurrentStep ? 700 : 400,
              }}>
                {inst.name}
              </span>
              {!isLocked && t > 0 && (
                <div className="absolute top-0 right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-bold"
                  style={{ background: TIER_C[t], color: '#fff' }}>{t}</div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}


// ══════════════════════════════════════════════════════════════════════════════
// ── CAULDRON — free-combine discovery ───────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/** Items eligible as cooking ingredients (plants + mob materials). */
function isIngredient(item: LootItemDef): boolean {
  if (item.slot === 'plant') return true
  if (item.slot === 'material') {
    // Mob materials used in cooking recipes
    return ['slime_gel', 'goblin_tooth', 'wolf_fang', 'orc_shard', 'troll_hide', 'dragon_scale'].includes(item.id)
  }
  return false
}

const MAX_CAULDRON_SLOTS = 4
const mkSlots = (): string[] => Array(MAX_CAULDRON_SLOTS).fill('')

/** Render an item icon with image support. */
function ItemIcon({ item, size = 'md' }: { item: LootItemDef | null; size?: 'sm' | 'md' | 'lg' }) {
  const cls = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-6 h-6'
  if (!item) return <span className={`${cls} flex items-center justify-center text-sm`} style={{ color: K.muted }}>?</span>
  return <LootVisual icon={item.icon} image={item.image} className={`${cls} object-contain`} scale={item.renderScale ?? 1} />
}

function Cauldron({ items, onConsume, onGrant, onRecipeFound }: {
  items: Record<string, number>
  onConsume: (id: string, qty: number) => void
  onGrant: (id: string, qty: number) => void
  onRecipeFound?: (recipeId: string) => void
}) {
  const [slots, setSlots] = useState<string[]>(mkSlots)
  const [pickingSlot, setPickingSlot] = useState<number | null>(null)
  const [result, setResult] = useState<DiscoveryResult | null>(null)
  const [shake, setShake] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [infoMsg, setInfoMsg] = useState<string | null>(null)
  const [slotFlashRed, setSlotFlashRed] = useState(false)
  const resultRef = useRef<HTMLDivElement>(null)
  const tryFreeformCook = useCookingStore((s) => s.tryFreeformCook)

  const availableIngredients = useMemo(() => {
    return LOOT_ITEMS.filter((item) => isIngredient(item) && (items[item.id] ?? 0) > 0)
  }, [items])

  // IDs already placed in slots (to grey them out in the picker)
  const usedIds = useMemo(() => new Set(slots.filter(Boolean)), [slots])

  const filledCount = slots.filter(Boolean).length

  const handleCook = useCallback(() => {
    const ids = slots.filter(Boolean)
    if (ids.length === 0) return
    const res = tryFreeformCook(ids, items, onConsume)
    if (res === 'not_enough') {
      playCookErrorSound()
      setShake(true)
      setTimeout(() => setShake(false), 600)
      setErrorMsg('Not enough ingredients!')
      setTimeout(() => setErrorMsg(null), 2000)
      return
    }
    setResult(res)
    if (res.type === 'mystery_stew') {
      playCookErrorSound()
      setShake(true)
      setTimeout(() => setShake(false), 600)
      setSlotFlashRed(true)
      setTimeout(() => setSlotFlashRed(false), 600)
      // Grant mystery stew to inventory
      onGrant('food_mystery_stew', 1)
    } else if (res.type === 'discovered') {
      playCookDiscoverySound()
      if (res.canStart && res.recipeId) {
        onRecipeFound?.(res.recipeId)
      }
    } else if (res.type === 'known' && res.canStart && res.recipeId) {
      // Already known recipe — show info, don't open modal
      setInfoMsg(`Recipe already discovered!`)
      setTimeout(() => setInfoMsg(null), 2000)
      playClickSound()
    } else {
      // known recipe but can't afford
      playCookErrorSound()
    }
    setSlots(mkSlots())
  }, [slots, items, onConsume, tryFreeformCook])

  const handlePickIngredient = useCallback((itemId: string) => {
    if (pickingSlot === null) return
    if ((items[itemId] ?? 0) <= 0) return
    setSlots((prev) => {
      const next = [...prev]
      next[pickingSlot] = itemId
      return next
    })
    setPickingSlot(null)
    playClickSound()
  }, [pickingSlot, items])

  const clearSlot = useCallback((idx: number) => {
    setSlots((prev) => {
      const next = [...prev]
      next[idx] = ''
      return next
    })
  }, [])

  return (
    <div className="px-4 mt-4">
      {/* Cauldron header */}
      <div className="flex flex-col items-center mb-3">
        <motion.div
          animate={shake ? { rotate: [0, -5, 5, -3, 3, 0] } : {}}
          transition={{ duration: 0.5 }}
          className="text-5xl mb-1.5 select-none"
        >🫕</motion.div>
        <p className="text-micro" style={{ color: K.muted }}>
          Pick ingredients — the cauldron figures out the amounts
        </p>
        <AnimatePresence>
          {errorMsg && (
            <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="text-micro font-bold mt-1" style={{ color: K.warn }}>{errorMsg}</motion.p>
          )}
          {infoMsg && !errorMsg && (
            <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="text-micro font-bold mt-1" style={{ color: K.copper }}>{infoMsg}</motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Slots — just pick ingredient type, no qty */}
      <div className="flex gap-2.5 justify-center mb-3">
        {slots.map((id, i) => {
          const itemDef = id ? getItemDef(id) : null
          const isActive = pickingSlot === i
          return (
            <div key={i} className="flex flex-col items-center" style={{ width: 64 }}>
              <button
                onClick={() => {
                  if (id) { clearSlot(i); playClickSound() }
                  else { setPickingSlot(isActive ? null : i); playClickSound() }
                }}
                className="w-[56px] h-[56px] rounded flex items-center justify-center transition-all shrink-0 relative"
                style={{
                  background: id ? K.surface : K.hearth,
                  border: `1.5px ${isActive ? 'solid' : id ? 'solid' : 'dashed'} ${slotFlashRed && id ? K.warn : isActive ? K.copper : id ? K.faint : `${K.muted}40`}`,
                  boxShadow: slotFlashRed && id ? `0 0 12px ${K.warn}40` : isActive ? `0 0 10px ${K.copper}30` : 'none',
                  transition: 'border-color .3s, box-shadow .3s',
                }}
              >
                {id ? (
                  <>
                    <ItemIcon item={itemDef} size="lg" />
                    {/* Tiny X in corner */}
                    <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px]"
                      style={{ background: K.hearth, color: K.warn, border: `1px solid ${K.faint}` }}>✕</div>
                  </>
                ) : (
                  <span className="text-base" style={{ color: `${K.muted}50` }}>+</span>
                )}
              </button>
              <span className="text-micro mt-1 truncate w-full text-center leading-tight"
                style={{ color: id ? K.cream : `${K.muted}40`, minHeight: 12 }}>
                {itemDef?.name ?? (id ? id : '')}
              </span>
            </div>
          )
        })}
      </div>

      {/* Cook button */}
      <div className="flex justify-center mb-3">
        <button
          onClick={handleCook}
          disabled={filledCount === 0}
          className="px-5 py-2 rounded text-xs font-bold transition-all"
          style={{
            background: filledCount > 0
              ? `linear-gradient(135deg, ${K.copper}, #d4944e)`
              : K.hearth,
            color: filledCount > 0 ? '#fff' : K.muted,
            border: `1px solid ${filledCount > 0 ? K.copper : K.faint}`,
            opacity: filledCount > 0 ? 1 : 0.4,
          }}
        >
          Throw in the Cauldron!
        </button>
      </div>

      {/* Ingredient picker — bottom sheet overlay */}
      <AnimatePresence>
        {pickingSlot !== null && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-end justify-center"
            style={{ background: 'rgba(0,0,0,.5)' }}
            onClick={() => setPickingSlot(null)}
          >
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-md rounded-t-2xl px-4 pt-3 pb-6"
              style={{ background: K.surface, maxHeight: '60vh', overflowY: 'auto' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center mb-2">
                <div className="w-8 h-1 rounded-full" style={{ background: K.faint }} />
              </div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold" style={{ color: K.cream }}>
                  Pick ingredient
                </span>
                <button onClick={() => setPickingSlot(null)}
                  className="text-micro px-2 py-0.5 rounded"
                  style={{ background: K.hearth, color: K.muted }}>
                  Cancel
                </button>
              </div>
              {availableIngredients.length === 0 ? (
                <p className="text-caption py-6 text-center" style={{ color: K.muted }}>
                  No ingredients in inventory. Harvest crops or defeat arena mobs!
                </p>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {availableIngredients.map((item) => {
                    const theme = getRarityTheme(item.rarity)
                    const alreadyUsed = usedIds.has(item.id)
                    return (
                      <button key={item.id}
                        onClick={() => !alreadyUsed && handlePickIngredient(item.id)}
                        className="flex flex-col items-center p-2 rounded transition-colors"
                        style={{
                          background: K.hearth,
                          border: `1px solid ${alreadyUsed ? `${K.faint}40` : `${theme.border}18`}`,
                          opacity: alreadyUsed ? 0.35 : 1,
                        }}
                      >
                        <div className="w-9 h-9 flex items-center justify-center mb-1">
                          <ItemIcon item={item} size="lg" />
                        </div>
                        <span className="text-micro font-medium truncate w-full text-center leading-tight"
                          style={{ color: K.cream }}>{item.name}</span>
                        <span className="text-micro font-mono" style={{ color: K.muted }}>×{items[item.id] ?? 0}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Result — overlay modal */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6"
            style={{ background: 'rgba(0,0,0,.6)' }}
            onClick={() => setResult(null)}
          >
            <motion.div ref={resultRef}
              initial={{ scale: 0.85, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.85, opacity: 0 }}
              onAnimationComplete={() => {
                if (result.type === 'discovered' && resultRef.current) {
                  spawnConfetti(resultRef.current, 12)
                }
              }}
              className="w-full max-w-[260px] rounded overflow-hidden relative"
              style={{
                background: K.surface,
                border: `1px solid ${result.type === 'discovered' ? K.copper : result.type === 'mystery_stew' ? `${K.warn}40` : K.faint}`,
                boxShadow: result.type === 'discovered' ? `0 0 40px ${K.copper}20` : '0 8px 30px rgba(0,0,0,.5)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Golden flash for discovery */}
              {result.type === 'discovered' && (
                <div className="kv-golden-flash absolute inset-0 z-10 rounded"
                  style={{ background: `radial-gradient(circle at 50% 30%, ${K.xp}30, transparent 70%)` }} />
              )}
              {/* Top accent */}
              <div className="h-1" style={{
                background: result.type === 'discovered' ? K.copper :
                             result.type === 'mystery_stew' ? K.warn : K.faint,
              }} />
              <div className="p-5 text-center relative z-20">
                <div className="text-4xl mb-2">{result.foodIcon}</div>
                <div className="text-body font-bold mb-0.5" style={{
                  color: result.type === 'discovered' ? K.xp : result.type === 'mystery_stew' ? K.warn : K.cream,
                }}>
                  {result.type === 'discovered' ? 'New Recipe Discovered!' :
                   result.type === 'mystery_stew' ? 'Mystery Stew...' :
                   result.xpGained === 0 ? 'Not enough ingredients!' : 'Cooking started!'}
                </div>
                <div className="text-caption mb-1" style={{ color: K.cream }}>{result.foodName}</div>
                {result.xpGained > 0 && (
                  <div className="text-micro font-mono" style={{ color: K.xp }}>+{result.xpGained} XP</div>
                )}
                {result.type === 'mystery_stew' && (
                  <p className="text-micro mt-2" style={{ color: K.muted }}>
                    Wrong combination — try different ingredients!
                  </p>
                )}
                {result.type === 'discovered' && (
                  <p className="text-micro mt-2" style={{ color: K.copper }}>
                    Recipe added to your Cookbook!
                    {result.xpGained === 0 && <><br/>Gather more ingredients to start cooking.</>}
                  </p>
                )}
                {result.type === 'known' && result.xpGained === 0 && (
                  <p className="text-micro mt-2" style={{ color: K.muted }}>
                    You know this recipe but need more ingredients. Check the Recipes tab!
                  </p>
                )}
                <button onClick={() => setResult(null)}
                  className="mt-3 w-full py-1.5 rounded text-micro font-bold"
                  style={{ background: K.hearth, color: K.cream, border: `1px solid ${K.faint}` }}>
                  OK
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}


// ══════════════════════════════════════════════════════════════════════════════
// ── COOKBOOK — mastery overview + recipe hints ───────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function StarDisplay({ stars, maxStars = MASTERY_MAX_STARS }: { stars: number; maxStars?: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {Array.from({ length: maxStars }).map((_, i) => (
        <span key={i} className="text-micro" style={{ color: i < stars ? '#e2b052' : '#2a2a3a', textShadow: i < stars ? '0 0 4px rgba(226,176,82,.3)' : 'none' }}>★</span>
      ))}
    </span>
  )
}

function Cookbook({ chefLevel }: { chefLevel: number }) {
  const discoveredRecipes = useCookingStore((s) => s.discoveredRecipes)
  const [selectedRecipe, setSelectedRecipe] = useState<CookingRecipe | null>(null)
  useEscapeHandler(() => setSelectedRecipe(null), selectedRecipe !== null)

  const recipesByRarity = useMemo(() => {
    const groups: { label: string; rarity: string; recipes: CookingRecipe[] }[] = []
    for (const rar of ['common', 'rare', 'epic', 'legendary', 'mythic'] as const) {
      const rs = COOKING_RECIPES
        .filter((r) => (FOOD_ITEM_MAP[r.outputItemId]?.rarity ?? 'common') === rar)
        .sort((a, b) => a.chefLevelRequired - b.chefLevelRequired)
      if (rs.length > 0) groups.push({ label: rar.charAt(0).toUpperCase() + rar.slice(1), rarity: rar, recipes: rs })
    }
    return groups
  }, [])

  const totalDiscovered = Object.keys(discoveredRecipes).length
  const totalRecipes = COOKING_RECIPES.length
  const pct = totalRecipes > 0 ? Math.round((totalDiscovered / totalRecipes) * 100) : 0

  return (
    <div className="px-4 mt-4">
      {/* Summary bar */}
      <div className="flex items-center gap-3 mb-4 rounded p-3"
        style={{ background: K.surface, border: `1px solid ${K.faint}` }}>
        <div className="text-3xl shrink-0">📖</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold" style={{ color: K.cream }}>Cookbook</span>
            <span className="text-micro font-mono" style={{ color: K.copper }}>
              {totalDiscovered}/{totalRecipes}
            </span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,.04)' }}>
            <div className="h-full rounded-full transition-all" style={{
              width: `${pct}%`,
              background: `linear-gradient(90deg, ${K.copper}, ${K.xp})`,
            }} />
          </div>
        </div>
      </div>

      {/* Recipe grid by rarity */}
      {recipesByRarity.map((g) => {
        const rarTheme = getRarityTheme(g.rarity as 'common')
        const found = g.recipes.filter((r) => r.id in discoveredRecipes).length
        return (
          <div key={g.rarity} className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1 h-3.5 rounded-full" style={{ background: rarTheme.color }} />
              <span className="text-caption font-bold uppercase tracking-wide" style={{ color: rarTheme.color }}>
                {g.label}
              </span>
              <div className="flex-1 h-px" style={{ background: `${rarTheme.color}12` }} />
              <span className="text-micro font-mono" style={{ color: K.muted }}>
                {found}/{g.recipes.length}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {g.recipes.map((recipe) => {
                const food = FOOD_ITEM_MAP[recipe.outputItemId]
                const isFound = recipe.id in discoveredRecipes
                const timesCrafted = discoveredRecipes[recipe.id] ?? 0
                const stars = isFound ? getMasteryStars(timesCrafted) : 0
                const nextStarIn = isFound ? cooksToNextStar(timesCrafted) : 0

                return (
                  <button key={recipe.id}
                    onClick={() => { setSelectedRecipe(recipe); playClickSound() }}
                    className="rounded text-left transition-all overflow-hidden"
                    style={{
                      background: K.hearth,
                      border: `1px solid ${isFound ? `${rarTheme.color}20` : K.faint}`,
                    }}>
                    {/* Top glow for discovered */}
                    {isFound && (
                      <div className="h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${rarTheme.color}30, transparent)` }} />
                    )}
                    <div className="p-2.5 flex items-center gap-2.5">
                      {/* Icon container */}
                      <div className="w-9 h-9 rounded flex items-center justify-center shrink-0"
                        style={{
                          background: isFound ? `${rarTheme.color}08` : 'rgba(255,255,255,.02)',
                          border: `1px solid ${isFound ? `${rarTheme.color}15` : 'rgba(255,255,255,.03)'}`,
                        }}>
                        <span className="text-lg">{isFound ? (food?.icon ?? '?') : '❓'}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-caption font-semibold truncate leading-tight"
                          style={{ color: isFound ? K.cream : K.muted }}>
                          {isFound ? (food?.name ?? '???') : '???'}
                        </div>
                        <div className="mt-0.5">
                          {isFound ? (
                            <Tip text={stars > 0 ? `★${stars}: ${(() => { const b = getMasteryBonus(stars); const parts: string[] = []; if (b.buffMultiplier > 1) parts.push(`Buff +${Math.round((b.buffMultiplier-1)*100)}%`); if (b.ingredientSaveChance > 0) parts.push(`Save ${Math.round(b.ingredientSaveChance*100)}%`); if (b.doubleOutputChance > 0) parts.push(`2x ${Math.round(b.doubleOutputChance*100)}%`); return parts.join(', ') || 'Keep cooking!' })()}` : 'Cook more to earn mastery!'}>
                              <StarDisplay stars={stars} />
                            </Tip>
                          ) : (
                            <span className="text-micro italic" style={{ color: `${K.muted}80` }}>Undiscovered</span>
                          )}
                        </div>
                        {isFound && nextStarIn > 0 && (
                          <div className="text-micro mt-0.5 font-mono" style={{ color: `${K.muted}90` }}>
                            {nextStarIn} to next ★
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Recipe detail modal */}
      <AnimatePresence>
        {selectedRecipe && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,.65)' }}
            onClick={() => setSelectedRecipe(null)}
          >
            <motion.div
              initial={{ scale: 0.92, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, opacity: 0 }}
              className="w-full max-w-xs rounded overflow-hidden"
              style={{ background: K.surface, border: `1px solid ${K.faint}`, boxShadow: '0 16px 48px rgba(0,0,0,.6)' }}
              onClick={(e) => e.stopPropagation()}
            >
              {(() => {
                const food = FOOD_ITEM_MAP[selectedRecipe.outputItemId]
                const isFound = selectedRecipe.id in discoveredRecipes
                const timesCrafted = discoveredRecipes[selectedRecipe.id] ?? 0
                const stars = isFound ? getMasteryStars(timesCrafted) : 0
                const bonus = isFound ? getMasteryBonus(stars) : getMasteryBonus(1)
                const hint = getRecipeHint(selectedRecipe, chefLevel)
                const rarTheme = getRarityTheme(food?.rarity ?? 'common')

                return (
                  <>
                    {/* Colored header strip */}
                    <div className="h-1" style={{ background: isFound ? rarTheme.color : K.faint }} />
                    <div className="p-4">
                      {/* Header */}
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 rounded flex items-center justify-center text-3xl shrink-0"
                          style={{
                            background: isFound ? `${rarTheme.color}0a` : 'rgba(255,255,255,.02)',
                            border: `1px solid ${isFound ? `${rarTheme.color}20` : K.faint}`,
                          }}>
                          {isFound ? (food?.icon ?? '?') : '❓'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold truncate" style={{ color: isFound ? rarTheme.color : K.muted }}>
                            {isFound ? (food?.name ?? '???') : '???'}
                          </div>
                          {isFound && (
                            <div className="flex items-center gap-2 mt-0.5">
                              <StarDisplay stars={stars} />
                              <span className="text-micro font-mono" style={{ color: K.muted }}>
                                {timesCrafted}× cooked
                              </span>
                            </div>
                          )}
                          {!isFound && (
                            <span className="text-micro uppercase tracking-wide" style={{ color: rarTheme.color }}>
                              {food?.rarity ?? 'common'}
                            </span>
                          )}
                        </div>
                      </div>

                      {isFound ? (
                        <div className="space-y-3">
                          {/* Ingredients */}
                          <div className="rounded p-2.5" style={{ background: K.hearth }}>
                            <div className="text-micro font-bold uppercase tracking-wide mb-1.5" style={{ color: K.copper }}>Ingredients</div>
                            <div className="space-y-1">
                              {selectedRecipe.ingredients.map((ing) => {
                                const iDef = getItemDef(ing.id)
                                return (
                                  <div key={ing.id} className="flex items-center gap-2">
                                    <div className="w-5 h-5 flex items-center justify-center shrink-0">
                                      <ItemIcon item={iDef} size="sm" />
                                    </div>
                                    <span className="text-micro font-medium" style={{ color: K.cream }}>{iDef?.name ?? ing.id}</span>
                                    <span className="text-micro font-mono ml-auto" style={{ color: K.muted }}>×{ing.qty}</span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>

                          {/* Food effect */}
                          {food?.effect && (
                            <div className="rounded p-2.5" style={{ background: K.hearth }}>
                              <div className="text-micro font-bold uppercase tracking-wide mb-1.5" style={{ color: K.ready }}>Effect</div>
                              <div className="flex flex-wrap gap-1.5">
                                {(food.effect.heal ?? 0) > 0 && (
                                  <span className="text-micro font-semibold px-1.5 py-0.5 rounded"
                                    style={{ color: K.ready, background: `${K.ready}0a` }}>
                                    +{food.effect.heal} HP
                                  </span>
                                )}
                                {(food.effect.buffAtk ?? 0) > 0 && (
                                  <span className="text-micro font-semibold px-1.5 py-0.5 rounded"
                                    style={{ color: K.warn, background: `${K.warn}0a` }}>
                                    +{Math.round(food.effect.buffAtk! * bonus.buffMultiplier)} ATK
                                  </span>
                                )}
                                {(food.effect.buffDef ?? 0) > 0 && (
                                  <span className="text-micro font-semibold px-1.5 py-0.5 rounded"
                                    style={{ color: K.indigo, background: `${K.indigo}0a` }}>
                                    +{Math.round(food.effect.buffDef! * bonus.buffMultiplier)} DEF
                                  </span>
                                )}
                                {(food.effect.buffRegen ?? 0) > 0 && (
                                  <span className="text-micro font-semibold px-1.5 py-0.5 rounded"
                                    style={{ color: '#22d3ee', background: 'rgba(34,211,238,.04)' }}>
                                    +{Math.round(food.effect.buffRegen! * bonus.buffMultiplier)} Regen
                                  </span>
                                )}
                                {(food.effect.buffDurationSec ?? 0) > 0 && (food.effect.buffAtk || food.effect.buffDef || food.effect.buffRegen) && (
                                  <span className="text-micro font-mono px-1.5 py-0.5 rounded"
                                    style={{ color: K.muted, background: 'rgba(255,255,255,.02)' }}>
                                    {food.effect.buffDurationSec}s
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Mastery bonuses */}
                          {stars >= 2 && (
                            <div className="rounded p-2.5" style={{ background: K.hearth }}>
                              <div className="text-micro font-bold uppercase tracking-wide mb-1.5" style={{ color: K.xp }}>
                                Mastery ({stars}★)
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {bonus.buffMultiplier > 1 && (
                                  <span className="text-micro px-1.5 py-0.5 rounded"
                                    style={{ color: K.xp, background: `${K.xp}0a` }}>
                                    Buff +{Math.round((bonus.buffMultiplier - 1) * 100)}%
                                  </span>
                                )}
                                {bonus.ingredientSaveChance > 0 && (
                                  <span className="text-micro px-1.5 py-0.5 rounded"
                                    style={{ color: K.ready, background: `${K.ready}0a` }}>
                                    Save {Math.round(bonus.ingredientSaveChance * 100)}%
                                  </span>
                                )}
                                {bonus.doubleOutputChance > 0 && (
                                  <span className="text-micro px-1.5 py-0.5 rounded"
                                    style={{ color: K.indigo, background: `${K.indigo}0a` }}>
                                    2× {Math.round(bonus.doubleOutputChance * 100)}%
                                  </span>
                                )}
                                {bonus.xpMultiplier > 1 && (
                                  <span className="text-micro px-1.5 py-0.5 rounded"
                                    style={{ color: K.copper, background: `${K.copper}0a` }}>
                                    XP +{Math.round((bonus.xpMultiplier - 1) * 100)}%
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="rounded p-3" style={{ background: K.hearth }}>
                          <div className="text-micro font-bold uppercase tracking-wide mb-1.5" style={{ color: K.copper }}>Hint</div>
                          <p className="text-micro italic leading-relaxed" style={{ color: K.muted }}>{hint}</p>
                          <p className="text-micro mt-2 leading-relaxed" style={{ color: `${K.muted}80` }}>
                            Combine the right ingredients in the Cauldron to discover this recipe.
                          </p>
                        </div>
                      )}

                      <button onClick={() => setSelectedRecipe(null)}
                        className="mt-3 w-full py-2 rounded text-caption font-bold transition-colors"
                        style={{ background: K.hearth, color: K.cream, border: `1px solid ${K.faint}` }}>
                        Close
                      </button>
                    </div>
                  </>
                )
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

type CookingTab = 'recipes' | 'cauldron' | 'cookbook'


// ══════════════════════════════════════════════════════════════════════════════
// ── KITCHEN GUIDE ──────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function GuideSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mb-1">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-2 px-3 rounded text-left"
        style={{ background: K.hearth, border: `1px solid ${K.faint}` }}>
        <span className="text-caption font-bold" style={{ color: K.cream }}>{title}</span>
        <span className="text-micro" style={{ color: K.muted }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="px-3 py-2 text-micro leading-relaxed" style={{ color: K.muted }}>{children}</div>
      )}
    </div>
  )
}

function CookingGuideContent() {
  return (
    <div className="space-y-1">
      <GuideSection title="Cooking Basics">
        <p>Select a recipe from the Recipes tab, choose a quantity, then tap Cook. Each recipe has multiple steps that auto-advance — just let it run!</p>
      </GuideSection>
      <GuideSection title="Burn Chance">
        <p>Higher rarity recipes have a higher chance to burn. Burned items are lost. Upgrade your instruments to reduce burn chance.</p>
      </GuideSection>
      <GuideSection title="Quality Bonus">
        <p>Each cooked item has a chance to produce bonus output. Higher tier instruments increase this chance.</p>
      </GuideSection>
      <GuideSection title="Mastery">
        <p>Cook the same dish repeatedly to earn mastery stars. Stars increase buff power, grant ingredient save chance, and boost XP earned.</p>
      </GuideSection>
      <GuideSection title="Cooking Tools">
        <p>Unlock and upgrade instruments (knife, pan, pot, etc.) with gold. They increase cooking speed, reduce burn chance, and boost quality bonus.</p>
      </GuideSection>
      <GuideSection title="Cauldron">
        <p>Combine any ingredients freely to discover new recipes. Wrong combos produce Mystery Stew (small XP but the item is consumed). Right combos unlock the recipe permanently!</p>
      </GuideSection>
      <GuideSection title="Cooking Level">
        <p>Earn XP from cooking to level up. Higher cooking level unlocks new recipes and reduces cooking time. Some recipes require specific cooking levels.</p>
      </GuideSection>
    </div>
  )
}


// ══════════════════════════════════════════════════════════════════════════════
// ── INLINE TOOLTIP ─────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function Tip({ text, children }: { text: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false)
  return (
    <span className="relative inline-flex items-center"
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}
      onClick={() => setShow((s) => !s)}>
      {children}
      {show && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 rounded text-micro whitespace-nowrap z-50"
          style={{ background: '#1e2024', color: K.cream, border: `1px solid ${K.faint}`, boxShadow: '0 4px 12px rgba(0,0,0,.4)' }}>
          {text}
        </span>
      )}
    </span>
  )
}


// ══════════════════════════════════════════════════════════════════════════════
// ── MAIN PAGE ───────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

export function CookingPage() {
  const navigateTo = useNavigationStore((s) => s.navigateTo)
  const cookXp = useCookingStore((s) => s.cookXp)
  const activeJob = useCookingStore((s) => s.activeJob)
  const queue = useCookingStore((s) => s.queue)
  const hydrate = useCookingStore((s) => s.hydrate)
  const startCook = useCookingStore((s) => s.startCook)
  const cancelJob = useCookingStore((s) => s.cancelJob)
  const unlockedInstruments = useCookingStore((s) => s.unlockedInstruments)
  const instrumentTiers = useCookingStore((s) => s.instrumentTiers)
  const discoveredRecipes = useCookingStore((s) => s.discoveredRecipes)
  const discoveredCount = Object.keys(discoveredRecipes).length
  const items = useInventoryStore((s) => s.items)
  const deleteItem = useInventoryStore((s) => s.deleteItem)
  const addItem = useInventoryStore((s) => s.addItem)
  const [selRecipe, setSelRecipe] = useState<CookingRecipe | null>(null)
  const [showBP, setShowBP] = useState(false)
  const [showTools, setShowTools] = useState(false)
  const [focusInstrument, setFocusInstrument] = useState<CookInstrumentId | null>(null)
  const [activeTab, setActiveTab] = useState<CookingTab>('recipes')
  const [showGuide, setShowGuide] = useState(false)
  const [showWelcome, setShowWelcome] = useState(false)
  const [completionBanner, setCompletionBanner] = useState<{
    icon: string; name: string; qty: number; burned: number; bonus: number; xp: number; rarity: string
  } | null>(null)
  const completionBannerRef = useRef<HTMLDivElement>(null)
  const prevJobIdRef = useRef<string | null>(null)

  useEffect(() => { hydrate() }, [hydrate])

  // Welcome overlay on first visit
  useEffect(() => {
    if (!localStorage.getItem('grindly_kitchen_welcomed')) setShowWelcome(true)
  }, [])

  // Track job completion for celebration banner
  const prevJobRef = useRef<{ outputItemId: string; totalQty: number; xpPerItem: number } | null>(null)
  useEffect(() => {
    if (activeJob) {
      prevJobRef.current = { outputItemId: activeJob.outputItemId, totalQty: activeJob.totalQty, xpPerItem: activeJob.xpPerItem }
    }
  }, [activeJob?.id])
  useEffect(() => {
    const jobId = activeJob?.id ?? null
    const prevId = prevJobIdRef.current
    prevJobIdRef.current = jobId
    if (prevId && !jobId && prevJobRef.current) {
      const lastRoll = useCookingStore.getState().lastRoll
      const totalXp = useCookingStore.getState().lastJobXp
      const prev = prevJobRef.current
      const food = FOOD_ITEM_MAP[prev.outputItemId]
      if (food) {
        setCompletionBanner({
          icon: food.icon, name: food.name,
          qty: lastRoll?.granted ?? prev.totalQty,
          burned: lastRoll?.burned ?? 0,
          bonus: lastRoll?.bonus ?? 0,
          xp: totalXp,
          rarity: food.rarity,
        })
        setTimeout(() => {
          if (completionBannerRef.current) {
            const rar = food.rarity
            if (['rare', 'epic', 'legendary', 'mythic'].includes(rar)) {
              spawnConfetti(completionBannerRef.current, rar === 'rare' ? 6 : rar === 'epic' ? 10 : 14)
            }
          }
        }, 100)
        setTimeout(() => setCompletionBanner(null), 3000)
      }
      prevJobRef.current = null
    }
  }, [activeJob?.id])

  const chefLvl = skillLevelFromXP(cookXp ?? 0)
  const xpCur = cookXp ?? 0
  const { current: xpIntoLevel, needed: xpNeededForNext } = skillXPProgress(xpCur)
  const lvlPct = xpNeededForNext > 0 ? Math.min(100, (xpIntoLevel / xpNeededForNext) * 100) : 100

  const handleStart = useCallback((recipe: CookingRecipe, qty: number) => {
    // Pre-check: can we afford and do we have instruments?
    // Do this BEFORE cancelling existing jobs to avoid data loss
    const { unlockedInstruments: ul } = useCookingStore.getState()
    const neededInst = recipeInstruments(recipe)
    const missingInst = neededInst.find((id) => !ul.includes(id))
    if (missingInst) {
      playCookErrorSound()
      setFocusInstrument(missingInst)
      setShowTools(true)
      setSelRecipe(null)
      return
    }
    if (!canAffordCookRecipe(recipe, qty, items)) {
      playCookErrorSound()
      return
    }

    // Safe to cancel — we've verified the new cook will succeed
    const { activeJob: cur, queue: q } = useCookingStore.getState()
    if (cur) cancelJob(cur.id, (id, n) => addItem(id, n))
    for (const j of q) cancelJob(j.id, (id, n) => addItem(id, n))

    const res = startCook(recipe.id, qty, items, (id, n) => deleteItem(id, n))
    if (res === 'ok') {
      setSelRecipe(null)
      playLootRaritySound(FOOD_ITEM_MAP[recipe.outputItemId]?.rarity ?? 'common')
      setTimeout(() => playCookSoundForInstrument(stepToInstrument(recipe.steps[0])), 200)
      setTimeout(() => {
        const main = document.querySelector('main')
        if (main) main.scrollTo({ top: 0, behavior: 'smooth' })
      }, 100)
      const u = useAuthStore.getState().user
      if (supabase && u) {
        const { items: ci, chests } = useInventoryStore.getState()
        const { seeds, seedZips } = useFarmStore.getState()
        syncInventoryToSupabase(ci, chests, { merge: false, seeds, seedZips }).catch(() => {})
      }
    } else {
      // Shouldn't happen after pre-checks, but handle gracefully
      playCookErrorSound()
    }
  }, [items, startCook, deleteItem, cancelJob, addItem])

  const handleCancel = useCallback((jid: string) => {
    cancelJob(jid, (id, n) => addItem(id, n))
    const u = useAuthStore.getState().user
    if (supabase && u) {
      const { items: ci, chests } = useInventoryStore.getState()
      const { seeds, seedZips } = useFarmStore.getState()
      syncInventoryToSupabase(ci, chests, { merge: false, seeds, seedZips }).catch(() => {})
    }
  }, [cancelJob, addItem])

  const currentInstrument = useMemo(() => {
    if (!activeJob) return null
    const step = activeJob.steps[activeJob.stepIndex]
    return step ? stepToInstrument(step) : null
  }, [activeJob?.stepIndex, activeJob?.id])

  const activeInstruments = useMemo(() => {
    if (!activeJob) return null
    const recipe = COOKING_RECIPES.find((r) => r.id === activeJob.recipeId)
    if (!recipe) return null
    return new Set<CookInstrumentId>(recipeInstruments(recipe))
  }, [activeJob?.recipeId])

  const groups = useMemo(() => {
    const result: { label: string; rarity: string; recipes: CookingRecipe[] }[] = []
    for (const rar of ['common', 'rare', 'epic', 'legendary', 'mythic'] as const) {
      const rs = COOKING_RECIPES
        .filter((r) => (FOOD_ITEM_MAP[r.outputItemId]?.rarity ?? 'common') === rar)
        .sort((a, b) => a.chefLevelRequired - b.chefLevelRequired)
      if (rs.length > 0) result.push({ label: rar.charAt(0).toUpperCase() + rar.slice(1), rarity: rar, recipes: rs })
    }
    return result
  }, [])

  if (showBP) return <InventoryPage onBack={() => setShowBP(false)} />

  return (
    <div className="pb-20 min-h-full" style={{ background: K.pageBg }}>
      <div className="absolute top-0 left-0 right-0 h-40 pointer-events-none"
        style={{ background: `radial-gradient(ellipse 80% 100% at 50% 0%, ${K.copper}04 0%, transparent 70%)` }} />

      {/* ── Header ── */}
      <div className="px-4 pt-4 pb-2 relative">
        <PageHeader
          title="Cooking"
          icon={<span className="text-base leading-none">🍳</span>}
          onBack={() => navigateTo?.('home')}
          backLabel="Home"
          titleSlot={
            <div className="flex items-center gap-2 ml-1">
              <span className="text-micro" style={{ color: K.muted }}>
                Lv <span className="font-bold" style={{ color: K.copper }}>{chefLvl}</span>
              </span>
              <span className="text-micro font-mono" style={{ color: K.xp }}>{fmt(xpCur)} XP</span>
            </div>
          }
          rightSlot={
            <div className="flex items-center gap-2">
              <button onClick={() => setShowGuide(true)}
                className="w-8 h-8 rounded flex items-center justify-center text-xs font-bold"
                style={{ color: K.muted, background: 'rgba(255,255,255,.03)', border: `1px solid ${K.faint}` }}>?</button>
              <BackpackButton onClick={() => setShowBP(true)} />
            </div>
          }
        />

        <div className="mt-2.5 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,.04)' }}>
          <div className="h-full rounded-full" style={{
            width: `${lvlPct}%`,
            background: `linear-gradient(90deg, ${K.copper}, ${K.xp})`,
            transition: 'width .5s cubic-bezier(.4,0,.2,1)',
          }} />
        </div>
        <div className="flex justify-between mt-0.5">
          <span className="text-micro font-mono" style={{ color: K.muted }}>{fmt(xpIntoLevel)}</span>
          <span className="text-micro font-mono" style={{ color: K.muted }}>{fmt(xpNeededForNext)}</span>
        </div>
      </div>

      {/* ── Instrument shelf ── */}
      <div className="px-4 pt-1 relative">
        <InstrumentShelf
          currentInstrument={currentInstrument}
          activeInstruments={activeInstruments}
          onInstrumentClick={(id) => { setFocusInstrument(id); setShowTools(true) }}
        />
      </div>

      {/* ── Active cooking (always visible) ── */}
      <div className="px-4 pt-3">
        <AnimatePresence>
          {(activeJob || queue.length > 0) && <CookingStation onCancel={handleCancel} />}
        </AnimatePresence>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex gap-1 px-4 mt-3">
        {([
          { id: 'recipes' as CookingTab, label: 'Recipes', icon: '📋' },
          { id: 'cauldron' as CookingTab, label: 'Cauldron', icon: '🫕' },
          { id: 'cookbook' as CookingTab, label: 'Cookbook', icon: '📖' },
        ]).map((tab) => (
          <button key={tab.id}
            onClick={() => { setActiveTab(tab.id); playClickSound() }}
            className="flex-1 py-2 rounded text-caption font-bold transition-all flex items-center justify-center gap-1"
            style={{
              background: activeTab === tab.id ? `${K.copper}18` : K.hearth,
              color: activeTab === tab.id ? K.copper : K.muted,
              border: `1px solid ${activeTab === tab.id ? `${K.copper}30` : K.faint}`,
            }}
          >
            <span>{tab.icon}</span> {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      {activeTab === 'recipes' && (
        <>
          <div className="mt-4 space-y-4">
            {groups.map((g) => {
              const rarTheme = getRarityTheme(g.rarity as 'common')
              return (
                <div key={g.label}>
                  <div className="flex items-center gap-2 px-4 mb-2">
                    <div className="w-1 h-3.5 rounded-full" style={{ background: rarTheme.color }} />
                    <span className="text-xs font-bold uppercase tracking-wide" style={{ color: rarTheme.color }}>{g.label}</span>
                    <div className="flex-1 h-px" style={{ background: `${rarTheme.color}12` }} />
                    <span className="text-micro font-mono" style={{ color: K.muted }}>
                      {g.recipes.filter((r) => chefLvl >= r.chefLevelRequired).length}/{g.recipes.length}
                    </span>
                  </div>
                  <div className="space-y-1.5 px-4">
                    {g.recipes.map((r) => (
                      <DishCard key={r.id} recipe={r} chefLevel={chefLvl} items={items}
                        unlockedInstruments={unlockedInstruments}
                        instrumentTiers={instrumentTiers}
                        isCooking={activeJob?.recipeId === r.id}
                        isDiscovered={r.id in discoveredRecipes}
                        onSelect={() => { playClickSound(); setSelRecipe(r) }} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          {/* Empty state hint for beginners */}
          {chefLvl === 0 && !activeJob && groups.every((g) => g.recipes.every((r) => !canAffordCookRecipe(r, 1, items))) && (
            <div className="mx-4 mt-3 p-3 rounded text-center"
              style={{ background: `${K.copper}08`, border: `1px solid ${K.copper}15` }}>
              <p className="text-caption" style={{ color: K.copper }}>
                Start by growing Wheat on the Farm, then come back to bake Bread!
              </p>
            </div>
          )}
          {/* Cauldron nudge */}
          {chefLvl >= 1 && discoveredCount === 0
            && !localStorage.getItem('grindly_cauldron_hinted') && (
            <div className="mx-4 mt-3 p-3 rounded text-center kv-pulse relative"
              style={{ background: `${K.copper}08`, border: `1px solid ${K.copper}15` }}>
              <button onClick={() => { localStorage.setItem('grindly_cauldron_hinted', '1'); setActiveTab('cauldron') }}
                className="absolute top-1 right-2 text-micro" style={{ color: K.muted }}>dismiss</button>
              <p className="text-caption" style={{ color: K.copper }}>
                Try the Cauldron tab to discover secret recipes!
              </p>
            </div>
          )}
          {(() => {
            const next = COOKING_RECIPES.filter((r) => r.chefLevelRequired > chefLvl)
              .sort((a, b) => a.chefLevelRequired - b.chefLevelRequired)[0]
            if (!next) return null
            const out = FOOD_ITEM_MAP[next.outputItemId]
            if (!out) return null
            return (
              <p className="text-center text-micro pt-3 px-4" style={{ color: K.muted }}>
                Next: {out.icon} <span style={{ color: K.cream }}>{out.name}</span> at Cooking Level {next.chefLevelRequired}
              </p>
            )
          })()}
        </>
      )}

      {activeTab === 'cauldron' && (
        <Cauldron items={items}
          onConsume={(id, n) => deleteItem(id, n)}
          onGrant={(id, n) => addItem(id, n)}
          onRecipeFound={(recipeId) => {
            const r = COOKING_RECIPE_MAP[recipeId]
            if (r) setSelRecipe(r)
          }} />
      )}

      {activeTab === 'cookbook' && (
        <Cookbook chefLevel={chefLvl} />
      )}

      <AnimatePresence>
        {selRecipe && (
          <CookModal recipe={selRecipe} chefLevel={chefLvl} items={items}
            instrumentTiers={instrumentTiers}
            onClose={() => setSelRecipe(null)} onStart={handleStart} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showTools && (
          <ToolsPanel chefLevel={chefLvl}
            onClose={() => { setShowTools(false); setFocusInstrument(null) }}
            focusId={focusInstrument} />
        )}
      </AnimatePresence>

      {/* ── Completion banner ── */}
      <AnimatePresence>
        {completionBanner && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-20 left-4 right-4 z-[90] rounded overflow-hidden"
            style={{
              background: K.surface,
              border: `1px solid ${completionBanner.rarity === 'legendary' || completionBanner.rarity === 'mythic'
                ? `${K.xp}40` : completionBanner.rarity === 'epic' ? `${K.indigo}30` : K.faint}`,
              boxShadow: completionBanner.rarity === 'legendary' || completionBanner.rarity === 'mythic'
                ? `0 0 24px ${K.xp}20` : '0 8px 24px rgba(0,0,0,.4)',
            }}
            ref={completionBannerRef}
            onClick={() => setCompletionBanner(null)}
          >
            {(completionBanner.rarity === 'epic' || completionBanner.rarity === 'legendary' || completionBanner.rarity === 'mythic') && (
              <div className="absolute inset-0 pointer-events-none rounded"
                style={{ background: `radial-gradient(circle at 30% 50%, ${K.xp}08, transparent 60%)` }} />
            )}
            <div className="p-3 flex items-center gap-3 relative">
              <div className="text-3xl shrink-0">{completionBanner.icon}</div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold" style={{ color: K.cream }}>
                  {completionBanner.name} x{completionBanner.qty}
                </p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {completionBanner.burned > 0 && (
                    <span className="text-micro font-bold" style={{ color: K.warn }}>{completionBanner.burned} burned</span>
                  )}
                  {completionBanner.bonus > 0 && (
                    <span className="text-micro font-bold" style={{ color: K.indigo }}>+{completionBanner.bonus} bonus</span>
                  )}
                  <span className="text-micro font-bold" style={{ color: K.xp }}>+{fmt(completionBanner.xp)} XP</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Welcome onboarding ── */}
      <AnimatePresence>
        {showWelcome && (
          <>
            <motion.div className="fixed inset-0 z-[200] bg-black/70"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="fixed inset-0 z-[201] flex items-center justify-center p-6"
            >
              <div className="w-full max-w-[280px] rounded p-5 text-center"
                style={{ background: K.surface, border: `1px solid ${K.copper}30`, boxShadow: `0 0 40px ${K.copper}15` }}>
                <div className="text-4xl mb-2">🧑‍🍳</div>
                <h2 className="text-base font-bold mb-3" style={{ color: K.cream }}>Welcome to Cooking!</h2>
                <p className="text-micro mb-4" style={{ color: K.muted }}>
                  Cook food to heal and gain combat buffs in the Arena.
                </p>

                <div className="space-y-2 mb-4 text-left">
                  <div className="rounded p-2.5 flex items-start gap-2.5"
                    style={{ background: K.hearth, border: `1px solid ${K.faint}` }}>
                    <span className="text-base shrink-0">📋</span>
                    <div>
                      <div className="text-caption font-bold" style={{ color: K.cream }}>Recipes</div>
                      <p className="text-micro mt-0.5" style={{ color: K.muted }}>
                        Pick a dish and cook it. Each recipe has multi-step process — chop, boil, bake.
                      </p>
                    </div>
                  </div>
                  <div className="rounded p-2.5 flex items-start gap-2.5"
                    style={{ background: K.hearth, border: `1px solid ${K.faint}` }}>
                    <span className="text-base shrink-0">🫕</span>
                    <div>
                      <div className="text-caption font-bold" style={{ color: K.cream }}>Cauldron</div>
                      <p className="text-micro mt-0.5" style={{ color: K.muted }}>
                        Throw in ingredients to discover new secret recipes.
                      </p>
                    </div>
                  </div>
                  <div className="rounded p-2.5 flex items-start gap-2.5"
                    style={{ background: K.hearth, border: `1px solid ${K.faint}` }}>
                    <span className="text-base shrink-0">📖</span>
                    <div>
                      <div className="text-caption font-bold" style={{ color: K.cream }}>Cookbook</div>
                      <p className="text-micro mt-0.5" style={{ color: K.muted }}>
                        Track discovered recipes and earn mastery stars for bonus effects.
                      </p>
                    </div>
                  </div>
                </div>

                <p className="text-micro mb-4" style={{ color: `${K.muted}90` }}>
                  Ingredients come from the <span style={{ color: K.cream }}>Farm</span> (crops) and <span style={{ color: K.cream }}>Arena</span> (mob drops).
                </p>

                <button onClick={() => { setShowWelcome(false); localStorage.setItem('grindly_kitchen_welcomed', '1'); playClickSound() }}
                  className="w-full py-2.5 rounded text-body font-bold"
                  style={{ color: '#000', background: 'linear-gradient(135deg, #00FF88, #00CC66)' }}>
                  Got it!
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Help guide ── */}
      <AnimatePresence>
        {showGuide && (
          <>
            <motion.div className="fixed inset-0 z-[100] bg-black/65"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowGuide(false)} />
            <motion.div
              className="fixed bottom-0 left-0 right-0 z-[101] rounded-t-2xl"
              style={{ background: K.surface, borderTop: `1px solid ${K.faint}` }}
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 32, stiffness: 340 }}
            >
              <div className="p-4 pb-8 max-h-[75vh] overflow-y-auto">
                <div className="flex justify-center mb-3"><div className="w-10 h-1 rounded-full" style={{ background: K.faint }} /></div>
                <h3 className="text-sm font-bold mb-4" style={{ color: K.cream }}>Cooking Guide</h3>
                <CookingGuideContent />
                <button onClick={() => setShowGuide(false)}
                  className="mt-4 w-full py-2 rounded text-caption font-bold"
                  style={{ background: K.hearth, color: K.cream, border: `1px solid ${K.faint}` }}>Close</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
