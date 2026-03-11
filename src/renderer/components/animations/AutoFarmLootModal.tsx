import { AnimatePresence, motion } from 'framer-motion'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AutoRunResult } from '../../stores/arenaStore'
import { ITEM_LOSS_CHANCE } from '../../stores/arenaStore'
import { CHEST_DEFS, LOOT_ITEMS, getRarityTheme, getItemPerkDescription } from '../../lib/loot'
import { PixelConfetti } from '../home/PixelConfetti'
import { playChestOpeningSound, playClickSound, playLootRaritySound } from '../../lib/sounds'

function formatShort(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return Math.floor(n).toString()
}

interface AutoFarmLootModalProps {
  open: boolean
  result: AutoRunResult | null
  onClose: () => void
}

// Shake frames for bag animation
const BAG_SHAKE = [0, 9, -9, 7, -7, 5, -5, 3, -3, 0]
const BAG_SCALE = [1, 1.1, 0.94, 1.08, 0.96, 1.05, 0.97, 1.03, 0.98, 1]
const OPEN_MS = 650

const AMBER = {
  color: '#f59e0b',
  border: '#f59e0b55',
  glow: '#f59e0b',
}

export function AutoFarmLootModal({ open, result, onClose }: AutoFarmLootModalProps) {
  const [phase, setPhase] = useState<'opening' | 'revealed'>('opening')
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollPos, setScrollPos] = useState<'start' | 'middle' | 'end'>('start')

  const updateScrollPos = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    if (scrollWidth <= clientWidth + 2) { setScrollPos('start'); return }
    if (scrollLeft <= 2) setScrollPos('start')
    else if (scrollLeft + clientWidth >= scrollWidth - 2) setScrollPos('end')
    else setScrollPos('middle')
  }, [])

  const scrollBy = useCallback((dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'right' ? 140 : -140, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    if (!open) { setPhase('opening'); return }
    setPhase('opening')
    setScrollPos('start')
    if (scrollRef.current) scrollRef.current.scrollLeft = 0
    playChestOpeningSound('rare')
    const t = setTimeout(() => setPhase('revealed'), OPEN_MS)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (phase === 'revealed' && open) {
      // Play sound for best item rarity
      const bestItem = result?.chestResults
        .map((cr) => cr.itemId ? LOOT_ITEMS.find((x) => x.id === cr.itemId) : null)
        .filter(Boolean)
        .sort((a, b) => {
          const order = ['common', 'rare', 'epic', 'legendary', 'mythic']
          return order.indexOf(b!.rarity) - order.indexOf(a!.rarity)
        })[0]
      if (bestItem) playLootRaritySound(bestItem.rarity)
    }
  }, [phase, open, result])

  const isRevealed = phase === 'revealed'

  // Build list of all loot items for the scroll — stack identical items
  interface LootEntry {
    type: 'gear' | 'gold' | 'material' | 'warrior_xp' | 'death'
    // gear
    itemDef?: (typeof LOOT_ITEMS)[number]
    chestIcon?: string
    count?: number        // how many of this same item
    // gold/material/xp
    icon?: string
    image?: string
    value?: string
    label?: string
    color?: string
    // death
    deathBoss?: string
    lostItem?: { name: string; icon: string } | null
  }

  const entries: LootEntry[] = []
  if (result) {
    // Gear items from chests — stack duplicates
    const gearCounts = new Map<string, { itemDef: (typeof LOOT_ITEMS)[number]; chestIcon?: string; count: number }>()
    result.chestResults.forEach((cr) => {
      const itemDef = cr.itemId ? LOOT_ITEMS.find((x) => x.id === cr.itemId) : null
      const chestDef = CHEST_DEFS[cr.chestType]
      if (itemDef) {
        const existing = gearCounts.get(itemDef.id)
        if (existing) {
          existing.count++
        } else {
          gearCounts.set(itemDef.id, { itemDef, chestIcon: chestDef?.icon, count: 1 })
        }
      }
    })
    // Sort by rarity (best first), then by count
    const rarityOrder = ['mythic', 'legendary', 'epic', 'rare', 'common']
    const sortedGear = Array.from(gearCounts.values()).sort((a, b) => {
      const ra = rarityOrder.indexOf(a.itemDef.rarity)
      const rb = rarityOrder.indexOf(b.itemDef.rarity)
      if (ra !== rb) return ra - rb
      return b.count - a.count
    })
    sortedGear.forEach((g) => {
      entries.push({ type: 'gear', itemDef: g.itemDef, chestIcon: g.chestIcon, count: g.count })
    })

    // Gold (dungeon + chest gold combined)
    const chestGold = result.chestResults.reduce((s, cr) => s + cr.goldDropped, 0)
    const totalGold = result.totalGold + chestGold
    if (totalGold > 0) {
      entries.push({ type: 'gold', icon: '🪙', value: `+${formatShort(totalGold)}`, label: 'Gold', color: '#f59e0b' })
    }

    // Materials — aggregate all (dungeon drops + chest bonus materials)
    const matTotals = new Map<string, { icon: string; name: string; qty: number }>()
    result.materials.forEach((m) => {
      const existing = matTotals.get(m.name)
      if (existing) { existing.qty += m.qty }
      else { matTotals.set(m.name, { icon: m.icon, name: m.name, qty: m.qty }) }
    })
    result.chestResults.forEach((cr) => {
      cr.bonusMaterials.forEach((bm) => {
        const matDef = LOOT_ITEMS.find((x) => x.id === bm.itemId)
        if (!matDef) return
        const existing = matTotals.get(matDef.name)
        if (existing) { existing.qty += bm.qty }
        else { matTotals.set(matDef.name, { icon: matDef.icon, name: matDef.name, qty: bm.qty }) }
      })
    })
    matTotals.forEach((m) => {
      entries.push({ type: 'material', icon: m.icon, value: `×${m.qty}`, label: m.name, color: '#10b981' })
    })

    // Warrior XP
    if (result.totalWarriorXP > 0) {
      entries.push({ type: 'warrior_xp', icon: '🗡️', value: `+${formatShort(result.totalWarriorXP)}`, label: 'Warrior XP', color: '#ef4444' })
    }

    // Death
    if (result.failed && result.failedAt) {
      entries.push({ type: 'death', deathBoss: result.failedAt, lostItem: result.lostItem })
    }
  }

  // Count total individual items for the "X items dropped" label
  const totalItemCount = result ? (
    result.chestResults.filter((cr) => cr.itemId).length +
    (result.totalGold + result.chestResults.reduce((s, cr) => s + cr.goldDropped, 0) > 0 ? 1 : 0) +
    result.materials.length +
    result.chestResults.reduce((s, cr) => s + cr.bonusMaterials.length, 0) +
    (result.totalWarriorXP > 0 ? 1 : 0)
  ) : 0
  const hasMultiple = entries.length > 1
  const itemCount = totalItemCount

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && result && (
        <motion.div
          key="bag-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="fixed inset-0 z-[120] flex items-center justify-center p-4"
          onClick={isRevealed ? onClose : undefined}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" />

          {/* Confetti */}
          {isRevealed && (
            <PixelConfetti
              key="bag-confetti"
              originX={0.5}
              originY={0.4}
              accentColor={AMBER.color}
              count={22}
              duration={1.2}
            />
          )}

          {/* Card */}
          <motion.div
            key="bag-card"
            initial={{ scale: 0.82, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.88, opacity: 0, y: 16 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28, mass: 0.9 }}
            onClick={(e) => e.stopPropagation()}
            className="w-[300px] rounded-2xl border p-5 text-center relative overflow-hidden"
            style={{
              borderColor: AMBER.border,
              background: `linear-gradient(160deg, ${AMBER.glow}1A 0%, rgba(8,8,16,0.97) 55%)`,
              boxShadow: isRevealed
                ? `0 0 40px ${AMBER.glow}, 0 4px 32px rgba(0,0,0,0.7)`
                : `0 0 20px ${AMBER.glow}66, 0 4px 24px rgba(0,0,0,0.6)`,
              transition: 'box-shadow 0.5s ease',
            }}
          >
            {/* Ambient glow */}
            <motion.div
              aria-hidden
              className="absolute inset-0 pointer-events-none rounded-2xl"
              style={{ background: `radial-gradient(circle at 50% 12%, ${AMBER.glow} 0%, transparent 55%)` }}
              animate={{ opacity: isRevealed ? [0.45, 0.65, 0.5] : [0.25, 0.45, 0.25] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            />

            {/* Bag icon */}
            <motion.div
              className="mx-auto w-fit relative"
              animate={!isRevealed ? { y: [0, -7, 0] } : { y: 0 }}
              transition={!isRevealed
                ? { duration: 1.2, repeat: Infinity, ease: 'easeInOut' }
                : { type: 'spring', stiffness: 200, damping: 18 }
              }
            >
              <motion.div
                animate={!isRevealed
                  ? { rotate: BAG_SHAKE, scale: BAG_SCALE, boxShadow: `0 0 18px ${AMBER.glow}88` }
                  : { rotate: 0, scale: 1.08, boxShadow: `0 0 32px ${AMBER.glow}CC` }
                }
                transition={!isRevealed
                  ? {
                      rotate: { duration: 0.55, ease: 'easeInOut', times: BAG_SHAKE.map((_, i) => i / (BAG_SHAKE.length - 1)) },
                      scale: { duration: 0.55, ease: 'easeInOut', times: BAG_SCALE.map((_, i) => i / (BAG_SCALE.length - 1)) },
                    }
                  : { type: 'spring', stiffness: 220, damping: 16 }
                }
                className="w-[76px] h-[76px] rounded-2xl border flex items-center justify-center relative overflow-hidden"
                style={{
                  borderColor: AMBER.border,
                  background: `radial-gradient(circle at 50% 35%, ${AMBER.glow}55 0%, rgba(8,8,16,0.92) 70%)`,
                }}
              >
                <span className="text-4xl">🎒</span>
              </motion.div>
            </motion.div>

            {/* Status label */}
            <div className="mt-3 h-[18px] relative overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.p
                  key={isRevealed ? 'revealed' : 'opening'}
                  className="absolute inset-0 text-[11px] font-mono uppercase tracking-wider text-center"
                  style={{ color: AMBER.color }}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                >
                  {isRevealed ? 'Bag opened' : 'Opening\u2026'}
                </motion.p>
              </AnimatePresence>
            </div>

            <p className="text-sm text-white/80 font-medium mt-0.5">
              {result.runsCompleted}/{result.passesUsed} runs
            </p>

            {/* Item count */}
            {isRevealed && itemCount >= 2 && (
              <motion.p
                className="text-[10px] text-gray-500 mt-0.5"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.15, duration: 0.25 }}
              >
                {itemCount} items dropped
              </motion.p>
            )}

            {/* Loot scroll — ChestOpenModal style */}
            <motion.div
              className="mt-3"
              animate={{
                opacity: isRevealed ? 1 : 0,
                y: isRevealed ? 0 : 18,
                scale: isRevealed ? 1 : 0.9,
                filter: isRevealed ? 'blur(0px)' : 'blur(4px)',
              }}
              transition={{
                type: 'spring', stiffness: 280, damping: 24,
                delay: isRevealed ? 0.04 : 0,
                filter: { duration: 0.3, ease: 'easeOut', delay: isRevealed ? 0.04 : 0 },
              }}
              style={{ pointerEvents: isRevealed ? 'auto' : 'none' }}
            >
              <div className="relative">
                {/* Left arrow */}
                {hasMultiple && scrollPos !== 'start' && (
                  <button
                    type="button"
                    onClick={() => scrollBy('left')}
                    className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full flex items-center justify-center transition-all active:scale-90"
                    style={{ background: 'rgba(8,8,16,0.85)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(4px)', marginLeft: '-12px' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M7.5 2L4 6l3.5 4" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                )}
                {/* Right arrow */}
                {hasMultiple && scrollPos !== 'end' && (
                  <button
                    type="button"
                    onClick={() => scrollBy('right')}
                    className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full flex items-center justify-center transition-all active:scale-90"
                    style={{ background: 'rgba(8,8,16,0.85)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(4px)', marginRight: '-12px' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4.5 2L8 6l-3.5 4" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                )}

                <div
                  ref={scrollRef}
                  onScroll={updateScrollPos}
                  className="flex gap-2.5 overflow-x-auto snap-x snap-mandatory scroll-smooth"
                  style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
                >
                  {entries.map((entry, idx) => {
                    if (entry.type === 'gear' && entry.itemDef) {
                      return <GearCard key={`gear-${entry.itemDef.id}`} item={entry.itemDef} count={entry.count ?? 1} hasMultiple={hasMultiple} delay={idx * 0.04} />
                    }
                    if (entry.type === 'death') {
                      return <DeathCard key="death" boss={entry.deathBoss!} lostItem={entry.lostItem} delay={idx * 0.04} />
                    }
                    // Gold, material, warrior XP
                    return (
                      <BonusCard
                        key={`bonus-${idx}`}
                        icon={entry.icon!}
                        image={entry.image}
                        value={entry.value!}
                        label={entry.label!}
                        color={entry.color!}
                        delay={idx * 0.04}
                      />
                    )
                  })}

                  {hasMultiple && <div className="flex-none w-5" aria-hidden />}
                </div>
              </div>
            </motion.div>

            {/* Done button */}
            <motion.div
              className="flex gap-2 mt-4"
              animate={{ opacity: isRevealed ? 1 : 0, y: isRevealed ? 0 : 8 }}
              transition={{ duration: 0.28, delay: isRevealed ? 0.18 : 0, ease: 'easeOut' }}
              style={{ pointerEvents: isRevealed ? 'auto' : 'none' }}
            >
              <button
                type="button"
                onClick={() => { playClickSound(); onClose() }}
                className="flex-1 h-10 rounded-xl text-[13px] font-semibold transition-all active:scale-[0.97]"
                style={{ color: AMBER.color, border: `1px solid ${AMBER.border}`, background: `${AMBER.color}22` }}
              >
                Done
              </button>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

// ─── Gear item card (main loot card, like ChestOpenModal) ─────────────────────

function GearCard({ item, count, hasMultiple, delay }: {
  item: (typeof LOOT_ITEMS)[number]
  count: number
  hasMultiple: boolean
  delay: number
}) {
  const theme = getRarityTheme(item.rarity)
  return (
    <motion.div
      className="rounded-xl border p-3.5 relative overflow-hidden cursor-default snap-start flex-none"
      style={{
        width: hasMultiple ? '220px' : '100%',
        borderColor: theme.border,
        background: `linear-gradient(135deg, ${theme.glow}18 0%, rgba(8,8,16,0.95) 60%)`,
        boxShadow: `0 0 16px ${theme.glow}44`,
      }}
      initial={{ opacity: 0, x: 20, scale: 0.88 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 280, damping: 24, delay }}
    >
      <div
        className="absolute inset-0 pointer-events-none rounded-xl"
        style={{ background: `radial-gradient(circle at 50% 38%, ${theme.glow} 0%, transparent 55%)`, opacity: 0.28 }}
      />
      <motion.div
        className="absolute inset-0 pointer-events-none rounded-xl"
        animate={{ opacity: [0.25, 0.5, 0.28] }}
        transition={{ duration: 1.9, repeat: Infinity, ease: 'easeInOut' }}
        style={{ boxShadow: `inset 0 0 18px ${theme.glow}` }}
      />
      {/* Stack count badge */}
      {count > 1 && (
        <div
          className="absolute top-2 right-2 z-10 min-w-[22px] h-[22px] rounded-full flex items-center justify-center text-[11px] font-black tabular-nums"
          style={{ background: theme.color, color: '#000', boxShadow: `0 0 8px ${theme.glow}88` }}
        >
          ×{count}
        </div>
      )}
      <div className="flex justify-center">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: ({ common: 1.0, rare: 1.04, epic: 1.08, legendary: 1.14, mythic: 1.18 } as Record<string, number>)[item.rarity] ?? 1.0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 18, delay: delay + 0.05 }}
        >
          {item.image ? (
            <img src={item.image} alt="" className="w-[60px] h-[60px] object-contain select-none" style={{ imageRendering: 'pixelated' }} draggable={false} />
          ) : (
            <p className="text-4xl">{item.icon}</p>
          )}
        </motion.div>
      </div>
      <p className="text-sm text-white font-semibold mt-2 leading-tight">{item.name}</p>
      <p className="text-[10px] font-mono uppercase tracking-wider mt-0.5" style={{ color: theme.color }}>{item.rarity}</p>
      {item.description && <p className="text-[9px] text-gray-500 italic mt-1 leading-snug">{item.description}</p>}
      <p className="text-[10px] text-gray-400 mt-1 leading-snug">{getItemPerkDescription(item)}</p>
    </motion.div>
  )
}

// ─── Bonus card (gold, materials, warrior XP) ─────────────────────────────────

function BonusCard({ icon, image, value, label, color, delay }: {
  icon: string
  image?: string
  value: string
  label: string
  color: string
  delay: number
}) {
  return (
    <motion.div
      className="flex-none w-[130px] snap-start rounded-xl border flex flex-col items-center justify-center gap-2 py-4 relative overflow-hidden"
      style={{ borderColor: `${color}40`, background: `linear-gradient(160deg, ${color}10 0%, rgba(8,8,16,0.95) 65%)` }}
      initial={{ opacity: 0, x: 20, scale: 0.88 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 280, damping: 24, delay }}
    >
      <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(circle at 50% 35%, ${color}18 0%, transparent 65%)` }} />
      {image ? (
        <img src={image} alt="" className="w-8 h-8 object-contain relative" style={{ imageRendering: 'pixelated' }} />
      ) : (
        <span className="text-3xl relative">{icon}</span>
      )}
      <span className="text-xl font-bold tabular-nums relative" style={{ color }}>{value}</span>
      <span className="text-[9px] font-mono uppercase tracking-widest relative" style={{ color: `${color}88` }}>{label}</span>
    </motion.div>
  )
}

// ─── Death card ───────────────────────────────────────────────────────────────

function DeathCard({ boss, lostItem, delay }: {
  boss: string
  lostItem?: { name: string; icon: string } | null
  delay: number
}) {
  const lossChancePct = Math.round(ITEM_LOSS_CHANCE * 100)
  return (
    <motion.div
      className="flex-none w-[160px] snap-start rounded-xl border border-red-500/30 flex flex-col items-center justify-center gap-1.5 py-4 px-2 relative overflow-hidden"
      style={{ background: 'linear-gradient(160deg, rgba(239,68,68,0.10) 0%, rgba(8,8,16,0.95) 65%)' }}
      initial={{ opacity: 0, x: 20, scale: 0.88 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 280, damping: 24, delay }}
    >
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at 50% 35%, rgba(239,68,68,0.15) 0%, transparent 65%)' }} />
      <span className="text-3xl relative">💀</span>
      <span className="text-[11px] font-semibold text-red-300 text-center relative leading-tight">Died vs {boss}</span>
      {lostItem ? (
        <span className="text-[10px] text-red-400/80 text-center relative leading-tight">
          Lost {lostItem.icon} {lostItem.name} ({lossChancePct}%)
        </span>
      ) : (
        <span className="text-[10px] text-gray-500 text-center relative leading-tight">
          Gear survived ({100 - lossChancePct}% safe)
        </span>
      )}
    </motion.div>
  )
}
