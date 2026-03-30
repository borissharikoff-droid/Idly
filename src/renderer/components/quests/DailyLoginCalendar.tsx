import { AnimatePresence, motion } from 'framer-motion'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  canClaimToday, claimDailyLoginReward, getCalendarDays, getDailyLoginState,
  type CalendarDay, type DailyLoginReward,
} from '../../lib/dailyLoginRewards'
import { CHEST_DEFS, LOOT_ITEMS, RARITY_COLORS, getRarityTheme, type ChestType, type BonusMaterial } from '../../lib/loot'
import { SEED_DEFS } from '../../lib/farming'
import { LootVisual } from '../loot/LootUI'
import { useGoldStore } from '../../stores/goldStore'
import { useInventoryStore } from '../../stores/inventoryStore'
import { playClickSound } from '../../lib/sounds'
import { PixelConfetti } from '../home/PixelConfetti'
import { ChestOpenModal } from '../animations/ChestOpenModal'

// ── Chest visuals ─────────────────────────────────────────────────────────────

const CHEST_ICON: Record<ChestType, string> = {
  common_chest:    '📦',
  rare_chest:      '💠',
  epic_chest:      '💜',
  legendary_chest: '🏆',
}

const CHEST_COLOR: Record<ChestType, string> = {
  common_chest:    '#9CA3AF',
  rare_chest:      '#38BDF8',
  epic_chest:      '#C084FC',
  legendary_chest: '#FACC15',
}

// ── Item lookup (loot items + seeds) ─────────────────────────────────────────

function findItem(id: string): { icon: string; image?: string; name: string; rarity: string } | undefined {
  const loot = LOOT_ITEMS.find(x => x.id === id)
  if (loot) return loot
  const seed = SEED_DEFS.find(x => x.id === id)
  if (seed) return { icon: seed.icon, image: seed.image, name: seed.name, rarity: seed.rarity }
  return undefined
}

// ── Compact gold formatter for cell labels ────────────────────────────────────

function fmtGold(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(0)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

// ── Cell quality — drives background tint + border glow ──────────────────────

const MAT_RARITY_PRIORITY: Record<string, number> = { mythic: 5, legendary: 4, epic: 3, rare: 2, uncommon: 1, common: 0 }
const MAT_RARITY_GLOW: Record<string, { color: string; glow: number }> = {
  mythic:    { color: '#FF6B9D', glow: 0.30 },
  legendary: { color: '#FACC15', glow: 0.24 },
  epic:      { color: '#C084FC', glow: 0.20 },
  rare:      { color: '#38BDF8', glow: 0.16 },
  uncommon:  { color: '#34D399', glow: 0.12 },
  common:    { color: '#9CA3AF', glow: 0.08 },
}

function getCellQuality(reward: DailyLoginReward): { color: string; glow: number } {
  if (reward.milestone === 'LEGENDARY') return { color: '#FACC15', glow: 0.55 }
  if (reward.chests?.some(c => c.type === 'legendary_chest')) return { color: '#FACC15', glow: 0.40 }
  if (reward.chests?.some(c => c.type === 'epic_chest')) return { color: '#C084FC', glow: 0.35 }
  if (reward.chests?.some(c => c.type === 'rare_chest')) return { color: '#38BDF8', glow: 0.28 }
  if ((reward.gold ?? 0) >= 2000) return { color: '#FACC15', glow: 0.22 }
  if ((reward.gold ?? 0) >= 500)  return { color: '#FACC15', glow: 0.16 }
  // Check best material rarity
  let best = -1
  let bestRarity = 'common'
  for (const m of (reward.materials ?? [])) {
    const def = findItem(m.id)
    if (!def) continue
    const p = MAT_RARITY_PRIORITY[def.rarity] ?? 0
    if (p > best) { best = p; bestRarity = def.rarity }
  }
  return MAT_RARITY_GLOW[bestRarity] ?? { color: '#9CA3AF', glow: 0.08 }
}

// ── Week helpers ──────────────────────────────────────────────────────────────

const MILESTONE_DAYS = new Set([7, 14, 20, 30])

function getWeekLabel(day: number): string {
  if (day <= 7)  return 'WEEK 1'
  if (day <= 14) return 'WEEK 2'
  if (day <= 21) return 'WEEK 3'
  return 'WEEK 4'
}

const WEEK_GROUPS = [
  { label: 'Week 1', start: 0,  end: 7  },
  { label: 'Week 2', start: 7,  end: 14 },
  { label: 'Week 3', start: 14, end: 21 },
  { label: 'Week 4', start: 21, end: 30 },
]

// ── Cell reward icon — real sprites ───────────────────────────────────────────

type CellToken = {
  node: React.ReactNode
  label: string
  color: string
}

function CellIcon({ reward, isFuture, isClaimed }: { reward: DailyLoginReward; isFuture: boolean; isClaimed: boolean }) {
  const imgFilter = isClaimed ? 'grayscale(1) brightness(0.3)' : 'none'
  const alpha = isClaimed ? 0.2 : isFuture ? 0.80 : 1

  // Pick the single best item to feature: chest > gold > best-rarity material
  let featNode: React.ReactNode = null
  let featLabel = ''
  let featColor = '#FACC15'

  if (reward.chests?.length) {
    const c = reward.chests[0]
    const def = CHEST_DEFS[c.type]
    featNode = def.image
      ? <img src={def.image} alt="" className="w-8 h-8 object-contain" style={{ imageRendering: 'pixelated', filter: imgFilter, opacity: alpha }} draggable={false} />
      : <span className="text-2xl leading-none" style={{ filter: imgFilter, opacity: alpha }}>{def.icon}</span>
    featLabel = c.qty > 1 ? `×${c.qty}` : ''
    featColor = CHEST_COLOR[c.type]
  } else if (reward.gold) {
    featNode = <span className="text-2xl leading-none" style={{ filter: imgFilter, opacity: alpha }}>🪙</span>
    featLabel = fmtGold(reward.gold)
    featColor = '#FACC15'
  } else if (reward.materials?.length) {
    // pick the highest-rarity material
    const rarityOrder = ['mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common']
    let best = reward.materials[0]
    let bestPriority = 99
    for (const m of reward.materials) {
      const def = findItem(m.id)
      const idx = rarityOrder.indexOf(def?.rarity ?? 'common')
      if (idx < bestPriority) { bestPriority = idx; best = m }
    }
    const def = findItem(best.id)
    if (def) {
      featNode = <div style={{ filter: imgFilter, opacity: alpha }}>
        <LootVisual icon={def.icon} image={def.image} className="w-8 h-8 object-contain" />
      </div>
      featLabel = `×${best.qty}`
      featColor = RARITY_COLORS[def.rarity as keyof typeof RARITY_COLORS]?.color ?? '#9CA3AF'
    }
  }

  if (!featNode) {
    featNode = <span className="text-2xl leading-none" style={{ filter: imgFilter, opacity: alpha }}>🪙</span>
  }

  // Count total items for the "+N" badge
  const totalItems = (reward.chests?.reduce((s, c) => s + c.qty, 0) ?? 0)
    + (reward.gold ? 1 : 0)
    + (reward.materials?.length ?? 0)
  // Show "+N more" when there are additional items beyond the featured one
  const featuredCount = reward.chests?.length ? reward.chests[0].qty : 1
  const moreCount = totalItems - featuredCount

  return (
    <div className="flex flex-col items-center gap-0.5 w-full">
      <div className="flex items-center gap-0.5 leading-none">
        {featNode}
        {featLabel && (
          <span
            className="text-[10px] font-bold font-mono tabular-nums leading-none"
            style={{ color: isClaimed ? '#374151' : isFuture ? `${featColor}dd` : featColor }}
          >
            {featLabel}
          </span>
        )}
      </div>
      {moreCount > 0 && (
        <span
          className="text-[8px] font-mono leading-none px-1 rounded"
          style={{ color: isClaimed ? '#374151' : '#9CA3AF', background: 'rgba(255,255,255,0.06)' }}
        >
          +{moreCount} more
        </span>
      )}
    </div>
  )
}

// ── Reward accent color ────────────────────────────────────────────────────────

function getRewardAccent(reward: DailyLoginReward): string {
  if (reward.chests?.length) return CHEST_COLOR[reward.chests[0].type]
  if (reward.gold) return '#FACC15'
  if (reward.materials?.length) {
    const def = findItem(reward.materials[0].id)
    return def ? (RARITY_COLORS[def.rarity as keyof typeof RARITY_COLORS]?.color ?? '#9CA3AF') : '#9CA3AF'
  }
  return '#9CA3AF'
}

function getRewardBigIcon(reward: DailyLoginReward): { type: 'img'; src: string } | { type: 'emoji'; char: string } {
  if (reward.chests?.length) {
    const def = CHEST_DEFS[reward.chests[0].type]
    if (def.image) return { type: 'img', src: def.image }
    return { type: 'emoji', char: def.icon }
  }
  if (reward.gold) return { type: 'emoji', char: '🪙' }
  if (reward.materials?.length) {
    const def = findItem(reward.materials[0].id)
    return { type: 'emoji', char: def?.icon ?? '✨' }
  }
  return { type: 'emoji', char: '✨' }
}

function BigRewardIcon({ icon, size = 80, glow }: { icon: ReturnType<typeof getRewardBigIcon>; size?: number; glow?: string }) {
  if (icon.type === 'img') return (
    <img
      src={icon.src}
      alt=""
      style={{ width: size, height: size, imageRendering: 'pixelated', filter: glow ? `drop-shadow(0 0 18px ${glow})` : undefined }}
      draggable={false}
    />
  )
  return (
    <span style={{ fontSize: size * 0.7, lineHeight: 1, filter: glow ? `drop-shadow(0 0 18px ${glow})` : undefined }}>
      {icon.char}
    </span>
  )
}

// ── Reward line (used in ClaimBurst) ─────────────────────────────────────────

function RewardLine({ reward, size = 'sm' }: { reward: DailyLoginReward; size?: 'sm' | 'lg' }) {
  const lines: { icon: string; text: string; color: string }[] = []
  if (reward.gold) lines.push({ icon: '🪙', text: `${reward.gold.toLocaleString()} gold`, color: '#FACC15' })
  if (reward.chests) {
    for (const c of reward.chests) {
      const def = CHEST_DEFS[c.type]
      lines.push({ icon: CHEST_ICON[c.type], text: c.qty > 1 ? `${def.name} ×${c.qty}` : def.name, color: CHEST_COLOR[c.type] })
    }
  }
  if (reward.materials) {
    for (const m of reward.materials) {
      const def = findItem(m.id)
      if (!def) continue
      lines.push({ icon: def.icon, text: `${def.name} ×${m.qty}`, color: RARITY_COLORS[def.rarity as keyof typeof RARITY_COLORS]?.color ?? '#9CA3AF' })
    }
  }
  const textSize = size === 'lg' ? 'text-sm' : 'text-xs'
  return (
    <div className="flex flex-col gap-1">
      {lines.map((l, i) => (
        <div key={i} className={`flex items-center gap-1.5 ${textSize}`}>
          <span className="leading-none">{l.icon}</span>
          <span style={{ color: l.color }} className="font-semibold">{l.text}</span>
        </div>
      ))}
    </div>
  )
}

// ── Single reward item block — icon cube ──────────────────────────────────────

function RewardItemBlock({ icon, image, name, qty, color }: {
  icon: string; image?: string; name: string; qty: string; color: string
}) {
  return (
    <div
      className="flex flex-col items-center gap-1 rounded-lg py-2 px-2 border relative overflow-hidden"
      style={{ minWidth: 62, width: 62, borderColor: `${color}55`, background: `${color}1c` }}
    >
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at 50% 100%, ${color}28 0%, transparent 70%)` }} />
      <div className="flex items-center justify-center w-9 h-9 relative">
        <LootVisual icon={icon} image={image} className="w-8 h-8 object-contain" />
      </div>
      <span className="text-[11px] font-bold font-mono leading-none relative" style={{ color }}>{qty}</span>
      <span className="text-[8px] text-gray-500 leading-none text-center w-full truncate relative">{name}</span>
    </div>
  )
}

function buildRewardBlocks(reward: DailyLoginReward): React.ReactNode[] {
  const blocks: React.ReactNode[] = []
  if (reward.gold) {
    blocks.push(<RewardItemBlock key="gold" icon="🪙" name="Gold" qty={reward.gold.toLocaleString()} color="#FACC15" />)
  }
  if (reward.chests) {
    for (const c of reward.chests) {
      const def = CHEST_DEFS[c.type]
      blocks.push(<RewardItemBlock key={`chest-${c.type}`} icon={def.icon} image={def.image} name={def.name.replace(' Chest', '')} qty={`×${c.qty}`} color={CHEST_COLOR[c.type]} />)
    }
  }
  if (reward.materials) {
    for (const m of reward.materials) {
      const def = findItem(m.id)
      if (!def) continue
      const color = RARITY_COLORS[def.rarity as keyof typeof RARITY_COLORS]?.color ?? '#9CA3AF'
      blocks.push(<RewardItemBlock key={`mat-${m.id}`} icon={def.icon} image={def.image} name={def.name} qty={`×${m.qty}`} color={color} />)
    }
  }
  return blocks
}

// ── Reward hero card — updates when a day is selected ────────────────────────

function RewardHeroCard({ day }: { day: CalendarDay }) {
  const accent = getRewardAccent(day.reward)
  const isToday = day.status === 'today'
  const isClaimed = day.status === 'claimed'
  const isMilestone = MILESTONE_DAYS.has(day.day)
  const statusText = isToday ? "Today's Reward" : isClaimed ? 'Claimed' : 'Upcoming'
  const statusColor = isToday ? accent : isClaimed ? '#4ade80' : '#6B7280'
  const blocks = buildRewardBlocks(day.reward)

  return (
    <motion.div
      key={day.day}
      className="relative rounded-xl overflow-hidden"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      style={{
        background: `linear-gradient(135deg, ${accent}30 0%, rgba(255,255,255,0.05) 100%)`,
        border: `1px solid ${accent}55`,
      }}
    >
      {/* Left radial glow */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at 0% 50%, ${accent}35 0%, transparent 60%)` }} />

      <div className="relative flex items-stretch gap-0">
        {/* Left column — day number */}
        <div className="flex flex-col items-center justify-center px-4 py-3 shrink-0 border-r"
          style={{ borderColor: `${accent}20`, minWidth: 64 }}>
          <span className="text-[9px] font-mono uppercase tracking-widest mb-0.5" style={{ color: `${accent}70` }}>
            {getWeekLabel(day.day)}
          </span>
          <span className="text-3xl font-black leading-none tabular-nums" style={{ color: isClaimed ? '#374151' : accent }}>
            {day.day}
          </span>
          {isMilestone && (
            <span className="text-[8px] font-bold mt-1 px-1 rounded" style={{ color: '#facc15', background: 'rgba(250,204,21,0.12)' }}>
              MILESTONE
            </span>
          )}
        </div>

        {/* Right column — status + items */}
        <div className="flex-1 px-3.5 pt-2.5 pb-2.5 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded leading-none"
              style={{ color: statusColor, background: `${statusColor}18`, border: `1px solid ${statusColor}30` }}>
              {statusText}
            </span>
            {isToday && (
              <motion.div className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: accent }}
                animate={{ opacity: [1, 0.2, 1] }}
                transition={{ duration: 1.4, repeat: Infinity }} />
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {blocks}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ── Single day cell ───────────────────────────────────────────────────────────

function DayCell({ day, onClick }: { day: CalendarDay; onClick: (day: CalendarDay) => void }) {
  const isToday = day.status === 'today'
  const isClaimed = day.status === 'claimed'
  const isFuture = day.status === 'future'
  const accentColor = useMemo(() => getRewardAccent(day.reward), [day.reward])
  const quality = useMemo(() => getCellQuality(day.reward), [day.reward])

  const glowHex = (scale: number) =>
    Math.round(quality.glow * scale * 255).toString(16).padStart(2, '0').slice(0, 2)

  const borderColor = isToday
    ? accentColor
    : quality.glow > 0.07
      ? `${quality.color}${isFuture ? glowHex(1.2) : glowHex(1.8)}`
      : 'rgba(255,255,255,0.09)'

  // Static box-shadow — no animation to avoid per-frame paint
  const boxShadow = isToday
    ? `0 0 14px ${accentColor}50, inset 0 0 12px ${accentColor}14`
    : quality.glow >= 0.28 && !isClaimed
      ? `0 0 ${isFuture ? '10px' : '16px'} ${quality.color}${isFuture ? '40' : '55'}`
      : undefined

  return (
    <div
      onClick={() => onClick(day)}
      className="relative flex flex-col items-center justify-between rounded-lg select-none overflow-hidden border h-[92px] w-full pt-1.5 pb-1.5 cursor-pointer transition-transform duration-100 hover:scale-[1.04] active:scale-[0.97]"
      style={{
        borderColor,
        background: isClaimed
          ? 'rgba(255,255,255,0.055)'
          : `radial-gradient(ellipse at 50% 95%, ${quality.color}${isFuture ? glowHex(1.8) : glowHex(2.6)} 0%, transparent 72%), rgba(255,255,255,0.10)`,
        boxShadow,
      }}
    >
      {/* Top accent bar for milestone cells */}
      {quality.glow >= 0.14 && !isClaimed && (
        <div
          className="absolute top-0 left-0 right-0 h-[2px] rounded-t-lg pointer-events-none"
          style={{ background: `linear-gradient(90deg, transparent, ${quality.color}${isFuture ? '88' : 'ee'}, transparent)` }}
        />
      )}

      {/* Milestone crown badge */}
      {MILESTONE_DAYS.has(day.day) && (
        <div className="absolute top-0.5 right-1 z-10 pointer-events-none leading-none">
          <span
            className="text-[9px]"
            style={{ opacity: isClaimed ? 0.2 : isFuture ? 0.45 : 0.85, color: quality.color }}
          >
            ♛
          </span>
        </div>
      )}

      {/* Day number */}
      <span
        className="text-[10px] font-bold leading-none z-10"
        style={{ color: isClaimed ? '#374151' : isToday ? accentColor : isFuture ? '#6B7280' : '#9CA3AF' }}
      >
        {day.day}
      </span>

      {/* Reward icon — real sprites */}
      <div className="z-10 flex-1 flex items-center justify-center w-full">
        <CellIcon reward={day.reward} isFuture={isFuture} isClaimed={isClaimed} />
      </div>

      {/* Claimed overlay — subtle SVG check, content still readable */}
      {isClaimed && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ opacity: 0.35 }}>
            <path d="M3.5 9.5L7.5 13.5L14.5 5.5" stroke="#4ade80" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      )}

      {/* Today glow ring pulse — opacity only (GPU composited, no paint) */}
      {isToday && (
        <motion.div
          className="absolute inset-0 rounded-lg pointer-events-none"
          style={{ border: `1px solid ${accentColor}70` }}
          animate={{ opacity: [0.9, 0.15, 0.9] }}
          transition={{ duration: 1.8, repeat: Infinity }}
        />
      )}

      {/* Future lock — tiny, bottom corner only */}
      {isFuture && (
        <div className="absolute bottom-0.5 right-1 pointer-events-none z-10">
          <span className="text-[7px] text-gray-700/50">🔒</span>
        </div>
      )}
    </div>
  )
}

// ── Claim modal — 1:1 match with ChestOpenModal revealed phase ────────────────

interface ClaimBurstProps {
  reward: DailyLoginReward
  onDone: () => void
}

export function ClaimBurst({ reward, onDone }: ClaimBurstProps) {
  const dayNum = getDailyLoginState().totalClaimed
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollPos, setScrollPos] = useState<'start' | 'mid' | 'end'>('start')

  // Pick accent from best reward (mirrors ChestOpenModal chestTheme)
  const quality = getCellQuality(reward)
  const accentColor = quality.glow > 0 ? quality.color : '#9CA3AF'

  // Build scroll cards — same structure as ChestOpenModal bonus material cards
  const cards: { key: string; image?: string; icon: string; qty: string; name: string; color: string; glow: string }[] = []

  if (reward.gold) {
    cards.push({ key: 'gold', icon: '🪙', qty: `+${reward.gold.toLocaleString()}`, name: 'Gold', color: '#F59E0B', glow: '#FDE047' })
  }
  if (reward.chests) {
    for (const c of reward.chests) {
      const def = CHEST_DEFS[c.type]
      const th = getRarityTheme(def.rarity)
      cards.push({ key: `chest-${c.type}`, image: def.image, icon: def.icon, qty: `×${c.qty}`, name: def.name.replace(' Chest', ''), color: th.color, glow: th.glow })
    }
  }
  if (reward.materials) {
    for (const m of reward.materials) {
      const def = findItem(m.id)
      if (!def) continue
      const th = getRarityTheme(def.rarity)
      cards.push({ key: `mat-${m.id}`, image: def.image, icon: def.icon, qty: `×${m.qty}`, name: def.name, color: th.color, glow: th.glow })
    }
  }

  const updateScrollPos = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    if (scrollLeft <= 4) setScrollPos('start')
    else if (scrollLeft + clientWidth >= scrollWidth - 4) setScrollPos('end')
    else setScrollPos('mid')
  }, [])

  const scrollBy = useCallback((dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -150 : 150, behavior: 'smooth' })
  }, [])

  const handleClose = () => { playClickSound(); onDone() }
  const hasScroll = cards.length > 2
  const statusLabel = reward.milestone === 'LEGENDARY' ? 'Legendary!!' : reward.chests?.some(c => c.type === 'epic_chest' || c.type === 'legendary_chest') ? 'Epic drop!' : 'Daily reward'

  return createPortal(
    <motion.div
      key="claim-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      onClick={handleClose}
    >
      {/* Backdrop — identical to ChestOpenModal */}
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" />

      {/* Confetti */}
      <PixelConfetti originX={0.5} originY={0.4} accentColor={accentColor} count={24} duration={1.4} />

      {/* Card — identical structure to ChestOpenModal w-[300px] card */}
      <motion.div
        key="claim-card"
        initial={{ scale: 0.82, opacity: 0, y: 24 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.88, opacity: 0, y: 16 }}
        transition={{ type: 'spring', stiffness: 340, damping: 28, mass: 0.9 }}
        onClick={(e) => e.stopPropagation()}
        className="w-[300px] rounded-lg border p-5 text-center relative overflow-hidden"
        style={{
          borderColor: `${accentColor}40`,
          background: `linear-gradient(160deg, ${accentColor}1A 0%, rgba(8,8,16,0.97) 55%)`,
          boxShadow: `0 0 40px ${accentColor}55, 0 4px 32px rgba(0,0,0,0.7)`,
        }}
      >
        {/* Card ambient glow — continuous pulse, same as ChestOpenModal */}
        <motion.div
          aria-hidden
          className="absolute inset-0 pointer-events-none rounded-lg"
          style={{ background: `radial-gradient(circle at 50% 12%, ${accentColor} 0%, transparent 55%)` }}
          animate={{ opacity: [0.35, 0.55, 0.38] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Status label — same typography as ChestOpenModal isRevealed label */}
        <p
          className="text-caption font-mono uppercase tracking-wider relative"
          style={{ color: accentColor }}
        >
          {statusLabel}
        </p>
        <p className="text-sm text-white/80 font-medium mt-0.5 relative">Day {dayNum}</p>

        {/* Item count — same as ChestOpenModal drop count */}
        {cards.length >= 2 && (
          <motion.p
            className="text-micro text-gray-500 mt-0.5 relative"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15, duration: 0.25 }}
          >
            {cards.length} items received
          </motion.p>
        )}

        {/* Loot scroll — identical to ChestOpenModal loot scroll section */}
        <motion.div
          className="mt-3"
          initial={{ opacity: 0, y: 18, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 280, damping: 24, delay: 0.04 }}
        >
          <div className="relative">
            {/* Left arrow */}
            {hasScroll && scrollPos !== 'start' && (
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
            {hasScroll && scrollPos !== 'end' && (
              <button
                type="button"
                onClick={() => scrollBy('right')}
                className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full flex items-center justify-center transition-all active:scale-90"
                style={{ background: 'rgba(8,8,16,0.85)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(4px)', marginRight: '-12px' }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4.5 2L8 6l-3.5 4" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            )}

            {/* Scroll row — exact same classes as ChestOpenModal */}
            <div
              ref={scrollRef}
              onScroll={updateScrollPos}
              className="flex gap-2.5 overflow-x-auto snap-x snap-mandatory scroll-smooth"
              style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
            >
              {cards.map((card, i) => (
                <motion.div
                  key={card.key}
                  className="flex-none w-[130px] snap-start rounded-lg border flex flex-col items-center justify-center gap-2 py-4 relative overflow-hidden"
                  style={{
                    borderColor: `${card.color}40`,
                    background: `linear-gradient(160deg, ${card.glow}18 0%, rgba(8,8,16,0.95) 65%)`,
                  }}
                  initial={{ opacity: 0, x: 20, scale: 0.88 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 280, damping: 24, delay: 0.1 + i * 0.04 }}
                >
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{ background: `radial-gradient(circle at 50% 35%, ${card.glow}28 0%, transparent 65%)` }}
                  />
                  <div
                    className="w-14 h-14 rounded-lg flex items-center justify-center relative"
                    style={{
                      background: `${card.color}12`,
                      border: `1px solid ${card.color}25`,
                      boxShadow: `0 0 12px ${card.glow}30`,
                    }}
                  >
                    {card.image ? (
                      <img src={card.image} className="w-10 h-10 object-contain" style={{ imageRendering: 'pixelated' }} draggable={false} />
                    ) : (
                      <span className="text-3xl relative">{card.icon}</span>
                    )}
                  </div>
                  <span className="text-xl font-bold tabular-nums relative" style={{ color: card.color }}>{card.qty}</span>
                  <span className="text-micro font-medium text-center leading-tight px-2 relative" style={{ color: `${card.color}cc` }}>{card.name}</span>
                </motion.div>
              ))}
              {hasScroll && <div className="flex-none w-5" aria-hidden />}
            </div>
          </div>
        </motion.div>

        {/* Done button — identical to ChestOpenModal Done button */}
        <motion.div
          className="flex gap-2 mt-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0.18, ease: 'easeOut' }}
        >
          <button
            type="button"
            onClick={handleClose}
            className="w-full h-9 rounded-lg text-body font-semibold text-white/50 border border-white/10 bg-white/[0.04] hover:text-white/70 hover:bg-white/[0.07] transition-all active:scale-[0.97]"
          >
            Awesome! ✦
          </button>
        </motion.div>
      </motion.div>
    </motion.div>,
    document.body,
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────

interface DailyLoginCalendarProps {
  onClose: () => void
  onClaimed?: (reward: DailyLoginReward) => void
}

export function DailyLoginCalendar({ onClose, onClaimed }: DailyLoginCalendarProps) {
  const [days, setDays] = useState<CalendarDay[]>(getCalendarDays)
  const [claimable, setClaimable] = useState(canClaimToday)
  const [selectedDay, setSelectedDay] = useState<CalendarDay>(() => {
    const d = getCalendarDays()
    return d.find(x => x.status === 'today') ?? d.find(x => x.status === 'future') ?? d[0]
  })
  const addGold = useGoldStore(s => s.addGold)
  const addItem = useInventoryStore(s => s.addItem)
  const grantAndOpenChest = useInventoryStore(s => s.grantAndOpenChest)

  const [pendingChest, setPendingChest] = useState<{
    chestType: ChestType; itemId: string | null; goldDropped: number; bonusMaterials: BonusMaterial[]
  } | null>(null)
  const [deferredReward, setDeferredReward] = useState<DailyLoginReward | null>(null)

  const todayDay = days.find(d => d.status === 'today')
  const totalClaimed = getDailyLoginState().totalClaimed

  const handleClaim = useCallback(() => {
    if (!claimable) return
    playClickSound()
    const reward = claimDailyLoginReward()
    if (!reward) return

    if (reward.gold) addGold(reward.gold)
    if (reward.materials) {
      for (const m of reward.materials) addItem(m.id, m.qty)
    }

    setClaimable(false)

    if (reward.chests && reward.chests.length > 0) {
      let lastChestType: ChestType = reward.chests[reward.chests.length - 1].type
      let lastResult = { itemId: null as string | null, goldDropped: 0, bonusMaterials: [] as BonusMaterial[] }
      for (const c of reward.chests) {
        for (let i = 0; i < c.qty; i++) {
          const r = grantAndOpenChest(c.type, { source: 'daily_activity' })
          lastChestType = c.type
          lastResult = { itemId: r.itemId, goldDropped: r.goldDropped, bonusMaterials: r.bonusMaterials }
        }
      }
      setDeferredReward(reward)
      setPendingChest({ chestType: lastChestType, ...lastResult })
    } else {
      onClaimed?.(reward)
      onClose()
    }
  }, [claimable, addGold, addItem, grantAndOpenChest, onClaimed, onClose])

  const handleChestClose = useCallback(() => {
    const r = deferredReward
    setPendingChest(null)
    setDeferredReward(null)
    onClaimed?.(r!)
    onClose()
  }, [deferredReward, onClaimed, onClose])

  return (
    <>
    <DailyLoginChestModal pendingChest={pendingChest} onClose={handleChestClose} />
    {createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />

        {/* Panel */}
        <motion.div
          className="relative z-10 w-[500px] max-h-[90vh] flex flex-col rounded-xl border border-white/[0.14] shadow-2xl overflow-hidden"
          style={{ background: 'linear-gradient(160deg, #181c27 0%, #111420 100%)' }}
          initial={{ scale: 0.92, y: 20, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.92, y: 20, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 22 }}
        >
          {/* Decorative top gradient strip */}
          <div className="h-[2px] flex-shrink-0" style={{ background: 'linear-gradient(90deg, transparent 0%, #f97316 30%, #facc15 60%, transparent 100%)' }} />

          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-4 pb-3.5 border-b border-white/[0.07]">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.2) 0%, rgba(250,204,21,0.1) 100%)', border: '1px solid rgba(250,204,21,0.25)' }}>
                <span className="text-lg leading-none">🎁</span>
              </div>
              <div>
                <h2 className="text-sm font-bold text-white leading-tight tracking-wide">Daily Login Rewards</h2>
                <p className="text-[10px] font-mono leading-tight mt-0.5" style={{ color: '#f97316cc' }}>
                  {totalClaimed >= 30 ? '🏆 All 30 days completed!' : `${totalClaimed} / 30 days claimed`}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-600 hover:text-gray-300 transition-colors w-7 h-7 flex items-center justify-center rounded hover:bg-white/[0.06] text-xl leading-none"
            >
              ×
            </button>
          </div>

          {/* Fixed hero + progress — never scrolls */}
          <div className="px-5 pt-3.5 pb-3.5 border-b border-white/[0.08]" style={{ background: 'rgba(255,255,255,0.03)' }}>
            {/* Selected day hero */}
            <AnimatePresence mode="wait">
              <RewardHeroCard key={selectedDay.day} day={selectedDay} />
            </AnimatePresence>

            {/* Progress with milestone markers */}
            <div className="mt-3">
              <div className="relative h-2.5 rounded-full overflow-visible" style={{ background: 'rgba(255,255,255,0.09)' }}>
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ background: 'linear-gradient(90deg, #f97316, #facc15)' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${(totalClaimed / 30) * 100}%` }}
                  transition={{ duration: 0.7, ease: 'easeOut' }}
                />
                {/* Milestone ticks at 7, 14, 21, 30 */}
                {[7, 14, 21, 30].map((m) => {
                  const pct = (m / 30) * 100
                  const reached = totalClaimed >= m
                  return (
                    <div key={m} className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center" style={{ left: `${pct}%`, transform: 'translateX(-50%) translateY(-50%)' }}>
                      <div className="w-2.5 h-2.5 rounded-full border-2 z-10"
                        style={{ borderColor: reached ? '#facc15' : 'rgba(255,255,255,0.25)', background: reached ? '#facc15' : '#181c27' }} />
                    </div>
                  )
                })}
              </div>
              <div className="flex justify-between mt-1.5">
                {([7, 14, 21, 30] as const).map((m, i) => (
                  <span key={m} className="text-[8px] font-mono" style={{ color: totalClaimed >= m ? '#facc1599' : '#4b5563' }}>W{i + 1}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Scrollable grid */}
          <div className="flex-1 overflow-y-auto px-5 py-3.5" style={{ willChange: 'scroll-position' }}>
            <div className="space-y-3">
              {WEEK_GROUPS.map(({ label, start, end }) => {
                const weekDone = days.slice(start, end).every(d => d.status === 'claimed')
                return (
                  <div key={label}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[9px] font-bold font-mono uppercase tracking-widest px-1.5 py-0.5 rounded"
                        style={{ color: weekDone ? '#4ade80cc' : '#FACC15aa', background: weekDone ? 'rgba(74,222,128,0.10)' : 'rgba(250,204,21,0.10)', border: `1px solid ${weekDone ? 'rgba(74,222,128,0.22)' : 'rgba(250,204,21,0.18)'}` }}>
                        {label} {weekDone ? '✓' : `· Day ${start + 1}–${end}`}
                      </span>
                      <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.04)' }} />
                    </div>
                    <div className="grid grid-cols-5 gap-1.5">
                      {days.slice(start, end).map((d) => (
                        <DayCell key={d.day} day={d} onClick={setSelectedDay} />
                      ))}
                    </div>
                  </div>
                )
              })}

              {!claimable && totalClaimed < 30 && (
                <div className="text-center py-2">
                  <p className="text-[10px] text-gray-500 font-mono">
                    Come back tomorrow for Day {totalClaimed + 1}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Footer — claim button */}
          {claimable && todayDay && (
            <div className="px-5 pb-5 pt-3 border-t border-white/[0.07]" style={{ background: 'rgba(250,204,21,0.03)' }}>
              <div className="relative">
                {/* Glow layer — opacity only, no paint trigger */}
                <motion.div
                  className="absolute inset-0 rounded-xl pointer-events-none"
                  style={{ boxShadow: '0 0 24px #FACC1560' }}
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 1.6, repeat: Infinity }}
                />
                <motion.button
                  onClick={handleClaim}
                  className="relative w-full py-3.5 rounded-xl text-sm font-bold text-[#0f0f0f] tracking-wide overflow-hidden"
                  style={{ background: 'linear-gradient(135deg, #facc15 0%, #f97316 100%)' }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                >
                  ✦ Claim Day {todayDay.day} Reward
                </motion.button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )}
    </>
  )
}

// ── Daily Login Chest Modal ────────────────────────────────────────────────────

function DailyLoginChestModal({ pendingChest, onClose }: {
  pendingChest: { chestType: ChestType; itemId: string | null; goldDropped: number; bonusMaterials: BonusMaterial[] } | null
  onClose: () => void
}) {
  const item = pendingChest?.itemId ? (LOOT_ITEMS.find((x) => x.id === pendingChest.itemId) ?? null) : null
  return (
    <ChestOpenModal
      open={pendingChest !== null}
      chestType={pendingChest?.chestType ?? null}
      item={item}
      goldDropped={pendingChest?.goldDropped}
      bonusMaterials={pendingChest?.bonusMaterials}
      onClose={onClose}
    />
  )
}

// ── Trigger badge (inline, used in ProfilePage) ────────────────────────────────

export function DailyLoginTrigger({ onClick }: { onClick: () => void }) {
  const claimable = canClaimToday()
  const { totalClaimed } = getDailyLoginState()
  const nextDay = totalClaimed + (claimable ? 1 : 0)

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      className={[
        'w-full flex items-center justify-between px-4 py-3 rounded-xl border',
        'transition-all',
        claimable
          ? 'border-yellow-500/40 bg-gradient-to-r from-yellow-500/[0.08] to-orange-500/[0.05] hover:from-yellow-500/[0.14] hover:to-orange-500/[0.10]'
          : 'border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.06]',
      ].join(' ')}
    >
      <div className="flex items-center gap-3">
        <motion.span
          className="text-2xl"
          animate={claimable ? { rotate: [0, -8, 8, -4, 0] } : {}}
          transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 3 }}
        >
          🎁
        </motion.span>
        <div className="text-left">
          <p className="text-sm font-semibold text-gray-200 leading-tight">Daily Login Reward</p>
          <p className="text-[11px] text-gray-500 leading-tight mt-0.5">
            Day {nextDay} / 30
            {totalClaimed >= 30 && ' · Complete!'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {claimable ? (
          <motion.span
            className="text-[11px] font-bold text-black bg-gradient-to-r from-yellow-400 to-orange-400 px-3 py-1 rounded-full"
            animate={{ scale: [1, 1.04, 1] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          >
            CLAIM
          </motion.span>
        ) : (
          <span className="text-[11px] text-gray-600 font-mono">
            {totalClaimed >= 30 ? '✓ Done' : 'Tomorrow'}
          </span>
        )}
        <span className="text-gray-600 text-sm">›</span>
      </div>
    </motion.button>
  )
}
