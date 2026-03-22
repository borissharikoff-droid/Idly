import { useEffect, useMemo, useState, useCallback, useRef, useReducer } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useFarmStore, COMPOST_PER_PLOT, type HarvestResult } from '../../stores/farmStore'
import { useGoldStore } from '../../stores/goldStore'
import { useAuthStore } from '../../stores/authStore'
import { useArenaStore } from '../../stores/arenaStore'
import { skillLevelFromXP } from '../../lib/skills'
import { supabase } from '../../lib/supabase'
import { syncInventoryToSupabase } from '../../services/supabaseSync'
import { ensureInventoryHydrated, useInventoryStore } from '../../stores/inventoryStore'
import {
  SEED_DEFS, SLOT_UNLOCK_COSTS, MAX_FARM_SLOTS, getSeedById, formatGrowTime,
  SEED_ZIP_ITEM_IDS, getSeedZipDisplay, type SeedZipTier,
  SLOT_UNLOCK_REQUIREMENTS, FIELD_DEFS, canUnlockSlot,
  FARMHOUSE_UNLOCK_LEVEL, getFarmhouseBonuses, getNextFarmhouseUpgrade,
  getFarmhouseIcon, getEffectiveRotChance,
} from '../../lib/farming'
import { useFarmRotTick } from '../../hooks/useFarmRotTick'
import { useAdminConfigStore } from '../../stores/adminConfigStore'
import { LOOT_ITEMS, getRarityTheme } from '../../lib/loot'
import { fmt } from '../../lib/format'
import { RARITY_THEME, normalizeRarity } from '../loot/LootUI'
import { PageHeader } from '../shared/PageHeader'
import { useNavigationStore } from '../../stores/navigationStore'
import { Sprout } from '../../lib/icons'
import { GoldDisplay } from '../marketplace/GoldDisplay'
import { PixelConfetti } from '../home/PixelConfetti'
import { MOTION } from '../../lib/motion'
import { playClickSound, playLootRaritySound } from '../../lib/sounds'
import { track } from '../../lib/analytics'
import { ListForSaleModal } from '../inventory/ListForSaleModal'

// ─── Reactive skill XP hook (re-reads localStorage on cloud sync) ────────────

function useSkillXP(): Record<string, number> {
  const read = () => {
    try { return JSON.parse(localStorage.getItem('grindly_skill_xp') || '{}') as Record<string, number> } catch { return {} }
  }
  const [xp, setXP] = useState(read)
  useEffect(() => {
    const handler = () => setXP(read())
    window.addEventListener('grindly-skill-xp-updated', handler)
    return () => window.removeEventListener('grindly-skill-xp-updated', handler)
  }, [])
  return xp
}

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
        className="relative flex flex-col items-center gap-4 px-12 py-9 rounded-card border overflow-hidden"
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
          className="text-micro font-black tracking-[0.25em] px-3 py-1 rounded-full border"
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
          className="text-caption text-gray-400 font-mono -mt-2"
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
          className="text-micro font-mono text-gray-500 -mt-2"
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

function SeedZipRevealModal({ tier, seedId, remainingCount, onClose, onOpenAnother, onOpenAll }: { tier: SeedZipTier; seedId: string; remainingCount: number; onClose: () => void; onOpenAnother?: () => void; onOpenAll?: () => void }) {
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
        className="w-[300px] rounded border p-5 text-center relative overflow-hidden"
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
          className="absolute inset-0 pointer-events-none rounded"
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
                className="absolute inset-0 pointer-events-none rounded"
                initial={{ opacity: 0 }}
                animate={{ opacity: isLegendary && !isRevealed ? [0, 0.7, 0.4, 0.8, 0.4] : isRevealed ? 0.65 : 0.3 }}
                transition={{ duration: isLegendary && !isRevealed ? animCfg.openMs / 1000 : 0.5, repeat: isLegendary && !isRevealed ? Infinity : 0, ease: 'easeInOut' }}
                style={{ background: `radial-gradient(ellipse 120% 80% at 50% 0%, ${zipTheme.glow}50 0%, transparent 70%)` }}
              />
            )}

            {/* Legendary rotating rays */}
            {animCfg.hasRays && (
              <motion.div className="absolute inset-0 pointer-events-none overflow-hidden rounded" animate={{ opacity: isRevealed ? 1 : 0 }} transition={{ duration: 0.6, ease: 'easeOut' }}>
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
                <motion.div key="border-ring" aria-hidden className="absolute inset-0 rounded pointer-events-none border-2" style={{ borderColor: zipTheme.color }}
                  initial={{ opacity: 0 }} animate={{ opacity: [0, 0.9, 0] }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.7, repeat: Infinity, ease: 'easeInOut' }}
                />
              )}
            </AnimatePresence>

            {/* Reveal flash */}
            <AnimatePresence>
              {isRevealed && animCfg.flashOpacity > 0 && (
                <motion.div key="flash" className="absolute inset-0 pointer-events-none rounded"
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
                className="w-[76px] h-[76px] rounded border flex items-center justify-center relative overflow-hidden"
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
                  className="absolute inset-0 text-caption font-mono uppercase tracking-wider text-center"
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
                className="rounded-card border p-3.5 relative overflow-hidden cursor-default"
                style={{
                  borderColor: seedTheme.border,
                  background: `linear-gradient(135deg, ${seedTheme.glow}18 0%, rgba(8,8,16,0.95) 60%)`,
                  transform: hovering ? `perspective(600px) rotateY(${tilt.x * 3.5}deg) rotateX(${tilt.y * -3.5}deg)` : undefined,
                  transition: hovering ? 'transform 0.07s ease-out' : 'transform 0.45s ease-out',
                  boxShadow: `0 0 16px ${seedTheme.glow}44`,
                }}
              >
                <div className="absolute inset-0 pointer-events-none rounded"
                  style={{ background: `radial-gradient(circle at ${glowX}% ${glowY}%, ${seedTheme.glow} 0%, transparent 55%)`, opacity: hovering ? 0.45 : 0.28, transition: hovering ? 'opacity 0.08s' : 'opacity 0.5s' }}
                />
                <motion.div className="absolute inset-0 pointer-events-none rounded"
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
                <p className="text-micro font-mono uppercase tracking-wider mt-0.5" style={{ color: seedTheme.color }}>{seed.rarity}</p>
                <p className="text-micro text-gray-400 mt-1 leading-snug">
                  ⏱ {formatGrowTime(seed.growTimeSeconds)}
                  {plant && <span className="ml-2">· yields {plant.image ? <img src={plant.image} className="w-3 h-3 object-contain inline" /> : plant.icon} ×{seed.yieldMin}–{seed.yieldMax}</span>}
                </p>
              </motion.div>
            </motion.div>

            {/* Action buttons */}
            <motion.div
              className="mt-4 space-y-2"
              animate={{ opacity: isRevealed ? 1 : 0, y: isRevealed ? 0 : 8 }}
              transition={{ duration: 0.28, delay: isRevealed ? 0.18 : 0, ease: 'easeOut' }}
              style={{ pointerEvents: isRevealed ? 'auto' : 'none' }}
            >
              {remainingCount > 1 && onOpenAll && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); playClickSound(); onOpenAll() }}
                  className="w-full h-10 rounded text-body font-semibold transition-all active:scale-[0.97]"
                  style={{ color: zipTheme.color, border: `1px solid ${zipTheme.border}`, background: `${zipTheme.color}22` }}
                >
                  Open All ({remainingCount} left)
                </button>
              )}
              {remainingCount > 0 && onOpenAnother && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); playClickSound(); onOpenAnother() }}
                  className="w-full h-10 rounded text-body font-semibold transition-all active:scale-[0.97] text-white/50 border border-white/[0.08] bg-white/[0.04] hover:text-white/70 hover:bg-white/[0.07]"
                >
                  Open Another
                </button>
              )}
              <button
                type="button"
                onClick={() => { playClickSound(); onClose() }}
                className={`w-full h-10 rounded text-body font-semibold transition-all active:scale-[0.97] ${remainingCount > 0 ? 'text-gray-400 border border-white/[0.08] bg-white/[0.04]' : ''}`}
                style={remainingCount > 0 ? undefined : { color: zipTheme.color, border: `1px solid ${zipTheme.border}`, background: `${zipTheme.color}22` }}
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

// ─── Bulk seed zip open modal ─────────────────────────────────────────────────

interface BulkZipResult { tier: SeedZipTier; seeds: { seedId: string; qty: number }[]; totalOpened: number }

function LoadingDotsGreen({ color }: { color: string }) {
  return (
    <span className="inline-flex items-center gap-[3px] ml-1 translate-y-[1px]">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-[3px] h-[3px] rounded-full inline-block"
          style={{ background: color }}
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }}
        />
      ))}
    </span>
  )
}

function BulkSeedZipOpenModal({ result, onClose }: { result: BulkZipResult | null; onClose: () => void }) {
  const zipTheme = getRarityTheme(result?.tier ?? 'common')
  const zipDisplay = result ? getSeedZipDisplay(result.tier) : null
  const [phase, setPhase] = useState<'opening' | 'revealed'>('opening')
  const openMs = result ? Math.min(600 + result.totalOpened * 40, 2500) : 800

  useEffect(() => {
    if (!result) { setPhase('opening'); return }
    setPhase('opening')
    const t = setTimeout(() => setPhase('revealed'), openMs)
    return () => clearTimeout(t)
  }, [result])

  const isRevealed = phase === 'revealed'

  if (typeof document === 'undefined' || !result || !zipDisplay) return null
  return createPortal(
    <AnimatePresence>
      {result && (
        <motion.div
          key="bulk-zip-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[120] flex items-center justify-center p-4"
          onClick={isRevealed ? onClose : undefined}
        >
          <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" />

          {isRevealed && (
            <PixelConfetti
              key="bulk-zip-confetti"
              originX={0.5}
              originY={0.35}
              accentColor={zipTheme.color}
              count={Math.min(20 + result.totalOpened * 2, 60)}
              duration={1.5}
            />
          )}

          <motion.div
            key="bulk-zip-card"
            initial={{ scale: 0.82, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.88, opacity: 0, y: 16 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28, mass: 0.9 }}
            onClick={(e) => e.stopPropagation()}
            className="w-[340px] max-h-[80vh] rounded border p-5 text-center relative overflow-hidden flex flex-col"
            style={{
              borderColor: zipTheme.border,
              background: `linear-gradient(160deg, ${zipTheme.glow}1A 0%, rgba(8,8,16,0.97) 55%)`,
              boxShadow: isRevealed
                ? `0 0 32px ${zipTheme.glow}, 0 4px 32px rgba(0,0,0,0.7)`
                : `0 0 20px ${zipTheme.glow}66, 0 4px 24px rgba(0,0,0,0.6)`,
              transition: 'box-shadow 0.5s ease',
            }}
          >
            <motion.div
              aria-hidden
              className="absolute inset-0 pointer-events-none rounded"
              style={{ background: `radial-gradient(circle at 50% 12%, ${zipTheme.glow} 0%, transparent 55%)` }}
              animate={{ opacity: isRevealed ? [0.45, 0.65, 0.5] : [0.25, 0.45, 0.25] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            />

            {/* Zip icon */}
            <motion.div
              className="mx-auto w-fit"
              animate={!isRevealed ? { y: [0, -6, 0], rotate: [-3, 3, -3] } : { y: 0, rotate: 0 }}
              transition={!isRevealed
                ? { duration: 0.4, repeat: Infinity, ease: 'easeInOut' }
                : { type: 'spring', stiffness: 200, damping: 18 }
              }
            >
              <div
                className="w-[80px] h-[80px] rounded border flex items-center justify-center"
                style={{
                  borderColor: zipTheme.border,
                  background: `radial-gradient(circle at 50% 35%, ${zipTheme.glow}60 0%, rgba(8,8,16,0.92) 70%)`,
                  boxShadow: `0 0 22px ${zipTheme.glow}99`,
                }}
              >
                {zipDisplay.image
                  ? <img src={zipDisplay.image} alt="" className="w-14 h-14 object-contain select-none" style={{ imageRendering: 'pixelated' }} draggable={false} />
                  : <span className="text-4xl">{zipDisplay.icon}</span>
                }
              </div>
            </motion.div>

            {/* Status */}
            <div className="mt-2 h-[18px] relative overflow-hidden">
              <AnimatePresence mode="wait">
                {isRevealed ? (
                  <motion.p
                    key="done"
                    className="absolute inset-0 text-caption font-mono uppercase tracking-wider text-center"
                    style={{ color: zipTheme.color }}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                  >
                    Opened {result.totalOpened} zip{result.totalOpened !== 1 ? 's' : ''}
                  </motion.p>
                ) : (
                  <motion.span
                    key="opening"
                    className="absolute inset-0 text-caption font-mono uppercase tracking-wider text-center flex items-center justify-center"
                    style={{ color: zipTheme.color }}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                  >
                    Opening {result.totalOpened} zip{result.totalOpened !== 1 ? 's' : ''}<LoadingDotsGreen color={zipTheme.color} />
                  </motion.span>
                )}
              </AnimatePresence>
            </div>

            <p className="text-sm text-white/80 font-medium mt-0.5">{zipDisplay.name}</p>

            {/* Seeds received — scrollable */}
            <motion.div
              className="mt-3 flex-1 overflow-y-auto min-h-0"
              style={{ scrollbarWidth: 'thin', scrollbarColor: `${zipTheme.color}44 transparent` } as React.CSSProperties}
              animate={{ opacity: isRevealed ? 1 : 0, y: isRevealed ? 0 : 16 }}
              transition={{ type: 'spring', stiffness: 280, damping: 24, delay: isRevealed ? 0.04 : 0 }}
            >
              {result.seeds.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-micro font-mono text-gray-500 uppercase tracking-wider text-left">Seeds</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {result.seeds.map((entry, i) => {
                      const seed = getSeedById(entry.seedId)
                      if (!seed) return null
                      const theme = getRarityTheme(seed.rarity)
                      return (
                        <motion.div
                          key={`${entry.seedId}-${i}`}
                          initial={{ opacity: 0, scale: 0.85 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.05 + i * 0.03, type: 'spring', stiffness: 300, damping: 22 }}
                          className="rounded border p-2 flex items-center gap-2 relative overflow-hidden"
                          style={{
                            borderColor: `${theme.color}35`,
                            background: `linear-gradient(135deg, ${theme.glow}15 0%, rgba(8,8,16,0.95) 60%)`,
                          }}
                        >
                          <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(circle at 30% 40%, ${theme.glow}20 0%, transparent 60%)` }} />
                          <div className="relative flex-none w-10 h-10 rounded-md flex items-center justify-center" style={{ background: `${theme.color}12`, border: `1px solid ${theme.color}20` }}>
                            {seed.image
                              ? <img src={seed.image} alt="" className="w-8 h-8 object-contain" style={{ imageRendering: 'pixelated' }} />
                              : <span className="text-xl">{seed.icon}</span>
                            }
                          </div>
                          <div className="relative text-left min-w-0">
                            <p className="text-caption font-medium text-white/90 truncate leading-tight">{seed.name}</p>
                            <p className="text-micro font-mono uppercase" style={{ color: theme.color }}>
                              {seed.rarity}{entry.qty > 1 ? ` ×${entry.qty}` : ''}
                            </p>
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500 mt-4">No seeds this time</p>
              )}
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
                className="w-full h-10 rounded text-body font-semibold transition-all active:scale-[0.97]"
                style={{ color: zipTheme.color, border: `1px solid ${zipTheme.border}`, background: `${zipTheme.color}22` }}
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
  const skillXP = useSkillXP()
  const farmerLevel = skillLevelFromXP(skillXP['farmer'] ?? 0)
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
      <div className="rounded-card border border-white/[0.08] bg-surface-2/70 p-3">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-base">🗄</span>
          <p className="text-caption font-semibold text-white font-mono">Seed Cabinet</p>
          <span className="text-base ml-auto">🔒</span>
        </div>
        <p className="text-micro text-gray-400 mb-3">Store all your seeds in one place</p>

        <div className="space-y-2 mb-3">
          {([
            { label: `Farmer Level ${REQUIRED_LEVEL}`, met: meetsLevel, progress: `${farmerLevel} / ${REQUIRED_LEVEL}` },
            { label: `20 Slime Kills`, met: meetsSlimes, progress: `${slimeKills} / ${REQUIRED_SLIMES}` },
            { label: `3000 Gold`, met: meetsGold, progress: `${gold} / ${UNLOCK_COST}` },
          ] as const).map(({ label, met, progress }) => (
            <div key={label} className="flex items-center gap-2">
              <span className="text-caption">{met ? '✓' : '✗'}</span>
              <span className={`text-micro font-mono flex-1 ${met ? 'text-green-400' : 'text-gray-500'}`}>{label}</span>
              <span className="text-micro font-mono text-gray-500">{progress}</span>
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
          className={`w-full py-1.5 rounded border text-micro font-semibold transition-all ${
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

  // Track first render to play entrance animation
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    if (!entered && totalSeeds > 0) {
      const t = setTimeout(() => setEntered(true), 600)
      return () => clearTimeout(t)
    }
    if (totalSeeds > 0) setEntered(true)
  }, [totalSeeds, entered])

  // Unlocked state
  return (
    <div className="rounded-card border border-white/[0.08] bg-surface-2/70 p-3">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-base">🗄</span>
          <p className="text-micro uppercase tracking-wider text-gray-300 font-mono">Seed Cabinet</p>
        </div>
        {totalSeeds > 0 && (
          <motion.span
            className="text-micro text-gray-400 font-mono"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
          >
            {totalSeeds} total
          </motion.span>
        )}
      </div>

      {totalSeeds === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6">
          <span className="text-3xl">🌱</span>
          <p className="text-xs text-gray-400 text-center">No seeds stored</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {SEED_DEFS.filter((s) => (seeds[s.id] ?? 0) > 0).map((seed, i) => {
            const t = rarityTheme(seed.rarity)
            return (
              <motion.div
                key={seed.id}
                className="rounded border flex items-center gap-2.5 px-2.5 py-2"
                style={{ borderColor: t.border, background: `linear-gradient(135deg, ${t.glow}0C 0%, rgba(10,10,20,0.85) 60%)` }}
                initial={!entered ? { opacity: 0, x: 60, scale: 0.85 } : false}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                transition={!entered ? {
                  delay: 0.08 + i * 0.07,
                  type: 'spring', stiffness: 320, damping: 26,
                } : { duration: 0.15 }}
              >
                {seed.image
                  ? <img src={seed.image} alt="" className="w-5 h-5 object-contain shrink-0" />
                  : <span className="text-lg shrink-0">{seed.icon}</span>}
                <div className="flex-1 min-w-0">
                  <p className="text-caption font-medium text-white truncate">{seed.name}</p>
                  <p className="text-micro font-mono uppercase mt-0.5" style={{ color: t.color }}>
                    {seed.rarity} · {formatGrowTime(seed.growTimeSeconds)}
                  </p>
                </div>
                <motion.span
                  className="text-sm font-mono font-bold shrink-0 mr-1"
                  style={{ color: t.color }}
                  initial={!entered ? { opacity: 0, scale: 0 } : false}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={!entered ? { delay: 0.25 + i * 0.07, type: 'spring', stiffness: 400, damping: 20 } : { duration: 0.15 }}
                >
                  ×{seeds[seed.id]}
                </motion.span>
              </motion.div>
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
  const [bulkZipResult, setBulkZipResult] = useState<BulkZipResult | null>(null)
  const [sellTarget, setSellTarget] = useState<SeedZipTier | null>(null)
  useAdminConfigStore((s) => s.rev) // re-render when admin config changes

  const totalZips = ZIP_TIER_ORDER.reduce((acc, t) => acc + (seedZips[t] ?? 0), 0)

  const doOpen = useCallback((tier: SeedZipTier) => {
    const seedId = openSeedZip(tier)
    if (seedId) {
      setLastOpened({ tier, seedId })
      // Immediately sync to Supabase so periodic Math.max merge doesn't restore the zip
      const user = useAuthStore.getState().user
      if (supabase && user) {
        const { items, chests } = useInventoryStore.getState()
        const { seeds, seedZips: sz } = useFarmStore.getState()
        syncInventoryToSupabase(items, chests, { merge: false, seeds, seedZips: sz }).catch(() => {})
      }
    }
  }, [openSeedZip])

  const handleOpen = useCallback((tier: SeedZipTier) => {
    if (lastOpened) return // prevent rapid double-open
    playClickSound()
    doOpen(tier)
  }, [doOpen, lastOpened])

  const handleOpenAnother = useCallback(() => {
    if (!lastOpened) return
    const tier = lastOpened.tier
    setLastOpened(null)
    // Small delay so the modal re-mounts with animation
    setTimeout(() => doOpen(tier), 80)
  }, [lastOpened, doOpen])

  const handleOpenAll = useCallback(() => {
    if (!lastOpened) return
    const tier = lastOpened.tier
    // Open all remaining of this tier (current already opened, open the rest)
    const count = useFarmStore.getState().seedZips[tier] ?? 0
    const seedCounts = new Map<string, number>()
    // Include the first zip already opened
    seedCounts.set(lastOpened.seedId, 1)
    for (let i = 0; i < count; i++) {
      const seedId = openSeedZip(tier)
      if (seedId) seedCounts.set(seedId, (seedCounts.get(seedId) ?? 0) + 1)
    }
    setLastOpened(null)
    const total = count + 1 // +1 for the first one already opened
    const seeds = Array.from(seedCounts.entries()).map(([seedId, qty]) => ({ seedId, qty }))
    setBulkZipResult({ tier, seeds, totalOpened: total })
    // Sync to Supabase
    const user = useAuthStore.getState().user
    if (supabase && user) {
      const { items, chests } = useInventoryStore.getState()
      const { seeds: farmSeeds, seedZips: sz } = useFarmStore.getState()
      syncInventoryToSupabase(items, chests, { merge: false, seeds: farmSeeds, seedZips: sz }).catch(() => {})
    }
  }, [lastOpened, openSeedZip])

  if (totalZips === 0 && !lastOpened) return null

  return (
    <div className="rounded-card border border-white/[0.08] bg-surface-2/70 p-3">
      <p className="text-micro uppercase tracking-wider text-gray-300 font-mono mb-2.5">
        Seed Zips <span className="text-white/70 ml-0.5">{totalZips}</span>
      </p>

      <div className="space-y-1.5">
        {ZIP_TIER_ORDER.filter((tier) => (seedZips[tier] ?? 0) > 0).map((tier) => {
          const t = rarityTheme(tier)
          const count = seedZips[tier] ?? 0
          return (
            <motion.div key={tier} layout className="rounded border flex items-center gap-2.5 px-2.5 py-2"
              style={{ borderColor: t.border, background: `linear-gradient(135deg, ${t.glow}10 0%, rgba(10,10,20,0.88) 60%)` }}
            >
              {(() => { const d = getSeedZipDisplay(tier); return d.image ? <img src={d.image} className="w-6 h-6 object-contain shrink-0" /> : <span className="text-xl shrink-0">{d.icon}</span> })()}
              <div className="flex-1 min-w-0">
                <p className="text-caption font-semibold text-white">{getSeedZipDisplay(tier).name}</p>
                <p className="text-micro text-gray-400 mt-0.5">Contains a {tier} seed</p>
              </div>
              <span className="text-sm font-mono font-bold shrink-0 mr-2" style={{ color: t.color }}>×{count}</span>
              <motion.button
                type="button"
                whileTap={{ scale: 0.93 }}
                onClick={() => { playClickSound(); setSellTarget(tier) }}
                className="shrink-0 text-caption font-bold px-3 py-1.5 rounded transition-colors text-amber-300 border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25"
              >
                Sell
              </motion.button>
              <motion.button
                type="button"
                whileTap={lastOpened ? undefined : { scale: 0.93 }}
                disabled={!!lastOpened}
                onClick={() => handleOpen(tier)}
                className="shrink-0 text-caption font-bold px-3 py-1.5 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
            key={`zip-${lastOpened.seedId}`}
            tier={lastOpened.tier}
            seedId={lastOpened.seedId}
            remainingCount={(seedZips[lastOpened.tier] ?? 0)}
            onClose={() => setLastOpened(null)}
            onOpenAnother={handleOpenAnother}
            onOpenAll={handleOpenAll}
          />
        )}
      </AnimatePresence>

      <BulkSeedZipOpenModal
        result={bulkZipResult}
        onClose={() => setBulkZipResult(null)}
      />

      {sellTarget && (
        <ListForSaleModal
          itemId={SEED_ZIP_ITEM_IDS[sellTarget]}
          maxQty={seedZips[sellTarget] ?? 1}
          onDeductItem={(qty) => removeSeedZip(sellTarget, qty)}
          onRollbackDeduct={(qty) => useFarmStore.getState().addSeedZip(sellTarget, qty)}
          onClose={() => setSellTarget(null)}
          onListed={() => setSellTarget(null)}
        />
      )}
    </div>
  )
}

// ─── Harvest result modal ────────────────────────────────────────────────────

function HarvestRevealModal({ result, remaining = 0, onClose }: { result: HarvestResult; remaining?: number; onClose: () => void }) {
  const plant = LOOT_ITEMS.find((x) => x.id === result.yieldPlantId)
  const t = getRarityTheme(plant?.rarity ?? 'common')
  // Aggregated zip drops
  const zipDrops = result.seedZipDrops ?? (result.seedZipTier ? [{ tier: result.seedZipTier, count: 1 }] : [])
  const compostDrops = result.compostDropCount ?? (result.compostDrop ? 1 : 0)
  const compostedCount = result.compostedCount ?? (result.composted ? 1 : 0)
  const plotCount = result.plotCount ?? 1
  const seedDrops = result.seedDropCount ?? (result.seedDrop ? 1 : 0)
  const seedDropId = result.seedDrop

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
      <div className="absolute inset-0 bg-surface-0" />

      <PixelConfetti originX={0.5} originY={0.42} accentColor={t.color} duration={1.1} />

      <motion.div
        initial={{ scale: 0.85, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 12 }}
        transition={{ duration: 0.18, ease: MOTION.easing }}
        onClick={(e) => e.stopPropagation()}
        className="w-[300px] min-h-[340px] rounded border p-5 text-center flex flex-col relative overflow-hidden"
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

        {/* Top content */}
        <div className="space-y-3">
        {/* Plant icon box */}
        <motion.div
          initial={{ rotate: -12, scale: 0.6, opacity: 0 }}
          animate={{ rotate: [0, -4, 4, 0], scale: [0.6, 1.15, 0.95, 1.0], opacity: 1 }}
          transition={{ duration: 0.55, ease: MOTION.easing }}
          className="mx-auto w-20 h-20 rounded bg-surface-0 border flex items-center justify-center text-4xl"
          style={{ borderColor: t.border }}
        >
          {plant?.image
            ? <img src={plant.image} alt="" className="w-12 h-12 object-contain" />
            : (plant?.icon ?? '🌱')}
        </motion.div>

        <p className="text-caption font-mono uppercase tracking-wider" style={{ color: t.color }}>
          {plotCount > 1 ? `Harvested ${plotCount} plots` : 'Harvested'}
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
          className="rounded-card border p-3 relative overflow-hidden space-y-2"
          style={{ borderColor: t.border, backgroundColor: `${t.color}14` }}
        >
          <motion.div
            className="absolute inset-0 pointer-events-none rounded"
            initial={{ opacity: 0.35 }}
            animate={{ opacity: [0.3, 0.6, 0.35] }}
            transition={{ duration: 1.7, repeat: Infinity, ease: MOTION.easing }}
            style={{ boxShadow: `0 0 20px ${t.glow}` }}
          />

          {/* Composted bonus indicator */}
          {compostedCount > 0 && (
            <div className="flex items-center justify-between relative">
              <span className="text-micro text-amber-400 font-mono">🧪 Composted{compostedCount > 1 ? ` ×${compostedCount}` : ''}</span>
              <span className="text-micro font-bold text-amber-400">+20% yield · +5% XP</span>
            </div>
          )}

          {/* XP */}
          <div className="flex items-center justify-between relative">
            <span className="text-micro text-gray-400 font-mono">Farmer XP</span>
            <span className="text-sm font-bold text-lime-400">+{result.xpGained}</span>
          </div>

          {/* Compost drops */}
          {compostDrops > 0 && (
            <div className="flex items-center gap-2 rounded border border-amber-500/25 px-2.5 py-1.5 bg-amber-500/8 relative">
              <span className="text-base">🧪</span>
              <div className="flex-1 text-left">
                <p className="text-micro font-bold text-amber-400 leading-none">Bonus drop!</p>
                <p className="text-micro text-gray-400 font-mono mt-0.5">Compost ×{compostDrops}</p>
              </div>
            </div>
          )}

          {/* Seed return drop */}
          {seedDrops > 0 && seedDropId && (() => {
            const sd = getSeedById(seedDropId)
            return sd ? (
              <div className="flex items-center gap-2 rounded border border-green-500/25 px-2.5 py-1.5 bg-green-500/8 relative">
                <span className="text-base">{sd.icon}</span>
                <div className="flex-1 text-left">
                  <p className="text-micro font-bold text-green-400 leading-none">Seed returned!</p>
                  <p className="text-micro text-gray-400 font-mono mt-0.5">{sd.name} ×{seedDrops}</p>
                </div>
              </div>
            ) : null
          })()}

          {/* Seed Zip drops */}
          {zipDrops.map(({ tier, count }) => {
            const zt = rarityTheme(tier)
            const d = getSeedZipDisplay(tier)
            return (
              <div
                key={tier}
                className="flex items-center gap-2 rounded border px-2.5 py-1.5 relative"
                style={{ borderColor: zt.border, background: `${zt.glow}12` }}
              >
                {d.image ? <img src={d.image} className="w-5 h-5 object-contain" /> : <span className="text-base">{d.icon}</span>}
                <div className="flex-1 text-left">
                  <p className="text-micro font-bold leading-none" style={{ color: zt.color }}>Bonus drop!</p>
                  <p className="text-micro text-gray-400 font-mono mt-0.5">{d.name}{count > 1 ? ` ×${count}` : ''}</p>
                </div>
              </div>
            )
          })}
        </motion.div>
        </div>

        {/* Spacer pushes button to bottom */}
        <div className="flex-1 min-h-4" />

        <button
          type="button"
          onClick={() => { playClickSound(); onClose() }}
          className="w-full py-2.5 rounded font-semibold transition-colors shrink-0"
          style={{ color: t.color, border: `1px solid ${t.border}`, backgroundColor: `${t.color}20` }}
        >
          {remaining > 0 ? `Next (${remaining} more)` : 'Sweet!'}
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
  const slotComposted = useFarmStore((s) => !!s.compostedSlots[slotIndex])
  const harvestSlot = useFarmStore((s) => s.harvestSlot)
  const compostSlot = useFarmStore((s) => s.compostSlot)
  const cancelPlanting = useFarmStore((s) => s.cancelPlanting)
  const compostCount = useInventoryStore((s) => s.items['compost'] ?? 0)
  const farmhouseLevel = useFarmStore((s) => s.farmhouseLevel)
  const isComposted = !!planted?.composted || slotComposted
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
        <motion.div
          key="empty"
          initial={{ opacity: 0, scale: 0.93 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.93 }}
          transition={{ duration: 0.18, ease: MOTION.easing }}
          className={`w-full min-h-[116px] rounded border ${slotComposted ? 'border-amber-500/30 bg-amber-500/[0.04]' : 'border-dashed border-white/[0.09] bg-surface-2/30'} flex flex-col items-center justify-center gap-2 transition-all`}
        >
          <motion.button
            type="button"
            whileTap={MOTION.interactive.tap}
            onClick={() => { playClickSound(); onOpenSeedPicker(slotIndex) }}
            className="flex flex-col items-center gap-1 group"
          >
            <span className={`text-2xl ${slotComposted ? 'text-amber-400/60' : 'text-gray-700 group-hover:text-lime-400/50'} transition-colors`}>
              {slotComposted ? '🧪' : '🌱'}
            </span>
            <span className="text-micro text-gray-600 font-mono group-hover:text-gray-400 transition-colors tracking-wider uppercase">
              {slotComposted ? 'Composted · Plant seed' : 'Plant seed'}
            </span>
          </motion.button>
          {!slotComposted && compostCount > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                if (compostCount < COMPOST_PER_PLOT) return
                playClickSound()
                compostSlot(slotIndex)
              }}
              disabled={compostCount < COMPOST_PER_PLOT}
              className={`text-micro font-mono px-2 py-0.5 rounded border transition-colors ${
                compostCount >= COMPOST_PER_PLOT
                  ? 'bg-amber-500/10 border-amber-500/25 text-amber-400 hover:bg-amber-500/20'
                  : 'bg-white/[0.03] border-white/[0.06] text-gray-600 cursor-not-allowed'
              }`}
            >
              🧪 Compost ({compostCount}/{COMPOST_PER_PLOT})
            </button>
          )}
        </motion.div>
      ) : (
        // ── Growing / Ready ──
        <motion.div
          key={`${planted.seedId}-${planted.plantedAt}`}
          initial={{ opacity: 0, scale: 0.93 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.88, transition: { duration: 0.15 } }}
          transition={{ duration: 0.2, ease: MOTION.easing }}
          className="relative w-full min-h-[116px] rounded border overflow-hidden"
          style={{
            borderColor: isReady ? '#84cc16' : isComposted ? '#f59e0b' : (theme?.border ?? 'rgba(255,255,255,0.06)'),
            background: isReady
              ? 'linear-gradient(145deg, rgba(132,204,22,0.09) 0%, rgba(9,9,17,0.97) 65%)'
              : isComposted
                ? `linear-gradient(145deg, rgba(245,158,11,0.08) 0%, ${theme?.glow ?? 'transparent'}12 30%, rgba(9,9,17,0.97) 65%)`
                : `linear-gradient(145deg, ${theme?.glow ?? 'transparent'}12 0%, rgba(9,9,17,0.97) 65%)`,
          }}
        >
          {/* Ready pulse glow */}
          {isReady && !bursting && (
            <motion.div
              className="absolute inset-0 pointer-events-none rounded"
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
                  className="absolute inset-0 z-20 rounded pointer-events-none"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 0.55, 0] }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  style={{ backgroundColor: '#84cc16' }}
                />
                {/* Confetti */}
                <div className="absolute inset-0 z-20 overflow-hidden pointer-events-none rounded">
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
                  <span className="text-xs font-black text-white bg-lime-500 px-3.5 py-1 rounded-full shadow-lg tracking-wide">
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
                <p className="text-micro font-medium text-white/80 truncate flex-1">{seed?.name}</p>
                {isComposted && <span className="text-[7px] font-mono px-1 py-px rounded bg-amber-500/15 text-amber-400 border border-amber-500/25 shrink-0">🧪</span>}
                <span className="text-micro font-mono font-bold text-lime-400 shrink-0 tracking-wider">READY</span>
              </div>

              {/* Big harvest button */}
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                animate={!bursting ? { scale: [1, 1.025, 1] } : undefined}
                transition={!bursting ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : undefined}
                onClick={handleHarvest}
                disabled={bursting}
                className="flex-1 rounded border border-lime-400/40 bg-lime-400/12 flex items-center justify-center gap-2 hover:bg-lime-400/20 transition-colors cursor-pointer"
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
                  className="absolute top-1.5 right-1.5 z-10 w-5 h-5 flex items-center justify-center rounded text-gray-600 hover:text-red-400 transition-colors text-xs leading-none"
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
                  <p className="text-micro font-medium text-white truncate flex-1">{seed?.name}</p>
                  {isComposted && <span className="text-[7px] font-mono px-1 py-px rounded bg-amber-500/15 text-amber-400 border border-amber-500/25 shrink-0">🧪</span>}
                  {theme && (
                    <span
                      className="text-[7px] font-mono uppercase tracking-wider px-1.5 py-px rounded shrink-0 mr-5"
                      style={{ color: theme.color, backgroundColor: `${theme.color}18` }}
                    >
                      {seed?.rarity}
                    </span>
                  )}
                </div>

                {/* Rot indicator */}
                {seed && (
                  <div className="flex items-center gap-1 mt-0.5">
                    {planted.rotAt && !planted.rotted ? (
                      <span className="text-[7px] font-mono text-red-400">💀 Will rot!</span>
                    ) : (
                      <span className="text-[7px] font-mono text-gray-500">
                        🎲 Rot {Math.round(getEffectiveRotChance(seed.rarity, farmhouseLevel) * 100)}%
                      </span>
                    )}
                  </div>
                )}

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
                <div className="flex items-center justify-end mt-1">
                  <p className="text-micro font-mono text-gray-400 tabular-nums">
                    {Math.floor(progress * 100)}%
                  </p>
                </div>
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
                    className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 p-3 rounded bg-surface-0/95"
                  >
                    <p className="text-caption font-bold text-white">Cancel crop?</p>
                    <p className="text-micro text-gray-400 font-mono">Seed will be lost.</p>
                    <div className="flex gap-2 mt-1">
                      <button
                        type="button"
                        onClick={() => setCancelConfirm(false)}
                        className="text-micro font-semibold px-3 py-1.5 rounded bg-white/[0.06] border border-white/[0.1] text-gray-300 hover:bg-white/[0.1] transition-colors"
                      >
                        Keep growing
                      </button>
                      <button
                        type="button"
                        onClick={() => { playClickSound(); cancelPlanting(slotIndex) }}
                        className="text-micro font-semibold px-3 py-1.5 rounded bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30 transition-colors"
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
  const req = SLOT_UNLOCK_REQUIREMENTS[slotIndex] ?? { farmerLevel: 0 }
  const gold = useGoldStore((s) => s.gold ?? 0)

  const skillXP = useSkillXP()
  const check = canUnlockSlot(slotIndex, gold, skillXP)

  const SKILL_LABELS: Record<string, string> = { crafter: 'Crafter', warrior: 'Warrior', farmer: 'Farmer' }

  return (
    <motion.button
      type="button"
      whileTap={check.canUnlock ? MOTION.interactive.tap : undefined}
      onClick={() => { playClickSound(); onUnlock() }}
      disabled={!check.canUnlock}
      className={`w-full min-h-[116px] rounded border flex flex-col items-center justify-center gap-1 transition-all ${
        check.canUnlock
          ? 'border-amber-500/30 bg-amber-500/[0.04] hover:bg-amber-500/[0.09] hover:border-amber-500/50'
          : 'border-white/[0.05] bg-surface-0/20 opacity-70 cursor-not-allowed'
      }`}
    >
      <span className="text-xl">{check.canUnlock ? '🔓' : '🔒'}</span>
      <span className="text-micro font-mono font-semibold text-amber-400">🪙 {fmt(cost)}</span>
      {req.farmerLevel > 0 && (
        <span className={`text-micro font-mono ${check.missingFarmer ? 'text-red-400' : 'text-emerald-400'}`}>
          {check.missingFarmer ? '✗' : '✓'} Farmer LVL {req.farmerLevel}
        </span>
      )}
      {req.secondarySkill && (
        <span className={`text-micro font-mono ${check.missingSecondary ? 'text-red-400' : 'text-emerald-400'}`}>
          {check.missingSecondary ? '✗' : '✓'} {SKILL_LABELS[req.secondarySkill.skillId] ?? req.secondarySkill.skillId} LVL {req.secondarySkill.level}
        </span>
      )}
      <span className="text-[7px] text-gray-500 font-mono">{check.canUnlock ? 'Tap to unlock' : 'Requirements not met'}</span>
    </motion.button>
  )
}

// ─── Seed picker ──────────────────────────────────────────────────────────────

function SeedPicker({ slotIndex, seeds, onClose }: { slotIndex: number; seeds: Record<string, number>; onClose: () => void }) {
  const plantSeed = useFarmStore((s) => s.plantSeed)
  const seedCabinetUnlocked = useFarmStore((s) => s.seedCabinetUnlocked)
  const inventoryItems = useInventoryStore((s) => s.items)

  // Merge cabinet seeds + inventory seeds so all are visible
  // When cabinet is unlocked, seeds auto-transfer from inventory → cabinet via useEffect,
  // so only count inventory seeds when cabinet is NOT unlocked to avoid double-counting
  const mergedSeeds = useMemo(() => {
    const m: Record<string, number> = { ...seeds }
    if (!seedCabinetUnlocked) {
      for (const def of SEED_DEFS) {
        const invQty = inventoryItems[def.id] ?? 0
        if (invQty > 0) m[def.id] = (m[def.id] ?? 0) + invQty
      }
    }
    return m
  }, [seeds, inventoryItems, seedCabinetUnlocked])

  const available = SEED_DEFS.filter((s) => (mergedSeeds[s.id] ?? 0) > 0)

  return (
    <motion.div
      className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-end justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0 } }}
      transition={{ duration: 0.15 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 72, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 72, opacity: 0 }}
        transition={MOTION.spring.pop}
        className="w-full max-w-sm rounded-t border-t border-x border-white/[0.09] bg-surface-0/95 backdrop-blur-md p-4 pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle bar */}
        <div className="w-8 h-1 rounded-full bg-white/15 mx-auto mb-4" />

        <div className="flex items-baseline justify-between mb-3">
          <div>
            <p className="text-sm font-semibold text-white">Choose a Seed</p>
            <p className="text-micro text-gray-500 mt-0.5 font-mono">Plot {slotIndex + 1}</p>
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
            <p className="text-micro text-gray-600 text-center">Open Seed Zips in the Farm tab to get seeds!</p>
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
                  onClick={() => {
                    playClickSound()
                    track('farm_plant', { seed_id: seed.id })
                    // If this seed is still in the inventory (not yet in cabinet), move it first
                    const cabinetQty = seeds[seed.id] ?? 0
                    if (cabinetQty <= 0) {
                      useFarmStore.getState().transferSeedsFromInventory()
                    }
                    plantSeed(slotIndex, seed.id)
                    // Sync consumed seed to Supabase immediately
                    const user = useAuthStore.getState().user
                    if (supabase && user) {
                      const { items: itm, chests: ch } = useInventoryStore.getState()
                      const { seeds: sd, seedZips: sz } = useFarmStore.getState()
                      syncInventoryToSupabase(itm, ch, { merge: false, seeds: sd, seedZips: sz }).catch(() => {})
                    }
                    onClose()
                  }}
                  className="w-full rounded border p-3 flex items-center gap-3 text-left transition-opacity hover:opacity-90"
                  style={{ borderColor: t.border, background: `linear-gradient(135deg, ${t.glow}18 0%, rgba(10,10,20,0.95) 60%)` }}
                >
                  {seed.image
                    ? <img src={seed.image} alt="" className="w-7 h-7 object-contain shrink-0" />
                    : <span className="text-2xl shrink-0">{seed.icon}</span>}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-semibold text-white">{seed.name}</p>
                      <span
                        className="text-micro font-mono uppercase px-1.5 py-0.5 rounded shrink-0"
                        style={{ color: t.color, backgroundColor: `${t.color}1A` }}
                      >
                        {seed.rarity}
                      </span>
                    </div>
                    <p className="text-micro text-gray-400">
                      ⏱ {formatGrowTime(seed.growTimeSeconds)}
                      {plant && <span className="ml-2">· yields {plant.image ? <img src={plant.image} className="w-3 h-3 object-contain inline" /> : plant.icon} ×{seed.yieldMin}–{seed.yieldMax}</span>}
                    </p>
                    <p className="text-micro text-gray-600 font-mono mt-0.5">+{seed.xpOnHarvest} Farmer XP on harvest</p>
                  </div>
                  <span
                    className="text-xs font-mono font-bold shrink-0 px-2 py-0.5 rounded"
                    style={{ color: t.color, backgroundColor: `${t.color}18` }}
                  >
                    ×{mergedSeeds[seed.id] ?? 0}
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

// ─── Plant All picker ─────────────────────────────────────────────────────────

function PlantAllPicker({ seeds, emptyCount, onClose }: { seeds: Record<string, number>; emptyCount: number; onClose: () => void }) {
  const plantAll = useFarmStore((s) => s.plantAll)
  const seedCabinetUnlocked = useFarmStore((s) => s.seedCabinetUnlocked)
  const inventoryItems = useInventoryStore((s) => s.items)

  const mergedSeeds = useMemo(() => {
    const m: Record<string, number> = { ...seeds }
    if (!seedCabinetUnlocked) {
      for (const def of SEED_DEFS) {
        const invQty = inventoryItems[def.id] ?? 0
        if (invQty > 0) m[def.id] = (m[def.id] ?? 0) + invQty
      }
    }
    return m
  }, [seeds, inventoryItems, seedCabinetUnlocked])

  const available = SEED_DEFS.filter((s) => (mergedSeeds[s.id] ?? 0) > 0)

  return (
    <motion.div
      className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-end justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0 } }}
      transition={{ duration: 0.15 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 72, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 72, opacity: 0 }}
        transition={MOTION.spring.pop}
        className="w-full max-w-sm rounded-t border-t border-x border-white/[0.09] bg-surface-0/95 backdrop-blur-md p-4 pb-20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-8 h-1 rounded-full bg-white/15 mx-auto mb-4" />

        <div className="flex items-baseline justify-between mb-3">
          <div>
            <p className="text-sm font-semibold text-white">Plant All</p>
            <p className="text-micro text-gray-500 mt-0.5 font-mono">{emptyCount} empty plot{emptyCount !== 1 ? 's' : ''}</p>
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
            <p className="text-micro text-gray-600 text-center">Open Seed Zips in the Farm tab to get seeds!</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-0.5">
            {available.map((seed) => {
              const t = rarityTheme(seed.rarity)
              const plant = LOOT_ITEMS.find((x) => x.id === seed.yieldPlantId)
              const qty = mergedSeeds[seed.id] ?? 0
              const willPlant = Math.min(qty, emptyCount)
              return (
                <motion.button
                  key={seed.id}
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    playClickSound()
                    track('farm_plant_all', { seed_id: seed.id, count: willPlant })
                    const cabinetQty = seeds[seed.id] ?? 0
                    if (cabinetQty < willPlant) {
                      useFarmStore.getState().transferSeedsFromInventory()
                    }
                    plantAll(seed.id)
                    const user = useAuthStore.getState().user
                    if (supabase && user) {
                      const { items: itm, chests: ch } = useInventoryStore.getState()
                      const { seeds: sd, seedZips: sz } = useFarmStore.getState()
                      syncInventoryToSupabase(itm, ch, { merge: false, seeds: sd, seedZips: sz }).catch(() => {})
                    }
                    onClose()
                  }}
                  className="w-full rounded border p-3 flex items-center gap-3 text-left transition-opacity hover:opacity-90"
                  style={{ borderColor: t.border, background: `linear-gradient(135deg, ${t.glow}18 0%, rgba(10,10,20,0.95) 60%)` }}
                >
                  {seed.image
                    ? <img src={seed.image} alt="" className="w-7 h-7 object-contain shrink-0" />
                    : <span className="text-2xl shrink-0">{seed.icon}</span>}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-semibold text-white">{seed.name}</p>
                      <span
                        className="text-micro font-mono uppercase px-1.5 py-0.5 rounded shrink-0"
                        style={{ color: t.color, backgroundColor: `${t.color}1A` }}
                      >
                        {seed.rarity}
                      </span>
                    </div>
                    <p className="text-micro text-gray-400">
                      ⏱ {formatGrowTime(seed.growTimeSeconds)}
                      {plant && <span className="ml-2">· yields {plant.image ? <img src={plant.image} className="w-3 h-3 object-contain inline" /> : plant.icon} ×{seed.yieldMin}–{seed.yieldMax}</span>}
                    </p>
                  </div>
                  <div className="flex flex-col items-end shrink-0">
                    <span
                      className="text-xs font-mono font-bold px-2 py-0.5 rounded"
                      style={{ color: t.color, backgroundColor: `${t.color}18` }}
                    >
                      ×{qty}
                    </span>
                    <span className="text-micro text-gray-500 font-mono mt-0.5">
                      plant {willPlant}
                    </span>
                  </div>
                </motion.button>
              )
            })}
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

// ─── Farmhouse section ────────────────────────────────────────────────────────

function formatBuildTime(ms: number): string {
  if (ms <= 0) return '0s'
  const d = Math.floor(ms / 86_400_000)
  const h = Math.floor((ms % 86_400_000) / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  if (m > 0) return s > 0 ? `${m}m ${s}s` : `${m}m`
  return `${s}s`
}

function FarmhouseSection({ farmerLevel, farmhouseLevel, onUpgrade }: { farmerLevel: number; farmhouseLevel: number; onUpgrade: () => boolean }) {
  const isUnlocked = farmerLevel >= FARMHOUSE_UNLOCK_LEVEL
  const bonuses = getFarmhouseBonuses(farmhouseLevel)
  const nextUpgrade = getNextFarmhouseUpgrade(farmhouseLevel)
  const icon = getFarmhouseIcon(farmhouseLevel)
  const gold = useGoldStore((s) => s.gold ?? 0)
  const inventoryItems = useInventoryStore((s) => s.items)
  const buildStartedAt = useFarmStore((s) => s.farmhouseBuildStartedAt)
  const buildTargetLevel = useFarmStore((s) => s.farmhouseBuildTargetLevel)
  const completeFarmhouseBuild = useFarmStore((s) => s.completeFarmhouseBuild)
  const [upgradeError, setUpgradeError] = useState('')
  const [justUpgraded, setJustUpgraded] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const isMaxed = farmhouseLevel >= 10
  const isBuilding = buildStartedAt != null

  // Tick for build countdown
  const [, forceUpdate] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    if (!isBuilding) return
    const id = setInterval(forceUpdate, 1000)
    return () => clearInterval(id)
  }, [isBuilding])

  // Auto-complete build
  const buildTimeTotal = nextUpgrade?.buildDurationMs ?? 0
  const buildElapsed = isBuilding ? Date.now() - buildStartedAt : 0
  const buildRemaining = Math.max(0, buildTimeTotal - buildElapsed)
  const buildPct = buildTimeTotal > 0 ? Math.min(100, (buildElapsed / buildTimeTotal) * 100) : 0

  useEffect(() => {
    if (isBuilding && buildRemaining <= 0) {
      const ok = completeFarmhouseBuild()
      if (ok) {
        setJustUpgraded(true)
        setTimeout(() => setJustUpgraded(false), 2500)
      }
    }
  }, [isBuilding, buildRemaining, completeFarmhouseBuild])

  const handleUpgrade = () => {
    playClickSound()
    const ok = onUpgrade()
    if (ok) {
      setJustUpgraded(true)
      setUpgradeError('')
      setTimeout(() => setJustUpgraded(false), 2500)
    } else {
      setUpgradeError('Requirements not met')
      setTimeout(() => setUpgradeError(''), 2000)
    }
  }

  // Progress bar for farmhouse level (0-10)
  const progressPct = (farmhouseLevel / 10) * 100
  const accentColor = isMaxed ? '#84cc16' : '#f59e0b'

  if (!isUnlocked) {
    return (
      <div className="rounded-card border border-white/[0.06] overflow-hidden"
        style={{ background: 'linear-gradient(160deg, rgba(15,12,8,0.95) 0%, rgba(12,10,15,0.97) 100%)' }}
      >
        <div className="p-4 flex items-center gap-3.5">
          <div className="relative">
            <span className="text-3xl opacity-30 grayscale">🏚️</span>
            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center">
              <span className="text-micro">🔒</span>
            </div>
          </div>
          <div className="flex-1">
            <p className="text-body font-bold text-gray-500">Farmhouse</p>
            <p className="text-caption text-gray-600 font-mono mt-0.5">
              Unlocks at <span className="text-amber-500 font-bold">Farmer LVL {FARMHOUSE_UNLOCK_LEVEL}</span>
            </p>
            {/* Mini progress to unlock */}
            <div className="mt-1.5 h-1.5 rounded-full bg-white/[0.04] overflow-hidden w-32">
              <div className="h-full rounded-full bg-amber-500/40 transition-all" style={{ width: `${Math.min(100, (farmerLevel / FARMHOUSE_UNLOCK_LEVEL) * 100)}%` }} />
            </div>
            <p className="text-micro text-gray-600 font-mono mt-0.5">LVL {farmerLevel}/{FARMHOUSE_UNLOCK_LEVEL}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-card border overflow-hidden relative"
      style={{
        borderColor: isMaxed ? 'rgba(132,204,22,0.25)' : 'rgba(245,158,11,0.2)',
        background: isMaxed
          ? 'linear-gradient(160deg, rgba(132,204,22,0.04) 0%, rgba(10,10,18,0.97) 50%)'
          : 'linear-gradient(160deg, rgba(245,158,11,0.04) 0%, rgba(10,10,18,0.97) 50%)',
      }}
    >
      {/* Subtle ambient glow */}
      <div className="absolute top-0 left-0 w-full h-24 pointer-events-none"
        style={{ background: `radial-gradient(ellipse 80% 60% at 25% 0%, ${accentColor}08 0%, transparent 70%)` }}
      />

      {/* Header — always visible */}
      <button
        type="button"
        className="w-full p-4 pb-3 flex items-center gap-3.5 text-left relative z-10"
        onClick={() => { playClickSound(); setExpanded(!expanded) }}
      >
        {/* House icon with level ring */}
        <div className="relative shrink-0">
          <motion.div
            animate={justUpgraded ? { scale: [1, 1.25, 1], rotate: [0, 8, -8, 0] } : undefined}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="w-12 h-12 rounded flex items-center justify-center border"
            style={{
              borderColor: `${accentColor}30`,
              background: `linear-gradient(145deg, ${accentColor}12 0%, rgba(10,10,18,0.9) 70%)`,
              boxShadow: `0 0 20px ${accentColor}10`,
            }}
          >
            <span className="text-2xl">{icon}</span>
          </motion.div>
          {farmhouseLevel > 0 && (
            <div className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-micro font-black border"
              style={{
                background: isMaxed ? '#84cc16' : '#f59e0b',
                borderColor: isMaxed ? '#65a30d' : '#d97706',
                color: '#000',
              }}
            >
              {farmhouseLevel}
            </div>
          )}
        </div>

        {/* Title + level bar */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-body font-bold text-white">Farmhouse</p>
            {isMaxed && (
              <span className="text-micro font-mono font-black px-1.5 py-0.5 rounded bg-lime-400/15 text-lime-400 border border-lime-400/25 tracking-wider">
                MAX
              </span>
            )}
          </div>
          {/* Level progress bar */}
          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: accentColor }}
                initial={false}
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            </div>
            <span className="text-micro font-mono text-gray-500 shrink-0 tabular-nums">{farmhouseLevel}/10</span>
          </div>
          {/* Inline bonus summary */}
          {farmhouseLevel > 0 && !isBuilding ? (
            <div className="flex items-center gap-2.5 mt-1">
              <span className="text-micro font-mono text-red-400/70">💀-{bonuses.rotReductionPct}%</span>
              <span className="text-micro font-mono text-cyan-400/70">⚡-{bonuses.growSpeedPct}%</span>
              <span className="text-micro font-mono text-amber-400/70">🧪{bonuses.autoCompostPct}%</span>
              <span className="text-micro font-mono text-lime-400/70">🌾+{bonuses.yieldBonusPct}%</span>
              {bonuses.autoHarvest && <span className="text-micro font-mono text-lime-400">✨</span>}
            </div>
          ) : isBuilding ? (
            <div className="mt-1.5">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-amber-500"
                    initial={false}
                    animate={{ width: `${buildPct}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                  />
                </div>
                <span className="text-micro font-mono text-amber-400 shrink-0 tabular-nums">{formatBuildTime(buildRemaining)}</span>
              </div>
              <p className="text-micro text-amber-400/60 font-mono mt-0.5">🔨 Building LVL {buildTargetLevel}…</p>
            </div>
          ) : (
            <p className="text-micro text-gray-500 mt-0.5">Tap to build and gain farming bonuses</p>
          )}
        </div>

        {/* Expand chevron */}
        <motion.span
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-gray-600 text-micro shrink-0"
        >
          ▼
        </motion.span>
      </button>

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: MOTION.easing }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3">
              {/* Active bonuses grid */}
              {farmhouseLevel > 0 && (
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { icon: '💀', label: 'Rot Reduction', value: `-${bonuses.rotReductionPct}%`, color: '#f87171', desc: 'Less chance crops will rot' },
                    { icon: '⚡', label: 'Growth Speed', value: `-${bonuses.growSpeedPct}%`, color: '#22d3ee', desc: 'Faster growing time' },
                    { icon: '🧪', label: 'Auto-Compost', value: `${bonuses.autoCompostPct}%`, color: '#f59e0b', desc: 'Auto-apply on plant' },
                    { icon: '🌾', label: 'Yield Bonus', value: `+${bonuses.yieldBonusPct}%`, color: '#84cc16', desc: 'Extra harvest yield' },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded p-2.5 border border-white/[0.04]"
                      style={{ background: `linear-gradient(135deg, ${stat.color}06 0%, transparent 70%)` }}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-caption">{stat.icon}</span>
                        <span className="text-micro font-mono text-gray-500 uppercase tracking-wider">{stat.label}</span>
                      </div>
                      <p className="text-[15px] font-mono font-black" style={{ color: stat.color }}>{stat.value}</p>
                      <p className="text-micro text-gray-600 font-mono mt-0.5">{stat.desc}</p>
                    </div>
                  ))}
                  {bonuses.autoHarvest && (
                    <div className="col-span-2 rounded p-2.5 border border-lime-400/20"
                      style={{ background: 'linear-gradient(135deg, rgba(132,204,22,0.06) 0%, transparent 70%)' }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-lg">✨</span>
                        <div>
                          <p className="text-caption font-bold text-lime-400">Auto-Harvest Active</p>
                          <p className="text-micro text-gray-500 font-mono">Ready crops are automatically collected</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Upgrade section */}
              {nextUpgrade && (
                <div className="rounded-card border border-white/[0.06] overflow-hidden"
                  style={{ background: 'rgba(0,0,0,0.2)' }}
                >
                  {/* Upgrade header */}
                  <div className="px-3 py-2.5 border-b border-white/[0.04] flex items-center justify-between">
                    <p className="text-caption font-bold text-white">
                      {farmhouseLevel === 0 ? 'Build Farmhouse' : `Upgrade to Level ${nextUpgrade.level}`}
                    </p>
                    <span className="text-micro font-mono text-gray-500">🕐 {formatBuildTime(nextUpgrade.buildDurationMs)}</span>
                  </div>

                  {/* Requirements */}
                  <div className="px-3 py-2.5 space-y-2">
                    {/* Gold cost */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`text-micro ${gold >= nextUpgrade.goldCost ? 'text-emerald-400' : 'text-red-400'}`}>
                          {gold >= nextUpgrade.goldCost ? '✓' : '✗'}
                        </span>
                        <span className="text-caption text-amber-400 font-mono">🪙 {fmt(nextUpgrade.goldCost)}</span>
                      </div>
                      <span className="text-micro text-gray-600 font-mono">{fmt(gold)} owned</span>
                    </div>

                    {/* Material costs — displayed as compact cards */}
                    <div className="grid grid-cols-2 gap-1">
                      {Object.entries(nextUpgrade.materials).map(([matId, qty]) => {
                        const have = inventoryItems[matId] ?? 0
                        const ok = have >= qty
                        const item = LOOT_ITEMS.find((x) => x.id === matId)
                        return (
                          <div key={matId} className="flex items-center gap-1.5 px-2 py-1.5 rounded border transition-colors"
                            style={{
                              borderColor: ok ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.04)',
                              background: ok ? 'rgba(74,222,128,0.03)' : 'rgba(255,255,255,0.01)',
                            }}
                          >
                            <span className={`text-micro shrink-0 ${ok ? 'text-emerald-400' : 'text-red-400/60'}`}>
                              {ok ? '✓' : '✗'}
                            </span>
                            {item?.image
                              ? <img src={item.image} alt="" className="w-5 h-5 object-contain shrink-0" />
                              : <span className="text-base shrink-0">{item?.icon ?? '📦'}</span>
                            }
                            <div className="flex-1 min-w-0">
                              <p className="text-micro font-medium text-gray-200 truncate">{item?.name ?? matId}</p>
                              <p className="text-micro font-mono" style={{ color: ok ? '#4ade80' : '#9ca3af' }}>
                                {have}/{qty}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Upgrade button or build progress */}
                  <div className="px-3 pb-3">
                    {isBuilding ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-3 rounded-full bg-white/[0.06] overflow-hidden">
                            <motion.div
                              className="h-full rounded-full"
                              style={{ backgroundColor: accentColor }}
                              initial={false}
                              animate={{ width: `${buildPct}%` }}
                              transition={{ duration: 0.5, ease: 'easeOut' }}
                            />
                          </div>
                          <span className="text-caption font-mono font-bold tabular-nums" style={{ color: accentColor }}>{Math.floor(buildPct)}%</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-caption font-mono text-amber-400/80">🔨 Construction in progress…</p>
                          <p className="text-caption font-mono text-gray-400 tabular-nums">{formatBuildTime(buildRemaining)} left</p>
                        </div>
                      </div>
                    ) : (
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      onClick={handleUpgrade}
                      className="w-full py-2.5 rounded border text-xs font-black tracking-wide transition-all relative overflow-hidden"
                      style={{
                        borderColor: `${accentColor}50`,
                        background: `linear-gradient(135deg, ${accentColor}18 0%, ${accentColor}08 100%)`,
                        color: accentColor,
                      }}
                    >
                      {/* Shimmer */}
                      <motion.div
                        className="absolute inset-0 pointer-events-none"
                        animate={{ x: ['-100%', '200%'] }}
                        transition={{ duration: 2, repeat: Infinity, repeatDelay: 1.5, ease: 'linear' }}
                        style={{ background: `linear-gradient(90deg, transparent, ${accentColor}10, transparent)`, width: '40%' }}
                      />
                      <span className="relative z-10">
                        {farmhouseLevel === 0 ? '🏠 Build Farmhouse' : `⬆ Upgrade to LVL ${nextUpgrade.level}`}
                      </span>
                    </motion.button>
                    )}
                    <AnimatePresence>
                      {upgradeError && (
                        <motion.p
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className="text-micro text-red-400 font-mono text-center mt-1.5"
                        >
                          {upgradeError}
                        </motion.p>
                      )}
                      {justUpgraded && (
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className="text-center mt-1.5"
                        >
                          <span className="text-micro text-emerald-400 font-mono font-bold">✨ Farmhouse upgraded!</span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              )}

              {/* Max level message */}
              {isMaxed && (
                <div className="text-center py-2">
                  <p className="text-caption font-mono text-lime-400/60">🏰 Farmhouse is fully upgraded!</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function FarmPage() {
  const navigateTo = useNavigationStore((s) => s.navigateTo)
  const { user } = useAuthStore()
  const unlockedSlots = useFarmStore((s) => s.unlockedSlots)
  const planted = useFarmStore((s) => s.planted)
  const seeds = useFarmStore((s) => s.seeds)
  const unlockNextSlot = useFarmStore((s) => s.unlockNextSlot)
  const harvestAll = useFarmStore((s) => s.harvestAll)
  const compostAll = useFarmStore((s) => s.compostAll)
  const compostedSlots = useFarmStore((s) => s.compostedSlots)
  const compostCount = useInventoryStore((s) => s.items['compost'] ?? 0)
  const activeField = useFarmStore((s) => s.activeField)
  const setActiveField = useFarmStore((s) => s.setActiveField)
  const farmhouseLevel = useFarmStore((s) => s.farmhouseLevel)
  const upgradeFarmhouse = useFarmStore((s) => s.upgradeFarmhouse)
  const skillXP = useSkillXP()
  const farmerLevel = skillLevelFromXP(skillXP['farmer'] ?? 0)
  const emptyUncompostedCount = Array.from({ length: unlockedSlots }, (_, i) => i).filter((i) => !planted[i] && !compostedSlots[i]).length
  const emptySlotCount = Array.from({ length: unlockedSlots }, (_, i) => i).filter((i) => !planted[i]).length
  const hasAnySeed = SEED_DEFS.some((s) => (seeds[s.id] ?? 0) > 0)
  const activeFieldDef = FIELD_DEFS.find((f) => f.id === activeField) ?? FIELD_DEFS[0]

  // Rot tick
  useFarmRotTick()
  const [pickerSlot, setPickerSlot] = useState<number | null>(null)
  const [showPlantAll, setShowPlantAll] = useState(false)
  const [unlockError, setUnlockError] = useState(false)
  const [justUnlockedSlot, setJustUnlockedSlot] = useState<number | null>(null)
  const [harvestResult, setHarvestResult] = useState<HarvestResult | null>(null)
  const [harvestQueue, setHarvestQueue] = useState<HarvestResult[]>([])
  const runSync = useCallback(async () => {
    if (!supabase || !user) return
    try {
      ensureInventoryHydrated()
      const { items, chests } = useInventoryStore.getState()
      const { seeds: s, seedZips } = useFarmStore.getState()
      await syncInventoryToSupabase(items, chests, { merge: false, seeds: s, seedZips })
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
      className="p-4 pb-20 space-y-4"
    >
      <PageHeader
        title="Farm"
        icon={<Sprout className="w-4 h-4 text-green-400" />}
        onBack={() => navigateTo?.('home')}
        backLabel="Home"
        rightSlot={
          <div className="flex items-center gap-2">
            {/* Plant All — unlocks at Farmer LVL 10 */}
            <div className="relative group">
              <button
                type="button"
                disabled={farmerLevel < 10 || emptySlotCount === 0 || !hasAnySeed}
                onClick={() => {
                  if (farmerLevel < 10 || emptySlotCount === 0 || !hasAnySeed) return
                  playClickSound()
                  setShowPlantAll(true)
                }}
                className={`text-micro font-semibold px-2 py-1 rounded border transition-colors ${
                  farmerLevel >= 10 && emptySlotCount > 0 && hasAnySeed
                    ? 'bg-emerald-500/12 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                    : 'bg-white/[0.03] border-white/[0.06] text-gray-600 cursor-not-allowed'
                }`}
              >
                🌱 {farmerLevel >= 10 ? 'Plant All' : '🔒 Plant All'}
              </button>
              {farmerLevel < 10 && (
                <div className="absolute right-0 top-full mt-1 z-50 hidden group-hover:block w-44">
                  <div className="bg-surface-0 border border-white/10 rounded px-2.5 py-1.5 text-micro text-gray-300 font-mono shadow-lg">
                    Unlocks at <span className="text-emerald-400 font-bold">Farmer LVL 10</span>
                    <br />Current level: <span className="text-white">{farmerLevel}</span>
                    <br />Plant one seed in all empty plots
                  </div>
                </div>
              )}
            </div>
            {/* Compost All — unlocks at Farmer LVL 50 */}
            <div className="relative group">
              <button
                type="button"
                disabled={farmerLevel < 50 || emptyUncompostedCount === 0 || compostCount < COMPOST_PER_PLOT}
                onClick={() => {
                  if (farmerLevel < 50 || emptyUncompostedCount === 0 || compostCount < COMPOST_PER_PLOT) return
                  playClickSound()
                  compostAll()
                }}
                className={`text-micro font-semibold px-2 py-1 rounded border transition-colors ${
                  farmerLevel >= 50 && emptyUncompostedCount > 0 && compostCount >= COMPOST_PER_PLOT
                    ? 'bg-amber-500/12 border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
                    : 'bg-white/[0.03] border-white/[0.06] text-gray-600 cursor-not-allowed'
                }`}
              >
                🧪 {farmerLevel >= 50 ? 'Compost All' : '🔒 Compost All'}
              </button>
              {farmerLevel < 50 && (
                <div className="absolute right-0 top-full mt-1 z-50 hidden group-hover:block w-44">
                  <div className="bg-surface-0 border border-white/10 rounded px-2.5 py-1.5 text-micro text-gray-300 font-mono shadow-lg">
                    Unlocks at <span className="text-amber-400 font-bold">Farmer LVL 50</span>
                    <br />Current level: <span className="text-white">{farmerLevel}</span>
                    <br />Compost empty plots automatically
                  </div>
                </div>
              )}
            </div>
            <GoldDisplay />
          </div>
        }
      />

      {/* ── Plots ── */}
      <div className="rounded-card border border-white/[0.08] bg-surface-2/70 p-3">
        {/* Header row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <p className="text-micro uppercase tracking-wider text-gray-300 font-mono">
              Plots <span className="text-white/60 ml-0.5">{unlockedSlots}/{MAX_FARM_SLOTS}</span>
            </p>
            {(growingCount > 0 || readyCount > 0) && (
              <div className="flex items-center gap-1.5">
                {growingCount > 0 && (
                  <span className="text-micro font-mono px-1.5 py-px rounded bg-white/[0.08] text-gray-300">
                    {growingCount} growing
                  </span>
                )}
                {readyCount > 0 && (
                  <span className="text-micro font-mono px-1.5 py-px rounded bg-lime-400/15 text-lime-400 border border-lime-400/25">
                    {readyCount} ready
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <AnimatePresence>
              {readyCount >= 1 && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  onClick={() => {
                    playClickSound()
                    const res = harvestAll()
                    if (res.length === 0) return
                    // Aggregate by plant type
                    const map = new Map<string, HarvestResult>()
                    for (const r of res) {
                      const existing = map.get(r.yieldPlantId)
                      if (existing) {
                        existing.qty += r.qty
                        existing.xpGained += r.xpGained
                        existing.plotCount = (existing.plotCount ?? 1) + 1
                        if (r.composted) existing.compostedCount = (existing.compostedCount ?? (existing.composted ? 1 : 0)) + 1
                        if (r.compostDrop) existing.compostDropCount = (existing.compostDropCount ?? (existing.compostDrop ? 1 : 0)) + 1
                        if (r.seedDrop) existing.seedDropCount = (existing.seedDropCount ?? (existing.seedDrop ? 1 : 0)) + 1
                        if (r.seedZipTier) {
                          if (!existing.seedZipDrops) {
                            existing.seedZipDrops = existing.seedZipTier ? [{ tier: existing.seedZipTier, count: 1 }] : []
                            existing.seedZipTier = null
                          }
                          const z = existing.seedZipDrops.find((s) => s.tier === r.seedZipTier)
                          if (z) z.count++
                          else existing.seedZipDrops.push({ tier: r.seedZipTier!, count: 1 })
                        }
                      } else {
                        map.set(r.yieldPlantId, { ...r, plotCount: 1 })
                      }
                    }
                    const merged = Array.from(map.values())
                    setHarvestResult(merged[0])
                    setHarvestQueue(merged.slice(1))
                    syncAfterHarvest()
                  }}
                  className="text-micro font-semibold px-3 py-1.5 rounded bg-lime-400/15 border border-lime-400/35 text-lime-400 hover:bg-lime-400/25 transition-colors"
                >
                  Claim All{readyCount > 1 ? ` (${readyCount})` : ''}
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Field tabs */}
        <div className="flex gap-1 mb-3">
          {FIELD_DEFS.map((field) => {
            const isActive = activeField === field.id
            const fieldSlots = field.slots
            const fieldUnlocked = fieldSlots.filter((i) => i < unlockedSlots).length
            const fieldGrowing = fieldSlots.filter((i) => {
              const s = planted[i]
              return s && !s.rotted && (Date.now() - s.plantedAt) / 1000 < s.growTimeSeconds
            }).length
            const fieldReady = fieldSlots.filter((i) => {
              const s = planted[i]
              return s && !s.rotted && (Date.now() - s.plantedAt) / 1000 >= s.growTimeSeconds
            }).length
            const isLocked = field.id === 'field2' && unlockedSlots <= 8
            // Requirements for Field 2 unlock
            const field2Req = SLOT_UNLOCK_REQUIREMENTS[8]
            return (
              <div key={field.id} className="flex-1 relative group">
                <button
                  type="button"
                  disabled={isLocked}
                  onClick={() => { playClickSound(); setActiveField(field.id) }}
                  className={`w-full py-1.5 px-2 rounded text-micro font-mono font-semibold transition-all border ${
                    isLocked
                      ? 'border-white/[0.04] bg-surface-0/20 text-gray-600 cursor-not-allowed'
                      : isActive
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                        : 'border-white/[0.06] bg-white/[0.02] text-gray-400 hover:bg-white/[0.05]'
                  }`}
                >
                  <span>{isLocked ? '🔒 ' : ''}{field.label}</span>
                  {!isLocked && (fieldGrowing > 0 || fieldReady > 0) && (
                    <span className="ml-1.5 text-micro">
                      {fieldGrowing > 0 && <span className="text-gray-500">{fieldGrowing}⏳</span>}
                      {fieldReady > 0 && <span className="text-lime-400 ml-0.5">{fieldReady}✓</span>}
                    </span>
                  )}
                  {!isLocked && <span className="text-micro text-gray-600 ml-1">{fieldUnlocked}/8</span>}
                </button>
                {isLocked && (
                  <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 z-50 hidden group-hover:block w-48">
                    <div className="bg-surface-0 border border-white/10 rounded px-3 py-2 shadow-xl">
                      <p className="text-micro font-bold text-white mb-1.5">Unlock Field 2</p>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-micro ${unlockedSlots > 8 ? 'text-emerald-400' : 'text-red-400'}`}>{unlockedSlots > 8 ? '✓' : '✗'}</span>
                          <span className="text-micro text-gray-300 font-mono">Unlock all Field 1 plots</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-micro ${farmerLevel >= field2Req.farmerLevel ? 'text-emerald-400' : 'text-red-400'}`}>{farmerLevel >= field2Req.farmerLevel ? '✓' : '✗'}</span>
                          <span className="text-micro text-gray-300 font-mono">Farmer LVL {field2Req.farmerLevel}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-micro ${(useGoldStore.getState().gold ?? 0) >= (SLOT_UNLOCK_COSTS[8] ?? 0) ? 'text-emerald-400' : 'text-red-400'}`}>{(useGoldStore.getState().gold ?? 0) >= (SLOT_UNLOCK_COSTS[8] ?? 0) ? '✓' : '✗'}</span>
                          <span className="text-micro text-amber-400 font-mono">🪙 {fmt(SLOT_UNLOCK_COSTS[8] ?? 0)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* 2-col grid — current field */}
        <div className="grid grid-cols-2 gap-2">
          {activeFieldDef.slots.map((i) => {
            if (i < unlockedSlots) return <FarmSlot key={i} slotIndex={i} onOpenSeedPicker={setPickerSlot} onHarvested={(r) => { setHarvestResult(r); syncAfterHarvest() }} />
            if (i === unlockedSlots) return <LockedSlot key={i} slotIndex={i} onUnlock={handleUnlock} />
            const fade = Math.max(0.18, 0.45 - (i - unlockedSlots - 1) * 0.08)
            return (
              <div
                key={i}
                className="min-h-[116px] rounded border border-white/[0.04] bg-surface-0/15 flex flex-col items-center justify-center gap-1"
                style={{ opacity: fade }}
              >
                <span className="text-gray-500 text-base">🔒</span>
                {SLOT_UNLOCK_COSTS[i] != null && (
                  <span className="text-micro font-mono text-gray-500">🪙 {fmt(SLOT_UNLOCK_COSTS[i]!)}</span>
                )}
                {SLOT_UNLOCK_REQUIREMENTS[i]?.farmerLevel > 0 && (
                  <span className="text-[7px] font-mono text-gray-600">Farmer LVL {SLOT_UNLOCK_REQUIREMENTS[i].farmerLevel}</span>
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
              className="text-micro text-red-400 font-mono text-center mt-2"
            >
              Requirements not met
            </motion.p>
          )}
        </AnimatePresence>
        {!unlockError && unlockedSlots < MAX_FARM_SLOTS && (
          <p className="text-micro text-gray-400 font-mono text-center mt-2">
            Next plot · 🪙 {fmt(SLOT_UNLOCK_COSTS[unlockedSlots] ?? 0)} gold
            {(SLOT_UNLOCK_REQUIREMENTS[unlockedSlots]?.farmerLevel ?? 0) > 0 && (
              <span> · Farmer LVL {SLOT_UNLOCK_REQUIREMENTS[unlockedSlots].farmerLevel}</span>
            )}
          </p>
        )}
      </div>

      {/* ── Farmhouse ── */}
      <FarmhouseSection farmerLevel={farmerLevel} farmhouseLevel={farmhouseLevel} onUpgrade={upgradeFarmhouse} />

      {/* ── Seed Zips ── */}
      <SeedZipSection />

      {/* ── Seed Cabinet ── */}
      <SeedCabinetSection />

      {/* ── Farmer hint ── */}
      <div className="flex items-center gap-2.5 px-3 py-2.5 rounded border border-white/[0.05] bg-surface-2/30">
        <span className="text-base leading-none shrink-0">🌾</span>
        <p className="text-micro text-gray-400 leading-snug">
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

      {/* ── Plant All picker modal ── */}
      <AnimatePresence>
        {showPlantAll && (
          <PlantAllPicker
            seeds={seeds}
            emptyCount={emptySlotCount}
            onClose={() => setShowPlantAll(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Harvest result modal (single slot) ── */}
      <AnimatePresence>
        {harvestResult && (
          <HarvestRevealModal
            key={`${harvestResult.yieldPlantId}-${harvestResult.qty}-${harvestQueue.length}`}
            result={harvestResult}
            remaining={harvestQueue.length}
            onClose={() => {
              if (harvestQueue.length > 0) {
                setHarvestResult(harvestQueue[0])
                setHarvestQueue(harvestQueue.slice(1))
              } else {
                setHarvestResult(null)
              }
            }}
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
