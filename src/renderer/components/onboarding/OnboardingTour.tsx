import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MOTION } from '../../lib/motion'
import type { TabId } from '../../App'
import { useSessionStore } from '../../stores/sessionStore'
import { useInventoryStore } from '../../stores/inventoryStore'

// ── Phase order ──────────────────────────────────────────────────────────────

type TourPhase =
  | 'press_grind'    // waiting for user to press GRIND
  | 'grind_running'  // session live, counting down to chest drop
  | 'open_chest'     // chest granted, user opens notification bell
  | 'show_inventory' // navigate to inventory, explain equip
  | 'show_arena'     // navigate to arena, explain zones
  | 'stop_session'   // waiting for user to press GRIND to stop
  | 'celebrate'      // all done

const PHASES: TourPhase[] = [
  'press_grind',
  'grind_running',
  'open_chest',
  'show_inventory',
  'show_arena',
  'stop_session',
  'celebrate',
]

// ── Card content ─────────────────────────────────────────────────────────────

interface CardContent {
  title: string
  desc: string
  action?: string       // button label; undefined = no button
  nextPhase?: TourPhase // where action leads
  showSkip?: boolean
  atTop?: boolean       // position card near top (for bell highlight)
}

const CONTENT: Record<TourPhase, CardContent> = {
  press_grind: {
    title: 'Start your first session',
    desc: 'Press the big GRIND button — it starts tracking your focus time and XP automatically.',
    showSkip: true,
  },
  grind_running: {
    title: 'Session live!',
    desc: 'XP drops every 30 seconds based on what app you have open. Your first loot is dropping in…',
    showSkip: true,
  },
  open_chest: {
    title: '🎁 Chest dropped!',
    desc: 'Tap the 🔔 bell in the top right corner — your chest is waiting there.',
    action: 'I opened it →',
    nextPhase: 'show_inventory',
    showSkip: true,
    atTop: true,
  },
  show_inventory: {
    title: 'Your loot is in the bag',
    desc: 'Tap any item to inspect it. Press Equip to put it on — gear adds ATK, HP and DEF for the Arena.',
    action: 'Got it →',
    nextPhase: 'show_arena',
  },
  show_arena: {
    title: 'The Arena',
    desc: 'Pick a zone, fight 3 mobs, then the boss. Bosses drop rare materials and legendary chests. Harder zones need better gear.',
    action: 'Got it →',
    nextPhase: 'stop_session',
  },
  stop_session: {
    title: 'Stop your session',
    desc: 'Press GRIND again to end the session. All your XP, skill progress and loot will be saved.',
  },
  celebrate: {
    title: '⚔ You\'re all set!',
    desc: 'Grind daily to level your skills. Open chests, gear up, and fight harder bosses for better loot.',
    action: 'Start grinding!',
  },
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  onNavigate: (tab: TabId) => void
  onDone: () => void
  onStepChange?: (step: number) => void
}

const CHEST_DELAY_SECS = 8

export function OnboardingTour({ onNavigate, onDone, onStepChange }: Props) {
  const [phase, setPhase] = useState<TourPhase>('press_grind')
  const [countdown, setCountdown] = useState(CHEST_DELAY_SECS)
  const sessionStatus = useSessionStore(s => s.status)
  const chestGranted = useRef(false)

  function goTo(p: TourPhase) {
    setPhase(p)
    onStepChange?.(PHASES.indexOf(p))
  }

  // ── Auto-advance: press_grind → grind_running ─────────────────────────────
  useEffect(() => {
    if (phase === 'press_grind' && sessionStatus === 'running') {
      goTo('grind_running')
      setCountdown(CHEST_DELAY_SECS)
      chestGranted.current = false
    }
  }, [phase, sessionStatus])

  // ── Countdown tick (grind_running) ────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'grind_running') return
    const id = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000)
    return () => clearInterval(id)
  }, [phase])

  // ── Countdown hit 0 → grant chest ────────────────────────────────────────
  useEffect(() => {
    if (phase === 'grind_running' && countdown === 0 && !chestGranted.current) {
      chestGranted.current = true
      // Clear first_chest_pending so sessionStore doesn't grant a second chest simultaneously
      localStorage.removeItem('grindly_first_chest_pending')
      useInventoryStore.getState().addChest('common_chest', 'session_complete')
      onNavigate('home')
      goTo('open_chest')
    }
  }, [phase, countdown])

  // ── Auto-advance: stop_session → celebrate ────────────────────────────────
  useEffect(() => {
    if (phase === 'stop_session' && sessionStatus === 'idle') {
      goTo('celebrate')
    }
  }, [phase, sessionStatus])

  function handleAction(nextPhase?: TourPhase) {
    if (phase === 'celebrate') { onDone(); return }
    if (!nextPhase) return
    // Navigate when needed
    if (nextPhase === 'show_inventory') onNavigate('inventory')
    if (nextPhase === 'show_arena')     onNavigate('arena')
    if (nextPhase === 'stop_session')   onNavigate('home')
    goTo(nextPhase)
  }

  function skip() {
    localStorage.setItem('grindly_tour_done', '1')
    onDone()
  }

  const content   = CONTENT[phase]
  const phaseIdx  = PHASES.indexOf(phase)
  const atTop     = Boolean(content.atTop)
  // GRIND button is at screen center — card is at bottom → arrow should point UP
  const arrowUp   = phase === 'press_grind' || phase === 'stop_session'

  return (
    <motion.div
      className="fixed inset-0 z-[300] pointer-events-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Dim */}
      <div className="absolute inset-0 bg-black/35" />

      {/* ── Spotlight: GRIND button ── */}
      {(phase === 'press_grind' || phase === 'stop_session') && (
        <motion.div
          className="absolute left-1/2 -translate-x-1/2 pointer-events-none"
          style={{ top: 'calc(50% - 26px)' }}
          animate={{ scale: [1, 1.12, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div
            className="w-52 h-14 rounded-full border-2"
            style={{
              borderColor: phase === 'stop_session'
                ? 'rgba(248,113,113,0.7)'
                : 'rgba(74,222,128,0.7)',
              boxShadow: phase === 'stop_session'
                ? '0 0 28px rgba(248,113,113,0.35)'
                : '0 0 28px rgba(74,222,128,0.35)',
            }}
          />
        </motion.div>
      )}

      {/* ── Spotlight: notification bell ── */}
      {phase === 'open_chest' && (
        <motion.div
          className="absolute pointer-events-none"
          style={{ top: 6, right: 52 }}
          animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div className="w-9 h-9 rounded-full border-2 border-accent shadow-[0_0_16px_rgba(88,101,242,0.7)]" />
        </motion.div>
      )}

      {/* ── Tour card ── */}
      <div
        className={`absolute ${atTop ? 'top-[68px]' : 'bottom-[68px]'} left-0 right-0 flex justify-center px-3 pointer-events-auto`}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={phase}
            initial={{ opacity: 0, y: atTop ? -8 : 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: MOTION.duration.base, ease: MOTION.easingSoft }}
            className="w-full max-w-xs rounded-card border border-accent/25 bg-surface-2 shadow-modal overflow-hidden"
          >
            {/* Progress bar */}
            <div className="h-[2px] bg-white/[0.05]">
              <motion.div
                className="h-full bg-accent"
                animate={{ width: `${((phaseIdx + 1) / PHASES.length) * 100}%` }}
                transition={{ duration: 0.4 }}
              />
            </div>

            <div className="px-4 py-3.5 space-y-2.5">
              {/* Header row */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white leading-snug">{content.title}</p>
                  <p className="text-xs text-gray-400 leading-relaxed mt-0.5">{content.desc}</p>
                </div>
                <span className="text-micro font-mono text-gray-600 shrink-0 pt-0.5">
                  {phaseIdx + 1}/{PHASES.length}
                </span>
              </div>

              {/* Countdown bar */}
              {phase === 'grind_running' && (
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-micro text-gray-500">Loot incoming</span>
                    <span className="text-micro text-gray-500 tabular-nums">{countdown}s</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-white/8 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-green-400"
                      animate={{ width: `${(countdown / CHEST_DELAY_SECS) * 100}%` }}
                      transition={{ duration: 0.9, ease: 'linear' }}
                    />
                  </div>
                </div>
              )}

              {/* Actions row */}
              <div className="flex items-center justify-between">
                {content.showSkip ? (
                  <button
                    type="button"
                    onClick={skip}
                    className="text-micro text-gray-600 hover:text-gray-400 transition-colors"
                  >
                    Skip tour
                  </button>
                ) : <span />}

                {content.action && (
                  <motion.button
                    type="button"
                    onClick={() => handleAction(content.nextPhase)}
                    whileTap={{ scale: 0.96 }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-accent text-white text-xs font-bold"
                  >
                    {content.action}
                  </motion.button>
                )}
              </div>
            </div>

            {/* Up arrow pointing at GRIND button above */}
            {arrowUp && (
              <div className="absolute -top-[5px] left-1/2 -translate-x-1/2">
                <div className="w-2 h-2 border-l border-t border-accent/40 rotate-45 bg-surface-2" />
              </div>
            )}
            {/* Up arrow pointing at bell (top-right) */}
            {atTop && (
              <div className="absolute -top-[5px] right-16">
                <div className="w-2 h-2 border-l border-t border-accent/40 rotate-45 bg-surface-2" />
              </div>
            )}
            {/* Down arrow — other phases where target is below card */}
            {!atTop && !arrowUp && (
              <div className="flex justify-center pb-2">
                <div className="w-2 h-2 border-r border-b border-accent/40 rotate-45 translate-y-0.5" />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

// ── Legacy exports for App.tsx compatibility ──────────────────────────────────

/** Returns null — interactive tour manages its own highlighting */
export function getTourHighlightTab(_active: boolean, _step: number): TabId | null {
  return null
}

export { PHASES as TOUR_STEPS }
