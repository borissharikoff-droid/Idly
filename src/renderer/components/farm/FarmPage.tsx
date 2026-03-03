import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useFarmStore, type HarvestResult } from '../../stores/farmStore'
import { useGoldStore } from '../../stores/goldStore'
import { useAuthStore } from '../../stores/authStore'
import { supabase } from '../../lib/supabase'
import { syncInventoryToSupabase, fetchFarmFromCloud } from '../../services/supabaseSync'
import { ensureInventoryHydrated, useInventoryStore } from '../../stores/inventoryStore'
import { SEED_DEFS, SLOT_UNLOCK_COSTS, MAX_FARM_SLOTS, getSeedById, formatGrowTime, SEED_ZIP_LABELS, SEED_ZIP_ITEM_IDS, type SeedZipTier } from '../../lib/farming'
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
          <span key={i} className="text-[12px] font-mono text-white/90">
            {p.icon} <span className="text-lime-400 font-bold">×{p.qty}</span>
          </span>
        ))}
        {zipCount > 0 && (
          <span className="text-[11px] text-gray-300 font-mono">🎒 ×{zipCount} Seed Zip</span>
        )}
      </div>
    </motion.div>
  )
}

// ─── Seed Zip section ────────────────────────────────────────────────────────

const ZIP_TIER_ORDER: SeedZipTier[] = ['common', 'rare', 'epic', 'legendary']

const ZIP_RARITY_MAP: Record<SeedZipTier, string> = {
  common: 'common',
  rare: 'rare',
  epic: 'epic',
  legendary: 'legendary',
}

function SeedZipSection() {
  const seedZips = useFarmStore((s) => s.seedZips)
  const openSeedZip = useFarmStore((s) => s.openSeedZip)
  const removeSeedZip = useFarmStore((s) => s.removeSeedZip)
  const [lastOpened, setLastOpened] = useState<{ tier: SeedZipTier; seedId: string } | null>(null)
  const [sellTarget, setSellTarget] = useState<SeedZipTier | null>(null)

  const totalZips = ZIP_TIER_ORDER.reduce((acc, t) => acc + (seedZips[t] ?? 0), 0)

  const handleOpen = useCallback((tier: SeedZipTier) => {
    playClickSound()
    const seedId = openSeedZip(tier)
    if (seedId) {
      setLastOpened({ tier, seedId })
      setTimeout(() => setLastOpened(null), 2400)
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
          const t = rarityTheme(ZIP_RARITY_MAP[tier])
          const count = seedZips[tier] ?? 0
          return (
            <motion.div key={tier} layout className="rounded-lg border flex items-center gap-2.5 px-2.5 py-2"
              style={{ borderColor: t.border, background: `linear-gradient(135deg, ${t.glow}10 0%, rgba(10,10,20,0.88) 60%)` }}
            >
              <span className="text-xl shrink-0">🎒</span>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-white">{SEED_ZIP_LABELS[tier]} Seed Zip</p>
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

      {/* Toast: last opened seed */}
      <AnimatePresence>
        {lastOpened && (() => {
          const seed = getSeedById(lastOpened.seedId)
          const t = seed ? rarityTheme(seed.rarity) : null
          const plant = seed ? LOOT_ITEMS.find((x) => x.id === seed.yieldPlantId) : null
          return seed && t ? (
            <motion.div
              key="zip-toast"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className="mt-2 rounded-lg border flex items-center gap-2.5 px-3 py-2"
              style={{ borderColor: t.border, background: `linear-gradient(135deg, ${t.glow}18 0%, rgba(10,10,20,0.92) 60%)` }}
            >
              <span className="text-lg">{seed.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-white">{seed.name}</p>
                <p className="text-[9px] text-gray-400 mt-0.5">
                  ⏱ {formatGrowTime(seed.growTimeSeconds)}
                  {plant && <span className="ml-1.5">· yields {plant.icon} ×1–{seed.yieldMax}</span>}
                </p>
              </div>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0" style={{ color: t.color, backgroundColor: `${t.color}18` }}>
                {seed.rarity}
              </span>
            </motion.div>
          ) : null
        })()}
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
          initial={{ rotate: -4, scale: 0.92 }}
          animate={{ rotate: [0, -4, 4, 0], scale: [0.92, 1.08, 1.0] }}
          transition={{ duration: 0.9, ease: MOTION.easing }}
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
              <span className="text-base">🎒</span>
              <div className="flex-1 text-left">
                <p className="text-[10px] font-bold leading-none" style={{ color: zipT.color }}>Bonus drop!</p>
                <p className="text-[9px] text-gray-400 font-mono mt-0.5">{SEED_ZIP_LABELS[result.seedZipTier]} Seed Zip</p>
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
  const seed = planted ? getSeedById(planted.seedId) : null
  const remaining = useCountdown(planted?.plantedAt ?? 0, planted?.growTimeSeconds ?? 0)
  const isReady = !!planted && remaining <= 0
  const progress = planted ? Math.min(1, 1 - remaining / planted.growTimeSeconds) : 0
  const [bursting, setBursting] = useState(false)

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
                  animate={{ opacity: 0, y: -32, scale: 1.08 }}
                  transition={{ duration: 0.6, ease: MOTION.easingSoft }}
                >
                  <span className="text-[11px] font-black text-white bg-lime-500 px-3.5 py-1 rounded-full shadow-lg tracking-wide">
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
                <span className="text-base leading-none shrink-0">{seed?.icon ?? '🌱'}</span>
                <p className="text-[10px] font-medium text-white/80 truncate flex-1">{seed?.name}</p>
                <span className="text-[8px] font-mono font-bold text-lime-400 shrink-0 tracking-wider">READY</span>
              </div>

              {/* Big harvest button */}
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
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
            <div className="px-3 py-2.5 flex flex-col gap-0 h-full min-h-[116px]">
              {/* Seed info top */}
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-sm leading-none shrink-0">{seed?.icon ?? '🌱'}</span>
                <p className="text-[10px] font-medium text-white truncate flex-1">{seed?.name}</p>
                {theme && (
                  <span
                    className="text-[7px] font-mono uppercase tracking-wider px-1.5 py-px rounded shrink-0"
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
                  <span className="text-2xl shrink-0">{seed.icon}</span>
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
  const [harvestResult, setHarvestResult] = useState<HarvestResult | null>(null)
  const [harvestAllResults, setHarvestAllResults] = useState<HarvestResult[] | null>(null)
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

  const now = Date.now()
  const readyCount = Object.values(planted).filter(
    (s) => !!s && (now - s.plantedAt) / 1000 >= s.growTimeSeconds,
  ).length
  const growingCount = Object.values(planted).filter(
    (s) => !!s && (now - s.plantedAt) / 1000 < s.growTimeSeconds,
  ).length
  const totalSeeds = Object.values(seeds).reduce((a, b) => a + b, 0)

  const handleUnlock = useCallback(() => {
    playClickSound()
    const ok = unlockNextSlot()
    if (!ok) {
      setUnlockError(true)
      setTimeout(() => setUnlockError(false), 1600)
    }
  }, [unlockNextSlot])

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
                onClick={() => { playClickSound(); const res = harvestAll(); if (res.length > 0) { setHarvestAllResults(res); syncAfterHarvest() } }}
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

      {/* ── Harvest All banner ── */}
      <AnimatePresence>
        {harvestAllResults && (
          <HarvestAllBanner results={harvestAllResults} onDone={() => setHarvestAllResults(null)} />
        )}
      </AnimatePresence>

      {/* ── Seed Zips ── */}
      <SeedZipSection />

      {/* ── Seeds ── */}
      <div className="rounded-xl border border-white/[0.08] bg-discord-card/70 p-3">
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-[10px] uppercase tracking-wider text-gray-300 font-mono">Seeds</p>
          {totalSeeds > 0 && (
            <span className="text-[10px] text-gray-400 font-mono">{totalSeeds} total</span>
          )}
        </div>

        {totalSeeds === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6">
            <span className="text-3xl">🌰</span>
            <p className="text-xs text-gray-400 text-center">Open Seed Zips to get seeds</p>
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
                  <span className="text-lg shrink-0">{seed.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-white truncate">{seed.name}</p>
                    <p className="text-[8px] font-mono uppercase mt-0.5" style={{ color: t.color }}>
                      {seed.rarity} · {formatGrowTime(seed.growTimeSeconds)}
                    </p>
                  </div>
                  <span className="text-sm font-mono font-bold shrink-0" style={{ color: t.color }}>
                    ×{seeds[seed.id]}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

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
    </motion.div>
  )
}
