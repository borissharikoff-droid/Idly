import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MOTION } from '../../lib/motion'
import type { TabId } from '../../App'

interface TourStep {
  tab: TabId
  emoji: string
  title: string
  desc: string
}

const TOUR_STEPS: TourStep[] = [
  {
    tab: 'home',
    emoji: '⏱',
    title: 'Home — your grind HQ',
    desc: 'Start a session and the timer tracks your focus time automatically. XP drops every 30 seconds.',
  },
  {
    tab: 'skills',
    emoji: '⚡',
    title: 'Skills level up automatically',
    desc: '8 skills grow based on what app you have open — coding, gaming, designing, and more. No manual input.',
  },
  {
    tab: 'friends',
    emoji: '👥',
    title: 'Friends & social',
    desc: 'Add friends, see what they\'re grinding on right now, and compare stats. Guilds and parties too.',
  },
  {
    tab: 'inventory',
    emoji: '🎒',
    title: 'Your inventory',
    desc: 'Loot from sessions and chests lands here. Equip gear to boost your combat stats in the Arena.',
  },
  {
    tab: 'arena',
    emoji: '⚔',
    title: 'Arena — fight for loot',
    desc: 'Clear dungeons and fight bosses to earn rare materials and legendary gear. Harder zones need better gear.',
  },
]

interface OnboardingTourProps {
  onNavigate: (tab: TabId) => void
  onDone: () => void
  onStepChange?: (step: number) => void
}

export function OnboardingTour({ onNavigate, onDone, onStepChange }: OnboardingTourProps) {
  const [step, setStep] = useState(0)

  const current = TOUR_STEPS[step]
  const isLast = step === TOUR_STEPS.length - 1

  function advance() {
    if (isLast) {
      onDone()
    } else {
      const next = step + 1
      setStep(next)
      onStepChange?.(next)
      onNavigate(TOUR_STEPS[next].tab)
    }
  }

  function skip() {
    onDone()
  }

  return (
    <motion.div
      className="fixed inset-0 z-[300] pointer-events-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Dim overlay — doesn't block clicks */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Tour card — above nav bar (nav is ~58px tall) */}
      <div className="absolute bottom-[68px] left-0 right-0 flex justify-center px-3 pointer-events-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: MOTION.duration.base, ease: MOTION.easingSoft }}
            className="w-full max-w-xs rounded-card border border-accent/25 bg-surface-2 shadow-modal overflow-hidden"
          >
            {/* Progress bar */}
            <div className="h-[2px] bg-white/[0.05]">
              <motion.div
                className="h-full bg-accent"
                initial={{ width: `${(step / TOUR_STEPS.length) * 100}%` }}
                animate={{ width: `${((step + 1) / TOUR_STEPS.length) * 100}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
            </div>

            <div className="px-4 py-3.5">
              {/* Step header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-base leading-none">{current.emoji}</span>
                  <p className="text-sm font-semibold text-white">{current.title}</p>
                </div>
                <span className="text-micro font-mono text-gray-600">{step + 1}/{TOUR_STEPS.length}</span>
              </div>

              <p className="text-xs text-gray-400 leading-relaxed mb-3">{current.desc}</p>

              {/* Arrow pointing down to nav */}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={skip}
                  className="text-micro text-gray-600 hover:text-gray-400 transition-colors"
                >
                  Skip tour
                </button>

                <motion.button
                  type="button"
                  onClick={advance}
                  whileTap={{ scale: 0.96 }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-accent text-white text-xs font-bold"
                >
                  {isLast ? 'Start grinding ⚔' : 'Next →'}
                </motion.button>
              </div>
            </div>

            {/* Downward arrow indicator */}
            <div className="flex justify-center pb-1">
              <div className="w-2 h-2 border-r border-b border-accent/40 rotate-45 translate-y-1" />
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

/** Tab ID of the currently highlighted tour step */
export function getTourHighlightTab(tourActive: boolean, tourStep: number): TabId | null {
  if (!tourActive) return null
  return TOUR_STEPS[tourStep]?.tab ?? null
}

export { TOUR_STEPS }
