import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ChestType, LootItemDef } from '../../lib/loot'
import { CHEST_DEFS, getRarityTheme, getItemPerkDescription } from '../../lib/loot'
import { SEED_ZIP_LABELS, type SeedZipTier } from '../../lib/farming'
import { MOTION } from '../../lib/motion'
import { PixelConfetti } from '../home/PixelConfetti'
import { playClickSound, playLootRaritySound } from '../../lib/sounds'
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
  seedZipTier?: SeedZipTier | null
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
  seedZipTier,
  onClose,
  nextAvailable = false,
  onOpenNext,
  chainMessage,
  animationSeed,
}: ChestOpenModalProps) {
  const chest = chestType ? CHEST_DEFS[chestType] : null
  const chestRarity = chest?.rarity ?? 'common'
  const animCfg = getAnim(chestRarity)
  const revealKey = `${chestType ?? 'none'}:${item?.id ?? 'none'}:${animationSeed ?? 0}`
  const rarityTheme = getRarityTheme(item?.rarity ?? 'common')
  const chestTheme = getRarityTheme(chestRarity)
  const isLegendary = chestRarity === 'legendary'

  const [phase, setPhase] = useState<'opening' | 'revealed'>('opening')
  const lootCardRef = useRef<HTMLDivElement>(null)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const [hovering, setHovering] = useState(false)

  const shakeFrames = makeShakeFrames(animCfg.shakeMag, animCfg.shakeCount)
  const scaleFrames = makeScaleFrames(animCfg.shakeCount)

  useEffect(() => {
    if (!open) { setPhase('opening'); return }
    setPhase('opening')
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
    <AnimatePresence mode="wait">
      {open && chest && item && (
        <motion.div
          key={revealKey}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0 } }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="fixed inset-0 z-[120] flex items-center justify-center p-4"
          onClick={onClose}
        >
          {/* ── Backdrop layers ── */}
          <motion.div
            className="absolute inset-0 bg-black"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.82 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />

          {/* Colored radial glow */}
          {animCfg.backdropGlow && (
            <motion.div
              className="absolute inset-0 pointer-events-none"
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
              style={{ background: `radial-gradient(ellipse 68% 52% at 50% 40%, ${chestTheme.glow}55 0%, transparent 68%)` }}
            />
          )}

          {/* Legendary: rotating conic rays (on reveal) */}
          {animCfg.hasRays && (
            <motion.div
              className="absolute inset-0 pointer-events-none overflow-hidden"
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

          {/* Reveal flash — radial burst from center */}
          <AnimatePresence>
            {isRevealed && animCfg.flashOpacity > 0 && (
              <motion.div
                key={`flash:${revealKey}`}
                className="absolute inset-0 pointer-events-none"
                style={{ background: `radial-gradient(circle at 50% 42%, ${rarityTheme.color} 0%, transparent 60%)` }}
                initial={{ opacity: animCfg.flashOpacity }}
                animate={{ opacity: 0 }}
                transition={{ duration: 0.5, ease: [0.2, 0, 0.4, 1] }}
              />
            )}
          </AnimatePresence>

          {/* Confetti — fires after reveal */}
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

          {/* ── Card ── */}
          <motion.div
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
            {/* Card ambient glow */}
            <motion.div
              aria-hidden
              className="absolute inset-0 pointer-events-none rounded-2xl"
              style={{ background: `radial-gradient(circle at 50% 12%, ${chestTheme.glow} 0%, transparent 55%)` }}
              animate={{ opacity: isRevealed ? [0.45, 0.65, 0.5] : [0.25, 0.45, 0.25] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            />

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

            {/* ── Chest icon ── */}
            {/* Float wrapper — gentle bob during opening */}
            <motion.div
              className="mx-auto w-fit"
              animate={!isRevealed
                ? { y: [0, -animCfg.floatY, 0] }
                : { y: 0 }
              }
              transition={!isRevealed
                ? { duration: animCfg.floatDur, repeat: Infinity, ease: 'easeInOut' }
                : { type: 'spring', stiffness: 200, damping: 18 }
              }
            >
              {/* Shake wrapper — fires once on mount */}
              <motion.div
                animate={!isRevealed
                  ? { rotate: shakeFrames, scale: scaleFrames }
                  : { rotate: 0, scale: 1.08 }
                }
                transition={!isRevealed
                  ? { duration: animCfg.chestDur, ease: 'easeInOut', times: shakeFrames.map((_, i) => i / (shakeFrames.length - 1)) }
                  : { type: 'spring', stiffness: 220, damping: 16 }
                }
                className="w-[76px] h-[76px] rounded-2xl border flex items-center justify-center relative overflow-hidden"
                style={{
                  borderColor: chestTheme.border,
                  background: `radial-gradient(circle at 50% 35%, ${chestTheme.glow}55 0%, rgba(8,8,16,0.92) 70%)`,
                  boxShadow: `0 0 18px ${chestTheme.glow}88`,
                }}
              >
                {chest.image ? (
                  <img
                    src={chest.image}
                    alt=""
                    className="w-12 h-12 object-contain select-none"
                    style={{ imageRendering: 'pixelated' }}
                    draggable={false}
                  />
                ) : (
                  <span className="text-4xl">{chest.icon}</span>
                )}
              </motion.div>
            </motion.div>

            {/* Status label — AnimatePresence for smooth swap */}
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
                  {isRevealed ? 'Bag opened' : 'Opening\u2026'}
                </motion.p>
              </AnimatePresence>
            </div>

            <p className="text-sm text-white/80 font-medium mt-0.5">{chest.name}</p>

            {/* ── Loot card ── */}
            <motion.div
              className="mt-3"
              animate={{
                opacity: isRevealed ? 1 : 0,
                y: isRevealed ? 0 : 18,
                scale: isRevealed ? 1 : 0.9,
                filter: isRevealed ? 'blur(0px)' : 'blur(4px)',
              }}
              transition={{
                type: 'spring',
                stiffness: 280,
                damping: 24,
                delay: isRevealed ? 0.04 : 0,
                filter: { duration: 0.3, ease: 'easeOut', delay: isRevealed ? 0.04 : 0 },
              }}
              style={{ pointerEvents: isRevealed ? 'auto' : 'none' }}
            >
              <motion.div
                ref={lootCardRef}
                onMouseMove={handleLootMouseMove}
                onMouseEnter={() => setHovering(true)}
                onMouseLeave={() => { setHovering(false); setTilt({ x: 0, y: 0 }) }}
                className="rounded-xl border p-3.5 relative overflow-hidden cursor-default"
                style={{
                  borderColor: rarityTheme.border,
                  background: `linear-gradient(135deg, ${rarityTheme.glow}18 0%, rgba(8,8,16,0.95) 60%)`,
                  transform: hovering
                    ? `perspective(600px) rotateY(${tilt.x * 3.5}deg) rotateX(${tilt.y * -3.5}deg)`
                    : undefined,
                  transition: hovering ? 'transform 0.07s ease-out' : 'transform 0.45s ease-out',
                  boxShadow: `0 0 16px ${rarityTheme.glow}44`,
                }}
              >
                {/* Moving highlight */}
                <div
                  className="absolute inset-0 pointer-events-none rounded-xl"
                  style={{
                    background: `radial-gradient(circle at ${glowX}% ${glowY}%, ${rarityTheme.glow} 0%, transparent 55%)`,
                    opacity: hovering ? 0.45 : 0.28,
                    transition: hovering ? 'opacity 0.08s' : 'opacity 0.5s',
                  }}
                />
                {/* Ambient pulse */}
                <motion.div
                  className="absolute inset-0 pointer-events-none rounded-xl"
                  animate={{ opacity: [0.25, 0.5, 0.28] }}
                  transition={{ duration: 1.9, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ boxShadow: `inset 0 0 18px ${rarityTheme.glow}` }}
                />

                {/* Item image */}
                <motion.div
                  className="flex justify-center"
                  animate={{ x: itemX, y: itemY }}
                  transition={{ type: 'spring', stiffness: 220, damping: 22 }}
                >
                  {item.image ? (
                    <img
                      src={item.image}
                      alt=""
                      className="w-[60px] h-[60px] object-contain select-none"
                      style={{ imageRendering: 'pixelated' }}
                      draggable={false}
                    />
                  ) : (
                    <p className="text-4xl">{item.icon}</p>
                  )}
                </motion.div>

                <motion.p
                  className="text-sm text-white font-semibold mt-2 leading-tight"
                  animate={{ x: tilt.x * 1.8, y: tilt.y * -1.2 }}
                  transition={{ type: 'spring', stiffness: 220, damping: 22 }}
                >
                  {item.name}
                </motion.p>
                <p
                  className="text-[10px] font-mono uppercase tracking-wider mt-0.5"
                  style={{ color: rarityTheme.color }}
                >
                  {item.rarity}
                </p>
                <p className="text-[10px] text-gray-400 mt-1 leading-snug">{getItemPerkDescription(item)}</p>
              </motion.div>
            </motion.div>

            {/* ── Bonus drops ── */}
            <motion.div
              className="flex flex-col items-center gap-1.5 mt-3 min-h-[36px] justify-center"
              animate={{ opacity: isRevealed ? 1 : 0, y: isRevealed ? 0 : 6 }}
              transition={{ duration: 0.28, delay: isRevealed ? 0.12 : 0 }}
              style={{ pointerEvents: isRevealed ? 'auto' : 'none' }}
            >
              {goldDropped > 0 && (
                <div className="flex items-center justify-center gap-1.5 py-1.5 px-3.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <span className="text-amber-400" aria-hidden>🪙</span>
                  <span className="text-sm font-bold text-amber-400 tabular-nums">+{goldDropped}</span>
                </div>
              )}
              {seedZipTier && (
                <div className="flex items-center justify-center gap-1.5 py-1.5 px-3.5 rounded-lg bg-green-500/10 border border-green-500/20">
                  <span aria-hidden>🎒</span>
                  <span className="text-sm font-semibold text-green-300">+ {SEED_ZIP_LABELS[seedZipTier]} Seed Zip</span>
                </div>
              )}
            </motion.div>

            {/* ── Buttons ── */}
            <motion.div
              className="flex gap-2 mt-3"
              animate={{ opacity: isRevealed ? 1 : 0, y: isRevealed ? 0 : 8 }}
              transition={{ duration: 0.28, delay: isRevealed ? 0.18 : 0, ease: 'easeOut' }}
              style={{ pointerEvents: isRevealed ? 'auto' : 'none' }}
            >
              {nextAvailable && (
                <button
                  type="button"
                  onClick={() => { playClickSound(); onOpenNext?.() }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-[0.97]"
                  style={{
                    color: chestTheme.color,
                    border: `1px solid ${chestTheme.border}`,
                    backgroundColor: `${chestTheme.color}1E`,
                  }}
                >
                  Open more
                </button>
              )}
              <button
                type="button"
                onClick={() => { playClickSound(); onClose() }}
                className={`py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-[0.97] ${nextAvailable ? 'px-5' : 'flex-1'}`}
                style={nextAvailable
                  ? { color: 'rgba(156,163,175,0.65)', border: '1px solid rgba(255,255,255,0.09)', backgroundColor: 'rgba(255,255,255,0.04)' }
                  : { color: chestTheme.color, border: `1px solid ${chestTheme.border}`, backgroundColor: `${chestTheme.color}1E` }
                }
              >
                Done
              </button>
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
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
