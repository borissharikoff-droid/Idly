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
import { ZONES } from '../../lib/combat'
import { getRarityTheme, LOOT_ITEMS, getSalvageOutput, getItemPerkDescription, type LootSlot } from '../../lib/loot'
import { RARITY_THEME, normalizeRarity, SLOT_LABEL } from '../loot/LootUI'
import { skillLevelFromXP, getGrindlyLevel, computeGrindlyBonuses } from '../../lib/skills'
import { useCraftingStore, getMasteryTier, MASTERY_TIER_LABELS } from '../../stores/craftingStore'
import { usePartyCraftStore } from '../../stores/partyCraftStore'
import { usePartyStore } from '../../stores/partyStore'
import { useInventoryStore } from '../../stores/inventoryStore'
import { playClickSound, playLootRaritySound } from '../../lib/sounds'
import { MOTION } from '../../lib/motion'
import { PageHeader } from '../shared/PageHeader'
import { fmt } from '../../lib/format'
import { Hammer } from '../../lib/icons'
import { BackpackButton } from '../shared/BackpackButton'
import { useNavigationStore } from '../../stores/navigationStore'
import { InventoryPage } from '../inventory/InventoryPage'
import { LootVisual } from '../loot/LootUI'
import { syncInventoryToSupabase } from '../../services/supabaseSync'
import { useAuthStore } from '../../stores/authStore'
import { useGoldStore } from '../../stores/goldStore'
import { useFarmStore } from '../../stores/farmStore'
import { supabase } from '../../lib/supabase'

const CRAFT_COLOR = '#f97316'
const PARTY_COLOR = '#a78bfa'
const QTY_PRESETS = [1, 10, 50, 100, 500]

// ── Party craft banner (incoming session from another member) ─────────────────

function PartyCraftBanner() {
  const session = usePartyCraftStore((s) => s.session)
  const joinSession = usePartyCraftStore((s) => s.joinSession)
  const user = useAuthStore((s) => s.user)
  const members = usePartyStore((s) => s.members)

  if (!session || session.status !== 'crafting') return null
  if (session.initiator_id === user?.id) return null          // initiator sees it in ActiveJob
  if (session.helpers.includes(user?.id ?? '')) return null  // already joined

  const initiator = members.find((m) => m.user_id === session.initiator_id)
  const output = CRAFT_ITEM_MAP[session.output_item_id]
  const theme = getRarityTheme(output?.rarity ?? 'common')
  const helpersCount = session.helpers.length

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="rounded border px-3 py-2.5 flex items-center gap-3"
      style={{ borderColor: `${PARTY_COLOR}55`, background: `${PARTY_COLOR}12` }}
    >
      <div className="w-8 h-8 rounded border flex items-center justify-center text-base shrink-0"
        style={{ borderColor: theme.border, background: `${theme.glow}30` }}>
        {output ? <LootVisual icon={output.icon} image={output.image} className="w-5 h-5 object-contain" /> : '⚒️'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-caption font-semibold text-white truncate">
          <span style={{ color: PARTY_COLOR }}>{initiator?.username ?? 'Ally'}</span>
          {' '}is crafting {output?.name ?? session.output_item_id}
        </p>
        <p className="text-micro font-mono text-gray-400">
          Join to earn Crafter XP · {helpersCount} helper{helpersCount !== 1 ? 's' : ''} already
        </p>
      </div>
      <button
        type="button"
        onClick={() => { playClickSound(); joinSession(session.id) }}
        className="shrink-0 px-3 py-1.5 rounded text-caption font-bold transition-all"
        style={{ color: PARTY_COLOR, border: `1px solid ${PARTY_COLOR}66`, background: `${PARTY_COLOR}20` }}
      >
        Join
      </button>
    </motion.div>
  )
}

// ── Party craft joined badge (after joining someone else's session) ────────────

function PartyCraftJoinedBadge() {
  const session = usePartyCraftStore((s) => s.session)
  const user = useAuthStore((s) => s.user)
  const members = usePartyStore((s) => s.members)

  if (!session || session.initiator_id === user?.id) return null
  if (!session.helpers.includes(user?.id ?? '')) return null

  const initiator = members.find((m) => m.user_id === session.initiator_id)
  const output = CRAFT_ITEM_MAP[session.output_item_id]

  return (
    <div className="rounded border px-3 py-2 flex items-center gap-2"
      style={{ borderColor: `${PARTY_COLOR}40`, background: `${PARTY_COLOR}0e` }}>
      <span className="text-sm">⚒️</span>
      <p className="text-micro font-mono text-gray-400">
        Helping <span style={{ color: PARTY_COLOR }}>{initiator?.username ?? 'Ally'}</span> craft {output?.name ?? '…'}
        {' '}· XP incoming when done
      </p>
    </div>
  )
}

/** item id → zone name for items that unlock a zone */
const GATE_ITEM_TO_ZONE: Record<string, string> = Object.fromEntries(
  ZONES.flatMap((z) => (z.gateItems ?? []).map((id) => [id, z.name]))
)

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
      className="rounded-card border p-3.5 space-y-2.5"
      style={{ borderColor: theme.border, background: `linear-gradient(145deg, ${theme.glow}28 0%, rgba(22,22,38,0.95) 65%)` }}
    >
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded border flex items-center justify-center text-lg shrink-0"
          style={{ borderColor: theme.border, background: `${theme.glow}38` }}>
          {output ? <LootVisual icon={output.icon} image={output.image} className="w-6 h-6 object-contain" /> : '⚒️'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-white">{output?.name}</p>
          <p className="text-micro font-mono tabular-nums" style={{ color: theme.color }}>
            {done} / {activeJob.totalQty} crafted · +{fmt(totalXp)} xp
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-micro font-mono text-gray-400">~{formatCraftTime(remaining)}</p>
          <button type="button" onClick={() => { playClickSound(); onCancel(activeJob.id) }}
            className="text-micro font-mono text-gray-500 hover:text-red-400 transition-colors mt-0.5">
            cancel
          </button>
        </div>
      </div>

      <div className="space-y-1">
        <div className="h-2.5 rounded-full bg-white/[0.12] overflow-hidden">
          <div className="h-full rounded-full"
            style={{ background: `linear-gradient(90deg, ${theme.glow}, ${theme.color})`, width: `${pct}%`, transition: 'width 0.25s linear' }} />
        </div>
        <div className="flex justify-between">
          <span className="text-micro font-mono text-gray-500">{Math.round(pct)}%</span>
          {queue.length > 0 &&
            <span className="text-micro font-mono text-gray-500">+{queue.length} queued</span>}
        </div>
      </div>

      {queue.length > 0 && (
        <div className="space-y-0.5">
          {queue.map((job, i) => {
            const qOut = CRAFT_ITEM_MAP[job.outputItemId]
            return (
              <div key={job.id} className="flex items-center gap-1.5 px-1 py-0.5 rounded text-micro font-mono text-gray-500">
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

function MasteryStars({ tier }: { tier: 0 | 1 | 2 | 3 }) {
  if (tier === 0) return null
  const stars = '★'.repeat(tier) + '☆'.repeat(3 - tier)
  const color  = tier === 3 ? '#facc15' : tier === 2 ? '#fb923c' : '#94a3b8'
  return (
    <span className="text-micro font-mono shrink-0" style={{ color }} title={MASTERY_TIER_LABELS[tier]}>
      {stars}
    </span>
  )
}

function RecipeCard({
  recipe, crafterLevel, items, gold, masteryCount, partySize, expanded, onToggle, onStart, onPartyCraft, onFarm,
}: {
  recipe: CraftRecipe
  crafterLevel: number
  items: Record<string, number>
  gold: number
  masteryCount: number
  partySize: number
  expanded: boolean
  onToggle: () => void
  onStart: (r: CraftRecipe, qty: number) => void
  onPartyCraft: (r: CraftRecipe, qty: number) => void
  onFarm?: () => void
}) {
  const output = CRAFT_ITEM_MAP[recipe.outputItemId]
  const theme = getRarityTheme(output?.rarity ?? 'common')
  const locked = crafterLevel < recipe.levelRequired
  const gateZone = GATE_ITEM_TO_ZONE[recipe.outputItemId] ?? null
  const masteryTier = getMasteryTier(masteryCount)
  const [qty, setQty] = useState(1)

  const hasIngredients = canAffordRecipe(recipe, qty, items)
  const hasGold = gold >= (recipe.goldCost ?? 0) * qty
  const canStart = !locked && hasIngredients && hasGold
  const hasAll1 = !locked && canAffordRecipe(recipe, 1, items) && gold >= (recipe.goldCost ?? 0)

  if (!output) return null

  return (
    <div className="rounded-card border transition-all"
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
        <div className="w-10 h-10 rounded border flex items-center justify-center text-xl shrink-0"
          style={{ borderColor: theme.border, background: `${theme.glow}30` }}>
          <LootVisual icon={output.icon} image={output.image} className="w-7 h-7 object-contain" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-white">{output.name}</span>
            <span className="text-micro font-mono uppercase tracking-wide" style={{ color: theme.color }}>
              {output.rarity}
            </span>
            <MasteryStars tier={masteryTier} />
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-micro font-mono text-gray-400">
            <span>Lvl {recipe.levelRequired}</span>
            <span>·</span>
            <span style={{ color: CRAFT_COLOR }}>{recipe.xpPerItem} xp</span>
            {masteryTier > 0 && (
              <span style={{ color: '#94a3b8' }}>
                {masteryTier >= 1 && '+20%xp'}
                {masteryTier >= 2 && ' +refund'}
                {masteryTier >= 3 && ' +bonus'}
              </span>
            )}
            {gateZone && (
              <span className="text-micro font-mono px-1 py-0.5 rounded"
                style={{ color: '#facc15', background: 'rgba(250,204,21,0.12)' }}>
                🏰 {gateZone}
              </span>
            )}
          </div>
        </div>

        {/* Status */}
        {locked
          ? <span className="text-micro text-gray-500 shrink-0 font-mono">🔒{recipe.levelRequired}</span>
          : (
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-micro font-mono text-gray-500">→ {recipe.outputQty ?? 1}×</span>
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: hasAll1 ? '#4ade80' : '#6b7280' }} />
              <span className="text-micro text-gray-500">{expanded ? '▲' : '▼'}</span>
            </div>
          )
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
                <p className="text-micro font-mono uppercase tracking-widest text-gray-500 mb-1.5">
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
                      className="flex items-center gap-2 rounded px-2 py-1.5"
                      style={{ background: ok ? 'rgba(132,204,22,0.10)' : 'rgba(255,255,255,0.05)' }}
                    >
                      {def ? <LootVisual icon={def.icon} image={def.image} className="w-4 h-4 object-contain" /> : <span className="text-sm leading-none">?</span>}
                      <span className="flex-1 text-caption text-gray-300 truncate">{def?.name ?? ing.id}</span>
                      <span className="text-micro font-mono shrink-0" style={{ color: ingTheme.color }}>
                        {def?.rarity}
                      </span>
                      <span className="text-micro font-mono tabular-nums shrink-0"
                        style={{ color: ok ? '#86efac' : '#f87171' }}>
                        {owned}/{need}
                      </span>
                    </div>
                  )
                })}
                {recipe.goldCost != null && recipe.goldCost > 0 && (
                  <div
                    className="flex items-center gap-2 rounded px-2 py-1.5"
                    style={{ background: hasGold ? 'rgba(132,204,22,0.10)' : 'rgba(255,255,255,0.05)' }}
                  >
                    <span className="text-sm leading-none">🪙</span>
                    <span className="flex-1 text-caption text-gray-300 truncate">Gold</span>
                    <span className="text-micro font-mono tabular-nums shrink-0"
                      style={{ color: hasGold ? '#86efac' : '#f87171' }}>
                      {fmt(gold)}/{fmt(recipe.goldCost * qty)}
                    </span>
                  </div>
                )}
                {!hasAll1 && (
                  <p className="text-micro text-gray-500 italic pt-0.5">
                    Buy on Marketplace or loot from bosses &amp; farm
                  </p>
                )}
              </div>

              {/* Quantity */}
              <div className="space-y-1.5">
                <p className="text-micro font-mono uppercase tracking-widest text-gray-500">Quantity</p>
                <div className="flex gap-1.5 flex-wrap items-center">
                  {QTY_PRESETS.map((p) => (
                    <button key={p} type="button" onClick={() => setQty(p)}
                      className="text-caption font-mono px-2.5 py-1 rounded border transition-colors"
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
                        className="text-caption font-mono px-2.5 py-1 rounded border transition-colors"
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
                    className="w-16 text-caption font-mono px-2 py-1 rounded border border-white/[0.16] bg-white/[0.06] text-gray-200 text-center focus:outline-none focus:border-orange-500/50"
                  />
                </div>
              </div>

              {/* Mastery progress */}
              {(() => {
                const thresholds = [10, 50, 200] as const
                const nextThreshold = thresholds.find((t) => masteryCount < t)
                if (!nextThreshold) {
                  return (
                    <p className="text-micro font-mono text-yellow-400/70">
                      ★★★ Master — max mastery reached
                    </p>
                  )
                }
                const stars = '★'.repeat(masteryTier) + '☆'.repeat(3 - masteryTier)
                return (
                  <p className="text-micro font-mono text-gray-500">
                    {stars} {masteryCount}/{nextThreshold} crafted — next: {MASTERY_TIER_LABELS[masteryTier + 1 as 1 | 2 | 3]}
                  </p>
                )
              })()}

              {/* Summary + start */}
              <div className="flex items-end justify-between gap-3 pt-0.5">
                <div className="text-micro font-mono text-gray-400 space-y-0.5">
                  <p>⏱ {formatCraftTime(craftDuration(recipe, qty, crafterLevel, computeGrindlyBonuses(getGrindlyLevel()).craftSpeedMultiplier))}</p>
                  <p style={{ color: CRAFT_COLOR }}>✦ {fmt(qty * recipe.xpPerItem)} xp total</p>
                  {partySize > 1 && (
                    <p style={{ color: PARTY_COLOR }}>👥 Party: {partySize}× faster</p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5 items-end">
                  <motion.button type="button"
                    whileTap={canStart ? { scale: 0.95 } : {}}
                    onClick={() => { if (canStart) { playClickSound(); onStart(recipe, qty) } }}
                    className="px-5 py-2 rounded text-xs font-bold transition-all"
                    style={canStart
                      ? { color: CRAFT_COLOR, border: `1px solid ${CRAFT_COLOR}88`, background: `${CRAFT_COLOR}28` }
                      : { color: 'rgba(255,255,255,0.30)', border: '1px solid rgba(255,255,255,0.12)', cursor: 'not-allowed' }
                    }>
                    {canStart ? '⚒ Start' : 'Not enough'}
                  </motion.button>
                  {!hasIngredients && !locked && onFarm && (
                    <button type="button" onClick={onFarm} className="text-micro font-mono text-lime-500/70 hover:text-lime-400 transition-colors">
                      Need materials? → Farm
                    </button>
                  )}
                  {partySize > 1 && canStart && (
                    <motion.button type="button"
                      whileTap={{ scale: 0.95 }}
                      onClick={() => { playClickSound(); onPartyCraft(recipe, qty) }}
                      className="px-4 py-1.5 rounded text-caption font-bold transition-all"
                      style={{ color: PARTY_COLOR, border: `1px solid ${PARTY_COLOR}66`, background: `${PARTY_COLOR}18` }}>
                      ⚒ Party Craft
                    </motion.button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}


// ── Salvage Tab ───────────────────────────────────────────────────────────────

const SALVAGE_COLOR = '#10b981'

function SalvageTab() {
  const items = useInventoryStore((s) => s.items)
  const equippedBySlot = useInventoryStore((s) => s.equippedBySlot)
  const deleteItem = useInventoryStore((s) => s.deleteItem)
  const addItem = useInventoryStore((s) => s.addItem)

  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [salvageQty, setSalvageQty] = useState(1)
  const [animating, setAnimating] = useState(false)
  const [resultModal, setResultModal] = useState<Array<{ id: string; qty: number; name: string; icon: string; image?: string }> | null>(null)

  const getMaxSalvage = (def: typeof LOOT_ITEMS[number]) => {
    const qty = items[def.id] ?? 0
    const eqQty = Object.values(equippedBySlot).includes(def.id) ? 1 : 0
    return qty - eqQty
  }

  const allOwnedItems = LOOT_ITEMS
    .filter((def) => (items[def.id] ?? 0) > 0)
    .filter((def) => {
      if (!search.trim()) return true
      return def.name.toLowerCase().includes(search.toLowerCase())
        || def.slot.toLowerCase().includes(search.toLowerCase())
        || def.rarity.toLowerCase().includes(search.toLowerCase())
    })

  const salvageableItems = allOwnedItems.filter((def) => getSalvageOutput(def) !== null && getMaxSalvage(def) > 0)

  const selectedDef = selectedId ? LOOT_ITEMS.find((x) => x.id === selectedId) ?? null : null
  const isSalvageable = selectedDef ? getSalvageOutput(selectedDef) !== null && getMaxSalvage(selectedDef) > 0 : false
  const baseYields = selectedDef && isSalvageable ? getSalvageOutput(selectedDef) : null
  const maxSalvage = selectedDef ? getMaxSalvage(selectedDef) : 0

  const handleSelect = (id: string) => {
    playClickSound()
    setSelectedId(id)
    setResultModal(null)
    const def = LOOT_ITEMS.find((x) => x.id === id)
    if (def) setSalvageQty(Math.min(1, getMaxSalvage(def)))
  }

  const setQty = (v: number) => setSalvageQty(Math.max(1, Math.min(v, maxSalvage)))

  const handleSalvage = () => {
    if (!selectedDef || !baseYields || animating || maxSalvage < 1) return
    setAnimating(true)
    playClickSound()
    setTimeout(() => {
      deleteItem(selectedDef.id, salvageQty)
      const gained: Array<{ id: string; qty: number; name: string; icon: string; image?: string }> = []
      for (const { id, qty } of baseYields) {
        const total = qty * salvageQty
        addItem(id, total)
        const mat = LOOT_ITEMS.find((x) => x.id === id)
        gained.push({ id, qty: total, name: mat?.name ?? id.replace(/_/g, ' '), icon: mat?.icon ?? '📦', image: mat?.image })
      }
      setAnimating(false)
      setResultModal(gained)
      const s = useInventoryStore.getState()
      const remaining = (s.items[selectedDef.id] ?? 0) - (Object.values(s.equippedBySlot).includes(selectedDef.id) ? 1 : 0)
      if (remaining < 1) setSelectedId(null)
      else setSalvageQty(Math.min(salvageQty, remaining))
    }, 550)
  }

  const theme = selectedDef ? RARITY_THEME[normalizeRarity(selectedDef.rarity)] : null

  return (
    <div className="px-4 space-y-3">
      {/* Detail panel — always visible, at the top */}
      <div
        className="rounded border transition-all"
        style={{
          borderColor: theme ? `${theme.color}30` : 'rgba(255,255,255,0.07)',
          background: theme ? `${theme.color}08` : 'rgba(255,255,255,0.02)',
          minHeight: 152,
        }}
      >
        {!selectedDef ? (
          <div className="flex flex-col items-center justify-center h-36 gap-2 text-center px-4">
            <span className="text-3xl opacity-25">⚗️</span>
            <p className="text-xs font-semibold text-gray-500">Choose a piece of gear</p>
            <p className="text-[10px] text-gray-600 leading-relaxed">
              Pick any item from the list — you'll see what materials you get, choose the quantity, and salvage it all at once.
            </p>
          </div>
        ) : !isSalvageable ? (
          <div className="flex flex-col items-center justify-center h-36 gap-2 text-center px-4">
            <div className="w-10 h-10 rounded flex items-center justify-center" style={{ background: '#0a0a14', border: `1px solid ${theme!.color}30` }}>
              <LootVisual icon={selectedDef.icon} image={selectedDef.image} className="w-7 h-7 object-contain" scale={selectedDef.renderScale ?? 1} />
            </div>
            <p className="text-[11px] font-semibold text-gray-400">{selectedDef.name}</p>
            <p className="text-[10px] text-gray-600 font-mono">
              {maxSalvage <= 0 && getSalvageOutput(selectedDef) !== null ? 'Unequip first to salvage' : 'This item cannot be salvaged'}
            </p>
          </div>
        ) : (
          <div className="p-3 space-y-3">
            <div className="flex items-center gap-3">
              <motion.div
                animate={animating
                  ? { x: [-2, 3, -4, 3, -2, 2, -1, 0], y: [1, -2, 1, -1, 2, -1, 0, 0], scale: [1, 1.05, 0.95, 1.05, 0.9, 0.8, 0.5, 0] }
                  : { x: 0, y: 0, scale: 1 }}
                transition={{ duration: 0.5, ease: 'easeIn' }}
                className="w-14 h-14 rounded flex items-center justify-center shrink-0 relative overflow-hidden"
                style={{ background: '#0a0a14', border: `2px solid ${theme!.color}50` }}
              >
                <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 50%, ${theme!.color}20 0%, transparent 70%)` }} />
                <LootVisual icon={selectedDef.icon} image={selectedDef.image} className="w-9 h-9 object-contain relative" scale={selectedDef.renderScale ?? 1} />
                {animating && (
                  <motion.div initial={{ opacity: 0.6 }} animate={{ opacity: 0 }} transition={{ duration: 0.4 }}
                    className="absolute inset-0 rounded" style={{ background: theme!.color }} />
                )}
              </motion.div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{selectedDef.name}</p>
                <p className="text-[10px] font-mono capitalize" style={{ color: theme!.color }}>{selectedDef.rarity} · {SLOT_LABEL[selectedDef.slot] ?? selectedDef.slot}</p>
                <p className="text-[10px] font-mono text-gray-500 mt-0.5">{maxSalvage} available to salvage</p>
              </div>
            </div>

            {baseYields && (
              <div className="space-y-1.5">
                <p className="text-[9px] font-mono uppercase tracking-widest text-gray-500">You'll receive ×{salvageQty}</p>
                <div className="flex flex-wrap gap-1.5">
                  {baseYields.map(({ id, qty }) => {
                    const mat = LOOT_ITEMS.find((x) => x.id === id)
                    return (
                      <div key={id} className="flex items-center gap-1.5 px-2 py-1 rounded border border-white/[0.08] bg-surface-0/60">
                        <LootVisual icon={mat?.icon ?? '📦'} image={mat?.image} className="w-4 h-4 object-contain" scale={mat?.renderScale ?? 1} />
                        <span className="text-[11px] font-mono font-semibold text-gray-200">{qty * salvageQty}×</span>
                        <span className="text-[11px] font-mono text-gray-400">{mat?.name ?? id.replace(/_/g, ' ')}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <div className="flex items-center rounded border border-white/[0.10] bg-surface-0/60 overflow-hidden shrink-0">
                {[1, 5, 10].filter((p) => p <= maxSalvage).map((p) => (
                  <button key={p} type="button" onClick={() => { playClickSound(); setQty(p) }}
                    className="px-2 py-1.5 text-[10px] font-mono transition-colors"
                    style={{ color: salvageQty === p ? SALVAGE_COLOR : 'rgba(255,255,255,0.4)', background: salvageQty === p ? `${SALVAGE_COLOR}18` : 'transparent' }}>
                    {p}
                  </button>
                ))}
                {maxSalvage > 10 && (
                  <button type="button" onClick={() => { playClickSound(); setQty(maxSalvage) }}
                    className="px-2 py-1.5 text-[10px] font-mono transition-colors"
                    style={{ color: salvageQty === maxSalvage ? SALVAGE_COLOR : 'rgba(255,255,255,0.4)', background: salvageQty === maxSalvage ? `${SALVAGE_COLOR}18` : 'transparent' }}>
                    All
                  </button>
                )}
                <div className="w-px h-5 bg-white/[0.08]" />
                <button type="button" onClick={() => { playClickSound(); setQty(salvageQty - 1) }} className="px-2 py-1.5 text-xs text-gray-500 hover:text-white transition-colors">−</button>
                <span className="w-7 text-center text-[11px] font-mono text-white">{salvageQty}</span>
                <button type="button" onClick={() => { playClickSound(); setQty(salvageQty + 1) }} className="px-2 py-1.5 text-xs text-gray-500 hover:text-white transition-colors">+</button>
              </div>
              <button type="button" onClick={handleSalvage} disabled={animating}
                className="flex-1 py-2 rounded font-bold text-xs tracking-wide transition-all active:scale-[0.97] disabled:opacity-40"
                style={{ background: `${SALVAGE_COLOR}25`, border: `1px solid ${SALVAGE_COLOR}55`, color: SALVAGE_COLOR }}>
                {animating ? 'Salvaging…' : `⚗️ Salvage${salvageQty > 1 ? ` ×${salvageQty}` : ''}`}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Inventory — only salvageable items */}
      <div className="space-y-1.5">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search salvageable items…"
          className="grindly-input text-xs py-1.5 w-full"
        />
        <p className="text-[9px] font-mono text-gray-600 px-0.5">Only items that can be salvaged are shown</p>
        <div className="space-y-1 max-h-[260px] overflow-y-auto pr-0.5">
          {salvageableItems.length === 0 ? (
            <p className="text-center text-[11px] text-gray-600 font-mono py-6">
              {search ? 'No salvageable items match your search' : 'No salvageable items in your inventory'}
            </p>
          ) : (
            salvageableItems.map((def) => {
              const t = RARITY_THEME[normalizeRarity(def.rarity)]
              const isSelected = selectedId === def.id
              const qty = items[def.id] ?? 0
              const isEquipped = equippedBySlot[def.slot] === def.id
              const perk = getItemPerkDescription(def)
              return (
                <button
                  key={def.id}
                  type="button"
                  onClick={() => handleSelect(def.id)}
                  className="relative w-full flex items-center gap-2 px-2 py-1.5 rounded border transition-all text-left active:scale-[0.99]"
                  style={{
                    borderColor: isSelected ? t.color : 'rgba(255,255,255,0.06)',
                    background: isSelected ? `${t.color}12` : 'rgba(10,10,20,0.5)',
                  }}
                >
                  <div className="w-[3px] self-stretch rounded-full shrink-0" style={{ background: t.color }} />
                  <div className="w-8 h-8 rounded flex items-center justify-center shrink-0 overflow-hidden relative" style={{ background: '#0a0a14', border: `1px solid ${t.color}30` }}>
                    <LootVisual icon={def.icon} image={def.image} className="w-5 h-5 object-contain" scale={def.renderScale ?? 1} />
                    {isEquipped && <span className="absolute bottom-0 right-0 text-[5px] font-bold font-mono px-0.5 rounded-tl leading-tight" style={{ background: t.color, color: '#000' }}>EQ</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-gray-100 truncate">{def.name}</p>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono capitalize" style={{ color: t.color }}>{def.rarity}</span>
                      {perk && <span className="text-[10px] text-gray-500 truncate">· {perk}</span>}
                    </div>
                  </div>
                  {qty > 1 && <span className="text-[10px] font-mono font-semibold shrink-0" style={{ color: t.color }}>×{qty}</span>}
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Result modal */}
      <AnimatePresence>
        {resultModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.65)' }}
            onClick={() => setResultModal(null)}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 340, damping: 22 }}
              className="rounded-lg border border-white/15 bg-surface-1 shadow-2xl px-6 py-5 min-w-[240px] max-w-[320px]"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-[10px] font-mono uppercase tracking-widest text-gray-500 mb-3 text-center">Salvage complete</p>
              <div className="space-y-2">
                {resultModal.map(({ id, qty, name, icon, image }, i) => (
                  <motion.div key={id}
                    initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.08, type: 'spring', stiffness: 300, damping: 20 }}
                    className="flex items-center gap-3 px-3 py-2 rounded border border-white/[0.08] bg-surface-0/70"
                  >
                    <div className="w-9 h-9 rounded shrink-0 flex items-center justify-center" style={{ background: '#0a0a14', border: '1px solid rgba(255,255,255,0.12)' }}>
                      <LootVisual icon={icon} image={image} className="w-6 h-6 object-contain" />
                    </div>
                    <p className="flex-1 text-xs font-semibold text-white truncate">{name}</p>
                    <span className="text-sm font-bold font-mono" style={{ color: SALVAGE_COLOR }}>+{qty}</span>
                  </motion.div>
                ))}
              </div>
              <button type="button" onClick={() => setResultModal(null)}
                className="mt-4 w-full py-2 rounded text-[11px] font-semibold text-gray-400 border border-white/[0.08] hover:border-white/20 hover:text-white transition-colors">
                Close
              </button>
            </motion.div>
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
  const navigateTo = useNavigationStore((s) => s.navigateTo)
  const { craftXp, activeJob, queue, recipeMastery, hydrate, startCraft, cancelJob } = useCraftingStore()
  const partyId = usePartyStore((s) => s.party?.id ?? null)
  const partyMembers = usePartyStore((s) => s.members)
  const partySize = partyId ? partyMembers.length : 1
  const { initiateSession } = usePartyCraftStore()
  const items = useInventoryStore((s) => s.items)
  const deleteItem = useInventoryStore((s) => s.deleteItem)
  const addItem = useInventoryStore((s) => s.addItem)
  const gold = useGoldStore((s) => s.gold)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [category, setCategory] = useState<CraftCategory>('all')
  const [showBackpack, setShowBackpack] = useState(false)
  const [search, setSearch] = useState('')
  const [pageMode, setPageMode] = useState<'craft' | 'salvage'>('craft')

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
      document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })
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

  const handlePartyCraft = useCallback(async (recipe: CraftRecipe, qty: number) => {
    if (!partyId) return
    const { activeJob: curJob, queue: curQueue } = useCraftingStore.getState()
    if (curJob) cancelJob(curJob.id, (id, q) => addItem(id, q))
    for (const q of curQueue) cancelJob(q.id, (id, q2) => addItem(id, q2))

    const totalXp = qty * recipe.xpPerItem
    const { ok, speedMult } = await initiateSession(partyId, recipe.id, recipe.outputItemId, partySize, totalXp)
    if (!ok) return

    const result = startCraft(recipe.id, qty, items, (id, q) => deleteItem(id, q), speedMult)
    if (result === 'ok') {
      setExpandedId(null)
      document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })
      const output = CRAFT_ITEM_MAP[recipe.outputItemId]
      if (output) playLootRaritySound(output.rarity)
      const user = useAuthStore.getState().user
      if (supabase && user) {
        const { items: curItems, chests } = useInventoryStore.getState()
        const { seeds, seedZips } = useFarmStore.getState()
        syncInventoryToSupabase(curItems, chests, { merge: false, seeds, seedZips }).catch(() => {})
      }
    }
  }, [partyId, partySize, items, startCraft, cancelJob, addItem, deleteItem, initiateSession])

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
    const output = CRAFT_ITEM_MAP[r.outputItemId]
    if (category !== 'all' && output?.slot !== category) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return output?.name.toLowerCase().includes(q) || r.outputItemId.includes(q)
    }
    return true
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
          onBack={() => navigateTo?.('home')}
          backLabel="Home"
          rightSlot={
            <BackpackButton onClick={() => setShowBackpack(true)} />
          }
        />
      </div>


      {/* Mode toggle */}
      <div className="flex gap-1 px-4 pb-3">
        {([
          { id: 'craft' as const, label: '⚒️ Craft' },
          { id: 'salvage' as const, label: '⚗️ Salvage' },
        ]).map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => { playClickSound(); setPageMode(id) }}
            className="px-3 py-1.5 rounded text-caption font-semibold transition-all"
            style={pageMode === id
              ? { background: `${id === 'craft' ? CRAFT_COLOR : SALVAGE_COLOR}28`, border: `1px solid ${id === 'craft' ? CRAFT_COLOR : SALVAGE_COLOR}77`, color: id === 'craft' ? CRAFT_COLOR : SALVAGE_COLOR }
              : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.45)' }}
          >
            {label}
          </button>
        ))}
      </div>

      {pageMode === 'salvage' ? <SalvageTab /> : <>

      {/* Search */}
      <div className="px-4 pb-2">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setExpandedId(null) }}
          placeholder="Search recipes…"
          className="grindly-input text-xs py-1.5"
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
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded text-caption font-semibold transition-all focus:outline-none"
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
        {/* Party craft banners */}
        <AnimatePresence>
          <PartyCraftBanner />
          <PartyCraftJoinedBadge />
          {partySize <= 1 && (
            <motion.div
              key="party-craft-hint"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="inline-flex items-center gap-1.5 self-start px-2.5 py-1 rounded-full border border-white/[0.08] bg-white/[0.03]"
            >
              <span className="text-caption">👥</span>
              <p className="text-micro font-mono text-gray-500">
                Invite a friend → unlock <span style={{ color: PARTY_COLOR }}>Party Craft</span>
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Active job */}
        <AnimatePresence>
          {(activeJob || queue.length > 0) && (
            <ActiveJob onCancel={handleCancel} />
          )}
        </AnimatePresence>

        {/* Recipe list */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-micro font-mono uppercase tracking-widest text-gray-400">
              {availableCategories.find((c) => c.id === category)?.label ?? 'All'}
            </p>
            <p className="text-micro font-mono text-gray-500">
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
              masteryCount={recipeMastery[recipe.id] ?? 0}
              partySize={partySize}
              expanded={expandedId === recipe.id}
              onToggle={() => setExpandedId((p) => p === recipe.id ? null : recipe.id)}
              onStart={handleStart}
              onPartyCraft={handlePartyCraft}
              onFarm={() => navigateTo?.('farm')}
            />
          ))}
          {sortedRecipes.length === 0 && (
            <p className="text-center text-caption text-gray-500 py-6">No recipes in this category yet.</p>
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
            <p className="text-center text-micro text-gray-500 pt-1">
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
            className="w-full py-2 rounded text-micro font-mono text-gray-500 border border-dashed border-white/[0.10] hover:border-white/[0.20] hover:text-gray-300 transition-colors"
          >
            🧪 +100 ore / +60 fang / +40 essence / +20 scale / +10 crystal
          </button>
        )}
      </div>
      </>}
    </div>
  )
}
