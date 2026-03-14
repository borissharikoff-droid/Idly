import { AnimatePresence, motion } from 'framer-motion'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { BonusMaterial, ChestType, LootItemDef } from '../../lib/loot'
import { CHEST_DEFS, LOOT_ITEMS, getRarityTheme, getItemPerkDescription } from '../../lib/loot'
import { getSeedZipDisplay, type SeedZipTier } from '../../lib/farming'
import { useAdminConfigStore } from '../../stores/adminConfigStore'
import { MOTION } from '../../lib/motion'
import { PixelConfetti } from '../home/PixelConfetti'
import { playClickSound, playLootRaritySound, playChestOpeningSound } from '../../lib/sounds'
import { track } from '../../lib/analytics'

// ─── Per-rarity config ───────────────────────────────────────────────────────
const ANIM: Record<string, {
  openMs: number
  particles: number
  particleDur: number
  flashOpacity: number
  hasRays: boolean
  backdropGlow: boolean
  floatY: number        // idle float distance (px) during opening
  floatDur: number      // idle float cycle (s)
  shakeMag: number      // shake magnitude (deg)
  shakeCount: number    // shake half-cycles
  chestDur: number
}> = {
  common: {
    openMs: 380,
    particles: 10,
    particleDur: 1.0,
    flashOpacity: 0,
    hasRays: false,
    backdropGlow: false,
    floatY: 4,
    floatDur: 1.6,
    shakeMag: 5,
    shakeCount: 2,
    chestDur: 0.35,
  },
  rare: {
    openMs: 600,
    particles: 18,
    particleDur: 1.1,
    flashOpacity: 0.18,
    hasRays: false,
    backdropGlow: true,
    floatY: 6,
    floatDur: 1.4,
    shakeMag: 9,
    shakeCount: 3,
    chestDur: 0.55,
  },
  epic: {
    openMs: 860,
    particles: 24,
    particleDur: 1.3,
    flashOpacity: 0.28,
    hasRays: false,
    backdropGlow: true,
    floatY: 8,
    floatDur: 1.2,
    shakeMag: 13,
    shakeCount: 4,
    chestDur: 0.7,
  },
  legendary: {
    openMs: 1150,
    particles: 36,
    particleDur: 1.7,
    flashOpacity: 0.45,
    hasRays: true,
    backdropGlow: true,
    floatY: 11,
    floatDur: 1.0,
    shakeMag: 16,
    shakeCount: 5,
    chestDur: 0.9,
  },
}

function getAnim(rarity: string) { return ANIM[rarity] ?? ANIM.common }

// Pre-computed per rarity — never recreated on render
const SHAKE_FRAMES: Record<string, number[]> = Object.fromEntries(
  Object.entries(ANIM).map(([k, cfg]) => [k, makeShakeFrames(cfg.shakeMag, cfg.shakeCount)]),
)
const SCALE_FRAMES: Record<string, number[]> = Object.fromEntries(
  Object.entries(ANIM).map(([k, cfg]) => [k, makeScaleFrames(cfg.shakeCount)]),
)

/** Build rotation keyframe array: [0, +mag, -mag, +mag, -mag, ..., 0] */
function makeShakeFrames(mag: number, count: number): number[] {
  const frames: number[] = [0]
  for (let i = 0; i < count; i++) {
    const t = (i + 1) / (count + 1)
    const decay = 1 - t * 0.45
    frames.push(i % 2 === 0 ? mag * decay : -mag * decay)
  }
  frames.push(0)
  return frames
}

/** Build scale keyframe matching shakeFrames length (count + 2) */
function makeScaleFrames(count: number): number[] {
  const frames: number[] = [1.0]
  for (let i = 0; i < count; i++) {
    const decay = 1 - (i / count) * 0.4
    frames.push(i % 2 === 0 ? 1 + 0.13 * decay : 1 - 0.07 * decay)
  }
  frames.push(1.0)
  return frames // length: count + 2 — matches makeShakeFrames
}

// ─── Component ───────────────────────────────────────────────────────────────
interface ChestOpenModalProps {
  open: boolean
  chestType: ChestType | null
  item: LootItemDef | null
  goldDropped?: number
  bonusMaterials?: BonusMaterial[]
  seedZipTier?: SeedZipTier | null
  /** Warrior XP earned from boss kill (shown as separate bonus card) */
  warriorXP?: number
  onClose: () => void
  nextAvailable?: boolean
  onOpenNext?: () => void
  chainMessage?: string | null
  animationSeed?: number
}

export function ChestOpenModal({
  open,
  chestType,
  item,
  goldDropped = 0,
  bonusMaterials = [],
  seedZipTier,
  warriorXP = 0,
  onClose,
  nextAvailable = false,
  onOpenNext,
  chainMessage,
  animationSeed,
}: ChestOpenModalProps) {
  const chest = chestType ? CHEST_DEFS[chestType] : null
  const chestRarity = chest?.rarity ?? 'common'
  const animCfg = getAnim(chestRarity)
  const revealKey = `${chestType ?? 'none'}:${item?.id ?? 'noitem'}:${animationSeed ?? 0}`
  const chestTheme = getRarityTheme(chestRarity)
  const rarityTheme = item ? getRarityTheme(item.rarity) : chestTheme
  const isLegendary = chestRarity === 'legendary'

  useAdminConfigStore((s) => s.rev) // re-render when admin config changes

  const [phase, setPhase] = useState<'opening' | 'revealed'>('opening')
  const lootCardRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const [hovering, setHovering] = useState(false)
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

  const shakeFrames = SHAKE_FRAMES[chestRarity] ?? SHAKE_FRAMES.common
  const scaleFrames = SCALE_FRAMES[chestRarity] ?? SCALE_FRAMES.common

  useEffect(() => {
    if (!open) { setPhase('opening'); return }
    setPhase('opening')
    setScrollPos('start')
    if (scrollRef.current) scrollRef.current.scrollLeft = 0
    playChestOpeningSound(chestRarity)
    const t = setTimeout(() => setPhase('revealed'), animCfg.openMs)
    return () => clearTimeout(t)
  }, [open, revealKey, animCfg.openMs])

  useEffect(() => {
    if (phase === 'revealed' && open && item && chestType) {
      playLootRaritySound(item.rarity)
      track('chest_open', { chest_type: chestType, item_rarity: item.rarity })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  const handleLootMouseMove = useCallback((e: React.MouseEvent) => {
    const el = lootCardRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    setTilt({ x: (e.clientX - cx) / (rect.width / 2), y: (e.clientY - cy) / (rect.height / 2) })
  }, [])

  const isRevealed = phase === 'revealed'
  const itemX = tilt.x * 5
  const itemY = tilt.y * -3.5
  const glowX = 50 + tilt.x * 14
  const glowY = 38 + tilt.y * 10

  if (typeof document === 'undefined') return null
  return createPortal(
    <AnimatePresence>
      {open && chest && (
        // Outer wrapper — stable key: only mounts/unmounts when modal opens/closes entirely.
        // This keeps the backdrop from flashing on "Open more".
        <motion.div
          key="bag-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="fixed inset-0 z-[120] flex items-center justify-center p-4"
          onClick={isRevealed ? onClose : undefined}
        >
          {/* ── Backdrop — stable, never re-animates on chain-open ── */}
          <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" />

          {/* Confetti — keyed so it re-fires on each open */}
          {isRevealed && (
            <PixelConfetti
              key={`confetti:${revealKey}`}
              originX={0.5}
              originY={0.4}
              accentColor={rarityTheme.color}
              count={animCfg.particles}
              duration={animCfg.particleDur}
            />
          )}

          {/* ── Card — also stable: stays in place on chain-open ── */}
          <motion.div
            key="bag-card"
            initial={{ scale: 0.82, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.88, opacity: 0, y: 16 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28, mass: 0.9 }}
            onClick={(e) => e.stopPropagation()}
            className="w-[300px] rounded-2xl border p-5 text-center relative overflow-hidden"
            style={{
              borderColor: chestTheme.border,
              background: `linear-gradient(160deg, ${chestTheme.glow}1A 0%, rgba(8,8,16,0.97) 55%)`,
              boxShadow: isRevealed
                ? `0 0 ${isLegendary ? '60px' : '32px'} ${chestTheme.glow}, 0 4px 32px rgba(0,0,0,0.7)`
                : `0 0 20px ${chestTheme.glow}66, 0 4px 24px rgba(0,0,0,0.6)`,
              transition: 'box-shadow 0.5s ease',
            }}
          >
            {/* Card ambient glow — continuous, not keyed */}
            <motion.div
              aria-hidden
              className="absolute inset-0 pointer-events-none rounded-2xl"
              style={{ background: `radial-gradient(circle at 50% 12%, ${chestTheme.glow} 0%, transparent 55%)` }}
              animate={{ opacity: isRevealed ? [0.45, 0.65, 0.5] : [0.25, 0.45, 0.25] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            />

            {/* ── Inner content — re-keyed on each bag open ── */}
            {/* On "Open more": old content fades out (100ms), new content fades in with fresh opening animation */}
            <AnimatePresence mode="wait">
              <motion.div
                key={revealKey}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: 0.14, ease: 'easeOut' } }}
                exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.1, ease: 'easeIn' } }}
              >
                {/* Colored radial backdrop glow (inside card context) */}
                {animCfg.backdropGlow && (
                  <motion.div
                    className="absolute inset-0 pointer-events-none rounded-2xl"
                    initial={{ opacity: 0 }}
                    animate={{
                      opacity: isLegendary && !isRevealed
                        ? [0, 0.7, 0.4, 0.8, 0.4]
                        : isRevealed ? 0.65 : 0.3,
                    }}
                    transition={{
                      duration: isLegendary && !isRevealed ? animCfg.openMs / 1000 : 0.5,
                      repeat: isLegendary && !isRevealed ? Infinity : 0,
                      ease: 'easeInOut',
                    }}
                    style={{ background: `radial-gradient(ellipse 120% 80% at 50% 0%, ${chestTheme.glow}50 0%, transparent 70%)` }}
                  />
                )}

                {/* Legendary: rotating conic rays */}
                {animCfg.hasRays && (
                  <motion.div
                    className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl"
                    animate={{ opacity: isRevealed ? 1 : 0 }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                  >
                    <motion.div
                      className="absolute inset-0"
                      style={{
                        background: `conic-gradient(from 0deg at 50% 42%,
                          transparent 0deg,   ${rarityTheme.color}18 18deg,  transparent 36deg,
                          transparent 72deg,  ${rarityTheme.color}10 90deg,  transparent 108deg,
                          transparent 144deg, ${rarityTheme.color}18 162deg, transparent 180deg,
                          transparent 216deg, ${rarityTheme.color}0E 234deg, transparent 252deg,
                          transparent 288deg, ${rarityTheme.color}16 306deg, transparent 324deg,
                          transparent 342deg, ${rarityTheme.color}12 354deg, transparent 360deg)`,
                      }}
                      animate={{ rotate: 360 }}
                      transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
                    />
                  </motion.div>
                )}

                {/* Legendary: pulsing border ring during opening */}
                <AnimatePresence>
                  {isLegendary && !isRevealed && (
                    <motion.div
                      key="border-ring"
                      aria-hidden
                      className="absolute inset-0 rounded-2xl pointer-events-none border-2"
                      style={{ borderColor: chestTheme.color }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0, 0.9, 0] }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.7, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  )}
                </AnimatePresence>

                {/* Reveal flash */}
                <AnimatePresence>
                  {isRevealed && animCfg.flashOpacity > 0 && (
                    <motion.div
                      key="flash"
                      className="absolute inset-0 pointer-events-none rounded-2xl"
                      style={{ background: `radial-gradient(circle at 50% 42%, ${rarityTheme.color} 0%, transparent 60%)` }}
                      initial={{ opacity: animCfg.flashOpacity }}
                      animate={{ opacity: 0 }}
                      transition={{ duration: 0.5, ease: [0.2, 0, 0.4, 1] }}
                    />
                  )}
                </AnimatePresence>

                {/* ── Chest icon ── */}
                <motion.div
                  className="mx-auto w-fit relative"
                  animate={!isRevealed ? { y: [0, -animCfg.floatY, 0] } : { y: 0 }}
                  transition={!isRevealed
                    ? { duration: animCfg.floatDur, repeat: Infinity, ease: 'easeInOut' }
                    : { type: 'spring', stiffness: 200, damping: 18 }
                  }
                >
                  <motion.div
                    animate={!isRevealed
                      ? {
                          rotate: shakeFrames,
                          scale: scaleFrames,
                          boxShadow: isLegendary
                            ? [`0 0 18px ${chestTheme.glow}88, 0 0 38px ${chestTheme.glow}44`, `0 0 28px ${chestTheme.glow}CC, 0 0 52px ${chestTheme.glow}66`]
                            : `0 0 18px ${chestTheme.glow}88`,
                        }
                      : { rotate: 0, scale: 1.08, boxShadow: `0 0 32px ${chestTheme.glow}CC` }
                    }
                    transition={!isRevealed
                      ? {
                          rotate: { duration: animCfg.chestDur, ease: 'easeInOut', times: shakeFrames.map((_, i) => i / (shakeFrames.length - 1)) },
                          scale: { duration: animCfg.chestDur, ease: 'easeInOut', times: scaleFrames.map((_, i) => i / (scaleFrames.length - 1)) },
                          boxShadow: isLegendary ? { duration: 0.7, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' } : { duration: 0.5 },
                        }
                      : { type: 'spring', stiffness: 220, damping: 16 }
                    }
                    className="w-[76px] h-[76px] rounded-2xl border flex items-center justify-center relative overflow-hidden"
                    style={{
                      borderColor: chestTheme.border,
                      background: `radial-gradient(circle at 50% 35%, ${chestTheme.glow}55 0%, rgba(8,8,16,0.92) 70%)`,
                    }}
                  >
                    {chest.image ? (
                      <img src={chest.image} alt="" className="w-12 h-12 object-contain select-none" style={{ imageRendering: 'pixelated' }} draggable={false} />
                    ) : (
                      <span className="text-4xl">{chest.icon}</span>
                    )}
                  </motion.div>
                </motion.div>

                {/* Status label */}
                <div className="mt-3 h-[18px] relative overflow-hidden">
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={isRevealed ? 'revealed' : 'opening'}
                      className="absolute inset-0 text-[11px] font-mono uppercase tracking-wider text-center"
                      style={{ color: chestTheme.color }}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                    >
                      {isRevealed
                        ? item
                          ? (({ common: 'Bag opened', rare: 'Rare drop!', epic: 'Epic drop!', legendary: 'Legendary!!', mythic: 'Mythic!!' } as Record<string, string>)[item.rarity] ?? 'Bag opened')
                          : 'Bag opened'
                        : 'Opening\u2026'}
                    </motion.p>
                  </AnimatePresence>
                </div>

                <p className="text-sm text-white/80 font-medium mt-0.5">{chest.name}</p>

                {/* Drop count */}
                {isRevealed && (() => {
                  const count = (item ? 1 : 0) + (goldDropped > 0 ? 1 : 0) + (warriorXP > 0 ? 1 : 0) + (seedZipTier ? 1 : 0) + bonusMaterials.length
                  if (count < 2) return null
                  return (
                    <motion.p
                      className="text-[10px] text-gray-500 mt-0.5"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.15, duration: 0.25 }}
                    >
                      {count} items dropped
                    </motion.p>
                  )
                })()}

                {/* ── Loot scroll ── */}
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
                    {(goldDropped > 0 || warriorXP > 0 || seedZipTier || bonusMaterials.length > 0) && scrollPos !== 'start' && (
                      <button
                        type="button"
                        onClick={() => scrollBy('left')}
                        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full flex items-center justify-center transition-all active:scale-90"
                        style={{ background: 'rgba(8,8,16,0.85)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(4px)', marginLeft: '-12px' }}
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M7.5 2L4 6l3.5 4" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </button>
                    )}
                    {(goldDropped > 0 || warriorXP > 0 || seedZipTier || bonusMaterials.length > 0) && scrollPos !== 'end' && (
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
                      {/* Main item card (or "no equipment" placeholder) */}
                      {item ? (
                      <motion.div
                        ref={lootCardRef}
                        onMouseMove={handleLootMouseMove}
                        onMouseEnter={() => setHovering(true)}
                        onMouseLeave={() => { setHovering(false); setTilt({ x: 0, y: 0 }) }}
                        className="rounded-xl border p-3.5 relative overflow-hidden cursor-default snap-start flex-none"
                        style={{
                          width: (goldDropped > 0 || warriorXP > 0 || seedZipTier || bonusMaterials.length > 0) ? '220px' : '100%',
                          borderColor: rarityTheme.border,
                          background: `linear-gradient(135deg, ${rarityTheme.glow}18 0%, rgba(8,8,16,0.95) 60%)`,
                          transform: hovering
                            ? `perspective(600px) rotateY(${tilt.x * 3.5}deg) rotateX(${tilt.y * -3.5}deg)`
                            : undefined,
                          transition: hovering ? 'transform 0.07s ease-out' : 'transform 0.45s ease-out',
                          boxShadow: `0 0 16px ${rarityTheme.glow}44`,
                        }}
                      >
                        <div
                          className="absolute inset-0 pointer-events-none rounded-xl"
                          style={{
                            background: `radial-gradient(circle at ${glowX}% ${glowY}%, ${rarityTheme.glow} 0%, transparent 55%)`,
                            opacity: hovering ? 0.45 : 0.28,
                            transition: hovering ? 'opacity 0.08s' : 'opacity 0.5s',
                          }}
                        />
                        <motion.div
                          className="absolute inset-0 pointer-events-none rounded-xl"
                          animate={{ opacity: [0.25, 0.5, 0.28] }}
                          transition={{ duration: 1.9, repeat: Infinity, ease: 'easeInOut' }}
                          style={{ boxShadow: `inset 0 0 18px ${rarityTheme.glow}` }}
                        />
                        <motion.div
                          className="flex justify-center"
                          animate={{ x: itemX, y: itemY }}
                          transition={{ type: 'spring', stiffness: 220, damping: 22 }}
                        >
                          <motion.div
                            key={`icon:${revealKey}`}
                            initial={{ scale: 0.6, opacity: 0 }}
                            animate={isRevealed
                              ? { scale: ({ common: 1.0, rare: 1.04, epic: 1.08, legendary: 1.14, mythic: 1.18 } as Record<string, number>)[item.rarity] ?? 1.0, opacity: 1 }
                              : { scale: 0.6, opacity: 0 }
                            }
                            transition={{ type: 'spring', stiffness: ({ common: 300, rare: 320, epic: 350, legendary: 400, mythic: 450 } as Record<string, number>)[item.rarity] ?? 300, damping: 18 }}
                          >
                            {item.image ? (
                              <img src={item.image} alt="" className="w-[60px] h-[60px] object-contain select-none" style={{ imageRendering: 'pixelated' }} draggable={false} />
                            ) : (
                              <p className="text-4xl">{item.icon}</p>
                            )}
                          </motion.div>
                        </motion.div>
                        <motion.p
                          className="text-sm text-white font-semibold mt-2 leading-tight"
                          animate={{ x: tilt.x * 1.8, y: tilt.y * -1.2 }}
                          transition={{ type: 'spring', stiffness: 220, damping: 22 }}
                        >
                          {item.name}
                        </motion.p>
                        <motion.p
                          key={`rarity:${revealKey}`}
                          className="text-[10px] font-mono uppercase tracking-wider mt-0.5"
                          style={{ color: rarityTheme.color }}
                          animate={isRevealed && item.rarity !== 'common' ? { scale: [1, 1.22, 1] } : {}}
                          transition={{ duration: 0.38, delay: 0.1 }}
                        >
                          {item.rarity}
                        </motion.p>
                        {item.description && <p className="text-[9px] text-gray-500 italic mt-1 leading-snug">{item.description}</p>}
                        <p className="text-[10px] text-gray-400 mt-1 leading-snug">{getItemPerkDescription(item)}</p>
                      </motion.div>
                      ) : null}

                      {/* Gold bonus card */}
                      {goldDropped > 0 && (
                        <motion.div
                          className="flex-none w-[130px] snap-start rounded-xl border border-amber-500/25 flex flex-col items-center justify-center gap-2 py-4 relative overflow-hidden"
                          style={{ background: 'linear-gradient(160deg, rgba(245,158,11,0.10) 0%, rgba(8,8,16,0.95) 65%)' }}
                          initial={{ opacity: 0, x: 20, scale: 0.88 }}
                          animate={{ opacity: isRevealed ? 1 : 0, x: isRevealed ? 0 : 20, scale: isRevealed ? 1 : 0.88 }}
                          transition={{ type: 'spring', stiffness: 280, damping: 24, delay: 0.07 }}
                        >
                          <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at 50% 35%, rgba(245,158,11,0.18) 0%, transparent 65%)' }} />
                          <span className="text-3xl relative">🪙</span>
                          <span className="text-xl font-bold text-amber-400 tabular-nums relative">+{goldDropped}</span>
                          <span className="text-[9px] font-mono text-amber-500/60 uppercase tracking-widest relative">Gold</span>
                        </motion.div>
                      )}

                      {/* Bonus material cards (one per material) */}
                      {bonusMaterials.map((mat, i) => {
                        const matDef = LOOT_ITEMS.find((x) => x.id === mat.itemId)
                        if (!matDef) return null
                        const matTheme = getRarityTheme(matDef.rarity)
                        return (
                          <motion.div
                            key={mat.itemId}
                            className="flex-none w-[130px] snap-start rounded-xl border flex flex-col items-center justify-center gap-2 py-4 relative overflow-hidden"
                            style={{ borderColor: `${matTheme.color}40`, background: `linear-gradient(160deg, ${matTheme.glow}18 0%, rgba(8,8,16,0.95) 65%)` }}
                            initial={{ opacity: 0, x: 20, scale: 0.88 }}
                            animate={{ opacity: isRevealed ? 1 : 0, x: isRevealed ? 0 : 20, scale: isRevealed ? 1 : 0.88 }}
                            transition={{ type: 'spring', stiffness: 280, damping: 24, delay: 0.1 + i * 0.04 }}
                          >
                            <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(circle at 50% 35%, ${matTheme.glow}28 0%, transparent 65%)` }} />
                            <div className="w-14 h-14 rounded-lg flex items-center justify-center relative" style={{ background: `${matTheme.color}12`, border: `1px solid ${matTheme.color}25`, boxShadow: `0 0 12px ${matTheme.glow}30` }}>
                              {matDef.image ? (
                                <img src={matDef.image} className="w-10 h-10 object-contain" style={{ imageRendering: 'pixelated' }} draggable={false} />
                              ) : (
                                <span className="text-3xl">{matDef.icon}</span>
                              )}
                            </div>
                            <span className="text-lg font-bold tabular-nums relative" style={{ color: matTheme.color }}>×{mat.qty}</span>
                            <span className="text-[9px] font-medium text-center leading-tight px-2 relative" style={{ color: `${matTheme.color}cc` }}>{matDef.name}</span>
                          </motion.div>
                        )
                      })}

                      {/* Warrior XP card */}
                      {warriorXP > 0 && (
                        <motion.div
                          className="flex-none w-[130px] snap-start rounded-xl border border-red-500/25 flex flex-col items-center justify-center gap-2 py-4 relative overflow-hidden"
                          style={{ background: 'linear-gradient(160deg, rgba(239,68,68,0.10) 0%, rgba(8,8,16,0.95) 65%)' }}
                          initial={{ opacity: 0, x: 20, scale: 0.88 }}
                          animate={{ opacity: isRevealed ? 1 : 0, x: isRevealed ? 0 : 20, scale: isRevealed ? 1 : 0.88 }}
                          transition={{ type: 'spring', stiffness: 280, damping: 24, delay: 0.13 }}
                        >
                          <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at 50% 35%, rgba(239,68,68,0.18) 0%, transparent 65%)' }} />
                          <span className="text-3xl relative">🗡️</span>
                          <span className="text-xl font-bold text-red-400 tabular-nums relative">+{warriorXP}</span>
                          <span className="text-[9px] font-mono text-red-500/60 uppercase tracking-widest relative">Warrior XP</span>
                        </motion.div>
                      )}

                      {/* Seed Zip bonus card */}
                      {seedZipTier && (() => {
                        const zipTheme = getRarityTheme(seedZipTier)
                        const zipDisplay = getSeedZipDisplay(seedZipTier)
                        return (
                          <motion.div
                            className="flex-none w-[130px] snap-start rounded-xl border flex flex-col items-center justify-center gap-2 py-4 relative overflow-hidden"
                            style={{ borderColor: zipTheme.border, background: `linear-gradient(160deg, ${zipTheme.glow}18 0%, rgba(8,8,16,0.95) 65%)` }}
                            initial={{ opacity: 0, x: 20, scale: 0.88 }}
                            animate={{ opacity: isRevealed ? 1 : 0, x: isRevealed ? 0 : 20, scale: isRevealed ? 1 : 0.88 }}
                            transition={{ type: 'spring', stiffness: 280, damping: 24, delay: 0.14 }}
                          >
                            <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(circle at 50% 35%, ${zipTheme.glow}30 0%, transparent 65%)` }} />
                            {zipDisplay.image
                              ? <img src={zipDisplay.image} className="w-10 h-10 object-contain relative" />
                              : <span className="text-3xl relative">{zipDisplay.icon}</span>}
                            <span className="text-sm font-semibold text-center leading-tight px-2 relative" style={{ color: zipTheme.color }}>{zipDisplay.name}</span>
                            <span className="text-[9px] font-mono uppercase tracking-widest relative" style={{ color: `${zipTheme.color}88` }}>Seed Zip</span>
                          </motion.div>
                        )
                      })()}

                      {(goldDropped > 0 || warriorXP > 0 || seedZipTier || bonusMaterials.length > 0) && <div className="flex-none w-5" aria-hidden />}
                    </div>
                  </div>
                </motion.div>

                {/* ── Buttons ── */}
                <motion.div
                  className="flex gap-2 mt-4"
                  animate={{ opacity: isRevealed ? 1 : 0, y: isRevealed ? 0 : 8 }}
                  transition={{ duration: 0.28, delay: isRevealed ? 0.18 : 0, ease: 'easeOut' }}
                  style={{ pointerEvents: isRevealed ? 'auto' : 'none' }}
                >
                  {nextAvailable ? (
                    <>
                      <button
                        type="button"
                        onClick={() => { playClickSound(); onOpenNext?.() }}
                        className="flex-1 h-10 rounded-xl text-[13px] font-semibold transition-all active:scale-[0.97]"
                        style={{ color: chestTheme.color, border: `1px solid ${chestTheme.border}`, background: `${chestTheme.color}22` }}
                      >
                        Open more
                      </button>
                      <button
                        type="button"
                        onClick={() => { playClickSound(); onClose() }}
                        className="flex-1 h-10 rounded-xl text-[13px] font-semibold text-white/40 border border-white/10 bg-white/[0.04] hover:text-white/60 hover:bg-white/[0.07] transition-all active:scale-[0.97]"
                      >
                        Done
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { playClickSound(); onClose() }}
                      className="flex-1 h-10 rounded-xl text-[13px] font-semibold transition-all active:scale-[0.97]"
                      style={{ color: chestTheme.color, border: `1px solid ${chestTheme.border}`, background: `${chestTheme.color}22` }}
                    >
                      Done
                    </button>
                  )}
                </motion.div>

                {/* Chain message */}
                <AnimatePresence>
                  {chainMessage && (
                    <motion.p
                      key={chainMessage}
                      className="text-[10px] text-center text-orange-300/90 font-medium mt-2"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      {chainMessage}
                    </motion.p>
                  )}
                </AnimatePresence>
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
