import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { MOTION } from '../../lib/motion'
import { PixelConfetti } from '../home/PixelConfetti'
import { playClickSound, playArenaVictorySound, playArenaDefeatSound } from '../../lib/sounds'
import { useGoldStore } from '../../stores/goldStore'
import { useAuthStore } from '../../stores/authStore'

function formatShort(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0'
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return Math.floor(n).toString()
}

const AUTO_CLOSE_MS = 8_000

interface VictoryResultModalProps {
  open: boolean
  victory: boolean
  gold: number
  goldAlreadyAdded?: boolean
  bossName?: string
  goldLost?: number
  chest?: { type: string; name: string; icon: string; image?: string } | null
  lostItemName?: string
  lostItemIcon?: string
  onClose: () => void
}

export function VictoryResultModal({
  open,
  victory,
  gold,
  goldAlreadyAdded = true,
  bossName,
  goldLost = 0,
  chest,
  lostItemName,
  lostItemIcon,
  onClose,
}: VictoryResultModalProps) {
  const [progress, setProgress] = useState(100)
  const claimedRef = useRef(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Reset claim guard each time the modal opens with new data
  useEffect(() => {
    if (open) {
      claimedRef.current = false
      if (victory) playArenaVictorySound()
      else playArenaDefeatSound()
    }
  }, [open])

  // Claim gold exactly once — called by both manual close and auto-close
  const claimGold = () => {
    if (claimedRef.current || goldAlreadyAdded || !victory || gold <= 0) return
    claimedRef.current = true
    useGoldStore.getState().addGold(gold)
    const user = useAuthStore.getState().user
    if (user) useGoldStore.getState().syncToSupabase(user.id)
  }
  const claimGoldRef = useRef(claimGold)
  claimGoldRef.current = claimGold

  useEffect(() => {
    if (!open) return
    setProgress(100)
    const started = Date.now()
    const timer = setInterval(() => {
      const elapsed = Date.now() - started
      const left = Math.max(0, 100 - (elapsed / AUTO_CLOSE_MS) * 100)
      setProgress(left)
      if (left <= 0) {
        clearInterval(timer)
        claimGoldRef.current()   // fix: claim gold even on auto-close
        onCloseRef.current()
      }
    }, 80)
    return () => clearInterval(timer)
  }, [open])

  const handleClose = () => {
    playClickSound()
    claimGoldRef.current()
    onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: MOTION.duration.fast }}
          className="fixed inset-0 z-[115] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={handleClose}
        >
          {victory && (
            <PixelConfetti
              key="victory-confetti"
              originX={0.5}
              originY={0.42}
              accentColor="#00ff88"
              duration={1.1}
            />
          )}
          <motion.div
            initial={{ scale: 0.86, y: 16, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.92, y: 10, opacity: 0 }}
            transition={MOTION.spring.pop}
            className={`w-[300px] rounded-2xl border overflow-hidden ${
              victory ? 'border-cyber-neon/30 bg-discord-card' : 'border-red-500/25 bg-discord-card'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Auto-close progress bar — top of card, most visible position */}
            <div className="h-1 bg-discord-darker/60">
              <div
                className={`h-full transition-[width] duration-75 ${
                  victory ? 'bg-cyber-neon/70' : 'bg-red-500/60'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="p-5 text-center">
              {/* Icon */}
              <div
                className={`w-16 h-16 mx-auto rounded-2xl border flex items-center justify-center mb-3 ${
                  victory
                    ? 'border-cyber-neon/30 bg-cyber-neon/10'
                    : 'border-red-500/30 bg-red-500/10'
                }`}
              >
                <span className="text-3xl" aria-hidden>
                  {victory ? '🏆' : '💀'}
                </span>
              </div>

              {/* Result label */}
              <p
                className={`text-[10px] font-mono uppercase tracking-widest mb-1 ${
                  victory ? 'text-cyber-neon' : 'text-red-400'
                }`}
              >
                {victory ? 'Victory' : 'Defeat'}
              </p>

              {/* Boss context */}
              {bossName && (
                <p className="text-[11px] text-gray-500 mb-2">vs {bossName}</p>
              )}

              {/* Primary result */}
              <p className="text-white font-bold text-2xl">
                {victory ? (gold > 0 ? `+${formatShort(gold)} 🪙` : 'Boss Slain!') : 'You Fell'}
              </p>

              {!victory && goldLost > 0 && (
                <p className="text-red-400 font-mono font-semibold text-sm mt-1">
                  −{formatShort(goldLost)} 🪙
                </p>
              )}

              {!victory && lostItemName && (
                <div className="mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-red-500/10 border border-red-500/25 px-3 py-1.5">
                  <span className="text-base">{lostItemIcon}</span>
                  <p className="text-[11px] text-red-300 font-semibold">{lostItemName} destroyed</p>
                </div>
              )}

              <p className="text-[11px] text-gray-500 mt-1.5">
                {victory
                  ? gold > 0
                    ? 'Gold added to your wallet.'
                    : 'The boss has been defeated.'
                  : lostItemName
                    ? 'Item lost. Craft or buy gear and try again.'
                    : goldLost > 0
                      ? 'Gold lost. Gear up and try again.'
                      : 'Gear up and try again.'}
              </p>

              {victory && chest && (() => {
                return (
                  <div className="mt-3 rounded-xl bg-purple-500/10 border border-purple-500/25 p-3">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      {chest.image
                        ? <img src={chest.image} alt={chest.name} className="w-8 h-8 object-contain" style={{ imageRendering: 'pixelated' }} />
                        : <span className="text-2xl">{chest.icon}</span>}
                      <div className="text-left">
                        <p className="text-[12px] text-purple-300 font-semibold">{chest.name} dropped!</p>
                        <p className="text-[10px] text-gray-500">Open from Inventory tab</p>
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* CTA */}
              <button
                type="button"
                onClick={handleClose}
                className={`mt-4 w-full py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
                  victory
                    ? 'border-cyber-neon/35 bg-cyber-neon/15 text-cyber-neon hover:bg-cyber-neon/25'
                    : 'border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20'
                }`}
              >
                {victory ? 'Claim' : 'OK'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
