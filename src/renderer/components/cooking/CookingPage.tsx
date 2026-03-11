import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  COOKING_RECIPES,
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
import {
  playClickSound,
  playLootRaritySound,
  playCookSoundForInstrument,
} from '../../lib/sounds'
import { BackpackButton } from '../shared/BackpackButton'
import { InventoryPage } from '../inventory/InventoryPage'
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

// ── CSS ──────────────────────────────────────────────────────────────────────
const STYLE_ID = 'kitchen-v12-css'
function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return
  for (let i = 4; i <= 11; i++) document.getElementById(`kitchen-v${i}-css`)?.remove()
  const s = document.createElement('style')
  s.id = STYLE_ID
  s.textContent = `
    .kv-scroll { -ms-overflow-style:none; scrollbar-width:none; }
    .kv-scroll::-webkit-scrollbar { display:none; }

    /* Ember rise particles from active cooking */
    .kv-ember-rise { animation: kv-ember-rise var(--dur,2s) ease-out infinite; }
    @keyframes kv-ember-rise {
      0%   { transform: translateY(0) scale(1); opacity: 0; }
      15%  { opacity: .6; }
      100% { transform: translateY(-40px) scale(.2); opacity: 0; }
    }

    /* Molten flow through connectors */
    .kv-flow { animation: kv-flow 1.5s linear infinite; }
    @keyframes kv-flow {
      0%   { background-position: 0% 50%; }
      100% { background-position: 200% 50%; }
    }

    /* Ember pulse glow for active instrument */
    .ember-pulse { animation: ember-pulse 1.8s ease-in-out infinite; }
    @keyframes ember-pulse {
      0%,100% { box-shadow: 0 0 0 0 rgba(194,120,64,0); }
      50% { box-shadow: 0 0 12px 3px rgba(194,120,64,.25); }
    }

    /* Active action icon bounce */
    .kv-action-bounce { animation: kv-action-bounce .6s ease-in-out infinite; }
    @keyframes kv-action-bounce {
      0%,100% { transform: translateY(0) rotate(0deg); }
      25% { transform: translateY(-4px) rotate(-8deg); }
      75% { transform: translateY(-4px) rotate(8deg); }
    }

    /* Ring progress */
    .kv-ring-bg { stroke: rgba(255,255,255,.06); }
    .kv-ring-fg { stroke: url(#kv-pipe-grad); stroke-linecap: round; filter: drop-shadow(0 0 4px rgba(194,120,64,.4)); transition: none; }

    .kv-ripple {
      position: absolute; border-radius: 50%;
      background: radial-gradient(circle, rgba(194,120,64,.2) 0%, transparent 70%);
      transform: scale(0); animation: kv-ripple-go .5s ease-out forwards;
      pointer-events: none;
    }
    @keyframes kv-ripple-go { to { transform: scale(2.5); opacity: 0; } }
  `
  document.head.appendChild(s)
}

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


// ══════════════════════════════════════════════════════════════════════════════
// ── COOKING STATION — big centered current action + step progress below ─────
// ══════════════════════════════════════════════════════════════════════════════

function CookingStation({ onCancel }: { onCancel: (id: string) => void }) {
  const activeJob = useCookingStore((s) => s.activeJob)
  const lastRoll = useCookingStore((s) => s.lastRoll)

  const [timer, setTimer] = useState('--')
  const ringRef = useRef<SVGCircleElement>(null)
  const prevDoneRef = useRef(0)
  const [itemPop, setItemPop] = useState(0)

  useEffect(() => { ensureStyles() }, [])

  useEffect(() => {
    if (!activeJob) { prevDoneRef.current = 0; return }
    if (activeJob.doneQty > prevDoneRef.current && prevDoneRef.current > 0) setItemPop((n) => n + 1)
    prevDoneRef.current = activeJob.doneQty
  }, [activeJob?.doneQty, activeJob?.id])

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
      className="rounded-2xl relative overflow-visible"
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
            <svg viewBox="0 0 120 120" className="absolute inset-0" style={{ transform: 'rotate(-90deg)' }}>
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
          <p className="text-[14px] font-bold mt-2" style={{ color: K.cream }}>{currentStep.label}</p>
          <p className="text-[20px] font-mono font-bold" style={{ color: K.copper }}>{timer}</p>
        </div>

        {/* ── Info row: dish + count + xp ── */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <motion.span key={itemPop} className="text-lg"
              initial={itemPop > 0 ? { scale: 1.4 } : false}
              animate={{ scale: 1 }}>{output?.icon ?? '🍳'}</motion.span>
            <div>
              <p className="text-[12px] font-bold" style={{ color: K.cream }}>{output?.name ?? 'Cooking'}</p>
              <p className="text-[10px]" style={{ color: K.muted }}>
                Item {done + 1} of {activeJob.totalQty}
                <span className="ml-2" style={{ color: K.xp }}>+{(done * activeJob.xpPerItem).toLocaleString()} XP</span>
              </p>
            </div>
          </div>
          <button type="button" onClick={() => { playClickSound(); onCancel(activeJob.id) }}
            className="text-[10px] px-3 py-1.5 rounded-lg" style={{ color: K.muted, border: `1px solid ${K.faint}` }}>Cancel</button>
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
          <p className="text-[9px] text-center mt-2" style={{ color: K.muted }}>
            {lastRoll.burned > 0 && <span style={{ color: K.warn }}>Last item burned! </span>}
            {lastRoll.bonus > 0 && <span style={{ color: K.indigo }}>Bonus output! </span>}
          </p>
        )}
      </div>
    </motion.div>
  )
}


// ══════════════════════════════════════════════════════════════════════════════
// ── DISH CARD — clear readable ingredients and stats ────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function DishCard({
  recipe, chefLevel, items, unlockedInstruments, instrumentTiers, isCooking, onSelect,
}: {
  recipe: CookingRecipe; chefLevel: number; items: Record<string, number>
  unlockedInstruments: CookInstrumentId[]; instrumentTiers: Record<CookInstrumentId, number>
  isCooking: boolean; onSelect: () => void
}) {
  const output = FOOD_ITEM_MAP[recipe.outputItemId]
  if (!output) return null

  const theme = getRarityTheme(output.rarity)
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
      className="relative rounded-xl text-left overflow-hidden"
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
        <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-wider"
          style={{ background: `${K.copper}20`, color: K.copper, border: `1px solid ${K.copper}30` }}>
          Cooking
        </div>
      )}

      <div className="p-3 relative">
        <div className="flex items-start gap-3">
          {/* Dish icon */}
          <div className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl shrink-0"
            style={{
              background: !locked ? `${theme.glow}0a` : 'rgba(255,255,255,.02)',
              border: `1px solid ${!locked ? `${theme.border}20` : 'rgba(255,255,255,.04)'}`,
            }}>
            {output.icon}
          </div>

          <div className="flex-1 min-w-0">
            {/* Name + rarity */}
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[12px] font-bold truncate" style={{ color: K.cream }}>{output.name}</span>
              <span className="text-[9px] font-semibold uppercase" style={{ color: theme.color }}>{output.rarity}</span>
              {owned > 0 && (
                <span className="text-[9px] font-mono px-1 py-0.5 rounded shrink-0"
                  style={{ color: K.muted, background: 'rgba(255,255,255,.03)' }}>x{owned}</span>
              )}
            </div>

            {/* Effect tags */}
            {!locked && (
              <div className="flex flex-wrap gap-1 mb-1.5">
                {output.effect.heal && <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded" style={{ color: K.ready, background: `${K.ready}0a` }}>+{output.effect.heal} HP</span>}
                {output.effect.buffAtk && <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded" style={{ color: K.warn, background: `${K.warn}0a` }}>+{output.effect.buffAtk} ATK</span>}
                {output.effect.buffDef && <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded" style={{ color: K.indigo, background: `${K.indigo}0a` }}>+{output.effect.buffDef} DEF</span>}
                {output.effect.buffRegen && <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded" style={{ color: '#22d3ee', background: 'rgba(34,211,238,.04)' }}>+{output.effect.buffRegen} Regen</span>}
              </div>
            )}

            {/* Ingredients — clear: "3x Wheat, 2x Herbs" */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-1">
              {recipe.ingredients.map((ing) => {
                const def = getItemDef(ing.id)
                const have = items[ing.id] ?? 0
                const enough = have >= ing.qty
                return (
                  <span key={ing.id} className="text-[9px] flex items-center gap-0.5"
                    style={{ color: enough ? `${K.ready}cc` : `${K.warn}cc` }}>
                    {def?.icon} <span className="font-medium">{ing.qty}x {def?.name ?? ing.id}</span>
                    <span className="font-mono text-[8px]" style={{ color: K.muted }}>({have})</span>
                  </span>
                )
              })}
            </div>

            {/* Bottom row: time, steps, burn chance, quality */}
            <div className="flex items-center gap-3 text-[9px]" style={{ color: K.muted }}>
              {!locked && (
                <>
                  <span>{formatCookTime(totalTime)}</span>
                  <span>{recipe.steps.length} steps</span>
                  <span style={{ color: K.xp }}>{recipe.xpPerItem} XP</span>
                  {burnPct > 0 && <span style={{ color: K.warn }}>Burn {burnPct}%</span>}
                  {qualPct > 0 && <span style={{ color: K.indigo }}>Bonus {qualPct}%</span>}
                </>
              )}
              {canCook1 && (
                <div className="w-1.5 h-1.5 rounded-full ml-auto shrink-0" style={{ background: `${K.ready}60` }} />
              )}
              {lvlLocked && (
                <span className="font-mono ml-auto" style={{ color: K.warn }}>Chef Lvl {recipe.chefLevelRequired}</span>
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
      <motion.div className="fixed inset-0 z-[100] bg-black/65"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} />
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-[101] rounded-t-2xl"
        style={{ background: K.surface, borderTop: `1px solid ${K.faint}` }}
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 340 }}
      >
        {/* Scrollable content */}
        <div className="px-4 pt-4 pb-2 max-h-[52vh] overflow-y-auto">
          <div className="flex justify-center mb-3"><div className="w-10 h-1 rounded-full" style={{ background: K.faint }} /></div>

          {/* Header */}
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-3xl shrink-0"
              style={{ background: `${theme.glow}0c`, border: `1.5px solid ${theme.border}25` }}>
              {output.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-bold" style={{ color: K.cream }}>{output.name}</p>
              <div className="flex gap-1 mt-1 flex-wrap">
                {fx.heal && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ color: K.ready, background: `${K.ready}0c` }}>+{fx.heal} HP</span>}
                {fx.buffAtk && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ color: K.warn, background: `${K.warn}0c` }}>+{fx.buffAtk} ATK</span>}
                {fx.buffDef && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ color: K.indigo, background: `${K.indigo}0c` }}>+{fx.buffDef} DEF</span>}
                {fx.buffRegen && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ color: '#22d3ee', background: 'rgba(34,211,238,.06)' }}>+{fx.buffRegen} Regen</span>}
                {fx.buffDurationSec && (fx.buffAtk || fx.buffDef || fx.buffRegen) && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ color: K.muted, background: 'rgba(255,255,255,.03)' }}>for {fx.buffDurationSec}s</span>
                )}
              </div>
            </div>
          </div>

          {/* Ingredients — compact row */}
          <div className="mb-3">
            <p className="text-[9px] uppercase tracking-wider mb-1" style={{ color: K.muted }}>Ingredients (x{qty})</p>
            <div className="flex gap-1.5 flex-wrap">
              {recipe.ingredients.map((ing) => {
                const def = getItemDef(ing.id)
                const own = items[ing.id] ?? 0
                const need = ing.qty * qty
                const ok = own >= need
                return (
                  <div key={ing.id} className="flex items-center gap-1.5 rounded-lg px-2 py-1"
                    style={{ background: `${ok ? K.ready : K.warn}06`, border: `1px solid ${ok ? K.ready : K.warn}12` }}>
                    <ItemIcon item={def} size="sm" />
                    <span className="text-[10px]" style={{ color: K.cream }}>{def?.name ?? ing.id}</span>
                    <span className="text-[10px] font-mono" style={{ color: ok ? K.ready : K.warn }}>{own}/{need}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Steps — inline */}
          <div className="mb-3">
            <p className="text-[9px] uppercase tracking-wider mb-1" style={{ color: K.muted }}>
              {recipe.steps.length} steps
            </p>
            <div className="flex items-center gap-1 flex-wrap">
              {recipe.steps.map((st, i) => {
                const stepDur = cookStepDuration(st, chefLevel, grindlyMult, instrumentTiers)
                return (
                  <div key={i} className="flex items-center gap-1">
                    {i > 0 && <span className="text-[8px]" style={{ color: K.faint }}>›</span>}
                    <div className="flex items-center gap-1 rounded-md px-1.5 py-0.5"
                      style={{ background: `${K.copper}06`, border: `1px solid ${K.copper}0c` }}>
                      <span className="text-xs">{st.icon}</span>
                      <span className="text-[8px]" style={{ color: K.cream }}>{st.label}</span>
                      <span className="text-[8px] font-mono" style={{ color: K.copper }}>{formatCookTime(stepDur)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Qty */}
          <div>
            <p className="text-[9px] uppercase tracking-wider mb-1" style={{ color: K.muted }}>Quantity</p>
            <div className="flex gap-1.5 flex-wrap items-center">
              {QTY_PRESETS.map((p) => (
                <button key={p} type="button" onClick={() => setQty(p)}
                  className="text-[11px] font-mono px-2.5 py-1 rounded-lg border transition-colors"
                  style={qty === p
                    ? { borderColor: `${K.copper}60`, background: `${K.copper}18`, color: K.copper }
                    : { borderColor: K.faint, color: K.muted }}>{p}</button>
              ))}
              <button type="button"
                onClick={() => { if (max > 0) setQty(max) }}
                className="text-[11px] font-mono px-2.5 py-1 rounded-lg border transition-colors"
                style={max <= 0
                  ? { borderColor: `${K.faint}60`, color: `${K.muted}40`, cursor: 'not-allowed' }
                  : qty === max
                    ? { borderColor: `${K.copper}60`, background: `${K.copper}18`, color: K.copper }
                    : { borderColor: K.faint, color: K.muted }}>
                Max{max > 0 ? ` (${max})` : ''}
              </button>
              <input type="number" min={1} value={qty}
                onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-14 text-[11px] font-mono px-2 py-1 rounded-lg text-center focus:outline-none transition-colors"
                style={{ background: 'rgba(255,255,255,.02)', border: `1px solid ${K.faint}`, color: K.cream }} />
            </div>
          </div>
        </div>

        {/* Pinned footer — always visible */}
        <div className="px-4 py-3 pb-6 flex items-center justify-between gap-3"
          style={{ borderTop: `1px solid ${K.faint}`, background: K.surface }}>
          <div className="text-[10px] space-y-0.5" style={{ color: K.muted }}>
            <p>Time: <span style={{ color: K.cream }}>{formatCookTime(duration)}</span> · XP: <span style={{ color: K.xp }}>{(qty * recipe.xpPerItem).toLocaleString()}</span></p>
            <div className="flex items-center gap-3">
              {burnPct > 0 && <span style={{ color: K.warn }}>Burn {burnPct}%</span>}
              {qualPct > 0 && <span style={{ color: K.indigo }}>Bonus {qualPct}%</span>}
            </div>
          </div>
          <motion.button type="button"
            whileTap={canStart ? { scale: .93 } : {}}
            onClick={(e) => { if (canStart) { spawnRipple(e); playClickSound(); onStart(recipe, qty) } }}
            className="px-7 py-2.5 rounded-xl text-[14px] font-bold relative overflow-hidden shrink-0"
            style={canStart
              ? { color: '#fff', background: `linear-gradient(135deg, ${K.copper}, ${K.clay})`,
                  boxShadow: `0 4px 20px ${K.copper}20` }
              : { color: `${K.muted}60`, border: `1px solid ${K.faint}`, background: 'rgba(255,255,255,.01)' }}>
            <span className="relative">{canStart ? 'Cook!' : 'Need more'}</span>
          </motion.button>
        </div>
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
            <p className="text-[14px] font-bold" style={{ color: K.cream }}>Kitchen Tools</p>
            <span className="text-[10px] font-mono px-2 py-1 rounded-lg"
              style={{ color: K.xp, background: `${K.xp}08` }}>
              {gold.toLocaleString()} gold
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
                  className="rounded-xl px-3 py-2.5"
                  style={{
                    background: isFocused ? `${K.copper}08` : 'rgba(255,255,255,.01)',
                    border: `1px solid ${isFocused ? `${K.copper}18` : K.faint}`,
                    opacity: lvlLock ? .3 : 1,
                  }}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                      style={{
                        background: isLocked ? 'rgba(255,255,255,.01)' : `${TIER_C[tier]}0a`,
                        border: `1px solid ${isLocked ? K.faint : `${TIER_C[tier]}20`}`,
                      }}>
                      {isLocked ? '🔒' : td.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold" style={{ color: K.cream }}>{inst.name}</span>
                        {!isLocked && (
                          <span className="text-[8px] font-mono px-1 py-0.5 rounded"
                            style={{ color: TIER_C[tier], background: `${TIER_C[tier]}0c` }}>{td.name}</span>
                        )}
                      </div>
                      {isLocked ? (
                        <p className="text-[9px] mt-0.5" style={{ color: K.muted }}>Requires Chef Level {inst.unlockLevel}</p>
                      ) : (
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap text-[8px]">
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
                        className="shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-bold"
                        style={canUL ? { color: K.xp, background: `${K.xp}0c`, border: `1px solid ${K.xp}18` }
                          : { color: `${K.muted}60`, background: 'rgba(255,255,255,.01)', border: `1px solid ${K.faint}` }}>
                        {lvlLock ? `Lvl ${inst.unlockLevel}` : `${inst.unlockCost.toLocaleString()}g`}
                      </button>
                    ) : maxed ? (
                      <span className="text-[9px] font-mono px-2" style={{ color: K.muted }}>MAX</span>
                    ) : (
                      <button type="button"
                        onClick={() => { if (canUP) { playClickSound(); upgradeInstrument(inst.id, gold, spend) } }}
                        className="shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-bold"
                        style={canUP ? { color: K.xp, background: `${K.xp}0c`, border: `1px solid ${K.xp}18` }
                          : { color: `${K.muted}60`, background: 'rgba(255,255,255,.01)', border: `1px solid ${K.faint}` }}>
                        {next!.cost.toLocaleString()}g
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
    <div className="relative rounded-xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,.02)', border: `1px solid ${K.faint}` }}>
      <div className="absolute bottom-0 left-0 right-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, rgba(255,255,255,.06), transparent)` }} />
      <div className="flex items-center justify-between py-2 px-2">
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
                transition: 'opacity .3s, transform .3s',
                transform: isCurrentStep && isCooking ? 'translateY(-2px)' : 'translateY(0)',
                borderRadius: 10,
              }}
            >
              <div className="flex items-center justify-center rounded-lg"
                style={{
                  width: 34, height: 34,
                  background: isCurrentStep && isCooking
                    ? `radial-gradient(circle, ${K.copper}25 0%, transparent 70%)`
                    : 'transparent',
                  fontSize: 18,
                }}>
                {isLocked ? '🔒' : td.icon}
              </div>
              <span className="text-[8px] mt-0.5" style={{
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

function Cauldron({ items, onConsume }: {
  items: Record<string, number>
  onConsume: (id: string, qty: number) => void
}) {
  const [slots, setSlots] = useState<string[]>(mkSlots)
  const [pickingSlot, setPickingSlot] = useState<number | null>(null)
  const [result, setResult] = useState<DiscoveryResult | null>(null)
  const [shake, setShake] = useState(false)
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
    if (res === 'not_enough') return
    setResult(res)
    if (res.type === 'mystery_stew') {
      setShake(true)
      setTimeout(() => setShake(false), 600)
    } else {
      playLootRaritySound(res.type === 'discovered' ? 'legendary' : 'common')
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
        <p className="text-[10px]" style={{ color: K.muted }}>
          Pick ingredients — the cauldron figures out the amounts
        </p>
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
                className="w-[56px] h-[56px] rounded-xl flex items-center justify-center transition-all shrink-0 relative"
                style={{
                  background: id ? K.surface : K.hearth,
                  border: `1.5px ${isActive ? 'solid' : id ? 'solid' : 'dashed'} ${isActive ? K.copper : id ? K.faint : `${K.muted}40`}`,
                  boxShadow: isActive ? `0 0 10px ${K.copper}30` : 'none',
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
              <span className="text-[8px] mt-1 truncate w-full text-center leading-tight"
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
          className="px-5 py-2 rounded-xl text-[12px] font-bold transition-all"
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
                <span className="text-[12px] font-bold" style={{ color: K.cream }}>
                  Pick ingredient
                </span>
                <button onClick={() => setPickingSlot(null)}
                  className="text-[10px] px-2 py-0.5 rounded"
                  style={{ background: K.hearth, color: K.muted }}>
                  Cancel
                </button>
              </div>
              {availableIngredients.length === 0 ? (
                <p className="text-[11px] py-6 text-center" style={{ color: K.muted }}>
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
                        className="flex flex-col items-center p-2 rounded-xl transition-colors"
                        style={{
                          background: K.hearth,
                          border: `1px solid ${alreadyUsed ? `${K.faint}40` : `${theme.border}18`}`,
                          opacity: alreadyUsed ? 0.35 : 1,
                        }}
                      >
                        <div className="w-9 h-9 flex items-center justify-center mb-1">
                          <ItemIcon item={item} size="lg" />
                        </div>
                        <span className="text-[9px] font-medium truncate w-full text-center leading-tight"
                          style={{ color: K.cream }}>{item.name}</span>
                        <span className="text-[8px] font-mono" style={{ color: K.muted }}>×{items[item.id] ?? 0}</span>
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
            <motion.div
              initial={{ scale: 0.85, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.85, opacity: 0 }}
              className="w-full max-w-[260px] rounded-2xl overflow-hidden"
              style={{
                background: K.surface,
                border: `1px solid ${result.type === 'discovered' ? K.copper : result.type === 'mystery_stew' ? `${K.warn}40` : K.faint}`,
                boxShadow: result.type === 'discovered' ? `0 0 40px ${K.copper}20` : '0 8px 30px rgba(0,0,0,.5)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Top accent */}
              <div className="h-1" style={{
                background: result.type === 'discovered' ? K.copper :
                             result.type === 'mystery_stew' ? K.warn : K.faint,
              }} />
              <div className="p-5 text-center">
                <div className="text-4xl mb-2">{result.foodIcon}</div>
                <div className="text-[13px] font-bold mb-0.5" style={{
                  color: result.type === 'discovered' ? K.xp : result.type === 'mystery_stew' ? K.warn : K.cream,
                }}>
                  {result.type === 'discovered' ? 'New Recipe Discovered!' :
                   result.type === 'mystery_stew' ? 'Mystery Stew...' : 'Cooking started!'}
                </div>
                <div className="text-[11px] mb-1" style={{ color: K.cream }}>{result.foodName}</div>
                <div className="text-[10px] font-mono" style={{ color: K.xp }}>+{result.xpGained} XP</div>
                {result.type === 'mystery_stew' && (
                  <p className="text-[9px] mt-2" style={{ color: K.muted }}>
                    Wrong combination — try different ingredients!
                  </p>
                )}
                {result.type === 'discovered' && (
                  <p className="text-[9px] mt-2" style={{ color: K.copper }}>
                    Recipe added to your Cookbook!
                  </p>
                )}
                <button onClick={() => setResult(null)}
                  className="mt-3 w-full py-1.5 rounded-lg text-[10px] font-bold"
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
        <span key={i} className="text-[9px]" style={{ color: i < stars ? '#e2b052' : '#2a2a3a', textShadow: i < stars ? '0 0 4px rgba(226,176,82,.3)' : 'none' }}>★</span>
      ))}
    </span>
  )
}

function Cookbook({ chefLevel }: { chefLevel: number }) {
  const discoveredRecipes = useCookingStore((s) => s.discoveredRecipes)
  const [selectedRecipe, setSelectedRecipe] = useState<CookingRecipe | null>(null)

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
      <div className="flex items-center gap-3 mb-4 rounded-xl p-3"
        style={{ background: K.surface, border: `1px solid ${K.faint}` }}>
        <div className="text-3xl shrink-0">📖</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12px] font-bold" style={{ color: K.cream }}>Cookbook</span>
            <span className="text-[10px] font-mono" style={{ color: K.copper }}>
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
              <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: rarTheme.color }}>
                {g.label}
              </span>
              <div className="flex-1 h-px" style={{ background: `${rarTheme.color}12` }} />
              <span className="text-[9px] font-mono" style={{ color: K.muted }}>
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
                    className="rounded-xl text-left transition-all overflow-hidden"
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
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                        style={{
                          background: isFound ? `${rarTheme.color}08` : 'rgba(255,255,255,.02)',
                          border: `1px solid ${isFound ? `${rarTheme.color}15` : 'rgba(255,255,255,.03)'}`,
                        }}>
                        <span className="text-lg">{isFound ? (food?.icon ?? '?') : '❓'}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-semibold truncate leading-tight"
                          style={{ color: isFound ? K.cream : K.muted }}>
                          {isFound ? (food?.name ?? '???') : '???'}
                        </div>
                        <div className="mt-0.5">
                          {isFound ? (
                            <StarDisplay stars={stars} />
                          ) : (
                            <span className="text-[8px] italic" style={{ color: `${K.muted}80` }}>Undiscovered</span>
                          )}
                        </div>
                        {isFound && nextStarIn > 0 && (
                          <div className="text-[8px] mt-0.5 font-mono" style={{ color: `${K.muted}90` }}>
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
              className="w-full max-w-xs rounded-2xl overflow-hidden"
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
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-3xl shrink-0"
                          style={{
                            background: isFound ? `${rarTheme.color}0a` : 'rgba(255,255,255,.02)',
                            border: `1px solid ${isFound ? `${rarTheme.color}20` : K.faint}`,
                          }}>
                          {isFound ? (food?.icon ?? '?') : '❓'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[14px] font-bold truncate" style={{ color: isFound ? rarTheme.color : K.muted }}>
                            {isFound ? (food?.name ?? '???') : '???'}
                          </div>
                          {isFound && (
                            <div className="flex items-center gap-2 mt-0.5">
                              <StarDisplay stars={stars} />
                              <span className="text-[9px] font-mono" style={{ color: K.muted }}>
                                {timesCrafted}× cooked
                              </span>
                            </div>
                          )}
                          {!isFound && (
                            <span className="text-[10px] uppercase tracking-wide" style={{ color: rarTheme.color }}>
                              {food?.rarity ?? 'common'}
                            </span>
                          )}
                        </div>
                      </div>

                      {isFound ? (
                        <div className="space-y-3">
                          {/* Ingredients */}
                          <div className="rounded-lg p-2.5" style={{ background: K.hearth }}>
                            <div className="text-[9px] font-bold uppercase tracking-wide mb-1.5" style={{ color: K.copper }}>Ingredients</div>
                            <div className="space-y-1">
                              {selectedRecipe.ingredients.map((ing) => {
                                const iDef = getItemDef(ing.id)
                                return (
                                  <div key={ing.id} className="flex items-center gap-2">
                                    <div className="w-5 h-5 flex items-center justify-center shrink-0">
                                      <ItemIcon item={iDef} size="sm" />
                                    </div>
                                    <span className="text-[10px] font-medium" style={{ color: K.cream }}>{iDef?.name ?? ing.id}</span>
                                    <span className="text-[9px] font-mono ml-auto" style={{ color: K.muted }}>×{ing.qty}</span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>

                          {/* Food effect */}
                          {food?.effect && (
                            <div className="rounded-lg p-2.5" style={{ background: K.hearth }}>
                              <div className="text-[9px] font-bold uppercase tracking-wide mb-1.5" style={{ color: K.ready }}>Effect</div>
                              <div className="flex flex-wrap gap-1.5">
                                {(food.effect.heal ?? 0) > 0 && (
                                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                                    style={{ color: K.ready, background: `${K.ready}0a` }}>
                                    +{food.effect.heal} HP
                                  </span>
                                )}
                                {(food.effect.buffAtk ?? 0) > 0 && (
                                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                                    style={{ color: K.warn, background: `${K.warn}0a` }}>
                                    +{Math.round(food.effect.buffAtk! * bonus.buffMultiplier)} ATK
                                  </span>
                                )}
                                {(food.effect.buffDef ?? 0) > 0 && (
                                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                                    style={{ color: K.indigo, background: `${K.indigo}0a` }}>
                                    +{Math.round(food.effect.buffDef! * bonus.buffMultiplier)} DEF
                                  </span>
                                )}
                                {(food.effect.buffRegen ?? 0) > 0 && (
                                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                                    style={{ color: '#22d3ee', background: 'rgba(34,211,238,.04)' }}>
                                    +{Math.round(food.effect.buffRegen! * bonus.buffMultiplier)} Regen
                                  </span>
                                )}
                                {(food.effect.buffDurationSec ?? 0) > 0 && (food.effect.buffAtk || food.effect.buffDef || food.effect.buffRegen) && (
                                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded"
                                    style={{ color: K.muted, background: 'rgba(255,255,255,.02)' }}>
                                    {food.effect.buffDurationSec}s
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Mastery bonuses */}
                          {stars >= 2 && (
                            <div className="rounded-lg p-2.5" style={{ background: K.hearth }}>
                              <div className="text-[9px] font-bold uppercase tracking-wide mb-1.5" style={{ color: K.xp }}>
                                Mastery ({stars}★)
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {bonus.buffMultiplier > 1 && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded"
                                    style={{ color: K.xp, background: `${K.xp}0a` }}>
                                    Buff +{Math.round((bonus.buffMultiplier - 1) * 100)}%
                                  </span>
                                )}
                                {bonus.ingredientSaveChance > 0 && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded"
                                    style={{ color: K.ready, background: `${K.ready}0a` }}>
                                    Save {Math.round(bonus.ingredientSaveChance * 100)}%
                                  </span>
                                )}
                                {bonus.doubleOutputChance > 0 && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded"
                                    style={{ color: K.indigo, background: `${K.indigo}0a` }}>
                                    2× {Math.round(bonus.doubleOutputChance * 100)}%
                                  </span>
                                )}
                                {bonus.xpMultiplier > 1 && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded"
                                    style={{ color: K.copper, background: `${K.copper}0a` }}>
                                    XP +{Math.round((bonus.xpMultiplier - 1) * 100)}%
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="rounded-lg p-3" style={{ background: K.hearth }}>
                          <div className="text-[9px] font-bold uppercase tracking-wide mb-1.5" style={{ color: K.copper }}>Hint</div>
                          <p className="text-[10px] italic leading-relaxed" style={{ color: K.muted }}>{hint}</p>
                          <p className="text-[9px] mt-2 leading-relaxed" style={{ color: `${K.muted}80` }}>
                            Combine the right ingredients in the Cauldron to discover this recipe.
                          </p>
                        </div>
                      )}

                      <button onClick={() => setSelectedRecipe(null)}
                        className="mt-3 w-full py-2 rounded-xl text-[11px] font-bold transition-colors"
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
// ── MAIN PAGE ───────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

export function CookingPage() {
  const { cookXp, activeJob, queue, hydrate, startCook, cancelJob, unlockedInstruments } = useCookingStore()
  const instrumentTiers = useCookingStore((s) => s.instrumentTiers)
  const items = useInventoryStore((s) => s.items)
  const deleteItem = useInventoryStore((s) => s.deleteItem)
  const addItem = useInventoryStore((s) => s.addItem)
  const [selRecipe, setSelRecipe] = useState<CookingRecipe | null>(null)
  const [showBP, setShowBP] = useState(false)
  const [showTools, setShowTools] = useState(false)
  const [focusInstrument, setFocusInstrument] = useState<CookInstrumentId | null>(null)
  const [activeTab, setActiveTab] = useState<CookingTab>('recipes')
  const stationRef = useRef<HTMLDivElement>(null)

  useEffect(() => { hydrate(); ensureStyles() }, [hydrate])

  const chefLvl = skillLevelFromXP(cookXp ?? 0)
  const xpCur = cookXp ?? 0
  const { current: xpIntoLevel, needed: xpNeededForNext } = skillXPProgress(xpCur)
  const lvlPct = xpNeededForNext > 0 ? Math.min(100, (xpIntoLevel / xpNeededForNext) * 100) : 100

  const handleStart = useCallback((recipe: CookingRecipe, qty: number) => {
    const { activeJob: cur, queue: q } = useCookingStore.getState()
    if (cur) cancelJob(cur.id, (id, n) => addItem(id, n))
    for (const j of q) cancelJob(j.id, (id, n) => addItem(id, n))
    const res = startCook(recipe.id, qty, items, (id, n) => deleteItem(id, n))
    if (res === 'ok') {
      setSelRecipe(null)
      playLootRaritySound(FOOD_ITEM_MAP[recipe.outputItemId]?.rarity ?? 'common')
      setTimeout(() => playCookSoundForInstrument(stepToInstrument(recipe.steps[0])), 200)
      setTimeout(() => stationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
      const u = useAuthStore.getState().user
      if (supabase && u) {
        const { items: ci, chests } = useInventoryStore.getState()
        const { seeds, seedZips } = useFarmStore.getState()
        syncInventoryToSupabase(ci, chests, { merge: false, seeds, seedZips }).catch(() => {})
      }
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
    <div className="pb-24 min-h-full" style={{ background: K.pageBg }}>
      <div className="absolute top-0 left-0 right-0 h-40 pointer-events-none"
        style={{ background: `radial-gradient(ellipse 80% 100% at 50% 0%, ${K.copper}04 0%, transparent 70%)` }} />

      {/* ── Header ── */}
      <div className="px-4 pt-4 pb-2 relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
              style={{ background: `${K.copper}0c`, border: `1px solid ${K.copper}18` }}>
              🍳
            </div>
            <div>
              <h1 className="text-[15px] font-bold" style={{ color: K.cream }}>Kitchen</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px]" style={{ color: K.muted }}>
                  Chef Level <span className="font-bold" style={{ color: K.copper }}>{chefLvl}</span>
                </span>
                <span className="text-[9px] font-mono" style={{ color: K.xp }}>{xpCur.toLocaleString()} XP</span>
              </div>
            </div>
          </div>
          <BackpackButton onClick={() => setShowBP(true)} />
        </div>

        <div className="mt-2.5 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,.04)' }}>
          <div className="h-full rounded-full" style={{
            width: `${lvlPct}%`,
            background: `linear-gradient(90deg, ${K.copper}, ${K.xp})`,
            transition: 'width .5s cubic-bezier(.4,0,.2,1)',
          }} />
        </div>
        <div className="flex justify-between mt-0.5">
          <span className="text-[8px] font-mono" style={{ color: K.muted }}>{xpIntoLevel.toLocaleString()}</span>
          <span className="text-[8px] font-mono" style={{ color: K.muted }}>{xpNeededForNext.toLocaleString()}</span>
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
      <div ref={stationRef} className="px-4 pt-3">
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
            className="flex-1 py-2 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1"
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
                    <span className="text-[12px] font-bold uppercase tracking-wide" style={{ color: rarTheme.color }}>{g.label}</span>
                    <div className="flex-1 h-px" style={{ background: `${rarTheme.color}12` }} />
                    <span className="text-[9px] font-mono" style={{ color: K.muted }}>
                      {g.recipes.filter((r) => chefLvl >= r.chefLevelRequired).length}/{g.recipes.length}
                    </span>
                  </div>
                  <div className="space-y-1.5 px-4">
                    {g.recipes.map((r) => (
                      <DishCard key={r.id} recipe={r} chefLevel={chefLvl} items={items}
                        unlockedInstruments={unlockedInstruments}
                        instrumentTiers={instrumentTiers}
                        isCooking={activeJob?.recipeId === r.id}
                        onSelect={() => { playClickSound(); setSelRecipe(r) }} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          {(() => {
            const next = COOKING_RECIPES.filter((r) => r.chefLevelRequired > chefLvl)
              .sort((a, b) => a.chefLevelRequired - b.chefLevelRequired)[0]
            if (!next) return null
            const out = FOOD_ITEM_MAP[next.outputItemId]
            if (!out) return null
            return (
              <p className="text-center text-[10px] pt-3 px-4" style={{ color: K.muted }}>
                Next: {out.icon} <span style={{ color: K.cream }}>{out.name}</span> at Chef Level {next.chefLevelRequired}
              </p>
            )
          })()}
        </>
      )}

      {activeTab === 'cauldron' && (
        <Cauldron items={items}
          onConsume={(id, n) => deleteItem(id, n)} />
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
    </div>
  )
}
