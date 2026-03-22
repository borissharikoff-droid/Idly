import { AnimatePresence, motion } from 'framer-motion'
import React, { useEffect, useState } from 'react'

function LoadingDots({ color }: { color: string }) {
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
import { createPortal } from 'react-dom'
import type { ChestType, LootItemDef } from '../../lib/loot'
import { CHEST_DEFS, getRarityTheme } from '../../lib/loot'
import { getSeedZipDisplay, type SeedZipTier } from '../../lib/farming'
import { PixelConfetti } from '../home/PixelConfetti'
import { playClickSound, playChestOpeningSound, playLootRaritySound } from '../../lib/sounds'
import { track } from '../../lib/analytics'

export interface BulkOpenResult {
  items: { def: LootItemDef; qty: number }[]
  totalGold: number
  materials: { def: LootItemDef; qty: number }[]
  seedZips: { tier: SeedZipTier; qty: number }[]
  totalOpened: number
}

interface BulkChestOpenModalProps {
  open: boolean
  chestType: ChestType | null
  result: BulkOpenResult | null
  onClose: () => void
}

const RARITY_ORDER = ['mythic', 'legendary', 'epic', 'rare', 'common'] as const

export function BulkChestOpenModal({ open, chestType, result, onClose }: BulkChestOpenModalProps) {
  const chest = chestType ? CHEST_DEFS[chestType] : null
  const chestTheme = chest ? getRarityTheme(chest.rarity) : getRarityTheme('common')
  const [phase, setPhase] = useState<'opening' | 'revealed'>('opening')

  // Opening duration scales with count but caps at 2.5s
  const openMs = result ? Math.min(600 + result.totalOpened * 40, 2500) : 800

  useEffect(() => {
    if (!open) { setPhase('opening'); return }
    setPhase('opening')
    if (chest) playChestOpeningSound(chest.rarity)
    const t = setTimeout(() => {
      setPhase('revealed')
      // Play rarity sound for best item
      if (result?.items.length) {
        const best = result.items[0] // already sorted by rarity
        playLootRaritySound(best.def.rarity)
      }
      if (chestType && result) {
        track('bulk_chest_open', { chest_type: chestType, count: result.totalOpened })
      }
    }, openMs)
    return () => clearTimeout(t)
  }, [open])

  const isRevealed = phase === 'revealed'

  // Sort items by rarity (best first)
  const sortedItems = result?.items.slice().sort((a, b) => {
    return RARITY_ORDER.indexOf(a.def.rarity as typeof RARITY_ORDER[number]) -
           RARITY_ORDER.indexOf(b.def.rarity as typeof RARITY_ORDER[number])
  }) ?? []

  // Sort materials by rarity
  const sortedMaterials = result?.materials.slice().sort((a, b) => {
    return RARITY_ORDER.indexOf(a.def.rarity as typeof RARITY_ORDER[number]) -
           RARITY_ORDER.indexOf(b.def.rarity as typeof RARITY_ORDER[number])
  }) ?? []

  if (typeof document === 'undefined') return null
  return createPortal(
    <AnimatePresence>
      {open && chest && result && (
        <motion.div
          key="bulk-modal"
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
              key="bulk-confetti"
              originX={0.5}
              originY={0.35}
              accentColor={chestTheme.color}
              count={Math.min(20 + result.totalOpened * 2, 60)}
              duration={1.5}
            />
          )}

          <motion.div
            key="bulk-card"
            initial={{ scale: 0.82, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.88, opacity: 0, y: 16 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28, mass: 0.9 }}
            onClick={(e) => e.stopPropagation()}
            className="w-[340px] max-h-[80vh] rounded-lg border p-5 text-center relative overflow-hidden flex flex-col"
            style={{
              borderColor: chestTheme.border,
              background: `linear-gradient(160deg, ${chestTheme.glow}1A 0%, rgba(8,8,16,0.97) 55%)`,
              boxShadow: isRevealed
                ? `0 0 32px ${chestTheme.glow}, 0 4px 32px rgba(0,0,0,0.7)`
                : `0 0 20px ${chestTheme.glow}66, 0 4px 24px rgba(0,0,0,0.6)`,
              transition: 'box-shadow 0.5s ease',
            }}
          >
            <motion.div
              aria-hidden
              className="absolute inset-0 pointer-events-none rounded-lg"
              style={{ background: `radial-gradient(circle at 50% 12%, ${chestTheme.glow} 0%, transparent 55%)` }}
              animate={{ opacity: isRevealed ? [0.45, 0.65, 0.5] : [0.25, 0.45, 0.25] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            />

            {/* Chest icon */}
            <motion.div
              className="mx-auto w-fit"
              animate={!isRevealed ? { y: [0, -6, 0], rotate: [-3, 3, -3] } : { y: 0, rotate: 0 }}
              transition={!isRevealed
                ? { duration: 0.4, repeat: Infinity, ease: 'easeInOut' }
                : { type: 'spring', stiffness: 200, damping: 18 }
              }
            >
              <div
                className="w-[80px] h-[80px] rounded-lg border flex items-center justify-center"
                style={{
                  borderColor: chestTheme.border,
                  background: `radial-gradient(circle at 50% 35%, ${chestTheme.glow}60 0%, rgba(8,8,16,0.92) 70%)`,
                  boxShadow: `0 0 22px ${chestTheme.glow}99`,
                }}
              >
                {chest.image ? (
                  <img src={chest.image} alt="" className="w-14 h-14 object-contain select-none" style={{ imageRendering: 'pixelated' }} draggable={false} />
                ) : (
                  <span className="text-4xl">{chest.icon}</span>
                )}
              </div>
            </motion.div>

            {/* Status */}
            <div className="mt-2 h-[18px] relative overflow-hidden">
              <AnimatePresence mode="wait">
                {isRevealed ? (
                  <motion.p
                    key="done"
                    className="absolute inset-0 text-caption font-mono uppercase tracking-wider text-center"
                    style={{ color: chestTheme.color }}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                  >
                    Opened {result.totalOpened} bags
                  </motion.p>
                ) : (
                  <motion.span
                    key="opening"
                    className="absolute inset-0 text-caption font-mono uppercase tracking-wider text-center flex items-center justify-center"
                    style={{ color: chestTheme.color }}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                  >
                    Opening {result.totalOpened} bags<LoadingDots color={chestTheme.color} />
                  </motion.span>
                )}
              </AnimatePresence>
            </div>

            <p className="text-sm text-white/80 font-medium mt-0.5">{chest.name}</p>

            {/* Loot summary — scrollable */}
            <motion.div
              className="mt-3 flex-1 overflow-y-auto min-h-0"
              style={{ scrollbarWidth: 'thin', scrollbarColor: `${chestTheme.color}44 transparent` } as React.CSSProperties}
              animate={{ opacity: isRevealed ? 1 : 0, y: isRevealed ? 0 : 16 }}
              transition={{ type: 'spring', stiffness: 280, damping: 24, delay: isRevealed ? 0.04 : 0 }}
            >
              {/* Equipment items */}
              {sortedItems.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-micro font-mono text-gray-500 uppercase tracking-wider text-left">Items</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {sortedItems.map((entry, i) => {
                      const theme = getRarityTheme(entry.def.rarity)
                      return (
                        <motion.div
                          key={`${entry.def.id}-${i}`}
                          initial={{ opacity: 0, scale: 0.85 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.05 + i * 0.03, type: 'spring', stiffness: 300, damping: 22 }}
                          className="rounded-lg border p-2 flex items-center gap-2 relative overflow-hidden"
                          style={{
                            borderColor: `${theme.color}35`,
                            background: `linear-gradient(135deg, ${theme.glow}15 0%, rgba(8,8,16,0.95) 60%)`,
                          }}
                        >
                          <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(circle at 30% 40%, ${theme.glow}20 0%, transparent 60%)` }} />
                          <div className="relative flex-none w-10 h-10 rounded-md flex items-center justify-center" style={{ background: `${theme.color}12`, border: `1px solid ${theme.color}20` }}>
                            {entry.def.image ? (
                              <img src={entry.def.image} alt="" className="w-8 h-8 object-contain" style={{ imageRendering: 'pixelated' }} />
                            ) : (
                              <span className="text-xl">{entry.def.icon}</span>
                            )}
                          </div>
                          <div className="relative text-left min-w-0">
                            <p className="text-caption font-medium text-white/90 truncate leading-tight">{entry.def.name}</p>
                            <p className="text-micro font-mono uppercase" style={{ color: theme.color }}>
                              {entry.def.rarity}{entry.qty > 1 ? ` ×${entry.qty}` : ''}
                            </p>
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Gold */}
              {result.totalGold > 0 && (
                <motion.div
                  className="mt-2.5 rounded-lg border border-amber-500/25 p-2.5 flex items-center gap-3"
                  style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(8,8,16,0.95) 60%)' }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.15 }}
                >
                  <span className="text-2xl">🪙</span>
                  <div className="text-left">
                    <p className="text-lg font-bold text-amber-400 tabular-nums">+{result.totalGold}</p>
                    <p className="text-micro font-mono text-amber-500/60 uppercase tracking-widest">Gold</p>
                  </div>
                </motion.div>
              )}

              {/* Materials */}
              {sortedMaterials.length > 0 && (
                <div className="mt-2.5 space-y-1.5">
                  <p className="text-micro font-mono text-gray-500 uppercase tracking-wider text-left">Materials</p>
                  <div className="grid grid-cols-2 gap-2">
                    {sortedMaterials.map((mat, i) => {
                      const theme = getRarityTheme(mat.def.rarity)
                      return (
                        <motion.div
                          key={mat.def.id}
                          initial={{ opacity: 0, scale: 0.85 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.05 + i * 0.03, type: 'spring', stiffness: 300, damping: 22 }}
                          className="rounded-lg border p-2.5 flex flex-col items-center gap-1.5 relative overflow-hidden"
                          style={{
                            borderColor: `${theme.color}35`,
                            background: `linear-gradient(160deg, ${theme.glow}15 0%, rgba(8,8,16,0.95) 65%)`,
                          }}
                        >
                          <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(circle at 50% 30%, ${theme.glow}20 0%, transparent 60%)` }} />
                          <div className="relative w-14 h-14 rounded-lg flex items-center justify-center" style={{ background: `${theme.color}12`, border: `1px solid ${theme.color}25`, boxShadow: `0 0 12px ${theme.glow}30` }}>
                            {mat.def.image ? (
                              <img src={mat.def.image} className="w-10 h-10 object-contain" style={{ imageRendering: 'pixelated' }} draggable={false} />
                            ) : (
                              <span className="text-3xl">{mat.def.icon}</span>
                            )}
                          </div>
                          <span className="relative text-sm font-bold tabular-nums" style={{ color: theme.color }}>×{mat.qty}</span>
                          <span className="relative text-micro text-center leading-tight text-gray-400 truncate w-full">{mat.def.name}</span>
                        </motion.div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Seed Zips */}
              {result.seedZips.length > 0 && (
                <div className="mt-2.5 space-y-1.5">
                  <p className="text-micro font-mono text-gray-500 uppercase tracking-wider text-left">Seed Zips</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {result.seedZips.map((sz) => {
                      const theme = getRarityTheme(sz.tier)
                      const display = getSeedZipDisplay(sz.tier)
                      return (
                        <div
                          key={sz.tier}
                          className="rounded-lg border p-1.5 flex flex-col items-center gap-1"
                          style={{ borderColor: theme.border, background: `linear-gradient(160deg, ${theme.glow}12 0%, rgba(8,8,16,0.95) 65%)` }}
                        >
                          <div className="w-9 h-9 rounded-md flex items-center justify-center" style={{ background: `${theme.color}12`, border: `1px solid ${theme.color}20` }}>
                            {display.image
                              ? <img src={display.image} className="w-7 h-7 object-contain" style={{ imageRendering: 'pixelated' }} draggable={false} />
                              : <span className="text-xl">{display.icon}</span>}
                          </div>
                          <span className="text-caption font-bold tabular-nums" style={{ color: theme.color }}>×{sz.qty}</span>
                          <span className="text-micro text-center leading-tight text-gray-400 truncate w-full">{display.name}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {sortedItems.length === 0 && result.totalGold === 0 && sortedMaterials.length === 0 && (
                <p className="text-sm text-gray-500 mt-4">No loot this time</p>
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
                className="w-full h-10 rounded-lg text-body font-semibold transition-all active:scale-[0.97]"
                style={{ color: chestTheme.color, border: `1px solid ${chestTheme.border}`, background: `${chestTheme.color}22` }}
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
