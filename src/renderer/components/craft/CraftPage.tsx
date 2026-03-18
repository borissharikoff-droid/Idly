import { useState, useEffect, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  CRAFT_RECIPES,
  CRAFT_ITEM_MAP,
  canAffordRecipe,
  maxAffordableQty,
  craftDuration,
  formatCraftTime,
  type CraftRecipe,
} from '../../lib/crafting'
import { getRarityTheme, LOOT_ITEMS, type LootSlot } from '../../lib/loot'
import { skillLevelFromXP, getGrindlyLevel, computeGrindlyBonuses } from '../../lib/skills'
import { useCraftingStore } from '../../stores/craftingStore'
import { useInventoryStore } from '../../stores/inventoryStore'
import { playClickSound, playLootRaritySound } from '../../lib/sounds'
import { MOTION } from '../../lib/motion'
import { PageHeader } from '../shared/PageHeader'
import { Hammer } from '../../lib/icons'
import { BackpackButton } from '../shared/BackpackButton'
import { InventoryPage } from '../inventory/InventoryPage'
import { LootVisual } from '../loot/LootUI'
import { syncInventoryToSupabase } from '../../services/supabaseSync'
import { useAuthStore } from '../../stores/authStore'
import { useGoldStore } from '../../stores/goldStore'
import { useFarmStore } from '../../stores/farmStore'
import { supabase } from '../../lib/supabase'

const CRAFT_COLOR = '#f97316'
const QTY_PRESETS = [1, 10, 50, 100, 500]

function getItemDef(id: string) {
  return LOOT_ITEMS.find((x) => x.id === id) ?? null
}

// ── Active job ────────────────────────────────────────────────────────────────

function ActiveJob({ onCancel }: { onCancel: (id: string) => void }) {
  const activeJob = useCraftingStore((s) => s.activeJob)
  const computeActiveDone = useCraftingStore((s) => s.computeActiveDone)
  const queue = useCraftingStore((s) => s.queue)
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    if (!activeJob) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [activeJob?.id])

  if (!activeJob) return null

  const output = CRAFT_ITEM_MAP[activeJob.outputItemId]
  const theme = getRarityTheme(output?.rarity ?? 'common')
  const done = computeActiveDone(now)
  // Elapsed since the anchor; done items already counted via doneQty
  const elapsedSinceAnchor = (now - activeJob.startedAt) / 1000
  const completedSinceAnchor = done - activeJob.doneQty
  const secsInCurrentItem = Math.max(0, elapsedSinceAnchor - completedSinceAnchor * activeJob.secPerItem)
  const subProgress = done < activeJob.totalQty ? Math.min(1, secsInCurrentItem / activeJob.secPerItem) : 0
  const pct = ((done + subProgress) / activeJob.totalQty) * 100
  const remaining = Math.max(0, (activeJob.totalQty - done) * activeJob.secPerItem - secsInCurrentItem)
  const totalXp = done * activeJob.xpPerItem

  return (
    <motion.div
      initial={MOTION.entry.standard}
      animate={{ opacity: 1, y: 0 }}
      exit={MOTION.entry.standard}
      className="rounded-2xl border p-3.5 space-y-2.5"
      style={{ borderColor: theme.border, background: `linear-gradient(145deg, ${theme.glow}28 0%, rgba(22,22,38,0.95) 65%)` }}
    >
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-lg border flex items-center justify-center text-lg shrink-0"
          style={{ borderColor: theme.border, background: `${theme.glow}38` }}>
          {output ? <LootVisual icon={output.icon} image={output.image} className="w-6 h-6 object-contain" /> : '⚒️'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-white">{output?.name}</p>
          <p className="text-[10px] font-mono tabular-nums" style={{ color: theme.color }}>
            {done} / {activeJob.totalQty} crafted · +{totalXp.toLocaleString()} xp
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] font-mono text-gray-400">~{formatCraftTime(remaining)}</p>
          <button type="button" onClick={() => { playClickSound(); onCancel(activeJob.id) }}
            className="text-[10px] font-mono text-gray-500 hover:text-red-400 transition-colors mt-0.5">
            cancel
          </button>
        </div>
      </div>

      <div className="space-y-1">
        <div className="h-2.5 rounded-full bg-white/[0.12] overflow-hidden">
          <motion.div className="h-full rounded-full"
            style={{ background: `linear-gradient(90deg, ${theme.glow}, ${theme.color})` }}
            animate={{ width: `${pct}%` }} transition={{ duration: 0.4, ease: 'linear' }} />
        </div>
        <div className="flex justify-between">
          <span className="text-[10px] font-mono text-gray-500">{Math.round(pct)}%</span>
          {queue.length > 0 &&
            <span className="text-[10px] font-mono text-gray-500">+{queue.length} queued</span>}
        </div>
      </div>

      {queue.length > 0 && (
        <div className="space-y-0.5">
          {queue.map((job, i) => {
            const qOut = CRAFT_ITEM_MAP[job.outputItemId]
            return (
              <div key={job.id} className="flex items-center gap-1.5 px-1 py-0.5 rounded text-[10px] font-mono text-gray-500">
                <span className="text-gray-600">{i + 1}.</span>
                {qOut ? <LootVisual icon={qOut.icon} image={qOut.image} className="w-3.5 h-3.5 object-contain opacity-60" /> : null}
                <span className="truncate">{qOut?.name ?? job.outputItemId}</span>
                <span className="ml-auto shrink-0 text-gray-600">×{job.totalQty}</span>
              </div>
            )
          })}
        </div>
      )}
    </motion.div>
  )
}

// ── Recipe card ───────────────────────────────────────────────────────────────

function RecipeCard({
  recipe, crafterLevel, items, gold, expanded, onToggle, onStart,
}: {
  recipe: CraftRecipe
  crafterLevel: number
  items: Record<string, number>
  gold: number
  expanded: boolean
  onToggle: () => void
  onStart: (r: CraftRecipe, qty: number) => void
}) {
  const output = CRAFT_ITEM_MAP[recipe.outputItemId]
  const theme = getRarityTheme(output?.rarity ?? 'common')
  const locked = crafterLevel < recipe.levelRequired
  const [qty, setQty] = useState(1)

  const hasIngredients = canAffordRecipe(recipe, qty, items)
  const hasGold = gold >= (recipe.goldCost ?? 0) * qty
  const canStart = !locked && hasIngredients && hasGold
  const hasAll1 = !locked && canAffordRecipe(recipe, 1, items) && gold >= (recipe.goldCost ?? 0)

  if (!output) return null

  return (
    <div className="rounded-xl border transition-all"
      style={{
        borderColor: expanded ? theme.border : 'rgba(255,255,255,0.10)',
        background: expanded ? `linear-gradient(145deg, ${theme.glow}22 0%, rgba(22,22,38,0.95) 65%)` : 'rgba(255,255,255,0.04)',
        opacity: locked ? 0.4 : 1,
      }}
    >
      {/* Row */}
      <button type="button" className="w-full flex items-center gap-3 p-3 text-left focus:outline-none"
        onClick={locked ? undefined : onToggle}>
        {/* Output icon */}
        <div className="w-10 h-10 rounded-lg border flex items-center justify-center text-xl shrink-0"
          style={{ borderColor: theme.border, background: `${theme.glow}30` }}>
          <LootVisual icon={output.icon} image={output.image} className="w-7 h-7 object-contain" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[12px] font-semibold text-white">{output.name}</span>
            <span className="text-[10px] font-mono uppercase tracking-wide" style={{ color: theme.color }}>
              {output.rarity}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[10px] font-mono text-gray-400">
            <span>Lvl {recipe.levelRequired}</span>
            <span>·</span>
            <span style={{ color: CRAFT_COLOR }}>{recipe.xpPerItem} xp</span>
          </div>
        </div>

        {/* Status */}
        {locked
          ? <span className="text-[10px] text-gray-500 shrink-0 font-mono">🔒{recipe.levelRequired}</span>
          : <span className="text-[10px] text-gray-500 shrink-0">{expanded ? '▲' : '▼'}</span>
        }
      </button>

      {/* Expanded */}
      <AnimatePresence>
        {expanded && !locked && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: MOTION.duration.fast, ease: MOTION.easing }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/[0.10] px-3 pt-3 pb-3 space-y-3">

              {/* Ingredients */}
              <div className="space-y-1">
                <p className="text-[10px] font-mono uppercase tracking-widest text-gray-500 mb-1.5">
                  Ingredients × {qty}
                </p>
                {recipe.ingredients.map((ing) => {
                  const def = getItemDef(ing.id)
                  const owned = items[ing.id] ?? 0
                  const need = ing.qty * qty
                  const ok = owned >= need
                  const ingTheme = getRarityTheme(def?.rarity ?? 'common')
                  return (
                    <div key={ing.id}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5"
                      style={{ background: ok ? 'rgba(132,204,22,0.10)' : 'rgba(255,255,255,0.05)' }}
                    >
                      {def ? <LootVisual icon={def.icon} image={def.image} className="w-4 h-4 object-contain" /> : <span className="text-sm leading-none">?</span>}
                      <span className="flex-1 text-[11px] text-gray-300 truncate">{def?.name ?? ing.id}</span>
                      <span className="text-[10px] font-mono shrink-0" style={{ color: ingTheme.color }}>
                        {def?.rarity}
                      </span>
                      <span className="text-[10px] font-mono tabular-nums shrink-0"
                        style={{ color: ok ? '#86efac' : '#f87171' }}>
                        {owned}/{need}
                      </span>
                    </div>
                  )
                })}
                {recipe.goldCost != null && recipe.goldCost > 0 && (
                  <div
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5"
                    style={{ background: hasGold ? 'rgba(132,204,22,0.10)' : 'rgba(255,255,255,0.05)' }}
                  >
                    <span className="text-sm leading-none">🪙</span>
                    <span className="flex-1 text-[11px] text-gray-300 truncate">Gold</span>
                    <span className="text-[10px] font-mono tabular-nums shrink-0"
                      style={{ color: hasGold ? '#86efac' : '#f87171' }}>
                      {gold.toLocaleString()}/{(recipe.goldCost * qty).toLocaleString()}
                    </span>
                  </div>
                )}
                {!hasAll1 && (
                  <p className="text-[10px] text-gray-500 italic pt-0.5">
                    Buy on Marketplace or loot from bosses &amp; farm
                  </p>
                )}
              </div>

              {/* Quantity */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-mono uppercase tracking-widest text-gray-500">Quantity</p>
                <div className="flex gap-1.5 flex-wrap items-center">
                  {QTY_PRESETS.map((p) => (
                    <button key={p} type="button" onClick={() => setQty(p)}
                      className="text-[11px] font-mono px-2.5 py-1 rounded-lg border transition-colors"
                      style={qty === p
                        ? { borderColor: `${CRAFT_COLOR}77`, background: `${CRAFT_COLOR}28`, color: CRAFT_COLOR }
                        : { borderColor: 'rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.45)' }
                      }>
                      {p}
                    </button>
                  ))}
                  {(() => {
                    const max = maxAffordableQty(recipe, items)
                    return (
                      <button type="button"
                        onClick={() => { if (max > 0) setQty(max) }}
                        className="text-[11px] font-mono px-2.5 py-1 rounded-lg border transition-colors"
                        style={max <= 0
                          ? { borderColor: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.25)', cursor: 'not-allowed' }
                          : qty === max
                            ? { borderColor: `${CRAFT_COLOR}77`, background: `${CRAFT_COLOR}28`, color: CRAFT_COLOR }
                            : { borderColor: 'rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.45)' }
                        }>
                        Max{max > 0 ? ` (${max})` : ''}
                      </button>
                    )
                  })()}
                  <input type="number" min={1} value={qty}
                    onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-16 text-[11px] font-mono px-2 py-1 rounded-lg border border-white/[0.16] bg-white/[0.06] text-gray-200 text-center focus:outline-none focus:border-orange-500/50"
                  />
                </div>
              </div>

              {/* Summary + start */}
              <div className="flex items-end justify-between gap-3 pt-0.5">
                <div className="text-[10px] font-mono text-gray-400 space-y-0.5">
                  <p>⏱ {formatCraftTime(craftDuration(recipe, qty, crafterLevel, computeGrindlyBonuses(getGrindlyLevel()).craftSpeedMultiplier))}</p>
                  <p style={{ color: CRAFT_COLOR }}>✦ {(qty * recipe.xpPerItem).toLocaleString()} xp total</p>
                </div>
                <motion.button type="button"
                  whileTap={canStart ? { scale: 0.95 } : {}}
                  onClick={() => { if (canStart) { playClickSound(); onStart(recipe, qty) } }}
                  className="px-5 py-2 rounded-xl text-[12px] font-bold transition-all"
                  style={canStart
                    ? { color: CRAFT_COLOR, border: `1px solid ${CRAFT_COLOR}88`, background: `${CRAFT_COLOR}28` }
                    : { color: 'rgba(255,255,255,0.30)', border: '1px solid rgba(255,255,255,0.12)', cursor: 'not-allowed' }
                  }>
                  {canStart ? '⚒ Start' : 'Not enough'}
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Category tabs ─────────────────────────────────────────────────────────────

type CraftCategory = 'all' | LootSlot

const CATEGORY_LABELS: Array<{ id: CraftCategory; label: string; icon: string }> = [
  { id: 'all',       label: 'All',       icon: '⚒️' },
  { id: 'material',  label: 'Materials', icon: '⬛' },
  { id: 'head',      label: 'Head',      icon: '⛑️' },
  { id: 'body',      label: 'Body',      icon: '🥋' },
  { id: 'weapon',    label: 'Weapon',    icon: '⚔️' },
  { id: 'ring',      label: 'Ring',      icon: '💍' },
]

// ── Page ──────────────────────────────────────────────────────────────────────

export function CraftPage() {
  const { craftXp, activeJob, queue, hydrate, startCraft, cancelJob } = useCraftingStore()
  const items = useInventoryStore((s) => s.items)
  const deleteItem = useInventoryStore((s) => s.deleteItem)
  const addItem = useInventoryStore((s) => s.addItem)
  const gold = useGoldStore((s) => s.gold)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [category, setCategory] = useState<CraftCategory>('all')
  const [showBackpack, setShowBackpack] = useState(false)

  useEffect(() => { hydrate() }, [hydrate])

  const crafterLevel = skillLevelFromXP(craftXp ?? 0)

  const handleStart = useCallback((recipe: CraftRecipe, qty: number) => {
    // Cancel active job + queue so the new craft replaces them
    const { activeJob: curJob, queue: curQueue } = useCraftingStore.getState()
    if (curJob) cancelJob(curJob.id, (id, q) => addItem(id, q))
    for (const q of curQueue) cancelJob(q.id, (id, q2) => addItem(id, q2))

    const result = startCraft(recipe.id, qty, items, (id, q) => deleteItem(id, q))
    if (result === 'ok') {
      setExpandedId(null)
      const output = CRAFT_ITEM_MAP[recipe.outputItemId]
      if (output) playLootRaritySound(output.rarity)
      // Immediately sync consumed ingredients to Supabase so periodic merge doesn't restore them
      const user = useAuthStore.getState().user
      if (supabase && user) {
        const { items: curItems, chests } = useInventoryStore.getState()
        const { seeds, seedZips } = useFarmStore.getState()
        syncInventoryToSupabase(curItems, chests, { merge: false, seeds, seedZips }).catch(() => {})
      }
    }
  }, [items, startCraft, deleteItem, cancelJob, addItem])

  const handleCancel = useCallback((jobId: string) => {
    cancelJob(jobId, (id, q) => addItem(id, q))
    // Sync refunded items to Supabase
    const user = useAuthStore.getState().user
    if (supabase && user) {
      const { items: curItems, chests } = useInventoryStore.getState()
      const { seeds, seedZips } = useFarmStore.getState()
      syncInventoryToSupabase(curItems, chests, { merge: false, seeds, seedZips }).catch(() => {})
    }
  }, [cancelJob, addItem])

  const filteredRecipes = CRAFT_RECIPES.filter((r) => {
    if (category === 'all') return true
    const output = CRAFT_ITEM_MAP[r.outputItemId]
    return output?.slot === category
  })

  const sortedRecipes = [...filteredRecipes].sort((a, b) => {
    const aLocked = crafterLevel < a.levelRequired
    const bLocked = crafterLevel < b.levelRequired
    if (aLocked !== bLocked) return aLocked ? 1 : -1
    return a.levelRequired - b.levelRequired
  })

  // Only show categories that have recipes
  const availableCategories = CATEGORY_LABELS.filter(({ id }) => {
    if (id === 'all') return true
    return CRAFT_RECIPES.some((r) => CRAFT_ITEM_MAP[r.outputItemId]?.slot === id)
  })

  if (showBackpack) {
    return <InventoryPage onBack={() => setShowBackpack(false)} />
  }

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <PageHeader
          title="Craft"
          icon={<Hammer className="w-4 h-4 text-orange-400" />}
          rightSlot={
            <BackpackButton onClick={() => setShowBackpack(true)} />
          }
        />
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-1 px-4 pb-2">
        {availableCategories.map(({ id, label, icon }) => {
          const active = category === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => { playClickSound(); setCategory(id); setExpandedId(null) }}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all focus:outline-none"
              style={active
                ? { background: `${CRAFT_COLOR}28`, border: `1px solid ${CRAFT_COLOR}77`, color: CRAFT_COLOR }
                : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.55)' }}
            >
              <span className="text-sm leading-none">{icon}</span>
              {label}
            </button>
          )
        })}
      </div>

      <div className="px-4 space-y-4">
        {/* Active job */}
        <AnimatePresence>
          {(activeJob || queue.length > 0) && (
            <ActiveJob onCancel={handleCancel} />
          )}
        </AnimatePresence>

        {/* Recipe list */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-mono uppercase tracking-widest text-gray-400">
              {availableCategories.find((c) => c.id === category)?.label ?? 'All'}
            </p>
            <p className="text-[10px] font-mono text-gray-500">
              {sortedRecipes.filter((r) => crafterLevel >= r.levelRequired).length}/{sortedRecipes.length} unlocked
            </p>
          </div>
          {sortedRecipes.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              crafterLevel={crafterLevel}
              items={items}
              gold={gold}
              expanded={expandedId === recipe.id}
              onToggle={() => setExpandedId((p) => p === recipe.id ? null : recipe.id)}
              onStart={handleStart}
            />
          ))}
          {sortedRecipes.length === 0 && (
            <p className="text-center text-[11px] text-gray-500 py-6">No recipes in this category yet.</p>
          )}
        </div>

        {/* Next unlock hint */}
        {(() => {
          const allLocked = CRAFT_RECIPES.filter((r) => r.levelRequired > crafterLevel)
          const next = allLocked.sort((a, b) => a.levelRequired - b.levelRequired)[0]
          if (!next) return null
          const output = CRAFT_ITEM_MAP[next.outputItemId]
          if (!output) return null
          return (
            <p className="text-center text-[10px] text-gray-500 pt-1">
              Next unlock at Lvl {next.levelRequired}: <LootVisual icon={output.icon} image={output.image} className="w-3 h-3 object-contain inline" /> {output.name}
            </p>
          )
        })()}

        {/* Dev test kit — hidden in production */}
        {import.meta.env.DEV && (
          <button
            type="button"
            onClick={() => {
              addItem('ore_iron', 100)
              addItem('monster_fang', 60)
              addItem('magic_essence', 40)
              addItem('ancient_scale', 20)
              addItem('void_crystal', 10)
            }}
            className="w-full py-2 rounded-xl text-[10px] font-mono text-gray-500 border border-dashed border-white/[0.10] hover:border-white/[0.20] hover:text-gray-300 transition-colors"
          >
            🧪 +100 ore / +60 fang / +40 essence / +20 scale / +10 crystal
          </button>
        )}
      </div>
    </div>
  )
}
