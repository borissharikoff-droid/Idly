import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChestType, LootItemDef } from '../../lib/loot'
import { CHEST_DEFS, getRarityTheme } from '../../lib/loot'
import { SEED_ZIP_LABELS, type SeedZipTier } from '../../lib/farming'
import { MOTION } from '../../lib/motion'
import { PixelConfetti } from '../home/PixelConfetti'
import { playClickSound, playLootRaritySound } from '../../lib/sounds'
import { track } from '../../lib/analytics'

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
  const revealKey = `${chestType ?? 'none'}:${item?.id ?? 'none'}:${animationSeed ?? 0}`
  const rarityTheme = getRarityTheme(item?.rarity ?? 'common')
  const lootCardRef = useRef<HTMLDivElement>(null)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const [hovering, setHovering] = useState(false)
  const handleLootMouseMove = useCallback((e: React.MouseEvent) => {
    const el = lootCardRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    setTilt({
      x: (e.clientX - cx) / (rect.width / 2),
      y: (e.clientY - cy) / (rect.height / 2),
    })
  }, [])

  const itemX = tilt.x * 6
  const itemY = tilt.y * -4
  const glowX = 50 + tilt.x * 12
  const glowY = 40 + tilt.y * 10

  useEffect(() => {
    if (open && item && chestType) {
      playLootRaritySound(item.rarity)
      track('chest_open', { chest_type: chestType, item_rarity: item.rarity })
    }
  }, [open, item, chestType])

  return (
    <AnimatePresence>
      {open && chest && item && (
        <motion.div
          key={revealKey}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14, ease: MOTION.easing }}
          className="fixed inset-0 z-[120] flex items-center justify-center p-4"
          onClick={onClose}
        >
          {/* Solid backdrop — no transparency, content never shows through */}
          <div className="absolute inset-0 bg-discord-darker" />
          <PixelConfetti key={`confetti:${revealKey}`} originX={0.5} originY={0.42} accentColor={rarityTheme.color} duration={1.1} />
          <motion.div
            initial={{ scale: 0.85, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 12 }}
            transition={{ duration: 0.18, ease: MOTION.easing }}
            onClick={(e) => e.stopPropagation()}
            className="w-[300px] rounded-2xl border p-5 text-center space-y-3 relative overflow-hidden"
            style={{
              borderColor: rarityTheme.border,
              background: rarityTheme.panel,
              boxShadow: `0 0 28px ${rarityTheme.glow}`,
            }}
          >
            <motion.div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{
                background: `radial-gradient(circle at 50% 20%, ${rarityTheme.glow} 0%, transparent 58%)`,
              }}
              initial={{ opacity: 0.4, scale: 0.98 }}
              animate={{ opacity: [0.32, 0.55, 0.4], scale: [0.98, 1.02, 1] }}
              transition={{ duration: 2.1, repeat: Infinity, ease: MOTION.easing }}
            />
            <motion.div
              initial={{ rotate: -4, scale: 0.92 }}
              animate={{ rotate: [0, -4, 4, 0], scale: [0.92, 1.08, 1.0] }}
              transition={{ duration: 0.9, ease: MOTION.easing }}
              className="mx-auto w-20 h-20 rounded-2xl bg-discord-darker border flex items-center justify-center text-4xl"
              style={{ borderColor: rarityTheme.border }}
            >
              {chest.image ? (
                <img src={chest.image} alt="" className="w-14 h-14 object-contain" style={{ imageRendering: 'pixelated' }} draggable={false} />
              ) : chest.icon}
            </motion.div>
            <p className="text-[11px] font-mono uppercase tracking-wider" style={{ color: rarityTheme.color }}>Chest opened</p>
            <p className="text-sm text-white font-semibold">{chest.name}</p>
            <motion.div
              ref={lootCardRef}
              onMouseMove={handleLootMouseMove}
              onMouseEnter={() => setHovering(true)}
              onMouseLeave={() => { setHovering(false); setTilt({ x: 0, y: 0 }) }}
              initial={{ opacity: 0, y: 8, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: [0.92, 1.05, 1] }}
              transition={{ delay: 0.2, duration: MOTION.duration.base, ease: MOTION.easing }}
              className="rounded-xl border p-3 relative overflow-hidden cursor-default"
              style={{
                borderColor: rarityTheme.border,
                backgroundColor: `${rarityTheme.color}14`,
                transform: hovering ? `perspective(400px) rotateY(${tilt.x * 4}deg) rotateX(${tilt.y * -4}deg)` : undefined,
                transition: hovering ? 'transform 0.08s ease-out' : 'transform 0.4s ease-out',
              }}
            >
              <div
                className="absolute inset-0 pointer-events-none rounded-xl"
                style={{
                  background: `radial-gradient(circle at ${glowX}% ${glowY}%, ${rarityTheme.glow} 0%, transparent 60%)`,
                  opacity: hovering ? 0.5 : 0.35,
                  transition: hovering ? 'opacity 0.1s' : 'opacity 0.4s',
                }}
              />
              <motion.div
                className="absolute inset-0 pointer-events-none rounded-xl"
                initial={{ opacity: 0.35 }}
                animate={{ opacity: [0.3, 0.6, 0.35] }}
                transition={{ duration: 1.7, repeat: Infinity, ease: MOTION.easing }}
                style={{ boxShadow: `0 0 20px ${rarityTheme.glow}` }}
              />
              <motion.div
                className="flex justify-center"
                animate={{ x: itemX, y: itemY }}
                transition={{ type: 'spring', stiffness: 200, damping: 20 }}
              >
                {item.image ? (
                  <img src={item.image} alt="" className="w-14 h-14 object-contain" style={{ imageRendering: 'pixelated' }} draggable={false} />
                ) : (
                  <p className="text-3xl">{item.icon}</p>
                )}
              </motion.div>
              <motion.p
                className="text-sm text-white font-semibold mt-1"
                animate={{ x: tilt.x * 2, y: tilt.y * -1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 20 }}
              >
                {item.name}
              </motion.p>
              <p className="text-[10px] font-mono uppercase mt-0.5" style={{ color: rarityTheme.color }}>
                {item.rarity}
              </p>
              <p className="text-[10px] text-gray-300">{item.perkDescription}</p>
            </motion.div>
            {/* Bonus drops row */}
            <div className="flex flex-col items-center gap-1.5">
              {goldDropped > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15, duration: 0.2 }}
                  className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-amber-500/12 border border-amber-500/25"
                >
                  <span className="text-amber-400" aria-hidden>🪙</span>
                  <span className="text-sm font-bold text-amber-400 tabular-nums">+{goldDropped}</span>
                </motion.div>
              )}
              {seedZipTier && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25, duration: 0.2 }}
                  className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-green-500/12 border border-green-500/25"
                >
                  <span aria-hidden>🎒</span>
                  <span className="text-sm font-semibold text-green-300">+ {SEED_ZIP_LABELS[seedZipTier]} Seed Zip</span>
                </motion.div>
              )}
              {!goldDropped && !seedZipTier && <div className="h-9" />}
            </div>
            <button
              type="button"
              onClick={() => {
                playClickSound()
                if (nextAvailable && onOpenNext) {
                  onOpenNext()
                  return
                }
                onClose()
              }}
              className="w-full py-2 rounded-xl font-semibold transition-colors"
              style={{
                color: rarityTheme.color,
                border: `1px solid ${rarityTheme.border}`,
                backgroundColor: `${rarityTheme.color}20`,
              }}
            >
              {nextAvailable ? 'Open next' : 'Done'}
            </button>
            {/* Fixed-height message row — always reserves space so button never moves */}
            <div className="h-4 flex items-center justify-center">
              {chainMessage && (
                <p className="text-[10px] text-center text-orange-300/95 font-medium">{chainMessage}</p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
