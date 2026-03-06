import { useEffect, useState, useCallback, useRef, useReducer } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useFarmStore, type HarvestResult } from '../../stores/farmStore'
import { useGoldStore } from '../../stores/goldStore'
import { useAuthStore } from '../../stores/authStore'
import { useArenaStore } from '../../stores/arenaStore'
import { skillLevelFromXP } from '../../lib/skills'
import { supabase } from '../../lib/supabase'
import { syncInventoryToSupabase, fetchFarmFromCloud } from '../../services/supabaseSync'
import { ensureInventoryHydrated, useInventoryStore } from '../../stores/inventoryStore'
import { SEED_DEFS, SLOT_UNLOCK_COSTS, MAX_FARM_SLOTS, getSeedById, formatGrowTime, SEED_ZIP_ITEM_IDS, getSeedZipDisplay, type SeedZipTier } from '../../lib/farming'
import { useAdminConfigStore } from '../../stores/adminConfigStore'
import { LOOT_ITEMS, getRarityTheme } from '../../lib/loot'
import { RARITY_THEME, normalizeRarity } from '../loot/LootUI'
import { PageHeader } from '../shared/PageHeader'
import { GoldDisplay } from '../marketplace/GoldDisplay'
import { PixelConfetti } from '../home/PixelConfetti'
import { MOTION } from '../../lib/motion'
import { playClickSound, playLootRaritySound } from '../../lib/sounds'
import { track } from '../../lib/analytics'
import { ListForSaleModal } from '../inventory/ListForSaleModal'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rarityTheme(rarity: string) {
  return RARITY_THEME[normalizeRarity(rarity as never)] ?? { color: '#9CA3AF', border: 'rgba(156,163,175,0.35)', glow: 'rgba(156,163,175,0.15)' }
}

/** Format seconds as HH:MM:SS or MM:SS */
function fmtCountdown(seconds: number): string {
  if (seconds <= 0) return '00:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const mm = m.toString().padStart(2, '0')
  const ss = s.toString().padStart(2, '0')
  if (h > 0) return `${h}:${mm}:${ss}`
  return `${mm}:${ss}`
}

// ─── Slot countdown hook ──────────────────────────────────────────────────────

function useCountdown(plantedAt: number, growTimeSeconds: number) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, growTimeSeconds - (Date.now() - plantedAt) / 1000),
  )
  useEffect(() => {
    const compute = () => Math.max(0, growTimeSeconds - (Date.now() - plantedAt) / 1000)
    setRemaining(compute())
    if (compute() <= 0) return
    const id = setInterval(() => {
      const r = compute()
      setRemaining(r)
      if (r <= 0) clearInterval(id)
    }, 1000)
    return () => clearInterval(id)
  }, [plantedAt, growTimeSeconds])
  return remaining
}

// ─── Harvest-all summary banner ──────────────────────────────────────────────

function HarvestAllBanner({ results, onDone }: { results: HarvestResult[]; onDone: () => void }) {
  const totalXP = results.reduce((s, r) => s + r.xpGained, 0)
  const zipCount = results.filter((r) => r.seedZipTier).length

  // Aggregate by plant
  const byPlant: Record<string, { icon: string; qty: number }> = {}
  for (const r of results) {
    const item = LOOT_ITEMS.find((x) => x.id === r.yieldPlantId)
    if (!item) continue
    if (!byPlant[r.yieldPlantId]) byPlant[r.yieldPlantId] = { icon: item.icon, qty: 0 }
    byPlant[r.yieldPlantId].qty += r.qty
  }

  useEffect(() => {
    const id = setTimeout(onDone, 3500)
    return () => clearTimeout(id)
  }, [onDone])

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.97 }}
      transition={{ duration: 0.2, ease: MOTION.easing }}
      className="rounded-xl border border-lime-400/30 bg-lime-400/[0.06] px-3 py-2.5"
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-bold text-lime-400 uppercase tracking-wider">Harvested!</span>
        <span className="text-[10px] font-mono text-lime-400/80">+{totalXP} Farmer XP</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {Object.values(byPlant).map((p, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0, y: 6, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: i * MOTION.stagger.normal, duration: MOTION.duration.fast, ease: MOTION.easing }}
            className="text-[12px] font-mono text-white/90"
          >
            {p.icon} <span className="text-lime-400 font-bold">×{p.qty}</span>
          </motion.span>
        ))}
        {zipCount > 0 && (() => {
          const firstTier = results.find((r) => r.seedZipTier)?.seedZipTier
          const d = firstTier ? getSeedZipDisplay(firstTier) : null
          const plantCount = Object.values(byPlant).length
          return (
            <motion.span
              initial={{ opacity: 0, y: 6, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: plantCount * MOTION.stagger.normal, duration: MOTION.duration.fast, ease: MOTION.easing }}
              className="text-[11px] text-gray-300 font-mono flex items-center gap-1"
            >
              {d?.image ? <img src={d.image} className="w-4 h-4 object-contain inline" /> : (d?.icon ?? '🎒')} ×{zipCount} Seed Zip
            </motion.span>
          )
        })()}
      </div>
    </motion.div>
  )
}

// ─── Plot unlock celebration overlay ─────────────────────────────────────────

const PLOT_UNLOCK_SLAM_MS  = 480
const PLOT_UNLOCK_TOTAL_MS = 4000

const PLOT_PARTICLES = Array.from({ length: 24 }, (_, i) => ({
  id: i,
  angle: (i / 24) * 360 + Math.random() * 15,
  dist:  55 + Math.random() * 90,
  size:  10 + Math.random() * 14,
  dur:   0.55 + Math.random() * 0.55,
  delay: Math.random() * 0.12,
  icon:  (['🌱', '🌿', '🍀', '🌾', '🪙'] as const)[Math.floor(Math.random() * 5)],
}))

function PlotUnlockCelebration({ slotIndex, onDone }: { slotIndex: number; onDone: () => void }) {
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setRevealed(true), PLOT_UNLOCK_SLAM_MS)
    const t2 = setTimeout(onDone, PLOT_UNLOCK_TOTAL_MS)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [onDone])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onDone}
      className="fixed inset-0 z-[200] flex items-center justify-center cursor-pointer select-none"
      style={{ background: 'rgba(2,6,2,0.82)', backdropFilter: 'blur(3px)' }}
    >
      {/* Screen flash on enter */}
      <motion.div
        initial={{ opacity: 0.5 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.55, ease: 'easeOut' }}
        className="fixed inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 48%, rgba(132,204,22,0.22) 0%, transparent 70%)' }}
      />

      {/* Soil/leaf particle burst — fires once on reveal */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {revealed && PLOT_PARTICLES.map(p => (
          <motion.span
            key={p.id}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{
              x: Math.cos(p.angle * Math.PI / 180) * p.dist,
              y: Math.sin(p.angle * Math.PI / 180) * p.dist,
              opacity: 0,
              scale: 0.25,
            }}
            transition={{ duration: p.dur, delay: p.delay, ease: 'easeOut' }}
            style={{ position: 'absolute', fontSize: p.size, lineHeight: 1 }}
          >
            {p.icon}
          </motion.span>
        ))}
      </div>

      {/* Main card */}
      <motion.div
        initial={{ scale: 0.38, opacity: 0, y: 48, rotateX: 18 }}
        animate={{ scale: 1, opacity: 1, y: 0, rotateX: 0 }}
        exit={{ scale: 0.88, opacity: 0, y: -20 }}
        transition={{ type: 'spring', stiffness: 420, damping: 26, mass: 0.65 }}
        onClick={e => e.stopPropagation()}
        className="relative flex flex-col items-center gap-4 px-12 py-9 rounded-2xl border overflow-hidden"
        style={{
          background: 'linear-gradient(160deg, #060f06 0%, #0b1a0b 60%, #0e200e 100%)',
          borderColor: 'rgba(132,204,22,0.38)',
          boxShadow: '0 0 0 1px rgba(132,204,22,0.08), 0 0 70px rgba(132,204,22,0.28), 0 0 160px rgba(132,204,22,0.10), 0 16px 48px rgba(0,0,0,0.75)',
        }}
      >
        {/* Shimmer sweep */}
        <motion.div
          animate={{ x: ['-100%', '220%'] }}
          transition={{ duration: 1.6, ease: 'linear', repeat: Infinity, repeatDelay: 0.8, delay: 0.25 }}
          className="absolute top-0 left-0 w-2/5 h-full pointer-events-none"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(132,204,22,0.12), transparent)', zIndex: 1 }}
        />

        {/* Plot number badge */}
        <motion.div
          initial={{ scale: 1.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 22, delay: 0.05 }}
          className="text-[9px] font-black tracking-[0.25em] px-3 py-1 rounded-full border"
          style={{ color: '#84cc16', borderColor: 'rgba(132,204,22,0.3)', background: 'rgba(132,204,22,0.09)', zIndex: 2 }}
        >
          PLOT {slotIndex + 1}
        </motion.div>

        {/* Icon with triple pulse rings */}
        <div className="relative flex items-center justify-center" style={{ zIndex: 2 }}>
          {[0, 1, 2].map(ring => (
            <motion.div
              key={ring}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: [0.8, 2.8 + ring * 0.5], opacity: [0.5, 0] }}
              transition={{
                duration: 0.9,
                delay: ring * 0.12,
                ease: 'easeOut',
                repeat: 1,
                repeatDelay: 1.5,
              }}
              className="absolute rounded-full"
              style={{
                width: 44, height: 44,
                border: '1.5px solid rgba(132,204,22,0.55)',
              }}
            />
          ))}
          <motion.span
            initial={{ scale: 0.2, rotate: -40, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 340, damping: 13, delay: 0.03 }}
            className="text-[64px] leading-none relative"
          >
            🌱
          </motion.span>
        </div>

        {/* "UNLOCKED" stamp */}
        <motion.p
          initial={{ scale: 2.2, opacity: 0, rotate: -6 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 650, damping: 24, delay: 0.06 }}
          className="text-2xl font-black tracking-[0.18em]"
          style={{
            color: '#84cc16',
            textShadow: '0 0 28px rgba(132,204,22,0.65), 0 0 8px rgba(132,204,22,0.4)',
            zIndex: 2,
          }}
        >
          UNLOCKED
        </motion.p>

        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.22 }}
          className="text-[11px] text-gray-400 font-mono -mt-2"
          style={{ zIndex: 2 }}
        >
          New plot ready to plant
        </motion.p>

        {/* Floating icons row */}
        <div className="flex items-center gap-2" style={{ zIndex: 2 }}>
          {['🌾', '🌿', '🌱', '🌿', '🌾'].map((icon, i) => (
            <motion.span
              key={i}
              initial={{ y: 14, opacity: 0, scale: 0.5 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              transition={{ delay: 0.18 + i * 0.07, type: 'spring', stiffness: 380, damping: 16 }}
              className="text-base leading-none"
            >
              {icon}
            </motion.span>
          ))}
        </div>

        {/* Countdown bar */}
        <div className="w-full h-[2px] rounded-full overflow-hidden bg-white/[0.06]" style={{ zIndex: 2 }}>
          <motion.div
            initial={{ width: '100%' }}
            animate={{ width: '0%' }}
            transition={{
              duration: (PLOT_UNLOCK_TOTAL_MS - PLOT_UNLOCK_SLAM_MS) / 1000,
              ease: 'linear',
            }}
            className="h-full rounded-full"
            style={{ background: 'rgba(132,204,22,0.55)' }}
          />
        </div>

        {/* Tap hint */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.32 }}
          transition={{ delay: 0.7 }}
          className="text-[9px] font-mono text-gray-500 -mt-2"
          style={{ zIndex: 2 }}
        >
          tap anywhere to dismiss
        </motion.p>
      </motion.div>
    </motion.div>
  )
}

// ─── Seed Zip reveal modal ───────────────────────────────────────────────────
// Mirrors ChestOpenModal: opening phase (float + shake zip icon) → revealed phase (seed loot card)

const ZIP_OPEN_ANIM: Record<string, {
  openMs: number; particles: number; particleDur: number
  flashOpacity: number; hasRays: boolean; backdropGlow: boolean
  floatY: number; floatDur: number; shakeMag: number; shakeCount: number; chestDur: number
}> = {
  common:    { openMs: 380,  particles: 10, particleDur: 1.0, flashOpacity: 0,    hasRays: false, backdropGlow: false, floatY: 4,  floatDur: 1.6, shakeMag: 5,  shakeCount: 2, chestDur: 0.35 },
  rare:      { openMs: 600,  particles: 18, particleDur: 1.1, flashOpacity: 0.18, hasRays: false, backdropGlow: true,  floatY: 6,  floatDur: 1.4, shakeMag: 9,  shakeCount: 3, chestDur: 0.55 },
  epic:      { openMs: 860,  particles: 24, particleDur: 1.3, flashOpacity: 0.28, hasRays: false, backdropGlow: true,  floatY: 8,  floatDur: 1.2, shakeMag: 13, shakeCount: 4, chestDur: 0.7  },
  legendary: { openMs: 1150, particles: 36, particleDur: 1.7, flashOpacity: 0.45, hasRays: true,  backdropGlow: true,  floatY: 11, floatDur: 1.0, shakeMag: 16, shakeCount: 5, chestDur: 0.9  },
}
function zipShakeFrames(mag: number, count: number): number[] {
  const f = [0]; for (let i = 0; i < count; i++) { const d = 1 - (i + 1) / (count + 1) * 0.45; f.push(i % 2 === 0 ? mag * d : -mag * d) } f.push(0); return f
}
function zipScaleFrames(count: number): number[] {
  const f = [1.0]; for (let i = 0; i < count; i++) { const d = 1 - (i / count) * 0.4; f.push(i % 2 === 0 ? 1 + 0.13 * d : 1 - 0.07 * d) } f.push(1.0); return f
}

// Pre-computed per rarity tier
const ZIP_SHAKE_FRAMES: Record<string, number[]> = Object.fromEntries(
  Object.entries(ZIP_OPEN_ANIM).map(([k, cfg]) => [k, zipShakeFrames(cfg.shakeMag, cfg.shakeCount)]),
)
const ZIP_SCALE_FRAMES: Record<string, number[]> = Object.fromEntries(
  Object.entries(ZIP_OPEN_ANIM).map(([k, cfg]) => [k, zipScaleFrames(cfg.shakeCount)]),
)

function SeedZipRevealModal({ tier, seedId, onClose }: { tier: SeedZipTier; seedId: string; onClose: () => void }) {
  const seed = getSeedById(seedId)
  const plant = seed ? LOOT_ITEMS.find((x) => x.id === seed.yieldPlantId) : null
  const animCfg = ZIP_OPEN_ANIM[seed?.rarity ?? 'common'] ?? ZIP_OPEN_ANIM.common
  const zipTheme = getRarityTheme(tier)         // zip icon theme (based on tier)
  const seedTheme = getRarityTheme(seed?.rarity ?? 'common')  // loot card theme
  const zipDisplay = getSeedZipDisplay(tier)
  const isLegendary = tier === 'legendary'

  const [phase, setPhase] = useState<'opening' | 'revealed'>('opening')
  const lootCardRef = useRef<HTMLDivElement>(null)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const [hovering, setHovering] = useState(false)

  const shakeFrames = ZIP_SHAKE_FRAMES[seed?.rarity ?? 'common'] ?? ZIP_SHAKE_FRAMES.common
  const scaleFrames = ZIP_SCALE_FRAMES[seed?.rarity ?? 'common'] ?? ZIP_SCALE_FRAMES.common

  useEffect(() => {
    const t = setTimeout(() => setPhase('revealed'), animCfg.openMs)
    return () => clearTimeout(t)
  }, [animCfg.openMs])

  useEffect(() => {
    if (phase === 'revealed' && seed) playLootRaritySound(seed.rarity)
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const el = lootCardRef.current; if (!el) return
    const rect = el.getBoundingClientRect()
    setTilt({ x: (e.clientX - rect.left - rect.width / 2) / (rect.width / 2), y: (e.clientY - rect.top - rect.height / 2) / (rect.height / 2) })
  }, [])

  const isRevealed = phase === 'revealed'
  const itemX = tilt.x * 5; const itemY = tilt.y * -3.5
  const glowX = 50 + tilt.x * 14; const glowY = 38 + tilt.y * 10

  if (!seed) return null

  return createPortal(
    <motion.div
      key="zip-modal"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" />

      {/* Confetti fires on reveal */}
      {isRevealed && (
        <PixelConfetti
          originX={0.5} originY={0.4}
          accentColor={seedTheme.color}
          count={animCfg.particles}
          duration={animCfg.particleDur}
        />
      )}

      {/* Card */}
      <motion.div
        initial={{ scale: 0.82, opacity: 0, y: 24 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.88, opacity: 0, y: 16 }}
        transition={{ type: 'spring', stiffness: 340, damping: 28, mass: 0.9 }}
        onClick={(e) => e.stopPropagation()}
        className="w-[300px] rounded-2xl border p-5 text-center relative overflow-hidden"
        style={{
          borderColor: zipTheme.border,
          background: `linear-gradient(160deg, ${zipTheme.glow}1A 0%, rgba(8,8,16,0.97) 55%)`,
          boxShadow: isRevealed
            ? `0 0 ${isLegendary ? '60px' : '32px'} ${zipTheme.glow}, 0 4px 32px rgba(0,0,0,0.7)`
            : `0 0 20px ${zipTheme.glow}66, 0 4px 24px rgba(0,0,0,0.6)`,
          transition: 'box-shadow 0.5s ease',
        }}
      >
        {/* Ambient glow — continuous */}
        <motion.div
          aria-hidden
          className="absolute inset-0 pointer-events-none rounded-2xl"
          style={{ background: `radial-gradient(circle at 50% 12%, ${zipTheme.glow} 0%, transparent 55%)` }}
          animate={{ opacity: isRevealed ? [0.45, 0.65, 0.5] : [0.25, 0.45, 0.25] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Inner content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={seedId}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.14, ease: 'easeOut' } }}
            exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.1, ease: 'easeIn' } }}
          >
            {/* Backdrop glow */}
            {animCfg.backdropGlow && (
              <motion.div
                className="absolute inset-0 pointer-events-none rounded-2xl"
                initial={{ opacity: 0 }}
                animate={{ opacity: isLegendary && !isRevealed ? [0, 0.7, 0.4, 0.8, 0.4] : isRevealed ? 0.65 : 0.3 }}
                transition={{ duration: isLegendary && !isRevealed ? animCfg.openMs / 1000 : 0.5, repeat: isLegendary && !isRevealed ? Infinity : 0, ease: 'easeInOut' }}
                style={{ background: `radial-gradient(ellipse 120% 80% at 50% 0%, ${zipTheme.glow}50 0%, transparent 70%)` }}
              />
            )}

            {/* Legendary rotating rays */}
            {animCfg.hasRays && (
              <motion.div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl" animate={{ opacity: isRevealed ? 1 : 0 }} transition={{ duration: 0.6, ease: 'easeOut' }}>
                <motion.div
                  className="absolute inset-0"
                  style={{ background: `conic-gradient(from 0deg at 50% 42%, transparent 0deg, ${seedTheme.color}18 18deg, transparent 36deg, transparent 72deg, ${seedTheme.color}10 90deg, transparent 108deg, transparent 144deg, ${seedTheme.color}18 162deg, transparent 180deg, transparent 216deg, ${seedTheme.color}0E 234deg, transparent 252deg, transparent 288deg, ${seedTheme.color}16 306deg, transparent 324deg, transparent 342deg, ${seedTheme.color}12 354deg, transparent 360deg)` }}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
                />
              </motion.div>
            )}

            {/* Legendary pulsing border ring during opening */}
            <AnimatePresence>
              {isLegendary && !isRevealed && (
                <motion.div key="border-ring" aria-hidden className="absolute inset-0 rounded-2xl pointer-events-none border-2" style={{ borderColor: zipTheme.color }}
                  initial={{ opacity: 0 }} animate={{ opacity: [0, 0.9, 0] }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.7, repeat: Infinity, ease: 'easeInOut' }}
                />
              )}
            </AnimatePresence>

            {/* Reveal flash */}
            <AnimatePresence>
              {isRevealed && animCfg.flashOpacity > 0 && (
                <motion.div key="flash" className="absolute inset-0 pointer-events-none rounded-2xl"
                  style={{ background: `radial-gradient(circle at 50% 42%, ${seedTheme.color} 0%, transparent 60%)` }}
                  initial={{ opacity: animCfg.flashOpacity }} animate={{ opacity: 0 }}
                  transition={{ duration: 0.5, ease: [0.2, 0, 0.4, 1] }}
                />
              )}
            </AnimatePresence>

            {/* Zip icon — floats & shakes while opening */}
            <motion.div
              className="mx-auto w-fit relative"
              animate={!isRevealed ? { y: [0, -animCfg.floatY, 0] } : { y: 0 }}
              transition={!isRevealed ? { duration: animCfg.floatDur, repeat: Infinity, ease: 'easeInOut' } : { type: 'spring', stiffness: 200, damping: 18 }}
            >
              <motion.div
                animate={!isRevealed ? { rotate: shakeFrames, scale: scaleFrames } : { rotate: 0, scale: 1.08 }}
                transition={!isRevealed
                  ? { duration: animCfg.chestDur, ease: 'easeInOut', times: shakeFrames.map((_, i) => i / (shakeFrames.length - 1)) }
                  : { type: 'spring', stiffness: 220, damping: 16 }}
                className="w-[76px] h-[76px] rounded-2xl border flex items-center justify-center relative overflow-hidden"
                style={{ borderColor: zipTheme.border, background: `radial-gradient(circle at 50% 35%, ${zipTheme.glow}55 0%, rgba(8,8,16,0.92) 70%)`, boxShadow: `0 0 18px ${zipTheme.glow}88` }}
              >
                {zipDisplay.image
                  ? <img src={zipDisplay.image} alt="" className="w-12 h-12 object-contain select-none" draggable={false} />
                  : <span className="text-4xl">{zipDisplay.icon}</span>}
              </motion.div>
            </motion.div>

            {/* Status label */}
            <div className="mt-3 h-[18px] relative overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.p key={isRevealed ? 'revealed' : 'opening'}
                  className="absolute inset-0 text-[11px] font-mono uppercase tracking-wider text-center"
                  style={{ color: zipTheme.color }}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                >
                  {isRevealed ? 'Seed Zip Opened' : 'Opening\u2026'}
                </motion.p>
              </AnimatePresence>
            </div>

            <p className="text-sm text-white/80 font-medium mt-0.5">{zipDisplay.name}</p>

            {/* Seed loot card — fades in on reveal */}
            <motion.div
              className="mt-3"
              animate={{ opacity: isRevealed ? 1 : 0, y: isRevealed ? 0 : 18, scale: isRevealed ? 1 : 0.9, filter: isRevealed ? 'blur(0px)' : 'blur(4px)' }}
              transition={{ type: 'spring', stiffness: 280, damping: 24, delay: isRevealed ? 0.04 : 0, filter: { duration: 0.3, ease: 'easeOut', delay: isRevealed ? 0.04 : 0 } }}
              style={{ pointerEvents: isRevealed ? 'auto' : 'none' }}
            >
              <motion.div
                ref={lootCardRef}
                onMouseMove={handleMouseMove}
                onMouseEnter={() => setHovering(true)}
                onMouseLeave={() => { setHovering(false); setTilt({ x: 0, y: 0 }) }}
                className="rounded-xl border p-3.5 relative overflow-hidden cursor-default"
                style={{
                  borderColor: seedTheme.border,
                  background: `linear-gradient(135deg, ${seedTheme.glow}18 0%, rgba(8,8,16,0.95) 60%)`,
                  transform: hovering ? `perspective(600px) rotateY(${tilt.x * 3.5}deg) rotateX(${tilt.y * -3.5}deg)` : undefined,
                  transition: hovering ? 'transform 0.07s ease-out' : 'transform 0.45s ease-out',
                  boxShadow: `0 0 16px ${seedTheme.glow}44`,
                }}
              >
                <div className="absolute inset-0 pointer-events-none rounded-xl"
                  style={{ background: `radial-gradient(circle at ${glowX}% ${glowY}%, ${seedTheme.glow} 0%, transparent 55%)`, opacity: hovering ? 0.45 : 0.28, transition: hovering ? 'opacity 0.08s' : 'opacity 0.5s' }}
                />
                <motion.div className="absolute inset-0 pointer-events-none rounded-xl"
                  animate={{ opacity: [0.25, 0.5, 0.28] }}
                  transition={{ duration: 1.9, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ boxShadow: `inset 0 0 18px ${seedTheme.glow}` }}
                />
                <motion.div className="flex justify-center" animate={{ x: itemX, y: itemY }} transition={{ type: 'spring', stiffness: 220, damping: 22 }}>
                  {seed.image
                    ? <img src={seed.image} alt="" className="w-10 h-10 object-contain" draggable={false} />
                    : <p className="text-4xl">{seed.icon}</p>}
                </motion.div>
                <motion.p className="text-sm text-white font-semibold mt-2 leading-tight" animate={{ x: tilt.x * 1.8, y: tilt.y * -1.2 }} transition={{ type: 'spring', stiffness: 220, damping: 22 }}>
                  {seed.name}
                </motion.p>
                <p className="text-[10px] font-mono uppercase tracking-wider mt-0.5" style={{ color: seedTheme.color }}>{seed.rarity}</p>
                <p className="text-[10px] text-gray-400 mt-1 leading-snug">
                  ⏱ {formatGrowTime(seed.growTimeSeconds)}
                  {plant && <span className="ml-2">· yields {plant.icon} ×{seed.yieldMin}–{seed.yieldMax}</span>}
                </p>
              </motion.div>
            </motion.div>

            {/* Done button */}
            <motion.div
              className="mt-4"
              animate={{ opacity: isRevealed ? 1 : 0, y: isRevealed ? 0 : 8 }}
              transition={{ duration: 0.28, delay: isRevealed ? 0.18 : 0, ease: 'easeOut' }}
              style={{ pointerEvents: isRevealed ? 'auto' : 'none' }}
            >
              <button
                type="button"
                onClick={() => { playClickSound(); onClose() }}
                className="w-full h-10 rounded-xl text-[13px] font-semibold transition-all active:scale-[0.97]"
                style={{ color: zipTheme.color, border: `1px solid ${zipTheme.border}`, background: `${zipTheme.color}22` }}
              >
                Done
              </button>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </motion.div>,
    document.body
  )
}

// ─── Seed Zip section ────────────────────────────────────────────────────────

const ZIP_TIER_ORDER: SeedZipTier[] = ['common', 'rare', 'epic', 'legendary']

function SeedCabinetSection() {
  const seeds = useFarmStore((s) => s.seeds)
  const seedCabinetUnlocked = useFarmStore((s) => s.seedCabinetUnlocked)
  const unlockSeedCabinet = useFarmStore((s) => s.unlockSeedCabinet)
  const transferSeedsFromInventory = useFarmStore((s) => s.transferSeedsFromInventory)
  const gold = useGoldStore((s) => s.gold)
  const addGold = useGoldStore((s) => s.addGold)
  const slimeKills = useArenaStore((s) => s.killCounts['slime'] ?? 0)
  const farmerLevel = skillLevelFromXP(
    (() => {
      try {
        const stored = JSON.parse(localStorage.getItem('grindly_skill_xp') || '{}') as Record<string, number>
        return stored['farmer'] ?? 0
      } catch { return 0 }
    })()
  )
  const inventoryItems = useInventoryStore((s) => s.items)

  // When the cabinet is open, pull any seeds sitting in the inventory into the cabinet
  useEffect(() => {
    if (!seedCabinetUnlocked) return
    transferSeedsFromInventory()
  }, [seedCabinetUnlocked, inventoryItems, transferSeedsFromInventory])

  const totalSeeds = Object.values(seeds).reduce((a, b) => a + b, 0)

  const UNLOCK_COST = 3000
  const REQUIRED_LEVEL = 20
  const REQUIRED_SLIMES = 20

  const meetsLevel = farmerLevel >= REQUIRED_LEVEL
  const meetsSlimes = slimeKills >= REQUIRED_SLIMES
  const meetsGold = gold >= UNLOCK_COST
  const canUnlock = meetsLevel && meetsSlimes && meetsGold

  if (!seedCabinetUnlocked) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-discord-card/70 p-3">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-base">🗄</span>
          <p className="text-[11px] font-semibold text-white font-mono">Seed Cabinet</p>
          <span className="text-base ml-auto">🔒</span>
        </div>
        <p className="text-[10px] text-gray-400 mb-3">Store all your seeds in one place</p>

        <div className="space-y-2 mb-3">
          {([
            { label: `Farmer Level ${REQUIRED_LEVEL}`, met: meetsLevel, progress: `${farmerLevel} / ${REQUIRED_LEVEL}` },
            { label: `20 Slime Kills`, met: meetsSlimes, progress: `${slimeKills} / ${REQUIRED_SLIMES}` },
            { label: `3000 Gold`, met: meetsGold, progress: `${gold} / ${UNLOCK_COST}` },
          ] as const).map(({ label, met, progress }) => (
            <div key={label} className="flex items-center gap-2">
              <span className="text-[11px]">{met ? '✓' : '✗'}</span>
              <span className={`text-[10px] font-mono flex-1 ${met ? 'text-green-400' : 'text-gray-500'}`}>{label}</span>
              <span className="text-[9px] font-mono text-gray-500">{progress}</span>
            </div>
          ))}
        </div>

        <button
          type="button"
          disabled={!canUnlock}
          onClick={() => {
            if (!canUnlock) return
            playClickSound()
            addGold(-UNLOCK_COST)
            unlockSeedCabinet()
          }}
          className={`w-full py-1.5 rounded-lg border text-[10px] font-semibold transition-all ${
            canUnlock
              ? 'border-amber-500/50 text-amber-300 hover:bg-amber-500/15 active:scale-[0.98]'
              : 'border-white/[0.06] text-gray-600 cursor-not-allowed'
          }`}
        >
          Unlock — {UNLOCK_COST}g
        </button>
      </div>
    )
  }

  // Unlocked state
  return (
    <div className="rounded-xl border border-white/[0.08] bg-discord-card/70 p-3">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-base">🗄</span>
          <p className="text-[10px] uppercase tracking-wider text-gray-300 font-mono">Seed Cabinet</p>
        </div>
        {totalSeeds > 0 && (
          <span className="text-[10px] text-gray-400 font-mono">{totalSeeds} total</span>
        )}
      </div>

      {totalSeeds === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6">
          <span className="text-3xl">🌱</span>
          <p className="text-xs text-gray-400 text-center">No seeds stored</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {SEED_DEFS.filter((s) => (seeds[s.id] ?? 0) > 0).map((seed) => {
            const t = rarityTheme(seed.rarity)
            return (
              <div
                key={seed.id}
                className="rounded-lg border flex items-center gap-2.5 px-2.5 py-2"
                style={{ borderColor: t.border, background: `linear-gradient(135deg, ${t.glow}0C 0%, rgba(10,10,20,0.85) 60%)` }}
              >
                {seed.image
                  ? <img src={seed.image} alt="" className="w-5 h-5 object-contain shrink-0" />
                  : <span className="text-lg shrink-0">{seed.icon}</span>}
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium text-white truncate">{seed.name}</p>
                  <p className="text-[8px] font-mono uppercase mt-0.5" style={{ color: t.color }}>
                    {seed.rarity} · {formatGrowTime(seed.growTimeSeconds)}
                  </p>
                </div>
                <span className="text-sm font-mono font-bold shrink-0 mr-1" style={{ color: t.color }}>
                  ×{seeds[seed.id]}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SeedZipSection() {
  const seedZips = useFarmStore((s) => s.seedZips)
  const openSeedZip = useFarmStore((s) => s.openSeedZip)
  const removeSeedZip = useFarmStore((s) => s.removeSeedZip)
  const [lastOpened, setLastOpened] = useState<{ tier: SeedZipTier; seedId: string } | null>(null)
  const [sellTarget, setSellTarget] = useState<SeedZipTier | null>(null)
  useAdminConfigStore((s) => s.rev) // re-render when admin config changes

  const totalZips = ZIP_TIER_ORDER.reduce((acc, t) => acc + (seedZips[t] ?? 0), 0)

  const handleOpen = useCallback((tier: SeedZipTier) => {
    playClickSound()
    const seedId = openSeedZip(tier)
    if (seedId) {
      setLastOpened({ tier, seedId })
    }
  }, [openSeedZip])

  if (totalZips === 0) return null

  return (
    <div className="rounded-xl border border-white/[0.08] bg-discord-card/70 p-3">
      <p className="text-[10px] uppercase tracking-wider text-gray-300 font-mono mb-2.5">
        Seed Zips <span className="text-white/70 ml-0.5">{totalZips}</span>
      </p>

      <div className="space-y-1.5">
        {ZIP_TIER_ORDER.filter((tier) => (seedZips[tier] ?? 0) > 0).map((tier) => {
          const t = rarityTheme(tier)
          const count = seedZips[tier] ?? 0
          return (
            <motion.div key={tier} layout className="rounded-lg border flex items-center gap-2.5 px-2.5 py-2"
              style={{ borderColor: t.border, background: `linear-gradient(135deg, ${t.glow}10 0%, rgba(10,10,20,0.88) 60%)` }}
            >
              {(() => { const d = getSeedZipDisplay(tier); return d.image ? <img src={d.image} className="w-6 h-6 object-contain shrink-0" /> : <span className="text-xl shrink-0">{d.icon}</span> })()}
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-white">{getSeedZipDisplay(tier).name}</p>
                <p className="text-[9px] text-gray-400 mt-0.5">Contains a {tier} seed</p>
              </div>
              <span className="text-sm font-mono font-bold shrink-0 mr-2" style={{ color: t.color }}>×{count}</span>
              <motion.button
                type="button"
                whileTap={{ scale: 0.93 }}
                onClick={() => { playClickSound(); setSellTarget(tier) }}
                className="shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors text-amber-300 border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25"
              >
                Sell
              </motion.button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.93 }}
                onClick={() => handleOpen(tier)}
                className="shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors"
                style={{ color: t.color, backgroundColor: `${t.color}22`, border: `1px solid ${t.border}` }}
              >
                Open
              </motion.button>
            </motion.div>
          )
        })}
      </div>

      {/* Seed Zip reveal modal */}
      <AnimatePresence>
        {lastOpened && (
          <SeedZipRevealModal
            key="zip-modal"
            tier={lastOpened.tier}
            seedId={lastOpened.seedId}
            onClose={() => setLastOpened(null)}
          />
        )}
      </AnimatePresence>

      {sellTarget && (
        <ListForSaleModal
          itemId={SEED_ZIP_ITEM_IDS[sellTarget]}
          maxQty={seedZips[sellTarget] ?? 1}
          onDeductItem={(qty) => removeSeedZip(sellTarget, qty)}
          onClose={() => setSellTarget(null)}
          onListed={() => setSellTarget(null)}
        />
      )}
    </div>
  )
}

// ─── Harvest Claim All Modal ─────────────────────────────────────────────────
// Full chest-style reveal modal for the "Claim All" button.
// Shows every harvest result as a scrollable card; arrows appear when multiple.

function HarvestClaimModal({ results, onClose }: { results: HarvestResult[]; onClose: () => void }) {
  const totalXP = results.reduce((s, r) => s + r.xpGained, 0)
  const hasMultiple = results.length > 1

  // Animation tier based on result count
  const tier: SeedZipTier =
    results.length >= 5 ? 'legendary'
    : results.length >= 3 ? 'epic'
    : results.length >= 2 ? 'rare'
    : 'common'
  const animCfg = ZIP_OPEN_ANIM[tier]
  const shakeFrames = ZIP_SHAKE_FRAMES[tier] ?? ZIP_SHAKE_FRAMES.common
  const scaleFrames = ZIP_SCALE_FRAMES[tier] ?? ZIP_SCALE_FRAMES.common

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

  const doScroll = useCallback((dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'right' ? 160 : -160, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    setPhase('opening')
    if (scrollRef.current) scrollRef.current.scrollLeft = 0
    setScrollPos('start')
    playLootRaritySound('common')
    const t = setTimeout(() => setPhase('revealed'), animCfg.openMs)
    return () => clearTimeout(t)
  }, [animCfg.openMs])

  useEffect(() => {
    if (phase !== 'revealed') return
    const RARITY_ORD = ['common', 'rare', 'epic', 'legendary', 'mythic']
    const best = results.reduce((a, r) => {
      const rarity = LOOT_ITEMS.find((x) => x.id === r.yieldPlantId)?.rarity ?? 'common'
      return RARITY_ORD.indexOf(rarity) > RARITY_ORD.indexOf(a) ? rarity : a
    }, 'common')
    playLootRaritySound(best)
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  const isRevealed = phase === 'revealed'

  const LIME = '#84cc16'
  const LIME_BORDER = 'rgba(132,204,22,0.3)'
  const LIME_GLOW = 'rgba(132,204,22,0.15)'

  if (typeof document === 'undefined') return null
  return createPortal(
    <AnimatePresence>
      <motion.div
        key="harvest-claim-modal"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="fixed inset-0 z-[120] flex items-center justify-center p-4"
        onClick={isRevealed ? onClose : undefined}
      >
        <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" />

        {isRevealed && (
          <PixelConfetti originX={0.5} originY={0.4} accentColor={LIME} count={animCfg.particles} duration={animCfg.particleDur} />
        )}

        <motion.div
          key="harvest-claim-card"
          initial={{ scale: 0.82, opacity: 0, y: 24 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.88, opacity: 0, y: 16 }}
          transition={{ type: 'spring', stiffness: 340, damping: 28, mass: 0.9 }}
          onClick={(e) => e.stopPropagation()}
          className="w-[300px] rounded-2xl border p-5 text-center relative overflow-hidden"
          style={{
            borderColor: LIME_BORDER,
            background: `linear-gradient(160deg, ${LIME_GLOW}1A 0%, rgba(8,8,16,0.97) 55%)`,
            boxShadow: isRevealed
              ? `0 0 32px ${LIME_GLOW}, 0 4px 32px rgba(0,0,0,0.7)`
              : `0 0 20px ${LIME_GLOW}66, 0 4px 24px rgba(0,0,0,0.6)`,
            transition: 'box-shadow 0.5s ease',
          }}
        >
          {/* Ambient glow */}
          <motion.div
            aria-hidden
            className="absolute inset-0 pointer-events-none rounded-2xl"
            style={{ background: `radial-gradient(circle at 50% 12%, ${LIME_GLOW} 0%, transparent 55%)` }}
            animate={{ opacity: isRevealed ? [0.45, 0.65, 0.5] : [0.25, 0.45, 0.25] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Basket icon — floats + shakes during opening */}
          <motion.div
            className="mx-auto w-fit relative"
            animate={!isRevealed ? { y: [0, -animCfg.floatY, 0] } : { y: 0 }}
            transition={!isRevealed
              ? { duration: animCfg.floatDur, repeat: Infinity, ease: 'easeInOut' }
              : { type: 'spring', stiffness: 200, damping: 18 }}
          >
            <motion.div
              animate={!isRevealed
                ? { rotate: shakeFrames, scale: scaleFrames }
                : { rotate: 0, scale: 1.08 }}
              transition={!isRevealed
                ? { duration: animCfg.chestDur, ease: 'easeInOut', times: shakeFrames.map((_, i) => i / (shakeFrames.length - 1)) }
                : { type: 'spring', stiffness: 220, damping: 16 }}
              className="w-[76px] h-[76px] rounded-2xl border flex items-center justify-center relative overflow-hidden"
              style={{
                borderColor: LIME_BORDER,
                background: `radial-gradient(circle at 50% 35%, ${LIME_GLOW}55 0%, rgba(8,8,16,0.92) 70%)`,
                boxShadow: `0 0 18px ${LIME_GLOW}88`,
              }}
            >
              <span className="text-4xl">🧺</span>
            </motion.div>
          </motion.div>

          {/* Status label */}
          <div className="mt-3 h-[18px] relative overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.p
                key={isRevealed ? 'revealed' : 'opening'}
                className="absolute inset-0 text-[11px] font-mono uppercase tracking-wider text-center"
                style={{ color: LIME }}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                {isRevealed
                  ? (hasMultiple ? `${results.length} plots harvested!` : 'Harvested!')
                  : 'Collecting\u2026'}
              </motion.p>
            </AnimatePresence>
          </div>

          <p className="text-sm text-white/80 font-medium mt-0.5">Claim All</p>

          {/* Harvest cards scroll */}
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
              {/* Left scroll arrow */}
              {hasMultiple && scrollPos !== 'start' && (
                <button
                  type="button"
                  onClick={() => doScroll('left')}
                  className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full flex items-center justify-center transition-all active:scale-90"
                  style={{ background: 'rgba(8,8,16,0.85)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(4px)', marginLeft: '-12px' }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M7.5 2L4 6l3.5 4" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              )}
              {/* Right scroll arrow */}
              {hasMultiple && scrollPos !== 'end' && (
                <button
                  type="button"
                  onClick={() => doScroll('right')}
                  className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full flex items-center justify-center transition-all active:scale-90"
                  style={{ background: 'rgba(8,8,16,0.85)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(4px)', marginRight: '-12px' }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4.5 2L8 6l-3.5 4" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              )}

              <div
                ref={scrollRef}
                onScroll={updateScrollPos}
                className="flex gap-2.5 overflow-x-auto snap-x snap-mandatory"
                style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
              >
                {results.map((r, i) => {
                  const plant = LOOT_ITEMS.find((x) => x.id === r.yieldPlantId)
                  const pt = getRarityTheme(plant?.rarity ?? 'common')
                  return (
                    <motion.div
                      key={i}
                      className="snap-start rounded-xl border p-3 relative overflow-hidden flex flex-col items-center gap-1.5 flex-none"
                      style={{
                        width: hasMultiple ? '140px' : '100%',
                        borderColor: pt.border,
                        background: `linear-gradient(135deg, ${pt.glow}18 0%, rgba(8,8,16,0.95) 60%)`,
                        boxShadow: `0 0 12px ${pt.glow}33`,
                      }}
                      initial={{ opacity: 0, x: 16, scale: 0.9 }}
                      animate={{ opacity: isRevealed ? 1 : 0, x: isRevealed ? 0 : 16, scale: isRevealed ? 1 : 0.9 }}
                      transition={{ type: 'spring', stiffness: 280, damping: 24, delay: 0.04 + i * 0.07 }}
                    >
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{ background: `radial-gradient(circle at 50% 30%, ${pt.glow}22 0%, transparent 65%)` }}
                      />
                      <span className="text-3xl relative">{plant?.icon ?? '🌱'}</span>
                      <p className="text-[11px] text-white font-semibold relative leading-tight">{plant?.name ?? r.yieldPlantId}</p>
                      <p className="text-xl font-bold relative" style={{ color: pt.color }}>×{r.qty}</p>
                      <p className="text-[9px] font-mono text-lime-400 relative">+{r.xpGained} XP</p>
                      {r.seedZipTier && (() => {
                        const zt = getRarityTheme(r.seedZipTier!)
                        const zd = getSeedZipDisplay(r.seedZipTier!)
                        return (
                          <div
                            className="flex items-center gap-1 mt-0.5 px-1.5 py-0.5 rounded-md border relative"
                            style={{ borderColor: zt.border, background: `${zt.glow}15` }}
                          >
                            {zd.image
                              ? <img src={zd.image} className="w-3 h-3 object-contain" />
                              : <span className="text-[10px]">{zd.icon}</span>}
                            <span className="text-[8px] font-mono" style={{ color: zt.color }}>Zip!</span>
                          </div>
                        )
                      })()}
                    </motion.div>
                  )
                })}

                {/* Total XP card — only when multiple results */}
                {hasMultiple && (
                  <motion.div
                    className="flex-none w-[120px] snap-start rounded-xl border border-lime-400/20 flex flex-col items-center justify-center gap-1.5 py-4 relative overflow-hidden"
                    style={{ background: 'linear-gradient(160deg, rgba(132,204,22,0.08) 0%, rgba(8,8,16,0.95) 65%)' }}
                    initial={{ opacity: 0, x: 20, scale: 0.88 }}
                    animate={{ opacity: isRevealed ? 1 : 0, x: isRevealed ? 0 : 20, scale: isRevealed ? 1 : 0.88 }}
                    transition={{ type: 'spring', stiffness: 280, damping: 24, delay: 0.04 + results.length * 0.07 }}
                  >
                    <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at 50% 35%, rgba(132,204,22,0.15) 0%, transparent 65%)' }} />
                    <span className="text-2xl relative">🌾</span>
                    <span className="text-base font-bold text-lime-400 tabular-nums relative">+{totalXP}</span>
                    <span className="text-[9px] font-mono text-lime-500/60 uppercase tracking-widest relative">Total XP</span>
                  </motion.div>
                )}

                {hasMultiple && <div className="flex-none w-5" aria-hidden />}
              </div>
            </div>
          </motion.div>

          {/* Single result: XP line below card */}
          {!hasMultiple && (
            <motion.p
              className="text-[11px] text-lime-400 font-mono mt-1.5"
              animate={{ opacity: isRevealed ? 1 : 0 }}
              transition={{ delay: 0.2 }}
            >
              +{totalXP} Farmer XP
            </motion.p>
          )}

          {/* Done button */}
          <motion.div
            className="mt-4"
            animate={{ opacity: isRevealed ? 1 : 0, y: isRevealed ? 0 : 8 }}
            transition={{ duration: 0.28, delay: isRevealed ? 0.18 : 0, ease: 'easeOut' }}
            style={{ pointerEvents: isRevealed ? 'auto' : 'none' }}
          >
            <button
              type="button"
              onClick={() => { playClickSound(); onClose() }}
              className="w-full h-10 rounded-xl text-[13px] font-semibold transition-all active:scale-[0.97]"
              style={{ color: LIME, border: `1px solid ${LIME_BORDER}`, background: `${LIME}22` }}
            >
              Done
            </button>
          </motion.div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}

// ─── Harvest result modal ────────────────────────────────────────────────────

function HarvestRevealModal({ result, onClose }: { result: HarvestResult; onClose: () => void }) {
  const plant = LOOT_ITEMS.find((x) => x.id === result.yieldPlantId)
  const t = getRarityTheme(plant?.rarity ?? 'common')
  const zipT = result.seedZipTier ? rarityTheme(result.seedZipTier) : null

  useEffect(() => {
    if (plant) playLootRaritySound(plant.rarity)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.14, ease: MOTION.easing }}
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      onClick={() => { playClickSound(); onClose() }}
    >
      {/* Solid backdrop — no blur, matches ChestOpenModal */}
      <div className="absolute inset-0 bg-discord-darker" />

      <PixelConfetti originX={0.5} originY={0.42} accentColor={t.color} duration={1.1} />

      <motion.div
        initial={{ scale: 0.85, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 12 }}
        transition={{ duration: 0.18, ease: MOTION.easing }}
        onClick={(e) => e.stopPropagation()}
        className="w-[300px] rounded-2xl border p-5 text-center space-y-3 relative overflow-hidden"
        style={{ borderColor: t.border, background: t.panel, boxShadow: `0 0 28px ${t.glow}` }}
      >
        {/* Pulsing bg glow */}
        <motion.div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{ background: `radial-gradient(circle at 50% 20%, ${t.glow} 0%, transparent 58%)` }}
          initial={{ opacity: 0.4, scale: 0.98 }}
          animate={{ opacity: [0.32, 0.55, 0.4], scale: [0.98, 1.02, 1] }}
          transition={{ duration: 2.1, repeat: Infinity, ease: MOTION.easing }}
        />

        {/* Plant icon box */}
        <motion.div
          initial={{ rotate: -12, scale: 0.6, opacity: 0 }}
          animate={{ rotate: [0, -4, 4, 0], scale: [0.6, 1.15, 0.95, 1.0], opacity: 1 }}
          transition={{ duration: 0.55, ease: MOTION.easing }}
          className="mx-auto w-20 h-20 rounded-2xl bg-discord-darker border flex items-center justify-center text-4xl"
          style={{ borderColor: t.border }}
        >
          {plant?.icon ?? '🌱'}
        </motion.div>

        <p className="text-[11px] font-mono uppercase tracking-wider" style={{ color: t.color }}>
          Harvested
        </p>

        <p className="text-sm text-white font-semibold">
          {plant?.name ?? result.yieldPlantId}
          <span className="ml-2 font-black" style={{ color: t.color }}>×{result.qty}</span>
        </p>

        {/* Info card */}
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: [0.92, 1.05, 1] }}
          transition={{ delay: 0.2, duration: MOTION.duration.base, ease: MOTION.easing }}
          className="rounded-xl border p-3 relative overflow-hidden space-y-2"
          style={{ borderColor: t.border, backgroundColor: `${t.color}14` }}
        >
          <motion.div
            className="absolute inset-0 pointer-events-none rounded-xl"
            initial={{ opacity: 0.35 }}
            animate={{ opacity: [0.3, 0.6, 0.35] }}
            transition={{ duration: 1.7, repeat: Infinity, ease: MOTION.easing }}
            style={{ boxShadow: `0 0 20px ${t.glow}` }}
          />

          {/* XP */}
          <div className="flex items-center justify-between relative">
            <span className="text-[10px] text-gray-400 font-mono">Farmer XP</span>
            <span className="text-sm font-bold text-lime-400">+{result.xpGained}</span>
          </div>

          {/* Seed Zip bonus */}
          {result.seedZipTier && zipT && (
            <div
              className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 relative"
              style={{ borderColor: zipT.border, background: `${zipT.glow}12` }}
            >
              {(() => { const d = getSeedZipDisplay(result.seedZipTier!); return d.image ? <img src={d.image} className="w-5 h-5 object-contain" /> : <span className="text-base">{d.icon}</span> })()}
              <div className="flex-1 text-left">
                <p className="text-[10px] font-bold leading-none" style={{ color: zipT.color }}>Bonus drop!</p>
                <p className="text-[9px] text-gray-400 font-mono mt-0.5">{getSeedZipDisplay(result.seedZipTier!).name}</p>
              </div>
            </div>
          )}
        </motion.div>

        <button
          type="button"
          onClick={() => { playClickSound(); onClose() }}
          className="w-full py-2 rounded-xl font-semibold transition-colors"
          style={{ color: t.color, border: `1px solid ${t.border}`, backgroundColor: `${t.color}20` }}
        >
          Sweet!
        </button>
      </motion.div>
    </motion.div>
  )
}

// ─── Single farm slot ─────────────────────────────────────────────────────────

function FarmSlot({
  slotIndex,
  onOpenSeedPicker,
  onHarvested,
}: {
  slotIndex: number
  onOpenSeedPicker: (i: number) => void
  onHarvested: (result: HarvestResult) => void
}) {
  const planted = useFarmStore((s) => s.planted[slotIndex])
  const harvestSlot = useFarmStore((s) => s.harvestSlot)
  const cancelPlanting = useFarmStore((s) => s.cancelPlanting)
  const seed = planted ? getSeedById(planted.seedId) : null
  const remaining = useCountdown(planted?.plantedAt ?? 0, planted?.growTimeSeconds ?? 0)
  const isReady = !!planted && remaining <= 0
  const progress = planted ? Math.min(1, 1 - remaining / planted.growTimeSeconds) : 0
  const [bursting, setBursting] = useState(false)
  const [cancelConfirm, setCancelConfirm] = useState(false)

  // Reset confirm overlay whenever a new seed is planted in this slot
  useEffect(() => {
    if (planted) setCancelConfirm(false)
  }, [planted?.seedId, planted?.plantedAt]) // eslint-disable-line react-hooks/exhaustive-deps

  const theme = seed ? rarityTheme(seed.rarity) : null

  const handleHarvest = useCallback(() => {
    if (bursting || !isReady) return
    playClickSound()
    setBursting(true)
    setTimeout(() => {
      const result = harvestSlot(slotIndex)
      setBursting(false)
      if (result) onHarvested(result)
    }, 680)
  }, [bursting, isReady, harvestSlot, slotIndex, onHarvested])

  return (
    <AnimatePresence mode="wait">
      {!planted ? (
        // ── Empty ──
        <motion.button
          key="empty"
          type="button"
          initial={{ opacity: 0, scale: 0.93 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.93 }}
          transition={{ duration: 0.18, ease: MOTION.easing }}
          whileTap={MOTION.interactive.tap}
          onClick={() => { playClickSound(); onOpenSeedPicker(slotIndex) }}
          className="w-full min-h-[116px] rounded-xl border border-dashed border-white/[0.09] bg-discord-card/30 flex flex-col items-center justify-center gap-2 hover:border-lime-400/30 hover:bg-lime-400/[0.04] transition-all group"
        >
          <span className="text-2xl text-gray-700 group-hover:text-lime-400/50 transition-colors">🌱</span>
          <span className="text-[9px] text-gray-600 font-mono group-hover:text-gray-400 transition-colors tracking-wider uppercase">Plant seed</span>
        </motion.button>
      ) : (
        // ── Growing / Ready ──
        <motion.div
          key={`${planted.seedId}-${planted.plantedAt}`}
          initial={{ opacity: 0, scale: 0.93 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.88, transition: { duration: 0.15 } }}
          transition={{ duration: 0.2, ease: MOTION.easing }}
          className="relative w-full min-h-[116px] rounded-xl border overflow-hidden"
          style={{
            borderColor: isReady ? '#84cc16' : (theme?.border ?? 'rgba(255,255,255,0.06)'),
            background: isReady
              ? 'linear-gradient(145deg, rgba(132,204,22,0.09) 0%, rgba(9,9,17,0.97) 65%)'
              : `linear-gradient(145deg, ${theme?.glow ?? 'transparent'}12 0%, rgba(9,9,17,0.97) 65%)`,
          }}
        >
          {/* Ready pulse glow */}
          {isReady && !bursting && (
            <motion.div
              className="absolute inset-0 pointer-events-none rounded-xl"
              animate={{ boxShadow: ['0 0 0px rgba(132,204,22,0)', '0 0 20px rgba(132,204,22,0.4)', '0 0 0px rgba(132,204,22,0)'] }}
              transition={{ duration: 1.8, repeat: Infinity }}
            />
          )}

          {/* Harvest animation overlay */}
          <AnimatePresence>
            {bursting && (
              <>
                {/* Flash */}
                <motion.div
                  className="absolute inset-0 z-20 rounded-xl pointer-events-none"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 0.55, 0] }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  style={{ backgroundColor: '#84cc16' }}
                />
                {/* Confetti */}
                <div className="absolute inset-0 z-20 overflow-hidden pointer-events-none rounded-xl">
                  <PixelConfetti originX={0.5} originY={0.5} accentColor="#84cc16" duration={0.8} />
                </div>
                {/* Float-up pill */}
                <motion.div
                  className="absolute inset-x-0 z-30 flex justify-center pointer-events-none"
                  style={{ top: '26%' }}
                  initial={{ opacity: 1, y: 0, scale: 0.85 }}
                  animate={{ opacity: 0, y: -44, scale: 1.08 }}
                  transition={{ duration: 0.72, ease: MOTION.easingSoft }}
                >
                  <span className="text-[12px] font-black text-white bg-lime-500 px-3.5 py-1 rounded-full shadow-lg tracking-wide">
                    Harvested!
                  </span>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {isReady ? (
            // ── Ready state ──
            <div className="p-2.5 flex flex-col gap-2 h-full min-h-[116px]">
              {/* Seed info */}
              <div className="flex items-center gap-1.5">
                {seed?.image
                  ? <img src={seed.image} alt="" className="w-4 h-4 object-contain shrink-0" />
                  : <span className="text-base leading-none shrink-0">{seed?.icon ?? '🌱'}</span>}
                <p className="text-[10px] font-medium text-white/80 truncate flex-1">{seed?.name}</p>
                <span className="text-[8px] font-mono font-bold text-lime-400 shrink-0 tracking-wider">READY</span>
              </div>

              {/* Big harvest button */}
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                animate={!bursting ? { scale: [1, 1.025, 1] } : undefined}
                transition={!bursting ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : undefined}
                onClick={handleHarvest}
                disabled={bursting}
                className="flex-1 rounded-lg border border-lime-400/40 bg-lime-400/12 flex items-center justify-center gap-2 hover:bg-lime-400/20 transition-colors cursor-pointer"
              >
                <span className="text-lg">🌿</span>
                <span className="text-sm font-bold text-lime-300">Harvest</span>
              </motion.button>

              {/* Full progress bar */}
              <div className="h-1.5 rounded-full overflow-hidden bg-lime-400/20">
                <div className="h-full w-full rounded-full bg-lime-400" />
              </div>
            </div>
          ) : (
            // ── Growing state ──
            <>
              {/* ✕ Cancel button */}
              {!cancelConfirm && (
                <button
                  type="button"
                  className="absolute top-1.5 right-1.5 z-10 w-5 h-5 flex items-center justify-center rounded text-gray-600 hover:text-red-400 transition-colors text-[12px] leading-none"
                  onClick={() => setCancelConfirm(true)}
                >
                  ✕
                </button>
              )}

              <div className="px-3 py-2.5 flex flex-col gap-0 h-full min-h-[116px]">
                {/* Seed info top */}
                <div className="flex items-center gap-1.5 mb-1">
                  {seed?.image
                    ? <img src={seed.image} alt="" className="w-3.5 h-3.5 object-contain shrink-0" />
                    : <span className="text-sm leading-none shrink-0">{seed?.icon ?? '🌱'}</span>}
                  <p className="text-[10px] font-medium text-white truncate flex-1">{seed?.name}</p>
                  {theme && (
                    <span
                      className="text-[7px] font-mono uppercase tracking-wider px-1.5 py-px rounded shrink-0 mr-5"
                      style={{ color: theme.color, backgroundColor: `${theme.color}18` }}
                    >
                      {seed?.rarity}
                    </span>
                  )}
                </div>

                {/* Big countdown — center of card */}
                <div className="flex-1 flex items-center justify-center">
                  <motion.span
                    className="text-2xl font-mono font-bold tabular-nums tracking-tight"
                    style={{ color: theme?.color ?? '#9CA3AF' }}
                    key={Math.floor(remaining)}
                    animate={{ opacity: [0.7, 1] }}
                    transition={{ duration: 0.15 }}
                  >
                    {fmtCountdown(remaining)}
                  </motion.span>
                </div>

                {/* Progress bar with shimmer */}
                <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden relative mt-1">
                  <motion.div
                    className="h-full rounded-full relative overflow-hidden"
                    style={{ backgroundColor: theme?.color ?? '#9CA3AF' }}
                    animate={{ width: `${Math.floor(progress * 100)}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                  >
                    <motion.div
                      className="absolute inset-y-0 w-6 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                      animate={{ x: ['-150%', '400%'] }}
                      transition={{ duration: 1.6, repeat: Infinity, ease: 'linear', repeatDelay: 0.3 }}
                    />
                  </motion.div>
                </div>
                <p className="text-[8px] font-mono text-gray-400 mt-1 text-right tabular-nums">
                  {Math.floor(progress * 100)}%
                </p>
              </div>

              {/* Cancel confirm overlay */}
              <AnimatePresence>
                {cancelConfirm && (
                  <motion.div
                    key="cancel-confirm"
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.92 }}
                    transition={{ duration: 0.18, ease: MOTION.easing }}
                    className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 p-3 rounded-xl bg-discord-darker/95"
                  >
                    <p className="text-[11px] font-bold text-white">Cancel crop?</p>
                    <p className="text-[9px] text-gray-400 font-mono">Seed will be lost.</p>
                    <div className="flex gap-2 mt-1">
                      <button
                        type="button"
                        onClick={() => setCancelConfirm(false)}
                        className="text-[10px] font-semibold px-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/[0.1] text-gray-300 hover:bg-white/[0.1] transition-colors"
                      >
                        Keep growing
                      </button>
                      <button
                        type="button"
                        onClick={() => { playClickSound(); cancelPlanting(slotIndex) }}
                        className="text-[10px] font-semibold px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ─── Locked slot ──────────────────────────────────────────────────────────────

function LockedSlot({ slotIndex, onUnlock }: { slotIndex: number; onUnlock: () => void }) {
  const cost = SLOT_UNLOCK_COSTS[slotIndex] ?? 0
  const gold = useGoldStore((s) => s.gold ?? 0)
  const canAfford = gold >= cost

  return (
    <motion.button
      type="button"
      whileTap={canAfford ? MOTION.interactive.tap : undefined}
      onClick={() => { playClickSound(); onUnlock() }}
      disabled={!canAfford}
      className={`w-full min-h-[116px] rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all ${
        canAfford
          ? 'border-amber-500/30 bg-amber-500/[0.04] hover:bg-amber-500/[0.09] hover:border-amber-500/50'
          : 'border-white/[0.05] bg-discord-darker/20 opacity-70 cursor-not-allowed'
      }`}
    >
      <span className="text-2xl">{canAfford ? '🔓' : '🔒'}</span>
      <span className="text-[10px] font-mono font-semibold text-amber-400">🪙 {cost.toLocaleString()}</span>
      <span className="text-[8px] text-gray-300 font-mono">{canAfford ? 'Tap to unlock' : 'Need more gold'}</span>
    </motion.button>
  )
}

// ─── Seed picker ──────────────────────────────────────────────────────────────

function SeedPicker({ slotIndex, seeds, onClose }: { slotIndex: number; seeds: Record<string, number>; onClose: () => void }) {
  const plantSeed = useFarmStore((s) => s.plantSeed)
  const available = SEED_DEFS.filter((s) => (seeds[s.id] ?? 0) > 0)

  return (
    <motion.div
      className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-end justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 72, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 72, opacity: 0 }}
        transition={MOTION.spring.pop}
        className="w-full max-w-sm rounded-t-2xl border-t border-x border-white/[0.09] bg-[#0f0f18]/95 backdrop-blur-md p-4 pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle bar */}
        <div className="w-8 h-1 rounded-full bg-white/15 mx-auto mb-4" />

        <div className="flex items-baseline justify-between mb-3">
          <div>
            <p className="text-sm font-semibold text-white">Choose a Seed</p>
            <p className="text-[10px] text-gray-500 mt-0.5 font-mono">Plot {slotIndex + 1}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-600 hover:text-gray-400 transition-colors text-xs font-mono"
          >
            ESC
          </button>
        </div>

        {available.length === 0 ? (
          <div className="py-10 flex flex-col items-center gap-2">
            <span className="text-4xl">🌰</span>
            <p className="text-sm text-gray-500 text-center font-medium">No seeds yet</p>
            <p className="text-[10px] text-gray-600 text-center">Open Seed Zips in the Farm tab to get seeds!</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-0.5">
            {available.map((seed) => {
              const t = rarityTheme(seed.rarity)
              const plant = LOOT_ITEMS.find((x) => x.id === seed.yieldPlantId)
              return (
                <motion.button
                  key={seed.id}
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => { playClickSound(); track('farm_plant', { seed_id: seed.id }); plantSeed(slotIndex, seed.id); onClose() }}
                  className="w-full rounded-xl border p-3 flex items-center gap-3 text-left transition-opacity hover:opacity-90"
                  style={{ borderColor: t.border, background: `linear-gradient(135deg, ${t.glow}18 0%, rgba(10,10,20,0.95) 60%)` }}
                >
                  {seed.image
                    ? <img src={seed.image} alt="" className="w-7 h-7 object-contain shrink-0" />
                    : <span className="text-2xl shrink-0">{seed.icon}</span>}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-semibold text-white">{seed.name}</p>
                      <span
                        className="text-[8px] font-mono uppercase px-1.5 py-0.5 rounded shrink-0"
                        style={{ color: t.color, backgroundColor: `${t.color}1A` }}
                      >
                        {seed.rarity}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-400">
                      ⏱ {formatGrowTime(seed.growTimeSeconds)}
                      {plant && <span className="ml-2">· yields {plant.icon} ×{seed.yieldMin}–{seed.yieldMax}</span>}
                    </p>
                    <p className="text-[9px] text-gray-600 font-mono mt-0.5">+{seed.xpOnHarvest} Farmer XP on harvest</p>
                  </div>
                  <span
                    className="text-xs font-mono font-bold shrink-0 px-2 py-0.5 rounded-lg"
                    style={{ color: t.color, backgroundColor: `${t.color}18` }}
                  >
                    ×{seeds[seed.id] ?? 0}
                  </span>
                </motion.button>
              )
            })}
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function FarmPage() {
  const { user } = useAuthStore()
  const unlockedSlots = useFarmStore((s) => s.unlockedSlots)
  const planted = useFarmStore((s) => s.planted)
  const seeds = useFarmStore((s) => s.seeds)
  const unlockNextSlot = useFarmStore((s) => s.unlockNextSlot)
  const harvestAll = useFarmStore((s) => s.harvestAll)
  const [pickerSlot, setPickerSlot] = useState<number | null>(null)
  const [unlockError, setUnlockError] = useState(false)
  const [justUnlockedSlot, setJustUnlockedSlot] = useState<number | null>(null)
  const [harvestResult, setHarvestResult] = useState<HarvestResult | null>(null)
  const [harvestClaimResults, setHarvestClaimResults] = useState<HarvestResult[] | null>(null)
  const runSync = useCallback(async () => {
    if (!supabase || !user) return
    try {
      const cloud = await fetchFarmFromCloud()
      if (cloud && !cloud.error) {
        useFarmStore.getState().mergeSeedsFromCloud(cloud.seeds)
        useFarmStore.getState().mergeSeedZipsFromCloud(cloud.seedZips)
      }
      ensureInventoryHydrated()
      const { items, chests } = useInventoryStore.getState()
      const { seeds: s, seedZips } = useFarmStore.getState()
      const res = await syncInventoryToSupabase(items, chests, { merge: true, seeds: s, seedZips })
      if (res.ok && res.mergedChests) {
        if (res.mergedItems) useInventoryStore.getState().mergeFromCloud(res.mergedItems, res.mergedChests)
        if (res.mergedSeeds) useFarmStore.getState().mergeSeedsFromCloud(res.mergedSeeds)
        if (res.mergedSeedZips) useFarmStore.getState().mergeSeedZipsFromCloud(res.mergedSeedZips)
      }
    } catch { /* ignore */ }
  }, [user?.id])

  /** Push harvested plants + current inventory to Supabase (fire-and-forget). */
  const syncAfterHarvest = useCallback(() => {
    if (!supabase || !user) return
    const { items, chests } = useInventoryStore.getState()
    const { seeds: s, seedZips } = useFarmStore.getState()
    syncInventoryToSupabase(items, chests, { merge: false, seeds: s, seedZips }).catch(() => {})
  }, [user?.id])

  // Sync seeds + seed zips from Supabase when Farm mounts (user may have received items via MCP/admin)
  useEffect(() => {
    runSync()
  }, [runSync])

  // Re-render every second while seeds are growing so readyCount/growingCount stay current
  const [, forceUpdate] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    const hasGrowing = Object.values(planted).some(
      (s) => s && (Date.now() - s.plantedAt) / 1000 < s.growTimeSeconds,
    )
    if (!hasGrowing) return
    const id = setInterval(forceUpdate, 1000)
    return () => clearInterval(id)
  }, [planted])

  const now = Date.now()
  const readyCount = Object.values(planted).filter(
    (s) => !!s && (now - s.plantedAt) / 1000 >= s.growTimeSeconds,
  ).length
  const growingCount = Object.values(planted).filter(
    (s) => !!s && (now - s.plantedAt) / 1000 < s.growTimeSeconds,
  ).length
  const handleUnlock = useCallback(() => {
    playClickSound()
    const slotToUnlock = unlockedSlots // the slot index being unlocked right now
    const ok = unlockNextSlot()
    if (!ok) {
      setUnlockError(true)
      setTimeout(() => setUnlockError(false), 1600)
    } else {
      setJustUnlockedSlot(slotToUnlock)
    }
  }, [unlockNextSlot, unlockedSlots])

  return (
    <motion.div
      initial={MOTION.page.initial}
      animate={MOTION.page.animate}
      exit={MOTION.page.exit}
      transition={{ duration: MOTION.duration.base, ease: MOTION.easingSoft }}
      className="p-4 pb-20 space-y-4 max-w-lg mx-auto"
    >
      <PageHeader
        title="Farm"
        rightSlot={
          <GoldDisplay />
        }
      />

      {/* ── Plots ── */}
      <div className="rounded-xl border border-white/[0.08] bg-discord-card/70 p-3">
        {/* Header row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <p className="text-[10px] uppercase tracking-wider text-gray-300 font-mono">
              Plots <span className="text-white/60 ml-0.5">{unlockedSlots}/{MAX_FARM_SLOTS}</span>
            </p>
            {(growingCount > 0 || readyCount > 0) && (
              <div className="flex items-center gap-1.5">
                {growingCount > 0 && (
                  <span className="text-[8px] font-mono px-1.5 py-px rounded bg-white/[0.08] text-gray-300">
                    {growingCount} growing
                  </span>
                )}
                {readyCount > 0 && (
                  <span className="text-[8px] font-mono px-1.5 py-px rounded bg-lime-400/15 text-lime-400 border border-lime-400/25">
                    {readyCount} ready
                  </span>
                )}
              </div>
            )}
          </div>
          <AnimatePresence>
            {readyCount >= 1 && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={() => { playClickSound(); const res = harvestAll(); if (res.length > 0) { setHarvestClaimResults(res); syncAfterHarvest() } }}
                className="text-[10px] font-semibold px-3 py-1.5 rounded-lg bg-lime-400/15 border border-lime-400/35 text-lime-400 hover:bg-lime-400/25 transition-colors"
              >
                Claim All{readyCount > 1 ? ` (${readyCount})` : ''}
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* 2-col grid */}
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: MAX_FARM_SLOTS }, (_, i) => {
            if (i < unlockedSlots) return <FarmSlot key={i} slotIndex={i} onOpenSeedPicker={setPickerSlot} onHarvested={(r) => { setHarvestResult(r); syncAfterHarvest() }} />
            if (i === unlockedSlots) return <LockedSlot key={i} slotIndex={i} onUnlock={handleUnlock} />
            const fade = Math.max(0.18, 0.45 - (i - unlockedSlots - 1) * 0.08)
            return (
              <div
                key={i}
                className="min-h-[116px] rounded-xl border border-white/[0.04] bg-discord-darker/15 flex flex-col items-center justify-center gap-1"
                style={{ opacity: fade }}
              >
                <span className="text-gray-500 text-base">🔒</span>
                {SLOT_UNLOCK_COSTS[i] != null && (
                  <span className="text-[8px] font-mono text-gray-500">🪙 {SLOT_UNLOCK_COSTS[i]!.toLocaleString()}</span>
                )}
              </div>
            )
          })}
        </div>

        {/* Error / next hint */}
        <AnimatePresence>
          {unlockError && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-[10px] text-red-400 font-mono text-center mt-2"
            >
              Not enough gold
            </motion.p>
          )}
        </AnimatePresence>
        {!unlockError && unlockedSlots < MAX_FARM_SLOTS && (
          <p className="text-[9px] text-gray-400 font-mono text-center mt-2">
            Next plot · 🪙 {(SLOT_UNLOCK_COSTS[unlockedSlots] ?? 0).toLocaleString()} gold
          </p>
        )}
      </div>

      {/* ── Harvest Claim modal ── */}
      <AnimatePresence>
        {harvestClaimResults && (
          <HarvestClaimModal results={harvestClaimResults} onClose={() => setHarvestClaimResults(null)} />
        )}
      </AnimatePresence>

      {/* ── Seed Zips ── */}
      <SeedZipSection />

      {/* ── Seed Cabinet ── */}
      <SeedCabinetSection />

      {/* ── Farmer hint ── */}
      <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-white/[0.05] bg-discord-card/30">
        <span className="text-base leading-none shrink-0">🌾</span>
        <p className="text-[10px] text-gray-400 leading-snug">
          Farmer XP is tracked in the <span className="text-gray-200 font-medium">Skills</span> tab.
        </p>
      </div>

      {/* ── Seed picker modal ── */}
      <AnimatePresence>
        {pickerSlot !== null && (
          <SeedPicker
            slotIndex={pickerSlot}
            seeds={seeds}
            onClose={() => setPickerSlot(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Harvest result modal ── */}
      <AnimatePresence>
        {harvestResult && (
          <HarvestRevealModal
            result={harvestResult}
            onClose={() => setHarvestResult(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Plot unlock celebration ── */}
      <AnimatePresence>
        {justUnlockedSlot !== null && (
          <PlotUnlockCelebration
            slotIndex={justUnlockedSlot}
            onDone={() => setJustUnlockedSlot(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}
